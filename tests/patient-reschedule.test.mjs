import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatientReschedule } from '../lib/patient-reschedule.mjs';
import { createReservationOperations } from '../lib/reservation-operations.mjs';
import { handlePatientReschedule } from '../lib/patient-reschedule-http.mjs';
import { changeTimes, validChangeDay } from '../lib/patient-reschedule-times.mjs';

const copy=v=>structuredClone(v),at=(o,k)=>k.split('.').reduce((a,b)=>a?.[b],o);
function set(o,k,v){const keys=k.split('.'),last=keys.pop();for(const key of keys)o=o[key]??={};o[last]=copy(v);}
function match(row,f){return Object.entries(f).every(([k,v])=>{
  if(k==='$or')return v.some(x=>match(row,x));
  const actual=at(row,k);
  if(v&&typeof v==='object'&&!(v instanceof Date))return Object.entries(v).every(([op,value])=>{
    if(op==='$in')return value.includes(actual);if(op==='$lt')return actual<value;if(op==='$lte')return actual<=value;if(op==='$gt')return actual>value;
    if(op==='$exists')return (actual!==undefined)===value;if(op==='$ne')return actual!==value;if(op==='$regex')return new RegExp(value,v.$options).test(actual||'');if(op==='$options')return true;
    throw Error('Unsupported fixture matcher '+op);
  });
  return JSON.stringify(actual??null)===JSON.stringify(v??null);
});}
function collection(rows=[],key='_id'){return {rows,
  async findOne(f){return copy(rows.find(r=>match(r,f))??null);},
  find(f){return {toArray:async()=>copy(rows.filter(r=>match(r,f)))};},
  async insertOne(r){if(rows.some(x=>x[key]===r[key]))throw Object.assign(Error('duplicate'),{code:11000});rows.push(copy(r));},
  async updateOne(f,u,opts={}){let r=rows.find(x=>match(x,f));if(!r&&opts.upsert){r=Object.fromEntries(Object.entries(f).filter(([k,v])=>!k.startsWith('$')&&(v===null||typeof v!=='object')));await this.insertOne(r);r=rows.at(-1);}if(!r)return {matchedCount:0};
    for(const[k,v]of Object.entries(u.$set||{}))set(r,k,v);for(const[k,v]of Object.entries(u.$inc||{}))set(r,k,(at(r,k)||0)+v);for(const[k,v]of Object.entries(u.$push||{}))at(r,k).push(copy(v));for(const k of Object.keys(u.$unset||{}))delete r[k];return {matchedCount:1};},
  async findOneAndUpdate(f,u,opts={}){const old=rows.find(r=>match(r,f));const result=await this.updateOne(f,u,opts);if(!result.matchedCount)return null;return copy(old||rows.find(r=>match(r,Object.fromEntries(Object.entries(f).filter(([k])=>k===key))))||null);},
  async deleteOne(f){const i=rows.findIndex(r=>match(r,f));if(i>=0)rows.splice(i,1);}
};}
const row=()=>({id:'fixture-web-42',email:'patient@example.test',name:'Fixture Patient',phone:'01011112222',date:'2026-11-16',time:'15:00',dentwebReservationId:42,dentwebSyncStatus:'completed',durationMinutes:60,updatedAt:'before',concerns:'staff note'});
const proof=()=>({reservationId:42,patientId:17,name:'Fixture Patient',phone:'01011112222',date:'2026-11-16',time:'15:00',state:0,durationMinutes:60,memoSha256:'a'.repeat(64),contentSha256:'b'.repeat(64)});
function harness(records=[row()]){let time=new Date('2026-11-13T01:00:00Z'),sent=[];const auth=collection(),inbox=collection(records,'id'),journal=collection([],'reservationId');const now=()=>new Date(time);const operations=createReservationOperations({getCollection:async()=>journal,getInboxCollection:async()=>inbox,now});
  const service=createPatientReschedule({getCollection:async()=>auth,getInboxCollection:async()=>inbox,operations,now,mailReady:()=>true,sendCode:async(email,code)=>sent.push({email,code}),normalizeTime:t=>t});
  return {service,operations,auth,inbox,journal,sent,advance:ms=>time=new Date(+time+ms)};
}
async function login(h,email='patient@example.test'){await h.service.heartbeat();await h.service.start(email,'fixture-ip');return h.service.verify(email,h.sent.at(-1).code,'fixture-ip');}
async function ready(h,date='2026-11-17',busyIntervals=[]){await h.service.heartbeat();const {readId}=await h.service.availability('patient@example.test',row().id,date);const j=await h.service.claimRead();await h.service.readResult(j.id,{leaseToken:j.leaseToken,status:'completed',verification:proof(),busyIntervals});return {readId,j};}

