"""
Serviços de Produtos / Estoque (requisito 2.1 e apoio à regra 3.1).
"""

from __future__ import annotations

import sqlite3

from mega_outlet.constants import CATEGORIAS_PRODUTO, STATUS_GARANTIA
from mega_outlet.erros import DadosInvalidos, ProdutoNaoEncontrado


def cadastrar_produto(
    conn: sqlite3.Connection,
    *,
    sku: str,
    descricao: str,
    categoria: str,
    quantidade_atual: int = 0,
    quantidade_minima: int = 0,
    preco_custo: float = 0.0,
    preco_venda: float = 0.0,
    status_garantia: str = "90 dias",
) -> int:
    """Insere um produto no cadastro e devolve o `id_produto` gerado."""
    sku = (sku or "").strip()
    descricao = (descricao or "").strip()
    if not sku or not descricao:
        raise DadosInvalidos("SKU e descrição são obrigatórios.")
    if categoria not in CATEGORIAS_PRODUTO:
        raise DadosInvalidos(f"Categoria inválida: {categoria!r}.")
    if status_garantia not in STATUS_GARANTIA:
        raise DadosInvalidos(f"Status de garantia inválido: {status_garantia!r}.")
    if quantidade_atual < 0 or quantidade_minima < 0:
        raise DadosInvalidos("Quantidades não podem ser negativas no cadastro.")
    if preco_custo < 0 or preco_venda < 0:
        raise DadosInvalidos("Preços não podem ser negativos.")

    try:
        with conn:  # transação: commit no sucesso, rollback em erro
            cur = conn.execute(
                """
                INSERT INTO produtos (sku, descricao, categoria, quantidade_atual,
                                      quantidade_minima, preco_custo, preco_venda,
                                      status_garantia)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sku,
                    descricao,
                    categoria,
                    int(quantidade_atual),
                    int(quantidade_minima),
                    round(float(preco_custo), 2),
                    round(float(preco_venda), 2),
                    status_garantia,
                ),
            )
    except sqlite3.IntegrityError as exc:
        # UNIQUE(sku) violado -> mensagem amigável para o operador
        raise DadosInvalidos(f"Já existe um produto com o SKU '{sku}'.") from exc
    return cur.lastrowid


def obter_produto(conn: sqlite3.Connection, id_produto: int) -> sqlite3.Row:
    """Devolve o produto pelo ID ou lança `ProdutoNaoEncontrado`."""
    row = conn.execute(
        "SELECT * FROM produtos WHERE id_produto = ?", (id_produto,)
    ).fetchone()
    if row is None:
        raise ProdutoNaoEncontrado(id_produto)
    return row


def listar_produtos(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Lista todo o cadastro, ordenado pela descrição."""
    return conn.execute("SELECT * FROM produtos ORDER BY descricao").fetchall()


def buscar_produtos(conn: sqlite3.Connection, termo: str) -> list[sqlite3.Row]:
    """
    Busca do PDV (requisito 4): localiza produto por código (SKU) ou por
    parte da descrição, sem diferenciar maiúsculas/minúsculas.
    """
    termo = (termo or "").strip()
    if not termo:
        return []
    padrao = f"%{termo}%"
    return conn.execute(
        """
        SELECT * FROM produtos
        WHERE sku LIKE ? OR descricao LIKE ?
        ORDER BY descricao
        LIMIT 30
        """,
        (padrao, padrao),
    ).fetchall()


def produtos_abaixo_do_minimo(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Produtos que dispararam o alerta de reposição (dashboard, requisito 4)."""
    return conn.execute(
        """
        SELECT * FROM produtos
        WHERE quantidade_atual <= quantidade_minima
        ORDER BY (quantidade_atual - quantidade_minima)
        """
    ).fetchall()


def repor_estoque(conn: sqlite3.Connection, id_produto: int, quantidade: int) -> int:
    """
    Entrada de mercadoria: soma `quantidade` ao saldo do produto.
    Devolve o novo saldo. (A saída por venda é feita em `vendas.registrar_venda`.)
    """
    if quantidade <= 0:
        raise DadosInvalidos("A quantidade de reposição deve ser maior que zero.")
    obter_produto(conn, id_produto)  # valida existência
    with conn:
        conn.execute(
            "UPDATE produtos SET quantidade_atual = quantidade_atual + ? "
            "WHERE id_produto = ?",
            (int(quantidade), id_produto),
        )
    return obter_produto(conn, id_produto)["quantidade_atual"]
