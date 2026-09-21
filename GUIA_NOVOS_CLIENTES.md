# Guia de implantação de agentes para novos clientes — SmartDev AI

Data: 16/09/2026.

## 1. Status e finalidade

Documento solicitado pelo usuário para guardar o planejamento e os cenários discutidos. Nenhuma conta foi criada, integração implantada, contratação realizada ou mensagem enviada nesta etapa.

Está autorizada a documentação da opção Evolution com exposição dos riscos. Isso não significa escolha dessa conexão para qualquer cliente, aprovação de preços ou autorização de publicação de oferta comercial. A recomendação técnica inicial é avaliar Cloud API direta; a escolha final depende do cliente e da capacidade operacional da SmartDev AI.

Os procedimentos abaixo são propostas operacionais. Telas, requisitos de cadastro, preços e elegibilidade devem ser reconferidos na implantação. Não são promessa de aprovação pela Meta. A lista de riscos cobre os principais riscos identificáveis, sem pretender antecipar todos os incidentes futuros.

## 2. Duas escolhas independentes

Primeiro decidir quem conduz o cadastro: cliente ou SmartDev AI. Depois decidir o transporte das mensagens: Meta direta, parceiro oficial ou Evolution/Baileys. Por exemplo, o cliente pode configurar a Meta e contratar Twilio; a SmartDev AI pode conduzir o cadastro e usar Meta direta.

| Cenário | Responsável principal | Resultado esperado |
|---|---|---|
| A — Cliente configura a Meta | Cliente, com roteiro e revisão técnica nossa | Ativos da empresa preparados e acesso técnico autorizado |
| B — SmartDev AI configura a Meta | SmartDev AI, com participação do titular | Ativação assistida e ativos sob controle do cliente |
| C — API oficial direta | SmartDev AI integra com Meta Cloud API | Mensagens passam diretamente entre nosso sistema e a Meta |
| D — API parceira oficial | SmartDev AI integra com fornecedor escolhido | Mensagens passam pelo parceiro, como Twilio |
| E — Evolution com Baileys | SmartDev AI opera a conexão vinculada ao WhatsApp | Conexão não oficial, sujeita aos riscos da seção 8 |

