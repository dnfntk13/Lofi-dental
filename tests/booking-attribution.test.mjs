import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { normalizeBookingAttribution, summarizeBookingAttribution } from '../lib/booking-attribution.mjs';

const script = await readFile(new URL('../assets/visitor-attribution.js', import.meta.url), 'utf8');
const now = Date.now();
test('attribution accepts only first-party source metadata and expires after 24 hours', () => {
  const clean = normalizeBookingAttribution({ source:'google', medium:'cpc', campaign:'lofi_seoul', content:'123', referrerHost:'google.com', landingPath:'/english-dentist-seoul.html', capturedAt:now, email:'private@example.com', concerns:'private', gclid:'secret', term:'sensitive' }, now);
  assert.deepEqual(Object.keys(clean).sort(), ['capturedAt','source','medium','campaign','content','referrerHost','landingPath'].sort());
  assert.equal(clean.source, 'google');
  assert.equal(normalizeBookingAttribution({capturedAt:now-86400001}, now), null);
  assert.equal(normalizeBookingAttribution({capturedAt:now+60001}, now), null);
  assert.equal(normalizeBookingAttribution({capturedAt:now,landingPath:'/booking?email=private@example.com'}, now).landingPath, '');
});

test('source survives navigation to reservation without storing patient query or sending requests', () => {
  const saved = new Map();
  const run = (url, referrer) => {
    const location = new URL(url);
    const context = { window:{}, location, document:{referrer}, URL, URLSearchParams, Date, sessionStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)}, fetch(){throw Error('No external requests allowed');} };
    runInNewContext(script, context);
    return JSON.parse(JSON.stringify(context.window.lofiAttribution.get()));
  };
  const first = run('https://lofiesthetic.com/english-dentist-seoul.html?utm_source=google&utm_medium=cpc&utm_campaign=lofi&utm_term=private&gclid=secret', 'https://www.google.com/');
  const booking = run('https://lofiesthetic.com/reservation/concerns.html?date=2026-09-19&email=private@example.com', 'https://lofiesthetic.com/reservation/index.html');
  assert.deepEqual(booking, first);
  assert.doesNotMatch(JSON.stringify(booking), /secret|private|2026-09-19/);
});

test('blocked browser storage does not break attribution or booking', () => {
  const context = { window:{}, location:new URL('https://lofiesthetic.com/'), document:{referrer:''}, URL, URLSearchParams, Date, sessionStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}} };
  runInNewContext(script, context);
  assert.equal(context.window.lofiAttribution.get().landingPath, '/');
});

test('only accepted website requests count, using Korea dates and aggregated source labels', () => {
  const records = [
    {createdAt:'2026-09-16T16:00:00Z',measurement:{event:'booking_request'},acquisition:{source:'google',medium:'cpc',campaign:'lofi'},email:'private@example.com'},
    {createdAt:'2026-09-17T00:00:00Z',measurement:{event:'booking_request'},acquisition:null},
    {createdAt:'2026-09-17T00:00:00Z',source:'admin'},
    {createdAt:'2026-09-15T00:00:00Z',measurement:{event:'booking_request'}},
  ];
  const summary=summarizeBookingAttribution(records, '2026-09-17');
  assert.equal(summary.total,2);
  assert.equal(summary.googleAds,1);
  assert.doesNotMatch(JSON.stringify(summary),/private@example|email/);
});

test('booking pages never transmit patient email, appointment time or a conversion on page view', async () => {
  for (const file of ['reservation/concerns.html','reservation/received.html','english/index.html','lofi-lab-en.html']) {
    const html=await readFile(new URL(`../${file}`,import.meta.url),'utf8');
    assert.doesNotMatch(html,/googletagmanager|\bgtag\s*\(/);
  }
  const html=await readFile(new URL('../reservation/concerns.html',import.meta.url),'utf8');
  assert.match(html,/acquisition: window\.lofiAttribution\?\.get/);
  assert.match(html,/if \(submitting\) return/);
});
