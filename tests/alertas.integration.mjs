import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { consultarEspera, montarAlertas, RESPOSTA_FALHA } from '../agente/alertas.mjs';
const { MongoClient } = createRequire('/app/package.json')('mongodb');
const client = new MongoClient('mongodb://mongo:27017');
await client.connect();
const nome = `teste_alertas_${Date.now()}`;
const db = client.db(nome);
const agora = new Date();
const em = minutos => new Date(agora.getTime() - minutos * 60000);
try {
  await db.collection('mensagens').insertMany([
    { numero: 'pendente', role: 'user', content: 'Olá', em: em(6) },
    { numero: 'respondida', role: 'user', content: 'Olá', em: em(8) },
    { numero: 'respondida', role: 'assistant', via: 'whatsapp', content: 'Posso ajudar', em: em(7) },
    { numero: 'falha', role: 'user', content: 'Olá', em: em(9) },
    { numero: 'falha', role: 'assistant', via: 'agente', content: RESPOSTA_FALHA, em: em(8) },
    { numero: 'aviso', role: 'user', content: 'Olá', em: em(10) },
    { numero: 'aviso', role: 'assistant', via: 'sistema', content: 'Bem-vindo', em: em(9) },
    { numero: 'recente', role: 'user', content: 'Olá', em: em(4) },
  ]);
  await db.collection('conversas').insertOne({ _id: 'pendente', pausado: true });
  await db.collection('leads').insertOne({ _id: 'pendente', nome: 'Contato de teste' });
  await db.collection('fila_mensagens').insertMany([
    { numero: 'pendente', direcao: 'entrada', estado: 'pendente', recebidoEm: em(7) },
    { numero: 'fila', direcao: 'entrada', estado: 'processando', recebidoEm: em(6) },
    { numero: 'finalizada', direcao: 'entrada', estado: 'concluida', recebidoEm: em(9) },
  ]);
  const aguardando = await consultarEspera(db, agora);
  assert.deepEqual(aguardando.map(c => c.numero).sort(), ['aviso', 'falha', 'fila', 'pendente']);
  assert.equal(aguardando.find(c => c.numero === 'pendente').pausado, true);
  assert.equal(aguardando.find(c => c.numero === 'pendente').nome, 'Contato de teste');
  assert.equal(montarAlertas({ whatsapp: { conectado: true }, falhasIA: 2, aguardando: [] }).length, 0);
  const alertas = montarAlertas({ whatsapp: { conectado: false, estado: 'close' }, falhasIA: 3, aguardando, revisao: 1 });
  assert.deepEqual(alertas.map(a => a.tipo), ['whatsapp', 'ia', 'espera', 'revisao']);
  assert.match(montarAlertas({ whatsapp: { conectado: false, estado: 'erro' }, falhasIA: 0, aguardando: [] })[0].titulo, /confirmar/);
  console.log('PASS: espera, respostas humanas, falha automática, fila, deduplicação, limites e conexão desconhecida.');
} finally {
  if (!/^teste_alertas_\d+$/.test(nome)) throw new Error('Banco inválido');
  await db.dropDatabase(); await client.close();
}
