/**
 * MEGA OUTLET — Módulo de Orçamentos / Pedidos.
 *
 * Um orçamento é uma venda "em potencial": NÃO baixa estoque e NÃO lança
 * no caixa. Ele pode ser:
 *   * impresso/baixado em PDF para entregar ao cliente;
 *   * convertido em venda (aí sim ocorre a baixa de estoque e a Entrada
 *     no caixa, pela mesma `registrarVenda` do PDV);
 *   * cancelado.
 *
 * Colunas da aba Orcamentos:
 *   A ID_Orcamento | B Data | C Validade_Dias | D Cliente_Nome
 *   E Cliente_CPF | F Cliente_Telefone | G Forma_Entrega
 *   H Endereco_Entrega | I Valor_Total | J Observacoes | K Status
 *   L ID_Usuario | M ID_Venda (preenchido quando convertido)
 */

const COL_ORC = { ID: 0, DATA: 1, VALIDADE: 2, NOME: 3, CPF: 4, TEL: 5,
                  ENTREGA: 6, ENDERECO: 7, TOTAL: 8, OBS: 9, STATUS: 10,
                  USUARIO: 11, VENDA: 12 };

/**
 * Cria um orçamento (qualquer perfil logado).
 *
 * @param {Object} dados — mesmo formato de registrarVenda (sem
 *   formaPagamento), mais `validadeDias` (padrão 7).
 * @return {Object} { idOrcamento, valorTotal, documentoHtml }
 */
function criarOrcamento(dados) {
  const operador = validarSessao_(dados.token, PERFIS_USUARIO);

  // ----- Validações (não há checagem de estoque: é só um orçamento) -------
  const clienteNome = String(dados.clienteNome || '').trim();
  if (!clienteNome) throw new Error('O nome do cliente é obrigatório.');
  const itens = dados.itens || [];
  if (!itens.length) throw new Error('O orçamento precisa ter pelo menos um item.');
  if (FORMAS_ENTREGA.indexOf(dados.formaEntrega) === -1) {
    throw new Error('Forma de entrega inválida: ' + dados.formaEntrega);
  }
  const validadeDias = Math.max(1, parseInt(dados.validadeDias, 10) || 7);

  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const produtos = mapaProdutosPorId_();

    // Total calculado no servidor + validação dos itens
    let valorTotal = 0;
    itens.forEach(function (item) {
      const quantidade = Number(item.quantidade);
      if (!quantidade || quantidade <= 0 || quantidade % 1 !== 0) {
        throw new Error('A quantidade de cada item deve ser um inteiro > 0.');
      }
      const produto = produtos[Number(item.idProduto)];
      if (!produto) {
        throw new Error('Produto com ID ' + item.idProduto + ' não encontrado.');
      }
      const preco = item.precoUnitario === '' || item.precoUnitario == null
        ? produto.precoVenda : Number(item.precoUnitario);
      if (isNaN(preco) || preco < 0) {
        throw new Error('Preço unitário inválido para "' + produto.descricao + '".');
      }
      item._precoAplicado = Math.round(preco * 100) / 100;
      valorTotal += item._precoAplicado * quantidade;
    });
    valorTotal = Math.round(valorTotal * 100) / 100;

    // Aviso legal automático para item outlet (mesma regra da venda)
    let observacoes = String(dados.observacoes || '').trim();
    const temOutlet = itens.some(function (item) {
      return produtoEhOutlet_(produtos[Number(item.idProduto)].statusGarantia);
    });
    if (temOutlet && observacoes.indexOf(AVISO_LEGAL_OUTLET) === -1) {
      observacoes = observacoes
        ? observacoes + '\n' + AVISO_LEGAL_OUTLET : AVISO_LEGAL_OUTLET;
    }

    // Grava o orçamento e os itens
    const abaOrc = obterAba_(ABAS.ORCAMENTOS);
    const idOrcamento = proximoId_(abaOrc);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    abaOrc.appendRow([
      idOrcamento, hoje, validadeDias, clienteNome,
      String(dados.clienteCpf || '').trim(),
      String(dados.clienteTelefone || '').trim(),
      dados.formaEntrega, String(dados.enderecoEntrega || '').trim(),
      valorTotal, observacoes, 'Aberto', operador.idUsuario, '',
    ]);

    const abaItens = obterAba_(ABAS.ITENS_ORC);
    let idItem = proximoId_(abaItens);
    const linhas = itens.map(function (item) {
      return [idItem++, idOrcamento, Number(item.idProduto),
              Number(item.quantidade), item._precoAplicado];
    });
    abaItens.getRange(abaItens.getLastRow() + 1, 1, linhas.length, 5)
      .setValues(linhas);

    SpreadsheetApp.flush();
    return {
      idOrcamento: idOrcamento,
      valorTotal: valorTotal,
      documentoHtml: documentoOrcamentoHtml_(idOrcamento),
    };
  } finally {
    bloqueio.releaseLock();
  }
}

