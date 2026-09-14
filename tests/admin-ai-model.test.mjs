import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdminAiModel, adminAiRequestOptions, parseAdminAiJson } from '../lib/admin-ai-model.mjs';

test('admin default is independent from existing public model environment', () => {
  assert.equal(getAdminAiModel({ OPENAI_MODEL: 'gpt-4o-mini' }), 'gpt-5.4');
  assert.equal(getAdminAiModel({ ADMIN_AI_MODEL: '  ' }), 'gpt-5.4');
  assert.equal(getAdminAiModel({ ADMIN_AI_MODEL: 'gpt-5.5' }), 'gpt-5.5');
});
test('GPT-5 request limits output and uses high reasoning without unsupported sampling parameters', () => {
  const options = adminAiRequestOptions(getAdminAiModel({}));
  assert.equal(options.model, 'gpt-5.4');
  assert.equal(options.reasoning_effort, 'high');
  assert.equal(options.max_completion_tokens, 24000);
  assert.equal(options.temperature, undefined);
  assert.equal(options.store, false);
  assert.equal(adminAiRequestOptions('gpt-4.1-mini').reasoning_effort, undefined);
});
test('truncated, refused, or malformed responses cannot silently become empty admin results', () => {
  for (const [finish_reason, content, refusal] of [['length', '{}'], ['stop', 'invalid'], ['stop', 'null'], ['stop', '[]'], ['stop', '{}', 'refused']]) {
    assert.throws(() => parseAdminAiJson({ choices: [{ finish_reason, message: { content, refusal } }] }), { statusCode: 502 });
  }
  assert.deepEqual(parseAdminAiJson({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":"Ready"}' } }] }), { answer: 'Ready' });
});
