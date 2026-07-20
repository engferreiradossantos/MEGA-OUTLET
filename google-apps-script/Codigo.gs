/**
 * MEGA OUTLET — Sistema de Gestão (Google Apps Script + Google Sheets)
 *
 * ARQUIVO PRINCIPAL: constantes de domínio, menu e configuração da planilha.
 *
 * Como todos os arquivos .gs compartilham o mesmo escopo global, as
 * constantes definidas aqui são visíveis em Produtos.gs, Vendas.gs e Caixa.gs.
 *
 * INSTALAÇÃO: veja o README.md — em resumo: Extensões → Apps Script, crie os
 * arquivos (Codigo.gs, Produtos.gs, Vendas.gs, Caixa.gs, PDV.html,
 * Lancamento.html), cole o conteúdo, salve, recarregue a planilha e use o
 * menu "🏬 MEGA OUTLET" → "⚙️ Configurar planilha".
 */

// ---------------------------------------------------------------------------
// Nomes das abas (tabelas do requisito 2)
// ---------------------------------------------------------------------------
const ABAS = {
  PRODUTOS: 'Produtos',       // 2.1 Cadastro de Produtos (Estoque)
  VENDAS: 'Vendas',           // 2.3 Vendas e Pedidos
  ITENS: 'Itens_Venda',       // 2.4 Itens da Venda (tabela relacional)
  CAIXA: 'Fluxo_Caixa',       // 2.2 Fluxo de Caixa
  CLIENTES: 'Clientes',       // cadastro de clientes
  ORCAMENTOS: 'Orcamentos',   // orçamentos/pedidos (não baixam estoque)
  ITENS_ORC: 'Itens_Orcamento',
  PARCELAS: 'Parcelas',       // contas a receber (parcelas de vendas no cartão)
  USUARIOS: 'Usuarios',       // usuários do sistema (login, senha, perfil)
};
// Observação: o Dashboard NÃO é uma aba da planilha — ele existe apenas
// dentro do sistema (tela 📊 Dashboard do App.html), calculado ao vivo.

// Cabeçalhos de cada aba — a ORDEM define as colunas usadas pelo código
const CABECALHOS = {
  [ABAS.PRODUTOS]: ['ID_Produto', 'SKU', 'Descricao', 'Categoria',
                    'Quantidade_Atual', 'Quantidade_Minima',
                    'Preco_Custo', 'Preco_Venda', 'Status_Garantia'],
  [ABAS.VENDAS]:   ['ID_Venda', 'Data_Venda', 'Cliente_Nome', 'Cliente_CPF',
                    'Cliente_Telefone', 'Forma_Entrega', 'Endereco_Entrega',
                    'Valor_Total', 'Observacoes', 'ID_Usuario',
                    'Forma_Pagamento', 'Num_Parcelas'],
  [ABAS.ITENS]:    ['ID_Item', 'ID_Venda', 'ID_Produto', 'Quantidade',
                    'Preco_Unitario_Aplicado'],
  [ABAS.CAIXA]:    ['ID_Lancamento', 'Data_Hora', 'Tipo', 'Categoria',
                    'Valor', 'Forma_Pagamento', 'ID_Venda', 'ID_Usuario'],
  [ABAS.CLIENTES]: ['ID_Cliente', 'Nome', 'CPF', 'Telefone', 'Email',
                    'Endereco', 'Observacoes'],
  [ABAS.ORCAMENTOS]: ['ID_Orcamento', 'Data', 'Validade_Dias',
                      'Cliente_Nome', 'Cliente_CPF', 'Cliente_Telefone',
                      'Forma_Entrega', 'Endereco_Entrega', 'Valor_Total',
                      'Observacoes', 'Status', 'ID_Usuario', 'ID_Venda'],
  [ABAS.ITENS_ORC]: ['ID_Item', 'ID_Orcamento', 'ID_Produto', 'Quantidade',
                     'Preco_Unitario'],
  [ABAS.PARCELAS]: ['ID_Parcela', 'ID_Venda', 'Numero', 'Total_Parcelas',
                    'Vencimento', 'Valor', 'Status', 'Data_Recebimento',
                    'Forma_Pagamento'],
  [ABAS.USUARIOS]: ['ID_Usuario', 'Login', 'Nome', 'Perfil', 'Ativo',
                    'Salt', 'Senha_Hash'],
};

