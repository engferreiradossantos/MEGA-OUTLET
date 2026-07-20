"""
Testes do serviço de usuários (login, senha e perfis).

Rodar com:  python -m unittest discover -s tests -v
"""

import unittest

from mega_outlet.database import get_connection, init_db
from mega_outlet.erros import CredenciaisInvalidas, DadosInvalidos
from mega_outlet.services import usuarios


class TesteUsuarios(unittest.TestCase):
    def setUp(self):
        self.conn = get_connection(":memory:")
        init_db(self.conn)

    def tearDown(self):
        self.conn.close()

    def test_criar_e_autenticar(self):
        usuarios.criar_usuario(
            self.conn, login="Admin", nome="Administrador da Loja",
            senha="segredo123", perfil="Administrador",
        )
        # Login não diferencia maiúsculas (normalizado para minúsculas)
        logado = usuarios.autenticar(self.conn, "ADMIN", "segredo123")
        self.assertEqual(logado["perfil"], "Administrador")
        self.assertEqual(logado["nome"], "Administrador da Loja")
        self.assertNotIn("senha_hash", logado)  # hash nunca sai do serviço

    def test_senha_errada_e_login_inexistente(self):
        usuarios.criar_usuario(
            self.conn, login="vendedor", nome="Vendedor",
            senha="senha123", perfil="Vendedor",
        )
        with self.assertRaises(CredenciaisInvalidas):
            usuarios.autenticar(self.conn, "vendedor", "senha_errada")
        with self.assertRaises(CredenciaisInvalidas):
            usuarios.autenticar(self.conn, "nao_existe", "qualquer")

    def test_senha_nao_fica_em_texto_puro(self):
        usuarios.criar_usuario(
            self.conn, login="ana", nome="Ana", senha="minhasenha",
            perfil="Vendedor",
        )
        registro = self.conn.execute(
            "SELECT senha_hash FROM usuarios WHERE login = 'ana'"
        ).fetchone()
        self.assertNotIn("minhasenha", registro["senha_hash"])
        self.assertTrue(registro["senha_hash"].startswith("pbkdf2_sha256$"))

    def test_login_duplicado(self):
        usuarios.criar_usuario(
            self.conn, login="joao", nome="João", senha="123456",
            perfil="Vendedor",
        )
        with self.assertRaises(DadosInvalidos):
            usuarios.criar_usuario(
                self.conn, login="JOAO", nome="Outro João", senha="654321",
                perfil="Vendedor",
            )

    def test_senha_curta_e_perfil_invalido(self):
        with self.assertRaises(DadosInvalidos):
            usuarios.criar_usuario(
                self.conn, login="x", nome="X", senha="12345",
                perfil="Vendedor",
            )
        with self.assertRaises(DadosInvalidos):
            usuarios.criar_usuario(
                self.conn, login="y", nome="Y", senha="123456",
                perfil="Gerente",
            )

    def test_usuario_desativado_nao_loga(self):
        # Precisa haver outro admin ativo para poder desativar este
        usuarios.criar_usuario(
            self.conn, login="chefe", nome="Chefe", senha="123456",
            perfil="Administrador",
        )
        id_vendedor = usuarios.criar_usuario(
            self.conn, login="ze", nome="Zé", senha="123456", perfil="Vendedor",
        )
        usuarios.definir_ativo(self.conn, id_vendedor, False)
        with self.assertRaises(CredenciaisInvalidas):
            usuarios.autenticar(self.conn, "ze", "123456")
        # Reativado, volta a logar
        usuarios.definir_ativo(self.conn, id_vendedor, True)
        self.assertEqual(usuarios.autenticar(self.conn, "ze", "123456")["login"], "ze")

    def test_nao_desativa_ultimo_administrador(self):
        id_admin = usuarios.criar_usuario(
            self.conn, login="unico", nome="Único Admin", senha="123456",
            perfil="Administrador",
        )
        with self.assertRaises(DadosInvalidos):
            usuarios.definir_ativo(self.conn, id_admin, False)

    def test_alterar_senha(self):
        id_usuario = usuarios.criar_usuario(
            self.conn, login="maria", nome="Maria", senha="antiga123",
            perfil="Vendedor",
        )
        usuarios.alterar_senha(self.conn, id_usuario, "nova_senha")
        with self.assertRaises(CredenciaisInvalidas):
            usuarios.autenticar(self.conn, "maria", "antiga123")
        self.assertEqual(
            usuarios.autenticar(self.conn, "maria", "nova_senha")["login"], "maria"
        )


if __name__ == "__main__":
    unittest.main()
