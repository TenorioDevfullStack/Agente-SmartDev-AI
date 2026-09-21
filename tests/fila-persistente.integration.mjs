// Executar no container de teste: usa um banco temporário, nunca dados reais.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { criarFilaPersistente, etapa } from '../agente/fila-persistente.mjs';
const require = createRequire('/app/package.json');
const { MongoClient } = require('mongodb');
const client = new MongoClient('mongodb://mongo:27017');
await client.connect();
const nome = `teste_fila_${Date.now()}`;
const db = client.db(nome);
const evento = (id, fromMe = false) => ({ instance: 'teste', event: 'messages.upsert', data: { key: { id, fromMe, remoteJid: '5511000000001@s.whatsapp.net' }, message: { conversation: 'simulação' } } });
let relogio = Date.now();
const agora = () => new Date(++relogio);
try {
  let chamadas = 0;
  const fila = criarFilaPersistente(db, async () => { chamadas++; }, { agora });
  await Promise.all(Array.from({ length: 20 }, () => fila.receber(evento('duplicada'))));
  assert.equal(await db.collection('fila_mensagens').countDocuments(), 1);
  await Promise.all([fila.executar('entrada'), fila.executar('entrada')]);
  await fila.receber(evento('duplicada')); await fila.executar('entrada');
  assert.equal(chamadas, 1);
  console.log('PASS: 20 webhooks simultâneos e reenvio após conclusão executam uma vez.');

  let efeito = 0, falhar = true;
  const processar = async () => {
    await etapa('envio-simulado', async () => { efeito++; return 'enviado'; }, true);
    if (falhar) { falhar = false; throw new Error('interrupção após etapa concluída'); }
  };
  const antes = criarFilaPersistente(db, processar, { agora });
  await antes.receber(evento('reinicio')); await antes.executar('entrada');
  await db.collection('fila_mensagens').updateOne({ 'body.data.key.id': 'reinicio' }, { $set: { estado: 'processando' } });
  const depois = criarFilaPersistente(db, processar, { agora });
  await depois.iniciar(); depois.parar();
  const recuperada = await db.collection('fila_mensagens').findOne({ 'body.data.key.id': 'reinicio' });
  assert.equal(recuperada.estado, 'pendente');
  const retomada = criarFilaPersistente(db, processar, { agora });
  await retomada.executar('entrada');
  assert.equal(efeito, 1);
  assert.equal((await db.collection('fila_mensagens').findOne({ 'body.data.key.id': 'reinicio' })).estado, 'concluida');
  console.log('PASS: reinício recupera tarefa e reaproveita efeito concluído.');

  let incertos = 0;
  const incerta = criarFilaPersistente(db, async () => etapa('externo', async () => { incertos++; throw new Error('conexão caiu após envio'); }, true), { agora });
  await incerta.receber(evento('incerta')); await incerta.executar('entrada');
  await incerta.receber(evento('incerta')); await incerta.executar('entrada');
  assert.equal(incertos, 1);
  assert.equal((await db.collection('fila_mensagens').findOne({ 'body.data.key.id': 'incerta' })).estado, 'revisao');
  console.log('PASS: efeito incerto vai para revisão, sem repetição.');
  await incerta.receber(evento('bloqueada'));
  await incerta.executar('entrada');
  assert.equal((await db.collection('fila_mensagens').findOne({ 'body.data.key.id': 'bloqueada' })).estado, 'pendente');
  await db.collection('fila_mensagens').updateOne({ 'body.data.key.id': 'incerta' }, { $set: { estado: 'revisada' } });
  const liberada = criarFilaPersistente(db, async () => {}, { agora });
  await liberada.executar('entrada');
  assert.equal((await db.collection('fila_mensagens').findOne({ 'body.data.key.id': 'bloqueada' })).estado, 'concluida');
  console.log('PASS: revisão bloqueia o contato até liberação manual.');

  let soltar; const bloqueio = new Promise(r => { soltar = r; }); let humano = false;
  const paralela = criarFilaPersistente(db, async body => { if (body.data.key.fromMe) humano = true; else await bloqueio; }, { agora });
  await paralela.receber(evento('esperando-ia'));
  const esperando = paralela.executar('entrada');
  await paralela.receber(evento('intervencao', true)); await paralela.executar('humana');
  assert.ok(humano); soltar(); await esperando;
  console.log('PASS: intervenção humana processa enquanto a IA espera.');

  const invalido = await paralela.receber({ ...evento('grupo'), data: { key: { id: 'grupo', remoteJid: '123@g.us' } } });
  assert.equal(invalido, false);
  console.log('PASS: eventos de grupos são ignorados.');
} finally {
  if (!/^teste_fila_\d+$/.test(nome)) throw new Error('Banco de teste inválido');
  await db.dropDatabase(); await client.close();
}
