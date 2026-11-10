import { reservationDuration } from './reservation-duration.mjs';

// Explicit clinic closure, in Asia/Seoul wall-clock time. No patient data here.
export const protectedReservationWindows = Object.freeze([
  Object.freeze({ date: '2026-11-12', start: '14:00', end: '17:00' }),
]);

function startMinute(record) {
  const date = String(record?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date) return null;
  const time = String(record.time || '').trim();
  const match = time.match(/^(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match || (match[1] && match[4])) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3]), period = match[1] || match[4]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = hour % 12 + (['오후', 'PM'].includes(period) ? 12 : 0);
  return day / 60000 + hour * 60 + minute;
}

const duration = record => reservationDuration(record?.durationMinutes) ?? 30;
const cancelled = record => Boolean(record?.cancelledAt || record?.status === 'cancelled' || record?.dentwebAction === 'cancel');

export function protectedReservationOverlap(record) {
  const start = startMinute(record);
  if (start === null) return null;
  // The supported duration is at most 255 minutes. Unrelated days/old records
  // must not acquire new validation rules from this one closure.
  const candidates = protectedReservationWindows.filter(window =>
    start < startMinute({ date: window.date, time: window.end }) &&
    start + 255 > startMinute({ date: window.date, time: window.start }));
  if (!candidates.length) return null;
  const end = start + duration(record);
  return candidates.find(window =>
    start < startMinute({ date: window.date, time: window.end }) &&
    end > startMinute({ date: window.date, time: window.start })) || null;
}

export function assertReservationWindowAllowed(record, previous) {
  if (cancelled(record)) return;
  if (protectedReservationWindows.some(w => w.date === String(record?.date || '').trim()) && startMinute(record) === null) {
    throw Object.assign(new Error('A valid appointment time is required.'), { statusCode: 400 });
  }
  if (protectedReservationOverlap(record)) {
    // Metadata edits to an existing appointment do not create another appointment.
    if (previous && !cancelled(previous) && startMinute(record) === startMinute(previous)
      && duration(record) === duration(previous)) return;
    throw Object.assign(new Error('This appointment overlaps a blocked clinic time. Please choose another time.'),
      { statusCode: 409, code: 'RESERVATION_TIME_BLOCKED' });
  }
}

export function blockedReservationTimes(date, durationMinutes = 30) {
  return Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
    .filter(time => protectedReservationOverlap({ date, time, durationMinutes }));
}
