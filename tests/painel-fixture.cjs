// Servidor isolado: não acessa Mongo, Groq nem WhatsApp.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const contatos = ['5511000000001', '5511000000002'];
const nomes = ['Marina • Loja Aurora', 'Rafael • Studio Norte'];
const mensagens = Object.fromEntries(contatos.map(n => [n, Array.from({ length: 18 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', via: i % 2 ? 'agente' : undefined, content: i % 2 ? 'Podemos organizar as dúvidas frequentes e ajudar sua equipe no atendimento.' : 'Quero entender como melhorar o atendimento da minha empresa.', em: new Date(Date.now() - (18 - i) * 60000).toISOString() }))]));
const pausas = {};
let revisao = true;
const totais = { conversas: 2, leads: 2, agendamentos: 0, recados: 0 };
const status = { totais, whatsapp: { conectado: true, estado: 'open' }, llm: { provedor: 'groq', modelo: 'teste', chaveConfigurada: true }, avisos: {}, uptimeSegundos: 300, instancia: 'teste' };
status.alertas = [{ tipo: 'espera', nivel: 'atencao', titulo: '1 conversa aguardando resposta', descricao: 'Contato de demonstração aguardando há pelo menos 5 minutos.' }];
status.aguardando = [{ numero: contatos[0], nome: nomes[0], desde: new Date(Date.now() - 7 * 60000).toISOString(), pausado: false }];
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const json = data => res.end(JSON.stringify(data));
  if (req.url === '/api/auth/me' || req.url === '/api/auth/login') return json({ usuario: { id: 'fixture', nome: 'Atendente de teste', papel: 'atendente', trocarSenha: false } });
  if (req.url === '/api/auth/logout') return json({ ok: true });
  if (req.url === '/painel/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(path.join(__dirname, '../agente/painel/index.html'), 'utf8'));
  }
  if (req.url === '/api/status') return json(status);
  if (req.url === '/api/conversas') return json(contatos.map((numero, i) => ({ numero, nome: nomes[i], exibicao: numero, ultima: mensagens[numero].at(-1).content, atualizadoEm: new Date().toISOString(), pausado: !!pausas[numero] })));
  if (req.url === '/api/leads') return json([]);
  if (req.url === '/api/agenda') return json({ agendamentos: [], recados: [], hoje: '2026-09-12' });
  if (req.url.endsWith('/fila/teste-revisao/resolver') && req.method === 'POST') { revisao = false; return json({ ok: true }); }
  const match = req.url.match(/^\/api\/conversas\/(\d+)(?:\/(mensagem|pausa))?$/);
  if (match && contatos.includes(match[1])) {
    const numero = match[1];
    if (req.method === 'GET') return json({ numero, exibicao: numero, link: '#', pausado: !!pausas[numero], fila: revisao ? [{ _id: 'teste-revisao', estado: 'revisao' }] : [], lead: { nome: nomes[contatos.indexOf(numero)], empresa: 'Empresa de demonstração', necessidade: 'Atendimento no WhatsApp' }, mensagens: mensagens[numero] });
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    if (match[2] === 'pausa') { pausas[numero] = body.pausado; return json({ ok: true }); }
    if (match[2] === 'mensagem') {
      await new Promise(resolve => setTimeout(resolve, 6500));
      if (body.texto === 'falhar') { res.statusCode = 502; return json({ erro: 'Falha simulada' }); }
      mensagens[numero].push({ role: 'assistant', via: 'painel', content: body.texto, em: new Date().toISOString() });
      return json({ ok: true });
    }
  }
  res.statusCode = 404;
  json({ erro: 'Não encontrado' });
}).listen(3101, '127.0.0.1', () => console.log('Fixture: http://127.0.0.1:3101/painel/'));
