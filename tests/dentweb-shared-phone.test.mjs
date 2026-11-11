import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateSharedPhoneIdentity} from '../lib/dentweb-shared-phone.mjs';
import {assertDentwebJobIdentity} from '../lib/dentweb-job-identity.mjs';
const record={name:'Different Family Member',phone:'010-5555-1234'};
const evidence={mode:'distinct-patient',name:record.name,phone:'01055551234',expectedPatientIds:[20,10],verifiedAt:'2026-11-01T00:00:00Z',evidence:'Direct patient identity and family relationship verified in original conversation.'};
test('shared phone evidence binds identity and complete distinct positive patient IDs',()=>{
 assert.deepEqual(validateSharedPhoneIdentity(evidence,record).expectedPatientIds,[10,20]);
 for(const change of [{mode:'force-new'},{name:'Someone Else'},{phone:'01099999999'},{expectedPatientIds:[]},{expectedPatientIds:[10,10]},{expectedPatientIds:[-1]},{expectedPatientIds:['10']},{evidence:''},{verifiedAt:'tomorrow'}])assert.throws(()=>validateSharedPhoneIdentity({...evidence,...change},record),/SHARED_PHONE_IDENTITY/);
 assert.throws(()=>assertDentwebJobIdentity({...record,sharedPhoneIdentity:{...evidence,name:'Wrong'}}),/SHARED_PHONE_IDENTITY/);
 assert.doesNotThrow(()=>assertDentwebJobIdentity(record));
});
const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
test('admin create validates before saving and retains operator evidence',async()=>{
 let saved;
 const ctx=vm.createContext({validateSharedPhoneIdentity,getJsonBody:async r=>r.body,reservationDuration:x=>x,assertReservationWindowAllowed:()=>{},isValidEmail:()=>true,addInboxRecord:async r=>{saved=r;throw Error('STOP_AFTER_SAVE');},console:{error:()=>{}},requestAuth:r=>{r.writeHead(401);r.end('{}');}});
 const a=source.indexOf('  if (pathname === "/api/admin/reservations" && request.method === "POST")'),b=source.indexOf("  if (pathname === '/api/admin/dentweb/reservation-operation-capabilities'",a);
 const handler=vm.runInContext('(async function(pathname,request,response,adminAuthorized){'+source.slice(a,b)+'})',ctx);
 async function call(auth,e){saved=undefined;let status;await handler('/api/admin/reservations',{method:'POST',body:{...record,date:'2030-01-07',time:'10:00',sharedPhoneIdentity:e}},{writeHead:s=>status=s,end:()=>{}},auth);return status;}
 assert.equal(await call(false,evidence),401);assert.equal(saved,undefined);
 assert.equal(await call(true,{...evidence,expectedPatientIds:[]}),400);assert.equal(saved,undefined);
 await call(true,evidence);assert.deepEqual(JSON.parse(JSON.stringify(saved.sharedPhoneIdentity)),validateSharedPhoneIdentity(evidence,record));
});
test('older agents cannot claim shared-phone jobs and capable agents receive evidence',async()=>{
 let claimed;
 const item={...record,id:'example',sharedPhoneIdentity:evidence,dentwebSyncStatus:'pending'};
 const ctx=vm.createContext({readInbox:async()=>[item],getInboxCollection:async()=>null,provisionalConflict:()=>false,mkdir:async()=>{},writeFile:async()=>{},dataDir:'private',inboxPath:'private/inbox',process:{env:{}},console:{error:()=>{}},requestAuth:()=>{}});
 const a=source.indexOf('  if (pathname === "/api/admin/dentweb/jobs/next"'),b=source.indexOf('  if (pathname.startsWith("/api/admin/reservations/") && request.method === "PUT")',a);
 const handler=vm.runInContext('(async function(pathname,request,response,adminAuthorized){'+source.slice(a,b)+'})',ctx);
 async function call(header){await handler('/api/admin/dentweb/jobs/next',{method:'GET',headers:{'x-dentweb-provisional':'1',...header}},{writeHead:()=>{},end:s=>claimed=JSON.parse(s)},true);return claimed;}
 assert.equal((await call({})).job,null);assert.equal(item.dentwebSyncStatus,'pending');
 assert.deepEqual((await call({'x-dentweb-shared-phone':'1'})).job.sharedPhoneIdentity,evidence);
});