/** Lista os orçamentos, mais recentes primeiro (qualquer perfil). */
function listarOrcamentos(token, limite) {
  validarSessao_(token, PERFIS_USUARIO);
  return lerOrcamentos_()
    .sort(function (a, b) { return b.idOrcamento - a.idOrcamento; })
    .slice(0, limite || 100)
    .map(function (o) {
      return { idOrcamento: o.idOrcamento, data: formatarData_(o.data),
               clienteNome: o.clienteNome, valorTotal: o.valorTotal,
               status: o.status, idVenda: o.idVenda };
    });
}

/** Lê todos os orçamentos da aba. */
function lerOrcamentos_() {
  const aba = obterAba_(ABAS.ORCAMENTOS);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  const dados = aba.getRange(2, 1, ultimaLinha - 1, 13).getValues();
  const orcamentos = [];
  dados.forEach(function (v, indice) {
    if (v[COL_ORC.ID] === '') return;
    orcamentos.push({
      idOrcamento: Number(v[COL_ORC.ID]),
      data: v[COL_ORC.DATA],
      validadeDias: Number(v[COL_ORC.VALIDADE]) || 7,
      clienteNome: String(v[COL_ORC.NOME]),
      clienteCpf: String(v[COL_ORC.CPF]),
      clienteTelefone: String(v[COL_ORC.TEL]),
      formaEntrega: String(v[COL_ORC.ENTREGA]),
      enderecoEntrega: String(v[COL_ORC.ENDERECO]),
      valorTotal: Number(v[COL_ORC.TOTAL]) || 0,
      observacoes: String(v[COL_ORC.OBS]),
      status: String(v[COL_ORC.STATUS]),
      idUsuario: Number(v[COL_ORC.USUARIO]) || null,
      idVenda: v[COL_ORC.VENDA] === '' ? null : Number(v[COL_ORC.VENDA]),
      linha: indice + 2,
    });
  });
  return orcamentos;
}

/** Itens de um orçamento (com dados do produto). */
function lerItensOrcamento_(idOrcamento) {
  const aba = obterAba_(ABAS.ITENS_ORC);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  const produtos = mapaProdutosPorId_();
  return aba.getRange(2, 1, ultimaLinha - 1, 5).getValues()
    .filter(function (i) { return Number(i[1]) === Number(idOrcamento); })
    .map(function (i) {
      const produto = produtos[Number(i[2])] ||
        { sku: '?', descricao: 'Produto removido', statusGarantia: '—' };
      return { idProduto: Number(i[2]), quantidade: Number(i[3]),
               precoUnitario: Number(i[4]), sku: produto.sku,
               descricao: produto.descricao,
               statusGarantia: produto.statusGarantia };
    });
}

/**
 * Converte um orçamento aberto em VENDA: executa a `registrarVenda` do PDV
 * (baixa de estoque + Entrada no caixa) com os itens e dados do orçamento,
 * e marca o orçamento como "Convertido", guardando o ID da venda gerada.
 */