// Situações possíveis de uma parcela (conta a receber)
const STATUS_PARCELA = ['Pendente', 'Recebida', 'Cancelada'];

// Situações possíveis de um orçamento
const STATUS_ORCAMENTO = ['Aberto', 'Convertido', 'Cancelado'];

// ---------------------------------------------------------------------------
// Enums de domínio (requisito 2)
// ---------------------------------------------------------------------------
const CATEGORIAS_PRODUTO = ['Móveis', 'Eletrônicos', 'Acessórios'];
const STATUS_GARANTIA = ['Sem garantia / No estado', '90 dias', '1 ano'];
const FORMAS_PAGAMENTO = ['PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'];
const FORMAS_ENTREGA = ['Retira', 'Entrega Própria', 'Transportadora'];
const TIPOS_LANCAMENTO = ['Entrada', 'Saída'];
const CATEGORIAS_CAIXA = ['Venda de Mercadoria', 'Pagamento de Fornecedor',
                          'Custos Fixos', 'Pro Labore'];
// Categoria usada automaticamente na Entrada gerada por uma venda (regra 3.2)
const CATEGORIA_CAIXA_VENDA = 'Venda de Mercadoria';

// Perfis de acesso do sistema:
//   Administrador — acesso total (usuários, lançamentos manuais, tudo do PDV)
//   Vendedor      — PDV e recibos
const PERFIS_USUARIO = ['Administrador', 'Vendedor'];

// Aviso legal anexado automaticamente quando a venda contém produto de
// mostruário/outlet (regra 3.1 — "Status Especial")
const AVISO_LEGAL_OUTLET =
  'Peças vendidas no estado em que se encontram, sem troca e sem garantia.';

// Dados exibidos no cabeçalho do recibo, orçamento e relatório
const DADOS_LOJA = {
  nome: 'MEGA OUTLET — Móveis e Eletroeletrônicos',
  cnpj: '45.892.255/0001-44',
  endereco: 'Avenida Santana, 889 — Jardim Amanda I — Hortolândia/SP',
  telefone: '(19) 99113-2683',
};

// ---------------------------------------------------------------------------
// App da Web (opcional)
// ---------------------------------------------------------------------------

/**
 * Ponto de entrada quando o projeto é publicado como App da Web
 * (Implantar → Nova implantação → App da Web). Serve o sistema completo
 * (App.html: menu lateral com Dashboard, Vendas, Orçamentos, Clientes,
 * Estoque, Caixa, Relatórios e Usuários) pela URL da implantação.
 *
 * Recomendação ao implantar: "Executar como: Eu" e restrinja "Quem pode
 * acessar" às pessoas da loja — o login/senha do sistema continua sendo
 * exigido em todas as operações de qualquer forma.
 *
 * Usar como App da Web é OPCIONAL: dentro da planilha o mesmo sistema abre
 * pelo menu 🏬 MEGA OUTLET → 🚀 Abrir sistema.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('App')
    .setTitle('MEGA OUTLET — Sistema de Gestão')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------------------
// Geração de PDF (pedido/recibo, orçamento e relatórios)
// ---------------------------------------------------------------------------

/** Envolve um corpo HTML em um documento completo (charset p/ acentos). */
function documentoHtmlCompleto_(corpo, titulo) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
         escaparHtml_(titulo) + '</title></head><body>' + corpo +
         '</body></html>';
}

/**
 * Converte HTML em PDF usando o conversor nativo do Apps Script
 * (Blob HTML → getAs PDF). Devolve o arquivo em base64, pronto para o
 * navegador baixar via data URI.
 */
function converterHtmlEmPdf_(corpoHtml, titulo, nomeArquivo) {
  const pdf = Utilities.newBlob(
      documentoHtmlCompleto_(corpoHtml, titulo), 'text/html', nomeArquivo)
    .getAs('application/pdf')
    .setName(nomeArquivo + '.pdf');
  return {
    base64: Utilities.base64Encode(pdf.getBytes()),
    nomeArquivo: nomeArquivo + '.pdf',
  };
}

