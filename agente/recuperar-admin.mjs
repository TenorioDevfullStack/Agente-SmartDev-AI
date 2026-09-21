// Recuperação local explícita. Não é executada durante a inicialização.
import { MongoClient } from 'mongodb';
import { hashSenha } from './autenticacao.mjs';
if (!process.env.PAINEL_SENHA) throw new Error('Defina PAINEL_SENHA antes de recuperar o administrador.');
const client = new MongoClient(process.env.MONGO_URL || 'mongodb://mongo:27017');
try {
  await client.connect(); const db = client.db('agente');
  const result = await db.collection('painel_usuarios').updateOne({ _id: 'administrador-inicial' }, {
    $set: { senhaHash: await hashSenha(process.env.PAINEL_SENHA), trocarSenha: true, ativo: true }, $inc: { versao: 1 },
  });
  if (!result.matchedCount) throw new Error('Administrador inicial não encontrado. Inicie o agente primeiro.');
  await db.collection('painel_sessoes').deleteMany({ usuarioId: 'administrador-inicial' });
  await db.collection('painel_auditoria').insertOne({ em: new Date(), usuario: { nome: 'Recuperação local via Docker' }, acao: 'recuperar_administrador', estado: 'concluida' });
  console.log('Administrador recuperado. Entre como admin com PAINEL_SENHA e defina uma nova senha pessoal.');
} finally { await client.close(); }
