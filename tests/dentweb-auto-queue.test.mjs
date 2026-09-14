import test from 'node:test';
import assert from 'node:assert/strict';
import { autoQueueDentweb } from '../lib/dentweb-auto-queue.mjs';
const options = { date:'2026-09-16', time:'10:00', now:new Date('2026-09-14T10:00:00Z') };
test('calendar, AI and public bookings queue when scheduled',()=>{
  for(const source of ['admin','admin-ai','web']) assert.equal(autoQueueDentweb({name:'Test',source},options).dentwebSyncStatus,'pending');
});
test('imports, existing queues and completed registrations never requeue',()=>{
  for(const record of [{name:'Test',source:'dentweb'},{name:'Test',dentwebSyncStatus:'completed'},{name:'Test',dentwebSyncStatus:'processing'},{name:'Test',dentwebSyncStatus:'failed'},{name:'Test',dentwebReservationId:123}]) assert.equal(autoQueueDentweb(record,options),record);
});
test('unscheduled, invalid and past appointments are excluded',()=>{
  for(const o of [{...options,time:''},{...options,date:''},{...options,date:'2026-09-13'}]) assert.equal(autoQueueDentweb({name:'Test'},o).dentwebSyncStatus,undefined);
  assert.equal(autoQueueDentweb({},options).dentwebSyncStatus,undefined);
});
