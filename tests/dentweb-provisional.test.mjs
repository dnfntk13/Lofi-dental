import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDentwebIdentity } from '../lib/dentweb-job-identity.mjs';
import { provisionalConflict, supersedeProvisional } from '../lib/dentweb-provisional.mjs';
const request={id:'1793359847995-test',email:'patient@example.com',date:'2030-01-07',time:'11:00',name:'',phone:''};
test('email-only booking has no invented phone and distinct idempotency per web record',()=>{
  const job=prepareDentwebIdentity(request);
  assert.equal(job.phone,'');assert.match(job.name,/^가예약 /);assert.equal(job.durationMinutes,30);
  assert.match(job.concerns,/patient@example.com/);
  assert.notEqual(prepareDentwebIdentity({...request,id:'1793359847995-other'}).identityMarker,job.identityMarker);
  assert.notEqual(prepareDentwebIdentity({...request,email:'other@example.com'}).identityMarker,job.identityMarker);
  assert.equal(prepareDentwebIdentity({...request,name:'Real Name',phone:'01055550123'}).identityMarker,job.identityMarker);
});
test('bad identity without a web email key remains rejected; imported native appointments cannot become provisional',()=>{
  for(const delta of [{id:'chat-123'}, {email:'not email'}, {email:'x@chat.lofi.internal'}, {source:'dentweb'}])
    assert.throws(()=>prepareDentwebIdentity({...request,...delta}),/DENTWEB_IDENTITY_REQUIRED/);
});
test('same email/day repeated requests are held for review, cancelled ones excluded',()=>{
  const other={...request,id:'1793359847995-other',time:'14:00'};
  assert.equal(provisionalConflict(request,[request,other]),true);
  assert.equal(provisionalConflict(request,[request,{...other,cancelledAt:'2030-01-01'}]),false);
  assert.equal(provisionalConflict(request,[request,{...other,date:'2030-01-08'}]),false);
});

test('verified time choice preserves cancelled request and never supersedes queued or linked work',()=>{
  const old={...request,dentwebSyncStatus:'waiting_identity',concerns:'Original concern'};
  const next={...request,id:'1793359847995-other',time:'13:00'};
  const result=supersedeProvisional(old,next,'Patient email selected 13:00');
  assert.equal(result.time,old.time);assert.equal(result.concerns,old.concerns);
  assert.equal(result.supersededBy,next.id);assert.ok(result.cancelledAt);
  assert.equal(provisionalConflict(next,[result,next]),false);
  assert.equal(supersedeProvisional(result,next,'Same evidence'),result);
  for(const delta of [{dentwebSyncStatus:'pending'},{dentwebReservationId:123},{dentwebQueuedAt:'previous'},{dentwebProcessingAt:'previous'},{dentwebSyncedAt:'previous'}])
    assert.throws(()=>supersedeProvisional({...old,...delta},next,'Evidence'),/unsubmitted/);
  assert.throws(()=>supersedeProvisional(old,{...next,email:'other@example.com'},'Evidence'),/Matching/);
  assert.throws(()=>supersedeProvisional(old,next,''),/evidence/);
});
