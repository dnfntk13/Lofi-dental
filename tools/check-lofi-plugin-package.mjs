import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || fileURLToPath(new URL('../plugins/lofi-esthetic-dentistry/', import.meta.url)));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));
const manifest = read('plugin.json');
const ext = manifest.extensions['com.openai'];
const listing = ext.interface;
assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
assert.match(manifest.name, /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
for (const key of ['displayName', 'shortDescription']) assert.ok(listing[key].length <= 30 && listing[key].trim().length);
assert.equal(listing.category, 'Healthcare');
for (const key of ['websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL']) assert.equal(new URL(listing[key]).origin, 'https://lofiesthetic.com');
assert.ok(listing.defaultPrompt.length <= 3);
for (const prompt of listing.defaultPrompt) assert.ok(prompt.trim() && prompt.length <= 128 && !prompt.includes('\n'));
assert.equal(ext.review.test_cases.positive.length, 5);
assert.equal(ext.review.test_cases.negative.length, 3);
for (const entry of ext.review.test_cases.positive) for (const key of ['description','prompt','tools_triggered','expected_behavior']) assert.ok(entry[key]?.trim());
for (const field of ['logo','composerIcon']) {
  const asset = path.resolve(root, listing[field]);
  assert.ok(asset.startsWith(root + path.sep));
  const bytes = fs.readFileSync(asset);
  assert.equal(bytes.subarray(1,4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  assert.ok(bytes.readUInt32BE(16) >= 256 && bytes.readUInt32BE(16) <= 4096);
  assert.ok(bytes.length <= 5 * 1024 * 1024);
}
const mcp = read('mcp.json');
assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
assert.deepEqual(Object.keys(mcp.mcpServers), ['lofi']);
assert.deepEqual(mcp.mcpServers.lofi, { type:'streamable-http',url:'https://lofiesthetic.com/mcp' });
assert.ok(!fs.existsSync(path.join(root, '.app.json')));
assert.ok(!('apps' in ext) && !('hooks' in ext));
assert.deepEqual(ext.publication.countries, []);
console.log(JSON.stringify({ package: manifest.name, version: manifest.version, subtitleLength: listing.shortDescription.length, positiveCases: 5, negativeCases: 3, squareIcon: true, allSupportedCountries: true, packageValidation: 'passed', publicSubmissionReady: false, missing: ['Actual ChatGPT review-case execution and reviewer-accessible recording', 'Portal publisher/domain verification, scans, authorized attestations and review'] }));
