"""
Popula o banco com dados de demonstração.

Uso:  python -m mega_outlet.seed
"""

from __future__ import annotations

from mega_outlet.database import bootstrap
from mega_outlet.erros import DadosInvalidos
from mega_outlet.services import produtos

PRODUTOS_DEMO = [
    # (sku, descricao, categoria, qtd, qtd_min, custo, venda, garantia)
    ("SOF-001", "Sofá Retrátil e Reclinável em linho molas ensac 2.14M",
     "Móveis", 4, 1, 1450.00, 2799.00, "1 ano"),
    ("SOF-002", "Sofá 3 lugares suede cinza (mostruário)",
     "Móveis", 1, 0, 800.00, 1399.00, "Sem garantia / No estado"),
    ("RAC-010", "Rack para TV até 65\" com painel ripado",
     "Móveis", 6, 2, 380.00, 749.00, "90 dias"),
    ("GEL-101", "Geladeira Frost Free 410L Inox",
     "Eletrônicos", 3, 1, 2100.00, 3299.00, "1 ano"),
    ("TVL-205", "Smart TV 55\" 4K",
     "Eletrônicos", 5, 2, 1650.00, 2499.00, "1 ano"),
    ("MIC-330", "Micro-ondas 32L espelhado (outlet)",
     "Eletrônicos", 2, 1, 320.00, 549.00, "Sem garantia / No estado"),
    ("ACE-501", "Suporte de parede para TV 32-75\"",
     "Acessórios", 15, 5, 25.00, 89.90, "90 dias"),
    ("ACE-502", "Filtro de linha 6 tomadas",
     "Acessórios", 20, 8, 12.00, 39.90, "90 dias"),
]


def popular_dados_demo() -> None:
    """Insere os produtos de demonstração (ignora SKUs já cadastrados)."""
    conn = bootstrap()
    inseridos = 0
    for sku, desc, cat, qtd, qtd_min, custo, venda, garantia in PRODUTOS_DEMO:
        try:
            produtos.cadastrar_produto(
                conn,
                sku=sku,
                descricao=desc,
                categoria=cat,
                quantidade_atual=qtd,
                quantidade_minima=qtd_min,
                preco_custo=custo,
                preco_venda=venda,
                status_garantia=garantia,
            )
            inseridos += 1
        except DadosInvalidos:
            pass  # SKU já existe — seed é idempotente
    conn.close()
    print(f"Seed concluído: {inseridos} produto(s) inserido(s).")


if __name__ == "__main__":
    popular_dados_demo()
