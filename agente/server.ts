import express from "express";
import axios from "axios";
import { MongoClient } from "mongodb";
import { criarAutenticacao } from "./autenticacao.mjs";
import { criarProspeccao } from "./prospeccao.mjs";
import { criarTransporteProspeccao } from "./prospeccao-transporte.mjs";
import { criarVendasProspeccao } from "./prospeccao-vendas.mjs";
import { criarPromocao } from "./prospeccao-oferta.mjs";
import { fileURLToPath } from "node:url";
import { criarFilaGroq, AtendimentoAssumido } from "./confiabilidade.mjs";
import { criarFilaPersistente, etapa, RevisaoNecessaria, emFilaPersistente } from "./fila-persistente.mjs";
import { montarAlertas, consultarEspera, JANELA_FALHAS_MS, RESPOSTA_FALHA } from "./alertas.mjs";

const filaGroq = criarFilaGroq();
const estadosIA = new Map<string, any>();
const versoesHumanas = new Map<string, number>();
const enviosPendentes = new Map<string, Set<Promise<void>>>();

const app = express();
app.use(express.json());

// ===== CONFIG =====
const EVOLUTION_URL = process.env.EVOLUTION_URL || "http://evolution-api:8080";
const INSTANCE = process.env.INSTANCE || "agente-suporte";
const API_KEY = process.env.API_KEY || "";
const PROSPECCAO_PERMITIR_BAILEYS = process.env.PROSPECCAO_PERMITIR_BAILEYS === "true";
const PROSPECCAO_MODELO_TEXTO = process.env.PROSPECCAO_MODELO_TEXTO || "";
// "groq" (nuvem, padrão) ou "ollama" (local, fallback).
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "groq").toLowerCase();
const OLLAMA_URL = process.env.OLLAMA_URL || "http://host.docker.internal:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";
const GROQ_URL =
  process.env.GROQ_URL || "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MONGO_URL = process.env.MONGO_URL || "mongodb://mongo:27017";
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "";
const CONTATO_PESSOAL = process.env.CONTATO_PESSOAL || "";
// Usada apenas para criar o primeiro administrador. Depois, o Mongo guarda
// hashes individuais; alterar este valor não redefine senhas existentes.
const PAINEL_SENHA = process.env.PAINEL_SENHA || "";
// Os containers rodam em UTC. Sem fixar o fuso, uma conversa às 21h vira o dia
// seguinte em toda data mostrada e no cálculo do que ainda está por vir.
const TZ = "America/Sao_Paulo";

// ===== COMERCIAL =====
// Fonte comercial: https://agente.smartdevai.com.br/ (conferida em 12/09/2026).
// A página define valor, prazo e condições após entender o cenário do cliente.
// Só preencher valores quando houver uma oferta aprovada compatível com o site.
const PRECO = {
  implantacao: "",
  mensalidade: "",
};

// Prazo padrão de implantação. Vazio = "definido na conversa". Com produto
// padronizado, prazo curto é argumento de venda.
const PRAZO = "";

const temPreco = Boolean(PRECO.implantacao || PRECO.mensalidade);

// ===== CATÁLOGO =====
// AJUSTE AQUI: é só isto que o agente sabe oferecer. O que não está aqui, ele
// não vende — o prompt proíbe falar de serviço sem consultar esta lista.
// Tem que espelhar a landing page: serviço só na página vira promessa que o
// atendimento nega; só aqui, o contrário.
//
// O negócio é criar agentes de IA sob medida. As capacidades abaixo compõem
// o escopo da proposta; não são pacotes com preço ou prazo universal.
//
// "sinonimos": como o CLIENTE pede, não como você nomeia. É por eles que a
// busca casa; termo faltando aqui é serviço invisível no atendimento.
// "exemplo": prova social. Só o que é verificável — o que foi construído,
// nunca resultado que um cliente teria tido.
const CATALOGO: Record<
  string,
  {
    nome: string;
    descricao: string;
    sinais: string;
    inclui: string;
    sinonimos: string[];
    exemplo?: string;
  }
> = {
  agente_atendimento: {
    nome: "Atendimento no WhatsApp com a voz da sua marca",
    descricao:
      "Um agente de IA sob medida que responde dúvidas sobre serviços, horários e processos no WhatsApp, inclusive fora do horário da equipe, com as informações e o tom de voz da empresa.",
    sinais:
      "Quem perde cliente por demorar a responder, repete a mesma explicação o dia inteiro ou recebe mensagem fora do horário e só vê no dia seguinte.",
    inclui:
      "Informações e orientações do negócio, conversas com contexto, tom de voz da marca e testes com o cliente antes da entrada em operação, conforme o escopo combinado.",
    sinonimos: [
      "agente", "agentes", "assistente", "assistente virtual", "chatbot",
      "bot", "robo", "ia", "inteligencia artificial", "atendimento",
      "atendente", "responder cliente", "whatsapp", "automatizar atendimento",
      "secretaria virtual",
    ],
    exemplo:
      "Este canal permite conhecer o atendimento da SmartDev AI. O agente de cada empresa é configurado e validado conforme seu próprio escopo.",
  },
  agente_qualificacao: {
    nome: "Qualificação de contatos e apoio às vendas",
    descricao:
      "Identifica o interesse de cada contato, entende a necessidade e reúne o contexto para a equipe continuar o atendimento e orientar o próximo passo.",
    sinais:
      "Quem recebe muitos interessados, repete perguntas de triagem ou precisa organizar as oportunidades para a equipe comercial.",
    inclui:
      "Perguntas de qualificação e registro das informações relevantes, com caminhos de conversa definidos com a empresa. Apoia vendas sem garantir conversão ou faturamento.",
    sinonimos: [
      "qualificar", "qualificacao", "contatos", "lead", "leads", "venda", "vendas",
      "comercial", "oportunidades", "interesse", "triagem", "captar clientes",
    ],
  },
  agente_humano: {
    nome: "Encaminhamento para atendimento humano",
    descricao:
      "Cuida das perguntas recorrentes e encaminha para uma pessoa quando a conversa precisa de atenção especial ou ultrapassa as informações disponíveis.",
    sinais:
      "Quem quer automatizar o repetitivo mantendo a equipe no controle de dúvidas específicas e situações que exigem análise humana.",
    inclui:
      "Regras de quando e como encaminhar definidas com o cliente, conforme sua operação e ferramentas. Não promete uma pessoa disponível imediatamente.",
    sinonimos: [
      "humano", "humana", "pessoa", "equipe", "encaminhar", "encaminhamento",
      "transferir", "transferencia", "assumir conversa", "nao souber responder",
    ],
  },
};

// ===== APRESENTAÇÃO DO CANAL =====
// Enviado uma única vez por contato, fora do LLM, para garantir que todo mundo
// seja avisado mesmo se o modelo escorregar. Não contém o número pessoal:
// esse só sai pela tool contatoPessoal, para quem pedir.
const AVISO_NUMERO =
  "Olá! Sou o assistente de IA da *SmartDev AI*. 👋\n\n" +
  "Ajudamos empresas a atender, qualificar contatos e apoiar suas vendas no WhatsApp, com a voz da sua marca.\n\n" +
  "Como posso ajudar sua empresa hoje?";

// 5511989437498 -> { exibicao: "(11) 98943-7498", link: "https://wa.me/5511989437498" }
function formatarContato(digitos: string) {
  const s = digitos.replace(/\D/g, "");
  const local = s.startsWith("55") ? s.slice(2) : s;
  const ddd = local.slice(0, 2);
  const n = local.slice(2);

  const numero =
    n.length === 9
      ? `${n.slice(0, 5)}-${n.slice(5)}`
      : n.length === 8
      ? `${n.slice(0, 4)}-${n.slice(4)}`
      : n;

  return {
    exibicao: `(${ddd}) ${numero}`,
    link: `https://wa.me/${s.startsWith("55") ? s : "55" + s}`,
  };
}

// ===== DATAS =====
// "2026-08-27" -> "qui, 27/08". Meio-dia de propósito: com T00:00 qualquer
// deslocamento de fuso joga a data para o dia anterior.
function formatarDataISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

// Data de hoje em São Paulo, no formato AAAA-MM-DD. Como o ISO ordena igual
// alfabética e cronologicamente, dá para comparar com string pura no Mongo.
function hojeISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

