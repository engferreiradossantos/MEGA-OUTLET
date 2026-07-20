/**
 * MEGA OUTLET — Módulo de Produtos / Estoque (requisito 2.1).
 *
 * Colunas da aba Produtos (índices 0-based usados abaixo):
 *   0 ID_Produto | 1 SKU | 2 Descricao | 3 Categoria | 4 Quantidade_Atual
 *   5 Quantidade_Minima | 6 Preco_Custo | 7 Preco_Venda | 8 Status_Garantia
 */

// Índices das colunas (evita "números mágicos" espalhados pelo código)
const COL_PROD = {
  ID: 0, SKU: 1, DESCRICAO: 2, CATEGORIA: 3, QTD_ATUAL: 4,
  QTD_MINIMA: 5, PRECO_CUSTO: 6, PRECO_VENDA: 7, GARANTIA: 8,
};

/**
 * Busca do PDV (requisito 4): localiza produtos por SKU ou parte da
 * descrição, sem diferenciar maiúsculas. Chamada pelo PDV.html via
 * google.script.run — devolve no máximo 30 resultados.
 * Exige sessão válida (o catálogo não fica exposto a quem não logou).
 */
function buscarProdutos(termo, token) {
  validarSessao_(token, PERFIS_USUARIO);
  termo = String(termo || '').trim().toLowerCase();
  if (!termo) return [];

  return lerProdutos_()
    .filter(function (p) {
      return p.sku.toLowerCase().indexOf(termo) !== -1 ||
             p.descricao.toLowerCase().indexOf(termo) !== -1;
    })
    .slice(0, 30);
}

/**
 * Lê todos os produtos da aba e devolve objetos simples, guardando também a
 * linha da planilha (`linha`) para a baixa de estoque em Vendas.gs.
 */
function lerProdutos_() {
  const aba = obterAba_(ABAS.PRODUTOS);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  const dados = aba.getRange(2, 1, ultimaLinha - 1, 9).getValues();
  const produtos = [];
  dados.forEach(function (v, indice) {
    if (v[COL_PROD.ID] === '') return; // ignora linhas vazias
    produtos.push({
      idProduto: Number(v[COL_PROD.ID]),
      sku: String(v[COL_PROD.SKU]),
      descricao: String(v[COL_PROD.DESCRICAO]),
      categoria: String(v[COL_PROD.CATEGORIA]),
      quantidadeAtual: Number(v[COL_PROD.QTD_ATUAL]) || 0,
      quantidadeMinima: Number(v[COL_PROD.QTD_MINIMA]) || 0,
      precoCusto: Number(v[COL_PROD.PRECO_CUSTO]) || 0,
      precoVenda: Number(v[COL_PROD.PRECO_VENDA]) || 0,
      statusGarantia: String(v[COL_PROD.GARANTIA]),
      linha: indice + 2, // linha real na planilha (1-based + cabeçalho)
    });
  });
  return produtos;
}

/** Devolve um mapa {idProduto -> produto} para consultas rápidas. */
function mapaProdutosPorId_() {
  const mapa = {};
  lerProdutos_().forEach(function (p) { mapa[p.idProduto] = p; });
  return mapa;
}

/**
 * Identifica produto de mostruário/outlet pelo status de garantia
 * (regra 3.1 — "Status Especial"). Ex.: "Sem garantia / No estado".
 */
function produtoEhOutlet_(statusGarantia) {
  const status = String(statusGarantia || '').trim().toLowerCase();
  return status.indexOf('no estado') !== -1 ||
         status.indexOf('sem garantia') !== -1;
}

/** Lista todo o cadastro de produtos (qualquer perfil logado). */
function listarProdutos(token) {
  validarSessao_(token, PERFIS_USUARIO);
  return lerProdutos_().map(function (p) {
    return { idProduto: p.idProduto, sku: p.sku, descricao: p.descricao,
             categoria: p.categoria, quantidadeAtual: p.quantidadeAtual,
             quantidadeMinima: p.quantidadeMinima, precoCusto: p.precoCusto,
             precoVenda: p.precoVenda, statusGarantia: p.statusGarantia };
  });
}

