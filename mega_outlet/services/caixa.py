"""
Serviços do Fluxo de Caixa (requisitos 2.2 e 3.2).

Dois pontos de entrada:
  * `inserir_lancamento` — NÃO faz commit; usado por `vendas.registrar_venda`
    para que a Entrada da venda participe da MESMA transação da baixa de
    estoque (regra 3.2 — "Vínculo com Caixa").
  * `registrar_lancamento` — transacional; usado pela interface para os
    lançamentos manuais de despesas (regra 3.2 — "Conciliação").
"""

from __future__ import annotations

import sqlite3
from datetime import datetime

from mega_outlet.constants import FORMAS_PAGAMENTO, TIPOS_LANCAMENTO
from mega_outlet.erros import DadosInvalidos


def inserir_lancamento(
    conn: sqlite3.Connection,
    *,
    tipo: str,
    categoria: str,
    valor: float,
    forma_pagamento: str,
    id_venda: int | None = None,
    id_usuario: int | None = None,
    data_hora: str | None = None,
) -> int:
    """
    Insere um lançamento SEM commit (o chamador controla a transação).
    Devolve o `id_lancamento` gerado.
    """
    if tipo not in TIPOS_LANCAMENTO:
        raise DadosInvalidos(f"Tipo de lançamento inválido: {tipo!r}.")
    if forma_pagamento not in FORMAS_PAGAMENTO:
        raise DadosInvalidos(f"Forma de pagamento inválida: {forma_pagamento!r}.")
    categoria = (categoria or "").strip()
    if not categoria:
        raise DadosInvalidos("A categoria do lançamento é obrigatória.")
    valor = round(float(valor), 2)
    if valor <= 0:
        raise DadosInvalidos("O valor do lançamento deve ser maior que zero.")

    if data_hora is None:
        data_hora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cur = conn.execute(
        """
        INSERT INTO fluxo_caixa (data_hora, tipo, categoria, valor,
                                 forma_pagamento, id_venda, id_usuario)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (data_hora, tipo, categoria, valor, forma_pagamento, id_venda,
         id_usuario),
    )
    return cur.lastrowid


def registrar_lancamento(conn: sqlite3.Connection, **kwargs) -> int:
    """Versão transacional de `inserir_lancamento` (lançamentos manuais da UI)."""
    with conn:
        return inserir_lancamento(conn, **kwargs)


def saldo_atual(conn: sqlite3.Connection) -> float:
    """Saldo do caixa: soma das Entradas menos a soma das Saídas."""
    row = conn.execute(
        """
        SELECT COALESCE(SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE -valor END), 0)
               AS saldo
        FROM fluxo_caixa
        """
    ).fetchone()
    return round(row["saldo"], 2)


def faturamento_do_dia(conn: sqlite3.Connection, dia: str | None = None) -> float:
    """Faturamento (soma do valor_total das vendas) de um dia (padrão: hoje)."""
    if dia is None:
        dia = datetime.now().strftime("%Y-%m-%d")
    row = conn.execute(
        "SELECT COALESCE(SUM(valor_total), 0) AS total FROM vendas WHERE data_venda = ?",
        (dia,),
    ).fetchone()
    return round(row["total"], 2)


def faturamento_do_mes(conn: sqlite3.Connection, ano_mes: str | None = None) -> float:
    """Faturamento de um mês no formato 'YYYY-MM' (padrão: mês corrente)."""
    if ano_mes is None:
        ano_mes = datetime.now().strftime("%Y-%m")
    row = conn.execute(
        """
        SELECT COALESCE(SUM(valor_total), 0) AS total
        FROM vendas
        WHERE strftime('%Y-%m', data_venda) = ?
        """,
        (ano_mes,),
    ).fetchone()
    return round(row["total"], 2)


def extrato(
    conn: sqlite3.Connection,
    *,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    limite: int = 500,
) -> list[sqlite3.Row]:
    """
    Extrato do caixa, do lançamento mais recente para o mais antigo,
    com filtro opcional por período (datas no formato 'YYYY-MM-DD').
    """
    filtros, params = [], []
    if data_inicio:
        filtros.append("date(data_hora) >= ?")
        params.append(data_inicio)
    if data_fim:
        filtros.append("date(data_hora) <= ?")
        params.append(data_fim)
    where = f"WHERE {' AND '.join(filtros)}" if filtros else ""
    params.append(limite)

    return conn.execute(
        f"""
        SELECT id_lancamento, data_hora, tipo, categoria, valor,
               forma_pagamento, id_venda
        FROM fluxo_caixa
        {where}
        ORDER BY data_hora DESC, id_lancamento DESC
        LIMIT ?
        """,
        params,
    ).fetchall()
