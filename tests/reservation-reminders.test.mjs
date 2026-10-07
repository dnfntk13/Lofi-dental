import test from 'node:test';
import assert from 'node:assert/strict';
import {reminderPlan, deliverReminders, reminderMessage} from '../lib/reservation-reminders.mjs';
const now = new Date('2026-10-07T00:00:00Z');
const row = {id:'one',email:'patient@example.invalid',date:'2026-10-09',time:'4:00 PM'};
test('KST calendar stages, 9am, past appointment and invalid times',()=>{
 assert.equal(reminderPlan(row,now).days,2);
 assert.equal(reminderPlan({...row,date:'2026-10-08'},now).days,1);
 assert.equal(reminderPlan({...row,date:'2026-10-07'},now).days,0);
 for(const r of [{...row,date:'2026-10-10'},{...row,time:'25:00'},{...row,date:'2026-02-30'},{...row,date:'2026-10-07',time:'09:00'}])assert.equal(reminderPlan(r,now),null);
 assert.equal(reminderPlan(row,new Date('2026-10-06T23:59:59Z')),null);
 assert.equal(reminderMessage(reminderPlan(row,now)).from,'lofidentalcs@lofiesthetic.com');
});
test('skip cancelled, completed, pending, unavailable email and excluded records',()=>{
 for(const patch of [{status:'cancelled'},{bookingStatus:'pending'},{cancelledAt:'today'},{completedAt:'today'},{concerns:'내원 완료'},{concerns:'컨코스 유입'},{email:''},{dentwebSyncStatus:'pending'},{remindersDisabled:true}]) assert.equal(reminderPlan({...row,...patch},now),null);
});
test('persistent claim deduplicates retries, duplicate rows and concurrent workers',async()=>{
 const claims=new Set();let sent=0;
 const opts={records:[row,{...row,id:'two'}],readCurrent:async id=>({...row,id}),claim:async p=>{if(claims.has(p.key))return false;claims.add(p.key);return true},finish:async()=>{},send:async()=>{sent++},now,clock:()=>now};
 await Promise.all([deliverReminders(opts),deliverReminders(opts)]);await deliverReminders(opts);assert.equal(sent,1);
});
test('recheck prevents rescheduled or deleted appointment and ambiguity is not retried',async()=>{
 let sent=0,status;let reads=0;
 const opts={records:[row],readCurrent:async()=>++reads===1?row:null,claim:async()=>true,finish:async(p,s)=>{status=s},send:async()=>{sent++},now,clock:()=>now};
 await deliverReminders(opts);assert.equal(sent,0);assert.equal(status,'skipped');
 const claims=new Set();Object.assign(opts,{readCurrent:async()=>row,claim:async p=>{if(claims.has(p.key))return false;claims.add(p.key);return true},send:async()=>{sent++;throw Error('uncertain')}});
 await deliverReminders(opts);await deliverReminders(opts);assert.equal(sent,1);assert.equal(status,'needs_review');
 assert.notEqual(reminderPlan(row,now).key,reminderPlan({...row,time:'17:00'},now).key);
});
