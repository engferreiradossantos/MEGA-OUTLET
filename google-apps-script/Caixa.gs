/**
 * MEGA OUTLET — Módulo de Fluxo de Caixa (requisitos 2.2 e 3.2).
 *
 * Colunas da aba Fluxo_Caixa:
 *   A ID_Lancamento | B Data_Hora | C Tipo | D Categoria | E Valor
 *   F Forma_Pagamento | G ID_Venda (vazio em lançamentos manuais)
 *   H ID_Usuario (quem lançou)
 */

/**
 * Insere um lançamento no Fluxo_Caixa SEM bloqueio próprio — usada por
 * `registrarVenda` (que já detém o lock) e por `registrarLancamentoManual`.
 *
 * @param {Object} dados
 *   { tipo, categoria, valor, formaPagamento, idVenda?, idUsuario? }
 * @return {number} ID do lançamento gerado
 */
function inserirLancamentoCaixa_(dados) {
  if (TIPOS_LANCAMENTO.indexOf(dados.tipo) === -1) {
    throw new Error('Tipo de lançamento inválido: ' + dados.tipo);
  }
  if (FORMAS_PAGAMENTO.indexOf(dados.formaPagamento) === -1) {
    throw new Error('Forma de pagamento inválida: ' + dados.formaPagamento);
  }
  const categoria = String(dados.categoria || '').trim();
  if (!categoria) throw new Error('A categoria do lançamento é obrigatória.');

  const valor = Math.round(Number(dados.valor) * 100) / 100;
  if (isNaN(valor) || valor <= 0) {
    throw new Error('O valor do lançamento deve ser maior que zero.');
  }

  const aba = obterAba_(ABAS.CAIXA);
  const idLancamento = proximoId_(aba);
  aba.appendRow([
    idLancamento, new Date(), dados.tipo, categoria, valor,
    dados.formaPagamento, dados.idVenda || '', dados.idUsuario || '',
  ]);
  return idLancamento;
}

/**
 * Lançamento manual de Entrada/Saída (regra 3.2 — "Conciliação").
 * Chamada pelo Lancamento.html via google.script.run.
 * Exclusivo do perfil Administrador (exige token de sessão).
 */
function registrarLancamentoManual(dados) {
  const operador = validarSessao_(dados.token, ['Administrador']);

  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    dados.idUsuario = operador.idUsuario; // registra quem lançou
    const id = inserirLancamentoCaixa_(dados);
    SpreadsheetApp.flush();
    return { idLancamento: id };
  } finally {
    bloqueio.releaseLock();
  }
}

/**
 * Extrato do caixa (mais recentes primeiro), com filtro opcional por
 * período ('YYYY-MM-DD'). Exclusivo do Administrador.
 */
function extratoCaixa(token, dataInicio, dataFim) {
  validarSessao_(token, ['Administrador']);
  const nomes = mapaNomesUsuarios_();
  let inicio = null, fim = null;
  if (dataInicio) inicio = parseDataIso_(dataInicio);
  if (dataFim) { fim = parseDataIso_(dataFim); fim.setHours(23, 59, 59, 999); }

  return lerCaixa_()
    .filter(function (l) {
      if (inicio && l.dataHora < inicio) return false;
      if (fim && l.dataHora > fim) return false;
      return true;
    })
    .sort(function (a, b) { return b.idLancamento - a.idLancamento; })
    .slice(0, 300)
    .map(function (l) {
      return {
        idLancamento: l.idLancamento,
        dataHora: Utilities.formatDate(l.dataHora,
          Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
        tipo: l.tipo, categoria: l.categoria, valor: l.valor,
        formaPagamento: l.formaPagamento, idVenda: l.idVenda,
        usuario: nomes[l.idUsuario] || '—',
      };
    });
}

// ---------------------------------------------------------------------------
// Parcelas / Contas a Receber (parcelamento no cartão de crédito)
// ---------------------------------------------------------------------------
//
// Colunas da aba Parcelas:
//   A ID_Parcela | B ID_Venda | C Numero | D Total_Parcelas | E Vencimento
//   F Valor | G Status (Pendente/Recebida/Cancelada) | H Data_Recebimento
//   I Forma_Pagamento

/** Soma `meses` a uma data (usada para os vencimentos das parcelas). */
function addMeses_(data, meses) {
  const d = new Date(data);
  d.setMonth(d.getMonth() + meses);
  return d;
}

/**
 * Gera as parcelas de uma venda (chamada por registrarVenda, que já detém
 * o lock). À vista (1x): cria 1 parcela já "Recebida" e lança a Entrada no
 * caixa AGORA. Parcelado (>1x): cria N parcelas "Pendente" com vencimento
 * mensal e NÃO lança no caixa — cada parcela entra quando for recebida.
 */
function registrarParcelasDaVenda_(dados) {
  const aba = obterAba_(ABAS.PARCELAS);
  let idParcela = proximoId_(aba);
  const n = dados.numParcelas;

  // Divide o total em n parcelas iguais, ajustando os centavos na última
  const base = Math.floor((dados.valorTotal / n) * 100) / 100;
  const linhas = [];
  let soma = 0;
  for (let k = 1; k <= n; k++) {
    const valor = (k === n)
      ? Math.round((dados.valorTotal - soma) * 100) / 100 : base;
    soma += valor;
    if (dados.aVista) {
      linhas.push([idParcela++, dados.idVenda, k, n, dados.dataVenda, valor,
                   'Recebida', dados.dataVenda, dados.formaPagamento]);
    } else {
      // Parcela k vence k meses após a compra (1ª ~30 dias)
      linhas.push([idParcela++, dados.idVenda, k, n,
                   addMeses_(dados.dataVenda, k), valor, 'Pendente', '',
                   dados.formaPagamento]);
    }
  }
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, 9).setValues(linhas);

  // À vista: o dinheiro entra no caixa imediatamente (uma Entrada com o total)
  if (dados.aVista) {
    inserirLancamentoCaixa_({
      tipo: 'Entrada',
      categoria: CATEGORIA_CAIXA_VENDA,
      valor: dados.valorTotal,
      formaPagamento: dados.formaPagamento,
      idVenda: dados.idVenda,
      idUsuario: dados.idUsuario,
    });
  }
}

