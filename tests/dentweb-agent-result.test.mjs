import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import vm from 'node:vm';
const source=await readFile(new URL('../tools/dentweb-sync-agent.mjs',import.meta.url),'utf8');
test('actual PowerShell transport preserves Korean JSON', {skip:process.platform!=='win32'},async()=>{
 const start=source.indexOf('function runPowerShell('),end=source.indexOf('\nfunction adminAuthHeader',start);
 const run=vm.runInNewContext(source.slice(start,end)+';runPowerShell',{execFile,process});
 const value=JSON.parse(await run("[pscustomobject]@{name='검증환자'}|ConvertTo-Json -Compress"));
 assert.equal(value.name,'검증환자');
});
test('old result encoding is repaired through read-only verification before callback, without claiming new work',async()=>{
 let pending={status:'completed',job:{action:'reservation-operation',id:'old'},details:{verification:{name:'corrupt'}}};
 let readOnly,delivered,claimed=false;
 const start=source.indexOf('async function processDentwebJobs()'),end=source.indexOf('\nasync function ',start+10);
 const run=vm.runInNewContext(source.slice(start,end)+';processDentwebJobs',{
  process:{env:{DENTWEB_SQL_CONNECTION_STRING:'fixture'}},syncInProgress:false,sqlConfigurationWarningShown:false,console,
  resultOutbox:{load:async()=>pending,save:async v=>{pending=v},deliver:async()=>{delivered=pending;return true}},reportDentwebResult(){},
  createDentwebReservation:async job=>{readOnly=job.verifyOnly;return {verification:{name:'검증환자'}}},
  claimDentwebJob:async()=>{claimed=true},
 });
 await run();assert.equal(readOnly,true);assert.equal(delivered.details.verification.name,'검증환자');assert.equal(delivered.resultEncodingVersion,1);assert.equal(claimed,false);
});
