# Backups da SmartDev AI

## O que a rotina faz

`scripts/Backup.ps1` cria uma cópia em `backups/`, valida os hashes SHA-256 e restaura os bancos em containers temporários sem rede externa, portas publicadas ou volumes de produção. O agente e a Evolution API não são iniciados nesses testes: nenhuma mensagem é enviada ao WhatsApp.

A rotina pausa brevemente o agente e a Evolution API durante a captura, retomando ambos mesmo se o dump falhar. O agente atualizado aguarda até 90 segundos pelas tarefas em andamento antes de encerrar. Os bancos e a sessão são copiados com os produtores de mensagens parados; os demais serviços continuam ativos. O teste de restauração ocorre depois da retomada do atendimento.

Cada cópia contém:

| Arquivo | Conteúdo |
| --- | --- |
| `mongo.archive.gz` | Banco `agente`, incluindo conversas, leads, agendamentos, fila, etapas e registros operacionais |
| `postgres.dump` | Banco `evolution` em formato de restauração do PostgreSQL |
| `whatsapp-session.tar.gz` | Arquivos do volume da sessão do WhatsApp |
| `project.zip` | Código do agente, proxy, scripts, Compose, documentação e modelo de configuração |
| `env.dpapi` | `.env` protegido pelo Windows, quando esse arquivo existe |
| `manifest.json` | Versão do formato, hashes, imagens e quantidades de documentos e registros |
| `restore-test.json` | Resultado do teste de restauração |

Redis é usado como cache; seus dados não entram nesta cópia. O cache de modelos do Whisper também pode ser reconstruído.

## Ativar

Requisitos: Windows PowerShell 5.1, Docker Desktop ativo, serviços do projeto em execução e espaço livre para os dumps e os bancos temporários. Atualize primeiro o agente para aplicar o encerramento com espera:

```powershell
docker compose up -d --build --no-deps agente
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-BackupSchedule.ps1
```

O instalador **executa e testa um backup antes de registrar o agendamento**. Se houver falha, a rotina diária não é habilitada. A tarefa `SmartDevAI-Backup-Diario` roda diariamente às **03:00**, conserva **14 cópias verificadas** e impede execuções simultâneas. Para outro horário:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-BackupSchedule.ps1 -Time 04:30
```

A tarefa usa o usuário Windows conectado, sem armazenar sua senha. O computador precisa estar ligado, o usuário conectado e o Docker Desktop ativo. O Agendador tenta executar uma tarefa atrasada quando ela se torna disponível; não há garantia de execução enquanto o computador estiver desligado.

## Executar e conferir

Backup manual, com teste de restauração incluído:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Backup.ps1
Get-Content .\backups\last-run.json
Get-ScheduledTaskInfo -TaskName SmartDevAI-Backup-Diario
```

Repetir o teste de uma cópia específica:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-Restore.ps1 -BackupPath .\backups\backup-AAAAMMDD-HHMMSS-identificador
```

O teste restaura os dois bancos e compara o número de registros de cada tabela e coleção com o manifesto. Também verifica os hashes dos arquivos, a extração da sessão, a presença do Compose no ZIP e a descriptografia do `.env` sem exibir seu conteúdo. Ele não testa a reconexão real da sessão ao WhatsApp.

Cópias incompletas ficam com sufixo `.inprogress` para investigação e não contam na retenção. Somente após a restauração passar, a cópia recebe seu nome definitivo e as cópias antigas excedentes são removidas. `last-run.json` registra sucesso ou falha; não considere uma pasta incompleta como backup verificado.

## Proteção e recuperação

A pasta tem permissões restritas ao usuário que executa a rotina e ao sistema Windows. Os dumps dos bancos e o arquivo da sessão não são criptografados; mantenha essa restrição ao copiá-los para outro destino. O `.env` usa DPAPI e só pode ser descriptografado pelo contexto Windows original. Em outro computador, pode ser necessário recriar as credenciais a partir de `.env.example` e dos provedores.

As imagens usadas no teste são identificadas pelo ID local e registradas no manifesto, junto aos nomes originais. Preserve essas imagens para repetir o teste exatamente; após removê-las do Docker será necessário recuperá-las ou preparar versões compatíveis. A restauração de produção é uma operação separada: pare os produtores, preserve os volumes atuais e restaure os dumps e a sessão em volumes novos antes de reconectar o WhatsApp. `Test-Restore.ps1` nunca sobrescreve os bancos de produção.

As cópias ficam no mesmo disco do projeto. Para proteção contra perda desse disco, mantenha também uma cópia em outro dispositivo ou armazenamento externo. Nenhum destino externo é configurado automaticamente.
