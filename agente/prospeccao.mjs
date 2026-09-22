import { randomUUID } from 'node:crypto';
import { importarArquivo, telefoneBR } from './prospeccao-importacao.mjs';
import { validarOferta, pedeHumano } from './prospeccao-vendas.mjs';
import { criarPromocao, OFERTA_LANCAMENTO } from './prospeccao-oferta.mjs';

export function classificarResposta(texto) {
  const t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(pare|parar|sair|stop|remova|remover|descadastrar)\b|nao (tenho|temos) interesse|nao (mande|envie)|nao quero/.test(t)) return 'nao_contatar';
  if (/\b(digite|selecione|escolha uma opcao|mensagem automatica)\b|sou (o |a |um |uma )?assistente virtual|informe (seu |o )?cpf/.test(t)) return 'provavel_bot';
  if (/tenho interesse|temos interesse|pode (apresentar|mostrar|explicar)|quero conhecer|quanto custa/.test(t)) return 'interessado';
  return 'respondeu';
}

export function emHorarioComercial(agora) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
  const dia = partes.find(p => p.type === 'weekday').value;
  const hora = Number(partes.find(p => p.type === 'hour').value);
  return !['Sat', 'Sun'].includes(dia) && hora >= 9 && hora < 18;
}
export function emJanelaCampanha(agora, janela = {}) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
  const dia = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }[p.find(x => x.type === 'weekday').value];
  const minuto = Number(p.find(x => x.type === 'hour').value) * 60 + Number(p.find(x => x.type === 'minute').value);
  const dias = Array.isArray(janela.dias) && janela.dias.length ? janela.dias : [1, 2, 3, 4, 5];
  const toMin = (v, fallback) => /^\d{2}:\d{2}$/.test(v || '') ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3)) : fallback;
  return dias.includes(dia) && minuto >= toMin(janela.inicio, 540) && minuto < toMin(janela.fim, 1080);
}

