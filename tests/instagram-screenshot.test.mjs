import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { analyzeInstagramScreenshots, normalizeScreenshotDraft, validateScreenshotImages } from '../lib/instagram-screenshot.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('rejects URLs, spoofed images, unsupported formats, counts and oversized input', () => {
  for (const images of [[], Array(5).fill(png), ['https://example.com/image.png'], ['data:image/png;base64,aGVsbG8='], ['data:image/svg+xml;base64,PHN2Zz4='], ['x'.repeat(6 * 1024 * 1024 + 1)]]) {
    assert.throws(() => validateScreenshotImages(images));
  }
  assert.deepEqual(validateScreenshotImages([png]), [png]);
});
test('keeps missing/ambiguous appointment fields blank and rejects impossible dates/times', () => {
  const result = normalizeScreenshotDraft({ reservation: { date: '2026-02-30', time: '25:70', name: null } });
  assert.equal(result.reservation.date, '');
  assert.equal(result.reservation.time, '');
  assert.equal(result.reservation.name, '');
  assert.equal(result.warnings.length, 3);
  assert.throws(() => normalizeScreenshotDraft({}));
});
test('sends actual vision content and returns only a draft even if model invents actions', async () => {
  let sent;
  const draft = await analyzeInstagramScreenshots({ images: [png, png], note: '2026년 대화', apiKey: 'test', model: 'test-model', fetchImpl: async (url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: '예약 확인', reservation: { name: 'Test', date: '2026-09-20', time: '14:00' }, actions: [{ operation: 'deletePatient' }] }) } }] }) };
  } });
  assert.equal(sent.messages.find(message => message.role === "user").content.filter(part => part.type === 'image_url').length, 2);
  assert.equal(sent.store, false);
  assert.equal(draft.reservation.name, 'Test');
  assert.equal(draft.actions, undefined);
});
test('missing key, provider errors, refusal and malformed/truncated JSON fail clearly', async () => {
  await assert.rejects(analyzeInstagramScreenshots({ images: [png] }), { statusCode: 503 });
  for (const response of [
    { ok: false, json: async () => ({}) },
    { ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) },
    { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'invalid' } }] }) },
    { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { refusal: 'No' } }] }) },
  ]) await assert.rejects(analyzeInstagramScreenshots({ images: [png], apiKey: 'test', model: 'test', fetchImpl: async () => response }), { statusCode: 502 });
});

test('reservation endpoint requires auth and confirmation, saves edited fields and serializes duplicate submissions', async () => {
  const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('  if (pathname === "/api/admin/ai-screenshot/reservation"');
  const end = source.indexOf('  if (pathname === "/api/admin/ai-console"', start);
  const records = [];
  let saveCount = 0;
  const context = vm.createContext({
    screenshotSaveQueue: Promise.resolve(),
    getJsonBody: async request => request.body,
    requestAuth: response => { response.writeHead(401); response.end('{}'); },
    normalizeAdminAiReservationFields: fields => {
      if (!fields.name || !fields.date) throw new Error('Required');
      return fields;
    },
    readInbox: async () => records,
    createAdminAiReservation: async fields => {
      await new Promise(resolve => setTimeout(resolve, 5));
      const record = { ...fields, id: `test-${++saveCount}` };
      records.push(record); return record;
    },
  });
  const route = vm.runInContext(`(async function(request, response, adminAuthorized) { const pathname = '/api/admin/ai-screenshot/reservation'; ${source.slice(start, end)} })`, context);
  async function call(body, authorized = true) {
    const result = {};
    await route({ method: 'POST', body }, { writeHead: code => { result.status = code; }, end: data => { result.body = JSON.parse(data); } }, authorized);
    return result;
  }
  const body = { confirmed: true, reservation: { name: 'Staff corrected name', date: '2026-09-20', time: '15:00', concerns: 'Corrected request' } };
  assert.equal((await call(body, false)).status, 401);
  assert.equal((await call({ ...body, confirmed: false })).status, 400);
  assert.equal((await call({ ...body, reservation: { ...body.reservation, time: '99:00' } })).status, 400);
  assert.equal(saveCount, 0);
  const results = await Promise.all([call(body), call(body)]);
  assert.equal(saveCount, 1);
  assert.equal(results.filter(result => result.body.duplicate).length, 1);
  assert.equal(records[0].name, body.reservation.name);
  assert.equal(records[0].concerns, body.reservation.concerns);
});
