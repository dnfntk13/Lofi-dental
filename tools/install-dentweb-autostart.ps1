$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start-dentweb-agent-hidden.vbs'
if (-not (Test-Path -LiteralPath $launcher)) { throw 'Dentweb launcher is missing.' }
$taskUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('//B //NoLogo "{0}"' -f $launcher)
$login = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Lofi Dentweb AutoStart' -Action $action -Trigger @($login, $watchdog) -Principal $principal -Settings $settings -Description 'Start the Lofi Dentweb queue agent at login and recover it every minute.' -Force | Out-Null
Start-ScheduledTask -TaskName 'Lofi Dentweb AutoStart'
Write-Output 'Dentweb automatic start and one-minute recovery installed for the current Windows user.'
