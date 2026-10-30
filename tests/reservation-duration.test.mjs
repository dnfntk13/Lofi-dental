import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationDuration } from '../lib/reservation-duration.mjs';
import { autoQueueDentweb } from '../lib/dentweb-auto-queue.mjs';
import { provisionalConflict } from '../lib/dentweb-provisional.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('optional minutes accept integer DB range and reject coercion and overflow', () => {
  assert.equal(reservationDuration(undefined), undefined);
  for (const value of [1, 30, 60, '60', 90, 255]) assert.equal(reservationDuration(value), Number(value));
  for (const value of [null, true, '', ' ', [], {}, 0, -1, 256, 60.5, '60 minutes', NaN, Infinity]) {
    assert.throws(() => reservationDuration(value), /durationMinutes/);
  }
});

test('HTTP create/update and job handoff retain minutes, omission and linked ID', async () => {
  const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  let saved;
  const collection = {
    findOne: async () => saved,
    replaceOne: async (_, record) => { saved = record; return { matchedCount: 1 }; },
    findOneAndUpdate: async () => saved,
  };
  const context = vm.createContext({ reservationDuration, autoQueueDentweb, provisionalConflict, readInbox:async()=>[saved], console, process: { env: {} },
    getJsonBody: async r => r.body, getInboxCollection: async () => collection,
    addInboxRecord: async r => { saved = {...r}; }, getPatientThreadEmail: () => 'test',
    saveOrUpdateEmailThread: async () => {}, saveOrUpdatePatient: async () => {},
    normalizeReservationDate: x => x, normalizeReservationTime: x => x,
    requestAuth: r => {r.writeHead(401);r.end('{}');},
  });
  function handler(start, end) {
    const a=source.indexOf(start), b=source.indexOf(end,a+start.length);
    assert.ok(a >= 0 && b > a);
    return vm.runInContext(`(async function(pathname,request,response,adminAuthorized=true){${source.slice(a,b)}})`,context);
  }
  const create=handler('  if (pathname === "/api/admin/reservations"', '  const dentwebSyncMatch');
  const update=handler('  if (pathname.startsWith("/api/admin/reservations/") && request.method === "PUT")', '  if (pathname.startsWith("/api/admin/reservations/") && request.method === "DELETE")');
  const job=handler('  if (pathname === "/api/admin/dentweb/jobs/next"', '  if (pathname.startsWith("/api/admin/reservations/") && request.method === "PUT")');
  async function call(route,path,method,body) {
    const result={};
    await route(path,{method,body,headers:{'x-dentweb-provisional':'1'}},{writeHead:s=>result.status=s,end:b=>result.body=JSON.parse(b)});
    return result;
  }
  const body={name:'Test',phone:'01000000000',date:'2030-01-07',time:'12:30',durationMinutes:60};
  assert.equal((await call(create,'/api/admin/reservations','POST',body)).status,201);
  assert.equal(saved.durationMinutes,60);
  saved.dentwebReservationId=123; saved.dentwebSyncStatus='completed';
  const id=saved.id;
  const changed=await call(update,`/api/admin/reservations/${id}`,'PUT',{...body,durationMinutes:90});
  assert.equal(changed.status,200); assert.equal(saved.durationMinutes,90);
  assert.equal(saved.dentwebReservationId,123); assert.equal(saved.dentwebSyncStatus,'pending');
  await call(update,`/api/admin/reservations/${id}`,'PUT',{name:body.name,date:body.date,time:body.time});
  assert.equal(saved.durationMinutes,90);
  const handed=await call(job,'/api/admin/dentweb/jobs/next','GET');
  assert.equal(handed.body.job.durationMinutes,90); assert.equal(handed.body.job.dentwebReservationId,123);
  for (const route of [create,update]) {
    const result=await call(route,route===create?'/api/admin/reservations':`/api/admin/reservations/${id}`,route===create?'POST':'PUT',{...body,durationMinutes:256});
    assert.equal(result.status,400); assert.equal(saved.durationMinutes,90);
  }
});

test('duration-only edits requeue the linked record without changing appointment identity', () => {
  const previous = {name:'Test', phone:'+12025550123', date:'2030-01-07', time:'12:30', durationMinutes:30,
    dentwebReservationId:123, dentwebSyncStatus:'completed'};
  const options = {previous,date:previous.date,time:previous.time,now:new Date('2026-10-20T00:00:00Z')};
  const result = autoQueueDentweb({...previous,durationMinutes:60},options);
  assert.equal(result.durationMinutes,60);
  assert.equal(result.dentwebReservationId,123);
  assert.equal(result.dentwebSyncStatus,'pending');
  assert.equal(autoQueueDentweb(previous,options),previous);
});
