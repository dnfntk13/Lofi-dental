$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = 'http://127.0.0.1:5175/health'

try {
  $health = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 1
  if ($health.StatusCode -eq 200) { exit 0 }
} catch {}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$agent = Join-Path $projectRoot 'tools\dentweb-sync-agent.mjs'
$logDir = Join-Path $projectRoot '.data'
$logFile = Join-Path $logDir 'dentweb-agent.log'
$errorLogFile = Join-Path $logDir 'dentweb-agent-error.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$arguments = '"{0}" --daemon' -f $agent
Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $errorLogFile
