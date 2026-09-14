// Queue newly scheduled reservations, preserving prior sync state and linked IDs.
export function autoQueueDentweb(record, { date, time, now = new Date() } = {}) {
  if (String(record.source || '').toLowerCase() === 'dentweb' || record.dentwebSyncStatus || Number(record.dentwebReservationId) > 0) return record;
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  if (!date || !time || date < today || !String(record.name || record.email || '').trim()) return record;
  return { ...record, dentwebSyncStatus: 'pending', dentwebQueuedAt: now.toISOString(), dentwebSyncUpdatedAt: now.toISOString(), dentwebProcessingAt: null, dentwebSyncError: null };
}