// ===== PERSONA: SDR QUE TAMBÉM É A DEMONSTRAÇÃO =====
// Mantido curto de propósito: cada token daqui é reprocessado a cada mensagem.
const SYSTEM_PROMPT = "Você é o assistente de IA da SmartDev AI. Atende em português brasileiro, com linguagem acolhedora, clara e direta.\nA SmartDev AI cria agentes de IA sob medida para atender, qualificar contatos e apoiar vendas no WhatsApp, com as informações, orientações e a voz da marca de cada cliente.\nLeandro é o responsável pelo atendimento humano deste canal. Apresente a empresa como SmartDev AI, não como um serviço pessoal dele.\nO contato já recebeu uma apresentação automática. Não repita a saudação nem uma pergunta que ele já respondeu.\n\nPROPOSTA E LIMITES:\n- Atendimento além do horário, conversas com contexto e equipe no controle. Automatize perguntas recorrentes e preserve o atendimento humano quando necessário.\n- Consulte consultarServico antes de apresentar capacidades, serviços, valores ou prazos. Use as palavras do cliente; use \u0027todos\u0027 para conhecer a oferta completa ou responder dúvidas gerais sobre preço e processo.\n- As capacidades compõem um projeto sob medida, não três planos fixos. Agendamento e conexões com sistemas dependem do escopo e das ferramentas; não são inclusões automáticas.\n- Valor e prazo dependem dos fluxos, do volume de informações e das integrações necessárias. Proposta, escopo e condições são apresentados antes do início. Não invente preços, faixas, mensalidades, ajustes ilimitados ou prazo padrão.\n- Etapas: entender o negócio e as dúvidas dos clientes; organizar informações, tom de voz e caminhos da conversa; testar situações reais com o cliente e ajustar respostas e limites; entrar em operação no WhatsApp conforme o escopo combinado. O cliente valida antes de colocar em ação.\n- O cliente não precisa entender tecnologia: contribui com o conhecimento do negócio; criação e configuração fazem parte do serviço.\n- A IA pode cometer erros. Se não souber, reconheça o limite e ofereça encaminhamento humano. Nunca invente uma resposta nem prometa atendimento humano imediato.\n- Não ofereça sites, e-commerce ou sistemas de gestão avulsos. Pedidos fora do catálogo precisam de avaliação; não invente serviços.\n\nCONVERSA:\n- Receba, entenda o contexto e oriente o próximo passo. Responda primeiro à dúvida; faça uma pergunta por vez, sem transformar a conversa em formulário.\n- Quem veio do site conhecer os agentes da SmartDev AI já demonstrou interesse comercial: não pergunte se é assunto pessoal.\n- Descubra naturalmente nome, empresa, necessidade, dúvidas frequentes e quem atende hoje. Não repita informações já fornecidas.\n- Com nome e necessidade, chame registrarLead imediatamente. Atualize com novos dados; registre quem atende hoje em atendimentoHoje.\n- Ofereça uma conversa sem compromisso com Leandro para entender o cenário e definir a proposta. Não pressione quem só quer tirar dúvidas ou testar.\n- Se quiser testar, explique o que este canal realmente faz. Exemplos hipotéticos devem ser identificados como simulação e nunca confirmar uma reserva, venda ou ação real.\n- Use \u0027agente de IA\u0027 ou \u0027assistente\u0027 naturalmente, como no site. Explique benefícios com palavras simples; termos técnicos só quando úteis ao interlocutor.\n- Respostas curtas, em geral 3 a 4 linhas, cordiais e diretas.\n\nFUNÇÕES E ENCAMINHAMENTO:\n- Dia e hora confirmados para conversar com Leandro: chame agendarVisita. Converta datas relativas usando a data atual e preencha dataISO.\n- Pedido de atendimento humano, retorno ou dúvida que exige análise humana: obtenha o motivo se faltar e chame deixarRecado quando não houver dia e hora definidos. Nunca prometa retorno sem chamar a função.\n- Só confirme ações após sucesso da função. Em caso de erro, explique que não conseguiu concluir e ofereça suporte@smartdevai.com.br. Não exponha nomes de funções nem detalhes internos.\n- Assunto explicitamente pessoal com Leandro: não qualifique nem registre lead; chame contatoPessoal e repasse apenas o contato retornado. Nunca forneça o número pessoal para contatos comerciais.\n- Não invente clientes, depoimentos, resultados, garantias de vendas ou experiência da empresa. A demonstração do site é ilustrativa, não um caso de sucesso nem garantia de todos os recursos neste canal.\n- Site oficial: https://agente.smartdevai.com.br/ . Suporte: suporte@smartdevai.com.br.";

// ===== TOOLS =====
const TOOLS = [
  {
    type: "function",
    function: {
      name: "consultarServico",
      description:
        "Catálogo oficial da SmartDev AI. Use sempre que perguntarem sobre serviços, ou quando a pessoa descrever um problema e você precisar saber se existe solução para ele.",
      parameters: {
        type: "object",
        properties: {
          // Sem enum de propósito: o enum entregava a lista de serviços ao
          // modelo, que passava a responder de memória sem consultar.
          servico: {
            type: "string",
            description:
              "O que a pessoa pediu, nas palavras dela ('qualificar contatos', 'apoiar vendas', 'encaminhar para minha equipe'), ou 'todos' para a lista completa.",
          },
        },
        required: ["servico"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contatoPessoal",
      description:
        "Contato pessoal do Leandro. APENAS para assunto particular. NUNCA para quem veio a negócio.",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string", description: "O assunto particular, em poucas palavras" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrarLead",
      description:
        "Registra ou atualiza o lead. Chame assim que souber nome e necessidade.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome da pessoa" },
          necessidade: { type: "string", description: "O problema a resolver" },
          empresa: { type: "string", description: "Empresa, se dita" },
          ramo: { type: "string", description: "Ramo de atuação, se dito" },
          urgencia: {
            type: "string",
            enum: ["alta", "media", "baixa", "nao_informada"],
          },
          atendimentoHoje: {
            type: "string",
            description:
              "Quem responde os clientes hoje. É o que dimensiona o projeto e mostra quanto tempo o assistente devolve.",
            enum: [
              "o_dono",
              "um_funcionario",
              "equipe",
              "ninguem",
              "nao_informado",
            ],
          },
        },
        required: ["nome", "necessidade"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendarVisita",
      description:
        "Agenda o diagnóstico com o Leandro. Só quando a pessoa confirmar dia e hora.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome da pessoa" },
          data: { type: "string", description: "Data combinada (ex: 'quinta', '12/03')" },
          dataISO: {
            type: "string",
            description:
              "A mesma data no formato AAAA-MM-DD, calculada a partir da data de hoje. Preencha sempre que der para deduzir.",
          },
          horario: { type: "string", description: "Horário (ex: '14h')" },
          modalidade: {
            type: "string",
            enum: ["online", "presencial", "telefone"],
          },
        },
        required: ["nome", "data", "horario"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deixarRecado",
      description:
        "Pedido de retorno: a pessoa quer que o Leandro entre em contato, mas sem dia e hora marcados. Se houver dia e hora, use agendarVisita.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome da pessoa" },
          assunto: { type: "string", description: "Sobre o que ela quer falar" },
          melhorHorario: {
            type: "string",
            description: "Quando é melhor procurá-la, se disse (ex: 'de manhã')",
          },
          telefone: {
            type: "string",
            description:
              "Outro telefone para retorno, só se ela indicar um diferente do WhatsApp",
          },
        },
        required: ["nome", "assunto"],
      },
    },
  },
];

// ===== MONGO =====
const client = new MongoClient(MONGO_URL);
let db: any;
let filaPersistente: any;
let autenticacao: any;
let prospeccao: any;

