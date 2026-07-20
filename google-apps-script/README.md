# 🏬 MEGA OUTLET — Versão Google Sheets (Apps Script)

Sistema de gestão completo, estilo ERP, rodando sobre uma planilha do Google
Sheets: **layout moderno com menu lateral** e telas de Dashboard, Vendas
(PDV), Orçamentos, Clientes, Estoque, Fluxo de Caixa, Relatórios e Usuários —
com **login/senha por perfil** e **PDF** do pedido/recibo, do orçamento e do
relatório gerencial.

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
   | `Clientes.gs` | Script | `Clientes.gs` |
   | `Orcamentos.gs` | Script | `Orcamentos.gs` |
   | `Relatorios.gs` | Script | `Relatorios.gs` |
   | `App` | HTML | `App.html` |

   > 🔁 **Atualizando de uma versão anterior?** Recole **todos** os arquivos
   > e rode de novo **⚙️ Configurar planilha** — isso cria a nova aba
   > `Parcelas` e as colunas `Forma_Pagamento`/`Num_Parcelas` na aba `Vendas`.
   > Vendas antigas continuam funcionando (contam como pagas à vista).

   > ⚠️ O arquivo HTML deve se chamar exatamente **App** (o editor acrescenta
   > o `.html` sozinho). Lembre-se: o Apps Script **não permite dois arquivos
   > com o mesmo nome**, mesmo de tipos diferentes.

4. Salve tudo (💾 ou `Ctrl+S`) e **recarregue a aba da planilha** no navegador.
5. No menu **🏬 MEGA OUTLET**, clique em **⚙️ Configurar planilha** — na
   primeira execução o Google pedirá autorização (fluxo normal:
   *Permitir* → escolher sua conta).
6. Clique em **🚀 Abrir sistema**: como ainda não há usuários, aparece a tela
   de **primeiro acesso** para criar a conta do **Administrador**.
7. (Opcional) **📦 Inserir produtos de demonstração** para testar.
8. Faça login e use o sistema pelo menu lateral. 🎉