/** Cadastra um produto (exclusivo do Administrador). Devolve {idProduto}. */
function cadastrarProduto(token, dados) {
  validarSessao_(token, ['Administrador']);
  const sku = String(dados.sku || '').trim();
  const descricao = String(dados.descricao || '').trim();
  if (!sku || !descricao) throw new Error('SKU e descrição são obrigatórios.');
  if (CATEGORIAS_PRODUTO.indexOf(dados.categoria) === -1) {
    throw new Error('Categoria inválida: ' + dados.categoria);
  }
  if (STATUS_GARANTIA.indexOf(dados.statusGarantia) === -1) {
    throw new Error('Status de garantia inválido: ' + dados.statusGarantia);
  }
  const quantidade = Math.max(0, parseInt(dados.quantidadeAtual, 10) || 0);
  const minimo = Math.max(0, parseInt(dados.quantidadeMinima, 10) || 0);
  const custo = Math.max(0, Number(dados.precoCusto) || 0);
  const venda = Math.max(0, Number(dados.precoVenda) || 0);

  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const jaExiste = lerProdutos_().some(function (p) { return p.sku === sku; });
    if (jaExiste) throw new Error('Já existe um produto com o SKU "' + sku + '".');

    const aba = obterAba_(ABAS.PRODUTOS);
    const id = proximoId_(aba);
    aba.appendRow([id, sku, descricao, dados.categoria, quantidade, minimo,
                   Math.round(custo * 100) / 100, Math.round(venda * 100) / 100,
                   dados.statusGarantia]);
    SpreadsheetApp.flush();
    return { idProduto: id };
  } finally {
    bloqueio.releaseLock();
  }
}

/**
 * Entrada de mercadoria: soma `quantidade` ao saldo do produto
 * (exclusivo do Administrador). Devolve {novoSaldo}.
 */
function reporEstoque(token, idProduto, quantidade) {
  validarSessao_(token, ['Administrador']);
  quantidade = parseInt(quantidade, 10);
  if (!quantidade || quantidade <= 0) {
    throw new Error('A quantidade de reposição deve ser maior que zero.');
  }
  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const produto = lerProdutos_().filter(function (p) {
      return p.idProduto === Number(idProduto);
    })[0];
    if (!produto) throw new Error('Produto ' + idProduto + ' não encontrado.');
    const novoSaldo = produto.quantidadeAtual + quantidade;
    obterAba_(ABAS.PRODUTOS)
      .getRange(produto.linha, COL_PROD.QTD_ATUAL + 1).setValue(novoSaldo);
    SpreadsheetApp.flush();
    return { novoSaldo: novoSaldo };
  } finally {
    bloqueio.releaseLock();
  }
}

/**
 * Insere produtos de demonstração (menu 🏬 MEGA OUTLET).
 * Idempotente: SKUs já cadastrados são ignorados. Função de MENU: o
 * getUi() na primeira linha impede execução via App da Web sem login.
 */
function inserirProdutosDemo() {
  const ui = SpreadsheetApp.getUi();
  const demo = [
    // [SKU, Descricao, Categoria, Qtd, QtdMin, Custo, Venda, Garantia]
    ['SOF-001', 'Sofá Retrátil e Reclinável em linho molas ensac 2.14M',
     'Móveis', 4, 1, 1450.00, 2799.00, '1 ano'],
    ['SOF-002', 'Sofá 3 lugares suede cinza (mostruário)',
     'Móveis', 1, 0, 800.00, 1399.00, 'Sem garantia / No estado'],
    ['RAC-010', 'Rack para TV até 65" com painel ripado',
     'Móveis', 6, 2, 380.00, 749.00, '90 dias'],
    ['GEL-101', 'Geladeira Frost Free 410L Inox',
     'Eletrônicos', 3, 1, 2100.00, 3299.00, '1 ano'],
    ['TVL-205', 'Smart TV 55" 4K',
     'Eletrônicos', 5, 2, 1650.00, 2499.00, '1 ano'],
    ['MIC-330', 'Micro-ondas 32L espelhado (outlet)',
     'Eletrônicos', 2, 1, 320.00, 549.00, 'Sem garantia / No estado'],
    ['ACE-501', 'Suporte de parede para TV 32-75"',
     'Acessórios', 15, 5, 25.00, 89.90, '90 dias'],
    ['ACE-502', 'Filtro de linha 6 tomadas',
     'Acessórios', 20, 8, 12.00, 39.90, '90 dias'],
  ];

  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const aba = obterAba_(ABAS.PRODUTOS);
    const skusExistentes = {};
    lerProdutos_().forEach(function (p) { skusExistentes[p.sku] = true; });

    let id = proximoId_(aba);
    const novasLinhas = demo
      .filter(function (p) { return !skusExistentes[p[0]]; })
      .map(function (p) { return [id++].concat(p); });

    if (novasLinhas.length) {
      aba.getRange(aba.getLastRow() + 1, 1, novasLinhas.length, 9)
        .setValues(novasLinhas);
    }
    SpreadsheetApp.getUi().alert(
      novasLinhas.length + ' produto(s) de demonstração inserido(s).');
  } finally {
    bloqueio.releaseLock();
  }
}
