// SELECT-only preparation, executed by the authenticated clinic queue consumer.
export const patientRescheduleReadScript = String.raw`
$ErrorActionPreference = 'Stop'
$job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DENTWEB_JOB_BASE64)) | ConvertFrom-Json
$culture = [Globalization.CultureInfo]::InvariantCulture
if ($job.action -cne 'patient-reschedule-read' -or [int]$job.dentwebReservationId -lt 1 -or -not $job.expectedWeb.id -or -not $job.id -or -not $job.leaseToken) { throw 'Invalid read job' }
$day = [DateTime]::ParseExact([string]$job.date,'yyyy-MM-dd',$culture)
$expectedAt = [DateTime]::ParseExact(([string]$job.expectedWeb.date+' '+[string]$job.expectedWeb.time),'yyyy-MM-dd HH:mm',$culture)
function Digest($value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$value)))).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose() }
}
function PhoneKey($value) { return ([string]$value) -replace '[\s-]','' }
function ValidPhone($value) {
  $key = PhoneKey $value
  return $key -match '^\+?\d{7,15}$' -and $key -notin @('01012341234','01000000000') -and $key -notmatch '^(\d)\1+$'
}
$connection = [Data.SqlClient.SqlConnection]::new($env:DENTWEB_SQL_CONNECTION_STRING)
$connection.Open()
$transaction = $connection.BeginTransaction([Data.IsolationLevel]::Serializable)
try {
  $cmd = $connection.CreateCommand(); $cmd.Transaction = $transaction; $cmd.CommandTimeout = 30
  $cmd.CommandText = 'SELECT a.nID,a.n환자ID,a.sz예약시각,a.n이행현황,a.n소요시간,a.sz메모,CASE WHEN a.n환자ID>0 THEN p.sz이름 ELSE n.sz이름 END,CASE WHEN a.n환자ID>0 THEN p.sz휴대폰번호 ELSE n.sz휴대폰번호 END,a.sz예약내용 FROM dbo.TB_예약목록 a WITH (HOLDLOCK) LEFT JOIN dbo.TB_환자정보 p ON a.n환자ID>0 AND p.n환자ID=a.n환자ID LEFT JOIN dbo.TB_신환예약자정보 n ON a.n환자ID<0 AND n.nID=-a.n환자ID WHERE a.nID=@id'
  [void]$cmd.Parameters.Add('@id',[Data.SqlDbType]::Int); $cmd.Parameters['@id'].Value=[int]$job.dentwebReservationId
  $r = $cmd.ExecuteReader()
  try {
    if (-not $r.Read()) { throw 'Linked reservation no longer exists' }
    $at = [DateTime]::ParseExact([string]$r[2],'yyyyMMddHHmm',$culture)
    if ($r.IsDBNull(3) -or [int]$r[3] -ne 0 -or $at -ne $expectedAt) { throw 'Linked reservation state or schedule changed' }
    if ($r.IsDBNull(4) -or [int]$r[4] -lt 1 -or [int]$r[4] -gt 255) { throw 'Native duration is unknown' }
    $name=([string]$r[6]).Trim(); $phone=[string]$r[7]
    if (-not $name -or [int]$r[1] -eq 0 -or -not (ValidPhone $phone)) { throw 'Native patient identity is incomplete or provisional' }
    if ($job.expectedWeb.name -and $name -cne [string]$job.expectedWeb.name) { throw 'Linked patient name changed' }
    if ($job.expectedWeb.phone -and (-not (ValidPhone $job.expectedWeb.phone) -or (PhoneKey $phone) -cne (PhoneKey $job.expectedWeb.phone))) { throw 'Linked patient phone changed' }
    if (-not $job.expectedWeb.name -and -not $job.expectedWeb.phone) { throw 'Web patient identity evidence is missing' }
    $verification = [pscustomobject]@{reservationId=[int]$r[0];patientId=[int]$r[1];name=$name;phone=$phone;date=$at.ToString('yyyy-MM-dd');time=$at.ToString('HH:mm');state=0;durationMinutes=[int]$r[4];memoSha256=(Digest ([string]$r[5]));contentSha256=(Digest ([string]$r[8]))}
  } finally { $r.Close(); $cmd.Dispose() }
  $cmd = $connection.CreateCommand(); $cmd.Transaction=$transaction; $cmd.CommandTimeout=30
  # Include the preceding day for midnight-crossing intervals. Malformed dates
  # cannot safely be assigned to any day, so they fail closed as well.
  $cmd.CommandText = @'
SELECT sz예약시각,n소요시간,n이행현황 FROM dbo.TB_예약목록 WITH (HOLDLOCK)
WHERE nID<>@id AND (n이행현황<>2 OR n이행현황 IS NULL)
AND (sz예약시각 IS NULL OR LEN(sz예약시각)<>12 OR TRY_CONVERT(datetime2,
SUBSTRING(sz예약시각,1,4)+'-'+SUBSTRING(sz예약시각,5,2)+'-'+SUBSTRING(sz예약시각,7,2)+'T'+SUBSTRING(sz예약시각,9,2)+':'+SUBSTRING(sz예약시각,11,2)+':00',126) IS NULL
OR (sz예약시각>=@from AND sz예약시각<@until)
OR n소요시간 IS NULL OR n소요시간<1 OR n소요시간>255)
'@
  [void]$cmd.Parameters.Add('@id',[Data.SqlDbType]::Int); $cmd.Parameters['@id'].Value=$verification.reservationId
  [void]$cmd.Parameters.Add('@from',[Data.SqlDbType]::VarChar,12); $cmd.Parameters['@from'].Value=$day.AddDays(-1).ToString('yyyyMMdd')+'0000'
  [void]$cmd.Parameters.Add('@until',[Data.SqlDbType]::VarChar,12); $cmd.Parameters['@until'].Value=$day.AddDays(1).ToString('yyyyMMdd')+'0000'
  $busy = [Collections.Generic.List[object]]::new()
  $r=$cmd.ExecuteReader()
  try {
    while ($r.Read()) {
      $start = [DateTime]::ParseExact([string]$r[0],'yyyyMMddHHmm',$culture)
      if ($r.IsDBNull(1) -or [int]$r[1] -lt 1 -or [int]$r[1] -gt 255 -or $r.IsDBNull(2)) { throw 'Native occupancy cannot be verified' }
      $end=$start.AddMinutes([int]$r[1])
      if ($start -lt $day.AddDays(1) -and $end -gt $day) {
        $busy.Add([pscustomobject]@{startMinute=[int][Math]::Max(0,($start-$day).TotalMinutes);endMinute=[int][Math]::Min(1440,($end-$day).TotalMinutes)})
      }
    }
  } finally { $r.Close(); $cmd.Dispose() }
  $transaction.Commit()
  [pscustomobject]@{status='completed';reservationId=$verification.reservationId;verification=$verification;busyIntervals=@($busy.ToArray())} | ConvertTo-Json -Depth 6 -Compress
} catch { try { $transaction.Rollback() } catch {}; throw }
finally { $transaction.Dispose(); $connection.Dispose() }
`;
