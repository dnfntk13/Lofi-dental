import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicPricingQuestion, removePublicPricingInformation, publicConsultThreadWithoutPrices } from '../lib/public-consult-price-policy.mjs';

test('pricing questions and quotes are redirected without exposing amounts', () => {
  for (const question of ['How much are veneers?', '교정 비용과 할인은?', 'Can I pay in installments?', '₩120,000', '700,000 won', 'USD 500']) assert.equal(isPublicPricingQuestion(question), true);
  const reply = removePublicPricingInformation({ answer: 'Whitening is ₩120,000 per cycle.', suggestedQuestions: ['Can I pay in installments?', 'What are your clinic hours?'] }, '미백 비용은?');
  assert.match(reply.answer, /병원 직원/);
  assert.doesNotMatch(reply.answer, /120|₩/);
  assert.deepEqual(reply.suggestedQuestions, ['What are your clinic hours?']);
});

test('ordinary appointment times and dental guidance remain available', () => {
  const reply = { answer: 'We open at 10:00 AM. A consultation takes about 30 minutes.', suggestedQuestions: ['How long does it take?'] };
  assert.deepEqual(removePublicPricingInformation(reply, 'When do you open?'), reply);
});

test('public history omits old price quotes without changing stored staff or patient records', () => {
  const stored = [{ type: 'customer-reply', content: 'How much is whitening?' }, { type: 'admin-reply', content: 'Whitening is 120,000 won.', aiAssist: { suggestedQuestions: ['How much is it?', 'Where are you located?'] } }];
  const publicThread = publicConsultThreadWithoutPrices(stored);
  assert.equal(publicThread[0], stored[0]);
  assert.doesNotMatch(publicThread[1].content, /120|won/);
  assert.deepEqual(publicThread[1].aiAssist.suggestedQuestions, ['Where are you located?']);
  assert.equal(stored[1].content, 'Whitening is 120,000 won.');
});
