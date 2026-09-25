const DAY = 86400000;
const clean = v => String(v ?? '').trim();
export function koreanDay(now = new Date()) {
  return new Date(new Date(now).getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export function auditWindow(now = new Date()) {
  const throughDay = koreanDay(now);
  return { sinceDay: new Date(Date.parse(throughDay) - 13 * DAY).toISOString().slice(0,10), throughDay };
}

// Only verified DM audit records feed this report. Calendar creation time is not
// a substitute for the first confirmation in a conversation.
export function validateCampaignAudit(input, now = new Date()) {
  const coverage = input?.coverage;
  if (!coverage || !validDay(coverage.sinceDay) || !validDay(coverage.throughDay) ||
      coverage.sinceDay > coverage.throughDay || coverage.throughDay > koreanDay(now)) throw new Error('Invalid audit coverage dates');
  const auditedAt = clean(input.auditedAt);
  if (!auditedAt || !Number.isFinite(Date.parse(auditedAt)) || Date.parse(auditedAt) > new Date(now).getTime() + 60000 || koreanDay(auditedAt) < coverage.throughDay) throw new Error('Invalid audit timestamp');
  if (!Array.isArray(input.patients) || input.patients.length > 10000) throw new Error('Invalid patient audit list');
  const seen = new Set();
  const patients = input.patients.map(row => {
    const patientKey = clean(row.patientKey), confirmedDay = clean(row.confirmedDay);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(patientKey) || seen.has(patientKey)) throw new Error('Patient keys must be stable and unique');
    seen.add(patientKey);
    if (!validDay(confirmedDay) || confirmedDay > coverage.throughDay) throw new Error('Invalid first confirmation date');
    if (!['confirmed','pending','cancelled'].includes(row.status) || !['new','followup'].includes(row.visitKind)) throw new Error('Invalid booking classification');
    const campaignId = clean(row.campaignId), videoTitle = clean(row.videoTitle), evidenceUrl = clean(row.evidenceUrl);
    if (campaignId.length > 120 || videoTitle.length > 160 || !/^https:\/\/www\.instagram\.com\/direct\/t\/\d+\/$/.test(evidenceUrl)) throw new Error('Invalid campaign or DM evidence');
    return { patientKey, confirmedDay, status:row.status, visitKind:row.visitKind, campaignId, videoTitle, evidenceUrl };
  });
  return { version:1, auditedAt:new Date(auditedAt).toISOString(), coverage:{sinceDay:coverage.sinceDay,throughDay:coverage.throughDay}, limitations:clean(input.limitations).slice(0,1000), patients };
}

export function summarizeCampaignAudit(audit, titles = {}, now = new Date()) {
  const period = auditWindow(now);
  const result = { ...period, basis:'verified-instagram-dm', available:Boolean(audit), totalPatients:0, campaignPatients:0, unknownCampaignPatients:0, pendingPatients:0, byCampaign:[], auditedAt:audit?.auditedAt || null, coverage:audit?.coverage || null, limitations:audit?.limitations || '', stale:!audit || audit.coverage.sinceDay > period.sinceDay || audit.coverage.throughDay < period.throughDay };
  const groups = new Map();
  for (const row of audit?.patients || []) {
    if (row.confirmedDay < period.sinceDay || row.confirmedDay > period.throughDay || row.visitKind !== 'new') continue;
    if (row.status === 'pending') { result.pendingPatients++; continue; }
    if (row.status !== 'confirmed') continue;
    result.totalPatients++;
    if (!row.campaignId) { result.unknownCampaignPatients++; continue; }
    result.campaignPatients++;
    const title = (Object.hasOwn(titles,row.campaignId) && titles[row.campaignId]) || row.videoTitle;
    if (!groups.has(row.campaignId)) groups.set(row.campaignId, { id:row.campaignId, label:title || 'Video title unavailable', titleMissing:!title, patients:0 });
    groups.get(row.campaignId).patients++;
  }
  result.byCampaign = [...groups.values()].sort((a,b)=>b.patients-a.patients || a.label.localeCompare(b.label));
  return result;
}
