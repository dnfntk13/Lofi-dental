export function dentwebReservationId(record) {
  const value = Number(record?.dentwebReservationId || String(record?.concerns || record?.memo || '').match(/\[Dentweb #(\d+)\]/i)?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

const phoneKey = value => String(value || '').replace(/\D/g, '').replace(/^82(?=10)/, '0');
const nameKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '');

// Parallel appointments are valid: a time alone never identifies a patient.
export function sameDentwebReservation(a, b) {
  const aId = dentwebReservationId(a), bId = dentwebReservationId(b);
  if (aId && bId) return aId === bId;
  if (a.date !== b.date || a.time !== b.time) return false;
  const ap = phoneKey(a.phone), bp = phoneKey(b.phone);
  if (ap && bp) return ap === bp;
  const an = nameKey(a.name), bn = nameKey(b.name);
  return Boolean(an && bn && an === bn);
}
