import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { autoQueueDentweb } from '../lib/dentweb-auto-queue.mjs';
import { assertDentwebJobIdentity, dentwebIdentityReady } from '../lib/dentweb-job-identity.mjs';

test('identity readiness rejects missing and legacy placeholders, accepts international contacts', () => {
  for (const record of [ {}, {name:'Case Patient'}, {name:'person@example.com',phone:'+12025550123'},
    {name:'Case Patient',phone:'010-1234-1234'}, {name:'Case Patient',phone:'+82 10 1234 1234'},
    {name:'Case Patient',phone:'unknown'} ]) {
    assert.equal(dentwebIdentityReady(record), false);
    assert.throws(() => assertDentwebJobIdentity(record), /DENTWEB_IDENTITY_REQUIRED/);
  }
  for (const phone of ['+12025550123', '+82 10 5555 0123', '+44 20 7946 0123'])
    assert.equal(dentwebIdentityReady({name:'Case Patient',phone}), true);
  // Linked cancellation has its own identity guard and may retain blank fields.
  assert.doesNotThrow(() => assertDentwebJobIdentity({action:'cancel',dentwebReservationId:10}));
});

test('failed records are not retried by later identity edits or unrelated updates', () => {
  const record={name:'Case Patient',phone:'+12025550123',dentwebSyncStatus:'failed',dentwebSyncError:'identity conflict'};
  assert.equal(autoQueueDentweb(record,{date:'2030-01-07',time:'11:00'}),record);
});

test('public request waits for details, then queues the same web ID exactly once without placeholder handoff', async () => {
  const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  let saved;
  const collection={findOne:async()=>saved, replaceOne:async (_,record)=>{saved=record;return {matchedCount:1};},
    findOneAndUpdate:async()=>saved};
  const context=vm.createContext({console,process:{env:{}},autoQueueDentweb,assertDentwebJobIdentity,
    getJsonBody:async r=>r.body, readInbox:async()=>saved?[saved]:[], getInboxCollection:async()=>collection,
    addInboxRecord:async r=>{Object.assign(r,autoQueueDentweb(r,{date:r.date,time:r.time}));saved={...r};},
    normalizeReservationDate:x=>x,normalizeReservationTime:x=>x,
    isValidEmail:()=>true,hasMailExchange:async()=>true,isEmailVerified:()=>true,
    isTrafficOptedOut:()=>true,removeEmailVerification:()=>{},getReservedTimesForDate:()=>[],
    extractPatientInfo:()=>({}),saveOrUpdatePatient:async()=>{},saveOrUpdateEmailThread:async()=>{},
    sendReservationAutoReply:async()=>false,sendReservationNotification:async()=>false,reservationCorsHeaders:{},
  });
  const start=source.indexOf('async function upsertInboxRecord('),end=source.indexOf('async function deleteInboxRecord(',start);
  vm.runInContext(source.slice(start,end),context);
  function handler(start,end) {
    const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
    assert.ok(a>=0&&b>a);
    return vm.runInContext(`(async function(pathname,request,response,adminAuthorized=true){${source.slice(a,b)}})`,context);
  }
  const create=handler('  if (pathname === "/api/reservations" && request.method === "POST")','  if (pathname === "/api/consult-chat"');
  const reply=handler('  if (pathname === "/api/patient-reply"','  if (pathname === "/api/admin/messages"');
  const job=handler('  if (pathname === "/api/admin/dentweb/jobs/next"','  if (pathname.startsWith("/api/admin/reservations/") && request.method === "PUT")');
  const retry=handler('  const dentwebSyncMatch =','  if (pathname === "/api/admin/dentweb/jobs/next"');
  async function call(route,path,body,method='POST') {
    const result={};await route(path,{method,body,headers:{}},{writeHead:s=>result.status=s,end:b=>result.body=JSON.parse(b)});return result;
  }
  assert.equal((await call(create,'/api/reservations',{date:'2030-01-07',time:'11:00 AM',email:'person@example.com',concerns:'Consultation'})).status,201);
  const id=saved.id;
  assert.equal(saved.name,'');assert.equal(saved.phone,'');
  assert.equal(saved.dentwebSyncStatus,'waiting_identity');
  assert.equal(saved.dentwebQueuedAt,undefined);
  const blocked=await call(retry,`/api/admin/reservations/${id}/dentweb-sync`,{status:'pending'});
  assert.equal(blocked.status,400);
  assert.match(blocked.body.message,/DENTWEB_IDENTITY_REQUIRED/);
  assert.equal(saved.dentwebSyncStatus,'waiting_identity');
  // The same public reply path that previously left the premature failure stuck.
  assert.equal((await call(reply,'/api/patient-reply',{id,name:'Case Patient',phone:'+12025550123'})).status,200);
  assert.equal(saved.id,id);assert.equal(saved.dentwebSyncStatus,'pending');
  const queuedAt=saved.dentwebQueuedAt;
  await call(reply,'/api/patient-reply',{id,name:'Case Patient',phone:'+12025550123'});
  assert.equal(saved.dentwebQueuedAt,queuedAt);
  const handed=await call(job,'/api/admin/dentweb/jobs/next',{},'GET');
  assert.equal(handed.body.job.name,'Case Patient');assert.equal(handed.body.job.phone,'+12025550123');
  saved={...saved,name:'',phone:''};
  const empty=await call(job,'/api/admin/dentweb/jobs/next',{},'GET');
  assert.equal(empty.body.job.name,'');assert.equal(empty.body.job.phone,'');
  assert.throws(()=>assertDentwebJobIdentity(empty.body.job),/DENTWEB_IDENTITY_REQUIRED/);
});

test('agent rejects an old queued placeholder before invoking any SQL process', async () => {
  const source=await readFile(new URL('../tools/dentweb-sync-agent.mjs',import.meta.url),'utf8');
  const a=source.indexOf('async function createDentwebReservation('),b=source.indexOf('async function processDentwebJobs(',a);
  let calls=0;
  const context=vm.createContext({assertDentwebJobIdentity,runPowerShell:async()=>{calls++;throw Error('must not run');}});
  const create=vm.runInContext(source.slice(a,b)+'\ncreateDentwebReservation',context);
  await assert.rejects(create({name:'person@example.com',phone:'01012341234'}),/DENTWEB_IDENTITY_REQUIRED/);
  await assert.rejects(create({name:'Case Patient',phone:''}),/DENTWEB_IDENTITY_REQUIRED/);
  assert.equal(calls,0);
});
