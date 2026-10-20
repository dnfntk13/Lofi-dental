import test from 'node:test';
import assert from 'node:assert/strict';
import { queueCancellation, isCancelledReservation } from '../lib/reservation-cancellation.mjs';
const record={id:'web-1',source:'dentweb',dentwebReservationId:42,date:'2030-01-01',time:'10:00',name:'Test',phone:'01011112222',dentwebSyncStatus:'completed'};
test('explicit cancellation preserves imported linked record and waits for agent completion',()=>{
  const queued=queueCancellation(record,42);
  assert.equal(queued.dentwebAction,'cancel');
  assert.equal(queued.dentwebSyncStatus,'pending');
  for(const key of ['id','source','dentwebReservationId','date','time','name','phone']) assert.equal(queued[key],record[key]);
  assert.equal(isCancelledReservation(queued),false);
  assert.equal(queueCancellation(queued,42),queued);
  const completed={...queued,status:'cancelled',cancelledAt:'2030-01-01'};
  assert.equal(isCancelledReservation(completed),true);
  assert.equal(queueCancellation(completed,42),completed);
});
test('missing link, mismatch and concurrent sync cannot be cancelled',()=>{
  assert.throws(()=>queueCancellation(null,42));
  assert.throws(()=>queueCancellation({...record,dentwebReservationId:null},42));
  assert.throws(()=>queueCancellation(record,43));
  assert.throws(()=>queueCancellation({...record,dentwebSyncStatus:'processing'},42));
});
