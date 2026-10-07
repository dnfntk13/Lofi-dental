import { createHash } from 'node:crypto';
const DAY = 86400000;
export const reminderSender = 'lofidentalcs@lofiesthetic.com';
export function reminderPlan(record, now = new Date(), hour = 9) {
  if (!record?.id || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email || '') || record.remindersDisabled) return null;
  const status = String(record.bookingStatus || record.status || '').toLowerCase();
  if (status && !['confirmed', 'scheduled', 'active'].includes(status)) return null;
  if (record.cancelledAt || record.canceledAt || record.completedAt || record.attendedAt) return null;
  if (/concourse|컨코스|취소|재조율|미확정|내원 완료|cancel|reschedul.*pending|awaiting.*confirm|no.?show/i.test(record.concerns || '')) return null;
  if (record.dentwebSyncStatus && record.dentwebSyncStatus !== 'completed') return null;
  const date = String(record.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return null;
  const m = String(record.time || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m || +m[2] > 59 || (m[3] ? +m[1] < 1 || +m[1] > 12 : +m[1] > 23)) return null;
  const h = m[3] ? +m[1] % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0) : +m[1];
  const time = String(h).padStart(2,'0') + ':' + m[2];
  const start = Date.parse(date + 'T' + time + ':00+09:00');
  const kst = new Date(now.getTime() + 9 * 3600000);
  if (start <= now.getTime() || kst.getUTCHours() < hour || kst.getUTCHours() >= 18) return null;
  const days = Math.round((Date.parse(date) - Date.parse(kst.toISOString().slice(0,10))) / DAY);
  if (![0,1,2].includes(days)) return null;
  const email = record.email.trim().toLowerCase();
  // One reminder per recipient/appointment/stage even if duplicate web rows exist.
  const key = createHash('sha256').update([email,date,time,days].join('|')).digest('hex');
  return {key, id:record.id, email, date, time, days};
}
export function reminderMessage(plan) {
  const when = ['today', 'tomorrow', 'in two days'][plan.days];
  return {from:reminderSender, replyTo:reminderSender, to:plan.email,
    subject:`Your lofi dental appointment is ${when}`,
    text:`Hello,\n\nThis is a reminder of your appointment at lofi esthetic dentistry.\n\nDate: ${plan.date}\nTime: ${plan.time} (Korea Standard Time)\nAddress: 49 Apgujeong-ro 28-gil, 3F, Gangnam-gu, Seoul\n\nIf you need to change or cancel your appointment, please reply to this email.\n\nSee you then!\nlofi esthetic dentistry\n+82-70-7755-8823`};
}
export async function deliverReminders({records, readCurrent, claim, finish, send, now = new Date(), hour = 9, clock = () => new Date()}) {
  for (const record of records) {
    const plan = reminderPlan(record, now, hour);
    if (!plan) continue;
    const fresh = reminderPlan(await readCurrent(record.id), now, hour);
    if (!fresh || fresh.key !== plan.key || !await claim(plan)) continue;
    // Do not retry ambiguous delivery failures: a provider may already have accepted the email.
    try {
      const latest = reminderPlan(await readCurrent(record.id), clock(), hour);
      if (!latest || latest.key !== plan.key) { await finish(plan, 'skipped'); continue; }
      const result = await send(reminderMessage(plan), plan.key);
      await finish(plan, 'sent', result);
    } catch { await finish(plan, 'needs_review'); }
  }
}
