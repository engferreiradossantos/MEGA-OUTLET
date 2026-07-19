"""
Camada de serviços (regras de negócio).

Cada módulo agrupa as operações de uma entidade:

    produtos -> cadastro, busca e reposição de estoque
    vendas   -> registrar_venda (baixa de estoque + caixa em uma transação)
    caixa    -> lançamentos manuais, saldo, faturamento e extrato
    recibo   -> geração do recibo em HTML para impressão

Nenhum módulo desta camada importa Streamlit — a lógica é testável
isoladamente e reutilizável em outra interface (CLI, API etc.).
"""
