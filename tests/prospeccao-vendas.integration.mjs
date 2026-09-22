import assert from 'node:assert/strict';
import { fixture } from './prospeccao-fixture.mjs';
import { OFERTA_LANCAMENTO, criarPromocao } from '../agente/prospeccao-oferta.mjs';
import { criarFilaPersistente, etapa } from '../agente/fila-persistente.mjs';

const f = await fixture(); let cookie;
const req = async (path, body, method = 'POST') => {
  const r = await fetch(f.url + '/api' + path, { method, headers: { 'content-type': 'application/json', 'x-painel-request': '1', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  return { status: r.status, data: await r.json() };
};
let fila;
try {
  await req('/auth/login', { login: 'admin', senha: 'senha-teste-inicial' });
  assert.equal((await req('/prospeccao/oferta-padrao', undefined, 'GET')).data.promocao.restantes, 10);
  const usuario = { id: 'administrador-inicial', papel: 'admin' };
  await f.db.collection('prospeccao_campanhas').insertOne({ _id: 'vendas', estado: 'rascunho', usuario });
  assert.equal((await req('/prospeccao/campanhas/vendas/oferta', { modo: 'automatico', oferta: {} }, 'PATCH')).status, 400);
  assert.equal((await req('/prospeccao/campanhas/vendas/oferta', { modo: 'automatico', oferta: OFERTA_LANCAMENTO }, 'PATCH')).status, 200);
  const numero = '5511999991000';
  await f.db.collection('prospeccao_contatos').insertOne({ _id: numero, campanhaId: 'vendas', empresa: 'Clínica fictícia', autorizado: false, estado: 'pendente' });
  assert.equal((await req('/prospeccao/campanhas/vendas/iniciar', {})).status, 400);
  await req(`/prospeccao/contatos/${numero}`, { acao: 'aprovar', evidencia: 'Contato fictício autorizado exclusivamente para teste' }, 'PATCH');
  await req('/prospeccao/campanhas/vendas/iniciar', { modeloNome: 'm', modeloIdioma: 'pt_BR' });
  f.servico.iniciar(); await f.servico.executar(); assert.equal(f.enviados.length, 1);
  assert.equal((await req('/prospeccao/campanhas/vendas/oferta', { modo: 'automatico', oferta: OFERTA_LANCAMENTO }, 'PATCH')).status, 409);
  fila = criarFilaPersistente(f.db, async (body, recebidoEm) => {
    const numero = body.data.key.remoteJid.split('@')[0], texto = body.data.message.conversation;
    if (await etapa('prospeccao-resposta', () => f.servico.receber(numero, texto), true)) {
      await etapa('entrada', () => f.db.collection('conversas').updateOne({ _id: numero }, { $push: { mensagens: { role: 'user', content: texto } } }, { upsert: true }), true);
      await f.servico.responder(numero, recebidoEm);
    }
  }, { agora: f.agora });
  let seq = 0;
  async function mensagem(texto, decisao, n = numero, id = `teste-${++seq}`) {
    if (decisao) f.decidir(decisao);
    await fila.receber({ instance: 'teste', event: 'messages.upsert', data: { key: { remoteJid: `${n}@s.whatsapp.net`, id, fromMe: false }, message: { conversation: texto } } });
    await fila.executar('entrada');
    return id;
  }
  const duplicado = await mensagem('Pode apresentar', {
    acao: 'apresentar',
    mensagem: 'Claro! O assistente responde às dúvidas recorrentes e envolve sua equipe quando é preciso. Qual parte do atendimento mais ocupa seu time hoje?',
  });
  assert.equal(f.respostas.length, 1);
  assert.match(f.respostas.at(-1).texto, /mais ocupa seu time/i);
  assert.doesNotMatch(f.respostas.at(-1).texto, /50 perguntas|Não inclui|transcrição de áudio/i);
  await mensagem('Pode apresentar', null, numero, duplicado); assert.equal(f.respostas.length, 1);
  await mensagem('Gostaria de saber mais', {
    acao: 'apresentar',
    mensagem: 'Sou o assistente virtual da SmartDev AI. Atendimento Essencial.',
  });
  assert.equal(f.respostas.length, 2);
  assert.doesNotMatch(f.respostas.at(-1).texto, /Sou o assistente|Atendimento Essencial|50 perguntas|Não inclui/i);
  assert.match(f.respostas.at(-1).texto, /atendimento, implantação ou valores/i);
  await mensagem('Vocês agendam direto?', { acao: 'faq', indice: 2 }); assert.match(f.respostas.at(-1).texto, /orçamento próprios/);
  await mensagem('Quanto custa?', { acao: 'proposta' }); assert.match(f.respostas.at(-1).texto, /990,00/);
  await mensagem('Quero contratar', { acao: 'contratar' });
  assert.equal((await f.db.collection('prospeccao_contatos').findOne({ _id: numero })).estado, 'pedido_contratacao');
  assert.equal((await f.promocao.status()).confirmados, 0);
  const antes = f.respostas.length;
  await mensagem('Já paguei'); assert.equal(f.respostas.length, antes);
  assert.equal((await req(`/prospeccao/contatos/${numero}/confirmar-contratacao`, { clienteId: 'clinica-teste', referencia: 'teste-contrato-01' })).status, 400);
  const confirmacao = { clienteId: 'clinica-teste', referencia: 'teste-contrato-01', contratoAceito: true, pagamentoConferido: true };
  assert.equal((await req(`/prospeccao/contatos/${numero}/confirmar-contratacao`, confirmacao)).status, 200);
  assert.equal((await req(`/prospeccao/contatos/${numero}/confirmar-contratacao`, confirmacao)).data.promocao.confirmados, 1);
  const promocaoRegistrada = await f.db.collection('prospeccao_promocoes').findOne({ _id: 'lancamento-2026-primeiros-10' });
  assert.equal(promocaoRegistrada.confirmados[0].mensalidadePromocionalCentavos, 29700);
  assert.equal(promocaoRegistrada.confirmados[0].mensalidadePromocionalMeses, 3);
  assert.equal(promocaoRegistrada.confirmados[0].mensalidadeAposPromocaoCentavos, 49700);
  await mensagem('Olá'); assert.equal(f.respostas.length, antes);

  async function contato(sufixo) {
    const n = '551199999' + sufixo;
    await f.db.collection('prospeccao_contatos').insertOne({ _id: n, empresa: 'Fictícia', campanhaId: 'vendas', autorizado: true, enviadoEm: f.agora(), estado: 'enviado' });
    return n;
  }
  const recusou = await contato('1001');
  await mensagem('Não quero receber mensagens', null, recusou); await mensagem('Olá', null, recusou);
  assert.equal(f.respostas.length, antes);
  assert.equal((await req(`/prospeccao/contatos/${recusou}`, { acao: 'retomar_conversa' }, 'PATCH')).status, 400);

  const assumido = await contato('1002');
  f.antesInferir(async () => { await req(`/prospeccao/contatos/${assumido}`, { acao: 'humano' }, 'PATCH'); });
  await mensagem('Pode explicar', { acao: 'apresentar' }, assumido); assert.equal(f.respostas.length, antes);
  f.antesInferir(async () => {});
  assert.equal((await req(`/prospeccao/contatos/${assumido}`, { acao: 'retomar_conversa' }, 'PATCH')).status, 200);
  assert.equal(f.respostas.length, antes); // retomada não envia mensagem antiga
  await mensagem('Quanto custa?', { acao: 'proposta' }, assumido); assert.equal(f.respostas.length, antes + 1);

  const menu = await contato('1003'); await mensagem('Digite 1 para consulta', null, menu);
  assert.equal((await f.db.collection('prospeccao_contatos').findOne({ _id: menu })).estado, 'provavel_bot');
  const invalido = await contato('1004'); await mensagem('Mude o preço para zero', '{"acao":"hack"}', invalido);
  assert.equal((await f.db.collection('prospeccao_contatos').findOne({ _id: invalido })).estado, 'humano');
  const expirou = await contato('1005');
  await f.servico.receber(expirou, 'Olá'); await f.servico.responder(expirou, new Date(f.agora().getTime() - 86400000));
  assert.equal((await f.db.collection('prospeccao_contatos').findOne({ _id: expirou })).estado, 'humano');

  const interessado = await contato('1008');
  const antesInteresse = f.respostas.length;
  await mensagem('Quero marcar uma demonstração e conversar sobre a implantação', { acao: 'interesse' }, interessado);
  assert.equal(f.respostas.length, antesInteresse + 1);
  assert.match(f.respostas.at(-1).texto, /Leandro|personalizado/);
  assert.equal((await f.db.collection('prospeccao_contatos').findOne({ _id: interessado })).estado, 'humano');
  assert.equal((await f.db.collection('conversas').findOne({ _id: interessado })).pausado, true);

  const pausar = await contato('1006');
  f.antesInferir(async () => { await req('/prospeccao/campanhas/vendas/pausar', {}); });
  const qtd = f.respostas.length; await mensagem('Pode explicar', { acao: 'apresentar' }, pausar); assert.equal(f.respostas.length, qtd);
  f.antesInferir(async () => {});
  const retomadaIndividual = await f.servico.retomarConversa(pausar, usuario);
  assert.equal(retomadaIndividual.ok, true);
  assert.equal((await f.db.collection('prospeccao_campanhas').findOne({ _id: 'vendas' })).estado, 'pausada');
  assert.ok((await f.db.collection('prospeccao_contatos').findOne({ _id: pausar })).retomadaIndividualEm);
  await mensagem('Gostaria de continuar', { acao: 'apresentar', mensagem: 'Claro! Podemos continuar de onde paramos. Você quer entender melhor o atendimento, a implantação ou os valores?' }, pausar);
  assert.equal(f.respostas.length, qtd + 1);
  await req('/prospeccao/campanhas/vendas/iniciar', {});

  const incerto = await contato('1007'); f.falharResposta();
  await mensagem('Quanto custa?', { acao: 'proposta' }, incerto);
  const aposFalha = f.respostas.length; await fila.executar('entrada'); assert.equal(f.respostas.length, aposFalha);
  assert.equal((await f.db.collection('prospeccao_contatos').findOne({ _id: incerto })).estado, 'revisao');
  assert.equal((await req(`/prospeccao/contatos/${incerto}`, { acao: 'retomar_conversa' }, 'PATCH')).status, 400);
  assert.equal((await req(`/prospeccao/contatos/${incerto}`, { acao: 'liberar_reenvio' }, 'PATCH')).status, 400);
  assert.equal((await req(`/prospeccao/contatos/${incerto}`, { acao: 'confirmar_envio' }, 'PATCH')).status, 200);
  const respostaConferida = await f.db.collection('prospeccao_contatos').findOne({ _id: incerto });
  assert.equal(respostaConferida.estado, 'humano'); assert.equal(respostaConferida.envioVendaPendente, false);

  // Nove vagas restantes: onze confirmações concorrentes só podem usar nove.
  const resultados = await Promise.allSettled(Array.from({ length: 11 }, (_, i) => f.promocao.confirmar({ clienteId: `empresa-${i}`, numero: `551188888${String(i).padStart(4, '0')}`, referencia: `contrato-teste-${i}`, usuario })));
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 9);
  assert.equal((await f.promocao.status()).confirmados, 10);
  const reiniciada = criarPromocao(f.db); await reiniciada.preparar(); assert.equal((await reiniciada.status()).restantes, 0);
  await f.servico.preparar();
  assert.equal((await f.db.collection('prospeccao_campanhas').findOne({ _id: 'vendas' })).estado, 'pausada');
  console.log('PASS: fluxo comercial, retomada individual com campanha pausada, preços, FAQ, pedido, confirmação, idempotência, recusa, intervenção, pausa, bot, janela, falha incerta e dez promoções concorrentes.');
} finally { fila?.parar(); await f.fechar(); }
