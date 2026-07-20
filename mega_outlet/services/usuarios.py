"""
Serviço de Usuários — cadastro, autenticação e perfis de acesso.

Senhas NUNCA são armazenadas em texto puro: usa-se PBKDF2-HMAC-SHA256
(240 mil iterações, salt aleatório por usuário), no formato
``pbkdf2_sha256$<iterações>$<salt_hex>$<hash_hex>``.

Perfis (ver `constants.PERFIS_USUARIO`):
  * Administrador — acesso total, inclusive gestão de usuários e caixa;
  * Vendedor      — PDV, recibos e consulta de estoque.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime

from mega_outlet.constants import PERFIS_USUARIO
from mega_outlet.erros import CredenciaisInvalidas, DadosInvalidos

ITERACOES_PBKDF2 = 240_000
TAMANHO_MINIMO_SENHA = 6


# ---------------------------------------------------------------------------
# Hash de senha
# ---------------------------------------------------------------------------
def _gerar_hash(senha: str) -> str:
    """Gera o hash PBKDF2 da senha com salt aleatório."""
    salt = secrets.token_hex(16)
    derivado = hashlib.pbkdf2_hmac(
        "sha256", senha.encode("utf-8"), bytes.fromhex(salt), ITERACOES_PBKDF2
    )
    return f"pbkdf2_sha256${ITERACOES_PBKDF2}${salt}${derivado.hex()}"


def _verificar_senha(senha: str, hash_armazenado: str) -> bool:
    """Confere a senha contra o hash armazenado (comparação em tempo constante)."""
    try:
        _algoritmo, iteracoes, salt, esperado = hash_armazenado.split("$")
        derivado = hashlib.pbkdf2_hmac(
            "sha256", senha.encode("utf-8"), bytes.fromhex(salt), int(iteracoes)
        )
        return hmac.compare_digest(derivado.hex(), esperado)
    except (ValueError, AttributeError):
        return False  # hash corrompido/formato inesperado


# ---------------------------------------------------------------------------
# Operações
# ---------------------------------------------------------------------------
def ha_usuarios(conn: sqlite3.Connection) -> bool:
    """True se já existe algum usuário (controla a tela de primeiro acesso)."""
    return conn.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone() is not None


def criar_usuario(
    conn: sqlite3.Connection, *, login: str, nome: str, senha: str, perfil: str
) -> int:
    """Cadastra um usuário e devolve o `id_usuario` gerado."""
    login = (login or "").strip().lower()
    nome = (nome or "").strip()
    if not login or not nome:
        raise DadosInvalidos("Login e nome são obrigatórios.")
    if len(senha or "") < TAMANHO_MINIMO_SENHA:
        raise DadosInvalidos(
            f"A senha deve ter pelo menos {TAMANHO_MINIMO_SENHA} caracteres."
        )
    if perfil not in PERFIS_USUARIO:
        raise DadosInvalidos(f"Perfil inválido: {perfil!r}.")

    try:
        with conn:
            cur = conn.execute(
                """
                INSERT INTO usuarios (login, nome, senha_hash, perfil, ativo,
                                      criado_em)
                VALUES (?, ?, ?, ?, 1, ?)
                """,
                (login, nome, _gerar_hash(senha), perfil,
                 datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
            )
    except sqlite3.IntegrityError as exc:
        raise DadosInvalidos(f"Já existe um usuário com o login '{login}'.") from exc
    return cur.lastrowid


def autenticar(conn: sqlite3.Connection, login: str, senha: str) -> dict:
    """
    Valida login/senha e devolve os dados públicos do usuário
    (sem o hash). Lança `CredenciaisInvalidas` em qualquer falha —
    mesma mensagem para login inexistente e senha errada, de propósito.
    """
    login = (login or "").strip().lower()
    row = conn.execute(
        "SELECT * FROM usuarios WHERE login = ?", (login,)
    ).fetchone()
    if row is None or not row["ativo"] or not _verificar_senha(
        senha or "", row["senha_hash"]
    ):
        raise CredenciaisInvalidas()
    return {
        "id_usuario": row["id_usuario"],
        "login": row["login"],
        "nome": row["nome"],
        "perfil": row["perfil"],
    }


def listar_usuarios(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Lista os usuários (sem os hashes de senha)."""
    return conn.execute(
        """
        SELECT id_usuario, login, nome, perfil, ativo, criado_em
        FROM usuarios
        ORDER BY nome
        """
    ).fetchall()


def alterar_senha(conn: sqlite3.Connection, id_usuario: int, nova_senha: str) -> None:
    """Redefine a senha de um usuário (usada pelo Administrador)."""
    if len(nova_senha or "") < TAMANHO_MINIMO_SENHA:
        raise DadosInvalidos(
            f"A senha deve ter pelo menos {TAMANHO_MINIMO_SENHA} caracteres."
        )
    with conn:
        cur = conn.execute(
            "UPDATE usuarios SET senha_hash = ? WHERE id_usuario = ?",
            (_gerar_hash(nova_senha), id_usuario),
        )
    if cur.rowcount == 0:
        raise DadosInvalidos(f"Usuário {id_usuario} não encontrado.")


def definir_ativo(conn: sqlite3.Connection, id_usuario: int, ativo: bool) -> None:
    """
    Ativa/desativa um usuário. Impede desativar o ÚLTIMO administrador
    ativo — sem ele ninguém mais conseguiria administrar o sistema.
    """
    if not ativo:
        alvo = conn.execute(
            "SELECT perfil FROM usuarios WHERE id_usuario = ?", (id_usuario,)
        ).fetchone()
        if alvo and alvo["perfil"] == "Administrador":
            outros_admins = conn.execute(
                """
                SELECT COUNT(*) AS n FROM usuarios
                WHERE perfil = 'Administrador' AND ativo = 1 AND id_usuario != ?
                """,
                (id_usuario,),
            ).fetchone()["n"]
            if outros_admins == 0:
                raise DadosInvalidos(
                    "Não é possível desativar o único administrador ativo."
                )
    with conn:
        cur = conn.execute(
            "UPDATE usuarios SET ativo = ? WHERE id_usuario = ?",
            (1 if ativo else 0, id_usuario),
        )
    if cur.rowcount == 0:
        raise DadosInvalidos(f"Usuário {id_usuario} não encontrado.")
