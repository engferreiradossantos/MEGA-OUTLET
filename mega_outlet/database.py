"""
Camada de acesso ao banco de dados (SQLite).

Estrutura de tabelas conforme o requisito 2 (Estrutura de Dados):

    produtos     -> 2.1 Cadastro de Produtos (Estoque)
    fluxo_caixa  -> 2.2 Fluxo de Caixa (Transações Financeiras)
    vendas       -> 2.3 Vendas e Pedidos
    itens_venda  -> 2.4 Itens da Venda (tabela relacional N:N)

Convenções:
  * Datas são armazenadas como texto ISO-8601 (`YYYY-MM-DD` e
    `YYYY-MM-DD HH:MM:SS`), o formato nativo das funções de data do SQLite.
  * Valores monetários usam REAL arredondado a 2 casas na camada de serviço.
  * `produtos.quantidade_atual` NÃO possui CHECK >= 0 de propósito: vendas
    "Sob Encomenda" (regra 3.1) podem deixar o saldo negativo, representando
    itens a encomendar junto ao fornecedor.
"""

from __future__ import annotations

import os
import sqlite3

# Caminho padrão do banco; sobrescrevível via variável de ambiente para
# facilitar testes e implantações com disco persistente.
DB_PATH_PADRAO = os.environ.get(
    "MEGA_OUTLET_DB", os.path.join("data", "mega_outlet.db")
)

# ---------------------------------------------------------------------------
# DDL — criação do esquema (idempotente: usa IF NOT EXISTS)
# ---------------------------------------------------------------------------
SCHEMA_SQL = """
-- 2.1 Cadastro de Produtos (Estoque) ---------------------------------------
CREATE TABLE IF NOT EXISTS produtos (
    id_produto        INTEGER PRIMARY KEY AUTOINCREMENT,
    sku               TEXT    NOT NULL UNIQUE,           -- código comercial
    descricao         TEXT    NOT NULL,
    categoria         TEXT    NOT NULL
                      CHECK (categoria IN ('Móveis', 'Eletrônicos', 'Acessórios')),
    quantidade_atual  INTEGER NOT NULL DEFAULT 0,        -- pode ficar negativo (sob encomenda)
    quantidade_minima INTEGER NOT NULL DEFAULT 0
                      CHECK (quantidade_minima >= 0),    -- alerta de reposição
    preco_custo       REAL    NOT NULL DEFAULT 0 CHECK (preco_custo >= 0),
    preco_venda       REAL    NOT NULL DEFAULT 0 CHECK (preco_venda >= 0),
    status_garantia   TEXT    NOT NULL DEFAULT '90 dias'
);

-- 2.3 Vendas e Pedidos ------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas (
    id_venda         INTEGER PRIMARY KEY AUTOINCREMENT,
    data_venda       TEXT    NOT NULL,                   -- YYYY-MM-DD
    cliente_nome     TEXT    NOT NULL,
    cliente_cpf      TEXT,
    cliente_telefone TEXT,
    forma_entrega    TEXT    NOT NULL
                     CHECK (forma_entrega IN ('Retira', 'Entrega Própria', 'Transportadora')),
    endereco_entrega TEXT,                               -- obrigatório se não for 'Retira'
    valor_total      REAL    NOT NULL CHECK (valor_total >= 0),
    observacoes      TEXT
);

-- 2.4 Itens da Venda (tabela relacional) ------------------------------------
CREATE TABLE IF NOT EXISTS itens_venda (
    id_item                 INTEGER PRIMARY KEY AUTOINCREMENT,
    id_venda                INTEGER NOT NULL REFERENCES vendas (id_venda),
    id_produto              INTEGER NOT NULL REFERENCES produtos (id_produto),
    quantidade              INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario_aplicado REAL    NOT NULL CHECK (preco_unitario_aplicado >= 0)
);

-- 2.2 Fluxo de Caixa (Transações Financeiras) -------------------------------
CREATE TABLE IF NOT EXISTS fluxo_caixa (
    id_lancamento   INTEGER PRIMARY KEY AUTOINCREMENT,
    data_hora       TEXT    NOT NULL,                    -- YYYY-MM-DD HH:MM:SS
    tipo            TEXT    NOT NULL CHECK (tipo IN ('Entrada', 'Saída')),
    categoria       TEXT    NOT NULL,                    -- Venda de Mercadoria, Custos Fixos...
    valor           REAL    NOT NULL CHECK (valor > 0),
    forma_pagamento TEXT    NOT NULL
                    CHECK (forma_pagamento IN
                           ('PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro')),
    id_venda        INTEGER REFERENCES vendas (id_venda) -- NULL em lançamentos manuais
);

-- Índices para as consultas mais frequentes (busca no PDV, extrato, dashboard)
CREATE INDEX IF NOT EXISTS idx_produtos_sku        ON produtos (sku);
CREATE INDEX IF NOT EXISTS idx_vendas_data         ON vendas (data_venda);
CREATE INDEX IF NOT EXISTS idx_itens_venda_venda   ON itens_venda (id_venda);
CREATE INDEX IF NOT EXISTS idx_fluxo_data          ON fluxo_caixa (data_hora);
CREATE INDEX IF NOT EXISTS idx_fluxo_venda         ON fluxo_caixa (id_venda);
"""


def get_connection(db_path: str = DB_PATH_PADRAO) -> sqlite3.Connection:
    """
    Abre uma conexão com o banco, com:
      * `sqlite3.Row` como row_factory (acesso por nome de coluna);
      * chaves estrangeiras habilitadas (desligadas por padrão no SQLite).

    Cria o diretório do arquivo se necessário.
    """
    if db_path != ":memory:":
        diretorio = os.path.dirname(db_path)
        if diretorio:
            os.makedirs(diretorio, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Cria as tabelas e índices (não destrutivo — pode rodar sempre)."""
    conn.executescript(SCHEMA_SQL)
    conn.commit()


def bootstrap(db_path: str = DB_PATH_PADRAO) -> sqlite3.Connection:
    """
    Conveniência para a interface: abre a conexão e garante o esquema.

    A interface Streamlit chama esta função a cada execução da página —
    uma conexão nova por execução evita problemas de thread do sqlite3.
    """
    conn = get_connection(db_path)
    init_db(conn)
    return conn
