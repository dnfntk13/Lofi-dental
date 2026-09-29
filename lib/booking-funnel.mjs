export const funnelSteps = ['booking_open','time_selected','details_started','submit_attempt','accepted'];
export function funnelSession(value) { return /^[a-zA-Z0-9_-]{16,80}$/.test(String(value || '')) ? value : null; }
export function summarizeFunnel(events) {
  const count = rows => Object.fromEntries(funnelSteps.map(step=>[step,new Set(rows.filter(e=>e.step===step).map(e=>e.session)).size]));
  const rows=events.filter(e=>e.kind==='booking_funnel' && funnelSession(e.session));
  const groups=key=>[...new Set(rows.map(e=>e[key]||'unknown'))].map(label=>({label,...count(rows.filter(e=>(e[key]||'unknown')===label))}));
  return {steps:count(rows),byDevice:groups('device'),bySource:groups('source'),since:rows.map(e=>e.timestamp).sort()[0]||null};
}
