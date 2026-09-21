param([Parameter(Mandatory = $true)][string]$BackupPath)
. "$PSScriptRoot/Backup.Common.ps1"
$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$manifest = Get-Content -LiteralPath (Join-Path $BackupPath 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.formatVersion -ne 1) { throw 'Formato de backup não suportado.' }
foreach ($file in $manifest.files) {
    $target = Assert-ChildPath (Join-Path $BackupPath $file.name) $BackupPath
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $file.sha256) { throw "Backup alterado ou corrompido: $($file.name)" }
}

$suffix = [Guid]::NewGuid().ToString('N')
$mongoTest = "smartdev-restore-mongo-$suffix"
$postgresTest = "smartdev-restore-postgres-$suffix"
$filesTest = "smartdev-restore-files-$suffix"
$created = @()
try {
    # Sem rede externa, sem portas publicadas, sem volumes de produção.
    Invoke-Docker run -d --name $mongoTest --network none $manifest.images.mongo --setParameter ttlMonitorEnabled=false | Out-Null
    $created += $mongoTest
    Invoke-Docker run -d --name $postgresTest --network none --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=evolution $manifest.images.postgres | Out-Null
    $created += $postgresTest
    Invoke-Docker exec $mongoTest mkdir /backup | Out-Null
    Invoke-Docker exec $postgresTest mkdir /backup | Out-Null
    Invoke-Docker cp (Join-Path $BackupPath 'mongo.archive.gz') "${mongoTest}:/backup/mongo.archive.gz" | Out-Null
    Invoke-Docker cp (Join-Path $BackupPath 'postgres.dump') "${postgresTest}:/backup/postgres.dump" | Out-Null
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & docker exec $mongoTest mongosh --quiet --eval 'db.runCommand({ping:1}).ok' *> $null
            $mongoReady = $LASTEXITCODE -eq 0
            & docker exec $postgresTest pg_isready -U postgres -d evolution *> $null
            $postgresReady = $LASTEXITCODE -eq 0
        } finally { $ErrorActionPreference = $previous }
        if ($mongoReady -and $postgresReady) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Os bancos de teste não ficaram disponíveis.' }
    Invoke-Docker exec $mongoTest mongorestore --gzip --archive=/backup/mongo.archive.gz --nsInclude=agente.* | Out-Null
    Invoke-Docker exec $postgresTest pg_restore --exit-on-error --no-owner -U postgres -d evolution /backup/postgres.dump | Out-Null
    Compare-Counts $manifest.counts.mongo (Get-MongoCounts $mongoTest) 'MongoDB'
    Compare-Counts $manifest.counts.postgres (Get-PostgresCounts $postgresTest) 'PostgreSQL'

    # Extração da sessão apenas no filesystem de um container temporário.
    Invoke-Docker run -d --name $filesTest --network none --entrypoint sleep $manifest.images.helper 300 | Out-Null
    $created += $filesTest
    Invoke-Docker exec $filesTest mkdir /backup | Out-Null
    Invoke-Docker cp (Join-Path $BackupPath 'whatsapp-session.tar.gz') "${filesTest}:/backup/whatsapp-session.tar.gz" | Out-Null
    Invoke-Docker exec $filesTest mkdir /restore | Out-Null
    Invoke-Docker exec $filesTest tar -xzf /backup/whatsapp-session.tar.gz -C /restore | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $BackupPath 'project.zip'))
    try {
        if (-not ($zip.Entries | Where-Object FullName -eq 'docker-compose.yml')) { throw 'Configuração ausente no arquivo do projeto.' }
    } finally { $zip.Dispose() }
    if (Test-Path -LiteralPath (Join-Path $BackupPath 'env.dpapi')) {
        Add-Type -AssemblyName System.Security
        $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $BackupPath 'env.dpapi')), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Array]::Clear($plain, 0, $plain.Length)
    }
    $result = @{ testedAt = (Get-Date).ToUniversalTime().ToString('o'); status = 'passed'; databases = 'restored-and-counted'; session = 'extracted'; productionModified = $false }
    $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $BackupPath 'restore-test.json') -Encoding UTF8
    Write-Output 'Restauração validada em bancos isolados; contagens conferidas e sessão extraída.'
} finally {
    foreach ($container in $created) {
        if ($container -notmatch '^smartdev-restore-(mongo|postgres|files)-[a-f0-9]{32}$') { throw 'Nome de container temporário inválido.' }
        Invoke-Docker rm -f -v $container | Out-Null
    }
}
