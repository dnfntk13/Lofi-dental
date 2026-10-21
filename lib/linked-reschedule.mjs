// Explicit, opt-in requests only. Imported web fields remain historical snapshots.
export function appointmentStamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')
    || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Valid date and 24-hour time required');
  return date.replaceAll('-', '') + time.replace(':', '');
}

export function validateRescheduleRequest(input) {
  if (!input || !/^[A-Za-z0-9_-]{16,100}$/.test(input.operationId || '')) throw new Error('A stable unique operationId is required');
  const e = input.expected;
  if (!e || !Number.isSafeInteger(e.reservationId) || e.reservationId < 1
    || !Number.isSafeInteger(e.patientId) || e.patientId === 0 || e.state !== 0
    || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 40
    || typeof e.phone !== 'string' || !/^[+\d ()-]{7,30}$/.test(e.phone)
    || !Number.isInteger(e.durationMinutes) || e.durationMinutes < 1 || e.durationMinutes > 255
    || !/^[a-f0-9]{64}$/.test(e.memoSha256 || '')) throw new Error('Verified native identity, active state, duration and memo digest required');
  const expected = { reservationId: e.reservationId, patientId: e.patientId, state: e.state,
    name: e.name.trim(), phone: e.phone, date: e.date, time: e.time,
    durationMinutes: e.durationMinutes, memoSha256: e.memoSha256 };
  const target = { date: input.target?.date, time: input.target?.time };
  if (appointmentStamp(expected.date, expected.time) === appointmentStamp(target.date, target.time)) throw new Error('Target must differ from expected schedule');
  return { operationId: input.operationId, expected, target };
}

export function queueLinkedReschedule(record, input, now = new Date()) {
  if (!record || record.source !== 'dentweb') throw new Error('An existing imported reservation is required');
  const request = validateRescheduleRequest(input);
  if (Number(record.dentwebReservationId) !== request.expected.reservationId) throw new Error('Linked reservation ID mismatch');
  const old = record.dentwebReschedule;
  if (old?.operationId === request.operationId) {
    if (JSON.stringify(old) !== JSON.stringify(request)) throw new Error('operationId was already used with different details');
    return record; // Failed requests also require review; do not retry implicitly.
  }
  if (old || ['pending', 'processing', 'failed'].includes(record.dentwebSyncStatus)
    || record.dentwebAction === 'cancel' || record.cancelledAt || record.status === 'cancelled') throw new Error('Existing operation requires review before another request');
  if (record.dentwebSyncStatus !== 'completed') throw new Error('A completed linked record is required');
  return { ...record, dentwebAction: 'linked-reschedule', dentwebReschedule: request,
    dentwebRescheduleWebBefore: { date: record.date, time: record.time },
    dentwebSyncStatus: 'pending', dentwebQueuedAt: now.toISOString(),
    dentwebSyncUpdatedAt: now.toISOString(), dentwebProcessingAt: null, dentwebSyncError: null };
}

export function assertRescheduleCallback(record, payload) {
  if (record?.dentwebAction !== 'linked-reschedule') {
    if (payload.action === 'linked-reschedule') throw new Error('No matching reschedule operation');
    return;
  }
  const request = record.dentwebReschedule;
  if (payload.action !== 'linked-reschedule' || payload.operationId !== request?.operationId
    || Number(payload.dentwebReservationId) !== request.expected.reservationId
    || !['processing', 'completed'].includes(record.dentwebSyncStatus)
    || !['completed', 'failed'].includes(payload.status)
    || (record.dentwebSyncStatus === 'completed' && payload.status !== 'completed')) throw new Error('Reschedule callback does not match the claimed operation');
  if (payload.status === 'completed') {
    const v = payload.verification;
    if (!v || v.reservationId !== request.expected.reservationId || v.patientId !== request.expected.patientId
      || v.appointmentAt !== appointmentStamp(request.target.date, request.target.time)
      || v.state !== request.expected.state || v.durationMinutes !== request.expected.durationMinutes
      || v.memoSha256 !== request.expected.memoSha256 || v.name !== request.expected.name
      || v.phone !== request.expected.phone) throw new Error('Native readback does not match the requested operation');
  }
}
