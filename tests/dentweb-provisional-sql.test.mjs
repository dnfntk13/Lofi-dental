import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { assertDentwebJobIdentity, prepareDentwebIdentity } from '../lib/dentweb-job-identity.mjs';
import { provisionalResolveSql, provisionalUpgradeSql } from '../lib/dentweb-provisional.mjs';
import { reservationDuration } from '../lib/reservation-duration.mjs';

test('SQL temp tables: provisional creation, retry, identity upgrade, cancellation and wrong-link rejection',
  {skip:process.env.DENTWEB_SQL_TEST !== '1'}, async()=>{
  const source=await readFile(new URL('../tools/dentweb-sync-agent.mjs',import.meta.url),'utf8');
  const a=source.indexOf('async function createDentwebReservation('),b=source.indexOf('async function processDentwebJobs(',a);
  let script;
  const context=vm.createContext({assertDentwebJobIdentity,prepareDentwebIdentity,provisionalResolveSql,provisionalUpgradeSql,
    reservationDuration,Buffer,process:{env:{DENTWEB_SQL_CONNECTION_STRING:'TEST_ONLY'}},
    runPowerShell:async text=>{script=text;return '{"reservationId":1}';}});
  const create=vm.runInContext(source.slice(a,b)+'\ncreateDentwebReservation',context);
  const base={id:'1793359847995-test',email:'test@example.com',date:'2030-01-07',time:'11:00',name:'',phone:'',durationMinutes:30};
  await create(base);
  let sql=script.match(/\$command.CommandText = @'\r?\n([\s\S]*?)\r?\n'@/)[1];
  sql=sql.replaceAll('dbo.TB_', '#TB_');
  assert.doesNotMatch(sql,/dbo\.|INSERT INTO (?!#)|UPDATE (?!#)/);
  const marker=prepareDentwebIdentity(base).identityMarker;
  const schema=`
CREATE TABLE #TB_환자정보(n환자ID int,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
CREATE TABLE #TB_신환예약자정보(nID int IDENTITY,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
CREATE TABLE #TB_덴트웹설정(t예약최종수정 datetime);
CREATE TABLE #TB_예약목록(nID int IDENTITY,n환자ID int,sz이름 nvarchar(40),sz전화 varchar(30),sz예약시각 varchar(12),sz작성시각 varchar(14),n이행현황 tinyint,n소요시간 tinyint,n예약종류 tinyint,n담당의사 int,n담당직원 int,n치식 int,n임플치식 int,sz예약내용 nvarchar(max),nSMS전송일 int,n글자색 int,n배경색 int,sz메모 nvarchar(max),nPMH int,x변경내역 varbinary(max),szN상품ID varchar(30),szN예약ID varchar(30),t최종수정 datetime);
SELECT TOP 0 * INTO #TB_예약목록보관 FROM #TB_예약목록;
INSERT INTO #TB_예약목록(n환자ID,n이행현황,n소요시간,n예약종류,n담당의사,n담당직원,n글자색,n배경색,sz이름,sz전화,sz예약시각) VALUES(-900,0,30,1,1,1,0,0,'Seed','','203001010900');
INSERT INTO #TB_덴트웹설정 VALUES(GETDATE());`;
  const ps=`
$ErrorActionPreference='Stop'
$connection=[Data.SqlClient.SqlConnection]::new([Environment]::GetEnvironmentVariable('DENTWEB_SQL_CONNECTION_STRING','User'))
$connection.Open()
try {
$setup=$connection.CreateCommand();$setup.CommandText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(schema).toString('base64')}'));[void]$setup.ExecuteNonQuery()
$sql=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(sql).toString('base64')}'))
function Run([int]$link,[bool]$provisional,[string]$name,[string]$phone,[bool]$cancel,[string]$marker) {
  $cmd=$connection.CreateCommand();$cmd.CommandText=$sql
  $values=@{name=$name;phone=$phone;appointmentAt='203001071100';createdAt='20261030210000';memo=$marker;linkedReservationId=$link;requestedDuration=30;cancel=$cancel;provisional=$provisional;identityMarker=$marker}
  foreach($key in $values.Keys){[void]$cmd.Parameters.AddWithValue('@'+$key,$values[$key])}
  $reader=$cmd.ExecuteReader();[void]$reader.Read();$id=$reader.GetInt32(0);$reader.Close();return $id
}
$marker='${marker}'
$id=Run 0 $true '가예약 test@example.com' '' $false $marker
if($id -ne 2){throw 'Unexpected new reservation'}
if((Run 0 $true '가예약 test@example.com' '' $false $marker) -ne $id){throw 'Retry duplicated reservation'}
try {Run $id $true '가예약 test@example.com' '' $false '[wrong]'|Out-Null;throw 'Wrong marker accepted'}catch{if($_.Exception.Message -notmatch 'marker mismatch'){throw}}
if((Run $id $false 'Verified Patient' '01055550123' $false $marker) -ne $id){throw 'Upgrade changed ID'}
$check=$connection.CreateCommand();$check.CommandText="SELECT COUNT(*) FROM #TB_예약목록 WHERE nID=2 AND sz이름='Verified Patient' AND sz전화='01055550123' AND n환자ID=-1";if($check.ExecuteScalar() -ne 1){throw 'Upgrade not saved'}
$check.CommandText="SELECT COUNT(*) FROM #TB_신환예약자정보 WHERE nID=1 AND sz이름='Verified Patient' AND sz휴대폰번호='01055550123'";if($check.ExecuteScalar() -ne 1){throw 'Temporary identity not upgraded'}
[void](Run $id $false 'Verified Patient' '01055550123' $true $marker)
$check.CommandText='SELECT n이행현황 FROM #TB_예약목록 WHERE nID=2';if($check.ExecuteScalar() -ne 2){throw 'Cancellation not saved'}
try {Run 0 $true '가예약 test@example.com' '' $false $marker|Out-Null;throw 'Cancelled row resurrected'}catch{if($_.Exception.Message -notmatch 'no longer active'){throw}}
$check.CommandText='SELECT COUNT(*) FROM #TB_예약목록';if($check.ExecuteScalar() -ne 2){throw 'Unexpected duplicate rows'}
Write-Output 'TEMP_TABLE_TESTS_PASSED'
} finally {$connection.Dispose()}
`;
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',ps],{windowsHide:true,maxBuffer:1024*1024});
  assert.match(stdout,/TEMP_TABLE_TESTS_PASSED/);
});
