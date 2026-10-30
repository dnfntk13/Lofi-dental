import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { queueLinkedReschedule, assertRescheduleCallback } from '../lib/linked-reschedule.mjs';
import { provisionalConflict } from '../lib/dentweb-provisional.mjs';
const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const input={operationId:'fictional-http-operation',expected:{reservationId:42,patientId:17,name:'Fixture',phone:'010-1111-2222',date:'2030-01-02',time:'15:00',state:0,durationMinutes:30,memoSha256:'a'.repeat(64)},target:{date:'2030-01-03',time:'16:00'}};
const initial={id:'fixture',source:'dentweb',dentwebReservationId:42,date:'2030-01-02',time:'15:00',name:'Fixture',phone:'010-1111-2222',dentwebSyncStatus:'completed'};
function matches(row,filter) {
  return Object.entries(filter).every(([key,value])=>{
    if(key==='$and')return value.every(f=>matches(row,f));
    if(key==='$or')return value.some(f=>matches(row,f));
    if(value && typeof value==='object' && !Array.isArray(value)) {
      if('$ne' in value)return row[key]!==value.$ne;
      if('$lt' in value)return row[key]<value.$lt;
      if('$in' in value)return value.$in.includes(row[key]);
    }
    return JSON.stringify(row[key]??null)===JSON.stringify(value??null);
  });
}
function harness() {
  let row=structuredClone(initial), race=false, mongo=true;
  const env={DENTWEB_LINKED_RESCHEDULE_ENABLED:'1'};
  const collection={
    findOne:async()=>structuredClone(row),
    replaceOne:async(filter,next)=>{
      if(race)row.updatedAt='concurrent';
      if(!matches(row,filter))return {matchedCount:0};
      row=structuredClone(next); return {matchedCount:1};
    },
    findOneAndUpdate:async(filter,update)=>{
      if(!matches(row,filter))return null;
      Object.assign(row,update.$set); return structuredClone(row);
    },
  };
  const context=vm.createContext({process:{env},console:{error(){}},queueLinkedReschedule,assertRescheduleCallback,provisionalConflict,
    readInbox:async()=>[structuredClone(row)],
    getJsonBody:async r=>r.body,getInboxCollection:async()=>mongo?collection:null,
    requestAuth:r=>{r.writeHead(401);r.end('{}');}});
  function handler(start,end) {
    const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
    assert.ok(a>=0&&b>a);
    return vm.runInContext(`(async function(pathname,request,response,adminAuthorized=true){${source.slice(a,b)}})`,context);
  }
  const routes={
    reschedule:handler('  const rescheduleMatch','  const cancelMatch'),
    claim:handler('  if (pathname === "/api/admin/dentweb/jobs/next"','  if (pathname.startsWith("/api/admin/reservations/") && request.method === "PUT")'),
    callback:handler('  const dentwebSyncMatch','  if (pathname === "/api/admin/dentweb/jobs/next"'),
  };
  return {get row(){return row;},env,setRace:()=>race=true,setMongo:v=>mongo=v,
    async call(kind,body,headers={},authorized=true){
      const result={};
      const path=kind==='claim'?'/api/admin/dentweb/jobs/next':`/api/admin/reservations/fixture/${kind==='reschedule'?'linked-reschedule':'dentweb-sync'}`;
      await routes[kind](path,{method:kind==='claim'?'GET':'POST',body,headers:{'x-dentweb-provisional':'1',...headers}},{writeHead:s=>result.status=s,end:b=>result.body=JSON.parse(b)},authorized);
      return result;
    }};
}
test('authenticated opt-in route rejects unavailable atomic storage and concurrent replacement',async()=>{
  const h=harness();
  assert.equal((await h.call('reschedule',input,{},false)).status,401);
  h.env.DENTWEB_LINKED_RESCHEDULE_ENABLED='0';
  assert.equal((await h.call('reschedule',input)).status,409);
  h.env.DENTWEB_LINKED_RESCHEDULE_ENABLED='1';h.setMongo(false);
  assert.equal((await h.call('reschedule',input)).status,409);
  h.setMongo(true);h.setRace();
  assert.equal((await h.call('reschedule',input)).status,409);
  assert.equal(h.row.dentwebReschedule,undefined);
});
test('import stays excluded; explicit job requires matching agent capability and verified callback',async()=>{
  const h=harness();
  assert.equal((await h.call('claim')).body.job,null);
  assert.equal((await h.call('reschedule',input)).status,200);
  assert.equal((await h.call('reschedule',input)).status,200);
  assert.equal((await h.call('claim')).body.job,null); // old agent cannot claim it
  h.env.DENTWEB_LINKED_RESCHEDULE_ENABLED='0';
  assert.equal((await h.call('claim',null,{'x-dentweb-linked-reschedule':'1'})).body.job,null);
  h.env.DENTWEB_LINKED_RESCHEDULE_ENABLED='1';
  const claim=await h.call('claim',null,{'x-dentweb-linked-reschedule':'1'});
  assert.equal(claim.body.job.action,'linked-reschedule');
  assert.deepEqual(claim.body.job.reschedule,input);
  assert.equal((await h.call('callback',{status:'completed',dentwebReservationId:42})).status,500);
  const verification={...input.expected,appointmentAt:'203001031600'};
  assert.equal((await h.call('callback',{status:'completed',dentwebReservationId:42,operationId:input.operationId,action:'linked-reschedule',verification})).status,200);
  assert.equal(h.row.dentwebSyncStatus,'completed');
  assert.equal(h.row.date,input.target.date);assert.equal(h.row.time,input.target.time);assert.equal(h.row.source,'dentweb');
  assert.deepEqual(h.row.dentwebRescheduleWebBefore,{date:initial.date,time:initial.time});
  assert.equal((await h.call('claim',null,{'x-dentweb-linked-reschedule':'1'})).body.job,null);
});
test('failure preserves the old web schedule and cannot be requeued by a replay',async()=>{
  const h=harness();
  await h.call('reschedule',input);
  await h.call('claim',null,{'x-dentweb-linked-reschedule':'1'});
  const result=await h.call('callback',{status:'failed',dentwebReservationId:42,operationId:input.operationId,action:'linked-reschedule',error:'Fixture conflict'});
  assert.equal(result.status,200);
  assert.equal(h.row.date,initial.date);assert.equal(h.row.time,initial.time);
  await h.call('reschedule',input);
  assert.equal(h.row.dentwebSyncStatus,'failed');
  assert.equal((await h.call('claim',null,{'x-dentweb-linked-reschedule':'1'})).body.job,null);
});
