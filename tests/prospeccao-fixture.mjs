import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { criarAutenticacao } from '../agente/autenticacao.mjs';
import { criarProspeccao } from '../agente/prospeccao.mjs';
import { criarVendasProspeccao } from '../agente/prospeccao-vendas.mjs';
import { criarPromocao } from '../agente/prospeccao-oferta.mjs';
const require = createRequire(new URL('../agente/package.json', import.meta.url));
const express = require('express'), { MongoClient } = require('mongodb');

export async function fixture(port = 0) {
  // Banco dedicado de teste. Não lê .env e não possui transporte de rede para WhatsApp.
  const client = new MongoClient('mongodb://127.0.0.1:27028'); await client.connect();
  const db = client.db(`teste_prospeccao_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  let data = new Date('2026-09-14T13:00:00Z'), falha = false;
  const enviados = [];
  const modelo = { nome: 'apresentacao_teste', idioma: 'pt_BR', texto: 'Olá, {{1}}. Sou o assistente da SmartDev AI. Podemos apresentar nosso serviço?', parametroEmpresa: true };
  const transporte = { listar: async () => [modelo], modelo: async () => modelo, enviar: async (numero, m, empresa) => {
    enviados.push(numero); if (falha) throw new Error('Timeout simulado'); return { id: `simulado-${enviados.length}`, texto: m.texto.replace('{{1}}', empresa) };
  } };
  const registrarSaida = async (numero, texto) => {
    await db.collection('mensagens').insertOne({ numero, role: 'assistant', content: texto, em: data });
    await db.collection('conversas').updateOne({ _id: numero }, { $push: { mensagens: { role: 'assistant', content: texto } } }, { upsert: true });
  };
  const respostas = [], decisoes = [];
  let antesInferir = async () => {}, falhaResposta = false;
  const promocao = criarPromocao(db, () => data);
  const vendas = criarVendasProspeccao(db, { promocao, agora: () => data, registrarSaida, validarTransporte: async () => {},
    inferir: async () => { await antesInferir(); return { content: decisoes.shift() || '{"acao":"apresentar"}' }; },
    enviar: async (numero, texto) => { respostas.push({ numero, texto }); if (falhaResposta) throw new Error('Timeout de resposta simulado'); },
  });
  const servico = criarProspeccao(db, { transporte, registrarSaida, vendas, promocao, agora: () => data }); await servico.preparar();
  const auth = await criarAutenticacao(db, express.Router, 'senha-teste-inicial');
  await db.collection('painel_usuarios').updateOne({ _id: 'administrador-inicial' }, { $set: { trocarSenha: false } });
  const app = express(); app.use(express.json());
  app.use('/painel', express.static(fileURLToPath(new URL('../agente/painel', import.meta.url))));
  app.use('/api', auth.csrf); app.use('/api/auth', auth.router); app.use('/api', auth.autenticar, auth.acessoCompleto, auth.auditar);
  const router = express.Router(); servico.rotas(router, express); app.use('/api/prospeccao', router);
  app.get('/api/status', (_req,res) => res.json({ totais: { conversas: 0, leads: 0, agendamentos: 0, recados: 0 }, whatsapp: { conectado: true }, llm: { provedor: 'teste', chaveConfigurada: true }, avisos: {}, uptimeSegundos: 1, alertas: [], aguardando: [] }));
  app.get('/api/conversas', (_req,res) => res.json([]));
  const server = app.listen(port, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { db, servico, enviados, url, transporte, registrarSaida, vendas, promocao, respostas, agora: () => data,
    decidir(d) { decisoes.push(typeof d === 'string' ? d : JSON.stringify(d)); },
    antesInferir(fn) { antesInferir = fn; }, falharResposta() { falhaResposta = true; },
    avancar(ms = 61000) { data = new Date(data.getTime() + ms); }, falhar() { falha = true; },
    async fechar() { await servico.parar(); await new Promise(r => server.close(r)); if (!db.databaseName.startsWith('teste_prospeccao_')) throw new Error('Banco inesperado'); await db.dropDatabase(); await client.close(); },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = await fixture(3103); f.servico.iniciar(); console.log('Fixture de prospecção: ' + f.url + '/painel/');
  for (const sinal of ['SIGTERM','SIGINT']) process.once(sinal, () => f.fechar().then(() => process.exit(0)));
}
