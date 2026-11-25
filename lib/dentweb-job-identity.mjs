import { createHash } from 'node:crypto';
import { reservationSlotMinute } from './reservation-windows.mjs';
import { validateSharedPhoneIdentity } from './dentweb-shared-phone.mjs';

export function realPhone(record) {
  const raw = String(record?.phone || '').trim();
  if (!/^[+\d() .-]+$/.test(raw)) return false;
  const digits = raw.replace(/\D/g, '').replace(/^82(?=1[016789]\d{7,8}$)/, '0');
  return /^\d{7,15}$/.test(digits) && digits !== '01012341234' && !/^(\d)\1+$/.test(digits);
}

function realName(record) {
  const name = String(record?.name || '').trim();
  return /\p{L}/u.test(name) && !/[@\r\n]/.test(name)
    && !/^(?:가예약|미확인|이름 미확인|이름 미정|성명 미상|환자명 미상|unknown|pending|tbd|n\/a|anonymous|guest|instagram|kakao|whatsapp)(?:\s|$)/i.test(name);
}

// Only the authenticated booking editor can attest a messaging account.
export function verifiedMessagingContact(value) {
  if (!value || typeof value !== 'object') return null;
  const {channel, account} = value;
  if (!['instagram','kakao','whatsapp','naver','messenger','line'].includes(channel)
      || typeof account !== 'string' || !/^[\p{L}\p{N}@._+-]{1,80}$/u.test(account)
      || !/[\p{L}\p{N}]/u.test(account) || /^(?:unknown|pending|tbd|미확인)$/i.test(account)) return null;
  return {channel, account};
}

export function provisionalIdentityReady(record) {
  const email = String(record?.email || '').trim().toLowerCase();
  return /^\d{13}-[a-z0-9]+$/i.test(String(record?.id || ''))
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && /^[\x21-\x7e]+$/.test(email)
    && !email.endsWith('.lofi.internal') && record.source !== 'dentweb';
}

function contactKey(record) {
  if (provisionalIdentityReady(record)) return record.email.trim().toLowerCase();
  if (!/^\d{13}-[a-z0-9]+$/i.test(String(record?.id || '')) || record.source === 'dentweb') return '';
  const contact = verifiedMessagingContact(record.verifiedMessagingContact);
  return contact ? contact.channel + ':' + contact.account : '';
}

export function hasConfirmedSlot(record) {
  const minute = reservationSlotMinute(record);
  return minute !== null && minute === reservationSlotMinute(record?.confirmedSlot);
}

export function adminContactFields(payload, date, time) {
  const fields = {};
  if (payload.scheduleConfirmed !== undefined) {
    if (typeof payload.scheduleConfirmed !== 'boolean' || (payload.scheduleConfirmed && reservationSlotMinute({date, time}) === null))
      throw new Error('Confirm a valid appointment date and time.');
    fields.confirmedSlot = payload.scheduleConfirmed ? {date, time} : null;
  }
  if (payload.verifiedMessagingContact !== undefined) {
    const contact = verifiedMessagingContact(payload.verifiedMessagingContact);
    if (!contact) throw new Error('A verified messaging channel and account are required.');
    fields.verifiedMessagingContact = contact;
  }
  return fields;
}

export function dentwebIdentityReady(record) {
  if (!realName(record)) return false;
  const agreed = hasConfirmedSlot(record);
  // Legacy telephone bookings predate the slot attestation.
  if (realPhone(record)) return record.confirmedSlot === undefined || agreed;
  return agreed && Boolean(contactKey(record));
}

export function assertDentwebJobIdentity(job) {
  if ((job.action || 'upsert') !== 'upsert') return;
  validateSharedPhoneIdentity(job.sharedPhoneIdentity, job);
  if (job.confirmedSlot !== undefined && !hasConfirmedSlot(job)) throw new Error('DENTWEB_SCHEDULE_UNCONFIRMED: Confirm the current appointment date and time.');
  if (!dentwebIdentityReady(job) && !provisionalIdentityReady(job)) {
    throw new Error('DENTWEB_IDENTITY_REQUIRED: Verified booking contact required.');
  }
}

export function prepareDentwebIdentity(job) {
  assertDentwebJobIdentity(job);
  if (!['upsert', 'cancel'].includes(job.action || 'upsert')) return job;
  const contact = contactKey(job);
  if (!contact) return job;
  const identityMarker = '[lofi-web:' + createHash('sha256').update(job.id + '\n' + contact).digest('hex') + ']';
  if (dentwebIdentityReady(job)) {
    if (realPhone(job)) return { ...job, identityMarker, provisional: false };
    if (job.name.trim().length > 40) throw new Error('Verified name exceeds Dentweb display length.');
    return { ...job, phone: '', identityMarker, namedContact: true, provisional: false, clinicalMemo: job.concerns || '',
      concerns: [`연락: ${contact}`, identityMarker, job.concerns].filter(Boolean).join('\n') };
  }
  return { ...job, provisional: true, identityMarker,
    name: ('가예약 ' + contact).slice(0, 36), phone: '', durationMinutes: job.durationMinutes ?? 30,
    concerns: `가예약 · 이름/전화 미확인 · ${contact}\n${identityMarker}\n${job.concerns || ''}` };
}