function converterOrcamentoEmVenda(token, idOrcamento, formaPagamento,
                                   permitirSobEncomenda) {
  validarSessao_(token, PERFIS_USUARIO);
  const orcamento = lerOrcamentos_().filter(function (o) {
    return o.idOrcamento === Number(idOrcamento);
  })[0];
  if (!orcamento) throw new Error('Orçamento ' + idOrcamento + ' não encontrado.');
  if (orcamento.status !== 'Aberto') {
    throw new Error('Este orçamento está "' + orcamento.status +
                    '" — só orçamentos Abertos podem ser convertidos.');
  }

  const itens = lerItensOrcamento_(idOrcamento).map(function (i) {
    return { idProduto: i.idProduto, quantidade: i.quantidade,
             precoUnitario: i.precoUnitario };
  });

  // registrarVenda cuida do lock, da baixa de estoque e do caixa
  const venda = registrarVenda({
    token: token,
    clienteNome: orcamento.clienteNome,
    clienteCpf: orcamento.clienteCpf,
    clienteTelefone: orcamento.clienteTelefone,
    formaEntrega: orcamento.formaEntrega,
    enderecoEntrega: orcamento.enderecoEntrega,
    formaPagamento: formaPagamento,
    observacoes: orcamento.observacoes,
    permitirSobEncomenda: Boolean(permitirSobEncomenda),
    itens: itens,
  });

  // Marca o orçamento como convertido, vinculado à venda gerada
  const aba = obterAba_(ABAS.ORCAMENTOS);
  aba.getRange(orcamento.linha, COL_ORC.STATUS + 1).setValue('Convertido');
  aba.getRange(orcamento.linha, COL_ORC.VENDA + 1).setValue(venda.idVenda);
  SpreadsheetApp.flush();

  return venda; // { idVenda, valorTotal, reciboHtml }
}

/** Cancela um orçamento aberto. */
function cancelarOrcamento(token, idOrcamento) {
  validarSessao_(token, PERFIS_USUARIO);
  const orcamento = lerOrcamentos_().filter(function (o) {
    return o.idOrcamento === Number(idOrcamento);
  })[0];
  if (!orcamento) throw new Error('Orçamento ' + idOrcamento + ' não encontrado.');
  if (orcamento.status !== 'Aberto') {
    throw new Error('Só orçamentos Abertos podem ser cancelados.');
  }
  obterAba_(ABAS.ORCAMENTOS)
    .getRange(orcamento.linha, COL_ORC.STATUS + 1).setValue('Cancelado');
  SpreadsheetApp.flush();
  return true;
}

/** Documento do orçamento em HTML (visualização) — exige sessão. */
function obterOrcamentoHtml(token, idOrcamento) {
  validarSessao_(token, PERFIS_USUARIO);
  return documentoOrcamentoHtml_(idOrcamento);
}

/** Documento do orçamento em PDF (base64 para download) — exige sessão. */
function gerarPdfOrcamento(token, idOrcamento) {
  validarSessao_(token, PERFIS_USUARIO);
  const numero = ('000000' + Number(idOrcamento)).slice(-6);
  return converterHtmlEmPdf_(
    documentoOrcamentoHtml_(idOrcamento),
    'Orçamento Nº ' + numero + ' — MEGA OUTLET',
    'orcamento_' + numero);
}

/**
 * Monta o documento do orçamento (mesmo visual do recibo, com validade e
 * aviso de que não é comprovante de pagamento). PRIVADA.
 */