async function initDb() {
  for (let i = 0; i < 10; i++) {
    try {
      await client.connect();
      db = client.db("agente");
      // O log do painel cresce sem teto; sem índice, abrir uma conversa antiga
      // vira varredura da coleção inteira.
      await db.collection("mensagens").createIndex({ numero: 1, em: 1 });
      await db.collection("envios_agente").createIndex({ em: 1 }, { expireAfterSeconds: 604800 });
      await db.collection("eventos_humanos").createIndex({ em: 1 }, { expireAfterSeconds: 604800 });
      await db.collection("eventos_operacionais").createIndex({ em: 1 }, { expireAfterSeconds: 604800 });
      await db.collection("eventos_operacionais").createIndex({ tipo: 1, em: -1 });
      autenticacao = await criarAutenticacao(db, express.Router, PAINEL_SENHA);
      const transporteProspeccao = criarTransporteProspeccao({ http: axios, url: EVOLUTION_URL, instance: INSTANCE, apiKey: API_KEY, pendentes: enviosPendentes, permitirBaileys: PROSPECCAO_PERMITIR_BAILEYS, textoBaileys: PROSPECCAO_MODELO_TEXTO,
          registrarId: (numero: string, id: string) => db.collection("envios_agente").updateOne({ _id: `${numero}:${id}` }, { $set: { em: new Date() } }, { upsert: true }),
        });
      const promocao = criarPromocao(db);
      const vendas = criarVendasProspeccao(db, {
        promocao,
        validarTransporte: transporteProspeccao.validarConexao,
        inferir: (messages: any[], numero: string, verificar: any) => chamarLLMReal(messages, numero, verificar, []),
        enviar: async (numero: string, texto: string) => {
          if (!await enviarMensagemReal(numero, texto)) throw new RevisaoNecessaria('Envio comercial não confirmado.');
        },
        registrarSaida: async (numero: string, texto: string) => {
          await db.collection("conversas").updateOne({ _id: numero }, { $push: { mensagens: { $each: [{ role: "assistant", content: texto }], $slice: -HISTORICO_MAX } } });
          await logMensagemReal(numero, "assistant", texto, "agente");
        },
        notificarHumano: async ({ numero, empresa, motivo }: { numero: string; empresa?: string; motivo: string }) => {
          if (!ADMIN_NUMBER || ADMIN_NUMBER === numero) {
            console.warn("[ADMIN] Aviso de atendimento humano não enviado: configure ADMIN_NUMBER com um WhatsApp diferente do prospecto");
            return false;
          }
          const contato = formatarContato(numero);
          return avisarAdmin(
            "🔔 *Atendimento comercial aguardando você*\n\n" +
            "*" + (empresa || "Prospecto") + "*\n" +
            "📱 " + contato.exibicao + "\n" +
            "Motivo: " + motivo + "\n\n" +
            "Abrir conversa: " + contato.link,
          );
        },
      });
      prospeccao = criarProspeccao(db, {
        transporte: transporteProspeccao, vendas, promocao,
        registrarSaida: async (numero: string, texto: string, usuario: any) => {
          await db.collection("contatos").updateOne({ _id: numero }, { $set: { avisadoEm: new Date() } }, { upsert: true });
          await db.collection("conversas").updateOne({ _id: numero }, { $push: { mensagens: { $each: [{ role: "assistant", content: texto }], $slice: -HISTORICO_MAX } } }, { upsert: true });
          await logMensagemReal(numero, "assistant", texto, "sistema", usuario);
        },
      });
      await prospeccao.preparar();
      console.log("Conectado ao MongoDB");
      return;
    } catch {
      console.log(`Mongo ainda não disponível, tentando... (${i + 1}/10)`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Não foi possível conectar ao MongoDB");
}

// ===== IMPLEMENTAÇÃO DAS TOOLS =====
const semAcento = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const palavras = (s: string) =>
  semAcento(s).split(/[^a-z0-9]+/).filter(Boolean);

// Casa por palavra inteira, não por trecho: o casamento por substring dava
// falso positivo em sílaba solta ("ia" acendia dentro de "financeira"), e
// falhava justamente nos termos que o cliente usa ("loja virtual", "site").
//
// A pontuação soma TODOS os sinônimos que casaram, cada um valendo o número de
// palavras. Somar em vez de pegar só o maior resolve o pedido que acende dois
// serviços ("meus sistemas não conversam, queria integrar"): sem isso os dois
// empatavam em 1 e quem vencia era o que estivesse antes no catálogo.
function acharServico(busca: string): string | undefined {
  const termos = palavras(busca);
  if (termos.length === 0) return undefined;

  let melhor: string | undefined;
  let peso = 0;

  for (const [id, servico] of Object.entries(CATALOGO)) {
    let pontos = 0;

    for (const sinonimo of [id, ...servico.sinonimos]) {
      const partes = palavras(sinonimo);
      // O sinônimo casa quando todas as suas palavras estão no que foi pedido.
      if (partes.length > 0 && partes.every((p) => termos.includes(p))) {
        pontos += partes.length;
      }
    }

    if (pontos > peso) {
      melhor = id;
      peso = pontos;
    }
  }

  return melhor;
}

async function consultarServico(args: any) {
  const busca = semAcento(String(args?.servico || "todos"));
  const chave = busca === "todos" ? undefined : acharServico(busca);

  // Preço e prazo só saem daqui, nunca da cabeça do modelo. Enquanto as
  // constantes do topo estiverem vazias, o campo não vai junto e o prompt
  // manda explicar que depende do caso — em vez de arriscar um chute.
  const comercial = {
    ...(temPreco
      ? {
          investimento: [PRECO.implantacao, PRECO.mensalidade]
            .filter(Boolean)
            .join(" + "),
        }
      : {
          semPreco:
            "Valor e prazo dependem dos fluxos, do volume de informações e das integrações necessárias. A SmartDev AI apresenta proposta, escopo e condições antes do início, após entender o cenário. Ofereça uma conversa sem compromisso com Leandro. Não estime valores nem prazos.",
        }),
    ...(PRAZO ? { prazo: PRAZO } : {}),
  };

  if (!chave) {
    return {
      servicos: Object.entries(CATALOGO).map(([id, s]) => ({ id, ...s })),
      ...comercial,
      observacao:
        "São capacidades de um agente de IA sob medida da SmartDev AI. Priorize atendimento, qualificação e encaminhamento humano conforme a necessidade; agendamento depende do escopo. " +
        "O agente será configurado e testado com as informações e o tom de voz da empresa antes da entrada em operação.",
    };
  }

  return {
    servico: CATALOGO[chave],
    ...comercial,
    observacao:
      "Relacione a capacidade à necessidade relatada, respeite os limites do escopo e ofereça uma conversa sem compromisso com Leandro, da SmartDev AI.",
  };
}

async function contatoPessoal(numero: string, args: any) {
  if (!CONTATO_PESSOAL) {
    console.warn("[CONTATO] CONTATO_PESSOAL não configurado no .env");
    return {
      erro: "Contato pessoal indisponível.",
      instrucao:
        "Diga que não consegue passar o contato agora e que vai avisar o Leandro do recado.",
    };
  }

  const { exibicao, link } = formatarContato(CONTATO_PESSOAL);

  // Fica registrado para o Leandro saber quem procurou por assunto pessoal.
  await db.collection("contatos").updateOne(
    { _id: numero },
    {
      $set: { tipo: "pessoal", motivo: args?.motivo, atualizadoEm: new Date() },
    },
    { upsert: true }
  );

  console.log(`[PESSOAL] ${numero}: ${args?.motivo || "sem motivo informado"}`);
  return {
    numero: exibicao,
    link,
    instrucao:
      "Passe o número e o link para a pessoa, com uma mensagem curta e cordial. " +
      "Não peça mais nenhuma informação e não fale dos serviços da consultoria.",
  };
}

async function registrarLead(numero: string, args: any) {
  const agora = new Date();

  const dados: Record<string, any> = {
    numero,
    nome: args?.nome,
    necessidade: args?.necessidade,
    atualizadoEm: agora,
  };
  if (args?.empresa) dados.empresa = args.empresa;
  if (args?.ramo) dados.ramo = args.ramo;
  if (args?.urgencia) dados.urgencia = args.urgencia;
  if (args?.atendimentoHoje) dados.atendimentoHoje = args.atendimentoHoje;

  await db.collection("leads").updateOne(
    { _id: numero },
    { $set: dados, $setOnInsert: { criadoEm: agora, origem: "whatsapp" } },
    { upsert: true }
  );

  console.log(`[LEAD] ${numero}: ${args?.nome} — ${args?.necessidade}`);
  return { ok: true, mensagem: "Lead registrado. Siga a conversa normalmente." };
}

// Aviso operacional para o Leandro. Fica fora do LLM de propósito: o modelo não
// decide se você é avisado — quem gravou avisa, sempre.
async function avisarAdmin(texto: string): Promise<boolean> {
  if (!ADMIN_NUMBER) {
    console.warn("[ADMIN] ADMIN_NUMBER não configurado no .env — aviso não enviado");
    return false;
  }
  return enviarMensagem(ADMIN_NUMBER, texto);
}

// Campos que agendarVisita e deixarRecado gravam no lead. O nome só entra se
// vier preenchido: o driver transforma undefined em null, e um $set cego
// apagaria o nome que o registrarLead já tinha descoberto.
function patchDoLead(numero: string, nome: any, extra: Record<string, any>) {
  const dados: Record<string, any> = { numero, atualizadoEm: new Date(), ...extra };
  if (nome) dados.nome = nome;
  return dados;
}

// O que já se sabe do lead entra no aviso: sem isso chega um nome e um horário
// soltos, sem o assunto que motivou a conversa.
function resumoDoLead(lead: any): string {
  return (
    (lead?.necessidade ? `\n💡 ${lead.necessidade}` : "") +
    (lead?.empresa ? `\n🏢 ${lead.empresa}${lead.ramo ? ` (${lead.ramo})` : ""}` : "")
  );
}

async function agendarVisita(numero: string, args: any) {
  const agora = new Date();

  const agendamento: Record<string, any> = {
    numero,
    nome: args?.nome,
    data: args?.data,
    horario: args?.horario,
    modalidade: args?.modalidade || "online",
    criadoEm: agora,
  };
  if (args?.dataISO) agendamento.dataISO = args.dataISO;

  const { insertedId } = await db
    .collection("agendamentos")
    .insertOne(agendamento);

  // upsert: quem já conhece o Leandro marca direto, sem passar por registrarLead.
  // Sem isto o agendamento existia mas o lead não, e nada aparecia no /leads.
  await db.collection("leads").updateOne(
    { _id: numero },
    {
      $set: patchDoLead(numero, args?.nome, { agendamento }),
      $setOnInsert: { criadoEm: agora, origem: "whatsapp" },
    },
    { upsert: true }
  );

  const lead = await db.collection("leads").findOne({ _id: numero });
  const { exibicao, link } = formatarContato(numero);
  const quando = agendamento.dataISO
    ? `${formatarDataISO(agendamento.dataISO)} às ${args?.horario}`
    : `${args?.data} às ${args?.horario}`;

  const avisado = await avisarAdmin(
    "📅 *Novo agendamento*\n\n" +
      `*${args?.nome || "sem nome"}* — ${quando} (${agendamento.modalidade})\n` +
      `📱 ${exibicao}\n${link}` +
      resumoDoLead(lead)
  );

  // Marca só quando o envio deu certo, para o /agenda conseguir apontar
  // os agendamentos que você nunca chegou a receber.
  if (avisado) {
    await db
      .collection("agendamentos")
      .updateOne({ _id: insertedId }, { $set: { notificadoEm: new Date() } });
  } else {
    console.warn(`[AGENDA] ${numero}: não foi possível avisar o admin`);
  }

  console.log(
    `[AGENDA] ${numero}: ${args?.nome} — ${args?.data} ${args?.horario}`
  );
  return {
    ok: true,
    mensagem: `Conversa anotada para ${args?.data} às ${args?.horario}. Confirme com a pessoa.`,
  };
}

async function deixarRecado(numero: string, args: any) {
  const agora = new Date();

  const recado: Record<string, any> = {
    numero,
    nome: args?.nome,
    assunto: args?.assunto,
    criadoEm: agora,
  };
  if (args?.melhorHorario) recado.melhorHorario = args.melhorHorario;
  if (args?.telefone) recado.telefone = args.telefone;

  const { insertedId } = await db.collection("recados").insertOne(recado);

  await db.collection("leads").updateOne(
    { _id: numero },
    {
      $set: patchDoLead(numero, args?.nome, { recado }),
      $setOnInsert: { criadoEm: agora, origem: "whatsapp" },
    },
    { upsert: true }
  );

  const lead = await db.collection("leads").findOne({ _id: numero });
  const { exibicao, link } = formatarContato(numero);
  const alternativo = args?.telefone
    ? `\n☎️ prefere no ${formatarContato(args.telefone).exibicao}`
    : "";

  const avisado = await avisarAdmin(
    "🔔 *Pediram seu contato*\n\n" +
      `*${args?.nome || "sem nome"}* quer falar com você\n` +
      `📝 ${args?.assunto}\n` +
      (args?.melhorHorario ? `🕐 melhor horário: ${args.melhorHorario}\n` : "") +
      `📱 ${exibicao}\n${link}${alternativo}` +
      resumoDoLead(lead)
  );

  if (avisado) {
    await db
      .collection("recados")
      .updateOne({ _id: insertedId }, { $set: { notificadoEm: new Date() } });
  } else {
    console.warn(`[RECADO] ${numero}: não foi possível avisar o admin`);
  }

  console.log(`[RECADO] ${numero}: ${args?.nome} — ${args?.assunto}`);
  return {
    ok: true,
    mensagem:
      "Recado anotado. Confirme que o Leandro vai retornar o contato, sem detalhar como.",
  };
}

async function executarTool(numero: string, nome: string, args: any) {
  return etapa(`tool-${nome}`, () => executarToolReal(numero, nome, args), true);
}

async function executarToolReal(numero: string, nome: string, args: any) {
  try {
    switch (nome) {
      case "consultarServico":
        return await consultarServico(args);
      case "contatoPessoal":
        return await contatoPessoal(numero, args);
      case "registrarLead":
        return await registrarLead(numero, args);
      case "agendarVisita":
        return await agendarVisita(numero, args);
      case "deixarRecado":
        return await deixarRecado(numero, args);
      default:
        return { erro: `Função desconhecida: ${nome}` };
    }
  } catch (err: any) {
    if (err instanceof RevisaoNecessaria) throw err;
    console.error(`Erro na tool ${nome}:`, err.message);
    return { erro: "Não foi possível executar agora." };
  }
}

// ===== DETALHE DE ERRO =====
// O console corta objetos aninhados em [Object], e é justamente aí que a
// Evolution e a Groq colocam o motivo real da falha. Serializa antes de logar.
function detalheErro(err: any): string {
  const dados = err.response?.data;
  if (!dados) return err.message;
  return typeof dados === "string" ? dados : JSON.stringify(dados);
}

// ===== ENVIAR MENSAGEM =====
// Devolve se a mensagem saiu de fato. Quem grava estado a partir de um envio
// (o aviso de mudança de número) precisa saber disso para não marcar em falso.
async function enviarMensagem(
  numero: string,
  texto: string
): Promise<boolean> {
  const ok = await etapa("envio", () => enviarMensagemReal(numero, texto), true);
  if (!ok && emFilaPersistente()) throw new RevisaoNecessaria("Envio não confirmado pela Evolution; confira o WhatsApp antes de repetir.");
  return ok;
}

async function enviarMensagemReal(numero: string, texto: string): Promise<boolean> {
  let liberar!: () => void;
  const pendente = new Promise<void>(r => { liberar = r; });
  const pendentes = enviosPendentes.get(numero) || new Set<Promise<void>>();
  pendentes.add(pendente);
  enviosPendentes.set(numero, pendentes);
  try {
    const envio = await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: numero, text: texto },
      { headers: { apikey: API_KEY }, timeout: 30000 }
    );
    const id = envio.data?.key?.id || envio.data?.messages?.[0]?.id;
    if (!id) throw new Error('Provedor não retornou confirmação de envio');
    if (id) await db.collection("envios_agente").updateOne(
      { _id: `${numero}:${id}` }, { $set: { em: new Date() } }, { upsert: true }
    );
    console.log(`[ENVIADO] ${numero}: ${texto.slice(0, 40)}...`);
    return true;
  } catch (err: any) {
    console.error(`Erro ao enviar para ${numero}:`, detalheErro(err));
    return false;
  } finally {
    liberar();
    pendentes.delete(pendente);
    if (!pendentes.size) enviosPendentes.delete(numero);
  }
}

// ===== LOG DE MENSAGENS (para o painel) =====
// A coleção "conversas" é a memória do modelo: fica limitada a HISTORICO_MAX
// de propósito, senão o prompt cresce sem fim. Mas o painel precisa da conversa
// inteira, então cada mensagem também é gravada aqui, sem corte e com hora.
// São coisas diferentes: uma é contexto do LLM, a outra é o histórico humano.
async function logMensagem(
  numero: string,
  role: "user" | "assistant",
  content: string,
  via: "agente" | "painel" | "sistema" | "whatsapp" = "agente"
  , autor: any = null
) {
  return etapa("historico", () => logMensagemReal(numero, role, content, via, autor), true);
}

async function logMensagemReal(numero: string, role: string, content: string, via: string, autor: any = null) {
  try {
    const agora = new Date();
    await db
      .collection("mensagens")
      .insertOne({ numero, role, content, via, autor, em: agora });
    // Carimba a conversa para o painel conseguir ordenar por atividade sem
    // ter que abrir o log de cada contato.
    await db
      .collection("conversas")
      .updateOne({ _id: numero }, { $set: { atualizadoEm: agora } }, { upsert: true });
  } catch (err: any) {
    // Log quebrado não pode derrubar atendimento: o WhatsApp continua.
    console.error(`Erro ao registrar mensagem de ${numero}:`, detalheErro(err));
    throw err;
  }
}

// ===== CÉREBRO: LLM + memória + tools =====
// Cada iteração é uma inferência completa: 3 já cobre tool + resposta com folga.
const MAX_ITERACOES_TOOL = 3;
// Quantas mensagens do histórico entram no prompt. Na nuvem cabe mais contexto;
// no Ollama local o prefill é caro, então a janela é menor.
const HISTORICO_MAX = Number(
  process.env.HISTORICO_MAX || (LLM_PROVIDER === "ollama" ? 10 : 20)
);

// O modelo não sabe que dia é hoje. Sem isto ele não converte "quinta" nem
// "amanhã" em data real, e o dataISO do agendamento nunca vem preenchido.
function agoraParaPrompt(): string {
  const agora = new Date();
  const dia = agora.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
  const hora = agora.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
  return `Agora é ${dia}, ${hora} (horário de Brasília). Hoje é ${hojeISO()} no formato AAAA-MM-DD.`;
}

// O que já sabemos do lead entra no prompt para o modelo não repetir perguntas.
function contextoDoLead(lead: any): string {
  if (!lead) return "Este contato ainda não foi registrado como lead.";

  const partes = [
    lead.nome && `nome: ${lead.nome}`,
    lead.necessidade && `necessidade: ${lead.necessidade}`,
    lead.empresa && `empresa: ${lead.empresa}`,
    lead.ramo && `ramo: ${lead.ramo}`,
    lead.urgencia && `urgência: ${lead.urgencia}`,
  ].filter(Boolean);

  return (
    "Dados já coletados deste lead — não pergunte de novo o que já está aqui: " +
    partes.join(", ") +
    "."
  );
}

// O Groq fala o formato da OpenAI, então as TOOLS servem para os dois provedores.
// As diferenças ficam isoladas aqui e em mensagemDeTool().
async function chamarLLM(messages: any[], numero?: string, verificar = async () => {}) {
  return etapa("llm", () => chamarLLMReal(messages, numero, verificar));
}

async function chamarLLMReal(messages: any[], numero?: string, verificar = async () => {}, ferramentas: any[] = TOOLS) {
  try {
  return await (LLM_PROVIDER === "ollama"
    ? chamarOllama(messages, ferramentas)
    : filaGroq(() => chamarGroq(messages, ferramentas), async (estado: any) => {
        if (numero) estadosIA.set(numero, estado);
      }, verificar));
  } catch (err: any) {
    if (!(err instanceof AtendimentoAssumido)) {
      try {
        await db.collection("eventos_operacionais").insertOne({ tipo: "falha_ia", em: new Date(), provedor: LLM_PROVIDER, status: err.response?.status || null });
      } catch (registro: any) { console.error("[ALERTAS] Falha ao registrar evento:", registro.message); }
    }
    throw err;
  }
}

async function chamarGroq(messages: any[], ferramentas: any[] = TOOLS) {
  const inicio = Date.now();

  const resp = await axios.post(
    GROQ_URL,
    {
      model: GROQ_MODEL,
      messages,
      ...(ferramentas.length ? { tools: ferramentas, tool_choice: "auto" } : {}),
      max_tokens: ferramentas.length ? 400 : 800,
      // Baixa de propósito: o modelo estava preferindo conversar a chamar tools.
      temperature: 0.3,
    },
    {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      timeout: 60000,
    }
  );

  const d = resp.data;
  const u = d?.usage;
  console.log(
    `[LLM] groq/${GROQ_MODEL} ${((Date.now() - inicio) / 1000).toFixed(1)}s ` +
      `(prompt ${u?.prompt_tokens || 0} tk, gerou ${u?.completion_tokens || 0} tk)`
  );

  return d?.choices?.[0]?.message;
}

// O Groq exige tool_call_id na resposta da ferramenta; o Ollama usa tool_name.
function mensagemDeTool(chamada: any, nome: string, resultado: any) {
  const content = JSON.stringify(resultado);

  if (LLM_PROVIDER === "ollama") {
    return { role: "tool", name: nome, tool_name: nome, content };
  }
  return { role: "tool", tool_call_id: chamada?.id, name: nome, content };
}

async function chamarOllama(messages: any[], ferramentas: any[] = TOOLS) {
  const inicio = Date.now();

  const resp = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: OLLAMA_MODEL,
      stream: false,
      messages,
      ...(ferramentas.length ? { tools: ferramentas } : {}),
      // Mantém o modelo residente: recarregar do disco custa ~25s.
      keep_alive: "30m",
      options: {
        // Respostas de WhatsApp são curtas; sem teto o modelo escreve demais.
        num_predict: 220,
        num_ctx: 4096,
      },
    },
    { timeout: 180000 }
  );

  const d = resp.data;
  const seg = (ns: number) => (ns / 1e9).toFixed(1);
  console.log(
    `[LLM] ollama/${OLLAMA_MODEL} ${seg(d?.total_duration || 0)}s ` +
      `(prompt ${d?.prompt_eval_count || 0} tk em ${seg(d?.prompt_eval_duration || 0)}s, ` +
      `gerou ${d?.eval_count || 0} tk em ${seg(d?.eval_duration || 0)}s)`
  );

  return d?.message;
}

