"""
Tela de Fluxo de Caixa — lançamentos manuais e extrato (requisitos 2.2 e 3.2).

As Entradas de venda são geradas automaticamente pelo PDV; aqui o lojista
registra despesas (Saídas) e outras entradas avulsas, e consulta o extrato.
"""

import pandas as pd
import streamlit as st

from mega_outlet.constants import (
    CATEGORIAS_CAIXA,
    FORMAS_PAGAMENTO,
    TIPOS_LANCAMENTO,
)
from mega_outlet.database import bootstrap
from mega_outlet.erros import ErroDeNegocio
from mega_outlet.services import caixa

st.set_page_config(page_title="Caixa — MEGA OUTLET", page_icon="💰", layout="wide")
conn = bootstrap()

st.title("💰 Fluxo de Caixa")
st.metric("Saldo atual", f"R$ {caixa.saldo_atual(conn):,.2f}")

# ---------------------------------------------------------------------------
# Lançamento manual (conciliação — regra 3.2)
# ---------------------------------------------------------------------------
st.subheader("Novo lançamento manual")
with st.form("form_lancamento", clear_on_submit=True):
    c1, c2, c3, c4 = st.columns(4)
    tipo = c1.selectbox("Tipo", TIPOS_LANCAMENTO, index=1)  # Saída como padrão
    categoria = c2.selectbox("Categoria", CATEGORIAS_CAIXA, index=2)
    valor = c3.number_input("Valor (R$)", min_value=0.0, step=50.0, format="%.2f")
    forma_pagamento = c4.selectbox("Forma de pagamento", FORMAS_PAGAMENTO)

    if st.form_submit_button("💾 Lançar", width="stretch"):
        try:
            id_lancamento = caixa.registrar_lancamento(
                conn,
                tipo=tipo,
                categoria=categoria,
                valor=valor,
                forma_pagamento=forma_pagamento,
            )
            st.success(f"Lançamento {id_lancamento} registrado.")
        except ErroDeNegocio as erro:
            st.error(str(erro))

# ---------------------------------------------------------------------------
# Extrato com filtro por período
# ---------------------------------------------------------------------------
st.subheader("Extrato")
c_ini, c_fim = st.columns(2)
data_inicio = c_ini.date_input("De", value=None, format="DD/MM/YYYY")
data_fim = c_fim.date_input("Até", value=None, format="DD/MM/YYYY")

lancamentos = caixa.extrato(
    conn,
    data_inicio=data_inicio.isoformat() if data_inicio else None,
    data_fim=data_fim.isoformat() if data_fim else None,
)
if lancamentos:
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Nº": l["id_lancamento"],
                    "Data/Hora": l["data_hora"],
                    "Tipo": l["tipo"],
                    "Categoria": l["categoria"],
                    "Valor (R$)": l["valor"] if l["tipo"] == "Entrada" else -l["valor"],
                    "Pagamento": l["forma_pagamento"],
                    "Venda vinculada": l["id_venda"] or "",
                }
                for l in lancamentos
            ]
        ),
        width="stretch",
        hide_index=True,
    )
else:
    st.info("Nenhum lançamento no período selecionado.")

conn.close()
