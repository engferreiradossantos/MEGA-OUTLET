"""
Tela de PDV — Frente de Caixa (requisito 4).

Fluxo: buscar produto → montar carrinho → dados do cliente e entrega →
"Finalizar Venda" (baixa de estoque + lançamento no caixa em uma única
transação) → recibo para impressão.
"""

import streamlit as st
import streamlit.components.v1 as components

from mega_outlet.autenticacao import exigir_login
from mega_outlet.constants import FORMAS_ENTREGA, FORMAS_PAGAMENTO
from mega_outlet.database import bootstrap
from mega_outlet.erros import ErroDeNegocio
from mega_outlet.services import produtos, recibo, vendas

st.set_page_config(page_title="PDV — MEGA OUTLET", page_icon="🛒", layout="wide")
conn = bootstrap()
usuario = exigir_login(conn)  # Administrador e Vendedor podem vender

st.title("🛒 PDV — Frente de Caixa")

# Estado da sessão: carrinho e último recibo emitido
if "carrinho" not in st.session_state:
    st.session_state.carrinho = []  # lista de dicts (produto + qtd + preço)
if "ultimo_recibo" not in st.session_state:
    st.session_state.ultimo_recibo = None

col_busca, col_carrinho = st.columns(2)

# ---------------------------------------------------------------------------
# Busca de produto por código ou nome
# ---------------------------------------------------------------------------
with col_busca:
    st.subheader("1️⃣ Buscar produto")
    termo = st.text_input("Código (SKU) ou parte da descrição")
    resultados = produtos.buscar_produtos(conn, termo) if termo else []

    if termo and not resultados:
        st.info("Nenhum produto encontrado.")

    if resultados:
        opcoes = {
            f"{p['sku']} — {p['descricao']} "
            f"(estoque: {p['quantidade_atual']} | R$ {p['preco_venda']:,.2f})": p
            for p in resultados
        }
        escolha = st.selectbox("Produto", list(opcoes.keys()))
        produto = opcoes[escolha]

        qtd = st.number_input("Quantidade", min_value=1, value=1, step=1)
        preco = st.number_input(
            "Preço unitário (R$) — ajuste para desconto",
            min_value=0.0,
            value=float(produto["preco_venda"]),
            step=10.0,
            format="%.2f",
        )
        if st.button("➕ Adicionar ao carrinho", width="stretch"):
            st.session_state.carrinho.append(
                {
                    "id_produto": produto["id_produto"],
                    "sku": produto["sku"],
                    "descricao": produto["descricao"],
                    "quantidade": int(qtd),
                    "preco_unitario": round(float(preco), 2),
                }
            )
            st.rerun()

# ---------------------------------------------------------------------------
# Carrinho
# ---------------------------------------------------------------------------
with col_carrinho:
    st.subheader("2️⃣ Carrinho")
    if not st.session_state.carrinho:
        st.info("Carrinho vazio.")
    total = 0.0
    for indice, item in enumerate(st.session_state.carrinho):
        subtotal = item["quantidade"] * item["preco_unitario"]
        total += subtotal
        c_desc, c_botao = st.columns([5, 1])
        c_desc.write(
            f"**{item['sku']}** {item['descricao']} — "
            f"{item['quantidade']} × R$ {item['preco_unitario']:,.2f} = "
            f"**R$ {subtotal:,.2f}**"
        )
        if c_botao.button("❌", key=f"remover_{indice}", help="Remover item"):
            st.session_state.carrinho.pop(indice)
            st.rerun()
    if st.session_state.carrinho:
        st.markdown(f"### Total: R$ {total:,.2f}")

st.divider()

# ---------------------------------------------------------------------------
# Dados do cliente, entrega, pagamento e finalização
# ---------------------------------------------------------------------------
st.subheader("3️⃣ Dados do cliente e finalização")
c1, c2, c3 = st.columns(3)
cliente_nome = c1.text_input("Nome do cliente *")
cliente_cpf = c2.text_input("CPF")
cliente_telefone = c3.text_input("Telefone")

c4, c5 = st.columns(2)
forma_entrega = c4.selectbox("Forma de entrega", FORMAS_ENTREGA)
forma_pagamento = c5.selectbox("Forma de pagamento", FORMAS_PAGAMENTO)

endereco_entrega = ""
if forma_entrega != "Retira":
    endereco_entrega = st.text_input("Endereço de entrega *")

observacoes = st.text_area(
    "Observações",
    placeholder="Aviso legal de peças de outlet/mostruário é acrescentado "
    "automaticamente quando aplicável.",
)
permitir_sob_encomenda = st.checkbox(
    "Permitir venda Sob Encomenda (vender mesmo sem saldo em estoque)"
)

if st.button("✅ Finalizar Venda", type="primary", width="stretch"):
    try:
        itens = [
            vendas.ItemCarrinho(
                id_produto=item["id_produto"],
                quantidade=item["quantidade"],
                preco_unitario=item["preco_unitario"],
            )
            for item in st.session_state.carrinho
        ]
        # Baixa de estoque + lançamento no caixa em uma única transação
        confirmacao = vendas.registrar_venda(
            conn,
            cliente_nome=cliente_nome,
            cliente_cpf=cliente_cpf,
            cliente_telefone=cliente_telefone,
            forma_entrega=forma_entrega,
            endereco_entrega=endereco_entrega,
            forma_pagamento=forma_pagamento,
            itens=itens,
            observacoes=observacoes,
            permitir_sob_encomenda=permitir_sob_encomenda,
            id_usuario=usuario["id_usuario"],  # registra quem vendeu
        )
        st.session_state.carrinho = []
        st.session_state.ultimo_recibo = recibo.gerar_recibo_html(
            vendas.obter_venda(conn, confirmacao.id_venda)
        )
        st.success(
            f"Venda Nº {confirmacao.id_venda:06d} registrada! "
            f"Total R$ {confirmacao.valor_total:,.2f} — estoque baixado e "
            f"Entrada lançada no caixa (lançamento {confirmacao.id_lancamento_caixa})."
        )
    except ErroDeNegocio as erro:
        st.error(str(erro))

# ---------------------------------------------------------------------------
# Recibo da última venda
# ---------------------------------------------------------------------------
if st.session_state.ultimo_recibo:
    with st.expander("🖨️ Recibo da última venda", expanded=True):
        components.html(st.session_state.ultimo_recibo, height=650, scrolling=True)
        st.download_button(
            "⬇️ Baixar recibo (HTML — abra e use Ctrl+P para imprimir/PDF)",
            data=st.session_state.ultimo_recibo,
            file_name="recibo_mega_outlet.html",
            mime="text/html",
        )

conn.close()
