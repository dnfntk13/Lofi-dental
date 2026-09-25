import { campaignLabel } from './instagram-campaign-insights.mjs';
const clean = value => String(value || '').trim().replace(/[^\p{L}\p{N} ._\-/]/gu, '').slice(0, 120);

export function normalizeBookingAttribution(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const capturedAt = Number(value.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt > now + 60000 || now - capturedAt > 86400000) return null;
  const referrerHost = /^[a-z0-9.-]+$/i.test(value.referrerHost || '') ? String(value.referrerHost).slice(0, 160) : '';
  const landingPath = /^\/[a-z0-9/_\-.]*$/i.test(value.landingPath || '') ? String(value.landingPath).slice(0, 160) : '';
  return {
    source: clean(value.source), medium: clean(value.medium), campaign: clean(value.campaign),
    content: clean(value.content), referrerHost, landingPath, capturedAt,
  };
}

export function summarizeBookingAttribution(records, sinceDay, titles = {}) {
  const bySource = new Map();
  let total = 0;
  let googleAds = 0;
  for (const record of records) {
    // Only server-accepted web booking requests are counted, never confirmation-page views.
    if (record.measurement?.event !== 'booking_request') continue;
    const day = new Date(record.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    if (day < sinceDay) continue;
    total += 1;
    const source = record.acquisition || {};
    if (source.source?.toLowerCase() === 'google' && /^(cpc|ppc|paid_search)$/i.test(source.medium || '')) googleAds += 1;
    const label = [source.source, source.medium, source.campaign ? campaignLabel(source.campaign, titles) : ""].filter(Boolean).join(' / ') || source.referrerHost || 'Direct / unattributed';
    bySource.set(label, (bySource.get(label) || 0) + 1);
  }
  return { total, googleAds, bySource: [...bySource].map(([label, views]) => ({ label, views })).sort((a, b) => b.views - a.views) };
}
