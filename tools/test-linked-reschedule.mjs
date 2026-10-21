// Runs the production PowerShell logic against session-local #tables only.
// Never starts the agent or contacts the web queue.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { linkedRescheduleScript } from '../lib/linked-reschedule-script.mjs';
const fixture = `
CREATE TABLE #TB_환자정보(n환자ID int PRIMARY KEY,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
CREATE TABLE #TB_신환예약자정보(nID int PRIMARY KEY,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
CREATE TABLE #TB_덴트웹설정(t예약최종수정 datetime);
CREATE TABLE #TB_예약목록(nID int PRIMARY KEY,n환자ID int,sz예약시각 varchar(12),n이행현황 int,n소요시간 int,sz메모 nvarchar(max),sz이름 nvarchar(40),sz전화 varchar(30),t최종수정 datetime);
INSERT #TB_환자정보 VALUES(17,N'Fixture','010-1111-2222');
INSERT #TB_신환예약자정보 VALUES(9,N'Fixture','010-1111-2222');
INSERT #TB_덴트웹설정 VALUES('20290101');
INSERT #TB_예약목록 VALUES(42,17,'203001021500',0,30,N'직원 메모','','','20290101');
`;
let isolated=linkedRescheduleScript.replaceAll('dbo.TB_', '#TB_');
if(isolated.includes('dbo.') || /\b(?:INSERT|DELETE)\b/i.test(isolated)) throw new Error('Unexpected SQL scope');
isolated=isolated.replace('$connection.Open()',`$connection.Open()
$setup=$connection.CreateCommand(); $setup.CommandText=$fixtureSql; [void]$setup.ExecuteNonQuery(); $setup.Dispose()`);
isolated=isolated.replace('$transaction.Dispose(); $connection.Dispose()',`$transaction.Dispose()
$check=$connection.CreateCommand()
$check.CommandText='SELECT sz예약시각 FROM #TB_예약목록 WHERE nID=42'
$script:observedAt=[string]$check.ExecuteScalar()
$check.CommandText="SELECT COUNT(*) FROM #TB_예약목록 WHERE nID=42 AND ISNULL(sz이름,'')='' AND ISNULL(sz전화,'')=''"
$script:blankIdentity=[int]$check.ExecuteScalar()
$check.Dispose(); $connection.Dispose()`);
const expected={reservationId:42,patientId:17,state:0,name:'Fixture',phone:'010-1111-2222',durationMinutes:30,memoSha256:createHash('sha256').update('직원 메모').digest('hex'),date:'2030-01-02',time:'15:00'};
const cases=[
  {name:'registered patient with blank reservation identity',ok:true},
  {name:'idempotent retry at target',ok:true,sql:"UPDATE #TB_예약목록 SET sz예약시각='203001031600' WHERE nID=42",duplicate:true},
  {name:'negative new-patient ID',ok:true,sql:'UPDATE #TB_예약목록 SET n환자ID=-9 WHERE nID=42',expected:{patientId:-9}},
  {name:'cancelled appointment',sql:'UPDATE #TB_예약목록 SET n이행현황=2 WHERE nID=42'},
  {name:'attended appointment',sql:'UPDATE #TB_예약목록 SET n이행현황=1 WHERE nID=42'},
  {name:'wrong patient ID',expected:{patientId:18}},
  {name:'changed patient phone',sql:"UPDATE #TB_환자정보 SET sz휴대폰번호='010-9999-9999'"},
  {name:'changed memo',sql:"UPDATE #TB_예약목록 SET sz메모=N'직원 추가 메모' WHERE nID=42"},
  {name:'changed duration',sql:'UPDATE #TB_예약목록 SET n소요시간=60 WHERE nID=42'},
  {name:'changed time',sql:"UPDATE #TB_예약목록 SET sz예약시각='203001021530' WHERE nID=42",original:'203001021530'},
  {name:'active overlapping appointment',sql:"INSERT #TB_예약목록 VALUES(43,17,'203001031545',0,30,N'','','','20290101')"},
  {name:'adjacent appointment is allowed',ok:true,sql:"INSERT #TB_예약목록 VALUES(43,17,'203001031530',0,30,N'','','','20290101')"},
  {name:'cancelled overlap is allowed',ok:true,sql:"INSERT #TB_예약목록 VALUES(43,17,'203001031545',2,30,N'','','','20290101')"},
];
const encoded = Buffer.from(JSON.stringify(cases.map(c=>({...c,fixture:fixture+(c.sql||''),job:{reschedule:{operationId:'fixture-operation',expected:{...expected,...c.expected},target:{date:'2030-01-03',time:'16:00'}}}}))),'utf8').toString('base64');
const script=`
$ErrorActionPreference='Stop'
if (-not $env:DENTWEB_SQL_CONNECTION_STRING) { $env:DENTWEB_SQL_CONNECTION_STRING=[Environment]::GetEnvironmentVariable('DENTWEB_SQL_CONNECTION_STRING','User') }
if (-not $env:DENTWEB_SQL_CONNECTION_STRING) { throw 'Existing clinic SQL connection unavailable; fixture tests not run' }
$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(isolated,'utf8').toString('base64')}'))
$parseErrors=$null; $tokens=$null
[void][Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){ throw 'PowerShell script parse failed' }
$block=[scriptblock]::Create($source)
$cases=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json
foreach($case in $cases){
 $fixtureSql=[string]$case.fixture
 $env:DENTWEB_JOB_BASE64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($case.job|ConvertTo-Json -Depth 10 -Compress)))
 $script:observedAt=$null; $script:blankIdentity=0; $failed=$false; $failure=''
 try { $result=(& $block)|ConvertFrom-Json } catch { $failed=$true; $failure=$_.Exception.Message }
 if($case.ok -and $failed){throw ('Fixture '+$case.name+' failed: '+$failure)}
 if(-not $case.ok -and -not $failed){throw ('Fixture '+$case.name+' did not reject')}
 $expectedAt=if($case.ok){'203001031600'}elseif($case.original){[string]$case.original}else{'203001021500'}
 if($script:observedAt -ne $expectedAt -or $script:blankIdentity -ne 1){throw ('Fixture '+$case.name+' changed unexpected fields')}
 if($case.ok -and ($result.verification.memoSha256 -ne $case.job.reschedule.expected.memoSha256 -or $result.verification.durationMinutes -ne 30 -or $result.reservationId -ne 42)){throw 'Fixture verification mismatch'}
 if($case.duplicate -and -not $result.duplicate){throw 'Retry was not a no-op'}
 Write-Output ('PASS: '+$case.name)
}
`;
const dir=mkdtempSync(path.join(tmpdir(),'lofi-reschedule-fixtures-'));
const file=path.join(dir,'fixtures.ps1');
try {
  writeFileSync(file,'\uFEFF'+script,'utf8');
  process.stdout.write(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024}));
} finally { unlinkSync(file); rmdirSync(dir); }
