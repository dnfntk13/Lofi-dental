import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createResultOutbox } from '../lib/dentweb-result-outbox.mjs';
const source=await readFile(new URL('../tools/dentweb-sync-agent.mjs',import.meta.url),'utf8');
const functionText=(from,to)=>source.slice(source.indexOf('async function '+from),source.indexOf('async function '+to));
test('read callback retains lease and never calls legacy sync endpoint',async()=>{
 let request;
 const context={serverUrl:'https://example.invalid',adminAuthHeader:()=> 'fixture',AbortSignal,encodeURIComponent,
  updateDentwebJob:()=>{throw Error('Wrong result endpoint');},
  fetch:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({ok:true})};}};
 vm.createContext(context);vm.runInContext(functionText('reportDentwebResult','updateDentwebJob'),context);
 const details={verification:{reservationId:42},busyIntervals:[{startMinute:10,endMinute:40}]};
 await context.reportDentwebResult({id:'read/id',action:'patient-reschedule-read',leaseToken:'lease'},'completed',details);
 assert.equal(request.url,'https://example.invalid/api/admin/dentweb/patient-reschedule/reads/read%2Fid/result');
 assert.deepEqual(JSON.parse(request.body),{status:'completed',leaseToken:'lease',...details});
});
test('capability advertised and busy intervals included in durable result',()=>{
 assert.match(source,/"X-Dentweb-Patient-Reschedule": "1"/);
 assert.match(source,/patientRescheduleVersion: 1/);
 assert.match(source,/job.action === 'patient-reschedule-read' \? \{ busyIntervals: result.busyIntervals \}/);
 assert.ok(source.indexOf("if (job.action === 'patient-reschedule-read')",source.indexOf('async function createDentwebReservation'))<source.indexOf('  assertDentwebJobIdentity(job);'));
});
test('read result survives callback failure, retries same lease, then clears',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lofi-outbox-fixture-'));const outbox=createResultOutbox(dir);
 try {
  const record={job:{id:'read-id',action:'patient-reschedule-read',leaseToken:'same-lease'},status:'completed',details:{busyIntervals:[],verification:{reservationId:42}}};
  await outbox.save(record);
  await assert.rejects(outbox.deliver(async()=>{throw Error('Network fixture');}));
  assert.deepEqual(await outbox.load(),record);
  let captured;await outbox.deliver(async(...args)=>{captured=args;});
  assert.deepEqual(captured,[record.job,record.status,record.details]);assert.equal(await outbox.load(),null);
 } finally {await unlink(path.join(dir,'pending-result.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});await rmdir(dir);}
});
