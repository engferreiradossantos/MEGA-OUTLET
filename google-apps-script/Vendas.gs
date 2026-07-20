/**
 * MEGA OUTLET — Módulo de Vendas: FUNÇÃO PRINCIPAL DO SISTEMA
 * (requisitos 2.3, 2.4, 3.1 e 3.2).
 *
 * `registrarVenda` executa, sob bloqueio exclusivo (LockService):
 *   1. Validação de saldo de estoque de cada item (regra 3.1), com a opção
 *      "Sob Encomenda" para permitir venda além do saldo;
 *   2. Gravação da venda (aba Vendas) e dos itens (aba Itens_Venda);
 *   3. Baixa automática e imediata no estoque (regra 3.1);
 *   4. Lançamento de Entrada no Fluxo_Caixa herdando o valor total e a
 *      forma de pagamento (regra 3.2 — "Vínculo com Caixa").
 *
 * O Google Sheets não possui transações como um banco SQL; por isso TODAS
 * as validações acontecem ANTES de qualquer escrita, e o LockService impede
 * que dois caixas gravem ao mesmo tempo — na prática, ou a venda inteira é
 * gravada, ou nada é gravado.
 */

/**
 * Registra uma venda completa. Chamada pelo PDV.html via google.script.run.
 *
 * @param {Object} dados
 *   {
 *     token: string,                  // token de sessão obtido em loginUsuario
 *     clienteNome: string,            // obrigatório
 *     clienteCpf: string,
 *     clienteTelefone: string,
 *     formaEntrega: string,           // Retira | Entrega Própria | Transportadora
 *     enderecoEntrega: string,        // obrigatório se não for Retira
 *     formaPagamento: string,         // PIX | Cartão de Crédito | ...
 *     observacoes: string,
 *     permitirSobEncomenda: boolean,  // permite vender sem saldo (regra 3.1)
 *     itens: [{ idProduto: number, quantidade: number, precoUnitario: number }]
 *   }
 * @return {Object} { idVenda, valorTotal, reciboHtml }
 */
