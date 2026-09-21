import test from 'node:test';
import { etapa, RevisaoNecessaria } from '../agente/fila-persistente.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { criarFilaGroq, esperaGroq, AtendimentoAssumido, criarFilaContatos } from '../agente/confiabilidade.mjs';
const limitado = (seconds = '1') => ({ response: { status: 429, headers: { 'retry-after': seconds } } });
test('Respeita Retry-After e recupera sem repetir ação anterior', async () => {
  let clock = 0, chamadas = 0, ferramentas = 0;
  const fila = criarFilaGroq({ agora: () => clock, dormir: async ms => { clock += ms; } });
  ferramentas++;
  const estados = [];
  const resultado = await fila(async () => { if (++chamadas < 3) throw limitado(); return 'ok'; }, async s => estados.push(s));
  assert.equal(resultado, 'ok'); assert.equal(chamadas, 3); assert.equal(ferramentas, 1);
  assert.equal(clock, 2500); assert.ok(estados.some(s => s.fase === 'aguardando'));
});
test('Três retries, erro não 429 sem retry, espera diária limitada', async () => {
  let clock = 0, chamadas = 0;
  const fila = criarFilaGroq({ agora: () => clock, dormir: async ms => { clock += ms; } });
  await assert.rejects(fila(async () => { chamadas++; throw limitado(); }));
  assert.equal(chamadas, 4);
  chamadas = 0;
  await assert.rejects(fila(async () => { chamadas++; throw new Error('401'); }));
  assert.equal(chamadas, 1);
  await assert.rejects(fila(async () => { throw limitado('3600'); }), /dois minutos/);
  assert.equal(esperaGroq({ response: { data: { error: { message: 'Please try again in 9.6525s.' } } } }, 0), 9902.5);
});
test('Fila serial, cancelamento e liberação após erro', async () => {
  const fila = criarFilaGroq(); let ativos = 0, max = 0;
  await Promise.all([1, 2, 3].map(() => fila(async () => { max = Math.max(max, ++ativos); await new Promise(r => setTimeout(r, 5)); ativos--; })));
  assert.equal(max, 1);
  await assert.rejects(fila(async () => assert.fail('Não deveria chamar'), undefined, async () => { throw new AtendimentoAssumido(); }));
  assert.equal(await fila(async () => 'livre'), 'livre');
  const contatos = criarFilaContatos(); const ordem = [];
  await Promise.all([contatos('a', async () => { await new Promise(r => setTimeout(r, 5)); ordem.push(1); }), contatos('a', async () => ordem.push(2))]);
  assert.deepEqual(ordem, [1, 2]);
});
test('Assumir durante espera cancela a próxima tentativa', async () => {
  let clock = 0, pausado = false, chamadas = 0;
  const fila = criarFilaGroq({ agora: () => clock, dormir: async ms => { clock += ms; pausado = true; } });
  await assert.rejects(fila(async () => { chamadas++; throw limitado('10'); }, undefined,
    async () => { if (pausado) throw new AtendimentoAssumido(); }), AtendimentoAssumido);
  assert.equal(chamadas, 1);
});
test('Resposta em processamento é descartada antes de executar ferramentas após intervenção humana', async () => {
  const source = fs.readFileSync(new URL('../agente/server.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function gerarResposta');
  const end = source.indexOf('// =====', start + 1);
  const code = source.slice(start, end).replaceAll(': string', '').replaceAll(': Promise<string>', '').replaceAll(': any[]', '').replaceAll(': any', '');
  let pausado = false, ferramentas = 0;
  const context = { etapa, RevisaoNecessaria, versoesHumanas: new Map(), estadosIA: new Map(), AtendimentoAssumido,
    db: { collection: () => ({ findOne: async () => ({ pausado }), updateOne: async () => {} }) },
    HISTORICO_MAX: 20, SYSTEM_PROMPT: 'teste', MAX_ITERACOES_TOOL: 3,
    agoraParaPrompt: () => '', contextoDoLead: () => '', logMensagem: async () => {},
    chamarLLM: async () => { pausado = true; return { tool_calls: [{ function: { name: 'registrarLead', arguments: '{}' } }] }; },
    executarTool: async () => { ferramentas++; }, console,
  };
  vm.createContext(context); vm.runInContext(code, context);
  assert.equal(await context.gerarResposta('5511000000001', 'Olá'), '');
  assert.equal(ferramentas, 0);
});
test('WhatsApp humano pausa e grava uma vez; eco do agente é ignorado', async () => {
  const source = fs.readFileSync(new URL('../agente/server.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function processarWebhook');
  const end = source.indexOf('// ===== PAINEL =====', start);
  const code = source.slice(start, end).replaceAll(': any[]', '').replaceAll(': any', '');
  const eventos = new Set(), logs = [], writes = [];
  const context = { etapa, RevisaoNecessaria,
    inicioProcesso: Date.now() - 1000, enviosPendentes: new Map(), versoesHumanas: new Map(), estadosIA: new Map(), HISTORICO_MAX: 20,
    console, logMensagem: async (...args) => logs.push(args),
    db: { collection: name => ({
      findOne: async query => name === 'envios_agente' && query._id.endsWith(':bot') ? {} : null,
      updateOne: async (query, update) => {
        if (name === 'eventos_humanos') { const novo = !eventos.has(query._id); eventos.add(query._id); return { upsertedCount: Number(novo) }; }
        writes.push(update); return {};
      },
    }) },
  };
  vm.createContext(context); vm.runInContext(code, context);
  const evento = id => ({ event: 'messages.upsert', data: { key: { fromMe: true, remoteJid: '5511000000001@s.whatsapp.net', id }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'Vou cuidar disso.' } } });
  await context.processarWebhook(evento('bot')); assert.equal(logs.length, 0); assert.equal(writes.length, 0);
  await context.processarWebhook(evento('humano')); await context.processarWebhook(evento('humano'));
  assert.equal(logs.length, 1); assert.equal(logs[0][3], 'whatsapp');
  assert.ok(writes.some(w => w.$set?.pausado === true));
  assert.ok(writes.some(w => w.$push?.mensagens.$each[0].content === 'Vou cuidar disso.'));
});
