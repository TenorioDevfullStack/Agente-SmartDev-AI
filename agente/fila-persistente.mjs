import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

const contexto = new AsyncLocalStorage();
export function emFilaPersistente() { return !!contexto.getStore(); }
export class RevisaoNecessaria extends Error {}
export function chaveEtapa(nome) {
  const c = contexto.getStore();
  if (!c) return null;
  const n = c.contadores[nome] = (c.contadores[nome] || 0) + 1;
  return `${c.prefixo}/${nome}/${n}`;
}

// Resultados concluídos são reaproveitados. Um efeito externo de resultado
// desconhecido nunca é repetido automaticamente (WhatsApp não é transacional).
export async function etapa(nome, operacao, efeito = false) {
  const c = contexto.getStore();
  if (!c) return operacao();
  const id = chaveEtapa(nome);
  const salvo = await c.etapas.findOne({ _id: id });
  if (salvo?.estado === 'concluida') return salvo.resultado;
  if (salvo?.efeito) throw new RevisaoNecessaria(`Resultado incerto na etapa ${nome}`);
  await c.etapas.updateOne({ _id: id }, { $set: { estado: 'executando', efeito, atualizadoEm: new Date() } }, { upsert: true });
  const resultado = await contexto.run({ ...c, prefixo: id, contadores: {} }, operacao);
  await c.etapas.updateOne({ _id: id }, { $set: { estado: 'concluida', resultado: resultado ?? null, atualizadoEm: new Date() } });
  return resultado;
}

export function identificarEvento(body) {
  if (body?.event !== 'messages.upsert') return null;
  const key = body.data?.key;
  const jid = [key?.remoteJid, key?.remoteJidAlt].find(j => typeof j === 'string' && /^\d+@s\.whatsapp\.net$/.test(j));
  if (!jid || !key?.id || typeof key.id !== 'string') return null;
  const numero = jid.split('@')[0];
  const direcao = key.fromMe ? 'humana' : 'entrada';
  const id = createHash('sha256').update(JSON.stringify([body.instance || 'agente-suporte', numero, direcao, key.id])).digest('hex');
  return { id, numero, direcao };
}

export function criarFilaPersistente(db, processar, { agora = () => new Date() } = {}) {
  const jobs = db.collection('fila_mensagens');
  const etapas = db.collection('fila_etapas');
  const ativos = new Set();
  let timer;
  let encerrando = false;
  async function receber(body) {
    const evento = identificarEvento(body);
    if (!evento) return false;
    const recebidoEm = agora();
    const payload = { event: body.event, instance: body.instance, data: { ...body.data, key: { ...body.data.key, remoteJid: `${evento.numero}@s.whatsapp.net`, remoteJidAlt: undefined } } };
    try {
      await jobs.updateOne({ _id: evento.id }, { $setOnInsert: {
        numero: evento.numero, direcao: evento.direcao, body: payload, estado: 'pendente', tentativas: 0, recebidoEm, disponivelEm: recebidoEm,
      } }, { upsert: true });
    } catch (err) { if (err.code !== 11000) throw err; }
    return true;
  }
  async function executar(direcao) {
    if (ativos.has(direcao) || encerrando) return;
    ativos.add(direcao);
    let job;
    try {
      // Uma instância do agente, um consumidor por direção. Mensagens humanas
      // continuam entrando enquanto a fila de IA aguarda a Groq.
      const [candidato] = await jobs.aggregate([
        { $match: { direcao, estado: { $in: ['pendente', 'processando', 'revisao'] } } },
        { $sort: { recebidoEm: 1, _id: 1 } },
        { $group: { _id: '$numero', primeiro: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$primeiro' } },
        { $match: { estado: 'pendente', disponivelEm: { $lte: agora() } } },
        { $sort: { recebidoEm: 1, _id: 1 } }, { $limit: 1 },
      ]).toArray();
      if (!candidato) return;
      job = await jobs.findOneAndUpdate({ _id: candidato._id, estado: 'pendente' },
        { $set: { estado: 'processando', iniciadoEm: agora() }, $inc: { tentativas: 1 } },
        { sort: { recebidoEm: 1, _id: 1 }, returnDocument: 'after' });
      if (!job) return;
      await contexto.run({ etapas, prefixo: job._id, contadores: {} }, () => processar(job.body, job.recebidoEm));
      await jobs.updateOne({ _id: job._id }, { $set: { estado: 'concluida', concluidoEm: agora() }, $unset: { erro: '' } });
    } catch (err) {
      if (!job) { console.error('[FILA] Falha ao buscar trabalho:', err.message); return; }
      const incerta = await etapas.findOne({ _id: { $regex: `^${job._id}/` }, estado: 'executando', efeito: true });
      const revisao = err instanceof RevisaoNecessaria || !!incerta || job.tentativas >= 3;
      await jobs.updateOne({ _id: job._id }, { $set: {
        estado: revisao ? 'revisao' : 'pendente', erro: String(err.message).slice(0, 500),
        disponivelEm: new Date(agora().getTime() + 5000),
      } });
      console.error(`[FILA] ${job._id}: ${revisao ? 'revisão necessária' : 'nova tentativa agendada'}`);
    } finally { ativos.delete(direcao); }
  }
  async function iniciar() {
    await jobs.createIndex({ direcao: 1, estado: 1, disponivelEm: 1, recebidoEm: 1 });
    // Recuperação após reinício do único container agente deste Compose.
    await jobs.updateMany({ estado: 'processando' }, { $set: { estado: 'pendente', disponivelEm: agora() } });
    timer = setInterval(() => {
      for (const d of ['humana', 'entrada']) executar(d).catch(e => console.error('[FILA]', e.message));
    }, 500);
  }
  function parar() { encerrando = true; clearInterval(timer); }
  async function aguardarConclusao(limiteMs = 90000) {
    const limite = Date.now() + limiteMs;
    while (ativos.size && Date.now() < limite) await new Promise(resolve => setTimeout(resolve, 200));
    return ativos.size === 0;
  }
  return { receber, executar, iniciar, parar, aguardarConclusao };
}
