import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedInstagramExtraction, currentKoreanClock } from '../lib/instagram-booking-rules.mjs';
test('server clock follows Korean midnight, month and year boundaries', () => {
  assert.deepEqual(currentKoreanClock(new Date('2026-12-31T15:00:00Z')), {
    timezone: 'Asia/Seoul', date: '2027-01-01', time: '00:00:00',
    weekday: '금요일', year: 2027, month: 1, iso: '2027-01-01T00:00:00+09:00',
  });
  assert.equal(currentKoreanClock(new Date('2026-09-14T15:01:00Z')).date, '2026-09-15');
});
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
