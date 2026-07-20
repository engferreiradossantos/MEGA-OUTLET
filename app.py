"""
MEGA OUTLET — Dashboard Inicial (requisito 4).

Exibe faturamento diário/mensal, saldo atual do caixa e alerta visual de
produtos com estoque abaixo do mínimo.

Executar com:  streamlit run app.py
"""

import pandas as pd
import streamlit as st

from mega_outlet.autenticacao import eh_administrador, exigir_login
from mega_outlet.database import bootstrap
from mega_outlet.services import caixa, produtos, vendas

st.set_page_config(
    page_title="MEGA OUTLET — Dashboard", page_icon="🏬", layout="wide"
)

conn = bootstrap()
usuario = exigir_login(conn)  # qualquer perfil; conteúdo varia abaixo

st.title("🏬 MEGA OUTLET — Dashboard")
st.caption("Gestão de estoque, vendas e fluxo de caixa")

# ---------------------------------------------------------------------------
# Indicadores principais (saldo do caixa é restrito ao Administrador)
# ---------------------------------------------------------------------------
col1, col2, col3 = st.columns(3)
col1.metric("Faturamento de hoje", f"R$ {caixa.faturamento_do_dia(conn):,.2f}")
col2.metric("Faturamento do mês", f"R$ {caixa.faturamento_do_mes(conn):,.2f}")
if eh_administrador(usuario):
    col3.metric("Saldo atual do caixa", f"R$ {caixa.saldo_atual(conn):,.2f}")

# ---------------------------------------------------------------------------
# Alerta de reposição de estoque
# ---------------------------------------------------------------------------
st.subheader("⚠️ Alerta de reposição")
abaixo_minimo = produtos.produtos_abaixo_do_minimo(conn)
if abaixo_minimo:
    st.warning(
        f"{len(abaixo_minimo)} produto(s) com estoque igual ou abaixo do mínimo:"
    )
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "SKU": p["sku"],
                    "Descrição": p["descricao"],
                    "Estoque atual": p["quantidade_atual"],
                    "Mínimo": p["quantidade_minima"],
                }
                for p in abaixo_minimo
            ]
        ),
        width="stretch",
        hide_index=True,
    )
else:
    st.success("Nenhum produto abaixo do estoque mínimo. ✅")

# ---------------------------------------------------------------------------
# Últimas movimentações
# ---------------------------------------------------------------------------
col_vendas, col_caixa = st.columns(2)

with col_vendas:
    st.subheader("🧾 Últimas vendas")
    ultimas = vendas.listar_vendas(conn, limite=10)
    if ultimas:
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Nº": v["id_venda"],
                        "Data": v["data_venda"],
                        "Cliente": v["cliente_nome"],
                        "Entrega": v["forma_entrega"],
                        "Total (R$)": v["valor_total"],
                    }
                    for v in ultimas
                ]
            ),
            width="stretch",
            hide_index=True,
        )
    else:
        st.info("Nenhuma venda registrada ainda. Use a tela **PDV** para vender.")

with col_caixa:
    st.subheader("💰 Últimos lançamentos no caixa")
    lancamentos = caixa.extrato(conn, limite=10) if eh_administrador(usuario) else []
    if not eh_administrador(usuario):
        st.info("Visível apenas para o perfil Administrador.")
    elif lancamentos:
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Data/Hora": l["data_hora"],
                        "Tipo": l["tipo"],
                        "Categoria": l["categoria"],
                        "Valor (R$)": l["valor"],
                        "Pagamento": l["forma_pagamento"],
                    }
                    for l in lancamentos
                ]
            ),
            width="stretch",
            hide_index=True,
        )
    else:
        st.info("Nenhum lançamento no caixa ainda.")

conn.close()
