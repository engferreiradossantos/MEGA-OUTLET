/**
 * MEGA OUTLET — Módulo de Clientes (cadastro de clientes).
 *
 * Colunas da aba Clientes:
 *   A ID_Cliente | B Nome | C CPF | D Telefone | E Email
 *   F Endereco | G Observacoes
 *
 * Todos os perfis podem consultar e cadastrar clientes (o vendedor
 * cadastra o cliente na hora da venda/orçamento).
 */

const COL_CLI = { ID: 0, NOME: 1, CPF: 2, TEL: 3, EMAIL: 4, END: 5, OBS: 6 };

/** Lê todos os clientes; `linha` é a linha real na planilha. */
function lerClientes_() {
  const aba = obterAba_(ABAS.CLIENTES);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  const dados = aba.getRange(2, 1, ultimaLinha - 1, 7).getValues();
  const clientes = [];
  dados.forEach(function (v, indice) {
    if (v[COL_CLI.ID] === '') return;
    clientes.push({
      idCliente: Number(v[COL_CLI.ID]),
      nome: String(v[COL_CLI.NOME]),
      cpf: String(v[COL_CLI.CPF]),
      telefone: String(v[COL_CLI.TEL]),
      email: String(v[COL_CLI.EMAIL]),
      endereco: String(v[COL_CLI.END]),
      observacoes: String(v[COL_CLI.OBS]),
      linha: indice + 2,
    });
  });
  return clientes;
}

/** Lista todos os clientes (qualquer perfil logado). */
function listarClientes(token) {
  validarSessao_(token, PERFIS_USUARIO);
  return lerClientes_().map(function (c) {
    return { idCliente: c.idCliente, nome: c.nome, cpf: c.cpf,
             telefone: c.telefone, email: c.email, endereco: c.endereco,
             observacoes: c.observacoes };
  });
}

/** Busca clientes por nome, CPF ou telefone (máx. 30 resultados). */
function buscarClientes(termo, token) {
  validarSessao_(token, PERFIS_USUARIO);
  termo = String(termo || '').trim().toLowerCase();
  if (!termo) return [];
  return listarClientes(token).filter(function (c) {
    return c.nome.toLowerCase().indexOf(termo) !== -1 ||
           c.cpf.toLowerCase().indexOf(termo) !== -1 ||
           c.telefone.toLowerCase().indexOf(termo) !== -1;
  }).slice(0, 30);
}

/**
 * Cria ou atualiza um cliente. Se `dados.idCliente` vier preenchido,
 * atualiza o registro existente; caso contrário, cadastra um novo.
 * Devolve { idCliente }.
 */
function salvarCliente(token, dados) {
  validarSessao_(token, PERFIS_USUARIO);
  const nome = String(dados.nome || '').trim();
  if (!nome) throw new Error('O nome do cliente é obrigatório.');

  const linhaDados = [
    nome,
    String(dados.cpf || '').trim(),
    String(dados.telefone || '').trim(),
    String(dados.email || '').trim(),
    String(dados.endereco || '').trim(),
    String(dados.observacoes || '').trim(),
  ];

  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const aba = obterAba_(ABAS.CLIENTES);

    if (dados.idCliente) {
      // Atualização de cliente existente
      const cliente = lerClientes_().filter(function (c) {
        return c.idCliente === Number(dados.idCliente);
      })[0];
      if (!cliente) {
        throw new Error('Cliente ' + dados.idCliente + ' não encontrado.');
      }
      aba.getRange(cliente.linha, 2, 1, 6).setValues([linhaDados]);
      SpreadsheetApp.flush();
      return { idCliente: cliente.idCliente };
    }

    // Novo cadastro
    const id = proximoId_(aba);
    aba.appendRow([id].concat(linhaDados));
    SpreadsheetApp.flush();
    return { idCliente: id };
  } finally {
    bloqueio.releaseLock();
  }
}
