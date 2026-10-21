export function queueCancellation(record, expectedId, now = new Date()) {
  if (!record) throw new Error('Reservation not found');
  if (record.dentwebReschedule) throw new Error('Explicit reschedule requires review before cancellation');
  const id = Number(record.dentwebReservationId);
  if (!Number.isInteger(id) || id < 1 || id !== Number(expectedId)) throw new Error('Verified linked reservation ID is required');
  if (record.cancelledAt) return record;
  if (record.dentwebAction === 'cancel' && ['pending', 'processing'].includes(record.dentwebSyncStatus)) return record;
  if (record.dentwebSyncStatus === 'processing') throw new Error('Reservation is being updated; retry after verification');
  return {
    ...record, dentwebAction: 'cancel', cancellationRequestedAt: now.toISOString(),
    dentwebSyncStatus: 'pending', dentwebQueuedAt: now.toISOString(),
    dentwebSyncUpdatedAt: now.toISOString(), dentwebProcessingAt: null,
    dentwebSyncError: null,
  };
}

export function isCancelledReservation(record) {
  return Boolean(record?.cancelledAt || record?.canceledAt || record?.status === 'cancelled');
}
