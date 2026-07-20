/**
 * MEGA OUTLET — Módulo de Relatórios e Dashboard.
 *
 * `dadosDashboard`  — indicadores da tela inicial (qualquer perfil; o
 *                     saldo do caixa só é incluído para Administrador).
 * `relatorioDados`  — relatório gerencial de um período (só Administrador):
 *                     vendas (totais, por pagamento, por vendedor, top
 *                     produtos), caixa (por categoria) e estoque.
 * `gerarPdfRelatorio` — o mesmo relatório em PDF para arquivar/imprimir.
 */

/** Converte 'YYYY-MM-DD' em Date local à meia-noite. */
function parseDataIso_(texto) {
  const partes = String(texto || '').split('-');
  if (partes.length !== 3) throw new Error('Data inválida: ' + texto);
  return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
}

/** Lê as vendas da aba como objetos. */
function lerVendas_() {
  const aba = obterAba_(ABAS.VENDAS);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  return aba.getRange(2, 1, ultimaLinha - 1, 10).getValues()
    .filter(function (v) { return v[0] !== ''; })
    .map(function (v) {
      return { idVenda: Number(v[0]), data: new Date(v[1]),
               clienteNome: String(v[2]), formaEntrega: String(v[5]),
               valorTotal: Number(v[7]) || 0,
               idUsuario: Number(v[9]) || null };
    });
}

