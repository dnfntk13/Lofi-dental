import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateAdminAiCost } from '../lib/admin-ai-usage.mjs';
test('flagship costs include cached discount and long context premium', () => {
 assert.equal(estimateAdminAiCost({ model:'gpt-5.4-2026-03-05', usage:{prompt_tokens:100000,completion_tokens:10000,prompt_tokens_details:{cached_tokens:40000}} }),0.31);
 assert.equal(estimateAdminAiCost({ model:'gpt-5.4',usage:{prompt_tokens:300000,completion_tokens:10000} }),1.725);
});
