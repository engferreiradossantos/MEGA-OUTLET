"""
Serviço de Vendas — função principal do sistema (requisitos 2.3, 2.4, 3.1 e 3.2).

`registrar_venda` executa, em UMA ÚNICA transação SQLite:

    1. Validação de saldo de estoque de cada item (regra 3.1 — "Validação de
       Saldo"), com a opção "Sob Encomenda" para permitir venda além do saldo;
    2. Gravação da venda (tabela `vendas`) e de seus itens (`itens_venda`);
    3. Baixa automática e imediata no estoque (regra 3.1 — "Baixa Automática");
    4. Lançamento de Entrada no fluxo de caixa herdando o valor total e a
       forma de pagamento (regra 3.2 — "Vínculo com Caixa").

Se QUALQUER passo falhar, nada é gravado — o `with conn:` garante rollback
automático, mantendo estoque, vendas e caixa sempre consistentes entre si.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date, datetime

from mega_outlet.constants import (
    AVISO_LEGAL_OUTLET,
    CATEGORIA_CAIXA_VENDA,
    FORMAS_ENTREGA,
    FORMAS_PAGAMENTO,
)
from mega_outlet.erros import (
    DadosInvalidos,
    EstoqueInsuficiente,
    ProdutoNaoEncontrado,
)
from mega_outlet.services import caixa


@dataclass(frozen=True)
class ItemCarrinho:
    """
    Um item selecionado no PDV.

    `preco_unitario` permite aplicar desconto/negociação; quando `None`,
    o preço de venda do cadastro do produto é utilizado.
    """

    id_produto: int
    quantidade: int
    preco_unitario: float | None = None


@dataclass(frozen=True)
class VendaConfirmada:
    """Resultado devolvido ao PDV após a confirmação da venda."""

    id_venda: int
    id_lancamento_caixa: int
    valor_total: float
    observacoes: str


def _produto_e_outlet(status_garantia: str | None) -> bool:
    """
    Identifica produto de mostruário/outlet pelo status de garantia
    (regra 3.1 — "Status Especial"). Ex.: "Sem garantia / No estado".
    """
    status = (status_garantia or "").strip().lower()
    return "no estado" in status or "sem garantia" in status


def registrar_venda(
    conn: sqlite3.Connection,
    *,
    cliente_nome: str,
    itens: list[ItemCarrinho],
    forma_pagamento: str,
    forma_entrega: str = "Retira",
    endereco_entrega: str = "",
    cliente_cpf: str = "",
    cliente_telefone: str = "",
    observacoes: str = "",
    permitir_sob_encomenda: bool = False,
    data_venda: str | None = None,
) -> VendaConfirmada:
    """
    Registra uma venda completa: valida estoque, grava venda + itens,
    dá baixa no estoque e lança a Entrada no fluxo de caixa — tudo
    atomicamente. Devolve um `VendaConfirmada` com os IDs gerados.

    Lança:
        DadosInvalidos       — campos obrigatórios ausentes/inválidos;
        ProdutoNaoEncontrado — item aponta para produto inexistente;
        EstoqueInsuficiente  — saldo menor que o solicitado e
                               `permitir_sob_encomenda=False`.
    """
    # ------------------------------------------------------------------
    # Validações de entrada (antes de abrir a transação)
    # ------------------------------------------------------------------
    cliente_nome = (cliente_nome or "").strip()
    if not cliente_nome:
        raise DadosInvalidos("O nome do cliente é obrigatório.")
    if not itens:
        raise DadosInvalidos("A venda precisa ter pelo menos um item.")
    if forma_pagamento not in FORMAS_PAGAMENTO:
        raise DadosInvalidos(f"Forma de pagamento inválida: {forma_pagamento!r}.")
    if forma_entrega not in FORMAS_ENTREGA:
        raise DadosInvalidos(f"Forma de entrega inválida: {forma_entrega!r}.")
    endereco_entrega = (endereco_entrega or "").strip()
    if forma_entrega != "Retira" and not endereco_entrega:
        raise DadosInvalidos(
            f"Endereço de entrega é obrigatório para '{forma_entrega}'."
        )
    for item in itens:
        if item.quantidade <= 0:
            raise DadosInvalidos("A quantidade de cada item deve ser maior que zero.")
        if item.preco_unitario is not None and item.preco_unitario < 0:
            raise DadosInvalidos("O preço unitário não pode ser negativo.")

    if data_venda is None:
        data_venda = date.today().isoformat()

    # ------------------------------------------------------------------
    # Transação única: venda + itens + baixa de estoque + caixa
    # ------------------------------------------------------------------
    with conn:  # commit no sucesso; rollback automático em qualquer exceção
        # 1) Carrega os produtos e valida o saldo de estoque (regra 3.1)
        produtos_por_id: dict[int, sqlite3.Row] = {}
        for item in itens:
            produto = conn.execute(
                "SELECT * FROM produtos WHERE id_produto = ?", (item.id_produto,)
            ).fetchone()
            if produto is None:
                raise ProdutoNaoEncontrado(item.id_produto)
            produtos_por_id[item.id_produto] = produto

            if (
                not permitir_sob_encomenda
                and produto["quantidade_atual"] < item.quantidade
            ):
                raise EstoqueInsuficiente(
                    produto["descricao"],
                    produto["quantidade_atual"],
                    item.quantidade,
                )

        # 2) Calcula o total no servidor (nunca confia no valor vindo da UI)
        valor_total = 0.0
        for item in itens:
            preco = (
                item.preco_unitario
                if item.preco_unitario is not None
                else produtos_por_id[item.id_produto]["preco_venda"]
            )
            valor_total += round(float(preco), 2) * item.quantidade
        valor_total = round(valor_total, 2)

        # 3) Anexa o aviso legal se houver produto de mostruário/outlet
        #    (regra 3.1 — "Status Especial")
        observacoes = (observacoes or "").strip()
        tem_item_outlet = any(
            _produto_e_outlet(p["status_garantia"]) for p in produtos_por_id.values()
        )
        if tem_item_outlet and AVISO_LEGAL_OUTLET not in observacoes:
            observacoes = (
                f"{observacoes}\n{AVISO_LEGAL_OUTLET}" if observacoes
                else AVISO_LEGAL_OUTLET
            )

        # 4) Grava o cabeçalho da venda (tabela 2.3)
        cur = conn.execute(
            """
            INSERT INTO vendas (data_venda, cliente_nome, cliente_cpf,
                                cliente_telefone, forma_entrega,
                                endereco_entrega, valor_total, observacoes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data_venda,
                cliente_nome,
                (cliente_cpf or "").strip(),
                (cliente_telefone or "").strip(),
                forma_entrega,
                endereco_entrega,
                valor_total,
                observacoes,
            ),
        )
        id_venda = cur.lastrowid

        # 5) Grava os itens (tabela 2.4) e dá a baixa no estoque (regra 3.1).
        #    O UPDATE condicionado a `quantidade_atual >= ?` protege contra
        #    corrida entre dois caixas vendendo o mesmo produto ao mesmo tempo.
        for item in itens:
            preco = (
                item.preco_unitario
                if item.preco_unitario is not None
                else produtos_por_id[item.id_produto]["preco_venda"]
            )
            conn.execute(
                """
                INSERT INTO itens_venda (id_venda, id_produto, quantidade,
                                         preco_unitario_aplicado)
                VALUES (?, ?, ?, ?)
                """,
                (id_venda, item.id_produto, item.quantidade, round(float(preco), 2)),
            )

            if permitir_sob_encomenda:
                # Sob encomenda: o saldo pode ficar negativo (itens a encomendar)
                baixa = conn.execute(
                    "UPDATE produtos SET quantidade_atual = quantidade_atual - ? "
                    "WHERE id_produto = ?",
                    (item.quantidade, item.id_produto),
                )
            else:
                baixa = conn.execute(
                    "UPDATE produtos SET quantidade_atual = quantidade_atual - ? "
                    "WHERE id_produto = ? AND quantidade_atual >= ?",
                    (item.quantidade, item.id_produto, item.quantidade),
                )
            if baixa.rowcount == 0:
                # Outro caixa consumiu o estoque entre a validação e a baixa
                produto = produtos_por_id[item.id_produto]
                raise EstoqueInsuficiente(
                    produto["descricao"], produto["quantidade_atual"], item.quantidade
                )

        # 6) Lançamento automático de Entrada no caixa (regra 3.2),
        #    herdando valor total e forma de pagamento da venda
        id_lancamento = caixa.inserir_lancamento(
            conn,
            tipo="Entrada",
            categoria=CATEGORIA_CAIXA_VENDA,
            valor=valor_total,
            forma_pagamento=forma_pagamento,
            id_venda=id_venda,
            data_hora=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )

    return VendaConfirmada(
        id_venda=id_venda,
        id_lancamento_caixa=id_lancamento,
        valor_total=valor_total,
        observacoes=observacoes,
    )


