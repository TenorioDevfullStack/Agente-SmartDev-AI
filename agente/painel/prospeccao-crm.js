/* Prospecção: navegação, base e ficha de contato. Sem dependências externas. */
window.criarCRMProspeccao = function(api, abrirCampanha, criarCampanha) {
  const $ = id => document.getElementById(id), root = document.querySelector('[data-vista="prospeccao"] .paineis-col');
  const make = (tag, text, cls) => { const n = document.createElement(tag); if(text != null) n.textContent=text; if(cls)n.className=cls; return n; };
  const btn = (text, fn, cls='btn') => { const b=make('button',text,cls); b.type='button'; b.onclick=fn; return b; };
  const original = [...root.children], intro=original[0], importar=original[1], campanhas=original[2], detalhe=$('pros-detalhe');
  root.classList.add('crm'); intro.classList.add('crm-hero'); intro.querySelector('h1').textContent='Relacionamentos que viram oportunidades';
  intro.querySelector('p').textContent='Sua base comercial, organizada do primeiro contato à contratação.';
  intro.querySelectorAll('p')[1].remove();
  const nav=make('nav',null,'crm-nav'); nav.setAttribute('aria-label','Áreas da prospecção'); intro.after(nav);
  const base=make('section',null,'cartao crm-base'); campanhas.before(base);
  let view='base', pagina=1, fichaNumero=null, rows=new Map(), snapshot=null, revision=0;
  function area(v) { view=v; base.hidden=v!=='base'; campanhas.hidden=v!=='campanhas'; importar.hidden=v!=='importar'; detalhe.hidden=v!=='detalhe'; for(const b of nav.children)b.setAttribute('aria-current',b.dataset.view===v?'page':'false'); }
  for(const [v,t] of [['base','Prospectos'],['campanhas','Campanhas'],['importar','Importar lista']]) {const b=btn(t,()=>{area(v);if(v==='base')refresh();});b.dataset.view=v;nav.append(b);}
  const stats=make('div',null,'crm-stats');base.append(stats);
  const toolbar=make('div',null,'crm-toolbar'); const title=make('div'); title.append(make('h2','Base de prospectos'),make('p','Encontre um contato e acompanhe seu histórico.'));toolbar.append(title);
  toolbar.append(btn('+ Novo prospecto',()=>novoProspecto(),'btn forte'));base.append(toolbar);
  const filters=make('div',null,'crm-filters'), search=make('input'), group=make('select');search.type='search';search.placeholder='Buscar empresa ou telefone';search.setAttribute('aria-label','Buscar prospectos');
  for(const [value,text]of [['','Todos os contatos'],['pendentes','Ainda não contatados'],['contatados','Contatos feitos'],['responderam','Responderam'],['bloqueados','Não contatar']]){const o=make('option',text);o.value=value;group.append(o);}group.setAttribute('aria-label','Filtrar contatos');
  filters.append(search,group,btn('Buscar',()=>{pagina=1;refresh();}));base.append(filters);search.onkeydown=e=>{if(e.key==='Enter'){pagina=1;refresh();}};group.onchange=()=>{pagina=1;refresh();};
  const tableBox=make('div',null,'crm-table-wrap'),pager=make('div',null,'crm-pager');base.append(tableBox,pager);
  const help=make('p','Crie uma campanha para organizar os contatos e a oferta.');help.id='crm-create-help';campanhas.querySelector('h2').textContent='Campanhas';campanhas.prepend(help);
  const form=make('form',null,'crm-filters'),name=make('input');name.required=true;name.maxLength=100;name.placeholder='Nome da nova campanha';name.setAttribute('aria-label','Nome da nova campanha');const submit=make('button','+ Criar campanha','btn forte');submit.type='submit';form.append(name,submit);campanhas.insertBefore(form,$('pros-campanhas'));
  form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await criarCampanha(name.value);name.value='';}catch(err){erro(err);}finally{submit.disabled=false;}};
  const back=btn('← Todas as campanhas',()=>area('campanhas'));detalhe.prepend(back);
  const tabs=make('div',null,'crm-nav'), content=make('div');$('pros-resumo').after(tabs);
  const prospectos=make('section'),config=make('section'),envio=make('section');
  const cadastro=detalhe.querySelector('details');prospectos.append(cadastro,$('pros-contatos'));config.append($('pros-promocao'),$('pros-oferta-form'));
  const nodes=[...detalhe.children];let started=false;for(const n of nodes){if(n.tagName==='LABEL')started=true;if(started)envio.append(n);}
  const sendSummary=make('div',null,'crm-send-summary');envio.prepend(sendSummary);
  content.append(prospectos,config,envio);detalhe.append(content);
  function tab(v){[prospectos,config,envio].forEach((n,i)=>n.hidden=i!==v);[...tabs.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===v)));}
  ['Prospectos da campanha','Oferta e horários','Revisar e iniciar'].forEach((t,i)=>tabs.append(btn(t,()=>tab(i))));tab(0);
  const save=config.querySelector('button[type="submit"]');$('pros-oferta-campos').append(save);save.textContent='Salvar configuração';
  const faq=$('pros-oferta-faq'); const faqDetails=make('details',null,'crm-faq');faq.before(faqDetails);faqDetails.append(make('summary','Editar perguntas e respostas'),faq,$('pros-faq-adicionar'));
  const dialog=make('dialog',null,'crm-drawer');dialog.setAttribute('aria-label','Ficha do prospecto');const close=btn('Fechar ficha ×',()=>dialog.close());const body=make('div');dialog.append(close,body);root.append(dialog);dialog.addEventListener('close',()=>fichaNumero=null);
  const labels={pendente:'Sem autorização',aprovado:'Pronto para contato',enviando:'Enviando',enviado:'Envio aceito',respondeu:'Respondeu',interessado:'Interessado',humano:'Atendimento humano',conversando:'Em conversa',nao_contatar:'Não contatar',revisao:'Revisar envio',provavel_bot:'Revisar resposta',pedido_contratacao:'Pedido de contratação',contratado:'Contratado'};
  const date=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
  function erro(e){$('pros-erro').textContent=e.message||'Não foi possível carregar.';$('pros-erro').scrollIntoView({block:'nearest'});}
  function table(list, open) {const t=make('table',null,'crm-table'),head=make('thead'),tr=make('tr');['Prospecto','Campanha','Situação','Último contato',''].forEach(x=>tr.append(make('th',x)));head.append(tr);t.append(head);const tb=make('tbody');for(const p of list){const r=make('tr'),identity=make('td');identity.append(make('strong',p.empresa),make('small',p._id));r.append(identity,make('td',p.campanhaNome||snapshot?.campanha.nome||'—'));const status=make('td');status.append(make('span',labels[p.estado]||p.estado,'crm-badge '+p.estado));r.append(status,make('td',date(p.respostaEm||p.enviadoEm||p.tentativaEm)));const action=make('td');action.append(btn('Ver ficha →',()=>open(p)));r.append(action);tb.append(r);}t.append(tb);return t;}
  async function refresh(){const rev=++revision;try{const r=await api('/prospeccao/prospectos?'+new URLSearchParams({busca:search.value,grupo:group.value,pagina}));if(rev!==revision)return;stats.replaceChildren();for(const[k,t]of [['todos','Na base'],['pendentes','Não contatados'],['contatados','Contatos feitos'],['responderam','Responderam']]){const box=make('div');box.append(make('strong',String(r.totais[k])),make('span',t));stats.append(box);}tableBox.replaceChildren(r.contatos.length?table(r.contatos,async p=>{try{await abrirCampanha(p.campanhaId,false);show(p._id);}catch(e){erro(e);}}):make('p','Nenhum prospecto encontrado. Cadastre um contato ou ajuste os filtros.','crm-empty'));pager.replaceChildren();const prev=btn('← Anterior',()=>{pagina--;refresh();});prev.disabled=pagina<=1;const next=btn('Próxima →',()=>{pagina++;refresh();});next.disabled=pagina*25>=r.total;pager.append(prev,make('span',`${r.total} contatos · Página ${pagina}`),next);}catch(e){erro(e);}}
  function show(numero){
    fichaNumero=numero;const p=snapshot?.contatos.find(x=>x._id===numero);if(!p)return;
    body.replaceChildren(make('h2',p.empresa),make('p',p._id+' · '+(p.segmento||'Segmento não informado')));
    const next=make('div',null,'crm-next-action');next.append(make('span','PRÓXIMA AÇÃO'));
    if(p.estado==='revisao'){
      next.append(make('strong','O resultado deste envio precisa ser conferido.'),make('p',p.observacao||'Abra o WhatsApp e confirme se a mensagem apareceu antes de escolher uma ação.'));
      const actions=make('div',null,'cartao-acoes');
      actions.append(btn('Abrir conversa',()=>{dialog.close();document.dispatchEvent(new CustomEvent('prospeccao:abrir-conversa',{detail:p._id}));}));
      actions.append(btn('A mensagem foi enviada',async()=>{if(!confirm('Confirma que você conferiu no WhatsApp e encontrou a mensagem enviada?'))return;try{await api('/prospeccao/contatos/'+encodeURIComponent(p._id),{method:'PATCH',body:JSON.stringify({acao:'confirmar_envio'})});await abrirCampanha(p.campanhaId,false);show(p._id);await refresh();}catch(e){erro(e);}},'btn forte'));
      if(!p.envioVendaPendente&&!p.enviadoEm)actions.append(btn('Não foi enviada · liberar nova tentativa',async()=>{if(!confirm('Confirma que verificou o WhatsApp e a mensagem NÃO foi enviada? Uma nova tentativa poderá gerar duplicidade se essa confirmação estiver errada.'))return;try{await api('/prospeccao/contatos/'+encodeURIComponent(p._id),{method:'PATCH',body:JSON.stringify({acao:'liberar_reenvio'})});dialog.close();await abrirCampanha(p.campanhaId,false);tab(2);await refresh();}catch(e){erro(e);}}));
      next.append(actions,make('small','Nunca libere uma nova tentativa sem conferir o histórico no WhatsApp.'));
    }else if(p.estado==='aprovado'&&p.autorizado&&!p.tentativaEm){
      next.append(make('strong','Este prospecto está pronto para receber a campanha.'),make('p','O envio será feito pela fila da campanha, dentro dos dias e horários configurados.'));
      next.append(btn('Revisar e iniciar campanha →',()=>{dialog.close();area('detalhe');tab(2);detalhe.scrollIntoView({behavior:'smooth',block:'start'});},'btn forte'));
    }else if(p.estado==='pendente'){
      next.append(make('strong','Registre a autorização antes do envio.'),make('p','Preencha a evidência de autorização abaixo para liberar este prospecto.'));
    }else if(p.tentativaEm){
      next.append(make('strong','A campanha já foi enviada para este prospecto.'),make('p','Use “Abrir conversa” abaixo para acompanhar o atendimento quando disponível.'));
    }else{
      next.append(make('strong',labels[p.estado]||p.estado),make('p','Confira as ações disponíveis abaixo.'));
    }
    body.append(next);
    const timeline=make('div',null,'crm-timeline');timeline.append(make('h3','Histórico da campanha'),make('strong',snapshot.campanha.nome));for(const[t,v]of [['Cadastrado',p.criadoEm],['Autorizado',p.aprovadoEm],['Tentativa de envio',p.tentativaEm],['Aceito pelo provedor',p.enviadoEm],['Última resposta',p.respostaEm],['Pedido de contratação',p.pedidoEm]])if(v)timeline.append(make('p',t+' · '+date(v)));if(!p.tentativaEm)timeline.append(make('p','Nenhum envio realizado.'));if(p.enviadoEm&&snapshot.campanha.modeloTexto)timeline.append(make('blockquote',snapshot.campanha.modeloTexto.replace('{{1}}',p.empresa)));timeline.append(make('small','Aceite do provedor não confirma leitura. Esta versão vincula cada prospecto a uma campanha.'));body.append(timeline);if(rows.has(numero))body.append(rows.get(numero));
    const excluir=make('div',null,'cartao-acoes');
    excluir.append(btn('Excluir prospecto e recomeçar',async()=>{
      if(!confirm('Excluir este prospecto e todo o histórico de teste deste número? Conversa, mensagens, lead, recados e agendamentos serão removidos. A auditoria será preservada.'))return;
      try{
        await api('/prospeccao/contatos/'+encodeURIComponent(p._id),{method:'DELETE'});
        dialog.close();await abrirCampanha(p.campanhaId,false);await refresh();
      }catch(e){erro(e);}
    },'btn perigo'));
    body.append(excluir);
    if(!dialog.open)dialog.showModal();
  }

  async function novoProspecto(){
    try {
      const r=await api('/prospeccao');const disponiveis=r.campanhas.filter(c=>['rascunho','pausada'].includes(c.estado));
      if(!disponiveis.length){area('campanhas');help.textContent='Crie uma campanha primeiro para organizar seu novo prospecto.';name.focus();return;}
      const d=make('dialog',null,'crm-drawer');d.setAttribute('aria-label','Cadastrar prospecto');const f=make('form',null,'pros-form');const campos={};
      const label=make('label','Campanha'),select=make('select');for(const c of disponiveis){const o=make('option',c.nome);o.value=c._id;select.append(o);}label.append(select);f.append(label);
      for(const [key,t]of [['empresa','Empresa'],['telefone','Telefone com DDD'],['segmento','Segmento'],['fonte','Fonte']]){const l=make('label',t),i=make('input');i.required=['empresa','telefone'].includes(key);i.maxLength=160;l.append(i);f.append(l);campos[key]=i;}
      const feedback=make('p');feedback.setAttribute('role','alert');const save=make('button','Cadastrar prospecto','btn forte');save.type='submit';f.append(make('p','O cadastro não envia mensagens. Registre a autorização na ficha antes de iniciar.'),feedback,save);d.append(btn('Cancelar ×',()=>d.close()),make('h2','Novo prospecto'),f);root.append(d);d.onclose=()=>d.remove();
      f.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('/prospeccao/campanhas/'+encodeURIComponent(select.value)+'/contatos',{method:'POST',body:JSON.stringify(Object.fromEntries(Object.entries(campos).map(([k,i])=>[k,i.value])))});d.close();await refresh();}catch(err){feedback.textContent=err.message;}finally{save.disabled=false;}};d.showModal();
    }catch(e){erro(e);}
  }
  function render(r){
    snapshot=r;const list=$('pros-contatos');rows=new Map(r.contatos.map((p,i)=>[p._id,list.children[i]]));list.replaceChildren(r.contatos.length?table(r.contatos,p=>show(p._id)):make('p','Esta campanha ainda não tem prospectos. Use “Adicionar prospecto” para começar.','crm-empty'));cadastro.querySelector('summary').textContent='+ Adicionar prospecto';
    const prontos=r.contatos.filter(p=>p.estado==='aprovado'&&p.autorizado&&!p.tentativaEm).length;
    const start=$('pros-iniciar'),ativa=r.campanha.estado==='ativa';
    start.textContent=ativa?`Campanha ativa · ${prontos} aguardando envio`:`Iniciar campanha · ${prontos} ${prontos===1?'prospecto pronto':'prospectos prontos'}`;
    start.dataset.crmDisabled=String(ativa||prontos===0);start.disabled=ativa||prontos===0;
    sendSummary.replaceChildren(make('span','ENVIO DA CAMPANHA'),make('h3',ativa?'Campanha em andamento':prontos?`${prontos} ${prontos===1?'prospecto está pronto':'prospectos estão prontos'} para envio`:'Nenhum prospecto pronto para envio'));
    const janela=r.campanha.janela||{dias:[1,2,3,4,5],inicio:'09:00',fim:'18:00'};
    sendSummary.append(make('p',ativa?'A fila está ativa e enviará os contatos no horário configurado.':prontos?'Ao iniciar, todos os prospectos prontos desta campanha entram na fila. O intervalo e o limite diário continuam valendo.':'Autorize pelo menos um prospecto antes de iniciar.'),make('p',`Janela: ${janela.inicio||'09:00'}–${janela.fim||'18:00'} · fuso de São Paulo.`));
    if(fichaNumero)show(fichaNumero);if(view!=='detalhe')detalhe.hidden=true;
  }
  area('base');
  return {refresh,render,open(){area('detalhe');tab(0);},reset(){revision++;root.querySelectorAll('dialog[open]').forEach(d=>d.close());rows.clear();snapshot=null;pagina=1;search.value='';group.value='';tableBox.replaceChildren();stats.replaceChildren();area('base');}};
};