function registrarVenda(dados) {
  // Exige sessão válida (Administrador ou Vendedor) — o operador logado
  // fica registrado na venda e no lançamento do caixa
  const operador = validarSessao_(dados.token, PERFIS_USUARIO);

  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000); // espera até 30s por outro caixa concluir

  try {
    // ------------------------------------------------------------------
    // 1) Validações (nenhuma escrita acontece antes de tudo estar válido)
    // ------------------------------------------------------------------
    const clienteNome = String(dados.clienteNome || '').trim();
    if (!clienteNome) throw new Error('O nome do cliente é obrigatório.');

    const itens = dados.itens || [];
    if (!itens.length) throw new Error('A venda precisa ter pelo menos um item.');

    if (FORMAS_PAGAMENTO.indexOf(dados.formaPagamento) === -1) {
      throw new Error('Forma de pagamento inválida: ' + dados.formaPagamento);
    }
    if (FORMAS_ENTREGA.indexOf(dados.formaEntrega) === -1) {
      throw new Error('Forma de entrega inválida: ' + dados.formaEntrega);
    }
    const enderecoEntrega = String(dados.enderecoEntrega || '').trim();
    if (dados.formaEntrega !== 'Retira' && !enderecoEntrega) {
      throw new Error('Endereço de entrega é obrigatório para "' +
                      dados.formaEntrega + '".');
    }

    // Carrega os produtos e valida existência + saldo (regra 3.1)
    const produtos = mapaProdutosPorId_();
    const sobEncomenda = Boolean(dados.permitirSobEncomenda);

    itens.forEach(function (item) {
      const quantidade = Number(item.quantidade);
      if (!quantidade || quantidade <= 0 || quantidade % 1 !== 0) {
        throw new Error('A quantidade de cada item deve ser um inteiro > 0.');
      }
      const produto = produtos[Number(item.idProduto)];
      if (!produto) {
        throw new Error('Produto com ID ' + item.idProduto + ' não encontrado.');
      }
      if (!sobEncomenda && produto.quantidadeAtual < quantidade) {
        throw new Error('Estoque insuficiente para "' + produto.descricao +
                        '": disponível ' + produto.quantidadeAtual +
                        ', solicitado ' + quantidade +
                        '. Habilite "Sob Encomenda" para vender mesmo assim.');
      }
    });

    // ------------------------------------------------------------------
    // 2) Valor total calculado no servidor (não confia no total da tela)
    // ------------------------------------------------------------------
    let valorTotal = 0;
    itens.forEach(function (item) {
      const produto = produtos[Number(item.idProduto)];
      // Preço da tela (permite desconto); se vazio, usa o preço do cadastro
      const preco = item.precoUnitario === '' || item.precoUnitario == null
        ? produto.precoVenda
        : Number(item.precoUnitario);
      if (isNaN(preco) || preco < 0) {
        throw new Error('Preço unitário inválido para "' + produto.descricao + '".');
      }
      item._precoAplicado = Math.round(preco * 100) / 100;
      valorTotal += item._precoAplicado * Number(item.quantidade);
    });
    valorTotal = Math.round(valorTotal * 100) / 100;

    // ------------------------------------------------------------------
    // 3) Aviso legal automático para produto outlet/mostruário (regra 3.1)
    // ------------------------------------------------------------------
    let observacoes = String(dados.observacoes || '').trim();
    const temItemOutlet = itens.some(function (item) {
      return produtoEhOutlet_(produtos[Number(item.idProduto)].statusGarantia);
    });
    if (temItemOutlet && observacoes.indexOf(AVISO_LEGAL_OUTLET) === -1) {
      observacoes = observacoes
        ? observacoes + '\n' + AVISO_LEGAL_OUTLET
        : AVISO_LEGAL_OUTLET;
    }

    // ------------------------------------------------------------------
    // 4) Escritas (validação concluída — agora grava tudo em sequência)
    // ------------------------------------------------------------------
    const abaVendas = obterAba_(ABAS.VENDAS);
    const abaItens = obterAba_(ABAS.ITENS);
    const abaProdutos = obterAba_(ABAS.PRODUTOS);

    // 4a) Cabeçalho da venda (aba Vendas — requisito 2.3)
    const idVenda = proximoId_(abaVendas);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Data_Venda é só a data (sem hora)
    abaVendas.appendRow([
      idVenda, hoje, clienteNome,
      String(dados.clienteCpf || '').trim(),
      String(dados.clienteTelefone || '').trim(),
      dados.formaEntrega, enderecoEntrega, valorTotal, observacoes,
      operador.idUsuario,
    ]);

    // 4b) Itens da venda (aba Itens_Venda — requisito 2.4), em lote
    let idItem = proximoId_(abaItens);
    const linhasItens = itens.map(function (item) {
      return [idItem++, idVenda, Number(item.idProduto),
              Number(item.quantidade), item._precoAplicado];
    });
    abaItens.getRange(abaItens.getLastRow() + 1, 1, linhasItens.length, 5)
      .setValues(linhasItens);

    // 4c) BAIXA AUTOMÁTICA no estoque (regra 3.1): subtrai a quantidade
    //     vendida da coluna Quantidade_Atual imediatamente
    itens.forEach(function (item) {
      const produto = produtos[Number(item.idProduto)];
      abaProdutos.getRange(produto.linha, COL_PROD.QTD_ATUAL + 1)
        .setValue(produto.quantidadeAtual - Number(item.quantidade));
    });

    // 4d) Entrada automática no Fluxo_Caixa (regra 3.2), herdando o
    //     valor total e a forma de pagamento da venda
    inserirLancamentoCaixa_({
      tipo: 'Entrada',
      categoria: CATEGORIA_CAIXA_VENDA,
      valor: valorTotal,
      formaPagamento: dados.formaPagamento,
      idVenda: idVenda,
      idUsuario: operador.idUsuario,
    });

    SpreadsheetApp.flush(); // garante a persistência antes de liberar o lock

    return {
      idVenda: idVenda,
      valorTotal: valorTotal,
      reciboHtml: gerarReciboHtml(idVenda),
    };
  } finally {
    bloqueio.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Gerador de Recibo (requisito 4)
// ---------------------------------------------------------------------------

/**
 * Monta o recibo em HTML (pronto para impressão) a partir do ID da venda.
 * Usado pelo PDV logo após a venda e pelo menu "Reimprimir recibo".
 */
function gerarReciboHtml(idVenda) {
  idVenda = Number(idVenda);

  // ----- Cabeçalho da venda ------------------------------------------------
  const abaVendas = obterAba_(ABAS.VENDAS);
  const dadosVendas = abaVendas.getLastRow() < 2 ? [] :
    abaVendas.getRange(2, 1, abaVendas.getLastRow() - 1, 10).getValues();
  const venda = dadosVendas.filter(function (v) {
    return Number(v[0]) === idVenda;
  })[0];
  if (!venda) throw new Error('Venda ' + idVenda + ' não encontrada.');

  // Nome de quem atendeu (coluna ID_Usuario da venda)
  const nomeVendedor = mapaNomesUsuarios_()[Number(venda[9])] || '—';

  // ----- Itens + produtos --------------------------------------------------
  const abaItens = obterAba_(ABAS.ITENS);
  const produtos = mapaProdutosPorId_();
  const itens = (abaItens.getLastRow() < 2 ? [] :
    abaItens.getRange(2, 1, abaItens.getLastRow() - 1, 5).getValues())
    .filter(function (i) { return Number(i[1]) === idVenda; });

  // ----- Forma de pagamento (está na Entrada vinculada do Fluxo_Caixa) -----
  const abaCaixa = obterAba_(ABAS.CAIXA);
  const lancamento = (abaCaixa.getLastRow() < 2 ? [] :
    abaCaixa.getRange(2, 1, abaCaixa.getLastRow() - 1, 8).getValues())
    .filter(function (l) {
      return Number(l[6]) === idVenda && l[2] === 'Entrada';
    })[0];
  const formaPagamento = lancamento ? String(lancamento[5]) : '—';

  // ----- Montagem do HTML --------------------------------------------------
  const linhasItens = itens.map(function (i) {
    const produto = produtos[Number(i[2])] ||
      { sku: '?', descricao: 'Produto removido', statusGarantia: '—' };
    const subtotal = Number(i[3]) * Number(i[4]);
    return '<tr>' +
      '<td>' + escaparHtml_(produto.sku) + '</td>' +
      '<td>' + escaparHtml_(produto.descricao) + '<br><small>Garantia: ' +
               escaparHtml_(produto.statusGarantia) + '</small></td>' +
      '<td class="num">' + Number(i[3]) + '</td>' +
      '<td class="num">' + formatarMoeda_(i[4]) + '</td>' +
      '<td class="num">' + formatarMoeda_(subtotal) + '</td>' +
      '</tr>';
  }).join('');

  let entrega = escaparHtml_(venda[5]);
  if (venda[6]) entrega += ' — ' + escaparHtml_(venda[6]);

  const observacoes = String(venda[8] || '');
  const blocoObservacoes = observacoes
    ? '<div class="bloco observacoes"><strong>Observações / Termo de venda:' +
      '</strong><br>' + escaparHtml_(observacoes).replace(/\n/g, '<br>') + '</div>'
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
    '.recibo .assinaturas{display:flex;gap:40px;margin-top:56px}' +
    '.recibo .assinaturas div{flex:1;border-top:1px solid #111;text-align:center;' +
    'padding-top:4px;font-size:12px}' +
    '</style>' +
    '<div class="cabecalho">' +
    '<h1>' + escaparHtml_(DADOS_LOJA.nome) + '</h1>' +
    '<small>CNPJ: ' + escaparHtml_(DADOS_LOJA.cnpj) + ' | ' +
    escaparHtml_(DADOS_LOJA.endereco) + ' | Tel: ' +
    escaparHtml_(DADOS_LOJA.telefone) + '</small>' +
    '</div>' +
    '<h2>Recibo de Venda Nº ' + ('000000' + idVenda).slice(-6) + '</h2>' +
    '<div class="bloco">' +
    '<strong>Data:</strong> ' + formatarData_(venda[1]) + '<br>' +
    '<strong>Cliente:</strong> ' + escaparHtml_(venda[2]) + '<br>' +
    '<strong>CPF:</strong> ' + escaparHtml_(venda[3] || '—') +
    ' | <strong>Telefone:</strong> ' + escaparHtml_(venda[4] || '—') + '<br>' +
    '<strong>Entrega:</strong> ' + entrega + '<br>' +
    '<strong>Forma de pagamento:</strong> ' + escaparHtml_(formaPagamento) + '<br>' +
    '<strong>Atendido por:</strong> ' + escaparHtml_(nomeVendedor) +
    '</div>' +
    '<h2>Itens</h2>' +
    '<table><thead><tr><th>Código</th><th>Descrição</th>' +
    '<th class="num">Qtd.</th><th class="num">Preço Unit.</th>' +
    '<th class="num">Subtotal</th></tr></thead>' +
    '<tbody>' + linhasItens + '</tbody></table>' +
    '<div class="total">TOTAL: ' + formatarMoeda_(venda[7]) + '</div>' +
    blocoObservacoes +
    '<div class="assinaturas">' +
    '<div>' + escaparHtml_(DADOS_LOJA.nome) + '<br>(Vendedor)</div>' +
    '<div>' + escaparHtml_(venda[2]) + '<br>(Cliente)</div>' +
    '</div>' +
    '</div>';
}
