import test from 'node:test';
import assert from 'node:assert/strict';
import { selectConversation, searchAdminRecords } from '../lib/admin-ai-context.mjs';
test('keeps facts older than five exchanges and bounds long histories', () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({ role: 'user', content: `fact ${i}` }));
  assert.equal(selectConversation(messages).messages.length, 60);
  const limited = selectConversation(messages, 30);
  assert.equal(limited.truncated, true);
  assert.equal(limited.messages.map(m => m.content).join('').length, 30);
  assert.equal(limited.messages.at(-1).content, 'fact 59');
});
test('finds older bookings by Korean name and includes full matching conversation', () => {
  const result = searchAdminRecords('박세종의 옛날 예약 확인', {
    reservations: [{ name: '박세종', date: '2020-01-01', id: 'old' }],
    threads: [{ email: 'test@example.test', messages: [{ content: '박세종 예약 문의' }, { content: '후속 답변' }] }],
  });
  assert.equal(result.includedCount, 2);
  assert.equal(result.records[1].record.messages.length, 2);
});
test('reports incomplete search when matching data exceeds budget', () => {
  const result = searchAdminRecords('test', { patients: [{ name: 'test', notes: 'x'.repeat(1000) }] }, 50);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.truncated, true);
});
