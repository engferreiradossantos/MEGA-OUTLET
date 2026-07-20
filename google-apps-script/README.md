# 🏬 MEGA OUTLET — Versão Google Sheets (Apps Script)

Sistema de **estoque, vendas (PDV) e fluxo de caixa** rodando 100% dentro de
uma planilha do Google Sheets, com interface em HTML/CSS.

## 📋 Instalação (passo a passo)

1. Crie uma **nova planilha** no Google Sheets ([sheets.new](https://sheets.new)).
2. No menu da planilha, abra **Extensões → Apps Script**.
3. No editor do Apps Script, crie os arquivos abaixo e cole o conteúdo de
   cada um (use o botão **+** ao lado de "Arquivos"):

   | Arquivo no editor | Tipo | Conteúdo |
   |---|---|---|
   | `Codigo.gs` | Script | `Codigo.gs` desta pasta (pode renomear o `Código.gs` padrão) |
   | `Produtos.gs` | Script | `Produtos.gs` |
   | `Vendas.gs` | Script | `Vendas.gs` |
   | `Caixa.gs` | Script | `Caixa.gs` |
   | `Usuarios.gs` | Script | `Usuarios.gs` |
   | `PDV` | HTML | `PDV.html` |
   | `Lancamento` | HTML | `Lancamento.html` |
   | `Usuarios` | HTML | `Usuarios.html` |

   > ⚠️ Os arquivos HTML devem se chamar exatamente **PDV**, **Lancamento** e
   > **Usuarios** (o editor acrescenta o `.html` sozinho).

4. Salve tudo (💾 ou `Ctrl+S`) e **recarregue a aba da planilha** no navegador.
5. Vai aparecer o menu **🏬 MEGA OUTLET**. Clique em
   **⚙️ Configurar planilha** — na primeira execução o Google pedirá
   autorização (é o fluxo normal de scripts: *Permitir* → escolher sua conta).
6. Abra **🛒 Abrir PDV**: como ainda não há usuários, aparece a tela de
   **primeiro acesso** para criar a conta do **Administrador** (nome, login
   e senha). Depois disso, todo cadastro de usuário é feito pelo menu
   **👤 Gerenciar usuários**.
7. (Opcional) **📦 Inserir produtos de demonstração** para testar.
8. Faça login no PDV e registre a primeira venda. 🎉

> 💡 Quem usa [clasp](https://github.com/google/clasp) pode simplesmente fazer
> `clasp push` a partir desta pasta (o `appsscript.json` já está incluído).

## 🗂️ Abas criadas (estrutura de dados do requisito 2)

| Aba | Requisito | Colunas |
|---|---|---|
| `Produtos` | 2.1 | ID_Produto, SKU, Descricao, Categoria, Quantidade_Atual, Quantidade_Minima, Preco_Custo, Preco_Venda, Status_Garantia |
| `Vendas` | 2.3 | ID_Venda, Data_Venda, Cliente_Nome, Cliente_CPF, Cliente_Telefone, Forma_Entrega, Endereco_Entrega, Valor_Total, Observacoes, ID_Usuario |
| `Itens_Venda` | 2.4 | ID_Item, ID_Venda, ID_Produto, Quantidade, Preco_Unitario_Aplicado |
| `Fluxo_Caixa` | 2.2 | ID_Lancamento, Data_Hora, Tipo, Categoria, Valor, Forma_Pagamento, ID_Venda, ID_Usuario |
| `Usuarios` | — | ID_Usuario, Login, Nome, Perfil, Ativo, Salt, Senha_Hash (aba oculta; gestão pelo menu) |
| `Dashboard` | 4 | Faturamento do dia/mês, saldo do caixa e alerta de reposição (fórmulas automáticas) |

As colunas de enum (Categoria, Tipo, Forma_Pagamento etc.) recebem **listas
suspensas** de validação, e as colunas de dinheiro/data recebem formato
automático.

## 👤 Usuários, login e perfis

O uso do sistema exige **login e senha**. As senhas são gravadas apenas como
**hash com salt** (SHA-256 iterado — nunca em texto puro), e o login gera um
token de sessão válido por até 6 horas. Cada venda e cada lançamento no caixa
registram **qual usuário** os executou (coluna `ID_Usuario`), e o recibo
mostra "Atendido por".

| Perfil | Pode |
|---|---|
| **Administrador** | Tudo: PDV, lançamentos manuais no caixa e gestão de usuários |
| **Vendedor** | PDV (vendas) e recibos |

Regras de proteção: o "primeiro acesso" só funciona enquanto não existe
nenhum usuário; um vendedor não consegue criar usuários nem lançar despesas;
e o último administrador ativo não pode ser desativado.

> 🔒 **Limite importante do Google Sheets**: quem tem acesso de *edição* à
> planilha consegue ver e alterar as abas diretamente. O login controla o
> uso do **sistema** (PDV, caixa, usuários); para proteger os **dados**,
> compartilhe a planilha apenas com o dono/administrador.

## ⚙️ Funcionamento (regras de negócio do requisito 3)

A função central é **`registrarVenda`** (`Vendas.gs`), chamada pelo botão
**"Finalizar Venda"** do PDV. Sob bloqueio exclusivo (`LockService`, que
impede dois caixas de gravarem ao mesmo tempo), ela:

1. **Valida o saldo de estoque** de todos os itens — bloqueia a venda acima
   do disponível, a menos que a opção **Sob Encomenda** esteja marcada
   (aí o saldo pode ficar negativo, representando itens a encomendar);
2. Grava a venda em `Vendas` e os itens em `Itens_Venda`;
3. Dá a **baixa automática** na coluna `Quantidade_Atual` de `Produtos`;
4. Lança a **Entrada** em `Fluxo_Caixa` herdando o valor total e a forma de
   pagamento, vinculada pela coluna `ID_Venda`;
5. Devolve o **recibo em HTML** com dados da loja, cliente, itens, termo de
   garantia e assinaturas — com botão de impressão (Ctrl+P → salvar em PDF).

Como o Sheets não tem transações de banco de dados, **todas as validações
acontecem antes de qualquer escrita** — na prática, ou a venda inteira entra,
ou nada entra.

Vendas com produto de **outlet/mostruário** (garantia "Sem garantia / No
estado") recebem automaticamente o aviso legal nas observações:
*"Peças vendidas no estado em que se encontram, sem troca e sem garantia."*

Despesas (fornecedor, custos fixos, pró-labore) são lançadas pelo menu
**💰 Lançamento manual no caixa**.

## 🏪 Personalização

Edite a constante `DADOS_LOJA` no topo de `Codigo.gs` com o nome, CNPJ,
endereço e telefone reais da loja — eles aparecem no cabeçalho do recibo.
