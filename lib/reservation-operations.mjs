import { randomUUID, createHash } from 'node:crypto';
import { appointmentStamp } from './linked-reschedule.mjs';

export const operationVersion = 3;
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const terminal = new Set(['completed', 'rejected']);
export function validateOperation(input, reservationId) {
  const e = input?.expected;
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(input?.operationId || '')
    || !['reschedule', 'cancel', 'amend-content', 'annotate-cancellation'].includes(input.action)) throw Error('Valid operationId and action required');
  if (!e || !Number.isSafeInteger(reservationId) || reservationId < 1 || e.reservationId !== reservationId
    || !Number.isSafeInteger(e.patientId) || !e.patientId || e.state !== (input.action === 'annotate-cancellation' ? 2 : 0)
    || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 40
    || typeof e.phone !== 'string' || !/^[+\d ()-]{0,30}$/.test(e.phone)
    || !Number.isInteger(e.durationMinutes) || e.durationMinutes < 1 || e.durationMinutes > 255
    || !/^[a-f0-9]{64}$/.test(e.memoSha256 || '') || !/^[a-f0-9]{64}$/.test(e.contentSha256 || '')) {
    throw Error('Verified reservation identity, active state, duration and content digests required');
  }
  appointmentStamp(e.date, e.time);
  const expected = { reservationId, patientId: e.patientId, name: e.name.trim(), phone: e.phone,
    date: e.date, time: e.time, state: e.state, durationMinutes: e.durationMinutes,
    memoSha256: e.memoSha256, contentSha256: e.contentSha256 };
  let target;
  if (input.action === 'reschedule') {
    target = { date: input.target?.date, time: input.target?.time };
    if (appointmentStamp(target.date, target.time) === appointmentStamp(e.date, e.time)) throw Error('Schedule is unchanged');
  } else if (input.action === 'amend-content') {
    const content = input.target?.content;
    if (typeof content !== 'string' || !content.trim() || content !== content.trim()
      || Buffer.byteLength(content, 'utf8') > 200 || /[\x00-\x1f\x7f]/.test(content)
      || Object.keys(input.target).some(k => k !== 'content')) throw Error('Only concise reservation content may be amended');
    if (digest(content) === expected.contentSha256) throw Error('Content is unchanged');
    target = { content };
  } else if (input.action === 'annotate-cancellation') {
    const {note, originalContent} = input.target || {};
    if (typeof note !== 'string' || !note.trim() || note !== note.trim()
      || Buffer.byteLength(note, 'utf8') > 120 || /[\x00-\x1f\x7f\[\]]/.test(note)
      || typeof originalContent !== 'string' || digest(originalContent) !== expected.contentSha256
      || Object.keys(input.target).some(k => !['note', 'originalContent', 'content'].includes(k))) throw Error('Verified cancellation note and unchanged original content required');
    if (originalContent.startsWith('[취소: ')) throw Error('Cancellation already annotated; review existing note');
    const content = `[취소: ${note}]${originalContent ? ' ' + originalContent : ''}`;
    if (input.target.content !== undefined && input.target.content !== content) throw Error('Annotation must preserve original content');
    if (Buffer.byteLength(content, 'utf8') > 1000) throw Error('Annotation exceeds native content capacity');
    target = {note, originalContent, content};
  } else if (input.target != null) throw Error('Cancellation must not change the schedule');
  return { operationId: input.operationId, action: input.action, expected, ...(target ? { target } : {}) };
}

export function assertOperationVerification(request, verification) {
  const e = request.expected;
  const at = request.action === 'reschedule' ? appointmentStamp(request.target.date, request.target.time) : appointmentStamp(e.date, e.time);
  const state = ['cancel', 'annotate-cancellation'].includes(request.action) ? 2 : 0;
  if (!verification || verification.appointmentAt !== at || verification.state !== state
    || ['reservationId', 'patientId', 'name', 'phone', 'durationMinutes', 'memoSha256', 'contentSha256']
      .some(k => verification[k] !== (k === 'contentSha256' && ['amend-content', 'annotate-cancellation'].includes(request.action) ? digest(request.target.content) : e[k]))) throw Error('Native readback does not match this operation');
}

