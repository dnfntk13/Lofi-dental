import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInsightsRange, inInsightsRange } from '../lib/insights-range.mjs';
import { summarizeBookingAttribution } from '../lib/booking-attribution.mjs';
import { summarizeCampaignAudit } from '../lib/instagram-campaign-audit.mjs';
import { summarizeFunnel } from '../lib/booking-funnel.mjs';
const range = (query, now = '2026-10-24T04:00:00Z') => resolveInsightsRange(new URLSearchParams(query), new Date(now));

test('week starts Monday in Seoul even when the host date is still Sunday', () => {
  assert.equal(range('preset=this_week').from, '2026-10-19');
  assert.equal(range('preset=this_week', '2026-10-25T15:00:00Z').from, '2026-10-26');
  assert.equal(range('preset=this_month', '2026-10-31T15:00:00Z').from, '2026-11-01');
  assert.equal(range('preset=this_month').days, 24);
});

test('custom periods reject rollover dates, reverse ranges, future days and oversized requests', () => {
  for (const query of ['from=2026-02-30&to=2026-03-01', 'from=2026-10-24&to=2026-10-23', 'from=2026-10-24&to=2026-10-25', 'from=2024-01-01&to=2026-10-23', 'preset=unknown']) assert.throws(() => range(query));
  assert.equal(range('from=2024-02-29&to=2024-02-29').days, 1);
});

test('traffic and saved requests use inclusive Korean days, not the appointment visit date', () => {
  const selected = range('from=2026-10-22&to=2026-10-23');
  const record = createdAt => ({createdAt, date:'2026-11-01', measurement:{event:'booking_request'}});
  const records = [record('2026-10-21T14:59:59.999Z'), record('2026-10-21T15:00:00Z'), record('2026-10-23T14:59:59.999Z'), record('2026-10-23T15:00:00Z'), record('invalid')];
  assert.equal(records.filter(row => inInsightsRange(row, selected)).length, 2);
  assert.equal(summarizeBookingAttribution(records, selected.from, {}, selected.to).total, 2);
  const events = records.map((row,i) => ({timestamp:row.createdAt,kind:'booking_funnel',step:'accepted',session:`anonymous-session-${i}`}));
  assert.equal(summarizeFunnel(events.filter(row => inInsightsRange(row, selected))).steps.accepted, 2);
});

test('Instagram range follows first confirmation day and keeps incomplete audit coverage visible', () => {
  const selected = range('preset=this_week');
  const audit = {auditedAt:'2026-10-24T01:00:00Z',coverage:{sinceDay:'2026-10-22',throughDay:'2026-10-24'},patients:[
    {confirmedDay:'2026-10-21',visitKind:'new',status:'confirmed',campaignId:'x',videoTitle:'Title'},
    {confirmedDay:'2026-10-23',visitKind:'new',status:'confirmed',campaignId:'x',videoTitle:'Title'},
    {confirmedDay:'2026-10-25',visitKind:'new',status:'confirmed',campaignId:'x',videoTitle:'Title'},
    {confirmedDay:'2026-10-23',visitKind:'followup',status:'confirmed',campaignId:'x',videoTitle:'Title'},
  ]};
  const result = summarizeCampaignAudit(audit, {}, new Date('2026-10-24T04:00:00Z'), selected);
  assert.equal(result.totalPatients, 2);
  assert.equal(result.stale, true);
  assert.equal(result.sinceDay, '2026-10-19');
  const earlier = {...audit, coverage:{sinceDay:'2026-10-01',throughDay:'2026-10-05'}, patients:[]};
  assert.equal(summarizeCampaignAudit(earlier, {}, new Date('2026-10-24T04:00:00Z'), selected).available, false);
});
