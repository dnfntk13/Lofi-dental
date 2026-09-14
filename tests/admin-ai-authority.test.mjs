import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuthority, validateWebsitePath, replaceExactText } from '../lib/admin-ai-authority.mjs';

test('credentials and hidden files are never exposed as editable source paths', () => {
  for (const path of ['../server.mjs', '/server.mjs', '.env', '.github/workflows/a.js', 'x/../a.js', 'x\\a.js', '%2e%2e/a.js', 'node_modules/a.js', 'secrets.json', '']) assert.throws(() => validateWebsitePath(path));
  for (const path of ['server.mjs', 'lib/admin-ai-model.mjs', 'admin/ai.html', 'assets/site.css']) assert.equal(validateWebsitePath(path), path);
});
test('only one exact source fragment may change', () => {
  assert.equal(replaceExactText('a price b', 'price', 'new'), 'a new b');
  for (const args of [['a a', 'a', 'b'], ['abc', 'z', 'b'], ['abc', '', 'b'], ['abc', 'a', 'a']]) assert.throws(() => replaceExactText(...args));
});
test('missing integrations fail closed without exposing credentials or making requests', async () => {
  const authority = createAdminAuthority({ env: {}, fetchImpl: () => { throw Error('No calls expected'); } });
  for (const operation of ['editWebsiteFile', 'deployWebsite', 'getDeploymentStatus']) await assert.rejects(authority.prepare(operation, {}), { statusCode: 503 });
  await assert.rejects(authority.prepare('runShell', {}));
  const configured = createAdminAuthority({ env: { ADMIN_AI_GITHUB_TOKEN: 'SECRET-A', RENDER_API_KEY: 'SECRET-B' } });
  assert.ok(!JSON.stringify(configured.capabilities()).includes('SECRET'));
});
test('writes require a preview token and explicit confirmation, and ignore client payload tampering', async () => {
  const calls = [];
  const authority = createAdminAuthority({ env: {}, executeRecord: async (...args) => { calls.push(args); return { ok: true }; } });
  const preview = await authority.prepare('deleteReservation', { id: 'reviewed-id' });
  assert.equal(calls.length, 0);
  await assert.rejects(authority.execute(preview.confirmationToken, false), { statusCode: 403 });
  await authority.execute(preview.confirmationToken, true);
  assert.deepEqual(calls, [['deleteReservation', { id: 'reviewed-id' }]]);
  await assert.rejects(authority.execute(preview.confirmationToken, true), { statusCode: 409 });
});
test('concurrent requests and expired approvals cannot repeat a write', async () => {
  let now = 0, count = 0;
  const authority = createAdminAuthority({ env: {}, now: () => now, executeRecord: async () => { count++; return { ok: true }; } });
  const a = await authority.prepare('createReservation', {});
  const outcomes = await Promise.allSettled([authority.execute(a.confirmationToken, true), authority.execute(a.confirmationToken, true)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(count, 1);
  const b = await authority.prepare('deletePatient', { email: 'test@example.com' });
  now += 600001;
  await assert.rejects(authority.execute(b.confirmationToken, true), { statusCode: 409 });
});
test('source changes preserve unrelated content and reject stale previews', async () => {
  let sha = 'a'.repeat(40), writes = [];
  const fetchImpl = async (url, options) => {
    if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ commit: { sha: 'b'.repeat(40) } }) }; }
    return { ok: true, json: async () => ({ type: 'file', encoding: 'base64', size: 30, content: Buffer.from('HEADER price FOOTER').toString('base64'), sha }) };
  };
  const authority = createAdminAuthority({ env: { ADMIN_AI_GITHUB_TOKEN: 'test' }, fetchImpl });
  const p = await authority.prepare('editWebsiteFile', { path: 'price-guide.html', before: 'price', after: 'new price' });
  assert.equal(writes.length, 0);
  await authority.execute(p.confirmationToken, true);
  assert.equal(Buffer.from(writes[0].content, 'base64').toString(), 'HEADER new price FOOTER');
  assert.equal(writes[0].sha, sha);
  const q = await authority.prepare('editWebsiteFile', { path: 'price-guide.html', before: 'price', after: 'updated' });
  sha = 'c'.repeat(40);
  await assert.rejects(authority.execute(q.confirmationToken, true), { statusCode: 409 });
  assert.equal(writes.length, 1);
});
test('deployment pins the reviewed commit and reports pending, not success', async () => {
  let deployed;
  const commitId = 'f'.repeat(40);
  const authority = createAdminAuthority({ env: { RENDER_API_KEY: 'test' }, fetchImpl: async (url, options) => {
    if (options.method === 'POST') { deployed = JSON.parse(options.body); return { ok: true, json: async () => ({ id: 'dep-test', status: 'build_in_progress' }) }; }
    return { ok: true, json: async () => ({ sha: commitId, commit: { message: 'Reviewed update' } }) };
  } });
  const preview = await authority.prepare('deployWebsite', {});
  assert.equal(preview.preview.commitId, commitId);
  assert.equal(deployed, undefined);
  const result = await authority.execute(preview.confirmationToken, true);
  assert.equal(deployed.commitId, commitId);
  assert.equal(result.status, 'build_in_progress');
});
