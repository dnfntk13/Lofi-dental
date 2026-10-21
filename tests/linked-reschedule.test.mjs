import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { queueLinkedReschedule, assertRescheduleCallback, validateRescheduleRequest, appointmentStamp } from '../lib/linked-reschedule.mjs';
import { autoQueueDentweb } from '../lib/dentweb-auto-queue.mjs';
import { queueCancellation } from '../lib/reservation-cancellation.mjs';
const request = { operationId:'fictional-operation-001', expected:{reservationId:42,patientId:17,name:'Fictional Patient',phone:'010-1111-2222',date:'2030-01-02',time:'15:00',state:0,durationMinutes:30,memoSha256:createHash('sha256').update('직원 메모').digest('hex')},target:{date:'2030-01-03',time:'16:00'} };
const record = {id:'imported-fixture',source:'dentweb',dentwebReservationId:42,date:'2029-12-31',time:'09:00',name:'Historical alias',concerns:'Preserve web snapshot',durationMinutes:30,dentwebSyncStatus:'completed'};
test('explicit request preserves historical web fields, source, identity and link',()=>{
  const next=queueLinkedReschedule(record,request);
  for(const key of Object.keys(record).filter(k=>k!=='dentwebSyncStatus')) assert.deepEqual(next[key],record[key]);
  assert.equal(next.dentwebAction,'linked-reschedule');
  assert.equal(next.dentwebSyncStatus,'pending');
  assert.equal(autoQueueDentweb(next,{previous:record,date:'2030-01-03',time:'16:00'}),next);
  assert.throws(()=>queueCancellation(next,42));
});
test('same-operation replay is idempotent across queue, failure and completion; changed or second requests reject',()=>{
  const queued=queueLinkedReschedule(record,request);
  for(const status of ['pending','processing','failed','completed']) {
    const row={...queued,dentwebSyncStatus:status};
    assert.equal(queueLinkedReschedule(row,structuredClone(request)),row);
    assert.throws(()=>queueLinkedReschedule(row,{...request,target:{date:'2030-01-04',time:'16:00'}}));
    assert.throws(()=>queueLinkedReschedule(row,{...request,operationId:'fictional-operation-002'}));
  }
});
test('unlinked, wrong source, wrong link, concurrent and cancelled records reject',()=>{
  for(const row of [null,{...record,source:'web'},{...record,dentwebReservationId:43},{...record,dentwebSyncStatus:'pending'},{...record,dentwebSyncStatus:'processing'},{...record,dentwebSyncStatus:'failed'},{...record,cancelledAt:'2030-01-01'}]) assert.throws(()=>queueLinkedReschedule(row,request));
});
test('requires exact native verification inputs and valid unambiguous dates',()=>{
  for(const patch of [{patientId:0},{state:2},{durationMinutes:null},{memoSha256:''},{phone:''},{reservationId:'42'},{date:'2030-02-30'},{time:'4 PM'}]) assert.throws(()=>validateRescheduleRequest({...request,expected:{...request.expected,...patch}}));
  assert.throws(()=>validateRescheduleRequest({...request,target:{date:'2030-01-02',time:'15:00'}}));
  assert.equal(appointmentStamp('2030-01-03','16:00'),'203001031600');
});
test('callbacks require claimed matching operation and actual post-commit readback',()=>{
  const row={...queueLinkedReschedule(record,request),dentwebSyncStatus:'processing'};
  const verified={reservationId:42,patientId:17,name:request.expected.name,phone:request.expected.phone,appointmentAt:'203001031600',state:0,durationMinutes:30,memoSha256:request.expected.memoSha256};
  const payload={status:'completed',action:'linked-reschedule',operationId:request.operationId,dentwebReservationId:42,verification:verified};
  assert.doesNotThrow(()=>assertRescheduleCallback(row,payload));
  for(const patch of [{operationId:'stale'},{action:'upsert'},{dentwebReservationId:43},{verification:null},{status:'pending'}]) assert.throws(()=>assertRescheduleCallback(row,{...payload,...patch}));
  for(const patch of [{appointmentAt:'203001021500'},{state:2},{patientId:18},{durationMinutes:60},{memoSha256:'changed'},{name:'Other'}]) assert.throws(()=>assertRescheduleCallback(row,{...payload,verification:{...verified,...patch}}));
  assert.throws(()=>assertRescheduleCallback({...row,dentwebSyncStatus:'pending'},payload));
  assert.throws(()=>assertRescheduleCallback(record,payload));
  assert.doesNotThrow(()=>assertRescheduleCallback(row,{...payload,status:'failed',verification:undefined}));
});
