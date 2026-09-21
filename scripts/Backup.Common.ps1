$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Invoke-Docker {
    # Sem parâmetros nomeados: opções nativas como -d não podem ser
    # interpretadas como abreviações de parâmetros do PowerShell.
    $DockerArgs = @($args)
    $previous = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; $result = & docker @DockerArgs 2>&1; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "Docker falhou: $($DockerArgs[0]) $($DockerArgs[1]). $($result -join ' ')" }
    return $result
}

function Get-ServiceContainer([string]$Service) {
    $id = Invoke-Docker compose --project-directory $ProjectRoot ps -q $Service
    if (-not $id) { throw "O serviço $Service precisa estar rodando." }
    return "$id".Trim()
}

function Assert-ChildPath([string]$Path, [string]$Root) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw "Caminho fora do diretório permitido: $resolved" }
    return $resolved
}

function Set-PrivateDirectory([string]$Path) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [IO.Directory]::GetAccessControl($Path, [Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
    foreach ($sid in @($identity, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    [IO.Directory]::SetAccessControl($Path, $acl)
}

function Get-MongoCounts([string]$Container) {
    $js = 'const d=db.getSiblingDB("agente"); print(JSON.stringify(Object.fromEntries(d.getCollectionNames().sort().map(n=>[n,d.getCollection(n).countDocuments({})]))));'
    $result = $js | & docker exec -i $Container mongosh --quiet --file /dev/stdin 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao contar documentos do MongoDB.' }
    # mongosh em stdin pode imprimir o prompt; eval via arquivo evita ambiguidade.
    $linha = @($result | ForEach-Object { "$_" } | Where-Object { $_ -match '\{.*\}' })[-1]
    if (-not $linha) { throw 'Contagens do MongoDB ausentes.' }
    $json = $linha.Substring($linha.IndexOf('{'))
    return ($json | ConvertFrom-Json)
}

function Get-PostgresCounts([string]$Container) {
    $sql = @'
SELECT COALESCE(jsonb_object_agg(schemaname || '.' || tablename,
  (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint), '{}'::jsonb)::text
FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
'@
    $result = $sql | & docker exec -i $Container psql -U postgres -d evolution -t -A 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao contar registros do PostgreSQL.' }
    return (($result -join '') | ConvertFrom-Json)
}

function Compare-Counts($Expected, $Actual, [string]$Label) {
    $expectedNames = @($Expected.PSObject.Properties.Name | Sort-Object)
    $actualNames = @($Actual.PSObject.Properties.Name | Sort-Object)
    if (($expectedNames -join '|') -ne ($actualNames -join '|')) { throw "Coleções/tabelas diferentes em $Label." }
    foreach ($name in $expectedNames) {
        if ([long]$Expected.$name -ne [long]$Actual.$name) { throw "Quantidade de registros diferente em $Label / $name." }
    }
}
