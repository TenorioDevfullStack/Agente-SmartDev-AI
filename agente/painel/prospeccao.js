'use strict';
window.criarPainelProspeccao = function(api) {
  const el = id => document.getElementById(id);
  let previa = null, selecionada = null, modelos = [], ocupado = false, geracao = 0;
  let ofertaSuja = false, ofertaCampanha = null;
  const rascunhosContato = new Map();
  const estados = { pendente: 'Aguardando autorização', aprovado: 'Aprovado para envio', enviando: 'Enviando', enviado: 'Aceito pelo WhatsApp', respondeu: 'Resposta para revisar', interessado: 'Possível interesse', provavel_bot: 'Provável bot — revisar', nao_contatar: 'Não contatar', revisao: 'Revisão necessária', rascunho: 'Rascunho', ativa: 'Ativa', pausada: 'Pausada', concluida: 'Fila concluída', importando: 'Importando' };
  Object.assign(estados, { conversando: 'Conversa comercial automática', humano: 'Atendimento humano', pedido_contratacao: 'Pedido de contratação — conferir', contratado: 'Contratação confirmada' });
  const node = (tag, texto, classe) => { const n = document.createElement(tag); if (texto != null) n.textContent = texto; if (classe) n.className = classe; return n; };
  const request = (path, body, method = 'POST') => api('/prospeccao' + path, { method, body: JSON.stringify(body) });
  async function acao(fn) {
    if (ocupado) return;
    ocupado = true; el('pros-erro').textContent = '';
    const botoes = [...document.querySelectorAll('[data-vista="prospeccao"] button')];
    const anteriores = botoes.map(b => b.disabled); botoes.forEach(b => b.disabled = true);
    try { await fn(); } catch (err) { if (err.message !== 'nao autorizado') el('pros-erro').textContent = err.message; }
    finally { ocupado = false; botoes.forEach((b, i) => b.disabled = Object.hasOwn(b.dataset, 'crmDisabled') ? b.dataset.crmDisabled === 'true' : anteriores[i]); }
  }
  function botao(texto, fn) { const b = node('button', texto, 'btn'); b.type = 'button'; b.addEventListener('click', () => acao(fn)); return b; }
  const crm = window.criarCRMProspeccao(api, async (id, mostrar = true) => { selecionada = id; await detalhe(); if (mostrar) crm.open(); }, async nome => { const r = await request('/campanhas/nova', { nome }); selecionada = r.id; await carregar(); crm.open(); });
  const camposOferta = ['nome', 'escopo', 'prazo', 'condicoes'];
  function marcarOferta() { ofertaSuja = true; el('pros-oferta-aviso').textContent = 'Alterações não salvas. Salve a oferta antes de iniciar.'; }
  function mostrarModo() { el('pros-oferta-dados').hidden = el('pros-modo').value !== 'automatico'; }
  function adicionarFaq(item = {}) {
    if (el('pros-oferta-faq').children.length >= 20) throw new Error('Use até 20 perguntas e respostas.');
    const row = node('div', null, 'pros-form');
    const pergunta = node('input'), resposta = node('textarea'); pergunta.maxLength = 300; resposta.maxLength = 1000; resposta.rows = 3;
    pergunta.value = item.pergunta || ''; resposta.value = item.resposta || '';
    const p = node('label', 'Pergunta ou objeção '), r = node('label', 'Resposta autorizada '); p.append(pergunta); r.append(resposta);
    row.append(p, r, botao('Remover dúvida', async () => { row.remove(); marcarOferta(); })); el('pros-oferta-faq').append(row);
  }
  function preencherOferta(oferta = {}, modo = 'assistido') {
    el('pros-modo').value = modo; mostrarModo();
    camposOferta.forEach(c => el('pros-oferta-' + c).value = oferta[c] || '');
    for (const c of ['implantacao', 'mensalidade']) el('pros-oferta-' + c).value = Number.isInteger(oferta[c + 'Centavos']) ? (oferta[c + 'Centavos'] / 100).toFixed(2) : '';
    el('pros-oferta-link').value = oferta.linkContratacao || '';
    el('pros-oferta-promocao').checked = Boolean(oferta.promocao);
    el('pros-oferta-faq').replaceChildren(); (oferta.faq || []).forEach(adicionarFaq);
  }
  function preencherJanela(janela = {}) {
    const dias = Array.isArray(janela.dias) && janela.dias.length ? janela.dias : [1, 2, 3, 4, 5];
    const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']; const box = el('pros-janela-dias'); box.replaceChildren();
    nomes.forEach((nome, i) => { const l = node('label', nome + ' '), c = node('input'); c.type = 'checkbox'; c.value = i; c.checked = dias.includes(i); l.prepend(c); box.append(l); });
    el('pros-janela-inicio').value = janela.inicio || '09:00'; el('pros-janela-fim').value = janela.fim || '18:00';
  }
  el('pros-modo').addEventListener('change', mostrarModo);
  el('pros-oferta-form').addEventListener('input', marcarOferta);
  el('pros-oferta-form').addEventListener('change', marcarOferta);
  el('pros-faq-adicionar').addEventListener('click', () => acao(async () => { adicionarFaq(); marcarOferta(); }));
  el('pros-usar-lancamento').addEventListener('click', () => acao(async () => {
    const r = await api('/prospeccao/oferta-padrao'); preencherOferta(r.oferta, 'automatico'); marcarOferta();
  }));
  el('pros-oferta-form').addEventListener('submit', ev => { ev.preventDefault(); acao(async () => {
    const oferta = Object.fromEntries(camposOferta.map(c => [c, el('pros-oferta-' + c).value]));
    for (const c of ['implantacao', 'mensalidade']) {
      const valor = el('pros-oferta-' + c).value;
      oferta[c + 'Centavos'] = valor === '' ? null : Math.round(Number(valor) * 100);
    }
    oferta.linkContratacao = el('pros-oferta-link').value;
    oferta.promocao = el('pros-oferta-promocao').checked ? 'lancamento-2026-primeiros-10' : undefined;
    oferta.faq = [...el('pros-oferta-faq').children].map(row => ({ pergunta: row.querySelector('input').value, resposta: row.querySelector('textarea').value }));
    const dias = [...el('pros-janela-dias').querySelectorAll('input:checked')].map(c => Number(c.value));
    await request(`/campanhas/${selecionada}/oferta`, { modo: el('pros-modo').value, oferta, janela: { dias, inicio: el('pros-janela-inicio').value, fim: el('pros-janela-fim').value } }, 'PATCH'); ofertaSuja = false; await detalhe();
  }); });
  function mostrarPrevia(linhas) {
    const validas = linhas.filter(l => !l.erro).length;
    const box = el('pros-previa'); box.replaceChildren(node('p', `${validas} contatos válidos; ${linhas.length - validas} linhas para corrigir no arquivo. Nenhum envio foi realizado.`));
    const wrap = node('div', null, 'pros-tabela'), table = node('table'), head = node('tr');
    ['Linha', 'Empresa', 'Telefone', 'Validação'].forEach(t => head.append(node('th', t))); table.append(head);
    linhas.forEach(l => { const tr = node('tr'); [l.linha, l.empresa, l.numero || l.telefoneOriginal, l.erro || 'Válido — autorização pendente'].forEach(t => tr.append(node('td', t))); table.append(tr); });
    wrap.append(table); box.append(wrap); el('pros-criar').hidden = !validas;
  }
  el('pros-importar').addEventListener('submit', ev => { ev.preventDefault(); acao(async () => {
    previa = null; el('pros-criar').hidden = true; el('pros-previa').replaceChildren();
    const arquivo = el('pros-arquivo').files[0];
    if (!arquivo || arquivo.size > 2 * 1024 * 1024) throw new Error('Escolha um arquivo de até 2 MB.');
    const g = geracao;
    const r = await api('/prospeccao/previa', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-arquivo-nome': encodeURIComponent(arquivo.name) }, body: arquivo });
    if (g !== geracao) return;
    previa = r.id; mostrarPrevia(r.linhas);
  }); });
  el('pros-criar').addEventListener('submit', ev => { ev.preventDefault(); acao(async () => {
    const r = await request('/campanhas', { previaId: previa, nome: el('pros-nome').value });
    selecionada = r.id; previa = null; el('pros-criar').hidden = true; el('pros-previa').replaceChildren(node('p', `${r.inseridos} contatos importados. Revise as autorizações abaixo.`));
    await carregar(); crm.open();
  }); });
  function textoModelo() {
    const m = modelos[Number(el('pros-modelo').value)]; el('pros-texto').textContent = m?.texto || 'Nenhum modelo disponível. Use Atualizar após configurar um modelo aprovado.';
  }
  el('pros-modelo').addEventListener('change', textoModelo);
  el('pros-contato-form').addEventListener('submit', ev => { ev.preventDefault(); acao(async () => { await request(`/campanhas/${selecionada}/contatos`, { empresa: el('pros-contato-empresa').value, telefone: el('pros-contato-telefone').value, segmento: el('pros-contato-segmento').value, fonte: el('pros-contato-fonte').value }); ev.target.reset(); await detalhe(); }); });
  async function carregarModelos() {
    const g = geracao, r = await api('/prospeccao/modelos'); if (g !== geracao) return;
    modelos = r.modelos; el('pros-aviso').textContent = r.aviso || '';
    el('pros-modelo').replaceChildren();
    modelos.forEach((m, i) => { const o = node('option', `${m.nome} (${m.idioma})`); o.value = i; el('pros-modelo').append(o); }); textoModelo();
  }
  async function carregar() {
    const g = geracao;
    const r = await api('/prospeccao'); if (g !== geracao) return;
    el('pros-campanhas').replaceChildren();
    if (!r.campanhas.length) el('pros-campanhas').append(node('p', 'Nenhuma campanha ainda. Crie sua primeira campanha acima.'));
    r.campanhas.forEach(c => el('pros-campanhas').append(botao(`${c.nome} · ${estados[c.estado] || c.estado}`, async () => { selecionada = c._id; await detalhe(); crm.open(); })));
    if (selecionada) await detalhe();
    await crm.refresh();
  }
  async function detalhe() {
    const id = selecionada, g = geracao, r = await api(`/prospeccao/campanhas/${encodeURIComponent(id)}`);
    if (g !== geracao || id !== selecionada) return;
    el('pros-detalhe').hidden = false; el('pros-titulo').textContent = r.campanha.nome;
    if (ofertaCampanha !== id || !ofertaSuja) {
      preencherOferta(r.campanha.oferta || {}, r.campanha.modo || 'assistido'); ofertaCampanha = id; ofertaSuja = false;
      preencherJanela(r.campanha.janela);
      el('pros-oferta-aviso').textContent = r.contatos.some(p => p.tentativaEm) ? 'Oferta bloqueada após o primeiro envio. Você ainda pode pausar a campanha ou assumir conversas.' : 'Oferta salva. Revise o modelo e as autorizações antes de iniciar.';
    }
    el('pros-oferta-campos').disabled = r.campanha.estado === 'ativa' || r.contatos.some(p => p.tentativaEm);
    el('pros-promocao').textContent = r.promocao ? `Lançamento: ${r.promocao.confirmados} de 10 contratações confirmadas. ${r.promocao.restantes} disponíveis no momento. Pedidos e links enviados não reservam vagas.` : '';
    const totais = {}; r.contatos.forEach(p => totais[p.estado] = (totais[p.estado] || 0) + 1);
    el('pros-resumo').textContent = `${estados[r.campanha.estado] || r.campanha.estado}. ${Object.entries(totais).map(([k,v]) => `${v} ${estados[k] || k}`).join(' · ')}. ${r.campanha.observacao || ''}`;
    el('pros-contatos').replaceChildren();
    r.contatos.forEach(p => {
      const rascunho = rascunhosContato.get(p._id) || {};
      rascunhosContato.set(p._id, rascunho);
      const row = node('div', null, 'pros-linha'); row.append(node('strong', p.empresa), node('p', `${p._id} · ${estados[p.estado] || p.estado}`));
      if (p.ultimaResposta) row.append(node('p', `Resposta: ${p.ultimaResposta}`));
      if (p.observacao) row.append(node('p', p.observacao));
      if (p.etapaVenda) row.append(node('p', `Etapa comercial: ${p.etapaVenda === 'contratar' ? 'Link enviado; pagamento não confirmado' : p.etapaVenda}. Respostas automáticas: ${p.turnosVenda || 0}/20.`));
      if (p.evidencia) row.append(node('p', `Autorização registrada: ${p.evidencia}`));
      if (p.estado === 'pendente') {
        const form = node('form', null, 'pros-form'), label = node('label', 'Como e quando o destinatário autorizou o contato?'), input = node('input');
        input.required = true; input.minLength = 10; input.maxLength = 500; input.placeholder = 'Ex.: autorização na reunião de 14/09, registrada no CRM'; label.append(input);
        input.value = rascunho.evidencia || ''; input.addEventListener('input', () => { rascunho.evidencia = input.value; });
        const b = node('button', 'Registrar autorização e aprovar', 'btn'); b.type = 'submit'; form.append(label, b);
        form.addEventListener('submit', ev => { ev.preventDefault(); acao(async () => { await request(`/contatos/${p._id}`, { acao: 'aprovar', evidencia: input.value }, 'PATCH'); delete rascunho.evidencia; await detalhe(); }); }); row.append(form);
      }
      if (p.estado !== 'nao_contatar') row.append(botao('Não contatar', async () => { await request(`/contatos/${p._id}`, { acao: 'bloquear' }, 'PATCH'); await detalhe(); }));
      if (r.campanha.modo === 'automatico' && p.enviadoEm && !['nao_contatar', 'contratado'].includes(p.estado)) {
        row.append(botao('Assumir atendimento', async () => { await request(`/contatos/${p._id}`, { acao: 'humano' }, 'PATCH'); await detalhe(); }));
        if (!p.envioVendaPendente && p.estado !== 'revisao') row.append(botao('Retomar agente na próxima mensagem', async () => { await request(`/contatos/${p._id}`, { acao: 'retomar_conversa' }, 'PATCH'); await detalhe(); }));
      }
      if (p.pedidoEm && !p.fechamento && r.campanha.oferta?.promocao) {
        const form = node('form', null, 'pros-form'), codigo = node('input'), referencia = node('input');
        codigo.required = true; codigo.pattern = '[a-zA-Z0-9][a-zA-Z0-9_\\-]{2,79}'; codigo.maxLength = 80;
        referencia.required = true; referencia.minLength = 5; referencia.maxLength = 120;
        codigo.value = rascunho.codigo || ''; referencia.value = rascunho.referencia || '';
        codigo.addEventListener('input', () => { rascunho.codigo = codigo.value; });
        referencia.addEventListener('input', () => { rascunho.referencia = referencia.value; });
        const l1 = node('label', 'Código único da empresa (ex.: clinica-centro) '), l2 = node('label', 'Referência interna do contrato e pagamento ');
        l1.append(codigo); l2.append(referencia);
        const check = node('input'); check.type = 'checkbox'; check.required = true;
        check.checked = rascunho.conferido || false; check.addEventListener('change', () => { rascunho.conferido = check.checked; });
        const l3 = node('label', 'Conferi o contrato aceito e o pagamento da implantação de R$ 990. Não inserir dados bancários. '); l3.prepend(check);
        const b = node('button', 'Confirmar contratação promocional', 'btn'); b.type = 'submit'; form.append(l1, l2, l3, b);
        form.addEventListener('submit', ev => { ev.preventDefault(); acao(async () => {
          await request(`/contatos/${p._id}/confirmar-contratacao`, { clienteId: codigo.value, referencia: referencia.value, contratoAceito: check.checked, pagamentoConferido: check.checked }); rascunhosContato.delete(p._id); await detalhe();
        }); }); row.append(form);
      }
      if (p.tentativaEm) row.append(botao('Abrir conversa', async () => {
        document.querySelector('.crm-drawer[open]')?.close();
        document.querySelector('#abas button[data-aba="conversas"]').click();
        document.dispatchEvent(new CustomEvent('prospeccao:abrir-conversa', { detail: p._id }));
      }));
      el('pros-contatos').append(row);
    });
    crm.render(r);
  }
  el('pros-atualizar').addEventListener('click', () => acao(async () => { await carregarModelos(); await carregar(); }));
  el('pros-iniciar').addEventListener('click', () => acao(async () => {
    if (ofertaSuja) throw new Error('Salve as alterações da oferta antes de iniciar.');
    const m = modelos[Number(el('pros-modelo').value)];
    if (!m) throw new Error('Nenhum texto de campanha disponível. Configure a conexão e atualize os modelos.');
    const riscoEvolution = el('pros-risco-evolution').checked;
    await request(`/campanhas/${selecionada}/iniciar`, { modeloNome: m.nome, modeloIdioma: m.idioma, riscoEvolution }); await carregar();
  }));
  el('pros-pausar').addEventListener('click', () => acao(async () => { await request(`/campanhas/${selecionada}/pausar`, {}); await carregar(); }));
  return {
    abrir: () => acao(async () => { await carregarModelos(); await carregar(); }),
    atualizar: async () => { if (!ocupado && !document.querySelector('.crm-drawer[open]') && !el('pros-contato-form').contains(document.activeElement) && !el('pros-contatos').contains(document.activeElement) && !el('pros-oferta-form').contains(document.activeElement)) await acao(carregar); },
    limpar() { crm.reset(); geracao++; previa = null; selecionada = null; modelos = []; ofertaSuja = false; ofertaCampanha = null; rascunhosContato.clear(); ['pros-previa','pros-campanhas','pros-contatos'].forEach(id => el(id).replaceChildren()); preencherOferta(); el('pros-criar').hidden = true; el('pros-detalhe').hidden = true; el('pros-arquivo').value = ''; el('pros-nome').value = ''; },
  };
};
