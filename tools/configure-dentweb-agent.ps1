$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start-dentweb-agent.ps1'

$secureConnectionString = Read-Host 'Paste the DentWeb SQL connection string' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConnectionString)
$connectionString = $null
$connection = $null

try {
  $connectionString = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($connectionString)) {
    throw 'The DentWeb SQL connection string is empty.'
  }

  $connection = [Data.SqlClient.SqlConnection]::new($connectionString)
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = "SELECT CASE WHEN OBJECT_ID(N'dbo.TB_예약목록', N'U') IS NULL THEN 0 ELSE 1 END"
  if ([int]$command.ExecuteScalar() -ne 1) {
    throw 'The connection succeeded, but the DentWeb reservation table was not found.'
  }

  [Environment]::SetEnvironmentVariable('DENTWEB_SQL_CONNECTION_STRING', $connectionString, 'User')
  $env:DENTWEB_SQL_CONNECTION_STRING = $connectionString

  $listener = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process.CommandLine -like '*dentweb-sync-agent.mjs*') {
      Stop-Process -Id $listener.OwningProcess -Force
    }
  }

  & $launcher
  Write-Output 'DentWeb SQL connection verified. The agent was restarted and will process queued reservations.'
} finally {
  if ($connection) { $connection.Dispose() }
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $connectionString = $null
}