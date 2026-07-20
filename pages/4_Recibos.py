"""
Tela de Recibos — reimpressão do recibo de qualquer venda (requisito 4).
"""

import streamlit as st
import streamlit.components.v1 as components

from mega_outlet.autenticacao import exigir_login
from mega_outlet.database import bootstrap
from mega_outlet.services import recibo, vendas

st.set_page_config(page_title="Recibos — MEGA OUTLET", page_icon="🖨️", layout="wide")
conn = bootstrap()
usuario = exigir_login(conn)  # Administrador e Vendedor

st.title("🖨️ Recibos")

todas = vendas.listar_vendas(conn, limite=200)
if not todas:
    st.info("Nenhuma venda registrada ainda.")
else:
    opcoes = {
        f"Nº {v['id_venda']:06d} — {v['data_venda']} — "
        f"{v['cliente_nome']} — R$ {v['valor_total']:,.2f}": v["id_venda"]
        for v in todas
    }
    escolha = st.selectbox("Selecione a venda", list(opcoes.keys()))
    html_recibo = recibo.gerar_recibo_html(vendas.obter_venda(conn, opcoes[escolha]))

    components.html(html_recibo, height=700, scrolling=True)
    st.download_button(
        "⬇️ Baixar recibo (HTML — abra e use Ctrl+P para imprimir/PDF)",
        data=html_recibo,
        file_name=f"recibo_venda_{opcoes[escolha]:06d}.html",
        mime="text/html",
    )

conn.close()
