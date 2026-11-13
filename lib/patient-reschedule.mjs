import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { validateOperation } from './reservation-operations.mjs';
import { changeTimes, validChangeDay, koreanNow, minuteOf } from './patient-reschedule-times.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
// Two user-confirmed test reservations; no heuristic exclusion by name or notes.
const excludedWebHashes = new Set(['fba688ce2faf8659f129ab1903a0c8f86305da100fdd6f8434c9d78ec20ba978', 'a046824793fed6cd9239e1ceb219226f679e9dc31574860063dcb74f9a757ee7']);
const excluded = r => excludedWebHashes.has(hash(String(r.id)));
const emailOf = e => String(e||'').trim().toLowerCase();
const fail = (code,statusCode=409) => { throw Object.assign(new Error(code),{code,statusCode}); };
const inactive = r => r.cancelledAt || ['cancelled','completed','visited'].includes(r.status) || r.dentwebAction==='cancel';
const tokenPattern = /^[a-f0-9]{64}$/;
export function createPatientReschedule({ getCollection, getInboxCollection, operations, sendCode, mailReady, normalizeTime, now=()=>new Date() }) {
  async function db(){const c=await getCollection();if(!c)fail('unavailable',503);return c;}
  const fingerprint = r => hash(JSON.stringify([r.id,r.email,r.date,r.time,r.name,r.phone,r.dentwebReservationId,r.dentwebSyncStatus,r.dentwebSyncUpdatedAt,r.updatedAt,r.cancelledAt,r.status,r.durationMinutes,r.dentwebOperationId]));
  const eligible = r => !excluded(r) && !inactive(r) && r.source!=='dentweb' && Number.isSafeInteger(r.dentwebReservationId) && r.dentwebReservationId>0 && r.dentwebSyncStatus==='completed' && !r.dentwebReschedule;
  const future = r => /^\d{4}-\d{2}-\d{2}$/.test(r.date||'') && r.date+'T'+normalizeTime(r.time)>koreanNow(now());
  async function owned(email,id){
    if(typeof id!=='string'||id.length>100)fail('not_found',404);
    const r=await (await getInboxCollection()).findOne({id});
    if(!r||excluded(r)||emailOf(r.email)!==email||r.source==='dentweb')fail('not_found',404);
    return r;
  }
  async function heartbeat(){await (await db()).updateOne({_id:'agent'},{$set:{kind:'agent',seenAt:now()}},{upsert:true});}
  async function online(){const a=await (await db()).findOne({_id:'agent'});return !!a&&now()-new Date(a.seenAt)<45000;}
  async function config(){return {available:Boolean(mailReady())&&await online()};}
  async function rate(key,limit){
    const hour=Math.floor(now().getTime()/3600000),c=await db();
    const doc=await c.findOneAndUpdate({_id:'rate:'+hash(key)+':'+hour},{$inc:{count:1},$set:{kind:'rate',expiresAt:new Date((hour+2)*3600000)}},{upsert:true,returnDocument:'after'});
    if(doc.count>limit)fail('rate_limited',429);
  }
  async function start(email,ip){
    email=emailOf(email);
    if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))fail('invalid_email',400);
    if(!mailReady()||!await online())fail('clinic_offline',503);
    await rate('send-global',100); await rate('send-ip:'+ip,20); await rate('send-email:'+email,5);
    const c=await db(),id='challenge:'+hash(email),time=now(),secret=randomBytes(32).toString('hex'),code=String(randomInt(100000,1000000));
    const challenge={kind:'challenge',email,secret,codeHash:hash(secret+code),attempts:0,used:false,sentAt:time,expiresAt:new Date(+time+600000)};
    try{
      const saved=await c.findOneAndUpdate({_id:id,$or:[{sentAt:{$lte:new Date(+time-60000)}},{sentAt:{$exists:false}}]},{$set:challenge},{upsert:true,returnDocument:'after'});
      if(!saved)fail('rate_limited',429);
    }catch(e){if(e.code===11000)fail('rate_limited',429);throw e;}
    try{await sendCode(email,code);}catch{await c.updateOne({_id:id,secret},{$set:{used:true}});fail('email_unavailable',503);}
    return {ok:true};
  }
  async function verify(email,code,ip){
    email=emailOf(email); await rate('verify-ip:'+ip,40);
    if(email.length>254||!/^\d{6}$/.test(String(code||'')))fail('invalid_code',400);
    const c=await db(),id='challenge:'+hash(email);
    const challenge=await c.findOneAndUpdate({_id:id,used:false,attempts:{$lt:5},expiresAt:{$gt:now()}},{$inc:{attempts:1}},{returnDocument:'after'});
    if(!challenge||hash(challenge.secret+code)!==challenge.codeHash)fail('invalid_code',400);
    const used=await c.updateOne({_id:id,secret:challenge.secret,used:false},{$set:{used:true},$unset:{codeHash:'',secret:''}});
    if(!used.matchedCount)fail('invalid_code',400);
    const token=randomBytes(32).toString('hex');
    await c.insertOne({_id:'session:'+hash(token),kind:'session',email,expiresAt:new Date(+now()+1800000)});
    return {token,expiresInSeconds:1800};
  }
  async function authenticate(token){
    if(!tokenPattern.test(token||''))fail('authentication_required',401);
    const s=await (await db()).findOne({_id:'session:'+hash(token),expiresAt:{$gt:now()}});
    if(!s)fail('authentication_required',401);return s.email;
  }
  async function logout(token){if(tokenPattern.test(token||''))await (await db()).deleteOne({_id:'session:'+hash(token)});return {ok:true};}
  const displayOperation = op => !op?null:({operationId:op.request.operationId,date:op.request.target.date,time:op.request.target.time,
    status:op.status==='completed'&&op.nativeVerified&&op.webVerified?'completed':['failed','rejected'].includes(op.status)?'needs_review':'processing'});
  async function list(email){
    const records=await (await getInboxCollection()).find({email:{$regex:'^'+email.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$',$options:'i'},source:{$ne:'dentweb'}}).toArray();
    const result=[];
    for(const r of records.filter(r=>!excluded(r)&&future(r)&&!inactive(r)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,30)){
      const journal=Number(r.dentwebReservationId)>0?await operations.get(r.dentwebReservationId):null;
      const op=journal?.current;
      const busy=op&&!['completed','rejected'].includes(op.status);
      result.push({id:r.id,date:r.date,time:normalizeTime(r.time),name:String(r.name||'').slice(0,80),canReschedule:eligible(r)&&!busy,
        change:op?.patientSelfService&&op.linkedBefore?.some(b=>b.id===r.id&&emailOf(b.email)===email)?displayOperation(op):null});
    }
    return {reservations:result,timezone:'Asia/Seoul'};
  }
  async function availability(email,id,date){
    const r=await owned(email,id);
    if(!eligible(r)||!future(r))fail('clinic_review_required');
    if(!validChangeDay(date,now()))fail('invalid_day',400);
    if(!await online())fail('clinic_offline',503);
    await operations.assertIdle(r.dentwebReservationId);
    await rate('read:'+email,60);
    const c=await db(),fp=fingerprint(r);
    const old=await c.findOne({kind:'read',email,webId:id,date,fingerprint:fp,status:{$in:['pending','processing','ready']},createdAt:{$gt:new Date(+now()-60000)}});
    if(old)return {readId:old._id.slice(5),status:old.status};
    const readId=randomUUID();
    await c.insertOne({_id:'read:'+readId,kind:'read',email,webId:id,date,fingerprint:fp,createdAt:now(),expiresAt:new Date(+now()+600000),status:'pending',
      dentwebReservationId:r.dentwebReservationId,expectedWeb:{id:r.id,date:r.date,time:normalizeTime(r.time),name:String(r.name||''),phone:String(r.phone||'')}});
    return {readId,status:'pending'};
  }
  async function claimRead(){
    const c=await db(),leaseToken=randomUUID();
    const r=await c.findOneAndUpdate({kind:'read',expiresAt:{$gt:now()},$or:[{status:'pending'},{status:'processing',claimedAt:{$lt:new Date(+now()-60000)}}]},
      {$set:{status:'processing',claimedAt:now(),leaseToken}},{sort:{createdAt:1},returnDocument:'after'});
    return r?{id:r._id.slice(5),action:'patient-reschedule-read',leaseToken,dentwebReservationId:r.dentwebReservationId,expectedWeb:r.expectedWeb,date:r.date}:null;
  }
  async function readResult(id,payload){
    const c=await db(),r=await c.findOne({_id:'read:'+id,kind:'read'});
    if(!r||r.leaseToken!==payload.leaseToken||!['processing','ready','failed'].includes(r.status))fail('invalid_result');
    if(r.status!=='processing')return {ok:true};
    let fields;
    if(payload.status==='failed')fields={status:'failed',error:'clinic_review_required',checkedAt:now()};
    else if(payload.status==='completed'){
      const expected=validateOperation({operationId:id,action:'cancel',expected:payload.verification},r.dentwebReservationId).expected;
      if(expected.date!==r.expectedWeb.date||expected.time!==r.expectedWeb.time)fail('invalid_result');
      const b=payload.busyIntervals;
      if(!Array.isArray(b)||b.length>2000||b.some(x=>!Number.isInteger(x.startMinute)||!Number.isInteger(x.endMinute)||x.startMinute< -1440||x.endMinute>2880||x.endMinute<=x.startMinute))fail('invalid_result');
      fields={status:'ready',expected,busyIntervals:b.map(x=>({startMinute:x.startMinute,endMinute:x.endMinute})),checkedAt:now()};
    }else fail('invalid_result');
    const saved=await c.updateOne({_id:r._id,status:'processing',leaseToken:r.leaseToken},{$set:fields});
    if(!saved.matchedCount)fail('invalid_result');return {ok:true};
  }
  async function readOwned(email,id){
    if(!/^[a-f0-9-]{36}$/.test(id||''))fail('not_found',404);
    const r=await (await db()).findOne({_id:'read:'+id,kind:'read',email});
    if(!r)fail('not_found',404);return r;
  }
  async function slots(email,read){
    const row=await owned(email,read.webId);
    if(!eligible(row)||!future(row)||fingerprint(row)!==read.fingerprint)fail('reservation_changed');
    if(read.status==='failed')return {status:'needs_review',times:[]};
    if(new Date(read.expiresAt)<=now()||(read.checkedAt&&now()-new Date(read.checkedAt)>120000))fail('availability_expired');
    if(read.status!=='ready')return {status:'checking',times:[]};
    const busy=[...read.busyIntervals];
    const others=await (await getInboxCollection()).find({date:read.date}).toArray();
    for(const r of others){if(r.id===row.id||excluded(r)||inactive(r))continue;const t=normalizeTime(r.time);if(!/^\d\d:\d\d$/.test(t))continue;
      const startMinute=minuteOf(t),d=Number(r.durationMinutes||30);if(!Number.isInteger(d)||d<1||d>255)fail('clinic_review_required');busy.push({startMinute,endMinute:startMinute+d});}
    const times=changeTimes(read.date,read.expected.durationMinutes,busy,now()).filter(t=>read.date!==row.date||t!==normalizeTime(row.time));
    return {status:'ready',date:read.date,times,durationMinutes:read.expected.durationMinutes,expiresAt:new Date(+new Date(read.checkedAt)+120000).toISOString()};
  }
  async function getAvailability(email,id){return slots(email,await readOwned(email,id));}
  async function submit(email,{readId,time,requestId}){
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId||''))fail('invalid_request',400);
    const read=await readOwned(email,readId),operationId='patient-'+hash(email+'|'+read.webId+'|'+requestId).slice(0,40);
    const previous=await operations.get(read.dentwebReservationId,operationId);
    if(previous){if(!previous.patientSelfService||previous.request.target.date!==read.date||previous.request.target.time!==time)fail('request_changed');return {change:displayOperation(previous)};}
    if(!await online())fail('clinic_offline',503);
    const available=await slots(email,read);
    if(available.status!=='ready'||!available.times.includes(time))fail('time_unavailable');
    const row=await owned(email,read.webId);
    const op=await operations.queue(read.dentwebReservationId,{operationId,action:'reschedule',expected:read.expected,target:{date:read.date,time}},
      {patientSelfService:true,webId:row.id,webFingerprint:read.fingerprint,checkWeb:r=>fingerprint(r)===read.fingerprint});
    return {change:displayOperation(op)};
  }
  async function status(email,id,operationId){
    const r=await owned(email,id);
    const op=await operations.get(r.dentwebReservationId,operationId);
    if(!op?.patientSelfService||!op.linkedBefore.some(b=>b.id===id&&emailOf(b.email)===email))fail('not_found',404);
    return {change:displayOperation(op)};
  }
  return {config,start,verify,authenticate,logout,list,availability,getAvailability,submit,status,heartbeat,claimRead,readResult};
}
