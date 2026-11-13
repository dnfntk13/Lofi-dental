import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { patientRescheduleReadScript } from '../lib/patient-reschedule-read-script.mjs';
const fixture = `
CREATE TABLE #TB_환자정보(n환자ID int PRIMARY KEY,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
CREATE TABLE #TB_신환예약자정보(nID int PRIMARY KEY,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
CREATE TABLE #TB_예약목록(nID int PRIMARY KEY,n환자ID int,sz예약시각 varchar(12),n이행현황 int,n소요시간 int,sz메모 nvarchar(max),sz예약내용 nvarchar(1000));
INSERT #TB_환자정보 VALUES(17,N'검증환자','010-1111-2222');
INSERT #TB_신환예약자정보 VALUES(9,N'검증환자','010-1111-2222');
INSERT #TB_예약목록 VALUES(42,17,'203001021500',0,30,N'직원 메모',N'treatment');
`;
if (/\b(UPDATE|INSERT|DELETE|MERGE|EXEC(?:UTE)?|TRUNCATE)\b/i.test(patientRescheduleReadScript)) throw Error('Read script contains mutation SQL');
let isolated=patientRescheduleReadScript.replaceAll('dbo.TB_', '#TB_');
if(isolated.includes('dbo.')) throw Error('Unexpected production scope');
isolated=isolated.replace('$connection.Open()', `$connection.Open()
$setup=$connection.CreateCommand(); $setup.CommandText=$fixtureSql; [void]$setup.ExecuteNonQuery(); $setup.Dispose()`);
const cases=[
 {name:'verified snapshot with empty intervals',ok:true},
 {name:'phone display separators accepted',ok:true,web:{phone:'010 1111 2222'}},
 {name:'negative patient ID supported',ok:true,sql:'UPDATE #TB_예약목록 SET n환자ID=-9'},
 {name:'changed native time',sql:"UPDATE #TB_예약목록 SET sz예약시각='203001021530'"},
 {name:'cancelled source',sql:'UPDATE #TB_예약목록 SET n이행현황=2'},
 {name:'changed name',web:{name:'다른환자'}},
 {name:'changed phone',web:{phone:'01033334444'}},
 {name:'country code equivalence not assumed',web:{phone:'+821011112222'}},
 {name:'placeholder rejected',web:{phone:'01012341234'},sql:"UPDATE #TB_환자정보 SET sz휴대폰번호='01012341234'"},
 {name:'missing identity evidence',web:{name:'',phone:''}},
 {name:'null native duration',sql:'UPDATE #TB_예약목록 SET n소요시간=NULL'},
 {name:'invalid target date',date:'2030-02-30'},
 {name:'malformed native schedule',sql:"UPDATE #TB_예약목록 SET sz예약시각='203002301500'"},
 {name:'all noncancelled and midnight intervals',ok:true,intervals:[{startMinute:0,endMinute:45},{startMinute:600,endMinute:630},{startMinute:1430,endMinute:1440}],sql:"INSERT #TB_예약목록 VALUES(43,99,'203001022345',0,60,N'',N''),(44,99,'203001031000',1,30,N'',N''),(45,99,'203001031100',2,30,N'',N''),(46,99,'203001032350',0,30,N'',N'')"},
 {name:'unknown occupancy duration',sql:"INSERT #TB_예약목록 VALUES(43,99,'203001031000',0,NULL,N'',N'')"},
 {name:'malformed occupancy date',sql:"INSERT #TB_예약목록 VALUES(43,99,'203001ZZ1000',0,30,N'',N'')"},
 {name:'unknown occupancy state',sql:"INSERT #TB_예약목록 VALUES(43,99,'203001031000',NULL,30,N'',N'')"},
];
const jobs=cases.map(c=>({...c,fixture:fixture+(c.sql||''),job:{id:'fixture-read',action:'patient-reschedule-read',leaseToken:'fixture-lease',dentwebReservationId:42,date:c.date||'2030-01-03',expectedWeb:{id:'fixture-web',date:'2030-01-02',time:'15:00',name:'검증환자',phone:'01011112222',...c.web}}}));
const b64=v=>Buffer.from(v,'utf8').toString('base64');
const script=`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if(-not $env:DENTWEB_SQL_CONNECTION_STRING){$env:DENTWEB_SQL_CONNECTION_STRING=[Environment]::GetEnvironmentVariable('DENTWEB_SQL_CONNECTION_STRING','User')}
if(-not $env:DENTWEB_SQL_CONNECTION_STRING){throw 'Existing clinic SQL connection unavailable'}
$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(isolated)}'))
$errors=$null;$tokens=$null
[void][Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'PowerShell syntax failed'}
$block=[scriptblock]::Create($source)
$cases=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(JSON.stringify(jobs))}'))|ConvertFrom-Json
foreach($case in $cases){
 $fixtureSql=$case.fixture
 $env:DENTWEB_JOB_BASE64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($case.job|ConvertTo-Json -Depth 10 -Compress)))
 $failed=$false;$failure=''
 try{$result=(& $block)|ConvertFrom-Json}catch{$failed=$true;$failure=$_.Exception.Message}
 if($case.ok -and $failed){throw ('Fixture '+$case.name+' failed: '+$failure)}
 if(-not $case.ok -and -not $failed){throw ('Fixture '+$case.name+' did not reject')}
 if($case.ok){
  $v=$result.verification
  if($result.status -ne 'completed' -or $v.reservationId -ne 42 -or $v.name -cne '검증환자' -or $v.date -ne '2030-01-02' -or $v.time -ne '15:00' -or $v.durationMinutes -ne 30 -or $v.state -ne 0 -or $v.memoSha256 -cne '${createHash('sha256').update('직원 메모').digest('hex')}' -or $v.contentSha256 -cne '${createHash('sha256').update('treatment').digest('hex')}'){throw 'Snapshot verification mismatch'}
  $actual=@($result.busyIntervals|Sort-Object startMinute)
  $expected=@($case.intervals|Where-Object {$null -ne $_})
  if($actual.Count -ne $expected.Count){throw ('Interval count mismatch '+$case.name)}
  for($i=0;$i -lt $actual.Count;$i++){
   if($actual[$i].startMinute -ne $expected[$i].startMinute -or $actual[$i].endMinute -ne $expected[$i].endMinute -or @($actual[$i].psobject.Properties).Count -ne 2){throw 'PII-free intervals mismatch'}
  }
 }
 Write-Output ('PASS: '+$case.name)
}
`;
const dir=mkdtempSync(path.join(tmpdir(),'lofi-read-fixtures-'));
try {
 const file=path.join(dir,'fixtures.ps1');writeFileSync(file,'\uFEFF'+script,'utf8');
 process.stdout.write(execFileSync(process.env.LOFI_TEST_PWSH || 'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe',['-NoProfile','-NonInteractive','-File',file],{windowsHide:true,encoding:'utf8',maxBuffer:1024*1024}));
} finally {unlinkSync(path.join(dir,'fixtures.ps1'));rmdirSync(dir);}
