import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateAdminAiCost, seoulMonth } from '../lib/admin-ai-usage.mjs';
test('cached input gets discounted and all output tokens are charged', () => {
  const result = estimateAdminAiCost({ model: 'gpt-5.4-mini-2026-03-17', usage: { prompt_tokens: 1000000, completion_tokens: 1000000, prompt_tokens_details: { cached_tokens: 400000 } } });
  assert.equal(result, 4.98);
});
test('missing usage or unknown prices are not shown as free', () => {
  assert.equal(estimateAdminAiCost({ model: 'gpt-5.4-mini' }), null);
  assert.equal(estimateAdminAiCost({ model: 'other', usage: { prompt_tokens: 1, completion_tokens: 1 } }), null);
  assert.equal(estimateAdminAiCost({ model: 'gpt-5.4-mini', service_tier: 'priority', usage: { prompt_tokens: 1, completion_tokens: 1 } }), null);
});
test('monthly totals use Seoul time across month and year boundaries', () => {
  assert.equal(seoulMonth(new Date('2026-12-31T15:00:00Z')), '2027-01');
  assert.equal(seoulMonth(new Date('2026-12-31T14:59:59Z')), '2026-12');
});
