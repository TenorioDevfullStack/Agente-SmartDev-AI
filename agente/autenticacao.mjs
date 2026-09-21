import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derivar = promisify(scrypt);
const DURACAO = 8 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');
export const publico = u => ({ id: u._id, nome: u.nome, login: u.login, papel: u.papel, trocarSenha: !!u.trocarSenha, ativo: u.ativo });
export async function hashSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derivar(senha, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verificarSenha(senha, salvo) {
  if (typeof senha !== 'string' || senha.length > 256 || !salvo) return false;
  const [salt, valor] = salvo.split(':');
  const atual = await derivar(senha, salt, 64);
  const esperado = Buffer.from(valor, 'hex');
  return atual.length === esperado.length && timingSafeEqual(atual, esperado);
}
const senhaValida = s => typeof s === 'string' && s.length >= 12 && s.length <= 256;

export async function criarAutenticacao(db, Router, senhaInicial) {
  const users = db.collection('painel_usuarios');
  const sessions = db.collection('painel_sessoes');
  const tentativas = db.collection('painel_login_tentativas');
  const audit = db.collection('painel_auditoria');
  await users.createIndex({ login: 1 }, { unique: true });
  await sessions.createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 });
  await tentativas.createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 });
  await audit.createIndex({ numero: 1, em: -1 });
  if (!(await users.findOne({ _id: 'administrador-inicial' })) && senhaInicial) {
    await users.updateOne({ _id: 'administrador-inicial' }, { $setOnInsert: {
      login: 'admin', nome: 'Administrador', papel: 'admin', ativo: true, trocarSenha: true,
      senhaHash: await hashSenha(senhaInicial), versao: 1, criadoEm: new Date(),
    } }, { upsert: true });
  }
  const hashFalso = await hashSenha(randomBytes(32).toString('hex'));
  const router = Router();
  const seguro = req => !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.get('host') || '');
  const cookieOpts = req => ({ httpOnly: true, sameSite: 'strict', secure: seguro(req), path: '/api' });
  const cookie = req => (req.get('cookie') || '').split(';').map(p => p.trim()).find(p => p.startsWith('painel_session='))?.slice(15) || '';
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  async function sessao(req, res, u) {
    const token = randomBytes(32).toString('hex');
    await sessions.insertOne({ _id: digest(token), usuarioId: u._id, versao: u.versao, expiraEm: new Date(Date.now() + DURACAO) });
    res.cookie('painel_session', token, { ...cookieOpts(req), maxAge: DURACAO });
  }
  const autenticar = wrap(async (req, res, next) => {
    const token = cookie(req);
    const session = token && await sessions.findOne({ _id: digest(token), expiraEm: { $gt: new Date() } });
    const u = session && await users.findOne({ _id: session.usuarioId, ativo: true, versao: session.versao });
    if (!u) return res.status(401).json({ erro: 'Entre com seu usuário e senha.' });
    req.usuario = publico(u);
    req.usuarioInterno = u;
    next();
  });
  function csrf(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-painel-request') !== '1') return res.status(403).json({ erro: 'Requisição não autorizada.' });
    next();
  }
  function acessoCompleto(req, res, next) {
    if (req.usuario.trocarSenha) return res.status(403).json({ erro: 'Defina sua senha pessoal antes de continuar.', codigo: 'trocar_senha' });
    next();
  }
  function admin(req, res, next) {
    if (req.usuario.papel !== 'admin') return res.status(403).json({ erro: 'Apenas o administrador pode gerenciar a equipe.' });
    next();
  }
  async function limite(chave, maximo) {
    const janela = Math.floor(Date.now() / 900000);
    const item = await tentativas.findOneAndUpdate({ _id: digest(`${janela}:${chave}`) }, {
      $inc: { total: 1 }, $setOnInsert: { expiraEm: new Date((janela + 2) * 900000) },
    }, { upsert: true, returnDocument: 'after' });
    return item.total <= maximo;
  }
  router.use(csrf);
  router.post('/login', wrap(async (req, res) => {
    const login = String(req.body?.login || '').trim().toLowerCase();
    if (!(await limite(`ip:${req.ip}`, 60)) || !(await limite(`usuario:${login}`, 10))) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde até 15 minutos para tentar novamente.' });
    const u = await users.findOne({ login, ativo: true });
    const ok = await verificarSenha(req.body?.senha, u?.senhaHash || hashFalso);
    if (!ok || !u) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    const anterior = cookie(req);
    if (anterior) await sessions.deleteOne({ _id: digest(anterior) });
    await sessao(req, res, u);
    await audit.insertOne({ em: new Date(), usuario: publico(u), acao: 'login', estado: 'concluida' });
    res.json({ usuario: publico(u) });
  }));
  router.post('/logout', wrap(async (req, res) => {
    const token = cookie(req);
    if (token) await sessions.deleteOne({ _id: digest(token) });
    res.clearCookie('painel_session', cookieOpts(req));
    res.json({ ok: true });
  }));
  router.use(autenticar);
  router.get('/me', (req, res) => res.json({ usuario: req.usuario }));
  router.post('/senha', wrap(async (req, res) => {
    if (!(await limite(`senha:${req.usuario.id}`, 10))) return res.status(429).json({ erro: 'Muitas tentativas de senha. Aguarde 15 minutos.' });
    if (!senhaValida(req.body?.novaSenha)) return res.status(400).json({ erro: 'Use uma senha de 12 a 256 caracteres.' });
    if (!(await verificarSenha(req.body?.senhaAtual, req.usuarioInterno.senhaHash))) return res.status(400).json({ erro: 'Senha atual incorreta.' });
    if (req.body.senhaAtual === req.body.novaSenha) return res.status(400).json({ erro: 'Escolha uma senha diferente da atual.' });
    const nome = String(req.body.nome || req.usuario.nome).trim();
    if (!nome || nome.length > 100) return res.status(400).json({ erro: 'Informe seu nome (até 100 caracteres).' });
    await users.updateOne({ _id: req.usuario.id }, { $set: { nome, senhaHash: await hashSenha(req.body.novaSenha), trocarSenha: false }, $inc: { versao: 1 } });
    await sessions.deleteMany({ usuarioId: req.usuario.id });
    const u = await users.findOne({ _id: req.usuario.id });
    await sessao(req, res, u);
    await audit.insertOne({ em: new Date(), usuario: publico(u), acao: 'alterar_senha', estado: 'concluida' });
    res.json({ usuario: publico(u) });
  }));
  router.use(acessoCompleto, admin);
  router.get('/usuarios', wrap(async (_req, res) => res.json((await users.find({}).sort({ criadoEm: 1 }).toArray()).map(publico))));
  router.post('/usuarios', wrap(async (req, res) => {
    const login = String(req.body?.login || '').trim().toLowerCase();
    const nome = String(req.body?.nome || '').trim();
    if (!/^[a-z0-9._-]{3,64}$/.test(login) || !nome || nome.length > 100 || !senhaValida(req.body?.senha)) return res.status(400).json({ erro: 'Informe nome, login de 3 a 64 caracteres (letras, números, ponto, hífen ou _) e senha temporária de pelo menos 12 caracteres.' });
    const u = { _id: randomUUID(), login, nome, papel: 'atendente', ativo: true, trocarSenha: true, versao: 1, criadoEm: new Date(), senhaHash: await hashSenha(req.body.senha) };
    try { await users.insertOne(u); } catch (err) { if (err.code === 11000) return res.status(409).json({ erro: 'Esse login já existe.' }); throw err; }
    await audit.insertOne({ em: new Date(), usuario: req.usuario, acao: 'criar_usuario', alvo: u._id, estado: 'concluida' });
    res.status(201).json(publico(u));
  }));
  router.patch('/usuarios/:id', wrap(async (req, res) => {
    const u = await users.findOne({ _id: req.params.id, papel: 'atendente' });
    if (!u) return res.status(404).json({ erro: 'Atendente não encontrado.' });
    const mudanca = {};
    if (typeof req.body?.ativo === 'boolean') mudanca.ativo = req.body.ativo;
    if (req.body?.senha != null) {
      if (!senhaValida(req.body.senha)) return res.status(400).json({ erro: 'Use uma senha temporária de pelo menos 12 caracteres.' });
      mudanca.senhaHash = await hashSenha(req.body.senha); mudanca.trocarSenha = true;
    }
    if (!Object.keys(mudanca).length) return res.status(400).json({ erro: 'Nenhuma alteração informada.' });
    await users.updateOne({ _id: u._id }, { $set: mudanca, $inc: { versao: 1 } });
    await sessions.deleteMany({ usuarioId: u._id });
    await audit.insertOne({ em: new Date(), usuario: req.usuario, acao: req.body.senha ? 'redefinir_senha' : 'alterar_acesso', alvo: u._id, estado: 'concluida' });
    res.json({ ok: true });
  }));
  router.get('/auditoria', wrap(async (_req, res) => res.json(await audit.find({}).sort({ em: -1 }).limit(100).toArray())));

  const auditar = wrap(async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const id = randomUUID();
    const numero = req.path.match(/^\/conversas\/(\d+)/)?.[1] || null;
    const acao = req.path.startsWith('/prospeccao') ? 'gerenciar_prospeccao' : req.path.endsWith('/mensagem') ? 'responder' : req.path.endsWith('/pausa') ? (req.body?.pausado ? 'assumir' : 'devolver') : req.method === 'DELETE' ? 'reiniciar_memoria' : req.path.endsWith('/resolver') ? 'revisar_fila' : 'testar_ia';
    await audit.insertOne({ _id: id, em: new Date(), usuario: req.usuario, numero, acao, estado: 'iniciada' });
    res.once('finish', () => {
      audit.updateOne({ _id: id }, { $set: { estado: res.statusCode < 400 ? 'concluida' : 'falhou', http: res.statusCode, concluidoEm: new Date() } }).catch(() => console.error('[AUDITORIA] Não foi possível confirmar o resultado de uma ação.'));
    });
    next();
  });
  return { router, autenticar, acessoCompleto, csrf, auditar };
}
