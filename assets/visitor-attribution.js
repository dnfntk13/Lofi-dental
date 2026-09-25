/* First-party attribution only. No Google tag, cookies, or third-party requests.
 * Lofi has no advertising-measurement consent flow yet. Do not add automatic
 * Google reporting here; a future integration must require explicit consent.
 */
(() => {
  const key = 'lofi_visit_source_v1';
  const maxAge = 24 * 60 * 60 * 1000;
  const clean = value => String(value || '').trim().replace(/[^\p{L}\p{N} ._\-/]/gu, '').slice(0, 120);
  let attribution = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved && Number.isFinite(saved.capturedAt) && Date.now() - saved.capturedAt < maxAge) attribution = saved;
  } catch { /* Storage is optional; booking must still work. */ }
  const params = new URLSearchParams(location.search);
  let referrerHost = '';
  try {
    const referrer = new URL(document.referrer);
    if (referrer.hostname !== location.hostname) referrerHost = referrer.hostname;
  } catch { /* Direct visit. */ }
  if (!attribution || params.has('utm_source') || referrerHost) {
    attribution = {
      source: clean(params.get('utm_source')),
      medium: clean(params.get('utm_medium')),
      campaign: clean(params.get('utm_campaign')),
      content: clean(params.get('utm_content')),
      referrerHost: referrerHost.slice(0, 160),
      landingPath: location.pathname.slice(0, 160),
      capturedAt: Date.now(),
    };
    try { sessionStorage.setItem(key, JSON.stringify(attribution)); } catch { /* Optional storage. */ }
  }
  // Do not retain click IDs, search terms, patient details, or appointment times.
  window.lofiAttribution = { get: () => ({ ...attribution }) };
})();
