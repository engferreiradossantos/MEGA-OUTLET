"""
Testes das regras de negócio críticas (seções 3.1 e 3.2 dos requisitos).

Rodar com:  python -m unittest discover -s tests -v
"""

import unittest

from mega_outlet.constants import AVISO_LEGAL_OUTLET
from mega_outlet.database import get_connection, init_db
from mega_outlet.erros import EstoqueInsuficiente, ProdutoNaoEncontrado
from mega_outlet.services import caixa, produtos, usuarios, vendas
from mega_outlet.services.vendas import ItemCarrinho


class TesteRegistrarVenda(unittest.TestCase):
    """Cobre a função principal: registrar_venda."""

    def setUp(self):
        # Banco em memória, zerado a cada teste
        self.conn = get_connection(":memory:")
        init_db(self.conn)
        self.id_sofa = produtos.cadastrar_produto(
            self.conn,
            sku="SOF-001",
            descricao="Sofá Retrátil 2.14M",
            categoria="Móveis",
            quantidade_atual=5,
            quantidade_minima=1,
            preco_custo=1450.00,
            preco_venda=2799.00,
            status_garantia="1 ano",
        )
        self.id_micro_outlet = produtos.cadastrar_produto(
            self.conn,
            sku="MIC-330",
            descricao="Micro-ondas 32L (outlet)",
            categoria="Eletrônicos",
            quantidade_atual=2,
            quantidade_minima=1,
            preco_custo=320.00,
            preco_venda=549.00,
            status_garantia="Sem garantia / No estado",
        )

    def tearDown(self):
        self.conn.close()

    # ------------------------------------------------------------------
    # Regra 3.1 (Baixa Automática) + Regra 3.2 (Vínculo com Caixa)
    # ------------------------------------------------------------------
    def test_venda_baixa_estoque_e_lanca_entrada_no_caixa(self):
        confirmacao = vendas.registrar_venda(
            self.conn,
            cliente_nome="Maria Silva",
            forma_pagamento="PIX",
            itens=[ItemCarrinho(self.id_sofa, quantidade=2)],
        )

        # Valor total calculado no servidor: 2 x 2799.00
        self.assertEqual(confirmacao.valor_total, 5598.00)

        # Baixa automática no estoque: 5 - 2 = 3
        sofa = produtos.obter_produto(self.conn, self.id_sofa)
        self.assertEqual(sofa["quantidade_atual"], 3)

        # Entrada no caixa vinculada à venda, herdando valor e forma de pagamento
        lancamento = self.conn.execute(
            "SELECT * FROM fluxo_caixa WHERE id_venda = ?", (confirmacao.id_venda,)
        ).fetchone()
        self.assertIsNotNone(lancamento)
        self.assertEqual(lancamento["tipo"], "Entrada")
        self.assertEqual(lancamento["categoria"], "Venda de Mercadoria")
        self.assertEqual(lancamento["valor"], 5598.00)
        self.assertEqual(lancamento["forma_pagamento"], "PIX")

    # ------------------------------------------------------------------
    # Regra 3.1 (Validação de Saldo) — bloqueio e rollback total
    # ------------------------------------------------------------------
    def test_estoque_insuficiente_bloqueia_e_nao_grava_nada(self):
        with self.assertRaises(EstoqueInsuficiente):
            vendas.registrar_venda(
                self.conn,
                cliente_nome="João Souza",
                forma_pagamento="Dinheiro",
                itens=[ItemCarrinho(self.id_sofa, quantidade=10)],  # só há 5
            )

        # Rollback: estoque intacto e nenhuma venda/lançamento gravado
        sofa = produtos.obter_produto(self.conn, self.id_sofa)
        self.assertEqual(sofa["quantidade_atual"], 5)
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM vendas").fetchone()["n"], 0
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) AS n FROM fluxo_caixa").fetchone()["n"],
            0,
        )

    def test_rollback_parcial_quando_segundo_item_falha(self):
        # 1º item ok (sofá), 2º item sem saldo (micro-ondas: só há 2)
        with self.assertRaises(EstoqueInsuficiente):
            vendas.registrar_venda(
                self.conn,
                cliente_nome="Ana Lima",
                forma_pagamento="PIX",
                itens=[
                    ItemCarrinho(self.id_sofa, quantidade=1),
                    ItemCarrinho(self.id_micro_outlet, quantidade=5),
                ],
            )
        # Nem o item válido pode ter sido baixado
        self.assertEqual(
            produtos.obter_produto(self.conn, self.id_sofa)["quantidade_atual"], 5
        )

    # ------------------------------------------------------------------
    # Regra 3.1 — opção "Sob Encomenda" permite saldo negativo
    # ------------------------------------------------------------------
    def test_sob_encomenda_permite_vender_alem_do_saldo(self):
        confirmacao = vendas.registrar_venda(
            self.conn,
            cliente_nome="Carlos Prado",
            forma_pagamento="Cartão de Crédito",
            itens=[ItemCarrinho(self.id_sofa, quantidade=8)],  # só há 5
            permitir_sob_encomenda=True,
        )
        self.assertEqual(confirmacao.valor_total, round(8 * 2799.00, 2))
        # Saldo negativo representa as 3 unidades a encomendar
        self.assertEqual(
            produtos.obter_produto(self.conn, self.id_sofa)["quantidade_atual"], -3
        )

    # ------------------------------------------------------------------
    # Regra 3.1 (Status Especial) — aviso legal automático para outlet
    # ------------------------------------------------------------------
    def test_aviso_legal_automatico_para_produto_outlet(self):
        confirmacao = vendas.registrar_venda(
            self.conn,
            cliente_nome="Paula Reis",
            forma_pagamento="PIX",
            itens=[ItemCarrinho(self.id_micro_outlet, quantidade=1)],
        )
        self.assertIn(AVISO_LEGAL_OUTLET, confirmacao.observacoes)

        venda = self.conn.execute(
            "SELECT observacoes FROM vendas WHERE id_venda = ?",
            (confirmacao.id_venda,),
        ).fetchone()
        self.assertIn(AVISO_LEGAL_OUTLET, venda["observacoes"])

    def test_produto_normal_nao_recebe_aviso_legal(self):
        confirmacao = vendas.registrar_venda(
            self.conn,
            cliente_nome="Rita Melo",
            forma_pagamento="Dinheiro",
            itens=[ItemCarrinho(self.id_sofa, quantidade=1)],
        )
        self.assertNotIn(AVISO_LEGAL_OUTLET, confirmacao.observacoes)

    # ------------------------------------------------------------------
    # Demais validações
    # ------------------------------------------------------------------
    def test_produto_inexistente(self):
        with self.assertRaises(ProdutoNaoEncontrado):
            vendas.registrar_venda(
                self.conn,
                cliente_nome="Teste",
                forma_pagamento="PIX",
                itens=[ItemCarrinho(9999, quantidade=1)],
            )

    def test_desconto_no_preco_unitario(self):
        confirmacao = vendas.registrar_venda(
            self.conn,
            cliente_nome="Cliente Desconto",
            forma_pagamento="PIX",
            itens=[ItemCarrinho(self.id_sofa, quantidade=1, preco_unitario=2500.00)],
        )
        self.assertEqual(confirmacao.valor_total, 2500.00)

    def test_venda_registra_o_usuario_vendedor(self):
        id_vendedor = usuarios.criar_usuario(
            self.conn, login="carla", nome="Carla Vendedora",
            senha="123456", perfil="Vendedor",
        )
        confirmacao = vendas.registrar_venda(
            self.conn,
            cliente_nome="Cliente Rastreado",
            forma_pagamento="PIX",
            itens=[ItemCarrinho(self.id_sofa, quantidade=1)],
            id_usuario=id_vendedor,
        )
        # Venda e lançamento do caixa gravam quem operou
        venda = self.conn.execute(
            "SELECT id_usuario FROM vendas WHERE id_venda = ?",
            (confirmacao.id_venda,),
        ).fetchone()
        self.assertEqual(venda["id_usuario"], id_vendedor)
        lancamento = self.conn.execute(
            "SELECT id_usuario FROM fluxo_caixa WHERE id_venda = ?",
            (confirmacao.id_venda,),
        ).fetchone()
        self.assertEqual(lancamento["id_usuario"], id_vendedor)
        # E o recibo identifica o vendedor
        dados = vendas.obter_venda(self.conn, confirmacao.id_venda)
        self.assertEqual(dados["venda"]["vendedor_nome"], "Carla Vendedora")

    def test_obter_venda_para_recibo(self):
        confirmacao = vendas.registrar_venda(
            self.conn,
            cliente_nome="Cliente Recibo",
            forma_pagamento="Cartão de Débito",
            itens=[ItemCarrinho(self.id_sofa, quantidade=1)],
        )
        dados = vendas.obter_venda(self.conn, confirmacao.id_venda)
        self.assertEqual(dados["venda"]["cliente_nome"], "Cliente Recibo")
        self.assertEqual(len(dados["itens"]), 1)
        self.assertEqual(dados["itens"][0]["sku"], "SOF-001")
        self.assertEqual(dados["forma_pagamento"], "Cartão de Débito")


class TesteFluxoDeCaixa(unittest.TestCase):
    """Cobre lançamentos manuais e o cálculo do saldo (regra 3.2)."""

    def setUp(self):
        self.conn = get_connection(":memory:")
        init_db(self.conn)

    def tearDown(self):
        self.conn.close()

    def test_saldo_com_entradas_e_saidas(self):
        caixa.registrar_lancamento(
            self.conn,
            tipo="Entrada",
            categoria="Venda de Mercadoria",
            valor=1000.00,
            forma_pagamento="PIX",
        )
        caixa.registrar_lancamento(
            self.conn,
            tipo="Saída",
            categoria="Custos Fixos",
            valor=350.50,
            forma_pagamento="Dinheiro",
        )
        self.assertEqual(caixa.saldo_atual(self.conn), 649.50)


if __name__ == "__main__":
    unittest.main()
