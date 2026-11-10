import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { assertReservationWindowAllowed, blockedReservationTimes, protectedReservationOverlap, protectedReservationWindows } from '../lib/reservation-windows.mjs';
import { autoQueueDentweb } from '../lib/dentweb-auto-queue.mjs';
import { reservationDuration } from '../lib/reservation-duration.mjs';
import { queueLinkedReschedule, validateRescheduleRequest } from '../lib/linked-reschedule.mjs';

const slot = (time, durationMinutes = 30, date = '2026-11-12') => ({ date, time, durationMinutes });
test('half-open KST protection includes earlier starts and full-span appointments, not adjacent dates', () => {
  for (const record of [slot('13:30',31),slot('14:00'),slot('16:59',1),slot('13:00',255),slot('2:00 PM'),slot('오후 4:30')]) {
    assert.throws(() => assertReservationWindowAllowed(record), { code:'RESERVATION_TIME_BLOCKED', statusCode:409 });
  }
  for (const record of [slot('13:30'),slot('17:00'),slot('12:00 PM'),slot('12:00 AM'),slot('14:00',30,'2026-11-11'),slot('14:00',30,'2026-11-13')]) {
    assert.doesNotThrow(() => assertReservationWindowAllowed(record));
  }
  assert.throws(() => assertReservationWindowAllowed({date:'2026-11-12',time:'14:00'}), {statusCode:409});
  for (const time of ['25:00','13:00 PM','14:99']) assert.throws(() => assertReservationWindowAllowed(slot(time)), {statusCode:400});
  assert.deepEqual(blockedReservationTimes('2026-11-12'), ['14:00','14:30','15:00','15:30','16:00','16:30']);
  assert.ok(blockedReservationTimes('2026-11-12',60).includes('13:30'));
  assert.equal(protectedReservationOverlap(slot('17:00')),null);
});

test('central web queue rejects new and moved appointments before identity checks; preserves old metadata and cancellations', () => {
  const previous = {...slot('15:30'),id:'fixture',dentwebReservationId:42,dentwebSyncStatus:'completed'};
  assert.throws(() => autoQueueDentweb(slot('15:30')), {statusCode:409});
  assert.throws(() => autoQueueDentweb(previous,{previous:{...previous,time:'17:00'}}), {statusCode:409});
  assert.throws(() => autoQueueDentweb({...previous,durationMinutes:60},{previous}), {statusCode:409});
  assert.doesNotThrow(() => autoQueueDentweb({...previous,concerns:'updated metadata'},{previous}));
  assert.doesNotThrow(() => autoQueueDentweb({...previous,time:'3:30 PM'},{previous}));
  assert.doesNotThrow(() => autoQueueDentweb({...previous,status:'cancelled'},{previous}));
  assert.throws(() => assertReservationWindowAllowed(previous,{...previous,status:'cancelled'}), {statusCode:409});
});

test('legacy reschedule rejects overlap but retains idempotent already queued requests', () => {
  const input = {operationId:'fixture-window-reschedule',expected:{reservationId:42,patientId:17,name:'Fixture',phone:'01011112222',date:'2026-11-13',time:'14:00',state:0,durationMinutes:60,memoSha256:'a'.repeat(64)},target:slot('13:30')};
  const before = {source:'dentweb',dentwebReservationId:42,dentwebSyncStatus:'completed'};
  assert.throws(() => queueLinkedReschedule(before,input), {statusCode:409});
  const request = validateRescheduleRequest(input);
  const already = {...before,dentwebReschedule:request};
  assert.equal(queueLinkedReschedule(already,input),already);
});