async function gerarResposta(numero: string, texto: string): Promise<string> {
  return etapa("resposta", () => gerarRespostaReal(numero, texto));
}

async function gerarRespostaReal(numero: string, texto: string): Promise<string> {
  const versao = versoesHumanas.get(numero) || 0;
  const verificar = async () => {
    const atual = await db.collection("conversas").findOne({ _id: numero });
    if (atual?.pausado || (versoesHumanas.get(numero) || 0) !== versao) throw new AtendimentoAssumido();
  };
  const [conv, lead] = await Promise.all([
    db.collection("conversas").findOne({ _id: numero }),
    db.collection("leads").findOne({ _id: numero }),
  ]);
  const historico = conv?.mensagens || [];

  // O contexto do lead muda a cada descoberta, então vai DEPOIS do histórico:
  // assim o prefixo (persona + tools + histórico) fica estável e o Ollama
  // reaproveita o cache em vez de reprocessar o prompt inteiro.
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historico.slice(-HISTORICO_MAX),
    { role: "system", content: `${agoraParaPrompt()}\n${contextoDoLead(lead)}` },
  ];

  let resposta = "";
  try {
    for (let i = 0; i < MAX_ITERACOES_TOOL; i++) {
      await verificar();
      const msg = await chamarLLM(messages, numero, verificar);
      await verificar();
      const toolCalls = msg?.tool_calls || [];

      if (toolCalls.length === 0) {
        resposta = (msg?.content || "").trim();
        break;
      }

      messages.push(msg);

      for (const chamada of toolCalls) {
        await verificar();
        const nome = chamada?.function?.name;
        // O Ollama devolve arguments como objeto; o Groq manda string JSON.
        const brutos = chamada?.function?.arguments;
        let args: any = brutos;
        if (typeof brutos === "string") {
          try {
            args = JSON.parse(brutos);
          } catch {
            args = {};
          }
        }

        console.log(`[TOOL] ${numero} -> ${nome}(${JSON.stringify(args)})`);
        const resultado = await executarTool(numero, nome, args || {});

        messages.push(mensagemDeTool(chamada, nome, resultado));
      }
    }
  } catch (err: any) {
    if (err instanceof AtendimentoAssumido) return "";
    if (err instanceof RevisaoNecessaria) throw err;
    console.error(`Erro no LLM (${LLM_PROVIDER}):`, detalheErro(err));
    return RESPOSTA_FALHA;
  } finally {
    estadosIA.delete(numero);
  }

  // Modelos pequenos às vezes encerram sem texto depois de usar uma tool.
  if (!resposta) {
    resposta = "Anotei aqui 👍 Me conta um pouco mais sobre o que você precisa?";
  }

  return resposta;
}

