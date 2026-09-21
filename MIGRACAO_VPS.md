# Migração para a VPS Hostinger

## Situação confirmada pelo usuário

VPS `2.25.198.132`, hostname `srv1978584`, Ubuntu 26.04.1 LTS, 7,7 GiB de RAM, cerca de 94 GB livres. Docker 29.8.0 e Compose 5.5.1 instalados; Docker ativo e habilitado no boot, sem containers na captura enviada. Essas informações foram lidas das telas compartilhadas; não há sessão SSH do assistente na VPS.

Prospecção está em pausa como prioridade de trabalho. Migrar o atendimento existente, preservando banco, contas, histórico e sessão. Não iniciar campanhas.

## Preparação local

`scripts/Preparar-PacoteVps.ps1` gera `migracao/smartdev-vps.tar.gz` com código, proxy, configuração VPS e este guia. Exclui dependências locais, credenciais e dados. O `.env` deve ser transferido separadamente via SCP; nunca colar seu conteúdo no chat.

`docker-compose.vps.yml` é independente do Compose local. Usar `docker compose -f docker-compose.vps.yml` na VPS. A porta 8080 e o painel 3000 estão vinculados a 127.0.0.1; bancos não publicam portas; o painel usa o Cloudflare Tunnel existente. Consultas de saúde controlam a ordem de inicialização. A configuração usa Groq e não contém Whisper ou dependência do computador Windows. Há rotação de logs e prazo de 120 segundos para encerrar o agente.

A [documentação Docker](https://docs.docker.com/engine/network/port-publishing/) explica a restrição de portas ao localhost, e a [ordem de inicialização](https://docs.docker.com/compose/how-tos/startup-order/) explica a espera pela saúde das dependências.

O PostgreSQL mantém nesta etapa as credenciais internas da configuração existente, em rede Docker sem porta publicada. Rever credenciais internas depois da restauração, de forma coordenada entre banco e Evolution. Não expor a porta 5432.

## Transferência inicial — ainda sem ativar

Na VPS:

```bash
install -d -m 700 /opt/smartdev
```

Em outra janela do PowerShell do computador local:

```powershell
scp "E:\agente\migracao\smartdev-vps.tar.gz" "E:\agente\.env" root@2.25.198.132:/opt/smartdev/
```

Na VPS:

```bash
cd /opt/smartdev
chmod 600 .env
tar -xzf smartdev-vps.tar.gz
docker compose -f docker-compose.vps.yml config --quiet
```

`config --quiet` valida sem imprimir credenciais; não inicia containers. Só prosseguir se não houver erro.

## Etapas seguintes — pendentes

O usuário confirmou a transferência inicial, extração e validação silenciosa da configuração. Próximo passo remoto: baixar imagens com `docker compose -f docker-compose.vps.yml pull mongo postgres redis evolution-api cloudflared` e construir com `docker compose -f docker-compose.vps.yml build`. Esses comandos não ativam o atendimento.

1. Confirmar transferência e configuração. Preparar imagens e verificar SSH/firewall sem perder acesso.
2. Capturar e testar um backup para ensaio de restauração, com MongoDB (`agente`), PostgreSQL (`evolution`) e volume de sessão. O backup Windows atual guarda `.env` em DPAPI; isso NÃO é portável para Linux, por isso o `.env` vai por SCP.
3. Restaurar em volumes novos da VPS e validar contagens/hash antes de ligar Evolution, agente ou túnel. Não usar `up -d` de todos os serviços em banco vazio.
4. Combinar a virada: suspender qualquer agendamento local que possa reativar os produtores; encerrar agente e Evolution localmente e parar o túnel local. Fazer o backup final com produtores parados e mantê-los parados, transferir e restaurar o estado final. O script Windows de backup atual retoma os produtores automaticamente e não deve ser usado sem adaptação como única etapa da virada final.
5. Só então ativar a instalação VPS. Não executar duas sessões Evolution do mesmo WhatsApp nem dois túneis para origens com dados divergentes ao mesmo tempo. Conferir a instância e o webhook interno `http://agente:3000/webhook`; pode ser necessário ler o QR novamente.
6. Testar painel, atendimento, intervenção humana, persistência e reinício da VPS. Healthcheck detecta falhas, mas por si só não reinicia um container unhealthy; não confundir com recuperação completa.
7. Instalar e testar backups Linux com destino externo e alertas. Só concluir a migração 24x7 após essas validações.

Preservar a instalação e os volumes locais para retorno. Se a VPS já tiver recebido novas mensagens, planejar sincronização antes de voltar à origem antiga. Nunca executar `docker compose down -v` durante a migração.

## Áudio

Transcrição removida do código e dos arquivos Compose preparados. Áudio recebido aparece no histórico como mídia sem transcrição; quando o agente está ativo, solicita mensagem por texto. Se a conversa está assumida, não responde automaticamente. Áudio humano no WhatsApp continua pausando a conversa, sem download ou transcrição. Essa mudança só entra em operação onde a imagem for reconstruída; a instância local em execução não foi atualizada nesta preparação.