// ---------------------------------------------------------------------------
// Menu da planilha
// ---------------------------------------------------------------------------

/** Cria o menu "🏬 MEGA OUTLET" ao abrir a planilha. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏬 MEGA OUTLET')
    .addItem('🚀 Abrir sistema', 'abrirSistema')
    .addSeparator()
    .addItem('⚙️ Configurar planilha (criar abas)', 'configurarPlanilha')
    .addItem('📦 Inserir produtos de demonstração', 'inserirProdutosDemo')
    .addToUi();
}

/**
 * Abre o sistema completo (App.html) em uma janela dentro da planilha.
 * O mesmo aplicativo também pode ser publicado como App da Web (ver doGet).
 */
function abrirSistema() {
  const html = HtmlService.createHtmlOutputFromFile('App')
    .setWidth(1280)
    .setHeight(780);
  SpreadsheetApp.getUi().showModalDialog(html, '🏬 MEGA OUTLET — Sistema de Gestão');
}

// ---------------------------------------------------------------------------
// Configuração da planilha (idempotente — pode rodar quantas vezes quiser)
// ---------------------------------------------------------------------------

/**
 * Cria as abas de dados (Produtos, Vendas, Itens_Venda, Fluxo_Caixa,
 * Clientes, Orcamentos, Itens_Orcamento, Usuarios), com cabeçalhos,
 * validações de dados (listas suspensas) e formatos de número.
 * O Dashboard e os relatórios ficam SÓ no sistema (App.html), calculados
 * ao vivo — não há aba Dashboard na planilha.
 * Função de MENU: o getUi() na primeira linha garante que ela só roda de
 * dentro da planilha (em uma implantação como App da Web, falha de imediato).
 */
function configurarPlanilha() {
  const ui = SpreadsheetApp.getUi();
  const planilha = SpreadsheetApp.getActiveSpreadsheet();

  // ----- Abas de dados, com cabeçalho em negrito e linha congelada --------
  Object.keys(CABECALHOS).forEach(function (nome) {
    const aba = obterOuCriarAba_(planilha, nome);
    const cabecalho = CABECALHOS[nome];
    aba.getRange(1, 1, 1, cabecalho.length)
      .setValues([cabecalho])
      .setFontWeight('bold')
      .setBackground('#efefef');
    aba.setFrozenRows(1);
  });

  const abaProdutos = planilha.getSheetByName(ABAS.PRODUTOS);
  const abaVendas = planilha.getSheetByName(ABAS.VENDAS);
  const abaCaixa = planilha.getSheetByName(ABAS.CAIXA);
  const abaOrcamentos = planilha.getSheetByName(ABAS.ORCAMENTOS);
  const abaParcelas = planilha.getSheetByName(ABAS.PARCELAS);
  const abaUsuarios = planilha.getSheetByName(ABAS.USUARIOS);

  // ----- Validações de dados (listas suspensas dos enums) -----------------
  aplicarListaSuspensa_(abaProdutos.getRange('D2:D'), CATEGORIAS_PRODUTO, false);
  aplicarListaSuspensa_(abaProdutos.getRange('I2:I'), STATUS_GARANTIA, false);
  aplicarListaSuspensa_(abaVendas.getRange('F2:F'), FORMAS_ENTREGA, false);
  aplicarListaSuspensa_(abaCaixa.getRange('C2:C'), TIPOS_LANCAMENTO, false);
  aplicarListaSuspensa_(abaCaixa.getRange('D2:D'), CATEGORIAS_CAIXA, true);
  aplicarListaSuspensa_(abaCaixa.getRange('F2:F'), FORMAS_PAGAMENTO, false);
  aplicarListaSuspensa_(abaOrcamentos.getRange('G2:G'), FORMAS_ENTREGA, false);
  aplicarListaSuspensa_(abaOrcamentos.getRange('K2:K'), STATUS_ORCAMENTO, false);
  aplicarListaSuspensa_(abaParcelas.getRange('G2:G'), STATUS_PARCELA, false);
  aplicarListaSuspensa_(abaParcelas.getRange('I2:I'), FORMAS_PAGAMENTO, false);
  aplicarListaSuspensa_(abaUsuarios.getRange('D2:D'), PERFIS_USUARIO, false);
  aplicarListaSuspensa_(abaUsuarios.getRange('E2:E'), ['Sim', 'Não'], false);

  // A aba de usuários guarda hashes de senha — fica oculta; toda a gestão
  // é feita pela tela 👤 Usuários do sistema (Ver → abas ocultas, se precisar)
  try { abaUsuarios.hideSheet(); } catch (e) { /* única aba visível: ignora */ }

  // ----- Formatos de número (moeda e datas) -------------------------------
  abaProdutos.getRange('G2:H').setNumberFormat('"R$" #,##0.00');
  abaVendas.getRange('B2:B').setNumberFormat('dd/mm/yyyy');
  abaVendas.getRange('H2:H').setNumberFormat('"R$" #,##0.00');
  abaCaixa.getRange('B2:B').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  abaCaixa.getRange('E2:E').setNumberFormat('"R$" #,##0.00');
  abaOrcamentos.getRange('B2:B').setNumberFormat('dd/mm/yyyy');
  abaOrcamentos.getRange('I2:I').setNumberFormat('"R$" #,##0.00');
  abaParcelas.getRange('E2:E').setNumberFormat('dd/mm/yyyy');   // Vencimento
  abaParcelas.getRange('F2:F').setNumberFormat('"R$" #,##0.00'); // Valor
  abaParcelas.getRange('H2:H').setNumberFormat('dd/mm/yyyy');   // Recebimento

  // Remove uma eventual aba "Dashboard" de versões anteriores — o Dashboard
  // agora vive apenas no sistema (tela 📊 do App.html), não na planilha.
  const dashAntigo = planilha.getSheetByName('Dashboard');
  if (dashAntigo && planilha.getSheets().length > 1) {
    planilha.deleteSheet(dashAntigo);
  }

  ui.alert(
    'Planilha configurada! Abas criadas: ' +
    Object.values(ABAS).join(', ') + '.');
}