// ===== AVISO ÚNICO POR CONTATO =====
// Roda fora do LLM: todo contato novo é esclarecido sobre a mudança de número,
// independente do que o modelo decidir fazer depois.
async function avisarSeNecessario(numero: string): Promise<boolean> {
  if (ADMIN_NUMBER && numero === ADMIN_NUMBER) return false;

  const contato = await db.collection("contatos").findOne({ _id: numero });
  if (contato?.avisadoEm) return false;

  // Se o envio falhou, não marca nada: o contato continua "não avisado" e
  // recebe o aviso na próxima mensagem, em vez de perdê-lo para sempre.
  if (!(await enviarMensagem(numero, AVISO_NUMERO))) {
    console.warn(`[AVISO] ${numero}: envio falhou, será tentado de novo`);
    return false;
  }

  await db
    .collection("contatos")
    .updateOne({ _id: numero }, { $set: { avisadoEm: new Date() } }, { upsert: true });

  // Entra no histórico para o modelo saber que o aviso já foi dado e não repetir.
  await db.collection("conversas").updateOne(
    { _id: numero },
    {
      $push: {
        mensagens: {
          $each: [{ role: "assistant", content: AVISO_NUMERO }],
          $slice: -HISTORICO_MAX,
        },
      },
    },
    { upsert: true }
  );

  await logMensagem(numero, "assistant", AVISO_NUMERO, "sistema");

  console.log(`[AVISO] ${numero}: avisado sobre a mudança de número`);
  return true;
}