A Twilio também utiliza a plataforma oficial. Contratar uma empresa que vende uma API não basta para caracterizar conexão oficial: verificar o transporte real e o vínculo do fornecedor com a plataforma. [Documentação Twilio](https://www.twilio.com/docs/whatsapp/api)

A Evolution declara suporte a Baileys e à WhatsApp Cloud API. Evolution com Cloud API é uma camada adicional sobre a conexão oficial; Evolution com Baileys usa integração baseada no WhatsApp Web. O nome Evolution, sozinho, não determina o tipo de conexão. [Repositório Evolution](https://github.com/evolution-foundation/evolution-api/blob/main/README.md)

## 3. Processo comum a qualquer cliente

1. **Diagnóstico:** identificar segmento, serviços, volume de mensagens, horários, número atual, responsáveis humanos e objetivo do agente.
2. **Escopo:** definir dúvidas que responderá, dados que coletará, encaminhamentos e ações permitidas. Manter transcrição e interpretação de áudio fora do serviço. Integrações com agenda, CRM e pagamentos exigem escopo próprio.
3. **Conteúdo aprovado:** reunir catálogo, preços autorizados, regiões atendidas, políticas e perguntas frequentes. Definir encaminhamento quando faltar informação. Registrar pedido de agendamento não equivale a reservar horário.
4. **Escolha de conexão:** apresentar custos, dependências, riscos e responsabilidade pelo cadastro. Registrar a escolha expressa do cliente antes da ativação.
5. **Proposta:** separar implantação, operação mensal, consumo de terceiros e alterações adicionais. Definir suporte, limites de uso, critério de aceite e procedimento de saída.
6. **Preparação técnica:** separar configuração comercial do código e provisionar dados, credenciais, acessos e backups por cliente. Não clonar indiscriminadamente a instalação existente.
7. **Cadastro e integração:** seguir A ou B e depois C ou D. Para Evolution/Baileys, seguir E; esse transporte não exige o mesmo cadastro da Cloud API.
8. **Testes internos:** verificar conteúdo, limites do agente, entrega de mensagens, atendimento humano, isolamento, falhas e recuperação.
9. **Aceite:** cliente testa exemplos representativos e aprova comportamento e canal escolhidos.
10. **Publicação assistida:** combinar janela de ativação, responsável de plantão e canal alternativo. Monitorar a operação e corrigir incidentes.
11. **Operação recorrente:** acompanhar erros, encaminhamentos pendentes, custos, suporte, backups e revisões do conteúdo.

Fluxo proposto: WhatsApp ↔ transporte escolhido ↔ agente na VPS ↔ provedor de IA e dados da empresa. Painel acompanha e permite intervenção humana. A API de WhatsApp transporta mensagens; a API de IA gera respostas. O contexto registra Groq como padrão atual, cuja qualidade e custo precisam ser avaliados para cada oferta.

## 4. Cenário A — Cliente configura a conta Meta

### Preparação

Enviar um roteiro simples solicitando acesso administrativo legítimo à empresa, dados empresariais, e-mail de contato e acesso ao número para confirmação. Documentos e forma de pagamento podem ser necessários conforme o fluxo e as verificações solicitadas. Não pedir senhas, códigos ou documentos privados por arquivos do projeto.

### Passo a passo

1. Cliente informa se já possui portfólio empresarial, conta WhatsApp Business da plataforma e número conectado a algum fornecedor. Conferimos a situação antes de criar ativos duplicados.
2. Cliente entra na Meta com sua própria identidade e cria ou seleciona o portfólio da empresa.
3. Cliente cria ou seleciona a conta WhatsApp Business e confere dados e nome de exibição no fluxo escolhido.
4. Antes de registrar um número já utilizado, avaliamos migração, coexistência e efeitos sobre aplicativo e histórico. Não orientar exclusão da conta existente como procedimento padrão.
5. Cliente confirma o número no fluxo oficial e atende às solicitações de verificação e cobrança que aparecerem. Verificação empresarial, confirmação do telefone e aprovação do nome são etapas distintas; uma não comprova as demais.
6. Cliente autoriza o acesso técnico necessário à SmartDev AI pelo mecanismo compatível com a integração. Não basta nos enviar o telefone.
7. SmartDev AI revisa permissões, estado da conta, número e pendências. Orienta correções por chamada se necessário.
8. SmartDev AI executa a integração C ou D e os testes da seção 10.

**Evidência de conclusão:** ativos corretos identificados, acesso técnico confirmado, requisitos de produção atendidos e teste controlado de envio e recebimento aprovado. Concluir telas de cadastro, sozinho, não significa agente operacional.

## 5. Cenário B — Eu/SmartDev AI configuro a conta Meta

Proposta de serviço: ativação assistida incluída ou discriminada na implantação. O cliente não precisa dominar a ferramenta; precisa participar das confirmações que dependem do titular.

### Passo a passo

1. Obter autorização para configurar os ativos da empresa e combinar a participação do responsável com poderes administrativos.
2. Levantar dados e situação do número, usando a mesma preparação do cenário A.
3. Realizar chamada com compartilhamento de tela. O cliente faz login e digita senhas e códigos diretamente. Não gravar a tela durante exposição de dados sensíveis.
4. Conduzir criação ou seleção do portfólio e da conta empresarial em nome da empresa cliente. Não colocar todos os clientes dentro da conta empresarial da SmartDev AI como atalho.
5. Receber permissões delegadas quando disponíveis e executar as configurações permitidas. Ações que exigem confirmação do titular permanecem com ele.
6. Acompanhar confirmação do número, dados de cobrança e eventuais verificações. O cliente fornece documentos diretamente pelo canal apropriado quando solicitados.
7. Configurar o transporte escolhido, os eventos de mensagens, o agente e o painel; armazenar segredos somente em ambiente apropriado e separado por cliente.
8. Fazer teste acompanhado, ensinar como assumir e pausar o agente e entregar orientação de suporte.
9. Revisar permissões ao final, removendo acessos temporários e mantendo apenas os necessários à operação contratada.

**Titularidade proposta:** cliente controla ativos empresariais e número; SmartDev AI controla seu software e opera com acesso autorizado. Definir no contrato a responsabilidade por faturamento e eventual conta do parceiro.

**Limites:** não prometer aprovação da Meta ou data fixa para verificações externas. Não criar identidade fictícia nem assumir a identidade pessoal do cliente.

Texto comercial sugerido: “Cuidamos da implantação e acompanhamos você na ativação do WhatsApp. Sua empresa mantém a titularidade da conta e participa das confirmações e aprovações necessárias.”

### Cadastro integrado futuro

O Embedded Signup permite incorporar o cadastro e a autorização ao portal do fornecedor. A documentação oficial descreve esse fluxo para parceiros e provedores de tecnologia. A assistência humana pode acompanhar esse mesmo fluxo; não substitui requisitos de cadastro do fornecedor. [Meta — Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup)

Antes de operar esse modelo, verificar e cumprir os requisitos atuais da Meta para o aplicativo, permissões, revisão e atuação como Tech Provider. Não está implementado nem validado neste projeto. Para Twilio, o caminho de fornecedor que cadastra clientes exige o programa Tech Provider e integração própria; o cadastro da nossa empresa não habilita automaticamente todos os clientes. [Twilio — programa para fornecedores](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program)

## 6. Cenário C — Cliente utiliza API oficial direta da Meta

### Passo a passo

1. Executar cadastro A ou B e definir a modalidade de integração compatível com o papel da SmartDev AI. Conferir requisitos atuais do aplicativo e de atendimento a empresas terceiras.
2. Validar número novo ou planejar migração/coexistência do número existente. Confirmar elegibilidade no fluxo real; não prometer que continuará funcionando no aplicativo.
3. Configurar aplicativo, permissões e credenciais adequadas à produção, sem depender de token temporário de teste.
4. Preparar endpoint HTTPS para receber eventos da Meta, validar autenticidade conforme documentação e associar cada evento ao cliente correto.
5. Adaptar recebimento, envio, identificação de contatos, estados de entrega e tratamento de erros ao nosso agente.
6. Implementar controle da janela de atendimento e uso de modelos aprovados quando necessários.
7. Testar deduplicação, reentregas de eventos, reinício e falhas; não reenviar automaticamente quando o resultado anterior for incerto sem regra de reconciliação.
8. Testar atendimento manual pelo painel. Verificar equivalência dos recursos hoje dependentes da conexão Baileys, incluindo detecção de mensagens humanas; não presumir que eventos são iguais.
9. Aprovar custos e conteúdo, cumprir seção 10 e ativar com acompanhamento.

Na plataforma oficial, a última mensagem do usuário abre uma janela de atendimento de 24 horas para mensagens livres; fora dela são necessários modelos aprovados. Aplicar também aos envios humanos pelo painel. Confirmar regras comerciais, consentimento e categorias vigentes antes de campanhas. [Twilio — visão geral da plataforma](https://www.twilio.com/docs/whatsapp/api) e [Política oficial do WhatsApp](https://business.whatsapp.com/policy)

**Custos a levantar:** cobranças aplicáveis da Meta, IA, infraestrutura, armazenamento, backups e suporte. Conexão direta elimina a tarifa de intermediação da Twilio, não todos os custos.

**Riscos remanescentes:** restrições por política ou qualidade, reprovação de modelos, limites, falhas da Meta, alterações de versão, credenciais revogadas e falhas do nosso sistema. API oficial não é garantia de disponibilidade ou ausência de bloqueio.

## 7. Cenário D — Cliente utiliza API parceira oficial

Twilio é o exemplo discutido; escolher outro parceiro requer análise própria. Não atribuir preços, recursos ou requisitos da Twilio a todos os fornecedores.

### Passo a passo

1. Verificar que o serviço utiliza a plataforma oficial e entender quem controla conta, número e faturamento.
2. Comparar preços por mensagem, mensalidades, adicionais, suporte, exportação de dados e condições de migração de saída.
3. Definir contratação: conta do cliente com acesso delegado ou estrutura de fornecedor com segregação por cliente, conforme regras do parceiro.
4. Para Twilio como fornecedor de software de terceiros, cumprir o fluxo Tech Provider. Orientar o cliente pelo cadastro integrado, com apoio A ou B conforme necessário. [Guia de integração Twilio](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide)
5. Conferir ativos Meta, número, verificações e cobrança. O parceiro não elimina essas dependências.
6. Configurar credenciais, recebimento de eventos e notificações de entrega do parceiro. Implementar validação das requisições e segregação de dados.
7. Adaptar nosso agente à API do parceiro, incluindo modelos, erros, limites e controle de duplicatas.
8. Testar envio, recebimento, painel humano e recuperação de falhas. A sandbox serve para desenvolvimento; não comprova liberação de produção.
9. Cumprir os critérios da seção 10 e ativar.

**Referência de custo em 16/09/2026:** tabela pública da Twilio informa US$ 0,005 por mensagem recebida ou enviada, além das cobranças aplicáveis da Meta. Dez mil mensagens totais equivalem a US$ 50 de tarifa Twilio nessa referência, sem Meta, IA, servidor, impostos ou adicionais. Não confundir mensagem com conversa. Reconsultar a tabela antes de cotar. [Preços Twilio](https://www.twilio.com/en-us/whatsapp/pricing)

**Riscos adicionais:** indisponibilidade do parceiro, dependência de sua API, mudanças de preço, suspensão da conta, suporte insuficiente e dificuldades de migração. Solicitar clareza sobre portabilidade antes de contratar.

## 8. Cenário E — Oferta de Evolution com Baileys e riscos

### Como apresentar a opção

Nome proposto: “Conexão via Evolution/Baileys — integração não oficial”. Evitar anunciar como API oficial, conexão homologada ou solução sem risco de bloqueio.

A possível vantagem é aproveitar a base existente e conectar por vinculação ao WhatsApp. Isso não demonstra menor custo total: manutenção, suporte e interrupções podem anular a economia de intermediação. Avaliar licença e condições da versão/distribuição ou hospedagem escolhida antes de comercializar.

Se a Evolution estiver configurada com Cloud API, aplicar o cenário C e os riscos da camada adicional de software. Não atribuir automaticamente os riscos específicos de Baileys a esse modo oficial.

### Passo a passo proposto

1. Explicar a diferença para Cloud API e parceiro oficial, custos e matriz de riscos abaixo.
2. Identificar se o número é essencial ao negócio e qual será o canal alternativo em caso de indisponibilidade. Minha recomendação é priorizar conexão oficial quando a perda de acesso ao WhatsApp comprometer a operação.
3. Registrar escolha informada do cliente e responsabilidades de suporte. Esse registro não autoriza descumprir regras da plataforma nem elimina responsabilidades legais.
4. Preparar instância, credenciais, volumes, bancos e backup isolados. Restringir acesso ao painel administrativo e às sessões.
5. Validar versão da Evolution/Baileys em ambiente de teste antes de ativar no número do cliente.
6. Orientar o titular a vincular o dispositivo pelo mecanismo da versão utilizada, normalmente QR Code. Não guardar QR Code ou material de sessão em documentos compartilhados.
7. Testar envio, recebimento, intervenção humana, pausa e retomada, mensagens duplicadas e reconexão. Usar somente contatos de teste autorizados.
8. Configurar monitoramento da conexão autenticada e alerta de falha, além da saúde dos containers. Definir responsável por renovar a vinculação quando necessário.
9. Ativar de forma acompanhada e oferecer canal alternativo de atendimento.
10. Manter plano de saída para a API oficial. Migração exige análise do número, conta, histórico, desenvolvimento e testes; não prometer troca instantânea.

### Matriz dos principais riscos

Os termos e diretrizes do WhatsApp preveem restrições de uso e medidas sobre contas. A avaliação abaixo combina essas regras com riscos técnicos e comerciais inferidos para nossa operação; não é medição estatística de probabilidade. [Termos WhatsApp Business](https://www.whatsapp.com/legal/business-terms) e [Diretrizes de mensagens](https://www.whatsapp.com/legal/messaging-guidelines)

| Risco | Impacto possível | Tratamento proposto e limite |
|---|---|---|
| Suspensão temporária ou permanente do acesso do número ao WhatsApp | Interrupção de atendimento e vendas | Preferir API oficial para operação crítica; prever canal alternativo. Não há garantia de reversão; suspensão do WhatsApp não é cancelamento da linha telefônica. |
| Incompatibilidade com regras da plataforma | Restrições de serviço e exposição contratual | Reavaliar termos aplicáveis. Ciência do cliente não transforma conexão não oficial em autorizada pela Meta. |
| Mudanças no WhatsApp Web/protocolo | Conexão deixa de funcionar sem alteração nossa | Testar atualizações e acompanhar dependências; correção pode depender da comunidade. |
| Desconexão ou invalidação da sessão | Agente para até nova vinculação | Alertar e manter titular disponível; reiniciar container pode não resolver. |
| Eventos incompletos, duplicados ou fora de ordem | Respostas incorretas, repetidas ou ausentes | Deduplicação, filas e revisão de resultados incertos; não prometer entrega perfeita. |
| Recuperação incompleta após queda | Mensagens ou estados não reconciliados | Testar retomada e preservar registros necessários; backup não garante recuperação de tudo que não foi recebido. |
| Exposição de sessão, chave ou painel | Acesso indevido a mensagens e envio em nome da empresa | Segregar segredos, restringir acesso e revogar material comprometido. |
| Vulnerabilidades em dependências ou hospedagem | Vazamento e indisponibilidade | Atualizações avaliadas, backups protegidos e controle de acesso. Também existe em integrações oficiais. |
| Mistura de clientes | Dados ou mensagens enviados pela conta errada | Isolar configuração, armazenamento, credenciais e permissões; testar separação. |
| Atendimento humano e agente simultâneos | Respostas conflitantes ou tratamento inadequado | Validar pausa/retomada e comportamento dos eventos do transporte escolhido. |
| Ausência de suporte oficial para Baileys | Prazo imprevisível de reparo | Definir suporte próprio e limites; não prometer que a Meta solucionará a conexão não oficial. |
| Consumo, manutenção e licença | Custo maior que o previsto ou restrição de uso da distribuição | Orçar suporte e verificar condições da versão; não vender como custo zero. |
| Migração futura | Retrabalho, indisponibilidade e histórico não transferível integralmente | Planejar e testar exportação e transição antes de prometer preservação. |
| Impacto comercial e reputacional | Clientes sem retorno e perda de confiança | Canal alternativo, comunicação de incidente e limites de serviço claros. |

Não existe quantidade de mensagens, intervalo, “aquecimento” ou configuração que garanta ausência de bloqueio. Não propor técnicas para contornar fiscalização ou restrições. Consentimento e baixo volume não eliminam os riscos da conexão não oficial.

### Texto sugerido para apresentação ao cliente

“Podemos avaliar a conexão por Evolution/Baileys. Essa modalidade não é a API oficial da Meta e pode sofrer desconexões, incompatibilidades e restrição temporária ou permanente do acesso do número ao WhatsApp. Podemos operar a infraestrutura e prestar o suporte contratado, mas não garantir continuidade da conexão nem reversão de bloqueios. A alternativa oficial é a Cloud API, direta ou por parceiro, com custos e regras próprios.”

O texto é uma explicação comercial proposta, não um contrato jurídico nem exoneração de responsabilidade. Antes da ativação, registrar modalidade escolhida, riscos apresentados, responsáveis, suporte, custos e canal alternativo em sistema apropriado; não incluir conversas privadas neste guia.

## 9. Responsabilidades e orçamento

| Tema | Cliente | SmartDev AI |
|---|---|---|
| Empresa e número | Fornecer dados corretos e comprovar controle | Orientar cadastro e revisar preparação |
| Autorizações | Fazer login, confirmar número e conceder acessos | Usar somente os acessos necessários |
| Conteúdo | Aprovar informações, preços e regras | Configurar e testar o agente |
| Atendimento humano | Definir equipe e assumir exceções | Disponibilizar e validar o encaminhamento |
| Operação técnica | Informar alterações e incidentes | Monitorar e prestar suporte conforme contrato |
| Cobrança | Aprovar consumo e responsável pelo pagamento | Medir e apresentar custos separados |
| Encerramento | Indicar destino dos ativos e dados | Entregar exportação acordada e revogar acessos conforme processo |

Estrutura proposta de preço: implantação (incluindo modalidade de assistência), mensalidade operacional, consumo variável e serviços adicionais. Separar Meta/parceiro, IA, infraestrutura, backups e mão de obra. Definir limites, alerta de consumo e quem autoriza excedentes. Valores e franquias seguem pendentes de decisão; a estimativa anterior do próprio agente não é preço garantido por cliente.

## 10. Critérios de aceite e entrada em produção

Checklist proposto, a executar futuramente para cada implantação:

- [ ] Escopo, transporte e responsabilidades escolhidos pelo cliente.
- [ ] Conteúdo aprovado; agente encaminha dúvidas sem resposta confiável.
- [ ] Conta e número corretos, acesso do titular e permissões técnicas conferidos.
- [ ] Envio, recebimento e estados disponíveis testados com contatos autorizados.
- [ ] Controle de janela e modelos validado quando utilizada plataforma oficial.
- [ ] Atendimento humano pausa o agente e retomada funciona no transporte adotado.
- [ ] Reinício, duplicatas, reentregas e falhas de envio exercitados.
- [ ] Isolamento entre clientes demonstrado por teste de acesso e roteamento.
- [ ] Backup e restauração em ambiente separado testados.
- [ ] Alertas de infraestrutura e conexão avaliados; lacunas documentadas.
- [ ] Custos, suporte, canal alternativo e procedimento de incidente definidos.
- [ ] Cliente aprovou piloto; ativação registrada sem divulgar dados privados.

Não marcar itens como aprovados por existirem no documento. Registrar evidência sanitizada e data em cada implantação, sem senhas, tokens, conteúdo privado de conversas ou cópias de documentos pessoais.

## 11. Falhas, transição e encerramento

1. Ao detectar falha, identificar se está no agente, infraestrutura, credencial, conta ou fornecedor.
2. Suspender tentativas que possam gerar duplicatas ou agravar o incidente; revisar envios de resultado incerto.
3. Informar o responsável e usar o canal alternativo. Atendimento manual no mesmo WhatsApp também pode ficar indisponível se houver suspensão da conta.
4. Corrigir ou acionar o fornecedor apropriado. Reconectar sessão somente quando indicado; não trocar números para contornar bloqueio.
5. Antes de migrar, inventariar ativos e dados, testar nova conexão e combinar a janela. Não manter dois agentes respondendo simultaneamente ao mesmo número.
6. Após recuperação, conferir mensagens pendentes e autorizar retomada controlada.
7. No encerramento, entregar dados e ativos acordados, revogar credenciais e definir retenção/exclusão conforme obrigações aplicáveis e contrato. Não prometer portabilidade integral do histórico.

## 12. Estado do nosso projeto e trabalho pendente

Segundo CONTEXTO_PROJETO.md, sem nova inspeção de código ou teste de produção nesta etapa:

- Conexão registrada: Evolution com WHATSAPP-BAILEYS. Não declarar Cloud API ou Twilio já disponíveis e testadas.
- Identidade e catálogo estão fixados no código; configuração reutilizável permanece pendente.
- Nomes, portas e instâncias da implantação precisam de parametrização e isolamento.
- Contas de equipe não representam separação entre empresas.
- A fila foi projetada para um processo do agente; replicar processos exige trabalho específico.
- O monitor validado cobre infraestrutura e HTTP local; não comprova conexão WhatsApp autenticada nem acesso público ponta a ponta.
- A implantação atual de prospecção exige transporte oficial e modelo aprovado; documentar Evolution/Baileys não autoriza adaptar campanhas para contornar isso.

Próxima sequência técnica sugerida, ainda não autorizada por este documento: preparar configuração por cliente; validar isolamento; escolher e implementar um transporte oficial; testar equivalência do painel; preparar cadastro de fornecedor quando aplicável; executar piloto; medir custo e capacidade antes de prometer quantidade de clientes por VPS.

## 13. Fontes e revisão

Fontes primárias consultadas em 16/09/2026, vinculadas junto às afirmações correspondentes. A documentação Meta de visão geral retornou limitação de acesso na pesquisa anterior; foram utilizadas também coleções oficiais da Meta no Postman e documentação da Twilio. Antes de executar qualquer cadastro, conferir a documentação atual do fluxo exato e os requisitos exibidos na conta.

Este guia preserva planejamento, opções e recomendações. Sua criação não implementa funcionalidades nem demonstra prontidão comercial.
