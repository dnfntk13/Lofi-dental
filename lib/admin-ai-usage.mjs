import { MongoClient } from 'mongodb';

// USD per million tokens, standard API pricing checked 2026-09-14:
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
export function estimateAdminAiCost(data) {
  const usage = data?.usage;
  const input = usage?.prompt_tokens;
  const output = usage?.completion_tokens;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  if (![input, output, cached].every(n => Number.isInteger(n) && n >= 0) || cached > input) return null;
  if (!/^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(data.model || '')) return null;
  if (data.service_tier && !['default', 'auto'].includes(data.service_tier)) return null;
  return ((input - cached) * 0.75 + cached * 0.075 + output * 4.5) / 1e6;
}

export function seoulMonth(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 7);
}

export function createAdminAiUsage({ uri, database, fetchImpl = fetch }) {
  let connection;
  let incomplete = false;
  async function collection() {
    if (!uri) throw new Error('Usage storage unavailable');
    if (!connection) {
      connection = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect().catch(error => { connection = null; throw error; });
    }
    return (await connection).db(database).collection('adminAiUsage');
  }
  async function meteredFetch(...args) {
    const response = await fetchImpl(...args);
    if (response.ok) {
      try {
        const data = await response.clone().json();
        const at = new Date();
        const record = { at, month: seoulMonth(at), model: String(data.model || ''), costUsd: estimateAdminAiCost(data) };
        // No prompts, patient data, images or response text are stored here.
        const col = await collection();
        if (data.id) await col.updateOne({ _id: data.id }, { $setOnInsert: record }, { upsert: true });
        else await col.insertOne(record);
      } catch { incomplete = true; console.error('Admin AI usage recording unavailable'); }
    }
    return response;
  }
  async function summary() {
    const col = await collection();
    const month = seoulMonth();
    const [totals] = await col.aggregate([
      { $match: { month } },
      { $group: { _id: null, costUsd: { $sum: '$costUsd' }, requests: { $sum: 1 }, unpriced: { $sum: { $cond: [{ $eq: ['$costUsd', null] }, 1, 0] } } } },
    ]).toArray();
    const first = await col.findOne({}, { sort: { at: 1 } });
    const last = await col.findOne({ month }, { sort: { at: -1 } });
    return { month, costUsd: totals?.costUsd ?? 0, requests: totals?.requests ?? 0, unpriced: totals?.unpriced ?? 0, lastCostUsd: last?.costUsd ?? null, startedAt: first?.at ?? null, incomplete };
  }
  return { fetch: meteredFetch, summary };
}