// ===== COMANDO ADMIN: /leads =====
function formatarLeads(leads: any[]): string {
  if (leads.length === 0) return "📭 Nenhum lead capturado ainda.";

  const linhas = leads.map((l, i) => {
    const quando = l.criadoEm
      ? new Date(l.criadoEm).toLocaleDateString("pt-BR", { timeZone: TZ })
      : "—";
    const detalhes = [
      l.empresa && `🏢 ${l.empresa}${l.ramo ? ` (${l.ramo})` : ""}`,
      l.necessidade && `💡 ${l.necessidade}`,
      l.urgencia && l.urgencia !== "nao_informada" && `⏱ urgência ${l.urgencia}`,
      l.atendimentoHoje &&
        l.atendimentoHoje !== "nao_informado" &&
        `💬 quem responde hoje: ${
          {
            o_dono: "o próprio dono",
            um_funcionario: "um funcionário",
            equipe: "uma equipe",
            ninguem: "ninguém responde direito",
          }[l.atendimentoHoje as string] || l.atendimentoHoje
        }`,
      l.agendamento &&
        `📅 ${
          l.agendamento.dataISO
            ? formatarDataISO(l.agendamento.dataISO)
            : l.agendamento.data
        } às ${l.agendamento.horario} (${l.agendamento.modalidade})`,
      l.recado && `🔔 pediu retorno: ${l.recado.assunto}`,
    ].filter(Boolean);

    return (
      `*${i + 1}. ${l.nome || "sem nome"}* — ${quando}\n` +
      `📱 ${l.numero}\n` +
      detalhes.join("\n")
    );
  });

  return `📋 *Últimos leads (${leads.length})*\n\n` + linhas.join("\n\n");
}

// ===== COMANDO ADMIN: /agenda =====
function formatarAgenda(ags: any[]): string {
  if (ags.length === 0) return "📭 Nenhum agendamento em aberto.";

  const linhas = ags.map((a) => {
    const { exibicao, link } = formatarContato(a.numero || "");
    const quando = a.dataISO ? formatarDataISO(a.dataISO) : a.data || "sem data";
    // Sem dataISO o agendamento não entra na ordenação por data: fica claro
    // aqui em vez de aparecer fora de ordem sem explicação.
    const solto = a.dataISO ? "" : " ⚠️ data não confirmada";
    const mudo = a.notificadoEm ? "" : "\n⚠️ não consegui te avisar deste na hora";

    return (
      `*${a.nome || "sem nome"}* — ${quando} às ${a.horario} (${a.modalidade})${solto}\n` +
      `📱 ${exibicao}\n${link}${mudo}`
    );
  });

  return `📅 *Agenda (${ags.length})*\n\n` + linhas.join("\n\n");
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    await filaPersistente.receber(req.body);
    res.sendStatus(200);
  } catch (err: any) {
    console.error("[WEBHOOK] Falha ao persistir:", detalheErro(err));
    res.sendStatus(503);
  }
});

async function processarWebhook(body: any, recebidoEm = new Date()) {
  const { event, data } = body;
  if (event !== "messages.upsert") return;

  const numero = (data?.key?.remoteJidAlt || data?.key?.remoteJid)?.replace("@s.whatsapp.net", "");
  let texto =
    data?.message?.conversation ||
    data?.message?.extendedTextMessage?.text ||
    "";

  if (data?.key?.fromMe) {
    const id = data.key.id;
    if (!id) return;
    // Ecos podem chegar antes da resposta HTTP do sendText.
    await Promise.all([...(enviosPendentes.get(numero) || [])]);
    if (await db.collection("envios_agente").findOne({ _id: `${numero}:${id}` })) return;
    const timestamp = Number(data.messageTimestamp);
    if (!Number.isFinite(timestamp) || timestamp * 1000 < recebidoEm.getTime() - 60000) return;
    await etapa("intervencao-humana", async () => {
    const registro = await db.collection("eventos_humanos").updateOne(
      { _id: `${numero}:${id}` }, { $setOnInsert: { em: new Date() } }, { upsert: true }
    );
    if (!registro.upsertedCount) return;
    versoesHumanas.set(numero, (versoesHumanas.get(numero) || 0) + 1);
    estadosIA.delete(numero);
    // Uma resposta da IA em curso será descartada ao assumir pelo WhatsApp.
    await db.collection("conversas").updateOne({ _id: numero }, {
      $set: { pausado: true, pausaOrigem: "whatsapp", responsavel: null },
      $inc: { versaoHumana: 1 },
    }, { upsert: true });
    if (!texto && data.message?.audioMessage) texto = "[Áudio enviado pelo atendimento humano; sem transcrição]";
    texto ||= data.message?.imageMessage?.caption || data.message?.videoMessage?.caption || "[Mensagem de mídia enviada pelo atendimento humano no WhatsApp]";
    await db.collection("conversas").updateOne({ _id: numero }, {
      $push: { mensagens: { $each: [{ role: "assistant", content: texto }], $slice: -HISTORICO_MAX } },
    });
    await logMensagem(numero, "assistant", texto, "whatsapp");
    console.log(`[HUMANO] Conversa pausada por resposta no WhatsApp`);
    }, true);
    return;
  }

  // Prospecção usa seu fluxo comercial separado, sem as ferramentas gerais.
  // Interceptar antes de áudio/comandos impede loops e ações indevidas por bots.
  const textoProspeccao = texto || "[Mensagem de mídia recebida; revisar manualmente]";
  if (numero && await etapa("prospeccao-resposta", () => prospeccao.receber(numero, textoProspeccao), true)) {
    await etapa("prospeccao-entrada", async () => {
      await db.collection("conversas").updateOne({ _id: numero }, { $push: { mensagens: { $each: [{ role: "user", content: textoProspeccao }], $slice: -HISTORICO_MAX } } }, { upsert: true });
      await logMensagem(numero, "user", textoProspeccao);
    }, true);
    const timestampProspeccao = Number(data?.messageTimestamp);
    const entradaProspeccao = Number.isFinite(timestampProspeccao) && timestampProspeccao > 0
      ? new Date(Math.min(recebidoEm.getTime(), timestampProspeccao * 1000)) : recebidoEm;
    try { await prospeccao.responder?.(numero, entradaProspeccao); }
    finally { estadosIA.delete(numero); }
    return;
  }

  const recebeuAudio = !texto && Boolean(data?.message?.audioMessage);
  if (recebeuAudio) texto = "[Áudio recebido; atendimento por texto, sem transcrição]";

  if (!numero || !texto) return;

  const comando = texto.trim().toLowerCase();

  if (comando === "/reset") {
    await etapa("reset", async () => {
    await db.collection("conversas").deleteOne({ _id: numero });
    // Limpa o aviso também, para o contato ser tratado como novo de novo.
    await db.collection("contatos").deleteOne({ _id: numero });
    }, true);
    await enviarMensagem(numero, "🧹 Conversa reiniciada!");
    return;
  }

  // Só o admin enxerga /leads e /agenda. Para os demais, é mensagem comum.
  const ehAdmin = Boolean(ADMIN_NUMBER) && numero === ADMIN_NUMBER;

  if (comando === "/leads" && ehAdmin) {
    const leads = await db
      .collection("leads")
      .find({})
      .sort({ criadoEm: -1 })
      .limit(10)
      .toArray();
    await enviarMensagem(numero, formatarLeads(leads));
    return;
  }

  if (comando === "/agenda" && ehAdmin) {
    // O que já passou sai da agenda; o que não tem data fica, senão um
    // agendamento que o modelo não soube datar sumiria sem ninguém notar.
    const hoje = hojeISO();
    const ags = await db
      .collection("agendamentos")
      .find({ $or: [{ dataISO: { $gte: hoje } }, { dataISO: { $exists: false } }] })
      .sort({ criadoEm: -1 })
      .limit(20)
      .toArray();

    const comData = ags
      .filter((a: any) => a.dataISO)
      .sort((a: any, b: any) => a.dataISO.localeCompare(b.dataISO));
    const semData = ags.filter((a: any) => !a.dataISO);

    await enviarMensagem(numero, formatarAgenda([...comData, ...semData].slice(0, 10)));
    return;
  }

  console.log(`[RECEBI] ${numero}: ${texto}`);
  await etapa("entrada-registrada", async () => {
    await db.collection("conversas").updateOne({ _id: numero }, {
      $push: { mensagens: { $each: [{ role: "user", content: texto }], $slice: -HISTORICO_MAX } },
    }, { upsert: true });
    await logMensagem(numero, "user", texto);
  }, true);

  // Conversa assumida pelo painel: a mensagem é gravada e aparece na tela, mas
  // o modelo não responde. Sem isto você e o agente responderiam junto, e o
  // cliente receberia duas versões da mesma coisa.
  const conv = await db.collection("conversas").findOne({ _id: numero });
  if (conv?.pausado) {
    console.log(`[PAUSADO] ${numero}: agente não respondeu (atendimento manual)`);
    return;
  }

  if (recebeuAudio) {
    const respostaAudio = "Meu atendimento automático funciona por texto. Pode escrever sua mensagem, por favor?";
    if (await enviarMensagem(numero, respostaAudio)) {
      await etapa("audio-sem-transcricao", async () => {
        await db.collection("conversas").updateOne({ _id: numero }, { $push: { mensagens: { $each: [{ role: "assistant", content: respostaAudio }], $slice: -HISTORICO_MAX } } }, { upsert: true });
        await logMensagem(numero, "assistant", respostaAudio);
      }, true);
    }
    return;
  }

  await etapa("apresentacao", () => avisarSeNecessario(numero), true);

  const versaoPersistida = await etapa("versao-atendimento", async () => conv?.versaoHumana || 0);
  if (versaoPersistida !== (conv?.versaoHumana || 0)) return;
  const versao = versoesHumanas.get(numero) || 0;
  const resposta = await gerarResposta(numero, texto);
  const atual = await db.collection("conversas").findOne({ _id: numero });
  if (resposta && !atual?.pausado && versaoPersistida === (atual?.versaoHumana || 0) && versao === (versoesHumanas.get(numero) || 0)) {
    if (await enviarMensagem(numero, resposta)) {
      await etapa("saida-registrada", async () => {
      await db.collection("conversas").updateOne({ _id: numero }, {
        $push: { mensagens: { $each: [{ role: "assistant", content: resposta }], $slice: -HISTORICO_MAX } },
      }, { upsert: true });
      await logMensagem(numero, "assistant", resposta);
      }, true);
    }
  }
}

