/**
 * MEGA OUTLET — Módulo de Fluxo de Caixa (requisitos 2.2 e 3.2).
 *
 * Colunas da aba Fluxo_Caixa:
 *   A ID_Lancamento | B Data_Hora | C Tipo | D Categoria | E Valor
 *   F Forma_Pagamento | G ID_Venda (vazio em lançamentos manuais)
 */

/**
 * Insere um lançamento no Fluxo_Caixa SEM bloqueio próprio — usada por
 * `registrarVenda` (que já detém o lock) e por `registrarLancamentoManual`.
 *
 * @param {Object} dados { tipo, categoria, valor, formaPagamento, idVenda? }
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
    dados.formaPagamento, dados.idVenda || '',
  ]);
  return idLancamento;
}

/**
 * Lançamento manual de Entrada/Saída (regra 3.2 — "Conciliação").
 * Chamada pelo Lancamento.html via google.script.run.
 */
function registrarLancamentoManual(dados) {
  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const id = inserirLancamentoCaixa_(dados);
    SpreadsheetApp.flush();
    return { idLancamento: id };
  } finally {
    bloqueio.releaseLock();
  }
}

/** Listas de opções para os formulários HTML (PDV e Lançamento manual). */
function obterOpcoesFormularios() {
  return {
    formasPagamento: FORMAS_PAGAMENTO,
    formasEntrega: FORMAS_ENTREGA,
    tiposLancamento: TIPOS_LANCAMENTO,
    categoriasCaixa: CATEGORIAS_CAIXA,
  };
}
