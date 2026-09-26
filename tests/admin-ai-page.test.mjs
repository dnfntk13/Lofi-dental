import test from 'node:test';
import assert from 'node:assert/strict';
import { addAdminAiToPage } from '../lib/admin-ai-page.mjs';
const html = '<body><h1>Patients</h1><script src="/assets/consult-chat.js" defer></script></body>';
test('visitors never receive the admin widget', () => {
  assert.equal(addAdminAiToPage(html, false, '/admin/calendar'), html);
});
test('authenticated staff get one admin widget only on admin pages', () => {
  const result = addAdminAiToPage(html, true, '/admin/calendar');
  assert.ok(result.includes('/admin/ai-widget.js'));
  assert.ok(!result.includes('/assets/consult-chat.js'));
  assert.equal(addAdminAiToPage(result, true, '/admin/calendar'), result);
});
test('signed-in staff keep the public consultation assistant on public pages', () => {
  for (const pathname of ['/', '/english/', '/reservation/', '/patient-reply', '/display/', '/logo.html', '/administrator', '']) {
    assert.equal(addAdminAiToPage(html, true, pathname), html);
  }
});
test('admin root and nested pages remain supported', () => {
  for (const pathname of ['/admin', '/admin/', '/admin/patients.html']) {
    assert.match(addAdminAiToPage(html, true, pathname), /\/admin\/ai-widget\.js/);
  }
});