def obter_venda(conn: sqlite3.Connection, id_venda: int) -> dict:
    """
    Devolve a venda completa (cabeçalho + itens + forma de pagamento) em um
    dicionário pronto para o gerador de recibo.
    """
    venda = conn.execute(
        "SELECT * FROM vendas WHERE id_venda = ?", (id_venda,)
    ).fetchone()
    if venda is None:
        raise DadosInvalidos(f"Venda {id_venda} não encontrada.")

    itens = conn.execute(
        """
        SELECT i.quantidade,
               i.preco_unitario_aplicado,
               i.quantidade * i.preco_unitario_aplicado AS subtotal,
               p.sku, p.descricao, p.status_garantia
        FROM itens_venda i
        JOIN produtos p ON p.id_produto = i.id_produto
        WHERE i.id_venda = ?
        ORDER BY i.id_item
        """,
        (id_venda,),
    ).fetchall()

    # A forma de pagamento fica no lançamento de Entrada vinculado à venda
    pagamento = conn.execute(
        """
        SELECT forma_pagamento FROM fluxo_caixa
        WHERE id_venda = ? AND tipo = 'Entrada'
        ORDER BY id_lancamento
        LIMIT 1
        """,
        (id_venda,),
    ).fetchone()

    return {
        "venda": dict(venda),
        "itens": [dict(i) for i in itens],
        "forma_pagamento": pagamento["forma_pagamento"] if pagamento else "—",
    }


def listar_vendas(conn: sqlite3.Connection, limite: int = 100) -> list[sqlite3.Row]:
    """Vendas mais recentes primeiro (dashboard e tela de recibos)."""
    return conn.execute(
        """
        SELECT id_venda, data_venda, cliente_nome, forma_entrega, valor_total
        FROM vendas
        ORDER BY id_venda DESC
        LIMIT ?
        """,
        (limite,),
    ).fetchall()
