import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReservationOperations, validateOperation } from '../lib/reservation-operations.mjs';
import { handleReservationOperations } from '../lib/reservation-operations-http.mjs';
import { createResultOutbox } from '../lib/dentweb-result-outbox.mjs';
const copy=v=>structuredClone(v), at=(v,k)=>k.split('.').reduce((a,b)=>a?.[b],v);
function set(o,k,v){const p=k.split('.'),last=p.pop();for(const s of p)o=o[s]??={};o[last]=v;}
function match(row,f){return Object.entries(f).every(([k,v])=>k==='$or'?v.some(x=>match(row,x)):v&&typeof v==='object'&&'$in'in v?v.$in.includes(at(row,k)):v&&typeof v==='object'&&'$lt'in v?at(row,k)<v.$lt:JSON.stringify(at(row,k)??null)===JSON.stringify(v??null));}
function collection(rows=[]){return {rows,
 async findOne(f){return copy(rows.find(r=>match(r,f))??null)},
 find(f){return {toArray:async()=>copy(rows.filter(r=>match(r,f))) }},
 async insertOne(r){if(rows.some(x=>x.reservationId===r.reservationId))throw Object.assign(Error('duplicate'),{code:11000});rows.push(copy(r));},
 async updateOne(f,u){const r=rows.find(x=>match(x,f));if(!r)return {matchedCount:0};for(const [k,v]of Object.entries(u.$set||{}))set(r,k,copy(v));for(const [k,v]of Object.entries(u.$inc||{}))set(r,k,(at(r,k)||0)+v);for(const[k,v]of Object.entries(u.$push||{}))at(r,k).push(copy(v));return {matchedCount:1};},
 async findOneAndUpdate(f,u){const r=rows.find(x=>match(x,f));if(!r)return null;await this.updateOne(f,u);return copy(r)} } }