/** Lê todas as parcelas da aba como objetos (privada). */
function lerParcelas_() {
  const aba = obterAba_(ABAS.PARCELAS);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  return aba.getRange(2, 1, ultimaLinha - 1, 9).getValues()
    .filter(function (p) { return p[0] !== ''; })
    .map(function (p, indice) {
      return {
        idParcela: Number(p[0]), idVenda: Number(p[1]),
        numero: Number(p[2]), totalParcelas: Number(p[3]),
        vencimento: p[4] ? new Date(p[4]) : null,
        valor: Number(p[5]) || 0, status: String(p[6]),
        dataRecebimento: p[7] ? new Date(p[7]) : null,
        formaPagamento: String(p[8]), linha: indice + 2,
      };
    });
}

/**
 * Lista as parcelas (contas a receber) — Administrador. `filtroStatus`
 * opcional ('Pendente'/'Recebida'/'Cancelada'). Pendentes primeiro,
 * ordenadas por vencimento.
 */
function listarParcelas(token, filtroStatus) {
  validarSessao_(token, ['Administrador']);
  const tz = Session.getScriptTimeZone();
  const clientes = {};
  const abaVendas = obterAba_(ABAS.VENDAS);
  if (abaVendas.getLastRow() >= 2) {
    abaVendas.getRange(2, 1, abaVendas.getLastRow() - 1, 3).getValues()
      .forEach(function (v) { clientes[Number(v[0])] = String(v[2]); });
  }
  return lerParcelas_()
    .filter(function (p) { return !filtroStatus || p.status === filtroStatus; })
    .map(function (p) {
      return {
        idParcela: p.idParcela, idVenda: p.idVenda, numero: p.numero,
        totalParcelas: p.totalParcelas, valor: p.valor, status: p.status,
        formaPagamento: p.formaPagamento,
        clienteNome: clientes[p.idVenda] || '—',
        vencimento: p.vencimento ? Utilities.formatDate(p.vencimento, tz, 'dd/MM/yyyy') : '',
        vencimentoIso: p.vencimento ? Utilities.formatDate(p.vencimento, tz, 'yyyy-MM-dd') : '',
        dataRecebimento: p.dataRecebimento
          ? Utilities.formatDate(p.dataRecebimento, tz, 'dd/MM/yyyy') : '',
      };
    })
    .sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'Pendente' ? -1 : 1;
      return a.vencimentoIso < b.vencimentoIso ? -1 : 1;
    });
}

/**
 * Marca uma parcela pendente como Recebida e lança a Entrada
 * correspondente no caixa — Administrador.
 */
function receberParcela(token, idParcela) {
  const operador = validarSessao_(token, ['Administrador']);
  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const parcela = lerParcelas_().filter(function (p) {
      return p.idParcela === Number(idParcela);
    })[0];
    if (!parcela) throw new Error('Parcela ' + idParcela + ' não encontrada.');
    if (parcela.status !== 'Pendente') {
      throw new Error('Só parcelas Pendentes podem ser recebidas.');
    }
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const aba = obterAba_(ABAS.PARCELAS);
    aba.getRange(parcela.linha, 7).setValue('Recebida');      // Status
    aba.getRange(parcela.linha, 8).setValue(hoje);            // Data_Recebimento
    inserirLancamentoCaixa_({
      tipo: 'Entrada',
      categoria: CATEGORIA_CAIXA_VENDA,
      valor: parcela.valor,
      formaPagamento: parcela.formaPagamento,
      idVenda: parcela.idVenda,
      idUsuario: operador.idUsuario,
    });
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    bloqueio.releaseLock();
  }
}

/** Listas de opções para os formulários do aplicativo. */
function obterOpcoesFormularios() {
  return {
    formasPagamento: FORMAS_PAGAMENTO,
    formasEntrega: FORMAS_ENTREGA,
    tiposLancamento: TIPOS_LANCAMENTO,
    categoriasCaixa: CATEGORIAS_CAIXA,
    categoriasProduto: CATEGORIAS_PRODUTO,
    statusGarantia: STATUS_GARANTIA,
    perfisUsuario: PERFIS_USUARIO,
  };
}
