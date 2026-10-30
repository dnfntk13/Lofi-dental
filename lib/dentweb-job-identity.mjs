import { createHash } from 'node:crypto';
// The public form collects contact details after creating the web request.
// Its old shared phone/email placeholders must never become clinic identities.
export function dentwebIdentityReady(record) {
  const name = String(record?.name || '').trim();
  const email = String(record?.email || '').trim().toLowerCase();
  let phone = String(record?.phone || '').replace(/[^0-9]/g, '');
  if (/^82(1[016789]\d{7,8})$/.test(phone)) phone = '0' + phone.slice(2);
  return Boolean(name && !name.includes('@') && name.toLowerCase() !== email
    && /^\d{7,15}$/.test(phone) && phone !== '01012341234');
}

export function assertDentwebJobIdentity(job) {
  if ((job.action || 'upsert') === 'upsert' && !dentwebIdentityReady(job) && !provisionalIdentityReady(job)) {
    throw new Error('DENTWEB_IDENTITY_REQUIRED: Patient name and contact number are required; email and temporary phone placeholders cannot be sent.');
  }
}

export function provisionalIdentityReady(record) {
  const email = String(record?.email || '').trim().toLowerCase();
  return /^\d{13}-[a-z0-9]+$/i.test(String(record?.id || ''))
    && /^[\x21-\x7e]+@[^\s@]+\.[^\s@]+$/.test(email)
    && /^[\x21-\x7e]+$/.test(email) && email.split('@').length === 2
    && !email.endsWith('.lofi.internal')
    && record.source !== 'dentweb';
}

// A web ID is the idempotency key, never a fabricated phone or patient identity.
export function prepareDentwebIdentity(job) {
  assertDentwebJobIdentity(job);
  if (!provisionalIdentityReady(job)) return job;
  const email = String(job.email).trim().toLowerCase();
  const identityMarker = '[lofi-web:' + createHash('sha256').update(job.id + '\n' + email).digest('hex') + ']';
  if (dentwebIdentityReady(job)) return { ...job, identityMarker, provisional: false };
  if (!['upsert', 'cancel'].includes(job.action || 'upsert')) return job;
  return { ...job, provisional: true, identityMarker,
    name: ('가예약 ' + email).slice(0, 36), phone: '', durationMinutes: job.durationMinutes ?? 30,
    concerns: `가예약 · 이름/전화 미확인 · ${email}\n${identityMarker}\n${job.concerns || ''}` };
}
