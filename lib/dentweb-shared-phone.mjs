const phoneKey = value => String(value || '').replace(/[^0-9]/g, '').replace(/^82(?=1[016789])/, '0');

// An authenticated operator's evidence is bound to one real identity and the
// complete observed family phone match set. SQL rechecks that set under locks.
export function validateSharedPhoneIdentity(value, record) {
  if (value === undefined) return undefined;
  const fail = () => { throw Error('SHARED_PHONE_IDENTITY: Verified distinct patient evidence and exact family patient IDs required'); };
  if (!value || value.mode !== 'distinct-patient' || !Array.isArray(value.expectedPatientIds)) fail();
  const ids = value.expectedPatientIds;
  if (!ids.length || ids.length > 20 || ids.some(x => !Number.isSafeInteger(x) || x < 1 || x > 2147483647) || new Set(ids).size !== ids.length) fail();
  const name = String(value.name || '').trim(), phone = phoneKey(value.phone);
  if (!name || name.length > 40 || name !== String(record.name || '').trim() || name.includes('@') || !/^\d{7,15}$/.test(phone) || phone === '01012341234' || phone !== phoneKey(record.phone)) fail();
  if (typeof value.evidence !== 'string' || value.evidence.trim().length < 10 || value.evidence.length > 1500 || !Number.isFinite(Date.parse(value.verifiedAt)) || Date.parse(value.verifiedAt) > Date.now() + 60000) fail();
  return {mode:'distinct-patient',name,phone,expectedPatientIds:[...ids].sort((a,b)=>a-b),verifiedAt:new Date(value.verifiedAt).toISOString(),evidence:value.evidence.trim()};
}
