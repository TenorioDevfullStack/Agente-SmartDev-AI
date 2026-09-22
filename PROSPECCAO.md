# Prospecção no painel

Atualização local em 21/09/2026: importar CSV/Excel, revisar contatos, configurar oferta e iniciar/pausar apresentações e conversas comerciais automáticas. Disponível apenas para administradores. Nenhuma campanha é iniciada pela importação. A campanha pode usar a API oficial ou, mediante configuração e confirmação do risco, Evolution/Baileys. Publicação na VPS e envio real ainda não validados.

## Uso

1. Abra **Prospecção** e baixe o modelo de planilha.
2. Envie CSV UTF-8 (vírgula, ponto e vírgula ou tabulação) ou Excel `.xlsx`, até 2 MB. No Excel, a primeira aba deve ter cabeçalho e até 1.000 contatos, sem fórmulas. `.xls` precisa ser convertido para `.xlsx`.
3. Use `empresa` e `telefone`; `segmento` e `fonte` são opcionais. Também são reconhecidos cabeçalhos como `clinica`, `nome`, `whatsapp`, `celular` e `contato_publico`.
4. Confira a prévia. Cada linha precisa de um único telefone brasileiro com DDD, com ou sem +55. Números repetidos no arquivo ou já cadastrados são sinalizados. Corrija linhas inválidas no arquivo e importe novamente; não escolhemos automaticamente entre dois números.
5. Nomeie a campanha e importe os contatos válidos. Todos entram sem autorização de envio, independentemente de colunas adicionais no arquivo.
6. Registre por contato como e quando o destinatário autorizou a comunicação. Isso é uma declaração do administrador, não uma verificação automática da autorização.
7. Abra a campanha. Em **Oferta e atendimento comercial**, escolha atendimento humano ou **Conversa comercial automática**. Use **Usar oferta de lançamento** para preencher o plano de R$ 1.490 de implantação, R$ 990 para as dez primeiras contratações confirmadas e R$ 497/mês. Confira escopo, condições e perguntas/respostas; clique em **Salvar oferta e modo**. Campanhas antigas permanecem no modo assistido.
8. Atualize os modelos, selecione uma apresentação aprovada e confira o texto. Clique em **Iniciar / retomar**. Oferta e modo ficam bloqueados depois do primeiro envio para preservar condições já apresentadas.
9. No modo assistido, respostas continuam indo para atendimento humano. No automático, o agente escolhe etapas de apresentação, qualificação, respostas cadastradas, proposta e contratação. Bots/menus, mídias, recusas, pedidos humanos, respostas inválidas e dúvidas fora da base interrompem a automação.
10. Use **Assumir atendimento** para interromper a conversa ou **Retomar agente na próxima mensagem** depois de revisar. A retomada não dispara mensagem antiga. Recusa, envio incerto e limite de respostas impedem a retomada automática.

## Conversa comercial e fechamento

- A IA escolhe a etapa e escreve apresentações e perguntas de qualificação curtas, levando em conta a última fala e o histórico. A resposta é limitada a 350 caracteres, uma pergunta e fatos da oferta; apresentações repetidas, preços e links gerados pelo modelo são descartados. FAQ, preços, promoção, contrato e links continuam vindo do conteúdo aprovado e das regras do sistema.
- O agente não despeja o escopo completo na apresentação. Limites e exclusões são usados quando forem relevantes à pergunta; a proposta financeira também é resumida. O modelo não tem acesso às ferramentas gerais de agendamento/recados nem a pagamentos.
- O agente pode apresentar, qualificar, responder às dúvidas e objeções cadastradas e propor contratação. Não concede descontos adicionais. Sem resposta aplicável, encaminha para a equipe.
- Há limite de 20 respostas automáticas por contato, considerando toda a campanha. Repetidas perguntas de qualificação são evitadas pelo histórico e pelo registro das perguntas feitas. Ao atingir o limite, a próxima entrada vai para humano.
- As respostas podem ocorrer fora do horário comercial, dentro de 24 horas da entrada. Usa-se a data mais antiga entre o timestamp válido informado pelo provedor e o recebimento no servidor; na ausência do timestamp, usa-se o recebimento. Mensagens atrasadas na fila não ganham uma nova janela ao serem processadas. O transporte oficial é conferido antes da inferência e a situação da conversa é revalidada antes do envio.
- Pausa da campanha, desativação do administrador, recusa e intervenção humana interrompem novas respostas. Uma chamada externa já iniciada não pode ser desfeita. Fila de apresentações concluída permite continuar as conversas; reinício pausa também essas campanhas automáticas.
- Sem link de contratação, o agente registra **Pedido de contratação — conferir** e encaminha para humano. O usuário confirmou que ainda não possui link; nenhuma chave Pix, conta bancária ou URL fictícia foi criada.
- Na oferta de lançamento, a contratação sempre passa por conferência humana, mesmo se um link for preenchido: um checkout estático não controla as dez vagas. Ofertas comuns sem promoção podem enviar o link HTTPS cadastrado após apresentar a proposta. Link enviado não é pagamento confirmado.
- O estado **Contratação confirmada** é uma declaração do administrador de que conferiu contrato e pagamento, não verificação bancária do sistema. As dez vagas são globais entre campanhas desta instalação, com atualização atômica e idempotente. Uma empresa deve ter sempre o mesmo código interno.
- Não existe follow-up automático, navegação por menus de clínicas, diagnóstico médico ou interpretação de áudio.

