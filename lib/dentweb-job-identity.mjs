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
  if ((job.action || 'upsert') === 'upsert' && !dentwebIdentityReady(job)) {
    throw new Error('DENTWEB_IDENTITY_REQUIRED: Patient name and contact number are required; email and temporary phone placeholders cannot be sent.');
  }
}
