// Character budgets keep request sizes bounded without a tiny turn-count limit.
export function selectConversation(messages, budget = 100000) {
  const all = (Array.isArray(messages) ? messages : []).map(message => ({
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: String(message?.content || '').trim(),
  })).filter(message => message.content);
  const selected = [];
  let remaining = budget;
  for (let i = all.length - 1; i >= 0 && remaining > 0; i--) {
    const message = all[i];
    const content = message.content.slice(-remaining);
    selected.unshift({ ...message, content });
    remaining -= content.length;
  }
  return { messages: selected, truncated: all.reduce((n, m) => n + m.content.length, 0) > budget };
}

export function searchAdminRecords(query, groups, budget = 100000) {
  const normalized = String(query || '').toLowerCase();
  const terms = [...new Set(normalized.match(/[\p{L}\p{N}@._-]{2,}/gu) || [])];
  const matches = [];
  for (const [kind, records] of Object.entries(groups)) {
    for (const record of records) {
      const text = JSON.stringify(record);
      const haystack = text.toLowerCase();
      let score = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
      for (const key of ['name', 'email', 'phone', 'date', 'id']) {
        const value = String(record[key] || '').toLowerCase();
        if (value.length >= 2 && normalized.includes(value)) score += 10;
      }
      if (score) matches.push({ kind, record, score, size: text.length });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  const records = [];
  let used = 0;
  for (const match of matches) {
    if (used + match.size > budget) continue;
    records.push({ kind: match.kind, record: match.record });
    used += match.size;
  }
  return { records, matchedCount: matches.length, includedCount: records.length, truncated: records.length < matches.length };
}
