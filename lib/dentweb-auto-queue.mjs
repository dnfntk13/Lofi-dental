import { dentwebIdentityReady } from './dentweb-job-identity.mjs';

// Queue newly scheduled reservations, preserving prior sync state and linked IDs.
export function autoQueueDentweb(record, { date, time, previous, now = new Date() } = {}) {
  if (record.cancelledAt || record.dentwebAction === 'cancel') return record;
  if (String(record.source || '').toLowerCase() === 'dentweb') return record;
  if (!date || !time) return record;
  if (!dentwebIdentityReady(record)) {
    // Preserve completed, failed and in-flight operations for explicit review.
    if (record.dentwebSyncStatus || Number(record.dentwebReservationId) > 0) return record;
    return { ...record, dentwebSyncStatus: 'waiting_identity' };
  }
  // Updating a linked appointment must update that same Dentweb row, not insert another.
  const linkedChange = previous && Number(record.dentwebReservationId) > 0 &&
    ['date', 'time', 'name', 'phone', 'concerns', 'durationMinutes'].some(key => String(record[key] || '') !== String(previous[key] || ''));
  if (linkedChange && /^\d{4}-\d{2}-\d{2}$/.test(date || '') && time) {
    return { ...record, dentwebSyncStatus: 'pending', dentwebQueuedAt: now.toISOString(), dentwebSyncUpdatedAt: now.toISOString(), dentwebProcessingAt: null, dentwebSyncedAt: null, dentwebSyncError: null };
  }
  if ((record.dentwebSyncStatus && record.dentwebSyncStatus !== 'waiting_identity') || Number(record.dentwebReservationId) > 0) return record;
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  if (!date || !time || date < today || !String(record.name || record.email || '').trim()) return record;
  return { ...record, dentwebSyncStatus: 'pending', dentwebQueuedAt: now.toISOString(), dentwebSyncUpdatedAt: now.toISOString(), dentwebProcessingAt: null, dentwebSyncError: null };
}
