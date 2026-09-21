$ErrorActionPreference = 'Stop'
$raizProjeto = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destino = Join-Path $raizProjeto 'migracao'
New-Item -ItemType Directory -Force -Path $destino | Out-Null
$pacote = Join-Path $destino 'smartdev-vps.tar.gz'
# Lista explícita: segredos e bancos são transferidos separadamente por SSH.
$itens = @('agente', 'caddy', 'docker-compose.vps.yml', '.env.example', 'MIGRACAO_VPS.md')
foreach ($item in $itens) {
    if (-not (Test-Path -LiteralPath (Join-Path $raizProjeto $item))) { throw "Arquivo necessário ausente: $item" }
}
& tar -czf $pacote --exclude=node_modules --exclude=.env --exclude='*.log' --exclude='*.dpapi' -C $raizProjeto @itens
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar pacote.' }
$conteudo = @(& tar -tzf $pacote)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao conferir pacote.' }
if ($conteudo | Where-Object { $_ -match '(^|/)(node_modules|\.env)(/|$)|\.dpapi$' }) { throw 'Pacote contém um arquivo que deveria estar excluído.' }
Write-Output "Pacote preparado: $pacote"
Write-Output "Tamanho: $((Get-Item -LiteralPath $pacote).Length) bytes"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $pacote -Algorithm SHA256).Hash)"
Write-Output 'Não inclui credenciais, bancos ou sessão do WhatsApp. Nenhum serviço foi iniciado ou parado.'
