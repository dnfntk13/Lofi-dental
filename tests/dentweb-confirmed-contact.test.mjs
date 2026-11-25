import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminContactFields, prepareDentwebIdentity } from '../lib/dentweb-job-identity.mjs';
import { autoQueueDentweb } from '../lib/dentweb-auto-queue.mjs';
import { provisionalConflict } from '../lib/dentweb-provisional.mjs';

const slot = {date:'2030-01-07', time:'14:00'};
const booking = {id:'1793359847995-example', ...slot, name:'Example Patient', email:'guest@example.com'};
const confirmed = {...booking, ...adminContactFields({scheduleConfirmed:true},slot.date,slot.time)};
test('an agreed slot, real name and external email promote the linked provisional reservation', () => {
  const prior = {...booking, dentwebReservationId:21, dentwebSyncStatus:'completed'};
  const later = {...prior, ...confirmed};
  const queued = autoQueueDentweb(later,{...slot, previous:prior});
  const job = prepareDentwebIdentity(queued);
  assert.equal(queued.dentwebSyncStatus,'pending');
  assert.equal(job.name, booking.name);
  assert.equal(job.phone,'');
  assert.equal(job.dentwebReservationId,21);
  assert.equal(job.time,prior.time);
  assert.equal(job.identityMarker,prepareDentwebIdentity(prior).identityMarker);
  assert.equal(job.provisional,false);
  assert.match(job.concerns,/guest@example.com/);
  assert.equal(prepareDentwebIdentity({...confirmed,phone:'010-1234-1234'}).phone,'');
  assert.equal(provisionalConflict(confirmed,[{...confirmed,id:'another'}]),true);
});
test('confirmation binds to a real slot, not an inquiry or an earlier time', () => {
  assert.equal(prepareDentwebIdentity(booking).provisional,true);
  for (const delta of [{confirmedSlot:null},{time:'15:00'},{date:'2030-02-31'}]) {
    const record={...confirmed,...delta};
    assert.throws(()=>prepareDentwebIdentity(record),/UNCONFIRMED/);
    assert.equal(autoQueueDentweb(record,{...slot}).dentwebSyncStatus,'waiting_confirmation');
  }
  for (const name of ['', booking.email, '가예약 guest@example.com','unknown','Instagram 12345']) {
    assert.equal(prepareDentwebIdentity({...confirmed,name}).provisional,true);
  }
  assert.throws(()=>prepareDentwebIdentity({...confirmed,email:'abc@schedule.lofi.internal'}),/IDENTITY_REQUIRED/);
});
test('staff-verified messaging contact works without a phone or email', () => {
  const fields=adminContactFields({scheduleConfirmed:true,verifiedMessagingContact:{channel:'instagram',account:'@example'}},slot.date,slot.time);
  const job=prepareDentwebIdentity({...booking,email:'',...fields});
  assert.equal(job.name,booking.name);
  assert.equal(job.phone,'');
  assert.equal(job.provisional,false);
  assert.match(job.concerns,/instagram:@example/);
  assert.throws(()=>adminContactFields({verifiedMessagingContact:{channel:'instagram',account:''}},slot.date,slot.time));
  assert.throws(()=>prepareDentwebIdentity({...booking,email:'',concerns:'Instagram @example'}),/IDENTITY_REQUIRED/);
});
