"""
Tela de Estoque — cadastro de produtos, listagem e reposição (requisito 2.1).
"""

import pandas as pd
import streamlit as st

from mega_outlet.constants import CATEGORIAS_PRODUTO, STATUS_GARANTIA
from mega_outlet.database import bootstrap
from mega_outlet.erros import ErroDeNegocio
from mega_outlet.services import produtos

st.set_page_config(page_title="Estoque — MEGA OUTLET", page_icon="📦", layout="wide")
conn = bootstrap()

st.title("📦 Estoque")

aba_lista, aba_cadastro, aba_reposicao = st.tabs(
    ["Produtos cadastrados", "Cadastrar produto", "Repor estoque"]
)

# ---------------------------------------------------------------------------
# Listagem
# ---------------------------------------------------------------------------
with aba_lista:
    todos = produtos.listar_produtos(conn)
    if todos:
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "ID": p["id_produto"],
                        "SKU": p["sku"],
                        "Descrição": p["descricao"],
                        "Categoria": p["categoria"],
                        "Estoque": p["quantidade_atual"],
                        "Mínimo": p["quantidade_minima"],
                        "Custo (R$)": p["preco_custo"],
                        "Venda (R$)": p["preco_venda"],
                        "Garantia": p["status_garantia"],
                        "Repor?": "⚠️" if p["quantidade_atual"] <= p["quantidade_minima"] else "",
                    }
                    for p in todos
                ]
            ),
            width="stretch",
            hide_index=True,
        )
    else:
        st.info(
            "Nenhum produto cadastrado. Use a aba **Cadastrar produto** ou rode "
            "`python -m mega_outlet.seed` para dados de demonstração."
        )

# ---------------------------------------------------------------------------
# Cadastro
# ---------------------------------------------------------------------------
with aba_cadastro:
    with st.form("form_cadastro", clear_on_submit=True):
        c1, c2 = st.columns(2)
        sku = c1.text_input("SKU / Código *")
        descricao = c2.text_input("Descrição *")

        c3, c4, c5 = st.columns(3)
        categoria = c3.selectbox("Categoria", CATEGORIAS_PRODUTO)
        status_garantia = c4.selectbox("Status de garantia", STATUS_GARANTIA, index=1)
        quantidade_minima = c5.number_input("Quantidade mínima (alerta)", 0, step=1)

        c6, c7, c8 = st.columns(3)
        quantidade_atual = c6.number_input("Quantidade inicial", 0, step=1)
        preco_custo = c7.number_input("Preço de custo (R$)", 0.0, step=10.0, format="%.2f")
        preco_venda = c8.number_input("Preço de venda (R$)", 0.0, step=10.0, format="%.2f")

        if st.form_submit_button("💾 Cadastrar", width="stretch"):
            try:
                novo_id = produtos.cadastrar_produto(
                    conn,
                    sku=sku,
                    descricao=descricao,
                    categoria=categoria,
                    quantidade_atual=int(quantidade_atual),
                    quantidade_minima=int(quantidade_minima),
                    preco_custo=preco_custo,
                    preco_venda=preco_venda,
                    status_garantia=status_garantia,
                )
                st.success(f"Produto cadastrado com ID {novo_id}.")
            except ErroDeNegocio as erro:
                st.error(str(erro))

# ---------------------------------------------------------------------------
# Reposição (entrada de mercadoria)
# ---------------------------------------------------------------------------
with aba_reposicao:
    todos = produtos.listar_produtos(conn)
    if not todos:
        st.info("Cadastre produtos antes de repor estoque.")
    else:
        opcoes = {
            f"{p['sku']} — {p['descricao']} (estoque atual: {p['quantidade_atual']})": p
            for p in todos
        }
        escolha = st.selectbox("Produto", list(opcoes.keys()))
        quantidade = st.number_input("Quantidade a adicionar", min_value=1, step=1)
        if st.button("📥 Registrar entrada de mercadoria", width="stretch"):
            try:
                novo_saldo = produtos.repor_estoque(
                    conn, opcoes[escolha]["id_produto"], int(quantidade)
                )
                st.success(f"Estoque atualizado. Novo saldo: {novo_saldo}.")
            except ErroDeNegocio as erro:
                st.error(str(erro))

conn.close()
