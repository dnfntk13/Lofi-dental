import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {supersedeProvisional} from '../lib/dentweb-provisional.mjs';
const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
const a=source.indexOf('  const supersedeMatch'),b=source.indexOf('  const cancelMatch',a);
test('duplicate resolution is authenticated, atomic, and preserves the original request',async()=>{
 let old={id:'1793359847995-old',email:'p@example.com',date:'2030-01-07',time:'10:00',dentwebSyncStatus:'waiting_identity'},race=false,atomic=true;
 const replacement={...old,id:'1793359847995-new',time:'13:00'};
 const collection={findOne:async({id})=>structuredClone(id===old.id?old:replacement),replaceOne:async(filter,next)=>{
   if(race)old.dentwebSyncStatus='processing';
   if(Object.entries(filter).some(([k,v])=>(old[k]??null)!==(v??null)))return {matchedCount:0};
   old=structuredClone(next);return {matchedCount:1};}};
 const ctx=vm.createContext({supersedeProvisional,getInboxCollection:async()=>atomic?collection:null,getJsonBody:async r=>r.body,requestAuth:r=>{r.writeHead(401);r.end('{}');}});
 const handler=vm.runInContext('(async function(pathname,request,response,adminAuthorized){'+source.slice(a,b)+'})',ctx);
 async function call(auth=true){const result={};await handler('/api/admin/reservations/'+old.id+'/supersede',{method:'POST',body:{replacementId:replacement.id,evidence:'Patient confirmed 13:00'}},{writeHead:s=>result.status=s,end:t=>result.body=JSON.parse(t)},auth);return result;}
 assert.equal((await call(false)).status,401);atomic=false;assert.equal((await call()).status,409);atomic=true;
 race=true;assert.equal((await call()).status,409);assert.equal(old.cancelledAt,undefined);
 race=false;old.dentwebSyncStatus='waiting_identity';assert.equal((await call()).status,200);
 assert.equal(old.time,'10:00');assert.equal(old.status,'cancelled');assert.equal(old.supersededBy,replacement.id);
 assert.equal((await call()).status,200);
});
