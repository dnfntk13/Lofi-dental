import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReservationOperations } from '../lib/reservation-operations.mjs';
import { handleReservationOperations } from '../lib/reservation-operations-http.mjs';
import { createResultOutbox } from '../lib/dentweb-result-outbox.mjs';
const copy=v=>structuredClone(v), at=(v,k)=>k.split('.').reduce((a,b)=>a?.[b],v);
function set(o,k,v){const p=k.split('.'),last=p.pop();for(const s of p)o=o[s]??={};o[last]=v;}
function match(row,f){return Object.entries(f).every(([k,v])=>k==='$or'?v.some(x=>match(row,x)):v&&typeof v==='object'&&'$lt'in v?at(row,k)<v.$lt:JSON.stringify(at(row,k)??null)===JSON.stringify(v??null));}
function collection(rows=[]){return {rows,
 async findOne(f){return copy(rows.find(r=>match(r,f))??null)},
 find(f){return {toArray:async()=>copy(rows.filter(r=>match(r,f))) }},
 async insertOne(r){if(rows.some(x=>x.reservationId===r.reservationId))throw Object.assign(Error('duplicate'),{code:11000});rows.push(copy(r));},
 async updateOne(f,u){const r=rows.find(x=>match(x,f));if(!r)return {matchedCount:0};for(const [k,v]of Object.entries(u.$set||{}))set(r,k,copy(v));for(const [k,v]of Object.entries(u.$inc||{}))set(r,k,(at(r,k)||0)+v);for(const[k,v]of Object.entries(u.$push||{}))at(r,k).push(copy(v));return {matchedCount:1};},
 async findOneAndUpdate(f,u){const r=rows.find(x=>match(x,f));if(!r)return null;await this.updateOne(f,u);return copy(r)} } }
const input={operationId:'test-reservation-op-0001',action:'reschedule',expected:{reservationId:42,patientId:17,name:'Fixture',phone:'010-1111-2222',state:0,date:'2030-01-02',time:'15:00',durationMinutes:30,memoSha256:'a'.repeat(64),contentSha256:'b'.repeat(64)},target:{date:'2030-01-03',time:'16:00'}};
function harness(linked=[]){const c=collection(),inbox=collection(linked);const service=createReservationOperations({getCollection:async()=>c,getInboxCollection:async()=>inbox});return {service,c,inbox};}
function result(job){return {status:'completed',leaseToken:job.leaseToken,verification:{...job.nativeOperation.expected,appointmentAt:job.nativeOperation.action==='cancel'?'203001031600':'203001031600',state:job.nativeOperation.action==='cancel'?2:0}};}
test('unlinked request is idempotent and creates no calendar record; repeated change and cancel retain history',async()=>{
 const {service:s,c,inbox}=harness();await s.queue(42,input);await s.queue(42,input);assert.equal(c.rows.length,1);
 await assert.rejects(s.queue(42,{...input,target:{date:'2030-01-04',time:'16:00'}}),/different request/);
 await assert.rejects(s.queue(42,{...input,operationId:'test-reservation-op-0002'}),/Previous/);
 const job=await s.claim();await assert.rejects(s.complete(42,input.operationId,{...result(job),leaseToken:'wrong'}),/active claim/);
 await assert.rejects(s.complete(42,input.operationId,{...result(job),verification:{...result(job).verification,patientId:18}}),/readback/);
 await s.complete(42,input.operationId,result(job));await s.complete(42,input.operationId,result(job));assert.equal(inbox.rows.length,0);
 const cancel={...input,operationId:'test-reservation-op-0002',action:'cancel',expected:{...input.expected,date:'2030-01-03',time:'16:00'}};delete cancel.target;
 await s.queue(42,cancel);const next=await s.claim();await s.complete(42,cancel.operationId,result(next));
 assert.equal((await s.get(42)).history.length,1);assert.equal((await s.get(42)).current.status,'completed');assert.equal(inbox.rows.length,0);
});
test('concurrent queue accepts only one request',async()=>{const {service:s}=harness();const r=await Promise.allSettled([s.queue(42,input),s.queue(42,{...input,operationId:'test-reservation-op-0002'})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);});
test('existing linked row follows only explicit target; conflict keeps verified native result for recovery',async()=>{
 const before={id:'web42',dentwebReservationId:42,dentwebSyncStatus:'completed',updatedAt:'before',date:'2030-01-02',time:'15:00',concerns:'preserve'};
 const {service:s,inbox}=harness([before]);await s.queue(42,input);const j=await s.claim();inbox.rows[0].updatedAt='concurrent';
 await assert.rejects(s.complete(42,input.operationId,result(j)),/web record changed/);assert.equal((await s.get(42)).current.nativeVerified,true);
 await assert.rejects(s.complete(42,input.operationId,{status:'failed',leaseToken:j.leaseToken,error:'timeout'}),/cannot be replaced/);
 inbox.rows[0].updatedAt='before';await s.recover(42,input.operationId);assert.equal(inbox.rows[0].time,'16:00');assert.equal(inbox.rows[0].concerns,'preserve');assert.equal((await s.get(42)).current.webVerified,true);
});
test('failed operation only recovers in verify-only mode; no blind write',async()=>{const {service:s}=harness();await s.queue(42,input);const j=await s.claim();await s.complete(42,input.operationId,{status:'failed',leaseToken:j.leaseToken,error:'connection lost'});await s.recover(42,input.operationId);assert.equal((await s.claim()).verifyOnly,true);});
test('ambiguous web links and pending legacy writes are rejected',async()=>{for(const rows of [[{dentwebReservationId:42},{dentwebReservationId:42}],[{dentwebReservationId:42,dentwebSyncStatus:'processing'}]]){const {service:s}=harness(rows);await assert.rejects(s.queue(42,input));}});
test('HTTP requires authentication before parsing or calling mutation',async()=>{let called=false;const response={writeHead(s){this.status=s},end(b){this.body=JSON.parse(b)}};await handleReservationOperations({pathname:'/api/admin/dentweb/reservations/42/operations',request:{method:'POST'},response,authorized:false,readBody:async()=>{called=true},service:{queue:()=>{called=true}}});assert.equal(response.status,401);assert.equal(called,false);});
test('outbox survives process recreation and failed callbacks, deletes only after acknowledgement',async()=>{const dir=await mkdtemp(join(tmpdir(),'dentweb-outbox-test-'));try{const payload={job:{id:'42'},status:'completed',details:{verification:'saved'}};await createResultOutbox(dir).save(payload);const outbox=createResultOutbox(dir);await assert.rejects(outbox.deliver(async()=>{throw Error('network')}));assert.deepEqual(await outbox.load(),payload);let seen;await outbox.deliver(async(...v)=>{seen=v});assert.deepEqual(seen,[payload.job,payload.status,payload.details]);assert.equal(await outbox.load(),null);}finally{await rm(dir,{recursive:true,force:true});}});
