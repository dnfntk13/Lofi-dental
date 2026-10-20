$ErrorActionPreference = 'Stop'
# Uses session-local temporary tables only. No clinic records are written.
$source = Get-Content (Join-Path $PSScriptRoot 'dentweb-sync-agent.mjs') -Raw -Encoding UTF8
$sql = [regex]::Match($source, '(?s)SET NOCOUNT ON;.*?(?=\r?\n''@)').Value
if (-not $sql) { throw 'Reservation SQL not found' }
foreach ($table in @('TB_환자정보', 'TB_예약목록', 'TB_신환예약자정보', 'TB_덴트웹설정')) {
  $sql = $sql.Replace("dbo.$table", "#$table")
}
if ($sql.Contains('dbo.')) { throw 'Test must not reference production tables' }
$connection = [Data.SqlClient.SqlConnection]::new($env:DENTWEB_SQL_CONNECTION_STRING)
$connection.Open()
function Exec([string]$text) {
  $cmd = $connection.CreateCommand(); $cmd.CommandText = $text
  try { [void]$cmd.ExecuteNonQuery() } finally { $cmd.Dispose() }
}
function Scalar([string]$text) {
  $cmd = $connection.CreateCommand(); $cmd.CommandText = $text
  try { return $cmd.ExecuteScalar() } finally { $cmd.Dispose() }
}
function Reserve([string]$name, [string]$phone, [string]$at, [int]$linked = 0, [string]$memo = 'New concern', $duration = $null, [bool]$cancel = $false) {
  $tx = $connection.BeginTransaction([Data.IsolationLevel]::Serializable)
  $cmd = $connection.CreateCommand(); $cmd.Transaction = $tx; $cmd.CommandText = $sql
  [void]$cmd.Parameters.Add('@name', [Data.SqlDbType]::NVarChar, 40)
  [void]$cmd.Parameters.Add('@phone', [Data.SqlDbType]::VarChar, 30)
  [void]$cmd.Parameters.Add('@appointmentAt', [Data.SqlDbType]::VarChar, 12)
  [void]$cmd.Parameters.Add('@createdAt', [Data.SqlDbType]::VarChar, 14)
  [void]$cmd.Parameters.Add('@memo', [Data.SqlDbType]::NVarChar, -1)
  [void]$cmd.Parameters.Add('@linkedReservationId', [Data.SqlDbType]::Int)
  [void]$cmd.Parameters.Add('@requestedDuration', [Data.SqlDbType]::Int)
  [void]$cmd.Parameters.Add('@cancel', [Data.SqlDbType]::Bit)
  $cmd.Parameters['@cancel'].Value = $cancel
  $cmd.Parameters['@requestedDuration'].Value = if ($null -eq $duration) { [DBNull]::Value } else { $duration }
  $cmd.Parameters['@name'].Value = $name; $cmd.Parameters['@phone'].Value = $phone
  $cmd.Parameters['@appointmentAt'].Value = $at; $cmd.Parameters['@createdAt'].Value = '20300101100000'
  $cmd.Parameters['@memo'].Value = $memo; $cmd.Parameters['@linkedReservationId'].Value = $linked
  try {
    $reader = $cmd.ExecuteReader()
    if (-not $reader.Read()) { throw 'Missing result' }
    $result = @{ id = $reader.GetInt32(0); duplicate = $reader.GetBoolean(1) }
    $reader.Close(); $tx.Commit(); return $result
  } catch { try { $tx.Rollback() } catch {}; throw }
  finally { $cmd.Dispose(); $tx.Dispose() }
}
function Assert($condition, [string]$message) { if (-not $condition) { throw $message } }
function MustReject([scriptblock]$action, [int]$number) {
  try { & $action | Out-Null } catch {
    $errorObject = $_.Exception
    while ($errorObject.InnerException) { $errorObject = $errorObject.InnerException }
    if ($errorObject.Number -eq $number) { return }
    throw
  }
  throw "Expected SQL rejection $number"
}
try {
  Exec @'
CREATE TABLE #TB_환자정보(n환자ID int, sz이름 nvarchar(40), sz휴대폰번호 varchar(30));
CREATE TABLE #TB_신환예약자정보(nID int IDENTITY, sz이름 nvarchar(40), sz휴대폰번호 varchar(30));
CREATE TABLE #TB_덴트웹설정(t예약최종수정 datetime);
CREATE TABLE #TB_예약목록(
 nID int IDENTITY PRIMARY KEY, sz예약시각 varchar(12), sz작성시각 varchar(14), n환자ID int,
 n소요시간 tinyint, n예약종류 tinyint, n이행현황 tinyint, n담당의사 int, n담당직원 int,
 n치식 bigint, n임플치식 bigint, sz예약내용 nvarchar(max), nSMS전송일 int, n글자색 int,
 n배경색 int, sz메모 nvarchar(max), nPMH int, x변경내역 varbinary(max), szN상품ID varchar(100),
 szN예약ID varchar(100), t최종수정 datetime, sz이름 nvarchar(40), sz전화 varchar(30));