// ===== PAINEL =====
// Tela para acompanhar as conversas sem depender do celular. A página é
// estática; tudo que ela mostra vem das rotas /api abaixo.

// Erro dentro de rota async vira promessa rejeitada e o Express 4 não pega
// sozinho — sem este wrapper o painel travaria em "carregando" para sempre.
const rota =
  (handler: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any) => {
    handler(req, res).catch((err: any) => {
      console.error(`[PAINEL] erro em ${req.method} ${req.path}:`, detalheErro(err));
      if (!res.headersSent) res.status(500).json({ erro: detalheErro(err) });
    });
  };

const api = express.Router();
api.use((req, res, next) => autenticacao.csrf(req, res, next));
api.use("/auth", (req, res, next) => autenticacao.router(req, res, next));
api.use((req, res, next) => autenticacao.autenticar(req, res, next));
api.use((req, res, next) => autenticacao.acessoCompleto(req, res, next));
api.use((req, res, next) => autenticacao.auditar(req, res, next));
const apiProspeccao = express.Router();
// Inicialização ocorre antes de aceitar conexões HTTP.
api.use("/prospeccao", (req, res, next) => apiProspeccao(req, res, next));

// Só dígitos: o _id das conversas é o número puro, e isso já barra qualquer
// coisa estranha vinda da URL antes de virar consulta.
function numeroDaRota(req: any): string {
  return String(req.params.numero || "").replace(/\D/g, "");
}

// --- Status: a agente está de pé e ligada no WhatsApp? ---
api.get(
  "/status",
  rota(async (_req, res) => {
    let whatsapp: any = { conectado: false, estado: "desconhecido" };
    try {
      const resp = await axios.get(
        `${EVOLUTION_URL}/instance/connectionState/${INSTANCE}`,
        { headers: { apikey: API_KEY }, timeout: 8000 }
      );
      const estado = resp.data?.instance?.state || resp.data?.state || "desconhecido";
      whatsapp = { conectado: estado === "open", estado };
    } catch (err: any) {
      whatsapp = { conectado: false, estado: "erro", detalhe: detalheErro(err) };
    }

    const [conversas, leads, agendamentos, recados, ultima] = await Promise.all([
      db.collection("conversas").countDocuments(),
      db.collection("leads").countDocuments(),
      db.collection("agendamentos").countDocuments(),
      db.collection("recados").countDocuments(),
      db.collection("mensagens").find({}).sort({ em: -1 }).limit(1).toArray(),
    ]);
    const [aguardando, falhasIA, revisao] = await Promise.all([
      consultarEspera(db),
      db.collection("eventos_operacionais").countDocuments({ tipo: "falha_ia", em: { $gte: new Date(Date.now() - JANELA_FALHAS_MS) } }),
      db.collection("fila_mensagens").countDocuments({ estado: "revisao" }),
    ]);

    const inicio24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const inicio30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [mensagensRecebidas24h, mensagensAgente24h, atendimentosHumanos, leads30d, campanhasEnviadas, campanhasRespondidas, contatosAtivos] = await Promise.all([
      db.collection("mensagens").countDocuments({ role: "user", em: { $gte: inicio24h } }),
      db.collection("mensagens").countDocuments({ role: "assistant", via: "agente", em: { $gte: inicio24h } }),
      db.collection("conversas").countDocuments({ pausado: true }),
      db.collection("leads").countDocuments({ criadoEm: { $gte: inicio30d } }),
      db.collection("prospeccao_contatos").countDocuments({ enviadoEm: { $exists: true } }),
      db.collection("prospeccao_contatos").countDocuments({ ultimaResposta: { $exists: true, $ne: "" } }),
      db.collection("mensagens").distinct("numero", { em: { $gte: inicio24h } }),
    ]);
    res.json({
      alertas: montarAlertas({ whatsapp, falhasIA, aguardando, revisao }),
      aguardando,
      falhasIA,
      instancia: INSTANCE,
      fila: {
        pendentes: await db.collection("fila_mensagens").countDocuments({ estado: "pendente" }),
        processando: await db.collection("fila_mensagens").countDocuments({ estado: "processando" }),
        revisao: await db.collection("fila_mensagens").countDocuments({ estado: "revisao" }),
      },
      whatsapp,
      llm: {
        provedor: LLM_PROVIDER,
        modelo: LLM_PROVIDER === "ollama" ? OLLAMA_MODEL : GROQ_MODEL,
        // Sem a chave o Groq falha em toda mensagem — é a causa mais provável
        // de "a agente parou de responder", então aparece no status.
        chaveConfigurada: LLM_PROVIDER === "ollama" ? true : Boolean(GROQ_API_KEY),
      },
      avisos: {
        adminConfigurado: Boolean(ADMIN_NUMBER),
        contatoPessoalConfigurado: Boolean(CONTATO_PESSOAL),
      },
      totais: { conversas, leads, agendamentos, recados },
      operacao: {
        aguardandoResposta: aguardando.length,
        contatosAtivos24h: contatosAtivos.length,
        mensagensRecebidas24h,
        mensagensAgente24h,
        atendimentosHumanos,
        leads30d,
        campanhasEnviadas,
        campanhasRespondidas,
      },
      ultimaMensagemEm: ultima[0]?.em || null,
      uptimeSegundos: Math.round(process.uptime()),
      agora: new Date(),
    });
  })
);

// --- Teste do cérebro: uma pergunta curta, resposta real do LLM ---
api.post(
  "/status/teste-llm",
  rota(async (_req, res) => {
    const inicio = Date.now();
    try {
      const msg = await chamarLLM([
        { role: "system", content: "Responda apenas: ok" },
        { role: "user", content: "teste" },
      ]);
      res.json({
        ok: true,
        resposta: (msg?.content || "").trim().slice(0, 200),
        ms: Date.now() - inicio,
      });
    } catch (err: any) {
      res.json({ ok: false, erro: detalheErro(err), ms: Date.now() - inicio });
    }
  })
);

