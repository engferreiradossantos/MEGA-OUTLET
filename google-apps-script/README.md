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

| Tela | Quem acessa | O que faz |
|---|---|---|
| 📊 Dashboard | Todos | Faturamento do dia/mês, saldo do caixa (só admin), alerta de reposição, últimas vendas |
| 🛒 Vendas (PDV) | Todos | Busca de produto, carrinho, cliente (cadastrado ou avulso), finalizar venda, recibo/pedido com impressão e **PDF** |
| 📄 Orçamentos | Todos | Monta orçamento (sem baixar estoque), imprime/baixa **PDF**, converte em venda ou cancela |
| 🤝 Clientes | Todos | Cadastro e edição de clientes (nome, CPF, telefone, e-mail, endereço) |
| 📦 Estoque | Todos (gestão só admin) | Consulta; cadastro de produto e entrada de mercadoria são do Administrador |
| 💰 Fluxo de Caixa | Administrador | Lançamentos manuais e extrato com filtro por período |
| 📈 Relatórios | Administrador | Vendas (por pagamento, vendedor, top produtos), caixa por categoria, posição de estoque — com **PDF** |
| 👤 Usuários | Administrador | Cadastro, redefinição de senha e ativação/desativação |

## 🗂️ Abas criadas na planilha

| Aba | Conteúdo |
|---|---|
| `Produtos` | ID, SKU, Descrição, Categoria, Quantidade_Atual, Quantidade_Minima, Preços, Status_Garantia |
| `Vendas` + `Itens_Venda` | Pedidos confirmados (com vendedor) e seus itens |
| `Orcamentos` + `Itens_Orcamento` | Orçamentos com status (Aberto/Convertido/Cancelado) e vínculo com a venda gerada |
| `Clientes` | Cadastro de clientes |
| `Fluxo_Caixa` | Entradas/Saídas com forma de pagamento, venda vinculada e usuário |
| `Usuarios` | Login, perfil e hash de senha (aba oculta; gestão pela tela 👤) |
| `Dashboard` | Indicadores por fórmulas, para consulta rápida dentro da própria planilha |

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

## 🏪 Personalização

Edite a constante `DADOS_LOJA` no topo de `Codigo.gs` com nome, CNPJ,
endereço e telefone reais — eles saem no cabeçalho do recibo, do orçamento e
do relatório.
