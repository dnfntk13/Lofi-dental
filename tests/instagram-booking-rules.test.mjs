import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedInstagramExtraction } from '../lib/instagram-booking-rules.mjs';
test('inquiries, cancellations and unclassified extractions cannot schedule', () => {
  for (const bookingStatus of ['inquiry', 'cancelled', 'uncertain', undefined]) {
    const result = validatedInstagramExtraction({ bookingStatus, date: '2026-09-26', time: '13:00' });
    assert.equal(result.date, ''); assert.equal(result.time, '');
  }
});
test('rejects price fragments, invalid dates and message timestamps', () => {
  for (const [date, time] of [['50/40', '13:00'], ['2026-02-30', '13:00'], ['2026-09-26', '7시간 전'], ['2026-09-26', '25:00']]) {
    const result = validatedInstagramExtraction({ bookingStatus: 'confirmed', date, time });
    assert.equal(result.date, ''); assert.equal(result.time, '');
  }
});
test('preserves a confirmed valid date and time', () => {
  const result = validatedInstagramExtraction({ bookingStatus: 'confirmed', date: '2026-09-26', time: '13:00' });
  assert.equal(result.date, '2026-09-26'); assert.equal(result.time, '13:00');
});