Detalhes de escopo, custos, pesquisa de mercado e promoção: [OFERTA_LANCAMENTO.md](comercial/OFERTA_LANCAMENTO.md).

## Conexão WhatsApp e modelos

A instância atual foi consultada em 13/09/2026 e informa `WHATSAPP-BAILEYS` (QR Code). Com `PROSPECCAO_PERMITIR_BAILEYS=true` e `PROSPECCAO_MODELO_TEXTO` configurado na VPS, a campanha pode enviar texto pela rota `message/sendText`; o administrador precisa confirmar o risco no painel. Sem essas variáveis, o transporte oficial exige instância `WHATSAPP-BUSINESS` e modelo de marketing `APPROVED`.

O módulo consulta `/instance/fetchInstances` e `/template/find/{instance}` e envia por `/message/sendTemplate/{instance}` da Evolution API 2.3.7. Não muda automaticamente o tipo de conexão nem cria/aprova modelos na Meta.

Primeira versão suporta modelos com corpo de texto e rodapé opcional, sem mídia ou botões. A variável `{{1}}` é opcional e recebe a empresa. Outros parâmetros não são aceitos. Modelos são revalidados antes do envio; alteração de texto pausa a campanha para nova revisão.

A [política oficial do WhatsApp](https://whatsappbusiness.com/policy/) exige autorização do destinatário e, na Business Platform, modelo aprovado para iniciar conversas. Um telefone publicado em diretório não comprova autorização. A lista pesquisada é uma base de potenciais clientes, não uma lista pronta para disparos.

## Execução e respostas

- Uma campanha ativa e um processo do agente por vez.
- Segunda a sexta, 9h–18h em America/Sao_Paulo; intervalo mínimo de 60 segundos e até 20 tentativas por dia no conjunto de campanhas. Limites são escolhas operacionais desta versão, não garantia contra bloqueios do WhatsApp.
- Aprovação do contato e início da campanha são ações diferentes. Contatos pendentes não são enviados.
- Ao terminar os aprovados, a campanha fica concluída; novos contatos aprovados exigem retomar pelo painel.
- Pausar aguarda uma chamada já iniciada, que não pode ser desfeita.
- A desativação do administrador iniciador pausa a campanha no próximo ciclo.
- O estado "Aceito pelo WhatsApp" indica aceite do provedor, não confirmação de entrega ou leitura.
- Não há follow-up automático. Diálogo comercial depende da ativação expressa do modo automático e da oferta salva.
- Cada campanha permite configurar no painel os dias da semana e a janela de envio no fuso America/Sao_Paulo; o padrão continua segunda a sexta, 09:00–18:00. Respostas de conversas já iniciadas seguem as regras próprias do diálogo.
- Respostas são classificadas por regras conservadoras. No modo automático, mensagens elegíveis seguem para o módulo comercial; provável bot/menu, exceção ou recusa permanecem sob revisão humana. A classificação não é certeza. Não navega menus nem responde a pedidos de CPF/consulta.
- Recusas bloqueiam novos envios de campanha e não são revertidas por reimportação, nova resposta ou nova aprovação.
- Respostas de números importados também interrompem a fila antes do primeiro envio. São tratadas como conversas de prospecção e permanecem sob revisão humana.
- Mídias recebidas desses contatos são marcadas para revisão; não são transcritas pelo fluxo de prospecção.

## Persistência, recuperação e auditoria

Coleções: `prospeccao_campanhas`, `prospeccao_contatos`, `prospeccao_previas` e `prospeccao_promocoes`, no banco `agente`. Backups completos desse banco incluem as coleções; confirme isso na restauração. Prévia expira em uma hora; campanhas, contatos e confirmações promocionais não têm expiração automática. O snapshot da oferta fica na campanha, e estágio, proposta, pedido e quantidade de respostas ficam no contato.

O telefone é a chave única global da prospecção nesta instalação. Não há reenvio de um contato já tentado por uma nova campanha. Timeout ou queda durante envio exige revisão, sem repetição automática. Após reinício, campanhas ativas ficam pausadas e envios interrompidos ficam em revisão.

Importações, aprovações, bloqueios, início/pausa e tentativas de envio são auditados. Mensagens aceitas entram no histórico e contexto da conversa. APIs usam as sessões e proteção CSRF existentes; rotas de prospecção também exigem papel de administrador.

## Verificação

- `node tests/prospeccao.integration.mjs`: requer MongoDB isolado em `127.0.0.1:27028`, cria e remove somente banco temporário com prefixo `teste_prospeccao_`. Transporte de WhatsApp é simulado.
- `node --test tests/prospeccao-vendas.test.mjs`: valida oferta, preços, limites de ações, links, janela, pedidos humanos e conteúdo da IA.
- `node tests/prospeccao-vendas.integration.mjs`: banco isolado; simula diálogo, recusa, intervenção durante inferência, pausa, expiração, envio incerto e confirmações promocionais concorrentes. IA e WhatsApp simulados, sem envio externo.
- Testes cobrem importação CSV e XLSX, fórmulas, números ambíguos, duplicatas, autorização, autenticação/CSRF, concorrência, pausa, classificação de bot, recusa persistente e envio incerto/reinício.
- `node tests/prospeccao-fixture.mjs`: painel de teste em `127.0.0.1:3103`, sem integração de envio real. Conta fictícia `admin`, senha `senha-teste-inicial`. Nunca usar essa fixture para publicação.

Validação no navegador utilizou a planilha pública das clínicas e banco temporário: 7 linhas válidas, 3 com dois telefones. Nenhuma mensagem real foi enviada. Envio pela API oficial ainda precisa de validação com número de teste autorizado após configurar a conexão.

Validação adicional em 21/09/2026: 17 testes unitários/regressão aprovados e as duas suites de integração de prospecção aprovadas com MongoDB isolado. Navegador confirmou importação fictícia, seleção da oferta, persistência após recarregar, início simulado e confirmação promocional de 0 para 1. Capturas desktop/mobile em `tests/prospeccao-vendas-*.png`. Foram corrigidos contraste de textarea e preservação dos rascunhos de autorização/fechamento durante atualização. Sintaxe TypeScript do servidor aprovada para Node 22. IA e WhatsApp foram simulados; não comprova qualidade do LLM real nem operação ao vivo.

## Navegação da base comercial

A aba Prospecção abre a base de prospectos com busca por empresa/telefone, filtros Todos / Ainda não contatados / Contatos feitos / Responderam / Não contatar e páginas de 25 registros. “Novo prospecto” abre cadastro direto com seleção de campanha em rascunho ou pausada. Se não houver campanha disponível, crie uma em Campanhas, sem planilha.

“Ver ficha” mostra a campanha vinculada, eventos registrados, mensagem inicial quando disponível e as ações de autorização/atendimento. Datas aparecem no fuso São Paulo. Aceite pelo provedor não comprova entrega ou leitura. O modelo atual permite uma campanha por telefone; a interface não cria histórico fictício de múltiplos envios.

Campanhas organiza três áreas: Prospectos da campanha, Oferta e horários, Revisar e iniciar. Importação continua numa área própria. Autorização, limites, bloqueio de duplicidade e controle de envio permanecem no servidor.

Na ficha de um prospecto com estado **Pronto para contato**, use **Revisar e iniciar campanha**. A etapa final informa quantos prospectos prontos da mesma campanha entrarão na fila e exibe o horário configurado. O início é por campanha: todos os contatos prontos entram na fila, respeitando intervalo mínimo, limite diário e janela de envio. Prospectos sem autorização não entram nessa contagem.