/** Lê os lançamentos do caixa como objetos. */
function lerCaixa_() {
  const aba = obterAba_(ABAS.CAIXA);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  return aba.getRange(2, 1, ultimaLinha - 1, 8).getValues()
    .filter(function (l) { return l[0] !== ''; })
    .map(function (l) {
      return { idLancamento: Number(l[0]), dataHora: new Date(l[1]),
               tipo: String(l[2]), categoria: String(l[3]),
               valor: Number(l[4]) || 0, formaPagamento: String(l[5]),
               idVenda: l[6] === '' ? null : Number(l[6]),
               idUsuario: l[7] === '' ? null : Number(l[7]) };
    });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Indicadores da tela inicial. */
function dadosDashboard(token) {
  const usuario = validarSessao_(token, PERFIS_USUARIO);
  const ehAdmin = usuario.perfil === 'Administrador';

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const vendas = lerVendas_();
  const nomes = mapaNomesUsuarios_();
  let faturamentoHoje = 0, faturamentoMes = 0;
  vendas.forEach(function (v) {
    if (v.data >= inicioMes) faturamentoMes += v.valorTotal;
    if (v.data >= hoje) faturamentoHoje += v.valorTotal;
  });

  let saldoCaixa = null;
  if (ehAdmin) {
    saldoCaixa = 0;
    lerCaixa_().forEach(function (l) {
      saldoCaixa += l.tipo === 'Entrada' ? l.valor : -l.valor;
    });
    saldoCaixa = Math.round(saldoCaixa * 100) / 100;
  }

  const abaixoMinimo = lerProdutos_()
    .filter(function (p) { return p.quantidadeAtual <= p.quantidadeMinima; })
    .map(function (p) {
      return { sku: p.sku, descricao: p.descricao,
               quantidadeAtual: p.quantidadeAtual,
               quantidadeMinima: p.quantidadeMinima };
    });

  const ultimasVendas = vendas
    .sort(function (a, b) { return b.idVenda - a.idVenda; })
    .slice(0, 8)
    .map(function (v) {
      return { idVenda: v.idVenda, data: formatarData_(v.data),
               clienteNome: v.clienteNome, valorTotal: v.valorTotal,
               vendedor: nomes[v.idUsuario] || '—' };
    });

  return {
    ehAdmin: ehAdmin,
    faturamentoHoje: Math.round(faturamentoHoje * 100) / 100,
    faturamentoMes: Math.round(faturamentoMes * 100) / 100,
    saldoCaixa: saldoCaixa,
    abaixoMinimo: abaixoMinimo,
    ultimasVendas: ultimasVendas,
  };
}

// ---------------------------------------------------------------------------
// Relatório gerencial (Administrador)
// ---------------------------------------------------------------------------

/** Dados do relatório gerencial de um período ('YYYY-MM-DD' a 'YYYY-MM-DD'). */
function relatorioDados(token, dataInicio, dataFim) {
  validarSessao_(token, ['Administrador']);
  const inicio = parseDataIso_(dataInicio);
  const fim = parseDataIso_(dataFim);
  fim.setHours(23, 59, 59, 999); // período inclusivo

  const nomes = mapaNomesUsuarios_();

  // ----- Vendas do período -------------------------------------------------
  const vendas = lerVendas_().filter(function (v) {
    return v.data >= inicio && v.data <= fim;
  });
  const idsVendas = {};
  let totalVendas = 0;
  const porVendedor = {};
  vendas.forEach(function (v) {
    idsVendas[v.idVenda] = true;
    totalVendas += v.valorTotal;
    const nome = nomes[v.idUsuario] || '—';
    porVendedor[nome] = (porVendedor[nome] || 0) + v.valorTotal;
  });

  // Forma de pagamento vem da Entrada de caixa vinculada a cada venda
  const caixa = lerCaixa_();
  const porPagamento = {};
  caixa.forEach(function (l) {
    if (l.tipo === 'Entrada' && l.idVenda && idsVendas[l.idVenda]) {
      porPagamento[l.formaPagamento] =
        (porPagamento[l.formaPagamento] || 0) + l.valor;
    }
  });

  // Produtos mais vendidos no período (soma de quantidades)
  const abaItens = obterAba_(ABAS.ITENS);
  const produtos = mapaProdutosPorId_();
  const porProduto = {};
  if (abaItens.getLastRow() >= 2) {
    abaItens.getRange(2, 1, abaItens.getLastRow() - 1, 5).getValues()
      .forEach(function (i) {
        if (!idsVendas[Number(i[1])]) return;
        const produto = produtos[Number(i[2])];
        const chave = produto
          ? produto.sku + ' — ' + produto.descricao : 'Produto removido';
        if (!porProduto[chave]) porProduto[chave] = { quantidade: 0, valor: 0 };
        porProduto[chave].quantidade += Number(i[3]);
        porProduto[chave].valor += Number(i[3]) * Number(i[4]);
      });
  }
  const topProdutos = Object.keys(porProduto).map(function (chave) {
    return { produto: chave, quantidade: porProduto[chave].quantidade,
             valor: Math.round(porProduto[chave].valor * 100) / 100 };
  }).sort(function (a, b) { return b.quantidade - a.quantidade; }).slice(0, 10);

  // ----- Caixa do período --------------------------------------------------
  let totalEntradas = 0, totalSaidas = 0;
  const porCategoria = {};
  caixa.forEach(function (l) {
    if (l.dataHora < inicio || l.dataHora > fim) return;
    if (l.tipo === 'Entrada') totalEntradas += l.valor;
    else totalSaidas += l.valor;
    const chave = l.tipo + ' — ' + l.categoria;
    porCategoria[chave] = (porCategoria[chave] || 0) + l.valor;
  });

  // ----- Estoque (fotografia atual) ---------------------------------------
  let valorCusto = 0, valorVenda = 0, itensEstoque = 0;
  const abaixoMinimo = [];
  lerProdutos_().forEach(function (p) {
    const quantidade = Math.max(0, p.quantidadeAtual);
    itensEstoque += quantidade;
    valorCusto += quantidade * p.precoCusto;
    valorVenda += quantidade * p.precoVenda;
    if (p.quantidadeAtual <= p.quantidadeMinima) {
      abaixoMinimo.push({ sku: p.sku, descricao: p.descricao,
                          quantidadeAtual: p.quantidadeAtual,
                          quantidadeMinima: p.quantidadeMinima });
    }
  });

  const arred = function (n) { return Math.round(n * 100) / 100; };
  return {
    periodo: { inicio: formatarData_(inicio), fim: formatarData_(fim) },
    vendas: {
      quantidade: vendas.length,
      total: arred(totalVendas),
      ticketMedio: vendas.length ? arred(totalVendas / vendas.length) : 0,
      porPagamento: Object.keys(porPagamento).map(function (chave) {
        return { forma: chave, valor: arred(porPagamento[chave]) };
      }),
      porVendedor: Object.keys(porVendedor).map(function (chave) {
        return { vendedor: chave, valor: arred(porVendedor[chave]) };
      }),
      topProdutos: topProdutos,
    },
    caixa: {
      entradas: arred(totalEntradas),
      saidas: arred(totalSaidas),
      resultado: arred(totalEntradas - totalSaidas),
      porCategoria: Object.keys(porCategoria).map(function (chave) {
        return { categoria: chave, valor: arred(porCategoria[chave]) };
      }),
    },
    estoque: {
      itens: itensEstoque,
      valorCusto: arred(valorCusto),
      valorVenda: arred(valorVenda),
      abaixoMinimo: abaixoMinimo,
    },
  };
}

/** Relatório gerencial em PDF (base64) — só Administrador. */
function gerarPdfRelatorio(token, dataInicio, dataFim) {
  const dados = relatorioDados(token, dataInicio, dataFim); // valida o perfil
  const linhaTabela = function (celulas) {
    return '<tr>' + celulas.map(function (c, i) {
      return '<td class="' + (i > 0 ? 'num' : '') + '">' + c + '</td>';
    }).join('') + '</tr>';
  };
  const tabela = function (titulos, linhas) {
    return '<table><thead><tr>' + titulos.map(function (t, i) {
      return '<th class="' + (i > 0 ? 'num' : '') + '">' + t + '</th>';
    }).join('') + '</tr></thead><tbody>' + linhas.join('') + '</tbody></table>';
  };

  const corpo = '' +
    '<div class="rel"><style>' +
    '.rel{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;' +
    'margin:0 auto;padding:16px}' +
    '.rel h1{font-size:18px;text-align:center;border-bottom:2px solid #111;' +
    'padding-bottom:8px}' +
    '.rel h2{font-size:14px;margin:18px 0 4px;border-bottom:1px solid #999}' +
    '.rel table{width:100%;border-collapse:collapse;margin-top:4px}' +
    '.rel th,.rel td{border:1px solid #bbb;padding:5px 8px;font-size:12px;' +
    'text-align:left}.rel th{background:#f0f0f0}' +
    '.rel .num{text-align:right;white-space:nowrap}' +
    '.rel .cartoes{display:flex;gap:12px;margin-top:8px}' +
    '.rel .cartoes div{flex:1;border:1px solid #ccc;border-radius:6px;' +
    'padding:8px;text-align:center;font-size:12px}' +
    '.rel .cartoes strong{display:block;font-size:15px;margin-top:2px}' +
    '</style>' +
    '<h1>' + escaparHtml_(DADOS_LOJA.nome) + '<br>' +
    '<small>Relatório Gerencial — ' + dados.periodo.inicio + ' a ' +
    dados.periodo.fim + '</small></h1>' +

    '<h2>💵 Vendas</h2>' +
    '<div class="cartoes">' +
    '<div>Vendas<strong>' + dados.vendas.quantidade + '</strong></div>' +
    '<div>Faturamento<strong>' + formatarMoeda_(dados.vendas.total) +
    '</strong></div>' +
    '<div>Ticket médio<strong>' + formatarMoeda_(dados.vendas.ticketMedio) +
    '</strong></div></div>' +
    tabela(['Forma de pagamento', 'Valor'], dados.vendas.porPagamento.map(
      function (p) { return linhaTabela([escaparHtml_(p.forma),
                                         formatarMoeda_(p.valor)]); })) +
    tabela(['Vendedor', 'Valor'], dados.vendas.porVendedor.map(
      function (p) { return linhaTabela([escaparHtml_(p.vendedor),
                                         formatarMoeda_(p.valor)]); })) +
    '<h2>🏆 Produtos mais vendidos</h2>' +
    tabela(['Produto', 'Qtd.', 'Valor'], dados.vendas.topProdutos.map(
      function (p) { return linhaTabela([escaparHtml_(p.produto), p.quantidade,
                                         formatarMoeda_(p.valor)]); })) +

    '<h2>💰 Fluxo de caixa do período</h2>' +
    '<div class="cartoes">' +
    '<div>Entradas<strong>' + formatarMoeda_(dados.caixa.entradas) +
    '</strong></div>' +
    '<div>Saídas<strong>' + formatarMoeda_(dados.caixa.saidas) +
    '</strong></div>' +
    '<div>Resultado<strong>' + formatarMoeda_(dados.caixa.resultado) +
    '</strong></div></div>' +
    tabela(['Tipo — Categoria', 'Valor'], dados.caixa.porCategoria.map(
      function (c) { return linhaTabela([escaparHtml_(c.categoria),
                                         formatarMoeda_(c.valor)]); })) +

    '<h2>📦 Estoque (posição atual)</h2>' +
    '<div class="cartoes">' +
    '<div>Itens em estoque<strong>' + dados.estoque.itens + '</strong></div>' +
    '<div>Valor de custo<strong>' + formatarMoeda_(dados.estoque.valorCusto) +
    '</strong></div>' +
    '<div>Valor de venda<strong>' + formatarMoeda_(dados.estoque.valorVenda) +
    '</strong></div></div>' +
    tabela(['SKU', 'Produto', 'Estoque', 'Mínimo'],
      dados.estoque.abaixoMinimo.map(function (p) {
        return linhaTabela([escaparHtml_(p.sku), escaparHtml_(p.descricao),
                            p.quantidadeAtual, p.quantidadeMinima]);
      })) +
    '</div>';

  return converterHtmlEmPdf_(
    corpo,
    'Relatório Gerencial — MEGA OUTLET',
    'relatorio_' + dataInicio + '_a_' + dataFim);
}
