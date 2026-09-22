// Oferta definida em 16/09/2026 a pedido do usuário. Sem dados bancários.
export const PROMOCAO_ID = 'lancamento-2026-primeiros-10';
export const OFERTA_LANCAMENTO = {
  nome: 'SmartDev AI — Atendimento Essencial',
  escopo: 'Um agente por texto para um número de WhatsApp de uma clínica, com até 50 perguntas frequentes, qualificação de interessados, registro de pedidos de retorno, encaminhamento humano e painel para até dois usuários. Inclui configuração inicial, teste com o cliente, hospedagem e backup. Não inclui diagnóstico médico, dados de pacientes, transcrição de áudio, agenda integrada, CRM, pagamentos ou campanhas de prospecção para a clínica.',
  implantacaoCentavos: 149000,
  mensalidadeCentavos: 49700,
  prazo: 'Prazo e data de início confirmados após análise do escopo, recebimento dos conteúdos e liberação da conta WhatsApp. Aprovações de terceiros podem alterar o cronograma.',
  condicoes: 'Mensalidade a partir da ativação. Inclui até uma hora por mês para suporte e ajustes simples de conteúdo, em dias úteis, das 9h às 18h de Brasília. Consumo de IA e tarifas da Meta/parceiro são separados, em contas do cliente; estimativa apresentada antes da contratação. Sem fidelidade mínima; cancelamento impede a próxima renovação quando solicitado antes dela. Desenvolvimento e integrações adicionais exigem orçamento. Sem promessa de conversão, faturamento ou disponibilidade absoluta. Implantação paga uma única vez, após aceite da proposta e confirmação de viabilidade. Nenhum desconto adicional automático.',
  linkContratacao: '',
  promocao: PROMOCAO_ID,
  faq: [
    { pergunta: 'O que o agente faz?', resposta: 'Responde por texto às dúvidas cadastradas da clínica, qualifica interessados e registra pedidos de retorno. Quando necessário, encaminha para sua equipe pelo painel.' },
    { pergunta: 'Preciso saber configurar a Meta?', resposta: 'Nós acompanhamos a configuração. Você mantém o controle da conta e participa das confirmações de acesso e do número.' },
    { pergunta: 'Ele agenda consultas?', resposta: 'Esta oferta registra pedidos de agendamento e encaminha à equipe. Reserva de horários em calendário exige integração e orçamento próprios.' },
    { pergunta: 'Ele entende áudio?', resposta: 'O atendimento automático desta oferta funciona por texto. Transcrição e interpretação de áudio não estão incluídas.' },
    { pergunta: 'Ele substitui toda a equipe?', resposta: 'A proposta é automatizar dúvidas recorrentes e a qualificação inicial. Sua equipe continua responsável pelas exceções e pelo atendimento humano.' },
    { pergunta: 'Posso usar o número atual?', resposta: 'Vamos verificar a situação do número e a modalidade de conexão antes de qualquer mudança. A continuidade no aplicativo depende da elegibilidade e do fluxo escolhido.' },
    { pergunta: 'Está caro ou quero desconto adicional', resposta: 'Para as dez primeiras contratações, a mensalidade fica em R$ 297 nos três primeiros meses e depois volta a R$ 497. Condições diferentes precisam ser analisadas pela equipe.' },
    { pergunta: 'Como vejo uma demonstração?', resposta: 'A equipe pode combinar uma demonstração do atendimento e do painel. Não vou confirmar um horário sem verificar a disponibilidade.' },
  ],
};

export function criarPromocao(db, agora = () => new Date()) {
  const registros = db.collection('prospeccao_promocoes');
  async function preparar() {
    await registros.updateOne({ _id: PROMOCAO_ID }, { $setOnInsert: { confirmados: [], criadoEm: agora() } }, { upsert: true });
  }
  async function status() {
    const p = await registros.findOne({ _id: PROMOCAO_ID });
    const usados = (p?.confirmados || []).length;
    return { id: PROMOCAO_ID, limite: 10, confirmados: usados, restantes: Math.max(0, 10 - usados), implantacaoNormalCentavos: 149000, implantacaoPromocionalCentavos: 99000, mensalidadePromocionalCentavos: 29700, mensalidadePromocionalMeses: 3, mensalidadeCentavos: 49700 };
  }
  async function confirmar({ clienteId, numero, referencia, usuario }) {
    const id = String(clienteId || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(id)) throw new Error('Informe o código único da empresa, de 3 a 80 caracteres, sem dados pessoais.');
    if (typeof referencia !== 'string' || referencia.trim().length < 5 || referencia.length > 120) throw new Error('Informe uma referência interna de contrato e pagamento, sem dados bancários.');
    const registro = { clienteId: id, numero, referencia: referencia.trim(), em: agora(), usuario, implantacaoCentavos: 99000, mensalidadePromocionalCentavos: 29700, mensalidadePromocionalMeses: 3, mensalidadeAposPromocaoCentavos: 49700 };
    // Uma única atualização Mongo torna o limite e a deduplicação atômicos,
    // inclusive se dois administradores confirmarem a última vaga juntos.
    const atualizado = await registros.findOneAndUpdate({ _id: PROMOCAO_ID, 'confirmados.clienteId': { $ne: id }, 'confirmados.numero': { $ne: numero }, 'confirmados.9': { $exists: false } }, { $push: { confirmados: registro } }, { returnDocument: 'after' });
    if (atualizado) return registro;
    const p = await registros.findOne({ _id: PROMOCAO_ID });
    const existente = p?.confirmados.find(c => c.clienteId === id || c.numero === numero);
    if (existente && existente.clienteId === id && existente.numero === numero) return existente;
    throw new Error(existente ? 'Empresa ou contato já vinculado a outra confirmação.' : 'As dez contratações promocionais já foram confirmadas. Não confirme pagamento com desconto fora desse limite.');
  }
  return { preparar, status, confirmar };
}
