(() => {
  const box = document.getElementById('aiUsage');
  if (!box) return;
  const money = value => '$' + value.toFixed(5);
  async function refresh() {
    try {
      const response = await fetch('/api/admin/ai-usage', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const usage = await response.json();
      box.textContent = `${usage.month} 예상 비용 ${money(usage.costUsd)} · ${usage.requests}회` +
        (usage.lastCostUsd !== null ? ` · 최근 요청 ${money(usage.lastCostUsd)}` : '') +
        (usage.unpriced || usage.incomplete ? ' · 일부 사용량 미집계' : '');
    } catch { box.textContent = '사용 비용을 불러오지 못했습니다'; }
  }
  refresh();
  document.addEventListener('admin-ai-usage-refresh', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
