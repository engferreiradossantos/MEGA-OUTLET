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
