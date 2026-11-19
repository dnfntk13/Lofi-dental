import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the directory with synthetic records and storage doubles. A list request
// has no write dependency, including when a legacy booking has no patient card.
const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
function directoryContext(patients, inbox, overrides = {}) {
  const context = vm.createContext({
    readPatients: async () => structuredClone(patients),
    readInbox: async () => structuredClone(inbox),
    ...overrides,
  });
  function include(from, to) {
    const start = source.indexOf(from);
    const end = source.indexOf(to, start + from.length);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
  }
  include('function patientLatestInputTime', 'function normalizeChatToken');
  include('function extractPatientInfo', 'function normalizeInstagramReservationInfo');
  return context;
}

const first = {id:'fixture-booking', email:'a@example.invalid', name:'Booking name', phone:'000-0000', date:'2030-01-12', time:'10:00', createdAt:'2029-12-01T00:00:00Z'};
const second = {...first, id:'fixture-family', email:'b@example.invalid', name:'Second person'};
test('a directory read projects legacy bookings without persisting, reverting names, or grouping a shared phone', async () => {
  const saved = [{email:first.email, name:'Staff name', firstSeen:first.createdAt}];
  const context = directoryContext(saved, [first, second]);
  const rows = await context.readPatientDirectory();
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.email === first.email).name, 'Staff name');
  assert.equal(rows.find(row => row.email === second.email).latestReservation.id, second.id);
  assert.equal(saved[0].reservationIds, undefined);
  assert.equal(JSON.stringify(await context.readPatientDirectory()), JSON.stringify(rows));
});

test('a reservation edit retries a simultaneous rename and updates the same appointment once', async () => {
  let row = { _id:'synthetic', email:first.email, name:'Before', directoryRevision:1, reservations:[first] };
  let attempts = 0;
  const collection = {
    findOne:async () => structuredClone(row),
    replaceOne:async (filter, replacement) => {
      assert.equal(filter._id, row._id);
      if (++attempts === 1) Object.assign(row, {name:'Staff name', nameEditedAt:first.createdAt, directoryRevision:2});
      if (filter.directoryRevision !== row.directoryRevision) return {matchedCount:0};
      row = replacement;
      return {matchedCount:1};
    },
  };
  const context = directoryContext([], [], {getPatientsCollection:async () => collection});
  await context.saveOrUpdatePatient({...first, time:'11:00', updatedAt:'2030-01-02T00:00:00Z'}, {});
  assert.equal(attempts, 2);
  assert.equal(row.name, 'Staff name');
  assert.equal(row.reservations.length, 1);
  assert.equal(row.reservations[0].time, '11:00');
  assert.equal(row.latestReservation.time, '11:00');
});