export function sameRequest(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export function findOperation(doc, id) {
  if (doc?.current?.request.operationId === id) return doc.current;
  return doc?.history?.find(op => op.request.operationId === id) || null;
}

// A separate command journal, never a calendar reservation or a DentWeb import.
// One document per native reservation gives atomic exclusion and immutable history.
export function createReservationOperations({ getCollection, getInboxCollection, now = () => new Date() }) {
  const clean = doc => doc && ({ reservationId: doc.reservationId, revision: doc.revision, current: doc.current, history: doc.history });
  async function required() { const c = await getCollection(); if (!c) throw Error('Atomic operation storage unavailable'); return c; }
  async function get(id, operationId) {
    const doc = await (await required()).findOne({ reservationId: id });
    return operationId ? findOperation(doc, operationId) : clean(doc);
  }
  async function assertIdle(id) {
    const c = await getCollection();
    if (!c) return;
    const doc = await c.findOne({ reservationId: id });
    if (doc?.current && !terminal.has(doc.current.status)) throw Error('A reservation operation is still awaiting verification');
  }
  async function queueInternal(id, input, recovery = null) {
    const request = validateOperation(input, id);
    const c = await required();
    const doc = await c.findOne({ reservationId: id });
    const prior = findOperation(doc, request.operationId);
    if (prior) {
      if (!sameRequest(prior.request, request)) throw Error('operationId already has a different request');
      if (JSON.stringify(prior.legacyRecovery ?? null) !== JSON.stringify(recovery)) throw Error('operationId recovery source differs');
      return prior;
    }
    if (doc?.current && !terminal.has(doc.current.status)) throw Error('Previous operation requires verification before another request');
    const inbox = await getInboxCollection();
    if (!inbox) throw Error('Atomic reservation storage unavailable');
    const linked = await inbox.find({ dentwebReservationId: id }, { projection: { _id: 0 } }).toArray();
    if (linked.length > 1) throw Error('Multiple web records link to this reservation; review required');
    if (linked.some(r => ['pending', 'processing'].includes(r.dentwebSyncStatus))) throw Error('A legacy reservation job is in flight');
    if (recovery && (linked.length !== 1 || linked[0].id !== recovery.webId
      || linked[0].dentwebReschedule?.operationId !== recovery.legacyOperationId
      || linked[0].dentwebSyncStatus !== 'failed'
      || JSON.stringify(linked[0].dentwebReschedule) !== JSON.stringify(recovery.originalRequest))) throw Error('Legacy request changed before recovery');
    // A failed callback can be reconciled by a new, freshly verified explicit command.
    // No legacy job is requeued and its evidence is retained in the command journal.
    const current = { request, status: 'pending', queuedAt: now().toISOString(), linkedBefore: linked,
      attempts: 0, nativeVerified: false, webVerified: false,
      ...(recovery ? { verifyOnly: true, legacyRecovery: recovery } : {}) };
    if (!doc) {
      try { await c.insertOne({ reservationId: id, revision: 1, current, history: [] }); }
      catch (e) { if (e.code === 11000) throw Error('Concurrent request; reload the operation journal'); throw e; }
    } else {
      const result = await c.updateOne({ reservationId: id, revision: doc.revision },
        { $set: { current }, $inc: { revision: 1 }, $push: { history: doc.current } });
      if (!result.matchedCount) throw Error('Concurrent request; reload the operation journal');
    }
    return current;
  }
  async function queue(id, input) { return queueInternal(id, input); }
  async function recoverLegacy(id, input) {
    const inbox = await getInboxCollection();
    if (!inbox) throw Error('Atomic reservation storage unavailable');
    const row = await inbox.findOne({ id: input?.webId });
    const old = row?.dentwebReschedule, e = input?.verified;
    if (!old || row.dentwebAction !== 'linked-reschedule' || row.dentwebReservationId !== id
      || old.operationId !== input?.legacyOperationId || row.cancelledAt || row.status === 'cancelled') throw Error('Matching legacy reschedule required');
    if (!e || ['reservationId','patientId','name','phone','durationMinutes','state'].some(k=>e[k]!==old.expected[k])
      || e.date!==old.target.date || e.time!==old.target.time) throw Error('Fresh native identity and original target must match');
    // Derive the target from the previously authorized command. Fresh digests preserve
    // subsequent staff edits; the clinic agent may only read, never reapply the write.
    const request = { operationId: input.operationId, action:'reschedule',
      expected:{...e,date:old.expected.date,time:old.expected.time},target:old.target };
    return queueInternal(id,request,{webId:row.id,legacyOperationId:old.operationId,originalRequest:old});
  }
  async function claim(version = 1) {
    const c = await required();
    const time = now().toISOString(), stale = new Date(now().getTime() - 300000).toISOString();
    const leaseToken = randomUUID();
    const actions = version >= 3 ? ['reschedule', 'cancel', 'amend-content', 'annotate-cancellation'] : version >= 2 ? ['reschedule', 'cancel', 'amend-content'] : ['reschedule', 'cancel'];
    const doc = await c.findOneAndUpdate({ 'current.request.action': { $in: actions }, $or: [{ 'current.status': 'pending' },
      { 'current.status': 'processing', 'current.claimedAt': { $lt: stale } }] },
    { $set: { 'current.status': 'processing', 'current.claimedAt': time, 'current.leaseToken': leaseToken },
      $inc: { 'current.attempts': 1 } }, { sort: { 'current.queuedAt': 1 }, returnDocument: 'after' });
    if (!doc) return null;
    return { id: doc.current.request.operationId, action: 'reservation-operation',
      dentwebReservationId: doc.reservationId, nativeOperation: doc.current.request, leaseToken, verifyOnly: Boolean(doc.current.verifyOnly) };
  }
  async function complete(id, operationId, payload) {
    const c = await required();
    const doc = await c.findOne({ reservationId: id });
    const op = findOperation(doc, operationId);
    if (!op) throw Error('Operation not found');
    if (payload.status === 'completed') assertOperationVerification(op.request, payload.verification);
    else if (payload.status !== 'failed') throw Error('Only verified completion or failure may be reported');
    if (op.status === 'completed' && payload.status === 'completed') return op;
    if (doc.current.request.operationId !== operationId || !['processing', 'verifying', 'failed'].includes(op.status)
      || op.leaseToken !== payload.leaseToken) throw Error('Result does not match the active claim');
    const fence = { reservationId: id, 'current.request.operationId': operationId, 'current.leaseToken': payload.leaseToken };
    if (payload.status === 'failed') {
      if (op.nativeVerified) throw Error('A verified native result cannot be replaced by failure');
      await c.updateOne(fence, { $set: { 'current.status': 'failed', 'current.error': String(payload.error || 'Native operation failed').slice(0, 500) } });
      return get(id, operationId);
    }
    const verifiedAt = now().toISOString();
    await c.updateOne(fence, { $set: { 'current.status': 'verifying', 'current.nativeVerified': true,
      'current.verification': payload.verification, 'current.nativeVerifiedAt': verifiedAt } });
    const inbox = await getInboxCollection();
    for (const before of op.linkedBefore) {
      const fields = op.request.action === 'cancel'
        ? { status: 'cancelled', cancelledAt: verifiedAt }
        : op.request.action === 'annotate-cancellation' ? { concerns: `[취소: ${op.request.target.note}]${before.concerns ? ' ' + before.concerns : ''}` }
        : op.request.action === 'amend-content' ? { concerns: op.request.target.content }
        : { date: op.request.target.date, time: op.request.target.time };
      const requestedFields = { ...fields };
      Object.assign(fields, { dentwebOperationId: operationId, dentwebSyncStatus: 'completed',
        dentwebSyncedAt: verifiedAt, dentwebSyncUpdatedAt: verifiedAt, dentwebSyncError: null, updatedAt: verifiedAt });
      const existing = await inbox.findOne({ id: before.id });
      if (existing?.dentwebOperationId === operationId && existing.dentwebReservationId === id
        && Object.entries(op.request.action === 'cancel' ? { status: 'cancelled' } : requestedFields).every(([k,v])=>existing[k]===v)) continue;
      const result = await inbox.updateOne({ id: before.id, dentwebReservationId: id,
        updatedAt: before.updatedAt ?? null, dentwebSyncUpdatedAt: before.dentwebSyncUpdatedAt ?? null,
        dentwebReschedule: before.dentwebReschedule ?? null, dentwebOperationId: before.dentwebOperationId ?? null }, { $set: fields });
      if (!result.matchedCount) throw Error('Native result verified but web record changed; reconciliation required');
    }
    await c.updateOne(fence, { $set: { 'current.status': 'completed', 'current.webVerified': true,
      'current.completedAt': verifiedAt, 'current.error': null } });
    return get(id, operationId);
  }
  async function recover(id, operationId) {
    const c = await required(), doc = await c.findOne({ reservationId: id });
    if (doc?.current?.request.operationId !== operationId) throw Error('Only the current operation can be recovered');
    const op = doc.current;
    if (op.status === 'completed') return op;
    if (op.nativeVerified) return complete(id, operationId, { status: 'completed', leaseToken: op.leaseToken, verification: op.verification });
    // Read-only recovery: a failed command is never blindly executed a second time.
    if (op.status !== 'failed') throw Error('Only failed operations need explicit read-only recovery');
    await c.updateOne({ reservationId: id, 'current.request.operationId': operationId, 'current.status': 'failed' },
      { $set: { 'current.status': 'pending', 'current.verifyOnly': true } });
    return get(id, operationId);
  }
  return { get, queue, recoverLegacy, claim, complete, recover, assertIdle };
}
