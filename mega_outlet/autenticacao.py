"""
Autenticação e controle de acesso da interface Streamlit.

Uso — primeira linha de TODA página, logo após `bootstrap()`:

    usuario = exigir_login(conn)                          # qualquer perfil
    usuario = exigir_login(conn, perfis=("Administrador",))  # só admin

Comportamento:
  * Sem nenhum usuário cadastrado -> tela de PRIMEIRO ACESSO (cria o
    administrador inicial pelo próprio sistema);
  * Sem sessão ativa -> tela de LOGIN (e a página para em `st.stop()`);
  * Logado sem o perfil exigido -> mensagem de acesso restrito + `st.stop()`;
  * Logado com permissão -> devolve o dicionário do usuário e exibe na
    barra lateral o nome, o perfil e o botão "Sair".

Este é o ÚNICO módulo do pacote que importa Streamlit — a lógica de
autenticação em si vive em `services/usuarios.py` e é testável isolada.
"""

from __future__ import annotations

import sqlite3

import streamlit as st

from mega_outlet.constants import PERFIS_USUARIO
from mega_outlet.erros import ErroDeNegocio
from mega_outlet.services import usuarios as srv_usuarios


def exigir_login(
    conn: sqlite3.Connection, perfis: tuple[str, ...] | None = None
) -> dict:
    """Garante usuário autenticado (e com o perfil exigido) na página atual."""
    # 1) Sistema recém-instalado: criar o administrador inicial
    if not srv_usuarios.ha_usuarios(conn):
        _tela_primeiro_acesso(conn)
        st.stop()

    # 2) Sem sessão: tela de login
    usuario = st.session_state.get("usuario")
    if not usuario:
        _tela_login(conn)
        st.stop()

    # 3) Barra lateral com o usuário logado e o botão Sair
    with st.sidebar:
        st.markdown(f"👤 **{usuario['nome']}**")
        st.caption(f"Perfil: {usuario['perfil']}")
        if st.button("🚪 Sair", width="stretch"):
            del st.session_state["usuario"]
            st.rerun()

    # 4) Controle por perfil
    if perfis and usuario["perfil"] not in perfis:
        st.error(
            f"🔒 Acesso restrito ao(s) perfil(is): {', '.join(perfis)}. "
            f"Seu perfil é **{usuario['perfil']}**."
        )
        st.stop()

    return usuario


def _tela_login(conn: sqlite3.Connection) -> None:
    """Formulário de login (login + senha)."""
    st.title("🔐 MEGA OUTLET — Login")
    with st.form("form_login"):
        login = st.text_input("Login")
        senha = st.text_input("Senha", type="password")
        if st.form_submit_button("Entrar", type="primary", width="stretch"):
            try:
                st.session_state["usuario"] = srv_usuarios.autenticar(
                    conn, login, senha
                )
                st.rerun()
            except ErroDeNegocio as erro:
                st.error(str(erro))


def _tela_primeiro_acesso(conn: sqlite3.Connection) -> None:
    """
    Primeiro acesso ao sistema: cria a conta do Administrador inicial.
    Depois disso, todo cadastro de usuário é feito na tela 👤 Usuários.
    """
    st.title("🏬 MEGA OUTLET — Primeiro acesso")
    st.info(
        "Nenhum usuário cadastrado ainda. Crie a conta do **Administrador** "
        "para começar a usar o sistema."
    )
    with st.form("form_primeiro_acesso"):
        nome = st.text_input("Nome completo")
        login = st.text_input("Login (ex.: admin)")
        senha = st.text_input("Senha (mínimo 6 caracteres)", type="password")
        confirmacao = st.text_input("Confirmar senha", type="password")
        if st.form_submit_button(
            "Criar administrador", type="primary", width="stretch"
        ):
            if senha != confirmacao:
                st.error("As senhas não conferem.")
            else:
                try:
                    srv_usuarios.criar_usuario(
                        conn, login=login, nome=nome, senha=senha,
                        perfil="Administrador",
                    )
                    # Login automático após a criação
                    st.session_state["usuario"] = srv_usuarios.autenticar(
                        conn, login, senha
                    )
                    st.rerun()
                except ErroDeNegocio as erro:
                    st.error(str(erro))


def eh_administrador(usuario: dict) -> bool:
    """Atalho de leitura para condicionar trechos de tela ao perfil."""
    return usuario["perfil"] == "Administrador"


# Garantia de consistência: os perfis usados aqui existem nas constantes
assert "Administrador" in PERFIS_USUARIO and "Vendedor" in PERFIS_USUARIO
