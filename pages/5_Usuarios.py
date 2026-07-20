"""
Tela de Usuários — cadastro, redefinição de senha e ativação/desativação.

Acesso exclusivo do perfil Administrador. Todo o ciclo de vida dos
usuários é feito pelo sistema (nunca editando o banco diretamente).
"""

import pandas as pd
import streamlit as st

from mega_outlet.autenticacao import exigir_login
from mega_outlet.constants import PERFIS_USUARIO
from mega_outlet.database import bootstrap
from mega_outlet.erros import ErroDeNegocio
from mega_outlet.services import usuarios

st.set_page_config(page_title="Usuários — MEGA OUTLET", page_icon="👤", layout="wide")
conn = bootstrap()
usuario_logado = exigir_login(conn, perfis=("Administrador",))

st.title("👤 Usuários")

aba_lista, aba_cadastro, aba_gerenciar = st.tabs(
    ["Usuários cadastrados", "Cadastrar usuário", "Gerenciar (senha / ativo)"]
)

# ---------------------------------------------------------------------------
# Listagem
# ---------------------------------------------------------------------------
with aba_lista:
    lista = usuarios.listar_usuarios(conn)
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "ID": u["id_usuario"],
                    "Login": u["login"],
                    "Nome": u["nome"],
                    "Perfil": u["perfil"],
                    "Situação": "✅ Ativo" if u["ativo"] else "🚫 Desativado",
                    "Criado em": u["criado_em"],
                }
                for u in lista
            ]
        ),
        width="stretch",
        hide_index=True,
    )
    st.caption(
        "Perfis: **Administrador** = acesso total | "
        "**Vendedor** = PDV, recibos e consulta de estoque."
    )

# ---------------------------------------------------------------------------
# Cadastro
# ---------------------------------------------------------------------------
with aba_cadastro:
    with st.form("form_novo_usuario", clear_on_submit=True):
        c1, c2 = st.columns(2)
        nome = c1.text_input("Nome completo *")
        login = c2.text_input("Login *")

        c3, c4, c5 = st.columns(3)
        perfil = c3.selectbox("Perfil", PERFIS_USUARIO, index=1)
        senha = c4.text_input("Senha (mín. 6 caracteres) *", type="password")
        confirmacao = c5.text_input("Confirmar senha *", type="password")

        if st.form_submit_button("💾 Cadastrar usuário", width="stretch"):
            if senha != confirmacao:
                st.error("As senhas não conferem.")
            else:
                try:
                    novo_id = usuarios.criar_usuario(
                        conn, login=login, nome=nome, senha=senha, perfil=perfil
                    )
                    st.success(f"Usuário cadastrado com ID {novo_id}.")
                except ErroDeNegocio as erro:
                    st.error(str(erro))

# ---------------------------------------------------------------------------
# Gerenciamento: redefinir senha e ativar/desativar
# ---------------------------------------------------------------------------
with aba_gerenciar:
    lista = usuarios.listar_usuarios(conn)
    opcoes = {
        f"{u['nome']} ({u['login']}) — {u['perfil']}"
        f"{'' if u['ativo'] else ' [desativado]'}": u
        for u in lista
    }
    escolha = st.selectbox("Usuário", list(opcoes.keys()))
    selecionado = opcoes[escolha]

    col_senha, col_ativo = st.columns(2)

    with col_senha:
        st.subheader("🔑 Redefinir senha")
        with st.form("form_redefinir_senha", clear_on_submit=True):
            nova = st.text_input("Nova senha (mín. 6 caracteres)", type="password")
            nova2 = st.text_input("Confirmar nova senha", type="password")
            if st.form_submit_button("Redefinir", width="stretch"):
                if nova != nova2:
                    st.error("As senhas não conferem.")
                else:
                    try:
                        usuarios.alterar_senha(conn, selecionado["id_usuario"], nova)
                        st.success("Senha redefinida.")
                    except ErroDeNegocio as erro:
                        st.error(str(erro))

    with col_ativo:
        st.subheader("🚦 Situação")
        if selecionado["ativo"]:
            st.write("Usuário atualmente **ativo**.")
            if st.button("🚫 Desativar usuário", width="stretch"):
                try:
                    usuarios.definir_ativo(conn, selecionado["id_usuario"], False)
                    st.success("Usuário desativado.")
                    st.rerun()
                except ErroDeNegocio as erro:
                    st.error(str(erro))
        else:
            st.write("Usuário atualmente **desativado**.")
            if st.button("✅ Reativar usuário", width="stretch"):
                try:
                    usuarios.definir_ativo(conn, selecionado["id_usuario"], True)
                    st.success("Usuário reativado.")
                    st.rerun()
                except ErroDeNegocio as erro:
                    st.error(str(erro))

conn.close()
