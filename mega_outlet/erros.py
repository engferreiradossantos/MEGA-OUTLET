"""
Exceções de negócio do sistema.

A interface captura `ErroDeNegocio` para exibir mensagens amigáveis ao
operador do caixa, sem derrubar a aplicação.
"""


class ErroDeNegocio(Exception):
    """Base para toda violação de regra de negócio."""


class DadosInvalidos(ErroDeNegocio):
    """Entrada do usuário inválida (campo obrigatório vazio, valor <= 0 etc.)."""


class ProdutoNaoEncontrado(ErroDeNegocio):
    """Produto inexistente no cadastro."""

    def __init__(self, id_produto: int):
        self.id_produto = id_produto
        super().__init__(f"Produto com ID {id_produto} não encontrado no cadastro.")


class CredenciaisInvalidas(ErroDeNegocio):
    """Login/senha incorretos ou usuário desativado."""

    def __init__(self):
        super().__init__("Login ou senha inválidos, ou usuário desativado.")


class EstoqueInsuficiente(ErroDeNegocio):
    """
    Tentativa de vender quantidade maior que a disponível (regra 3.1),
    sem a opção "Sob Encomenda" habilitada.
    """

    def __init__(self, descricao: str, disponivel: int, solicitado: int):
        self.descricao = descricao
        self.disponivel = disponivel
        self.solicitado = solicitado
        super().__init__(
            f"Estoque insuficiente para '{descricao}': "
            f"disponível {disponivel}, solicitado {solicitado}. "
            f"Habilite 'Sob Encomenda' para vender mesmo assim."
        )
