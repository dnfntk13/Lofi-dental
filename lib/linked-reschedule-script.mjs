// Executed only by the existing clinic integration agent, never by the web server.
export const linkedRescheduleScript = String.raw`
$ErrorActionPreference = 'Stop'
$job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DENTWEB_JOB_BASE64)) | ConvertFrom-Json
$e = $job.reschedule.expected
$target = ([string]$job.reschedule.target.date).Replace('-','') + ([string]$job.reschedule.target.time).Replace(':','')
$oldAt = ([string]$e.date).Replace('-','') + ([string]$e.time).Replace(':','')
function MemoDigest($memo) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$memo)))).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose() }
}
$connection = [Data.SqlClient.SqlConnection]::new($env:DENTWEB_SQL_CONNECTION_STRING)
$connection.Open()
$transaction = $connection.BeginTransaction([Data.IsolationLevel]::Serializable)
function ReadReservation($locked) {
  $cmd = $connection.CreateCommand()
  if ($locked) { $cmd.Transaction = $transaction }
  $hint = if ($locked) { ' WITH (UPDLOCK,HOLDLOCK)' } else { '' }
  $cmd.CommandText = 'SELECT a.nID,a.n환자ID,a.sz예약시각,a.n이행현황,a.n소요시간,a.sz메모,CASE WHEN a.n환자ID>0 THEN p.sz이름 ELSE n.sz이름 END,CASE WHEN a.n환자ID>0 THEN p.sz휴대폰번호 ELSE n.sz휴대폰번호 END FROM dbo.TB_예약목록 a' + $hint + ' LEFT JOIN dbo.TB_환자정보 p ON a.n환자ID>0 AND p.n환자ID=a.n환자ID LEFT JOIN dbo.TB_신환예약자정보 n ON a.n환자ID<0 AND n.nID=-a.n환자ID WHERE a.nID=@id'
  [void]$cmd.Parameters.Add('@id',[Data.SqlDbType]::Int)
  $cmd.Parameters['@id'].Value = [int]$e.reservationId
  $r = $cmd.ExecuteReader()
  try {
    if (-not $r.Read()) { throw 'Linked reservation no longer exists' }
    return [pscustomobject]@{ reservationId=[int]$r[0]; patientId=[int]$r[1]; appointmentAt=[string]$r[2]; state=[int]$r[3]; durationMinutes=[int]$r[4]; memoSha256=(MemoDigest ([string]$r[5])); name=([string]$r[6]).Trim(); phone=[string]$r[7] }
  } finally { $r.Close(); $cmd.Dispose() }
}
function AssertIdentity($row) {
  if ($row.reservationId -ne [int]$e.reservationId -or $row.patientId -ne [int]$e.patientId -or $row.state -ne 0 -or
    $row.durationMinutes -ne [int]$e.durationMinutes -or $row.memoSha256 -cne [string]$e.memoSha256 -or
    $row.name -cne [string]$e.name -or $row.phone -cne [string]$e.phone) { throw 'Native identity, state, duration or memo changed; review required' }
}
try {
  $before = ReadReservation $true
  AssertIdentity $before
  if ($before.appointmentAt -ne $oldAt -and $before.appointmentAt -ne $target) { throw 'Native appointment time changed; review required' }
  $cmd = $connection.CreateCommand()
  $cmd.Transaction = $transaction
  $cmd.CommandText = @'
SET NOCOUNT ON;
IF EXISTS (
 SELECT 1 FROM dbo.TB_예약목록 WITH (UPDLOCK,HOLDLOCK)
 WHERE nID<>@id AND n환자ID=@patient AND n이행현황=0
 AND (n소요시간 IS NULL OR n소요시간<1 OR LEN(sz예약시각)<>12 OR TRY_CONVERT(datetime2,
   SUBSTRING(sz예약시각,1,4)+'-'+SUBSTRING(sz예약시각,5,2)+'-'+SUBSTRING(sz예약시각,7,2)+'T'+SUBSTRING(sz예약시각,9,2)+':'+SUBSTRING(sz예약시각,11,2)+':00',126) IS NULL OR
 (sz예약시각 < CONVERT(char(8),DATEADD(minute,@duration,@targetTime),112)
   + REPLACE(CONVERT(char(5),DATEADD(minute,@duration,@targetTime),108),':','')
 AND DATEADD(minute,n소요시간,TRY_CONVERT(datetime2,
   SUBSTRING(sz예약시각,1,4)+'-'+SUBSTRING(sz예약시각,5,2)+'-'+SUBSTRING(sz예약시각,7,2)+'T'+SUBSTRING(sz예약시각,9,2)+':'+SUBSTRING(sz예약시각,11,2)+':00',126)) > @targetTime))
) THROW 51010,'Another active appointment overlaps for this patient.',1;
IF @alreadyAtTarget=0
BEGIN
 UPDATE dbo.TB_예약목록 SET sz예약시각=@target,t최종수정=GETDATE() WHERE nID=@id;
 IF @@ROWCOUNT<>1 THROW 51011,'Linked reservation update failed.',1;
 UPDATE dbo.TB_덴트웹설정 SET t예약최종수정=GETDATE();
END;
'@
  foreach ($p in @(@('id','Int',[int]$e.reservationId),@('patient','Int',[int]$e.patientId),@('duration','Int',[int]$e.durationMinutes),@('alreadyAtTarget','Bit',($before.appointmentAt -eq $target)))) {
    [void]$cmd.Parameters.Add('@'+$p[0],[Enum]::Parse([Data.SqlDbType],[string]$p[1])); $cmd.Parameters['@'+$p[0]].Value=$p[2]
  }
  [void]$cmd.Parameters.Add('@target',[Data.SqlDbType]::VarChar,12); $cmd.Parameters['@target'].Value=$target
  [void]$cmd.Parameters.Add('@targetTime',[Data.SqlDbType]::DateTime2)
  $cmd.Parameters['@targetTime'].Value=[DateTime]::ParseExact($target,'yyyyMMddHHmm',[Globalization.CultureInfo]::InvariantCulture)
  [void]$cmd.ExecuteNonQuery(); $cmd.Dispose()
  $inside = ReadReservation $true
  AssertIdentity $inside
  if ($inside.appointmentAt -ne $target) { throw 'Native transaction readback failed' }
  $transaction.Commit()
  $after = ReadReservation $false
  AssertIdentity $after
  if ($after.appointmentAt -ne $target) { throw 'Native post-commit readback differs; review required' }
  [pscustomobject]@{reservationId=$after.reservationId; duplicate=($before.appointmentAt -eq $target); verification=$after} | ConvertTo-Json -Depth 5 -Compress
} catch {
  try { $transaction.Rollback() } catch {}
  throw
} finally { $transaction.Dispose(); $connection.Dispose() }
`;