// ---------------------------------------------------------------------------
// Utilitários compartilhados (sufixo "_" = função privada, invisível ao menu)
// ---------------------------------------------------------------------------

/** Devolve a aba pelo nome, criando-a se não existir. */
function obterOuCriarAba_(planilha, nome) {
  return planilha.getSheetByName(nome) || planilha.insertSheet(nome);
}

/** Devolve a aba pelo nome ou lança erro pedindo a configuração inicial. */
function obterAba_(nome) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!aba) {
    throw new Error('Aba "' + nome + '" não encontrada. Use o menu ' +
                    '🏬 MEGA OUTLET → ⚙️ Configurar planilha.');
  }
  return aba;
}

/** Aplica validação de lista suspensa a um intervalo. */
function aplicarListaSuspensa_(intervalo, valores, permitirOutros) {
  const regra = SpreadsheetApp.newDataValidation()
    .requireValueInList(valores, true)
    .setAllowInvalid(Boolean(permitirOutros))
    .build();
  intervalo.setDataValidation(regra);
}

/**
 * Gera o próximo ID autoincremento de uma aba (maior valor da coluna A + 1).
 * Deve ser chamado DENTRO do bloqueio (LockService) de quem for gravar.
 */
function proximoId_(aba) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return 1;
  const ids = aba.getRange(2, 1, ultimaLinha - 1, 1).getValues()
    .map(function (linha) { return Number(linha[0]); })
    .filter(function (id) { return !isNaN(id) && id > 0; });
  return ids.length ? Math.max.apply(null, ids) + 1 : 1;
}

/** Formata um número como moeda brasileira: R$ 1.234,56 */
function formatarMoeda_(valor) {
  const partes = Number(valor).toFixed(2).split('.');
  const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + inteiro + ',' + partes[1];
}

/** Formata uma data como dd/mm/aaaa no fuso do script. */
function formatarData_(data) {
  return Utilities.formatDate(new Date(data),
                              Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

/** Escapa texto para inserção segura em HTML (recibo). */
function escaparHtml_(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
