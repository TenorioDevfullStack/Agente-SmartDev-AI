param([ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')][string]$Time = '03:00')
. "$PSScriptRoot/Backup.Common.ps1"
# Não habilite uma rotina que nunca conseguiu fazer e restaurar um backup.
& "$PSScriptRoot/Backup.ps1"
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$script = Join-Path $PSScriptRoot 'Backup.ps1'
$action = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '"') -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'SmartDevAI-Backup-Diario' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Backup diário com restauração isolada e retenção de 14 cópias verificadas.' -Force | Out-Null
Write-Output "Backup diário agendado para $Time. Requer usuário conectado e Docker Desktop ativo."
