# SmartDev AI — Agente de WhatsApp

Assistente de IA para atendimento no WhatsApp, qualificação de contatos e encaminhamento humano. A proposta comercial do agente segue a landing publicada da SmartDev AI: projetos sob medida, com escopo, valor e prazo definidos após entender a necessidade do cliente.

## Decisões e continuidade

Consulte [CONTEXTO_PROJETO.md](CONTEXTO_PROJETO.md) para decisões comerciais, planejamento e pendências. A migração Hostinger está em preparação, conforme [MIGRACAO_VPS.md](MIGRACAO_VPS.md). Transcrição removida do código e Compose; atualizar a imagem para aplicar à instalação em execução.

## Links

- **Landing page oficial:** [agente.smartdevai.com.br](https://agente.smartdevai.com.br/)
- **Painel de atendimento:** [painel.smartdevai.com.br/painel/](https://painel.smartdevai.com.br/painel/)
- **Painel local:** [localhost:3000/painel/](http://localhost:3000/painel/), com os serviços rodando neste computador.

O painel usa contas individuais. No primeiro acesso após a migração, entre com **usuário `admin` e a antiga senha do painel** (`PAINEL_SENHA`). Será obrigatório informar seu nome e definir uma nova senha pessoal.

## Recursos

- [Prospecção no painel](PROSPECCAO.md): importação CSV/Excel, revisão de contatos, autorização e campanhas com iniciar/pausar. Envio inicial depende da API oficial e de modelo aprovado; a conexão QR atual permite organizar a base.

- Respostas com IA e histórico de conversa.
- Consulta ao catálogo comercial e registro de leads.
- Registro de pedidos de agendamento e recados para o responsável.
- Atendimento automático por texto. Áudios são registrados sem transcrição; o agente solicita texto quando a conversa não está assumida.
- Painel para acompanhar conversas, responder manualmente e pausar ou reativar o agente por contato.

## Estrutura

| Arquivo ou pasta | Finalidade |
| --- | --- |
| `agente/server.ts` | Servidor, integração com WhatsApp, instruções da IA, catálogo e API do painel |
| `agente/painel/index.html` | Interface do painel de atendimento |
| `agente/package.json` | Dependências e comando de inicialização |
| `agente/Dockerfile` | Imagem Docker do agente |
| `landing/index.html` | Arquivo local de landing; a referência comercial é a página publicada |
| `caddy/Caddyfile` | Proxy que permite acesso público ao painel e à sua API |
| `docker-compose.yml` | Serviços e volumes do projeto |
| `.env.example` | Modelo de configuração, sem credenciais |
| `.env` | Configuração local e credenciais; não compartilhar nem versionar |

## Serviços

O Docker Compose executa o agente em Node.js/TypeScript com Express, Evolution API para o WhatsApp, MongoDB para os dados do agente, PostgreSQL e Redis para a Evolution API, Caddy como proxy e Cloudflare Tunnel para acesso público ao painel.

A IA usa Groq por padrão. Ollama é uma alternativa local selecionada por configuração; não há troca automática de provedor em caso de erro.

## Configuração e execução

É necessário ter Docker com suporte a Docker Compose. No Windows, mantenha o Docker Desktop em execução.

1. Caso ainda não exista `.env`, copie o modelo sem sobrescrever uma configuração existente:

   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

2. Preencha as variáveis no `.env`:

   | Variável | Uso |
   | --- | --- |
   | `AUTH_KEY` | Chave de autenticação da Evolution API |
   | `ADMIN_NUMBER` | Número do responsável, com DDI e DDD, somente dígitos |
   | `CONTATO_PESSOAL` | Contato fornecido para solicitações explicitamente pessoais |
   | `LLM_PROVIDER` | `groq` ou `ollama` |
   | `GROQ_API_KEY` | Chave de acesso à Groq |
   | `GROQ_MODEL` | Modelo usado na Groq |
   | `PAINEL_SENHA` | Senha inicial do administrador; usada somente na criação inicial ou recuperação local explícita |
   | `TUNNEL_TOKEN` | Token do Cloudflare Tunnel para publicar o painel |

3. Inicie os serviços:

   ```powershell
   docker compose up -d --build
   ```

4. Na Evolution API, conecte o WhatsApp à instância `agente-suporte` e configure os eventos de mensagens recebidas para o webhook interno `http://agente:3000/webhook`. Subir os containers sozinho não conecta uma nova conta de WhatsApp.

5. Para o painel público, configure o hostname `painel.smartdevai.com.br` no Cloudflare Tunnel com destino `http://proxy:80`. O túnel deve apontar para o proxy, que restringe as rotas públicas.

Sem `PAINEL_SENHA` e sem usuários já cadastrados, não há administrador inicial para acessar o painel. Usuários existentes continuam funcionando independentemente dessa variável. Sem um `TUNNEL_TOKEN` válido, o painel público não funciona e o container do túnel pode reiniciar repetidamente; o acesso local não depende dele.

## Usuários e auditoria

- O administrador usa a aba **Equipe** para criar atendentes, desativar/reativar acesso e redefinir senhas temporárias. O administrador inicial não pode ser desativado pela interface.
- Cada atendente deve trocar a senha temporária no primeiro acesso. Clique no seu nome no topo para alterar nome e senha posteriormente. Senhas novas exigem pelo menos 12 caracteres.
- Senhas são derivadas com `scrypt` e salt aleatório. A sessão dura até 8 horas, em cookie `HttpOnly` e `SameSite=Strict`, com `Secure` no domínio público. A senha compartilhada não é mais aceita pelo cabeçalho da API nem armazenada no navegador.
- Desativação e redefinição de senha revogam as sessões daquele usuário. Há limite de tentativas de autenticação, e operações de escrita exigem o cabeçalho `x-painel-request: 1`.
- Assumir, devolver, responder, reiniciar memória e revisar a fila geram registros com usuário, horário e resultado. Mensagens enviadas pelo painel mostram o nome do autor. A aba Equipe mostra as últimas 100 ações; cada conversa mostra as últimas 20. Os registros completos permanecem no MongoDB, sem expiração automática.
- Uma ação pode permanecer como `iniciada` se o processo cair antes de registrar o resultado; confira o histórico antes de repeti-la. Mensagens enviadas diretamente pelo WhatsApp são identificadas como atendimento via WhatsApp, sem atribuição a uma conta individual do painel.
- As coleções `painel_usuarios`, `painel_sessoes`, `painel_login_tentativas` e `painel_auditoria` entram no backup do banco `agente`.

Se o administrador perder a senha, alguém com acesso local ao Docker pode recuperar o acesso usando a senha de configuração, sem exibi-la:

```powershell
docker compose exec -T agente node recuperar-admin.mjs
```

Esse comando revoga as sessões do administrador e exige uma nova senha pessoal no próximo login. Alterar `.env` ou reiniciar o serviço sozinho não redefine contas existentes.

Para usar Ollama, ele precisa estar disponível no computador em `http://host.docker.internal:11434`, com o modelo `qwen2.5:3b`, conforme o Compose.

## Atendimento humano e retomada

1. Abra o painel e selecione a conversa.
2. Clique em **Assumir a conversa** para pausar as respostas automáticas daquele contato.
3. Responda pelo painel. As mensagens entram no contexto do agente.
4. Clique em **Devolver para a agente** quando terminar.

O agente volta a responder na próxima mensagem do cliente. Devolver a conversa não gera uma resposta imediata às mensagens anteriores.

Enviar uma mensagem pelo painel sem assumir a conversa mantém o agente ativo. Mensagens enviadas diretamente pelo aplicativo WhatsApp pausam automaticamente a conversa e entram no contexto como atendimento humano. O painel identifica essas mensagens como "você · WhatsApp". Para retomar, use **Devolver ao agente**. Ecos dos envios do próprio agente e do painel são reconhecidos pelo ID e não acionam essa pausa. Eventos antigos anteriores à inicialização são ignorados para evitar pausas por sincronização de histórico.

## Manutenção

### Backup automático

A rotina em [BACKUPS.md](BACKUPS.md) prepara backups diários às 03:00, conserva 14 cópias verificadas e testa a restauração do MongoDB, PostgreSQL e arquivos da sessão em containers isolados. O instalador só registra a tarefa diária após o primeiro backup e teste passarem. Execute `scripts/Install-BackupSchedule.ps1` conforme a documentação; criar os scripts não ativa o agendamento.

### Alertas operacionais no painel

O topo do painel destaca alertas ativos e o botão **Ver alertas** abre os detalhes na aba Status:

- WhatsApp desconectado ou conexão que não pôde ser confirmada.
- Três ou mais chamadas da IA com falha final nos últimos 15 minutos. Tentativas recuperadas com sucesso e cancelamentos por atendimento humano não contam como falhas.
- Conversas com a última mensagem recebida há pelo menos 5 minutos sem resposta útil, incluindo atendimentos assumidos e mensagens ainda na fila. Apresentações automáticas e a resposta de problema técnico não encerram essa espera.
- Tarefas da fila que exigem revisão manual.

As conversas aguardando resposta têm atalhos para atendimento. Os avisos são recalculados durante a atualização do painel, aproximadamente a cada 5 segundos enquanto a página está visível. Falhas de comunicação com o servidor também são indicadas. Os eventos de falha da IA ficam no MongoDB por 7 dias; o alerta considera apenas os últimos 15 minutos e começa a registrar dados a partir desta implementação. Não são enviadas notificações externas.

Verificar os serviços e acompanhar os logs:

```powershell
docker compose ps
docker compose logs --tail 100 -f agente
```

Após alterar o código do agente, reconstruir e reiniciar apenas esse serviço:

```powershell
docker compose up -d --build --no-deps agente
```

Após alterar variáveis do `.env` usadas pelo agente, recriar o serviço para aplicar a configuração:

```powershell
docker compose up -d --no-deps agente
```

Os dados e a sessão do WhatsApp ficam em volumes Docker. Preserve esses volumes; `docker compose down -v` os remove.

## Limitação conhecida

### Fila persistente e duplicatas

As mensagens do webhook são gravadas no MongoDB antes da confirmação HTTP. A combinação de instância, contato, direção e ID da mensagem identifica cada evento: cópias recebidas novamente não criam outra execução.

A coleção `fila_mensagens` acompanha os estados `pendente`, `processando`, `concluida`, `revisao` e `revisada`. `fila_etapas` guarda resultados concluídos para reutilização. Após reiniciar o agente, trabalhos em processamento voltam à fila; etapas já concluídas não são repetidas. Falhas recuperáveis têm até três tentativas de processamento. As mensagens mantêm a ordem por contato, e intervenções humanas têm consumidor separado para não aguardar a IA.

Se uma interrupção deixar um envio ou outra ação com resultado incerto, a tarefa vai para revisão em vez de repetir o efeito. O painel mostra o aviso na conversa e os totais na aba Status. Confira o histórico, atenda manualmente se necessário e use **Marcar como revisada** para liberar as próximas mensagens. Esse botão não reenvia a tarefa anterior.

A implementação considera **um único container do agente**, como no Compose atual. Não execute réplicas simultâneas sem implementar coordenação entre consumidores. Os registros de deduplicação não expiram automaticamente; inclua essas coleções no backup. A fila não consegue garantir entrega única em uma falha entre a aceitação pelo WhatsApp e a gravação do resultado local: esse caso exige revisão. Se o MongoDB estiver indisponível, o webhook responde 503; a recuperação depende de o remetente repetir o evento.

Testes da fila usam um banco temporário isolado, sem enviar mensagens reais. O script `tests/fila-persistente.integration.mjs` verifica concorrência, duplicatas, recuperação, revisão e intervenção humana; `tests/confiabilidade.test.mjs` cobre limites da Groq e pausa do atendimento.

### Limites da Groq

A Groq pode recusar chamadas quando o limite da conta é atingido. Na verificação de 12/09/2026, os logs indicaram limite de 8.000 tokens por minuto e uma espera solicitada de aproximadamente 10 segundos.

O agente serializa as chamadas à Groq e faz até três novas tentativas para erros 429, respeitando Retry-After ou o tempo informado na mensagem de erro. Apenas a chamada à IA é repetida, sem executar novamente ferramentas já concluídas. O painel mostra fila, geração e espera. Uma espera superior a dois minutos encerra a tentativa; a indisponibilidade é mantida para evitar novas chamadas antes do prazo. Outros erros da Groq não são repetidos automaticamente. O temporizador da Groq é local ao processo; as mensagens e etapas concluídas ficam na fila persistente. Ao assumir a conversa, respostas da IA ainda em processamento são descartadas antes de novas ações ou envios; mensagens já enviadas não podem ser canceladas.