> 💡 Quem usa [clasp](https://github.com/google/clasp) pode simplesmente fazer
> `clasp push` a partir desta pasta (o `appsscript.json` já está incluído).

## 🖥️ Telas (menu lateral)

Após o login, o sistema abre direto na tela **Vendas (PDV)**.

| Tela | Quem acessa | O que faz |
|---|---|---|
| 🛒 Vendas (PDV) | Todos | Busca de produto, carrinho, cliente (cadastrado ou avulso), **parcelamento no cartão**, finalizar venda, recibo/pedido com impressão e **PDF** |
| 📊 Dashboard | Todos | Cartões (total vendido, recebido, entradas, saídas, lucro bruto, custo do estoque, a receber, saldo), **gráfico mensal de entradas × saídas**, produtos mais vendidos e alerta de reposição — com seletor de ano. Financeiro só para admin |
| 📄 Orçamentos | Todos | Monta orçamento (sem baixar estoque), imprime/baixa **PDF**, converte em venda ou cancela |
| 🤝 Clientes | Todos | Cadastro e edição de clientes (nome, CPF, telefone, e-mail, endereço) |
| 📦 Estoque | Todos (gestão só admin) | Consulta; **cadastrar, editar e excluir** produto e entrada de mercadoria são do Administrador |
| 💰 Fluxo de Caixa | Administrador | Lançamentos manuais e extrato com filtro por período |
| 📥 Recebíveis | Administrador | Parcelas de vendas no cartão (contas a receber); ao **receber** uma parcela, o valor entra no caixa |
| 📈 Relatórios | Administrador | Vendas (por pagamento, vendedor, top produtos), caixa por categoria, posição de estoque — com **PDF** |
| 👤 Usuários | Administrador | Cadastro, redefinição de senha e ativação/desativação |

### Pagamento à vista x parcelado

No PDV, ao escolher **Cartão de Crédito** aparece o campo de **parcelas** (1x
a 12x). À vista (PIX, Dinheiro, Débito ou crédito 1x), o dinheiro entra no
caixa na hora. Parcelado (2x+), as parcelas viram **contas a receber** (tela
📥 Recebíveis) com vencimento mensal e só entram no caixa quando você marca
cada uma como recebida — por isso o Dashboard separa **Total vendido** de
**Total recebido**.

## 🗂️ Abas criadas na planilha

| Aba | Conteúdo |
|---|---|
| `Produtos` | ID, SKU, Descrição, Categoria, Quantidade_Atual, Quantidade_Minima, Preços, Status_Garantia |
| `Vendas` + `Itens_Venda` | Pedidos confirmados (com vendedor) e seus itens |
| `Orcamentos` + `Itens_Orcamento` | Orçamentos com status (Aberto/Convertido/Cancelado) e vínculo com a venda gerada |
| `Clientes` | Cadastro de clientes |
| `Parcelas` | Contas a receber (parcelas de vendas no cartão): vencimento, valor, status e recebimento |
| `Fluxo_Caixa` | Entradas/Saídas com forma de pagamento, venda vinculada e usuário |
| `Usuarios` | Login, perfil e hash de senha (aba oculta; gestão pela tela 👤) |

> O **Dashboard e os relatórios não são abas** da planilha — ficam apenas
> dentro do sistema (telas 📊 e 📈 do App), calculados ao vivo a cada acesso.

## ⚙️ Regras de negócio

A função central continua sendo **`registrarVenda`** (`Vendas.gs`), sob
bloqueio exclusivo (`LockService`): valida saldo de estoque (com opção
**Sob Encomenda**), grava venda + itens, dá **baixa automática** no estoque,
lança a **Entrada** no `Fluxo_Caixa` herdando valor e forma de pagamento, e
anexa o **aviso legal** de peças outlet/mostruário. **Orçamentos não baixam
estoque nem mexem no caixa** — só quando convertidos em venda (aí passam
pela `registrarVenda` normal).

Os PDFs (pedido/recibo, orçamento e relatório) são gerados no servidor pelo
conversor nativo do Apps Script (HTML → PDF) e baixados direto pelo navegador.

## 👤 Login, perfis e segurança

- Senhas guardadas apenas como **hash com salt** (SHA-256 iterado); login
  gera token de sessão (CacheService, até 6 h) validado em toda chamada;
- **Administrador**: tudo. **Vendedor**: PDV, orçamentos, clientes, recibos e
  consulta de estoque;
- Cada venda, orçamento e lançamento registra **quem** o fez; o documento
  impresso mostra "Atendido por"/"Vendedor";
- O "primeiro acesso" trava após existir o primeiro usuário; o último
  administrador ativo não pode ser desativado.

> 🔒 **Limite do Google Sheets**: quem tem acesso de *edição* à planilha vê
> as abas diretamente. O login controla o uso do **sistema**; para proteger
> os **dados**, compartilhe a planilha apenas com o dono/administrador e dê
> aos vendedores somente a URL do App da Web.

## 🌐 Usar fora da planilha (App da Web — recomendado para vendedores)

1. No editor do Apps Script: **Implantar → Nova implantação → App da Web**;
2. **Executar como:** Eu (sua conta) | **Quem pode acessar:** restrinja às
   pessoas da loja;
3. Compartilhe a URL gerada (termina em `/exec`) — ela abre o sistema
   completo, com login, sem precisar abrir a planilha.

> Se aparecer **"Função de script não encontrada: doGet"**, a implantação
> aponta para uma versão antiga do código — edite a implantação e selecione
> a nova versão (ou crie uma nova implantação).

## 🩺 "A função X não está no projeto" / "indisponível"

Essa mensagem significa que **algum arquivo `.gs` não foi colado (ou está
desatualizado)** no editor do Apps Script — o sistema chama uma função que
ainda não existe no seu projeto. Ao fazer login, o sistema já verifica tudo
de uma vez e lista **exatamente quais arquivos recolar**. Para resolver:

1. No editor do Apps Script, abra o arquivo indicado (ex.: `Produtos.gs`) e
   **substitua todo o conteúdo** pela versão desta pasta;
2. **Salve** (Ctrl+S) e **recarregue** o sistema;
3. Se você usa o sistema pela **URL do App da Web**, crie uma **NOVA
   implantação** depois de colar (a URL antiga continua na versão anterior).

Confira sempre se os **8 arquivos `.gs`** (Codigo, Produtos, Vendas, Caixa,
Usuarios, Clientes, Orcamentos, Relatorios) e o **App.html** estão todos na
versão atual.

## 🏪 Personalização

Edite a constante `DADOS_LOJA` no topo de `Codigo.gs` com nome, CNPJ,
endereço e telefone reais — eles saem no cabeçalho do recibo, do orçamento e
do relatório.
