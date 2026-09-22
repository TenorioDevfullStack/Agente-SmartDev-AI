import assert from 'node:assert/strict';
import { fixture } from './prospeccao-fixture.mjs';
const f=await fixture();let cookie='';
async function req(path,body){const r=await fetch(f.url+'/api'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-painel-request':'1',cookie},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
try{
 assert.equal((await req('/prospeccao/prospectos')).status,401);
 await req('/auth/login',{login:'admin',senha:'senha-teste-inicial'});
 assert.equal((await req('/prospeccao/campanhas/nova',{nome:''})).status,400);
 const c=await req('/prospeccao/campanhas/nova',{nome:'Campanha de teste'});assert.equal(c.status,201);
 const url='/prospeccao/campanhas/'+c.data.id+'/contatos';
 assert.equal((await req(url,{empresa:'Clínica [A]',telefone:'11999990001'})).status,201);
 assert.equal((await req(url,{empresa:'Duplicado',telefone:'11999990001'})).status,409);
 assert.equal((await req(url,{empresa:'Inválido',telefone:'abc'})).status,400);
 let r=await req('/prospeccao/prospectos?busca='+encodeURIComponent('[A]'));assert.equal(r.data.total,1);assert.equal(r.data.contatos[0].campanhaNome,'Campanha de teste');assert.equal(r.data.contatos[0].autorizado,false);
 assert.equal((await req('/prospeccao/prospectos?busca='+encodeURIComponent('.*'))).data.total,0);
 assert.equal((await req('/prospeccao/prospectos?grupo=contatados')).data.total,0);
 await f.db.collection('prospeccao_contatos').updateOne({_id:'5511999990001'},{$set:{tentativaEm:f.agora(),enviadoEm:f.agora(),respostaEm:f.agora()}});
 r=await req('/prospeccao/prospectos?grupo=responderam');assert.equal(r.data.total,1);assert.ok(r.data.contatos[0].enviadoEm);
 for(let i=2;i<=28;i++)await req(url,{empresa:'Prospecto '+i,telefone:'1199999'+String(i).padStart(4,'0')});
 r=await req('/prospeccao/prospectos');assert.equal(r.data.total,28);assert.equal(r.data.contatos.length,25);
 assert.equal((await req('/prospeccao/prospectos?pagina=2')).data.contatos.length,3);
 assert.equal(f.enviados.length,0);console.log('PASS: autenticação, criação sem planilha, duplicidade, busca literal, filtros, histórico e paginação; nenhum envio.');
}finally{await f.fechar();}
