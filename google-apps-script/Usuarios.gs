/**
 * MEGA OUTLET — Módulo de Usuários: login, senha e perfis de acesso.
 *
 * Colunas da aba Usuarios:
 *   A ID_Usuario | B Login | C Nome | D Perfil | E Ativo (Sim/Não)
 *   F Salt | G Senha_Hash
 *
 * Segurança:
 *   * Senhas NUNCA são gravadas em texto puro — armazena-se um hash
 *     SHA-256 iterado (1.000 rodadas) com salt aleatório por usuário;
 *   * O login devolve um TOKEN de sessão guardado no CacheService por
 *     até 6 horas; toda chamada de servidor exige o token e o valida
 *     junto com o perfil do usuário;
 *   * Importante: quem tem acesso de EDIÇÃO à planilha consegue ver os
 *     dados das abas. Para proteção real, compartilhe a planilha apenas
 *     com o dono/administrador — o login controla o uso do SISTEMA
 *     (PDV, caixa, usuários), perfil por perfil.
 */

// Índices das colunas da aba Usuarios (0-based)
const COL_USU = { ID: 0, LOGIN: 1, NOME: 2, PERFIL: 3, ATIVO: 4,
                  SALT: 5, HASH: 6 };

const ITERACOES_HASH_SENHA = 1000;   // rodadas de SHA-256 sobre salt+senha
const TAMANHO_MINIMO_SENHA = 6;
const DURACAO_SESSAO_SEGUNDOS = 21600; // 6h — máximo do CacheService

// ---------------------------------------------------------------------------
// Hash de senha
// ---------------------------------------------------------------------------

/** Converte o byte[] do computeDigest em string hexadecimal. */
function bytesParaHex_(bytes) {
  return bytes.map(function (b) {
    const valor = b < 0 ? b + 256 : b; // bytes vêm com sinal (-128..127)
    return ('0' + valor.toString(16)).slice(-2);
  }).join('');
}

/** Hash SHA-256 iterado de salt+senha (hex). */
function gerarHashSenha_(senha, salt) {
  let texto = String(salt) + String(senha);
  for (let i = 0; i < ITERACOES_HASH_SENHA; i++) {
    texto = bytesParaHex_(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8));
  }
  return texto;
}

// ---------------------------------------------------------------------------
// Leitura da aba
// ---------------------------------------------------------------------------

/** Lê todos os usuários; `linha` é a linha real na planilha. */
function lerUsuarios_() {
  const aba = obterAba_(ABAS.USUARIOS);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  const dados = aba.getRange(2, 1, ultimaLinha - 1, 7).getValues();
  const usuarios = [];
  dados.forEach(function (v, indice) {
    if (v[COL_USU.ID] === '') return;
    usuarios.push({
      idUsuario: Number(v[COL_USU.ID]),
      login: String(v[COL_USU.LOGIN]).trim().toLowerCase(),
      nome: String(v[COL_USU.NOME]),
      perfil: String(v[COL_USU.PERFIL]),
      ativo: String(v[COL_USU.ATIVO]).trim().toLowerCase() === 'sim',
      salt: String(v[COL_USU.SALT]),
      senhaHash: String(v[COL_USU.HASH]),
      linha: indice + 2,
    });
  });
  return usuarios;
}

/** Mapa {idUsuario -> nome} para o recibo ("Atendido por"). */
function mapaNomesUsuarios_() {
  const mapa = {};
  lerUsuarios_().forEach(function (u) { mapa[u.idUsuario] = u.nome; });
  return mapa;
}

// ---------------------------------------------------------------------------
// Sessão (token via CacheService)
// ---------------------------------------------------------------------------

/**
 * Valida um token de sessão e (opcionalmente) o perfil exigido.
 * Devolve {idUsuario, login, nome, perfil} ou lança erro.
 */
function validarSessao_(token, perfisPermitidos) {
  const dados = token &&
    CacheService.getScriptCache().get('sessao_' + token);
  if (!dados) {
    throw new Error('Sessão expirada ou inválida — faça login novamente.');
  }
  const usuario = JSON.parse(dados);
  if (perfisPermitidos && perfisPermitidos.indexOf(usuario.perfil) === -1) {
    throw new Error('Acesso restrito ao(s) perfil(is): ' +
                    perfisPermitidos.join(', ') +
                    '. Seu perfil é ' + usuario.perfil + '.');
  }
  return usuario;
}

/**
 * Autentica login/senha e devolve {token, nome, perfil}.
 * Mensagem de erro única para login inexistente, senha errada e usuário
 * desativado — de propósito, para não revelar quais logins existem.
 */
function loginUsuario(login, senha) {
  login = String(login || '').trim().toLowerCase();
  const usuario = lerUsuarios_().filter(function (u) {
    return u.login === login;
  })[0];

  const mensagem = 'Login ou senha inválidos, ou usuário desativado.';
  if (!usuario || !usuario.ativo) throw new Error(mensagem);
  if (gerarHashSenha_(senha, usuario.salt) !== usuario.senhaHash) {
    throw new Error(mensagem);
  }

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sessao_' + token,
    JSON.stringify({ idUsuario: usuario.idUsuario, login: usuario.login,
                     nome: usuario.nome, perfil: usuario.perfil }),
    DURACAO_SESSAO_SEGUNDOS);
  return { token: token, nome: usuario.nome, perfil: usuario.perfil };
}