INSERT #TB_환자정보 VALUES(17,N'기존환자','010-1111-2222');
INSERT #TB_신환예약자정보 VALUES(N'Template','010-9999-9999');
INSERT #TB_덴트웹설정 VALUES(GETDATE());
INSERT #TB_예약목록(sz예약시각,n환자ID,n소요시간,n예약종류,n이행현황,n담당의사,n담당직원,n글자색,n배경색,sz메모,sz이름,sz전화)
VALUES('202901011000',17,30,2,1,1,1,0,1,N'Important old note',N'Existing Patient','010-1111-2222'),
('202901011100',-1,20,1,0,1,1,0,1,N'Template',N'Template','010-9999-9999');
'@
  $new = Reserve 'Existing Patient' '01011112222' '203001021000'
  Assert (-not $new.duplicate) 'First appointment should be new'
  Assert ((Scalar "SELECT n환자ID FROM #TB_예약목록 WHERE nID=$($new.id)") -eq 17) 'Existing patient ID not preserved'
  Assert ((Scalar 'SELECT COUNT(*) FROM #TB_신환예약자정보') -eq 1) 'Duplicate patient created'
  Assert ((Scalar "SELECT n소요시간 FROM #TB_예약목록 WHERE nID=$($new.id)") -eq 30) 'Existing duration not retained'
  $retry = Reserve 'Existing Patient' '010-1111-2222' '203001021000'
  Assert ($retry.duplicate -and $retry.id -eq $new.id) 'Replay created duplicate'
  $moved = Reserve '기존환자' '010-1111-2222' '203001031000' $new.id 'Additional note'
  Assert ($moved.id -eq $new.id) 'Linked ID changed'
  Assert ((Scalar "SELECT sz메모 FROM #TB_예약목록 WHERE nID=$($new.id)") -eq "New concern`r`nAdditional note") 'Memo was lost'
  [void](Reserve '기존환자' '010-1111-2222' '203001031000' $new.id 'Additional note')
  Assert ((Scalar "SELECT sz메모 FROM #TB_예약목록 WHERE nID=$($new.id)") -eq "New concern`r`nAdditional note") 'Memo duplicated on replay'
  MustReject { Reserve 'Existing Patient' '010-1111-2222' '203001041000' 1 } 51002
  Assert ((Scalar 'SELECT sz메모 FROM #TB_예약목록 WHERE nID=1') -eq 'Important old note') 'Attended record changed'
  MustReject { Reserve 'Wrong Name' '010-1111-2222' '203001041000' } 51001
  MustReject { Reserve 'Existing Patient' '010-1111-2222' '202901011000' } 51005
  Exec "INSERT #TB_환자정보 VALUES(18,N'기존환자','010-1111-2222')"
  MustReject { Reserve '기존환자' '010-1111-2222' '203001041000' } 51001
  Exec 'DELETE #TB_환자정보 WHERE n환자ID=18'
  $fresh = Reserve 'New Patient' '010-3333-4444' '203001051000'
  Assert ((Scalar "SELECT n환자ID FROM #TB_예약목록 WHERE nID=$($fresh.id)") -lt 0) 'New patient path broken'
  MustReject { Reserve 'New Patient' '010-3333-4444' '203001061000' $new.id } 51003
  Assert ((Scalar 'SELECT COUNT(*) FROM #TB_예약목록') -eq 4) 'Unexpected reservation count'
  $long = Reserve '기존환자' '010-1111-2222' '203001071230' 0 '60 minute visit' 60
  Assert ((Scalar "SELECT n소요시간 FROM #TB_예약목록 WHERE nID=$($long.id)") -eq 60) 'Explicit 60 minutes lost'
  $retryLong = Reserve '기존환자' '010-1111-2222' '203001071230' 0 '60 minute visit' 60
  Assert ($retryLong.id -eq $long.id -and $retryLong.duplicate) '60 minute retry duplicated'
  MustReject { Reserve '기존환자' '010-1111-2222' '203001071230' 0 'wrong duration' 30 } 51007
  [void](Reserve '기존환자' '010-1111-2222' '203001081230' $long.id 'Moved')
  Assert ((Scalar "SELECT n소요시간 FROM #TB_예약목록 WHERE nID=$($long.id)") -eq 60) 'Omitted duration reset linked appointment'
  [void](Reserve '기존환자' '010-1111-2222' '203001081230' $long.id 'Moved' 90)
  Assert ((Scalar "SELECT n소요시간 FROM #TB_예약목록 WHERE nID=$($long.id)") -eq 90) 'Linked duration update failed'
  MustReject { Reserve '기존환자' '010-1111-2222' '203001091230' 0 'Invalid' 0 } 51006
  MustReject { Reserve '기존환자' '010-1111-2222' '203001091230' 0 'Invalid' 256 } 51006
  $newLong = Reserve 'New Long Patient' '010-5555-6666' '203001091230' 0 '60 minute visit' 60
  Assert ((Scalar "SELECT n소요시간 FROM #TB_예약목록 WHERE nID=$($newLong.id)") -eq 60) 'New patient duration failed'
  Assert ((Scalar 'SELECT COUNT(*) FROM #TB_예약목록') -eq 6) 'Duration checks created duplicate records'
  MustReject { Reserve 'New Patient' '010-3333-4444' '203001051000' 0 '' $null $true } 51008
  MustReject { Reserve 'Wrong Name' '010-3333-4444' '203001051000' $fresh.id '' $null $true } 51009
  MustReject { Reserve 'New Patient' '010-3333-4444' '203001061000' $fresh.id '' $null $true } 51009
  MustReject { Reserve 'Existing Patient' '010-1111-2222' '202901011000' 1 '' $null $true } 51009
  $memoBefore = Scalar "SELECT sz메모 FROM #TB_예약목록 WHERE nID=$($fresh.id)"
  [void](Reserve 'New Patient' '010-3333-4444' '203001051000' $fresh.id '' $null $true)
  Assert ((Scalar "SELECT n이행현황 FROM #TB_예약목록 WHERE nID=$($fresh.id)") -eq 2) 'Cancellation not saved'
  Assert ((Scalar "SELECT sz메모 FROM #TB_예약목록 WHERE nID=$($fresh.id)") -eq $memoBefore) 'Cancellation lost notes'
  [void](Reserve 'New Patient' '010-3333-4444' '203001051000' $fresh.id '' $null $true)
  Assert ((Scalar 'SELECT COUNT(*) FROM #TB_예약목록') -eq 6) 'Cancellation/retry deleted or inserted records'
  Write-Output 'PASS: linked cancellation, idempotent retry, notes preserved, missing/changed/attended reservation rejection.'
  Write-Output 'PASS: explicit 60 minutes for existing/new patients, linked duration update, omitted duration preserved, retry, mismatch/invalid rejection.'
  Write-Output 'PASS: alias identity, existing ID/duration, replay, linked update/memo, attended guard, mismatch/ambiguity, closed duplicate, new patient, wrong linked identity.'
} finally { $connection.Dispose() }
