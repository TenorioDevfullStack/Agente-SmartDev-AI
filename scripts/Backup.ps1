param([ValidateRange(2, 365)][int]$Keep = 14, [switch]$ForVpsCutover)
. "$PSScriptRoot/Backup.Common.ps1"
$root = Join-Path $ProjectRoot 'backups'
New-Item -ItemType Directory -Force -Path $root | Out-Null
Set-PrivateDirectory $root
$lock = [IO.File]::Open((Join-Path $root '.backup.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$name = 'backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$work = Assert-ChildPath (Join-Path $root ($name + '.inprogress')) $root
$final = Assert-ChildPath (Join-Path $root $name) $root
$tempMongo = '/tmp/smartdev-' + [Guid]::NewGuid().ToString('N') + '.archive.gz'
$tempPg = '/tmp/smartdev-' + [Guid]::NewGuid().ToString('N') + '.dump'
$stopped = @()
$mongo = $null; $postgres = $null
try {
    New-Item -ItemType Directory -Path $work | Out-Null
    Write-Output 'Preparando backup e pausando os produtores de mensagens...'
    $mongo = Get-ServiceContainer 'mongo'
    $postgres = Get-ServiceContainer 'postgres'
    $agente = Get-ServiceContainer 'agente'
    $evolution = Get-ServiceContainer 'evolution-api'
    $mongoInfo = (Invoke-Docker inspect $mongo | ConvertFrom-Json)[0]
    $pgInfo = (Invoke-Docker inspect $postgres | ConvertFrom-Json)[0]
    $agentInfo = (Invoke-Docker inspect $agente | ConvertFrom-Json)[0]
    $evoInfo = (Invoke-Docker inspect $evolution | ConvertFrom-Json)[0]
    $volume = @($evoInfo.Mounts | Where-Object Destination -eq '/evolution/instances')[0]
    if ($volume.Type -ne 'volume' -or -not $volume.Name) { throw 'Volume da sessão do WhatsApp não identificado.' }
    if ($ForVpsCutover) {
        Invoke-Docker compose --project-directory $ProjectRoot stop -t 30 cloudflared | Out-Null
    }
    # Pare o produtor de novas respostas primeiro; a Evolution fica disponível
    # para o agente concluir envios em andamento durante o encerramento.
    $stopped += 'agente'
    Invoke-Docker compose --project-directory $ProjectRoot stop -t 120 agente | Out-Null
    $stopped += 'evolution-api'
    Invoke-Docker compose --project-directory $ProjectRoot stop -t 30 evolution-api | Out-Null
    try {
        Invoke-Docker exec $mongo mongodump --db=agente --gzip "--archive=$tempMongo" | Out-Null
        Invoke-Docker exec $postgres pg_dump -U postgres -d evolution --format=custom "--file=$tempPg" | Out-Null
        Invoke-Docker cp "${mongo}:$tempMongo" (Join-Path $work 'mongo.archive.gz') | Out-Null
        Invoke-Docker cp "${postgres}:$tempPg" (Join-Path $work 'postgres.dump') | Out-Null
        $sessionHelper = 'smartdev-backup-session-' + [Guid]::NewGuid().ToString('N')
        try {
            Invoke-Docker create --name $sessionHelper --network none --mount "type=volume,source=$($volume.Name),target=/source,readonly" --entrypoint tar $agentInfo.Image -czf /tmp/whatsapp-session.tar.gz -C /source . | Out-Null
            Invoke-Docker start -a $sessionHelper | Out-Null
            $sessionExit = Invoke-Docker inspect --format '{{.State.ExitCode}}' $sessionHelper
            if ([int]$sessionExit -ne 0) { throw 'Falha ao arquivar a sessão do WhatsApp.' }
            Invoke-Docker cp "${sessionHelper}:/tmp/whatsapp-session.tar.gz" (Join-Path $work 'whatsapp-session.tar.gz') | Out-Null
        } finally {
            Invoke-Docker rm -f -v $sessionHelper | Out-Null
        }
        $counts = @{ mongo = (Get-MongoCounts $mongo); postgres = (Get-PostgresCounts $postgres) }
    } finally {
        # Retome os serviços mesmo se o dump falhar.
        if (-not $ForVpsCutover) {
            Invoke-Docker compose --project-directory $ProjectRoot start evolution-api agente | Out-Null
            $stopped = @()
            Write-Output 'Captura concluída; agente e Evolution retomados.'
        } else {
            Write-Output 'Modo migração: agente, Evolution e túnel permanecem parados, inclusive em caso de falha.'
        }
    }
    $stage = Join-Path $work 'project'
    New-Item -ItemType Directory -Path $stage | Out-Null
    foreach ($item in @('agente', 'caddy', 'scripts', 'docker-compose.yml', '.env.example', 'README.md')) {
        Copy-Item -LiteralPath (Join-Path $ProjectRoot $item) -Destination $stage -Recurse
    }
    # .env nunca entra no ZIP em texto aberto.
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot '.env')) {
        Add-Type -AssemblyName System.Security
        $plain = [IO.File]::ReadAllBytes((Join-Path $ProjectRoot '.env'))
        try {
            $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
            [IO.File]::WriteAllBytes((Join-Path $work 'env.dpapi'), $encrypted)
        } finally { [Array]::Clear($plain, 0, $plain.Length) }
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, (Join-Path $work 'project.zip'))
    $safeStage = Assert-ChildPath $stage $work
    Remove-Item -LiteralPath $safeStage -Recurse -Force
    $files = @(Get-ChildItem -LiteralPath $work -File | ForEach-Object { @{ name = $_.Name; bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })
    $manifest = @{
        formatVersion = 1; createdAt = (Get-Date).ToUniversalTime().ToString('o'); status = 'created'
        counts = $counts; files = $files
        images = @{ mongo = $mongoInfo.Image; postgres = $pgInfo.Image; helper = $agentInfo.Image }
        imageNames = @{ mongo = $mongoInfo.Config.Image; postgres = $pgInfo.Config.Image; helper = $agentInfo.Config.Image }
    }
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $work 'manifest.json') -Encoding UTF8
    Write-Output 'Validando restauração em bancos isolados...'
    & "$PSScriptRoot/Test-Restore.ps1" -BackupPath $work
    $manifest.status = 'verified'
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $work 'manifest.json') -Encoding UTF8
    Move-Item -LiteralPath (Assert-ChildPath $work $root) -Destination (Assert-ChildPath $final $root)
    @{ status = 'success'; finishedAt = (Get-Date).ToUniversalTime().ToString('o'); backup = $name } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'last-run.json') -Encoding UTF8
    # Só backups completos e verificados participam da retenção.
    $valid = @(Get-ChildItem -LiteralPath $root -Directory | Where-Object {
        $_.Name -match '^backup-\d{8}-\d{6}-[a-f0-9]{8}$' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'restore-test.json'))
    } | Sort-Object Name -Descending)
    foreach ($old in @($valid | Select-Object -Skip $Keep)) {
        Remove-Item -LiteralPath (Assert-ChildPath $old.FullName $root) -Recurse -Force
    }
    Write-Output "Backup concluído e restauração verificada: $final"
} catch {
    @{ status = 'failed'; finishedAt = (Get-Date).ToUniversalTime().ToString('o'); backup = $name; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'last-run.json') -Encoding UTF8
    throw
} finally {
    try {
        if ($stopped.Count -and -not $ForVpsCutover) { Invoke-Docker compose --project-directory $ProjectRoot start @stopped | Out-Null }
        if ($mongo) { Invoke-Docker exec $mongo rm -f $tempMongo | Out-Null }
        if ($postgres) { Invoke-Docker exec $postgres rm -f $tempPg | Out-Null }
    } finally { $lock.Dispose() }
}
