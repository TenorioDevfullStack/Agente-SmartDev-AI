import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { etapa } from '../agente/fila-persistente.mjs';

const source = fs.readFileSync(new URL('../agente/server.ts', import.meta.url), 'utf8');
const inicio = source.indexOf('async function processarWebhook');
const code = source.slice(inicio, source.indexOf('// ===== PAINEL =====', inicio)).replaceAll(': any[]', '').replaceAll(': any', '');

for (const caso of [
  { nome: 'Áudio recebido pede texto sem chamar IA ou baixar mídia', fromMe: false, pausado: false, prospeccao: false, envios: 1 },
  { nome: 'Áudio em conversa assumida é registrado sem resposta automática', fromMe: false, pausado: true, prospeccao: false, envios: 0 },
  { nome: 'Áudio humano pausa sem transcrição', fromMe: true, pausado: false, prospeccao: false, envios: 0 },
  { nome: 'Áudio de prospecção fica em revisão sem resposta', fromMe: false, pausado: false, prospeccao: true, envios: 0 },
]) test(caso.nome, async () => {
  const logs = [], envios = [], writes = [];
  const context = { etapa, HISTORICO_MAX: 20, ADMIN_NUMBER: '', enviosPendentes: new Map(), versoesHumanas: new Map(), estadosIA: new Map(), console,
    prospeccao: { receber: async () => caso.prospeccao },
    db: { collection: name => ({
      findOne: async () => name === 'conversas' ? { pausado: caso.pausado } : null,
      updateOne: async (_query, update) => { writes.push(update); return { upsertedCount: 1 }; },
    }) },
    logMensagem: async (...args) => logs.push(args),
    enviarMensagem: async (...args) => { envios.push(args); return true; },
    gerarResposta: async () => assert.fail('Não deve chamar IA para áudio'),
    avisarSeNecessario: async () => assert.fail('Não deve enviar apresentação adicional'),
  };
  vm.createContext(context); vm.runInContext(code, context);
  await context.processarWebhook({ event: 'messages.upsert', data: { key: { id: 'audio-teste', fromMe: caso.fromMe, remoteJid: '5511999990001@s.whatsapp.net' }, messageTimestamp: Math.floor(Date.now() / 1000), message: { audioMessage: { url: 'https://nao-deve-ser-acessado.invalid/audio' } } } });
  assert.equal(envios.length, caso.envios); assert.ok(logs.length >= 1);
  if (caso.envios) assert.match(envios[0][1], /por texto/);
  if (caso.fromMe) assert.ok(writes.some(w => w.$set?.pausado === true));
});
