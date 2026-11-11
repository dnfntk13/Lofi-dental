import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {reservationOperationScript} from '../lib/reservation-operation-script.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
test('real SQL temp tables: rejection reads only, rejects target state and staff changes, normal cancel stays strict',
 {skip:process.env.DENTWEB_SQL_TEST!=='1'},async()=>{
 const expected={reservationId:42,patientId:17,name:'Fixture',phone:'01011112222',date:'2030-01-02',time:'15:00',state:0,durationMinutes:30,memoSha256:sha('memo'),contentSha256:sha('content')};
 const job={nativeOperation:{operationId:'fixture-cancel-operation',action:'cancel',expected},verifyOnly:true,rejection:{kind:'phone-format-only',expected:{...expected,phone:'010-1111-2222'}}};
 const schema=`CREATE TABLE #TB_환자정보(n환자ID int,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
 CREATE TABLE #TB_신환예약자정보(nID int,sz이름 nvarchar(40),sz휴대폰번호 varchar(30));
 CREATE TABLE #TB_예약목록(nID int,n환자ID int,sz예약시각 varchar(12),n이행현황 tinyint,n소요시간 tinyint,sz메모 nvarchar(max),sz예약내용 nvarchar(max),t최종수정 datetime);
 CREATE TABLE #TB_덴트웹설정(t예약최종수정 datetime);
 INSERT #TB_환자정보 VALUES(17,'Fixture','010-1111-2222');
 INSERT #TB_예약목록 VALUES(42,17,'203001021500',0,30,'memo','content','20000101');
 INSERT #TB_덴트웹설정 VALUES('20000101');`;
 const cases=[
  {label:'unchanged',ok:true},
  {label:'already cancelled',sql:'UPDATE #TB_예약목록 SET n이행현황=2'},
  {label:'staff memo',sql:"UPDATE #TB_예약목록 SET sz메모='staff'"},
  {label:'staff content',sql:"UPDATE #TB_예약목록 SET sz예약내용='staff'"},
  {label:'staff identity',sql:"UPDATE #TB_환자정보 SET sz이름='Other'"},
  {label:'staff time',sql:"UPDATE #TB_예약목록 SET sz예약시각='203001031500'"},
  {label:'post-lock edit',post:true},
  {label:'ordinary cancel exact guard',normal:true},
 ];
 for(const scenario of cases){
  let script=reservationOperationScript.replaceAll('dbo.TB_','#TB_');
  assert.doesNotMatch(script,/dbo\.TB_|UPDATE dbo\./);
  script=script.replace('$connection.Open()',`$connection.Open()
  $setup=$connection.CreateCommand();$setup.CommandText=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(schema+(scenario.sql||'')).toString('base64')}'));[void]$setup.ExecuteNonQuery();$setup.Dispose()
  $snapshot=$connection.CreateCommand();$snapshot.CommandText='SELECT * FROM #TB_예약목록 FOR JSON PATH';$initial=[string]$snapshot.ExecuteScalar()`);
  if(scenario.post)script=script.replace('    $after = ReadReservation $false',`    $edit=$connection.CreateCommand();$edit.CommandText="UPDATE #TB_예약목록 SET sz메모='late staff'";[void]$edit.ExecuteNonQuery();$edit.Dispose()
    $initial=[string]$snapshot.ExecuteScalar()
    $after = ReadReservation $false`);
  script=script.replace('$transaction.Dispose(); $connection.Dispose()',`$transaction.Dispose();
  if ([string]$snapshot.ExecuteScalar() -cne $initial) { throw 'TEST: native row was mutated' }
  $snapshot.CommandText="SELECT COUNT(*) FROM #TB_덴트웹설정 WHERE t예약최종수정='20000101'";if($snapshot.ExecuteScalar() -ne 1){throw 'TEST: settings mutated'}
  $snapshot.Dispose();$connection.Dispose()`);
  const file=join(tmpdir(),'rejection-'+randomUUID()+'.ps1');
  await writeFile(file,script,'utf8');
  const value=scenario.normal?{nativeOperation:job.nativeOperation}:job;
  try{
   const run=promisify(execFile)(process.env.DENTWEB_TEST_PWSH||'powershell.exe',['-NoProfile','-File',file],{env:{...process.env,DENTWEB_JOB_BASE64:Buffer.from(JSON.stringify(value)).toString('base64')},windowsHide:true,timeout:20000});
   if(scenario.ok){const {stdout}=await run;const result=JSON.parse(stdout.trim());assert.equal(result.status,'rejected');assert.equal(result.verification.phone,job.rejection.expected.phone);assert.equal(result.verification.state,0);}
   else await assert.rejects(run,error=>{assert.doesNotMatch(error.stderr,/TEST:/);assert.match(error.stderr,/changed;|review required/);return true},scenario.label);
  }finally{await unlink(file)}
 }
});
