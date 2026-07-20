"""
Constantes de domínio do sistema (enums e textos padrão).

Centralizadas aqui para que interface, serviços e testes usem sempre
os mesmos valores — os CHECKs do banco (ver `database.py`) espelham
estas listas.
"""

# ---------------------------------------------------------------------------
# Produtos (requisito 2.1)
# ---------------------------------------------------------------------------
CATEGORIAS_PRODUTO = ("Móveis", "Eletrônicos", "Acessórios")

STATUS_GARANTIA = ("Sem garantia / No estado", "90 dias", "1 ano")

# ---------------------------------------------------------------------------
# Fluxo de caixa (requisito 2.2)
# ---------------------------------------------------------------------------
TIPOS_LANCAMENTO = ("Entrada", "Saída")

CATEGORIAS_CAIXA = (
    "Venda de Mercadoria",
    "Pagamento de Fornecedor",
    "Custos Fixos",
    "Pro Labore",
)
# Categoria usada automaticamente na Entrada gerada por uma venda (regra 3.2)
CATEGORIA_CAIXA_VENDA = "Venda de Mercadoria"

FORMAS_PAGAMENTO = ("PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro")

# ---------------------------------------------------------------------------
# Vendas (requisito 2.3)
# ---------------------------------------------------------------------------
FORMAS_ENTREGA = ("Retira", "Entrega Própria", "Transportadora")

# Aviso legal anexado automaticamente às observações quando a venda contém
# produto de mostruário/outlet (regra 3.1 — "Status Especial")
AVISO_LEGAL_OUTLET = (
    "Peças vendidas no estado em que se encontram, sem troca e sem garantia."
)

# ---------------------------------------------------------------------------
# Usuários e perfis de acesso
# ---------------------------------------------------------------------------
# Administrador: acesso total (usuários, estoque, caixa, dashboard completo)
# Vendedor: PDV, recibos e consulta de estoque
PERFIS_USUARIO = ("Administrador", "Vendedor")

# ---------------------------------------------------------------------------
# Dados da loja (usados no cabeçalho do recibo — requisito 4)
# ---------------------------------------------------------------------------
DADOS_LOJA = {
    "nome": "MEGA OUTLET — Móveis e Eletroeletrônicos",
    "cnpj": "00.000.000/0000-00",          # TODO: preencher com o CNPJ real
    "endereco": "Rua Exemplo, 123 — Centro — Cidade/UF",
    "telefone": "(00) 00000-0000",
}
