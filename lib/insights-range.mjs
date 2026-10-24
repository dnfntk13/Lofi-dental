const DAY = 86400000;
export const koreanDay = (value = new Date()) => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const shiftDay = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
export const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

export function resolveInsightsRange(params = new URLSearchParams(), now = new Date()) {
  const today = koreanDay(now);
  const preset = params.get('preset') || (params.has('from') || params.has('to') ? 'custom' : 'last_30_days');
  let from, to = today;
  if (preset === 'this_week') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    from = shiftDay(today, -(weekday + 6) % 7);
  } else if (preset === 'this_month') from = `${today.slice(0, 7)}-01`;
  else if (preset === 'last_30_days') from = shiftDay(today, -29);
  else if (preset === 'custom') { from = params.get('from'); to = params.get('to'); }
  else throw new Error('Choose This week, This month, or a custom date range.');
  if (!validDay(from) || !validDay(to) || from > to || to > today) throw new Error('Choose valid start and end dates, ending no later than today (Korea time).');
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  if (days > 366) throw new Error('Choose a date range of up to 366 days.');
  return { preset, from, to, days, timezone: 'Asia/Seoul', includesToday: to === today };
}

export function inInsightsRange(event, range) {
  const timestamp = event.timestamp || event.createdAt;
  let day;
  if (timestamp && Number.isFinite(Date.parse(timestamp))) day = koreanDay(timestamp);
  else day = event.day;
  return validDay(day) && day >= range.from && day <= range.to;
}
