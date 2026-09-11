$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start-dentweb-agent.ps1'
if (-not (Test-Path $launcher)) { throw "Dentweb agent launcher not found: $launcher" }

$protocolKey = 'HKCU:\Software\Classes\lofi-dentweb-agent'
New-Item -Path $protocolKey -Force | Out-Null
Set-Item -Path $protocolKey -Value 'URL:Lofi Dentweb Agent Protocol'
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $launcher
Set-Item -Path "$protocolKey\shell\open\command" -Value $command
Write-Output 'Registered lofi-dentweb-agent:// for the current Windows user.'