/** Encerra a sessão (botão "Sair" das telas). */
function encerrarSessao(token) {
  if (token) CacheService.getScriptCache().remove('sessao_' + token);
  return true;
}

// ---------------------------------------------------------------------------
// Cadastro e gestão
// ---------------------------------------------------------------------------

/** True se já existe algum usuário (controla a tela de primeiro acesso). */
function existeAlgumUsuario() {
  return lerUsuarios_().length > 0;
}

/** Validações comuns de cadastro; devolve os campos normalizados. */
function validarDadosUsuario_(dados) {
  const login = String(dados.login || '').trim().toLowerCase();
  const nome = String(dados.nome || '').trim();
  const senha = String(dados.senha || '');
  if (!login || !nome) throw new Error('Login e nome são obrigatórios.');
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new Error('A senha deve ter pelo menos ' +
                    TAMANHO_MINIMO_SENHA + ' caracteres.');
  }
  return { login: login, nome: nome, senha: senha };
}

/** Insere a linha do usuário (chamador já detém o lock). */
function inserirUsuario_(login, nome, senha, perfil) {
  const aba = obterAba_(ABAS.USUARIOS);
  const id = proximoId_(aba);
  const salt = Utilities.getUuid();
  aba.appendRow([id, login, nome, perfil, 'Sim', salt,
                 gerarHashSenha_(senha, salt)]);
  return id;
}

/**
 * PRIMEIRO ACESSO: cria o Administrador inicial — só funciona enquanto
 * não existe nenhum usuário. Devolve a sessão já autenticada.
 */
function criarAdministradorInicial(dados) {
  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    if (existeAlgumUsuario()) {
      throw new Error('Já existem usuários cadastrados — peça a um ' +
                      'Administrador para criar a sua conta.');
    }
    const campos = validarDadosUsuario_(dados);
    inserirUsuario_(campos.login, campos.nome, campos.senha, 'Administrador');
    SpreadsheetApp.flush();
  } finally {
    bloqueio.releaseLock();
  }
  return loginUsuario(dados.login, dados.senha); // login automático
}

/** Cadastra um usuário (exclusivo do Administrador). */
function criarUsuario(token, dados) {
  validarSessao_(token, ['Administrador']);
  if (PERFIS_USUARIO.indexOf(dados.perfil) === -1) {
    throw new Error('Perfil inválido: ' + dados.perfil);
  }
  const campos = validarDadosUsuario_(dados);

  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const jaExiste = lerUsuarios_().some(function (u) {
      return u.login === campos.login;
    });
    if (jaExiste) {
      throw new Error('Já existe um usuário com o login "' +
                      campos.login + '".');
    }
    const id = inserirUsuario_(campos.login, campos.nome, campos.senha,
                               dados.perfil);
    SpreadsheetApp.flush();
    return { idUsuario: id };
  } finally {
    bloqueio.releaseLock();
  }
}

/** Lista os usuários SEM salt/hash (exclusivo do Administrador). */
function listarUsuarios(token) {
  validarSessao_(token, ['Administrador']);
  return lerUsuarios_().map(function (u) {
    return { idUsuario: u.idUsuario, login: u.login, nome: u.nome,
             perfil: u.perfil, ativo: u.ativo };
  });
}

/** Redefine a senha de um usuário (exclusivo do Administrador). */
function definirSenha(token, idUsuario, novaSenha) {
  validarSessao_(token, ['Administrador']);
  if (String(novaSenha || '').length < TAMANHO_MINIMO_SENHA) {
    throw new Error('A senha deve ter pelo menos ' +
                    TAMANHO_MINIMO_SENHA + ' caracteres.');
  }
  const usuario = lerUsuarios_().filter(function (u) {
    return u.idUsuario === Number(idUsuario);
  })[0];
  if (!usuario) throw new Error('Usuário ' + idUsuario + ' não encontrado.');

  const aba = obterAba_(ABAS.USUARIOS);
  const salt = Utilities.getUuid();
  aba.getRange(usuario.linha, COL_USU.SALT + 1).setValue(salt);
  aba.getRange(usuario.linha, COL_USU.HASH + 1)
    .setValue(gerarHashSenha_(novaSenha, salt));
  SpreadsheetApp.flush();
  return true;
}

/**
 * Ativa/desativa um usuário (exclusivo do Administrador). Impede
 * desativar o ÚLTIMO administrador ativo do sistema.
 */
function definirAtivo(token, idUsuario, ativo) {
  validarSessao_(token, ['Administrador']);
  const usuarios = lerUsuarios_();
  const usuario = usuarios.filter(function (u) {
    return u.idUsuario === Number(idUsuario);
  })[0];
  if (!usuario) throw new Error('Usuário ' + idUsuario + ' não encontrado.');

  if (!ativo && usuario.perfil === 'Administrador') {
    const outrosAdminsAtivos = usuarios.filter(function (u) {
      return u.perfil === 'Administrador' && u.ativo &&
             u.idUsuario !== usuario.idUsuario;
    }).length;
    if (outrosAdminsAtivos === 0) {
      throw new Error('Não é possível desativar o único administrador ativo.');
    }
  }

  obterAba_(ABAS.USUARIOS)
    .getRange(usuario.linha, COL_USU.ATIVO + 1)
    .setValue(ativo ? 'Sim' : 'Não');
  SpreadsheetApp.flush();
  return true;
}