test('public/admin HTTP rejection has no booking writes; availability and both update stores agree', async () => {
  const source = await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  let writes=0, saved={id:'fixture',...slot('17:00'),name:'Fixture',dentwebReservationId:42,dentwebSyncStatus:'completed'};
  let mongo=true;
  const collection={findOne:async()=>saved,replaceOne:async(_,r)=>{writes++;saved=r;return {matchedCount:1};}};
  const context=vm.createContext({ console:{error(){}}, reservationDuration, autoQueueDentweb, assertReservationWindowAllowed,
    blockedReservationTimes, protectedReservationWindows, reservationOperations:{assertIdle:async()=>{}},
    getJsonBody:async r=>r.body, getInboxCollection:async()=>mongo?collection:null,
    readInbox:async()=>[saved], mkdir:async()=>{},writeFile:async(_,content)=>{writes++;saved=JSON.parse(content)[0];}, dataDir:'fixture',inboxPath:'fixture',
    addInboxRecord:async r=>{autoQueueDentweb(r);writes++;saved=r;}, getPatientThreadEmail:()=>'',
    saveOrUpdateEmailThread:async()=>{},saveOrUpdatePatient:async()=>{},isValidEmail:()=>true,
    normalizeReservationDate:x=>x, normalizeReservationTime:x=>x, getReservedTimesForDate:()=>['10:00'],
    reservationCorsHeaders:{}, requestAuth:r=>{r.writeHead(401);r.end('{}');},
  });
  function route(start,end) {
    const a=source.indexOf(start),b=source.indexOf(end,a+start.length); assert.ok(a>=0&&b>a);
    return vm.runInContext(`(async function(pathname,request,response,requestUrl,adminAuthorized=true){${source.slice(a,b)}})`,context);
  }
  const create=route('  if (pathname === "/api/admin/reservations"','  const dentwebSyncMatch');
  const update=route('  if (pathname.startsWith("/api/admin/reservations/") && request.method === "PUT")','  if (pathname.startsWith("/api/admin/reservations/") && request.method === "DELETE")');
  const publicCreate=route('  if (pathname === "/api/reservations" && request.method === "POST")','  if (pathname === "/api/consult-chat"');
  const availability=route('  if (pathname === "/api/reservation-availability"','  if (pathname === "/api/reservations" && request.method === "POST")');
  async function call(handler,path,method,body,url='https://example.test/') {
    const result={};await handler(path,{method,body},{writeHead:s=>result.status=s,end:b=>result.body=JSON.parse(b)},new URL(url));return result;
  }
  // Deliberately omit contact/name so these probes can never create a real booking.
  for (const [handler,path] of [[publicCreate,'/api/reservations'],[create,'/api/admin/reservations']]) {
    const result=await call(handler,path,'POST',slot('14:30'));
    assert.equal(result.status,409);assert.equal(result.body.code,'RESERVATION_TIME_BLOCKED');assert.equal(writes,0);
    assert.equal((await call(handler,path,'POST',slot('17:00'))).status,400);
  }
  for (const store of [true,false]) {
    mongo=store;saved={...saved,...slot('17:00')};const before=structuredClone(saved),n=writes;
    assert.equal((await call(update,'/api/admin/reservations/fixture','PUT',slot('13:30',60))).status,409);
    assert.deepEqual(saved,before);assert.equal(writes,n);
    saved={...saved,...slot('15:30')};
    assert.equal((await call(update,'/api/admin/reservations/fixture','PUT',{...slot('15:30'),concerns:'metadata'})).status,200);
    assert.equal(saved.dentwebReservationId,42);assert.equal(saved.time,'15:30');
  }
  const result=await call(availability,'/api/reservation-availability','GET',null,'https://example.test/?date=2026-11-12&durationMinutes=60');
  assert.equal(result.status,200);assert.ok(result.body.reservedTimes.includes('13:30'));assert.ok(!result.body.reservedTimes.includes('17:00'));
  assert.equal(result.body.blockedIntervals[0].end,'17:00');
  assert.equal((await call(availability,'/api/reservation-availability','GET',null,'https://example.test/?date=2026-11-12&durationMinutes=0')).status,400);
});
