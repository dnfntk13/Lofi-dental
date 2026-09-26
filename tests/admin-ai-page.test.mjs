import test from 'node:test';
import assert from 'node:assert/strict';
import { addAdminAiToPage } from '../lib/admin-ai-page.mjs';
const html = '<body><h1>Patients</h1><script src="/assets/consult-chat.js" defer></script></body>';
test('visitors never receive the admin widget', () => {
  assert.equal(addAdminAiToPage(html, false), html);
});
test('authenticated staff get one admin widget on any HTML page', () => {
  const result = addAdminAiToPage(html, true);
  assert.ok(result.includes('/admin/ai-widget.js'));
  assert.ok(!result.includes('/assets/consult-chat.js'));
  assert.equal(addAdminAiToPage(result, true), result);
});