const input={operationId:'test-reservation-op-0001',action:'reschedule',expected:{reservationId:42,patientId:17,name:'Fixture',phone:'010-1111-2222',state:0,date:'2030-01-02',time:'15:00',durationMinutes:30,memoSha256:'a'.repeat(64),contentSha256:'b'.repeat(64)},target:{date:'2030-01-03',time:'16:00'}};
const sha = text => createHash('sha256').update(text).digest('hex');
const annotation = () => ({...input,action:'annotate-cancellation',expected:{...input.expected,state:2,contentSha256:sha('검진\noriginal clinical history')},target:{note:'추후 본인 연락',originalContent:'검진\noriginal clinical history'}});
test('HTTP queue dispatch accepts the running agent protocol version',async()=>{
 const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
 const agent=await readFile(new URL('../tools/dentweb-sync-agent.mjs',import.meta.url),'utf8');
 const version=agent.match(/"X-Dentweb-Reservation-Operations": "(\d+)"/)[1];
 const accepted=server.match(/if \(\[([^\]]+)\]\.includes\(request.headers\['x-dentweb-reservation-operations'\]\)\)/)[1].match(/\d+/g);
 assert.ok(accepted.includes(version),'HTTP route must dispatch the agent version to the operation journal');
});
test('cancelled annotation fences older agents, preserves cancellation and all original content, and is idempotent',async()=>{
 const before={id:'web42',dentwebReservationId:42,dentwebSyncStatus:'completed',updatedAt:'before',date:'2030-01-02',time:'15:00',status:'cancelled',cancelledAt:'before',concerns:'old'};
 const {service:s,inbox}=harness([before]);const request=annotation();
 const normalized=validateOperation(request,42);assert.deepEqual(validateOperation(normalized,42),normalized);
 await s.queue(42,request);await s.queue(42,request);assert.equal(await s.claim(1),null);assert.equal(await s.claim(2),null);assert.equal(await s.claim(NaN),null);
 const job=await s.claim(3);const verification={...request.expected,appointmentAt:'203001021500',contentSha256:sha(normalized.target.content)};
 await assert.rejects(s.complete(42,request.operationId,{status:'completed',leaseToken:job.leaseToken,verification:{...verification,state:0}}),/readback/);
 await s.complete(42,request.operationId,{status:'completed',leaseToken:job.leaseToken,verification});
 assert.equal(inbox.rows.length,1);assert.equal(inbox.rows[0].status,'cancelled');assert.equal(inbox.rows[0].cancelledAt,'before');assert.equal(inbox.rows[0].date,before.date);assert.equal(inbox.rows[0].time,before.time);
 assert.equal(inbox.rows[0].concerns,'[취소: 추후 본인 연락] 검진\noriginal clinical history');
});
test('cancelled annotation rejects active/attended state, altered original, arbitrary replacement, oversize and repeated prefix',()=>{
 for(const state of [0,1,3])assert.throws(()=>validateOperation({...annotation(),expected:{...annotation().expected,state}},42));
 for(const target of [{...annotation().target,originalContent:'other'},{...annotation().target,content:'overwrite'},{...annotation().target,time:'16:00'},{...annotation().target,note:'a\nb'},{...annotation().target,note:'a'.repeat(121)}])assert.throws(()=>validateOperation({...annotation(),target},42));
 for(const originalContent of ['[취소: 기존] 검진','a'.repeat(1000)])assert.throws(()=>validateOperation({...annotation(),expected:{...annotation().expected,contentSha256:sha(originalContent)},target:{note:'추후 연락',originalContent}},42));
});
function harness(linked=[]){const c=collection(),inbox=collection(linked);const service=createReservationOperations({getCollection:async()=>c,getInboxCollection:async()=>inbox});return {service,c,inbox};}
function result(job){return {status:'completed',leaseToken:job.leaseToken,verification:{...job.nativeOperation.expected,appointmentAt:job.nativeOperation.action==='cancel'?'203001031600':'203001031600',state:job.nativeOperation.action==='cancel'?2:0}};}
test('content amendment requires a new agent; verifies content and preserves calendar identity and schedule',async()=>{
 const before={id:'web42',dentwebReservationId:42,dentwebSyncStatus:'completed',updatedAt:'before',date:'2030-01-02',time:'15:00',concerns:'old'};
 const {service:s,inbox}=harness([before]);
 const amend={...input,action:'amend-content',target:{content:'큐렛 (미백 취소)'}};
 await s.queue(42,amend);assert.equal(await s.claim(1),null);
 const job=await s.claim(2), verification={...amend.expected,appointmentAt:'203001021500',contentSha256:createHash('sha256').update(amend.target.content).digest('hex')};
 await assert.rejects(s.complete(42,amend.operationId,{status:'completed',leaseToken:job.leaseToken,verification:{...verification,contentSha256:amend.expected.contentSha256}}),/readback/);
 await s.complete(42,amend.operationId,{status:'completed',leaseToken:job.leaseToken,verification});
 assert.equal(inbox.rows[0].concerns,amend.target.content);assert.equal(inbox.rows[0].date,before.date);assert.equal(inbox.rows[0].time,before.time);
 assert.equal(inbox.rows.length,1);assert.equal((await s.get(42)).current.webVerified,true);
});
test('content amendment rejects schedule edits, empty, oversized, controls and unchanged content',()=>{
 const content='큐렛';const expected={...input.expected,contentSha256:createHash('sha256').update(content).digest('hex')};
 for(const target of [{content,time:'16:00'},{content:''},{content:'a'.repeat(201)},{content:'a\nb'},{content}]) assert.throws(()=>validateOperation({...input,expected,action:'amend-content',target},42));
});
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
function legacyFixture(){
 const old={operationId:'old-legacy-reschedule-0001',expected:{...input.expected},target:{...input.target}};
 const row={id:'legacy42',dentwebReservationId:42,dentwebAction:'linked-reschedule',dentwebSyncStatus:'failed',dentwebSyncError:'callback failed',dentwebReschedule:old,date:input.expected.date,time:input.expected.time,updatedAt:'before',concerns:'preserve'};
 const recovery={operationId:'recover-legacy-test-0001',webId:row.id,legacyOperationId:old.operationId,verified:{...input.expected,...input.target,memoSha256:'c'.repeat(64)}};
 return {row,recovery};
}
test('legacy callback recovery is verify-only, derives old target, preserves staff edits and is idempotent',async()=>{
 const {row,recovery}=legacyFixture(),{service:s,c,inbox}=harness([row]);
 await s.recoverLegacy(42,recovery);const j=await s.claim();assert.equal(j.verifyOnly,true);
 assert.equal(j.nativeOperation.expected.memoSha256,'c'.repeat(64));assert.deepEqual(j.nativeOperation.target,row.dentwebReschedule.target);
 await assert.rejects(s.complete(42,recovery.operationId,{...result(j),verification:{...result(j).verification,appointmentAt:'203001021500'}}),/readback/);
 assert.equal(inbox.rows[0].dentwebSyncStatus,'failed');
 await s.complete(42,recovery.operationId,result(j));await s.recoverLegacy(42,recovery);
 assert.equal(c.rows.length,1);assert.equal(c.rows[0].current.attempts,1);assert.equal(inbox.rows.length,1);
 assert.equal(inbox.rows[0].date,'2030-01-03');assert.equal(inbox.rows[0].concerns,'preserve');
 assert.deepEqual(inbox.rows[0].dentwebReschedule,row.dentwebReschedule);
 assert.equal(c.rows[0].current.linkedBefore[0].dentwebSyncError,'callback failed');
});
test('legacy recovery rejects identity/target changes, wrong source, in-flight and ambiguous links',async()=>{
 for(const change of [{verified:{patientId:18}},{verified:{date:'2030-01-04'}},{legacyOperationId:'wrong'},{webId:'unknown'},{verified:{memoSha256:'invalid'}}]){
  const {row,recovery}=legacyFixture(),{service:s}=harness([row]);
  const request={...recovery,...change,verified:{...recovery.verified,...change.verified}};await assert.rejects(s.recoverLegacy(42,request));
 }
 for(const status of ['pending','processing','completed']){const {row,recovery}=legacyFixture();row.dentwebSyncStatus=status;await assert.rejects(harness([row]).service.recoverLegacy(42,recovery));}
 const {row,recovery}=legacyFixture();await assert.rejects(harness([row,{...row,id:'duplicate'}]).service.recoverLegacy(42,recovery),/Multiple/);
});
test('legacy recovery request cannot disable verify-only; mismatch failure retries only reads',async()=>{
 const {row,recovery}=legacyFixture(),{service:s}=harness([row]);await s.recoverLegacy(42,{...recovery,verifyOnly:false});
 const j=await s.claim();assert.equal(j.verifyOnly,true);await s.complete(42,recovery.operationId,{status:'failed',leaseToken:j.leaseToken,error:'Target changed'});
 await s.recover(42,recovery.operationId);assert.equal((await s.claim()).verifyOnly,true);
});
test('legacy recovery HTTP requires authentication and dispatches to dedicated recovery method',async()=>{
 let calls=0;const response={writeHead(s){this.status=s},end(b){this.body=JSON.parse(b)}};
 const args={pathname:'/api/admin/dentweb/reservations/42/operations/recover-legacy',request:{method:'POST'},response,readBody:async()=>({webId:'legacy42'}),service:{recoverLegacy:async(id,p)=>{calls++;assert.equal(id,42);assert.equal(p.webId,'legacy42');return {status:'pending',verifyOnly:true}}}};
 await handleReservationOperations({...args,authorized:false});assert.equal(response.status,401);assert.equal(calls,0);
 await handleReservationOperations({...args,authorized:true});assert.equal(response.status,200);assert.equal(calls,1);
});
test('HTTP requires authentication before parsing or calling mutation',async()=>{let called=false;const response={writeHead(s){this.status=s},end(b){this.body=JSON.parse(b)}};await handleReservationOperations({pathname:'/api/admin/dentweb/reservations/42/operations',request:{method:'POST'},response,authorized:false,readBody:async()=>{called=true},service:{queue:()=>{called=true}}});assert.equal(response.status,401);assert.equal(called,false);});
test('outbox survives process recreation and failed callbacks, deletes only after acknowledgement',async()=>{const dir=await mkdtemp(join(tmpdir(),'dentweb-outbox-test-'));try{const payload={job:{id:'42'},status:'completed',details:{verification:'saved'}};await createResultOutbox(dir).save(payload);const outbox=createResultOutbox(dir);await assert.rejects(outbox.deliver(async()=>{throw Error('network')}));assert.deepEqual(await outbox.load(),payload);let seen;await outbox.deliver(async(...v)=>{seen=v});assert.deepEqual(seen,[payload.job,payload.status,payload.details]);assert.equal(await outbox.load(),null);}finally{await rm(dir,{recursive:true,force:true});}});
