export const LIMITE_ESPERA_MS = 5 * 60 * 1000;
export const JANELA_FALHAS_MS = 15 * 60 * 1000;
export const RESPOSTA_FALHA = 'Estou com um probleminha técnico no momento 🤖. Pode tentar de novo em instantes?';

export function montarAlertas({ whatsapp, falhasIA, aguardando, revisao = 0 }) {
  const alertas = [];
  if (!whatsapp.conectado) alertas.push({
    tipo: 'whatsapp', nivel: 'critico', titulo: whatsapp.estado === 'erro' || whatsapp.estado === 'desconhecido' ? 'Não foi possível confirmar a conexão do WhatsApp' : 'WhatsApp desconectado',
    descricao: 'Confira a conexão da instância na Evolution API. O atendimento pode estar indisponível.',
  });
  if (falhasIA >= 3) alertas.push({ tipo: 'ia', nivel: 'critico', titulo: 'Falhas recorrentes da IA', descricao: `${falhasIA} chamadas falharam nos últimos 15 minutos, após as tentativas automáticas. Confira o provedor e assuma os atendimentos pendentes.` });
  if (aguardando.length) alertas.push({ tipo: 'espera', nivel: 'atencao', titulo: `${aguardando.length} conversa(s) aguardando resposta`, descricao: 'Há mensagens de clientes sem resposta útil há pelo menos 5 minutos. Inclui atendimentos assumidos por uma pessoa.' });
  if (revisao) alertas.push({ tipo: 'revisao', nivel: 'critico', titulo: `${revisao} tarefa(s) precisam de revisão`, descricao: 'Confira as conversas sinalizadas antes de liberar a fila. Envios incertos não são repetidos automaticamente.' });
  return alertas;
}

export async function consultarEspera(db, agora = new Date()) {
  const limite = new Date(agora.getTime() - LIMITE_ESPERA_MS);
  const historico = await db.collection('mensagens').aggregate([
    { $match: { $or: [{ role: 'user' }, { role: 'assistant', via: { $ne: 'sistema' }, content: { $ne: RESPOSTA_FALHA } }] } },
    { $group: { _id: '$numero', clienteEm: { $max: { $cond: [{ $eq: ['$role', 'user'] }, '$em', null] } }, respostaEm: { $max: { $cond: [{ $eq: ['$role', 'assistant'] }, '$em', null] } } } },
    { $match: { clienteEm: { $ne: null, $lte: limite }, $expr: { $gt: ['$clienteEm', '$respostaEm'] } } },
  ]).toArray();
  const fila = await db.collection('fila_mensagens').aggregate([
    { $match: { direcao: 'entrada', estado: { $in: ['pendente', 'processando', 'revisao'] }, recebidoEm: { $lte: limite } } },
    { $group: { _id: '$numero', clienteEm: { $min: '$recebidoEm' } } },
  ]).toArray();
  const contatos = new Map(historico.map(item => [item._id, item.clienteEm]));
  for (const item of fila) if (!contatos.has(item._id) || item.clienteEm < contatos.get(item._id)) contatos.set(item._id, item.clienteEm);
  const numeros = [...contatos.keys()];
  const [conversas, leads] = await Promise.all([
    db.collection('conversas').find({ _id: { $in: numeros } }).project({ pausado: 1 }).toArray(),
    db.collection('leads').find({ _id: { $in: numeros } }).project({ nome: 1 }).toArray(),
  ]);
  const porConversa = new Map(conversas.map(c => [c._id, c]));
  const porLead = new Map(leads.map(c => [c._id, c]));
  return numeros.map(numero => ({ numero, nome: porLead.get(numero)?.nome || null, desde: contatos.get(numero), pausado: !!porConversa.get(numero)?.pausado }))
    .sort((a, b) => a.desde - b.desde);
}