function documentoOrcamentoHtml_(idOrcamento) {
  const orcamento = lerOrcamentos_().filter(function (o) {
    return o.idOrcamento === Number(idOrcamento);
  })[0];
  if (!orcamento) throw new Error('Orçamento ' + idOrcamento + ' não encontrado.');
  const itens = lerItensOrcamento_(idOrcamento);
  const nomeVendedor = mapaNomesUsuarios_()[orcamento.idUsuario] || '—';

  const linhasItens = itens.map(function (i) {
    const subtotal = i.quantidade * i.precoUnitario;
    return '<tr>' +
      '<td>' + escaparHtml_(i.sku) + '</td>' +
      '<td>' + escaparHtml_(i.descricao) + '<br><small>Garantia: ' +
               escaparHtml_(i.statusGarantia) + '</small></td>' +
      '<td class="num">' + i.quantidade + '</td>' +
      '<td class="num">' + formatarMoeda_(i.precoUnitario) + '</td>' +
      '<td class="num">' + formatarMoeda_(subtotal) + '</td>' +
      '</tr>';
  }).join('');

  let entrega = escaparHtml_(orcamento.formaEntrega);
  if (orcamento.enderecoEntrega) {
    entrega += ' — ' + escaparHtml_(orcamento.enderecoEntrega);
  }

  const blocoObservacoes = orcamento.observacoes
    ? '<div class="bloco observacoes"><strong>Observações:</strong><br>' +
      escaparHtml_(orcamento.observacoes).replace(/\n/g, '<br>') + '</div>'
    : '';

  return '' +
    '<div class="recibo">' +
    '<style>' +
    '.recibo{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:700px;' +
    'margin:0 auto;padding:16px;background:#fff}' +
    '.recibo h1{font-size:20px;margin:0}' +
    '.recibo h2{font-size:15px;margin:16px 0 6px;border-bottom:1px solid #999;' +
    'padding-bottom:2px}' +
    '.recibo .cabecalho{text-align:center;border-bottom:2px solid #111;' +
    'padding-bottom:10px}' +
    '.recibo .cabecalho small{color:#444}' +
    '.recibo table{width:100%;border-collapse:collapse;margin-top:6px}' +
    '.recibo th,.recibo td{border:1px solid #bbb;padding:6px 8px;font-size:13px;' +
    'text-align:left;vertical-align:top}' +
    '.recibo th{background:#f0f0f0}' +
    '.recibo .num{text-align:right;white-space:nowrap}' +
    '.recibo .total{font-size:16px;font-weight:bold;text-align:right;margin-top:8px}' +
    '.recibo .bloco{margin-top:10px;font-size:13px}' +
    '.recibo .observacoes{border:1px dashed #888;padding:8px;background:#fafafa}' +
    '.recibo .faixa{background:#fff3cd;border:1px solid #ffc107;padding:6px 10px;' +
    'text-align:center;font-size:12px;margin-top:10px}' +
    '</style>' +
    '<div class="cabecalho">' +
    '<h1>' + escaparHtml_(DADOS_LOJA.nome) + '</h1>' +
    '<small>CNPJ: ' + escaparHtml_(DADOS_LOJA.cnpj) + ' | ' +
    escaparHtml_(DADOS_LOJA.endereco) + ' | Tel: ' +
    escaparHtml_(DADOS_LOJA.telefone) + '</small>' +
    '</div>' +
    '<h2>ORÇAMENTO Nº ' + ('000000' + orcamento.idOrcamento).slice(-6) +
    (orcamento.status !== 'Aberto'
      ? ' — ' + escaparHtml_(orcamento.status.toUpperCase()) : '') +
    '</h2>' +
    '<div class="bloco">' +
    '<strong>Data:</strong> ' + formatarData_(orcamento.data) +
    ' &nbsp;|&nbsp; <strong>Validade:</strong> ' + orcamento.validadeDias +
    ' dia(s)<br>' +
    '<strong>Cliente:</strong> ' + escaparHtml_(orcamento.clienteNome) + '<br>' +
    '<strong>CPF:</strong> ' + escaparHtml_(orcamento.clienteCpf || '—') +
    ' | <strong>Telefone:</strong> ' +
    escaparHtml_(orcamento.clienteTelefone || '—') + '<br>' +
    '<strong>Entrega:</strong> ' + entrega + '<br>' +
    '<strong>Vendedor:</strong> ' + escaparHtml_(nomeVendedor) +
    '</div>' +
    '<h2>Itens</h2>' +
    '<table><thead><tr><th>Código</th><th>Descrição</th>' +
    '<th class="num">Qtd.</th><th class="num">Preço Unit.</th>' +
    '<th class="num">Subtotal</th></tr></thead>' +
    '<tbody>' + linhasItens + '</tbody></table>' +
    '<div class="total">TOTAL: ' + formatarMoeda_(orcamento.valorTotal) + '</div>' +
    blocoObservacoes +
    '<div class="faixa">⚠️ Este documento é um ORÇAMENTO — não é comprovante ' +
    'de pagamento nem reserva de mercadoria. Preços válidos por ' +
    orcamento.validadeDias + ' dia(s) ou enquanto durar o estoque.</div>' +
    '</div>';
}