// --- Lista de conversas, mais recente primeiro ---
api.get(
  "/conversas",
  rota(async (_req, res) => {
    const convs = await db
      .collection("conversas")
      .find({})
      .sort({ atualizadoEm: -1 })
      .limit(200)
      .toArray();

    const numeros = convs.map((c: any) => c._id);
    const [leads, ultimas] = await Promise.all([
      db.collection("leads").find({ _id: { $in: numeros } }).toArray(),
      // Uma agregação em vez de N consultas: com 200 conversas a diferença
      // entre isso e um findOne por contato é a lista abrir ou travar.
      db
        .collection("mensagens")
        .aggregate([
          { $match: { numero: { $in: numeros } } },
          { $sort: { em: -1 } },
          {
            $group: {
              _id: "$numero",
              content: { $first: "$content" },
              role: { $first: "$role" },
              em: { $first: "$em" },
              total: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ]);

    const porNumero = new Map(leads.map((l: any) => [l._id, l]));
    const porUltima = new Map(ultimas.map((u: any) => [u._id, u]));

    res.json(
      convs.map((c: any) => {
        const lead: any = porNumero.get(c._id);
        const ultima: any = porUltima.get(c._id);
        return {
          numero: c._id,
          exibicao: formatarContato(c._id).exibicao,
          nome: lead?.nome || null,
          empresa: lead?.empresa || null,
          necessidade: lead?.necessidade || null,
          ehLead: Boolean(lead),
          temAgendamento: Boolean(lead?.agendamento),
          temRecado: Boolean(lead?.recado),
          pausado: Boolean(c.pausado),
          estadoIA: estadosIA.get(c._id) || null,
          // Conversa antiga, anterior ao painel, não tem log: cai no histórico
          // do modelo para não aparecer vazia na lista.
          ultima:
            ultima?.content ||
            c.mensagens?.[c.mensagens.length - 1]?.content ||
            "",
          ultimaRole: ultima?.role || c.mensagens?.[c.mensagens.length - 1]?.role || null,
          atualizadoEm: c.atualizadoEm || ultima?.em || null,
          totalMensagens: ultima?.total || c.mensagens?.length || 0,
        };
      })
    );
  })
);

// --- Uma conversa inteira ---
api.get(
  "/conversas/:numero",
  rota(async (req, res) => {
    const numero = numeroDaRota(req);
    const [conv, lead, contato, mensagens] = await Promise.all([
      db.collection("conversas").findOne({ _id: numero }),
      db.collection("leads").findOne({ _id: numero }),
      db.collection("contatos").findOne({ _id: numero }),
      db.collection("mensagens").find({ numero }).sort({ em: 1 }).toArray(),
    ]);

    if (!conv && !lead && mensagens.length === 0 && !(await db.collection("fila_mensagens").findOne({ numero }))) {
      return res.status(404).json({ erro: "Conversa não encontrada." });
    }

    // Antes do painel só existia a janela do modelo. Ela entra sem hora, para
    // o começo da conversa não sumir de quem já usava o agente.
    const historico =
      mensagens.length > 0
        ? mensagens.map((m: any) => ({
            role: m.role,
            content: m.content,
            via: m.via,
            autor: m.autor || null,
            em: m.em,
          }))
        : (conv?.mensagens || []).map((m: any) => ({
            role: m.role,
            content: m.content,
            via: "agente",
            em: null,
          }));

    res.json({
      numero,
      exibicao: formatarContato(numero).exibicao,
      link: formatarContato(numero).link,
      pausado: Boolean(conv?.pausado),
      estadoIA: estadosIA.get(numero) || null,
      pausaOrigem: conv?.pausaOrigem || null,
      responsavel: conv?.responsavel || null,
      auditoria: await db.collection("painel_auditoria").find({ numero }).sort({ em: -1 }).limit(20).toArray(),
      fila: await db.collection("fila_mensagens").find({ numero, estado: { $in: ["pendente", "processando", "revisao"] } })
        .project({ _id: 1, estado: 1, recebidoEm: 1 }).sort({ recebidoEm: 1 }).limit(20).toArray(),
      lead: lead || null,
      contato: contato || null,
      mensagens: historico,
    });
  })
);

// --- Responder pelo painel, como você mesmo ---
api.post("/conversas/:numero/fila/:id/resolver", rota(async (req, res) => {
  const numero = numeroDaRota(req);
  const resultado = await db.collection("fila_mensagens").updateOne(
    { _id: req.params.id, numero, estado: "revisao" },
    { $set: { estado: "revisada", revisadoEm: new Date() } }
  );
  if (!resultado.modifiedCount) return res.status(404).json({ erro: "Tarefa de revisão não encontrada." });
  res.json({ ok: true });
}));

api.post(
  "/conversas/:numero/mensagem",
  rota(async (req, res) => {
    const numero = numeroDaRota(req);
    const texto = String(req.body?.texto || "").trim();

    if (!numero) return res.status(400).json({ erro: "Número inválido." });
    if (!texto) return res.status(400).json({ erro: "Mensagem vazia." });

    if (!(await enviarMensagem(numero, texto))) {
      return res
        .status(502)
        .json({ erro: "A Evolution API não aceitou o envio. Veja o status do WhatsApp." });
    }

    // Entra na memória do modelo como fala do assistente: se você despausar
    // depois, ele continua de onde você parou em vez de repetir o assunto.
    await db.collection("conversas").updateOne(
      { _id: numero },
      {
        $push: {
          mensagens: { $each: [{ role: "assistant", content: texto }], $slice: -HISTORICO_MAX },
        },
      },
      { upsert: true }
    );
    await logMensagem(numero, "assistant", texto, "painel", req.usuario);

    res.json({ ok: true });
  })
);

// --- Assumir / devolver a conversa ---
api.post(
  "/conversas/:numero/pausa",
  rota(async (req, res) => {
    const numero = numeroDaRota(req);
    const pausado = Boolean(req.body?.pausado);
    if (pausado) {
      versoesHumanas.set(numero, (versoesHumanas.get(numero) || 0) + 1);
      estadosIA.delete(numero);
    }

    if (!pausado) {
      const retomada = await prospeccao.retomarConversa(numero, req.usuario);
      if (retomada?.prospecto) {
        if (!retomada.ok) return res.status(409).json({ erro: retomada.erro });
        console.log(`[PAINEL] ${numero}: prospecção reativada`);
        return res.json({ ok: true, pausado: false });
      }
    }

    await db
      .collection("conversas")
      .updateOne({ _id: numero }, {
        $set: { pausado, pausaOrigem: pausado ? "painel" : null, responsavel: pausado ? req.usuario : null },
        ...(pausado ? { $inc: { versaoHumana: 1 } } : {}),
      }, { upsert: true });

    console.log(`[PAINEL] ${numero}: agente ${pausado ? "pausada" : "reativada"}`);
    res.json({ ok: true, pausado });
  })
);

// --- Reiniciar a conversa (mesmo efeito do /reset no WhatsApp) ---
// O log do painel não é apagado de propósito: o modelo esquece, você não.
api.delete(
  "/conversas/:numero",
  rota(async (req, res) => {
    const numero = numeroDaRota(req);
    await db.collection("conversas").deleteOne({ _id: numero });
    await db.collection("contatos").deleteOne({ _id: numero });
    console.log(`[PAINEL] ${numero}: conversa reiniciada`);
    res.json({ ok: true });
  })
);

// --- Leads ---
api.get(
  "/leads",
  rota(async (_req, res) => {
    const leads = await db
      .collection("leads")
      .find({})
      .sort({ criadoEm: -1 })
      .limit(200)
      .toArray();

    res.json(
      leads.map((l: any) => ({
        ...l,
        numero: l._id,
        exibicao: formatarContato(l._id).exibicao,
        link: formatarContato(l._id).link,
      }))
    );
  })
);

// --- Agenda e recados ---
api.get(
  "/agenda",
  rota(async (_req, res) => {
    const [agendamentos, recados] = await Promise.all([
      db.collection("agendamentos").find({}).sort({ criadoEm: -1 }).limit(100).toArray(),
      db.collection("recados").find({}).sort({ criadoEm: -1 }).limit(100).toArray(),
    ]);

    const enriquecer = (itens: any[]) =>
      itens.map((i: any) => ({
        ...i,
        _id: String(i._id),
        exibicao: formatarContato(i.numero || "").exibicao,
        link: formatarContato(i.numero || "").link,
        // O aviso no WhatsApp pode ter falhado; o painel mostra qual foi.
        notificado: Boolean(i.notificadoEm),
      }));

    res.json({
      hoje: hojeISO(),
      agendamentos: enriquecer(agendamentos),
      recados: enriquecer(recados),
    });
  })
);

api.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[PAINEL] Falha interna:", err.message);
  if (!res.headersSent) res.status(500).json({ erro: "Não foi possível concluir a operação. Tente novamente." });
});
app.use("/api", api);

// A página em si não pede senha: é só HTML, e sem a senha ela não busca nada.
app.use("/painel", express.static(fileURLToPath(new URL("./painel", import.meta.url))));

app.get("/", (_req, res) => res.send('Agente no ar — <a href="/painel/">abrir o painel</a>'));

initDb()
  .then(async () => {
    prospeccao.rotas(apiProspeccao, express);
    filaPersistente = criarFilaPersistente(db, processarWebhook);
    await filaPersistente.iniciar();
    prospeccao.iniciar();
    const servidor = app.listen(3000, () => {
      console.log("Agente ouvindo na porta 3000");
      console.log(
        PAINEL_SENHA
          ? "Painel em http://localhost:3000/painel/"
          : "[PAINEL] desligado: defina PAINEL_SENHA no .env para habilitar"
      );
    });
    let encerrando = false;
    const encerrar = async () => {
      if (encerrando) return;
      encerrando = true;
      filaPersistente.parar();
      await prospeccao.parar();
      servidor.close();
      console.log("[ENCERRAMENTO] Aguardando tarefas em andamento...");
      const concluiu = await filaPersistente.aguardarConclusao(90000);
      if (concluiu) await client.close();
      console.log(concluiu ? "[ENCERRAMENTO] Tarefas concluídas." : "[ENCERRAMENTO] Prazo esgotado; a fila recuperará as tarefas no próximo início.");
      process.exit(concluiu ? 0 : 1);
    };
    process.once("SIGTERM", () => { encerrar().catch(() => process.exit(1)); });
    process.once("SIGINT", () => { encerrar().catch(() => process.exit(1)); });
  })
  .catch((err) => {
    console.error("Falha ao iniciar:", err);
    process.exit(1);
  });