export function criarProspeccao(db, { transporte, registrarSaida, vendas, agora = () => new Date(), promocao = criarPromocao(db, agora) }) {
  const campanhas = db.collection('prospeccao_campanhas');
  const contatos = db.collection('prospeccao_contatos');
  const previas = db.collection('prospeccao_previas');
  const auditoria = db.collection('painel_auditoria');
  let timer, parado = true, cadeia = Promise.resolve();
  const exclusivo = fn => { const p = cadeia.then(fn); cadeia = p.catch(() => {}); return p; };
  const auditar = (usuario, acao, alvo, extra = {}) => auditoria.insertOne({ em: agora(), usuario, acao: `prospeccao_${acao}`, alvo, estado: 'concluida', ...extra });
  const diaAtual = () => agora().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const permiteDialogo = (campanha, contato) => ['ativa', 'concluida'].includes(campanha?.estado) || (campanha?.estado === 'pausada' && Boolean(contato?.retomadaIndividualEm));

  async function preparar() {
    await promocao.preparar();
    await previas.createIndex({ criadoEm: 1 }, { expireAfterSeconds: 3600 });
    await contatos.createIndex({ campanhaId: 1, estado: 1 });
    // Um envio em andamento no momento da queda pode ter sido aceito. Nunca repetir.
    await contatos.updateMany({ estado: 'enviando' }, { $set: { estado: 'revisao', observacao: 'Envio interrompido; confira o histórico. Não será reenviado.' } });
    await campanhas.updateMany({ estado: 'ativa' }, { $set: { estado: 'pausada', observacao: 'Servidor reiniciado. Revise e retome pelo painel.' } });
    await campanhas.updateMany({ estado: 'concluida', modo: 'automatico' }, { $set: { estado: 'pausada', observacao: 'Servidor reiniciado. Retome as conversas comerciais pelo painel.' } });
    await contatos.updateMany({ retomadaIndividualEm: { $exists: true } }, { $unset: { retomadaIndividualEm: '' } });
    await contatos.updateMany({ envioVendaPendente: true }, { $set: { estado: 'revisao', observacao: 'Resposta comercial interrompida. Confira a conversa antes de retomar.' } });
    await campanhas.updateMany({ estado: 'importando' }, { $set: { estado: 'rascunho', observacao: 'Importação interrompida. Confira os contatos importados.' } });
  }

  async function executar() {
    return exclusivo(async () => {
      const c = await campanhas.findOne({ estado: 'ativa' });
      if (!c || parado || !emJanelaCampanha(agora(), c.janela) || (c.proximoEm && c.proximoEm > agora())) return;
      const usuario = await db.collection('painel_usuarios').findOne({ _id: c.usuario.id, ativo: true, papel: 'admin' });
      if (!usuario) { await campanhas.updateOne({ _id: c._id }, { $set: { estado: 'pausada', observacao: 'Administrador sem acesso ativo.' } }); return; }
      const enviadosHoje = await contatos.countDocuments({ diaTentativa: diaAtual() });
      if (enviadosHoje >= 20) return;
      let modelo;
      try { modelo = await transporte.modelo(c.modeloNome, c.modeloIdioma); }
      catch { await campanhas.updateOne({ _id: c._id }, { $set: { estado: 'pausada', observacao: 'Não foi possível validar conexão e modelo aprovado.' } }); return; }
      if (modelo.texto !== c.modeloTexto) { await campanhas.updateOne({ _id: c._id }, { $set: { estado: 'pausada', observacao: 'O modelo mudou. Crie uma nova campanha para revisar o conteúdo.' } }); return; }
      const p = await contatos.findOneAndUpdate({ campanhaId: c._id, estado: 'aprovado', autorizado: true }, { $set: { estado: 'enviando', tentativaEm: agora(), diaTentativa: diaAtual() } }, { returnDocument: 'after', sort: { criadoEm: 1 } });
      if (!p) { await campanhas.updateOne({ _id: c._id }, { $set: { estado: 'concluida' } }); return; }
      await campanhas.updateOne({ _id: c._id }, { $set: { proximoEm: new Date(agora().getTime() + 60000) } });
      try {
        const conversa = await db.collection('conversas').findOne({ _id: p._id });
        const atual = await contatos.findOne({ _id: p._id });
        if (conversa?.pausado || atual?.estado !== 'enviando') {
          await contatos.updateOne({ _id: p._id, estado: 'enviando' }, { $set: { estado: 'revisao', observacao: 'Contato com intervenção humana. Envio cancelado.' } }); return;
        }
        // Persistir intenção antes da chamada externa; até timeouts exigem revisão.
        await auditar(c.usuario, 'tentativa_envio', p._id, { campanhaId: c._id });
        const resultado = await transporte.enviar(p._id, modelo, p.empresa);
        if (!resultado?.id) throw new Error('Sem confirmação do provedor');
        await contatos.updateOne({ _id: p._id }, { $set: { enviadoEm: agora(), mensagemId: resultado.id } });
        await contatos.updateOne({ _id: p._id, estado: 'enviando' }, { $set: { estado: 'enviado' } });
        await registrarSaida(p._id, resultado.texto, c.usuario);
        await auditar(c.usuario, 'envio_aceito', p._id, { campanhaId: c._id, mensagemId: resultado.id });
      } catch {
        await contatos.updateOne({ _id: p._id, estado: { $in: ['enviando', 'enviado'] } }, { $set: { estado: 'revisao', observacao: 'Resultado incerto ou falha no registro. Confira a conversa; não haverá reenvio automático.' } });
        await campanhas.updateOne({ _id: c._id }, { $set: { estado: 'pausada', observacao: 'Envio exige revisão.' } });
      }
    });
  }

  async function receber(numero, texto) {
    const p = await contatos.findOne({ _id: numero });
    if (!p) return false;
    const c = await campanhas.findOne({ _id: p.campanhaId });
    const classificacao = classificarResposta(texto);
    const terminais = ['nao_contatar', 'revisao', 'humano', 'provavel_bot', 'pedido_contratacao', 'contratado'];
    const automatica = c?.modo === 'automatico' && permiteDialogo(c, p) && p.autorizado && p.enviadoEm && !terminais.includes(p.estado);
    const excecao = pedeHumano(texto) || String(texto).startsWith('[Mensagem de mídia');
    const estado = classificacao === 'nao_contatar' ? classificacao : terminais.includes(p.estado) ? p.estado : automatica && !excecao && classificacao !== 'provavel_bot' ? 'conversando' : excecao ? 'humano' : classificacao;
    await contatos.updateOne({ _id: numero }, { $set: { estado, ultimaResposta: String(texto).slice(0, 2000), respostaEm: agora(), ...(estado === 'nao_contatar' ? { autorizado: false } : {}) } });
    if (estado !== 'conversando') await db.collection('conversas').updateOne({ _id: numero }, { $set: { pausado: true, pausaOrigem: 'prospeccao' } }, { upsert: true });
    return true;
  }

  async function retomarConversa(numero, usuario) {
    const p = await contatos.findOne({ _id: numero });
    if (!p) return { prospecto: false };
    const c = await campanhas.findOne({ _id: p.campanhaId });
    if (!p.autorizado || !p.enviadoEm || p.envioVendaPendente || ['nao_contatar', 'revisao', 'contratado'].includes(p.estado) || c?.modo !== 'automatico' || !['ativa', 'concluida', 'pausada'].includes(c.estado) || (p.turnosVenda || 0) >= 20) {
      return { prospecto: true, ok: false, erro: 'Retomada indisponível: confira campanha, autorização, limite e envios pendentes.' };
    }
    await contatos.updateOne({ _id: p._id }, { $set: { estado: 'conversando', etapaVenda: p.etapaVenda === 'humano' ? 'retomado' : p.etapaVenda, retomadaIndividualEm: agora(), observacao: 'Retomado pelo administrador. Aguardando nova mensagem do contato.' } });
    await db.collection('conversas').updateOne({ _id: p._id }, { $set: { pausado: false, pausaOrigem: null, responsavel: null }, $inc: { versaoHumana: 1 } }, { upsert: true });
    await auditar(usuario, 'retomar_conversa', p._id);
    return { prospecto: true, ok: true };
  }

  function rotas(router, express) {
    router.use((req, res, next) => req.usuario?.papel === 'admin' ? next() : res.status(403).json({ erro: 'Somente administradores podem gerenciar prospecção.' }));
    const rota = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
    router.get('/', rota(async (_req, res) => res.json({ campanhas: await campanhas.find({}).sort({ criadoEm: -1 }).limit(100).toArray() })));
    router.get('/prospectos', rota(async (req, res) => {
      const pagina = Math.max(1, Math.min(10000, Number.parseInt(req.query.pagina, 10) || 1));
      const filtro = {};
      const busca = String(req.query.busca || '').trim().slice(0, 100);
      if (busca) { const regex = busca.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&'); filtro.$or = [{ empresa: { $regex: regex, $options: 'i' } }, { _id: { $regex: regex } }]; }
      if (req.query.grupo === 'pendentes') filtro.tentativaEm = { $exists: false };
      if (req.query.grupo === 'contatados') filtro.tentativaEm = { $exists: true };
      if (req.query.grupo === 'responderam') filtro.respostaEm = { $exists: true };
      if (req.query.grupo === 'bloqueados') filtro.estado = 'nao_contatar';
      const lista = await contatos.find(filtro).sort({ criadoEm: -1, _id: 1 }).skip((pagina - 1) * 25).limit(25).toArray();
      const ids = [...new Set(lista.map(p => p.campanhaId))];
      const cs = await campanhas.find({ _id: { $in: ids } }).project({ nome: 1 }).toArray();
      res.json({ contatos: lista.map(p => ({ ...p, campanhaNome: cs.find(c => c._id === p.campanhaId)?.nome || 'Campanha indisponível' })), pagina, total: await contatos.countDocuments(filtro), totais: { todos: await contatos.countDocuments({}), contatados: await contatos.countDocuments({ tentativaEm: { $exists: true } }), responderam: await contatos.countDocuments({ respostaEm: { $exists: true } }), pendentes: await contatos.countDocuments({ tentativaEm: { $exists: false } }) } });
    }));
    router.post('/campanhas/nova', rota(async (req, res) => exclusivo(async () => {
      const nome = String(req.body?.nome || '').trim().slice(0, 100);
      if (!nome) return res.status(400).json({ erro: 'Informe o nome da campanha.' });
      const id = randomUUID();
      await campanhas.insertOne({ _id: id, nome, estado: 'rascunho', criadoEm: agora(), usuario: req.usuario, importados: 0 });
      await auditar(req.usuario, 'criar', id); res.status(201).json({ id });
    })));
    router.get('/oferta-padrao', rota(async (_req, res) => res.json({ oferta: OFERTA_LANCAMENTO, promocao: await promocao.status() })));
    router.get('/modelos', rota(async (_req, res) => {
      try { res.json({ modelos: await transporte.listar() }); }
      catch { res.json({ modelos: [], aviso: 'Configure a conexão da Evolution e um texto de campanha; API oficial exige modelo de marketing aprovado. Baileys exige confirmação explícita do risco.' }); }
    }));
    let importando = false;
    router.post('/previa', express.raw({ type: 'application/octet-stream', limit: '2mb' }), rota(async (req, res) => {
      if (importando) return res.status(409).json({ erro: 'Uma planilha está sendo processada. Aguarde.' });
      importando = true;
      try {
        const nome = decodeURIComponent(String(req.headers['x-arquivo-nome'] || ''));
        const linhas = await importarArquivo(nome, req.body);
        const existentes = new Set((await contatos.find({ _id: { $in: linhas.map(l => l.numero).filter(Boolean) } }).project({ _id: 1 }).toArray()).map(p => p._id));
        for (const l of linhas) if (!l.erro && existentes.has(l.numero)) l.erro = 'Telefone já cadastrado na prospecção';
        const previa = { _id: randomUUID(), usuarioId: req.usuario.id, criadoEm: agora(), linhas };
        await previas.insertOne(previa); res.json({ id: previa._id, linhas });
      } catch (err) { res.status(400).json({ erro: err.message }); }
      finally { importando = false; }
    }));
    router.post('/campanhas', rota(async (req, res) => exclusivo(async () => {
      const previa = await previas.findOne({ _id: String(req.body?.previaId || ''), usuarioId: req.usuario.id, criadoEm: { $gt: new Date(agora().getTime() - 3600000) } });
      const nome = String(req.body?.nome || '').trim().slice(0, 100);
      if (!previa || !nome) return res.status(400).json({ erro: 'Informe o nome e importe novamente se a prévia expirou.' });
      const linhas = previa.linhas.filter(l => !l.erro);
      if (!linhas.length) return res.status(400).json({ erro: 'Nenhum contato válido para importar.' });
      const id = randomUUID();
      await campanhas.insertOne({ _id: id, nome, estado: 'importando', criadoEm: agora(), usuario: req.usuario });
      let inseridos = 0;
      for (const l of linhas) {
        const r = await contatos.updateOne({ _id: l.numero }, { $setOnInsert: { campanhaId: id, empresa: l.empresa, segmento: l.segmento, fonte: l.fonte, estado: 'pendente', autorizado: false, criadoEm: agora() } }, { upsert: true });
        inseridos += r.upsertedCount;
      }
      await campanhas.updateOne({ _id: id }, { $set: { estado: 'rascunho', importados: inseridos } });
      await previas.deleteOne({ _id: previa._id });
      await auditar(req.usuario, 'importar', id, { quantidade: inseridos });
      res.status(201).json({ id, inseridos });
    })));
    router.get('/campanhas/:id', rota(async (req, res) => {
      const campanha = await campanhas.findOne({ _id: req.params.id });
      if (!campanha) return res.status(404).json({ erro: 'Campanha não encontrada.' });
      res.json({ campanha, contatos: await contatos.find({ campanhaId: campanha._id }).sort({ criadoEm: 1 }).limit(1000).toArray(), promocao: await promocao.status() });
    }));
    router.post('/campanhas/:id/contatos', rota(async (req, res) => exclusivo(async () => {
      const c = await campanhas.findOne({ _id: req.params.id });
      if (!c || ['ativa', 'concluida'].includes(c.estado)) return res.status(400).json({ erro: 'Cadastre prospectos somente em campanha em rascunho ou pausada.' });
      const empresa = String(req.body?.empresa || '').trim().slice(0, 160); const numero = telefoneBR(req.body?.telefone);
      if (!empresa || !numero) return res.status(400).json({ erro: 'Informe empresa e telefone brasileiro com DDD.' });
      if (await contatos.findOne({ _id: numero })) return res.status(409).json({ erro: 'Este telefone já está cadastrado na prospecção.' });
      await contatos.insertOne({ _id: numero, campanhaId: c._id, empresa, segmento: String(req.body?.segmento || '').trim().slice(0, 160), fonte: String(req.body?.fonte || '').trim().slice(0, 160), estado: 'pendente', autorizado: false, criadoEm: agora() });
      await campanhas.updateOne({ _id: c._id }, { $inc: { importados: 1 } }); await auditar(req.usuario, 'cadastrar_contato', numero, { campanhaId: c._id }); res.status(201).json({ ok: true });
    })));
    router.patch('/campanhas/:id/oferta', rota(async (req, res) => exclusivo(async () => {
      const c = await campanhas.findOne({ _id: req.params.id });
      if (!c) return res.status(404).json({ erro: 'Campanha não encontrada.' });
      if (c.estado === 'ativa' || await contatos.countDocuments({ campanhaId: c._id, tentativaEm: { $exists: true } })) return res.status(409).json({ erro: 'Oferta bloqueada após o primeiro envio. Crie outra campanha para novas condições.' });
      if (!['assistido', 'automatico'].includes(req.body?.modo)) return res.status(400).json({ erro: 'Escolha o modo de atendimento.' });
      let oferta = null;
      try { if (req.body.modo === 'automatico') oferta = validarOferta(req.body.oferta); }
      catch (err) { return res.status(400).json({ erro: err.message }); }
      const janela = req.body.janela || c.janela || { dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00' };
      if (!Array.isArray(janela.dias) || janela.dias.some(d => !Number.isInteger(d) || d < 0 || d > 6) || !/^\d{2}:\d{2}$/.test(janela.inicio || '') || !/^\d{2}:\d{2}$/.test(janela.fim || '') || janela.inicio >= janela.fim) return res.status(400).json({ erro: 'Configure dias e uma janela de horário válida.' });
      await campanhas.updateOne({ _id: c._id }, { $set: { modo: req.body.modo, oferta, janela: { dias: [...new Set(janela.dias)].sort(), inicio: janela.inicio, fim: janela.fim } } });
      await auditar(req.usuario, 'configurar_oferta', c._id);
      res.json({ ok: true });
    })));
    router.post('/contatos/:numero/confirmar-contratacao', rota(async (req, res) => exclusivo(async () => {
      const p = await contatos.findOne({ _id: req.params.numero });
      const c = p && await campanhas.findOne({ _id: p.campanhaId });
      if (!p || !c?.oferta?.promocao) return res.status(400).json({ erro: 'Contato não pertence à oferta de lançamento.' });
      if (!p.pedidoEm || req.body?.contratoAceito !== true || req.body?.pagamentoConferido !== true) return res.status(400).json({ erro: 'É necessário um pedido de contratação, contrato aceito e pagamento conferido por você.' });
      let fechamento;
      try { fechamento = await promocao.confirmar({ clienteId: req.body.clienteId, numero: p._id, referencia: req.body.referencia, usuario: req.usuario }); }
      catch (err) { return res.status(409).json({ erro: err.message }); }
      await contatos.updateOne({ _id: p._id }, { $set: { estado: p.estado === 'nao_contatar' ? 'nao_contatar' : 'contratado', etapaVenda: 'contratado', fechamento } });
      await db.collection('conversas').updateOne({ _id: p._id }, { $set: { pausado: true, pausaOrigem: 'prospeccao' } }, { upsert: true });
      await auditar(req.usuario, 'confirmar_contratacao', p._id, { clienteId: fechamento.clienteId });
      res.json({ ok: true, promocao: await promocao.status() });
    })));
    router.patch('/contatos/:numero', rota(async (req, res) => exclusivo(async () => {
      const p = await contatos.findOne({ _id: req.params.numero });
      if (!p) return res.status(404).json({ erro: 'Contato não encontrado.' });
      if (req.body?.acao === 'bloquear') {
        await contatos.updateOne({ _id: p._id }, { $set: { estado: 'nao_contatar', autorizado: false } });
        await auditar(req.usuario, 'bloquear', p._id); return res.json({ ok: true });
      }
      if (req.body?.acao === 'humano') {
        await contatos.updateOne({ _id: p._id, estado: { $ne: 'nao_contatar' } }, { $set: { estado: 'humano' } });
        await db.collection('conversas').updateOne({ _id: p._id }, { $set: { pausado: true, pausaOrigem: 'prospeccao' }, $inc: { versaoHumana: 1 } }, { upsert: true });
        await auditar(req.usuario, 'assumir', p._id); return res.json({ ok: true });
      }
      if (req.body?.acao === 'retomar_conversa') {
        const retomada = await retomarConversa(p._id, req.usuario);
        if (!retomada.ok) return res.status(400).json({ erro: retomada.erro });
        return res.json({ ok: true });
      }
      const evidencia = String(req.body?.evidencia || '').trim();
      if (p.tentativaEm || p.estado === 'nao_contatar' || req.body?.acao !== 'aprovar' || evidencia.length < 10 || evidencia.length > 500) return res.status(400).json({ erro: 'Informe como e quando o destinatário autorizou o contato. Contatos bloqueados ou já tentados não podem ser reenviados.' });
      await contatos.updateOne({ _id: p._id }, { $set: { estado: 'aprovado', autorizado: true, evidencia, aprovadoEm: agora(), aprovadoPor: req.usuario } });
      await auditar(req.usuario, 'aprovar_contato', p._id); res.json({ ok: true });
    })));
    router.post('/campanhas/:id/iniciar', rota(async (req, res) => exclusivo(async () => {
      const c = await campanhas.findOne({ _id: req.params.id });
      if (!c) return res.status(404).json({ erro: 'Campanha não encontrada.' });
      if (c.estado === 'ativa') return res.json({ ok: true });
      if (await campanhas.findOne({ estado: 'ativa' })) return res.status(409).json({ erro: 'Pause a campanha ativa antes de iniciar outra.' });
      const pendentes = await contatos.countDocuments({ campanhaId: c._id, estado: 'aprovado', autorizado: true });
      const dialogos = c.modo === 'automatico' && await contatos.countDocuments({ campanhaId: c._id, autorizado: true, enviadoEm: { $exists: true } });
      if (!pendentes && !dialogos) return res.status(400).json({ erro: 'Aprove pelo menos um contato com autorização registrada.' });
      if (c.modo === 'automatico') {
        try { validarOferta(c.oferta); } catch (err) { return res.status(400).json({ erro: err.message }); }
      }
      let m;
      try { m = await transporte.modelo(String(req.body?.modeloNome || c.modeloNome || ''), String(req.body?.modeloIdioma || c.modeloIdioma || '')); }
      catch { return res.status(400).json({ erro: 'Conecte a API oficial e selecione um modelo de marketing aprovado disponível.' }); }
      if (m.naoOficial && req.body?.riscoEvolution !== true) return res.status(400).json({ erro: 'Confirme que você aceita o risco da conexão Evolution/Baileys antes de iniciar.' });
      await campanhas.updateOne({ _id: c._id }, { $set: { estado: pendentes ? 'ativa' : 'concluida', modeloNome: m.nome, modeloIdioma: m.idioma, modeloTexto: m.texto, usuario: req.usuario, observacao: '' } });
      await auditar(req.usuario, 'iniciar', c._id); res.json({ ok: true });
    })));
    router.post('/campanhas/:id/pausar', rota(async (req, res) => exclusivo(async () => {
      await campanhas.updateOne({ _id: req.params.id, estado: { $in: ['ativa', 'concluida'] } }, { $set: { estado: 'pausada' } });
      await contatos.updateMany({ campanhaId: req.params.id }, { $unset: { retomadaIndividualEm: '' } });
      await auditar(req.usuario, 'pausar', req.params.id); res.json({ ok: true });
    })));
    router.use((err, _req, res, _next) => res.status(err.type === 'entity.too.large' ? 413 : 500).json({ erro: err.type === 'entity.too.large' ? 'O arquivo deve ter até 2 MB.' : 'Não foi possível concluir a operação de prospecção.' }));
  }
  return { preparar, rotas, receber, retomarConversa, executar, responder: (numero, recebidoEm) => vendas?.responder(numero, recebidoEm),
    iniciar() { parado = false; timer = setInterval(() => executar().catch(() => console.error('[PROSPECÇÃO] Falha na fila.')), 5000); timer.unref(); },
    async parar() { parado = true; clearInterval(timer); await cadeia; },
  };
}