test('OTP is isolated from booking verification, single use, session expires and logout revokes it',async()=>{
 const h=harness();assert.equal((await h.service.config()).available,false);const {token}=await login(h,'PATIENT@example.test');assert.equal(await h.service.authenticate(token),'patient@example.test');
 assert.ok(!JSON.stringify(h.auth.rows).includes(token));assert.ok(!JSON.stringify(h.auth.rows).includes(h.sent[0].code));
 await assert.rejects(h.service.verify('patient@example.test',h.sent[0].code,'fixture-ip'),{code:'invalid_code'});
 await h.service.logout(token);await assert.rejects(h.service.authenticate(token),{statusCode:401});
 h.advance(61000);const next=await login(h);h.advance(1800001);await assert.rejects(h.service.authenticate(next.token),{statusCode:401});
});
test('OTP throttles resend and guessing; expired code never grants access',async()=>{
 const h=harness();await h.service.heartbeat();await h.service.start('patient@example.test','ip');await assert.rejects(h.service.start('patient@example.test','ip'),{statusCode:429});
 for(let n=0;n<5;n++)await assert.rejects(h.service.verify('patient@example.test','000000','ip'),{code:'invalid_code'});
 await assert.rejects(h.service.verify('patient@example.test',h.sent[0].code,'ip'),{code:'invalid_code'});
 h.advance(61000);await h.service.heartbeat();await h.service.start('patient@example.test','ip');h.advance(600001);await assert.rejects(h.service.verify('patient@example.test',h.sent.at(-1).code,'ip'),{code:'invalid_code'});
});
test('email ownership hides other patients, imported, cancelled and past records without exposing native IDs',async()=>{
 const h=harness([row(),{...row(),id:'other',email:'other@example.test'},{...row(),id:'import',source:'dentweb'},{...row(),id:'cancel',status:'cancelled'},{...row(),id:'past',date:'2026-11-12'},{...row(),id:'unlinked',dentwebReservationId:null}]);
 const l=await h.service.list('patient@example.test');assert.deepEqual(l.reservations.map(r=>r.id),['fixture-web-42','unlinked']);assert.equal(l.reservations[1].canReschedule,false);assert.equal(l.reservations[0].dentwebReservationId,undefined);assert.equal(l.reservations[0].phone,undefined);
 for(const id of ['other','import','missing'])await assert.rejects(h.service.availability('patient@example.test',id,'2026-11-17'),{statusCode:404});
 for(const id of ['cancel','past','unlinked'])await assert.rejects(h.service.availability('patient@example.test',id,'2026-11-17'),{code:'clinic_review_required'});
});
test('availability requires fresh native lease proof, filters actual occupancy, web occupancy and full duration',async()=>{
 const h=harness([row(),{...row(),id:'web-busy',date:'2026-11-17',time:'14:00',dentwebReservationId:50}]);await h.service.heartbeat();const r=await h.service.availability('patient@example.test',row().id,'2026-11-17');const j=await h.service.claimRead();
 assert.equal((await h.service.getAvailability('patient@example.test',r.readId)).status,'checking');
 await assert.rejects(h.service.readResult(j.id,{leaseToken:'wrong',status:'completed',verification:proof(),busyIntervals:[]}),{code:'invalid_result'});
 await assert.rejects(h.service.readResult(j.id,{leaseToken:j.leaseToken,status:'completed',verification:{...proof(),state:2},busyIntervals:[]}));
 await h.service.readResult(j.id,{leaseToken:j.leaseToken,status:'completed',verification:proof(),busyIntervals:[{startMinute:960,endMinute:990}]});
 const result=await h.service.getAvailability('patient@example.test',r.readId);assert.ok(result.times.includes('10:00'));for(const t of ['12:30','13:00','14:00','14:30','15:30','16:00','18:30'])assert.ok(!result.times.includes(t),t);
 await assert.rejects(h.service.getAvailability('other@example.test',r.readId),{statusCode:404});h.advance(120001);await assert.rejects(h.service.getAvailability('patient@example.test',r.readId),{code:'availability_expired'});
});
test('self-service uses existing native ID, blocks old agent, preserves record and only completes with verified native and web save',async()=>{
 const h=harness(),r=await ready(h);const request={readId:r.readId,time:'10:00',requestId:'request-id-fixture-0001'};
 const first=await h.service.submit('patient@example.test',request);assert.equal(first.change.status,'processing');assert.equal(h.inbox.rows[0].date,'2026-11-16');assert.equal(h.journal.rows.length,1);
 assert.deepEqual(await h.service.submit('patient@example.test',request),first);assert.equal(await h.operations.claim(4),null);
 const j=await h.operations.claim(4,true);assert.equal(j.patientSelfService,true);assert.deepEqual(j.patientSelfServiceTarget,{date:'2026-11-17',time:'10:00'});
 await assert.rejects(h.operations.complete(42,j.id,{status:'completed',leaseToken:j.leaseToken,verification:{...proof(),appointmentAt:'202611171000',patientId:99}}));
 await h.operations.complete(42,j.id,{status:'completed',leaseToken:j.leaseToken,verification:{...proof(),appointmentAt:'202611171000'}});
 const done=await h.service.status('patient@example.test',row().id,j.id);assert.equal(done.change.status,'completed');assert.equal(h.inbox.rows.length,1);assert.equal(h.inbox.rows[0].dentwebReservationId,42);assert.equal(h.inbox.rows[0].id,row().id);assert.equal(h.inbox.rows[0].concerns,'staff note');assert.equal(h.inbox.rows[0].date,'2026-11-17');
 assert.equal((await h.service.submit('patient@example.test',request)).change.status,'completed');await assert.rejects(h.service.submit('patient@example.test',{...request,time:'11:00'}),{code:'request_changed'});
});
test('changes after preflight, stale slot, duplicate pending and native failure fail closed',async()=>{
 const h=harness(),r=await ready(h);h.inbox.rows[0].updatedAt='staff-change';await assert.rejects(h.service.submit('patient@example.test',{readId:r.readId,time:'10:00',requestId:'request-fixture-0002'}),{code:'reservation_changed'});
 const a=harness(),ar=await ready(a);await a.service.submit('patient@example.test',{readId:ar.readId,time:'10:00',requestId:'request-fixture-0003'});await assert.rejects(a.service.submit('patient@example.test',{readId:ar.readId,time:'11:00',requestId:'request-fixture-0004'}));
 const job=await a.operations.claim(4,true);await a.operations.complete(42,job.id,{status:'failed',leaseToken:job.leaseToken,error:'concurrent appointment'});
 assert.equal((await a.service.status('patient@example.test',row().id,job.id)).change.status,'needs_review');assert.equal(a.inbox.rows[0].date,row().date);assert.equal((await a.service.list('patient@example.test')).reservations[0].canReschedule,false);
});
test('date rules use Korea time, real dates, holidays, horizon, lunch and full duration',()=>{
 const now=new Date('2026-11-13T01:00:00Z');assert.equal(validChangeDay('2026-02-30',now),false);assert.equal(validChangeDay('2026-12-25',now),false);assert.equal(validChangeDay('2027-03-01',now),false);
 assert.ok(!changeTimes('2026-11-13',30,[],now).includes('10:00'));assert.ok(!changeTimes('2026-11-16',60,[],now).includes('12:30'));assert.ok(!changeTimes('2026-11-14',60,[],now).includes('15:30'));assert.ok(changeTimes('2026-11-14',60,[],now).includes('15:00'));
});
test('a late first claim cannot write; an expired lease after the selected time can only verify a lost result',async()=>{
 for(const attempted of [false,true]){
  const h=harness(),r=await ready(h);await h.service.submit('patient@example.test',{readId:r.readId,time:'10:00',requestId:'late-fixture-request'});
  if(attempted)assert.ok(await h.operations.claim(4,true));
  h.advance(5*86400000);
  const job=await h.operations.claim(4,true);
  if(attempted){assert.equal(job.verifyOnly,true);assert.equal(job.patientSelfService,true);}
  else {assert.equal(job,null);assert.equal(h.journal.rows[0].current.status,'failed');}
  assert.equal(h.inbox.rows[0].date,row().date);
 }
});
test('HTTP refuses unauthenticated ownership lookup and agent results; never leaks raw errors',async()=>{
 const h=harness(),response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};
 const base={request:{method:'POST',headers:{},socket:{remoteAddress:'fixture'}},response,readBody:async()=>({}),authorized:false,service:h.service};
 await handlePatientReschedule({...base,pathname:'/api/reservation-management/reservations'});assert.equal(response.status,401);assert.equal(response.headers['Cache-Control'],'no-store');
 await handlePatientReschedule({...base,pathname:'/api/admin/dentweb/patient-reschedule/reads/00000000-0000-0000-0000-000000000000/result'});assert.equal(response.status,401);
 const {token}=await login(h);await handlePatientReschedule({...base,request:{...base.request,headers:{authorization:'Bearer '+token}},pathname:'/api/reservation-management/reservations'});assert.equal(response.status,200);
});
