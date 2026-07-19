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
  DASHBOARD: 'Dashboard',     // requisito 4 — indicadores
};

// Cabeçalhos de cada aba — a ORDEM define as colunas usadas pelo código
const CABECALHOS = {
  [ABAS.PRODUTOS]: ['ID_Produto', 'SKU', 'Descricao', 'Categoria',
                    'Quantidade_Atual', 'Quantidade_Minima',
                    'Preco_Custo', 'Preco_Venda', 'Status_Garantia'],
  [ABAS.VENDAS]:   ['ID_Venda', 'Data_Venda', 'Cliente_Nome', 'Cliente_CPF',
                    'Cliente_Telefone', 'Forma_Entrega', 'Endereco_Entrega',
                    'Valor_Total', 'Observacoes'],
  [ABAS.ITENS]:    ['ID_Item', 'ID_Venda', 'ID_Produto', 'Quantidade',
                    'Preco_Unitario_Aplicado'],
  [ABAS.CAIXA]:    ['ID_Lancamento', 'Data_Hora', 'Tipo', 'Categoria',
                    'Valor', 'Forma_Pagamento', 'ID_Venda'],
};

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

// Aviso legal anexado automaticamente quando a venda contém produto de
// mostruário/outlet (regra 3.1 — "Status Especial")
const AVISO_LEGAL_OUTLET =
  'Peças vendidas no estado em que se encontram, sem troca e sem garantia.';

// Dados exibidos no cabeçalho do recibo (requisito 4)
const DADOS_LOJA = {
  nome: 'MEGA OUTLET — Móveis e Eletroeletrônicos',
  cnpj: '00.000.000/0000-00',            // TODO: preencher com o CNPJ real
  endereco: 'Rua Exemplo, 123 — Centro — Cidade/UF',
  telefone: '(00) 00000-0000',
};

// ---------------------------------------------------------------------------
// Menu da planilha
// ---------------------------------------------------------------------------

/** Cria o menu "🏬 MEGA OUTLET" ao abrir a planilha. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏬 MEGA OUTLET')
    .addItem('🛒 Abrir PDV (Frente de Caixa)', 'abrirPdv')
    .addItem('💰 Lançamento manual no caixa', 'abrirLancamentoManual')
    .addItem('🖨️ Reimprimir recibo…', 'reimprimirRecibo')
    .addSeparator()
    .addItem('⚙️ Configurar planilha (criar abas)', 'configurarPlanilha')
    .addItem('📦 Inserir produtos de demonstração', 'inserirProdutosDemo')
    .addToUi();
}

/** Abre a tela de PDV (requisito 4) em uma janela modal. */
function abrirPdv() {
  const html = HtmlService.createHtmlOutputFromFile('PDV')
    .setWidth(1050)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, '🛒 PDV — Frente de Caixa');
}

/** Abre o formulário de lançamento manual no caixa (regra 3.2 — Conciliação). */
function abrirLancamentoManual() {
  const html = HtmlService.createHtmlOutputFromFile('Lancamento')
    .setWidth(420)
    .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, '💰 Lançamento manual no caixa');
}

/** Pergunta o número da venda e exibe o recibo para impressão (requisito 4). */
function reimprimirRecibo() {
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.prompt('Reimprimir recibo',
                             'Informe o número da venda (ID_Venda):',
                             ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  const idVenda = parseInt(resposta.getResponseText(), 10);
  if (!idVenda) {
    ui.alert('Número de venda inválido.');
    return;
  }
  const recibo = gerarReciboHtml(idVenda); // definida em Vendas.gs
  const html = HtmlService.createHtmlOutput(
      recibo +
      '<div style="text-align:center;margin-top:12px">' +
      '<button onclick="window.print()" style="padding:8px 24px">🖨️ Imprimir</button>' +
      '</div>')
    .setWidth(760)
    .setHeight(680);
  ui.showModalDialog(html, 'Recibo da venda Nº ' + idVenda);
}

// ---------------------------------------------------------------------------
// Configuração da planilha (idempotente — pode rodar quantas vezes quiser)
// ---------------------------------------------------------------------------

/**
 * Cria as 4 abas de dados + Dashboard, com cabeçalhos, validações de dados
 * (listas suspensas), formatos de número e fórmulas dos indicadores.
 */
function configurarPlanilha() {
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

  // ----- Validações de dados (listas suspensas dos enums) -----------------
  aplicarListaSuspensa_(abaProdutos.getRange('D2:D'), CATEGORIAS_PRODUTO, false);
  aplicarListaSuspensa_(abaProdutos.getRange('I2:I'), STATUS_GARANTIA, false);
  aplicarListaSuspensa_(abaVendas.getRange('F2:F'), FORMAS_ENTREGA, false);
  aplicarListaSuspensa_(abaCaixa.getRange('C2:C'), TIPOS_LANCAMENTO, false);
  aplicarListaSuspensa_(abaCaixa.getRange('D2:D'), CATEGORIAS_CAIXA, true);
  aplicarListaSuspensa_(abaCaixa.getRange('F2:F'), FORMAS_PAGAMENTO, false);

  // ----- Formatos de número (moeda e datas) -------------------------------
  abaProdutos.getRange('G2:H').setNumberFormat('"R$" #,##0.00');
  abaVendas.getRange('B2:B').setNumberFormat('dd/mm/yyyy');
  abaVendas.getRange('H2:H').setNumberFormat('"R$" #,##0.00');
  abaCaixa.getRange('B2:B').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  abaCaixa.getRange('E2:E').setNumberFormat('"R$" #,##0.00');

  // ----- Dashboard (requisito 4) ------------------------------------------
  const dash = obterOuCriarAba_(planilha, ABAS.DASHBOARD);
  dash.getRange('A1').setValue('📊 DASHBOARD — MEGA OUTLET')
    .setFontWeight('bold').setFontSize(14);

  dash.getRange('A3').setValue('Faturamento de hoje');
  dash.getRange('B3').setFormula('=SUMIFS(Vendas!H2:H, Vendas!B2:B, TODAY())');

  dash.getRange('A4').setValue('Faturamento do mês');
  dash.getRange('B4').setFormula(
    '=SUMPRODUCT((TEXT(Vendas!B2:B,"yyyy-mm")=TEXT(TODAY(),"yyyy-mm"))*Vendas!H2:H)');

  dash.getRange('A5').setValue('Saldo atual do caixa');
  dash.getRange('B5').setFormula(
    '=SUMIF(Fluxo_Caixa!C2:C,"Entrada",Fluxo_Caixa!E2:E)' +
    '-SUMIF(Fluxo_Caixa!C2:C,"Saída",Fluxo_Caixa!E2:E)');

  dash.getRange('A3:A5').setFontWeight('bold');
  dash.getRange('B3:B5').setNumberFormat('"R$" #,##0.00');

  dash.getRange('A7').setValue('⚠️ Produtos com estoque igual ou abaixo do mínimo')
    .setFontWeight('bold');
  dash.getRange('A8:D8')
    .setValues([['SKU', 'Descrição', 'Estoque atual', 'Mínimo']])
    .setFontWeight('bold').setBackground('#fce8e6');
  dash.getRange('A9').setFormula(
    '=IFERROR(FILTER({Produtos!B2:C, Produtos!E2:F},' +
    ' Produtos!E2:E<=Produtos!F2:F, Produtos!B2:B<>""),' +
    ' "✅ Nenhum produto abaixo do mínimo")');

  SpreadsheetApp.getUi().alert(
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
