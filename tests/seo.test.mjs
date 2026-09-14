import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = 'https://lofiesthetic.com';
const sitemap = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
const pages = new Map();
for (const url of urls) {
  const path = new URL(url).pathname;
  const file = path === '/' ? 'english/index.html' : path === '/korean' ? 'index.html' : path.slice(1);
  pages.set(url, await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
}

test('sitemap includes distinct public canonical pages with complete metadata', () => {
  assert.equal(urls.length, 9);
  assert.equal(new Set(urls).size, urls.length);
  for (const [url, html] of pages) {
    assert.equal(new URL(url).origin, origin);
    assert.doesNotMatch(url, /\/admin|\/api\/|received/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);
    assert.doesNotMatch(html, /<meta[^>]+content="[^"]*noindex/);
    const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
    assert.deepEqual(canonicals.map(match => match[1]), [url]);
    assert.ok(html.includes(`property="og:url" content="${url}"`));
  }
});

test('translated pages have reciprocal language links to canonical URLs', () => {
  for (const [url, html] of pages) {
    const links = [...html.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)];
    if (!links.length) continue;
    assert.deepEqual(links.map(link => link[1]).sort(), ['en', 'ko', 'x-default']);
    for (const [, language, target] of links) {
      const other = pages.get(target);
      assert.ok(other, `${target} must be in sitemap`);
      assert.ok(other.includes(`href="${url}"`), `${target} must link back to ${url}`);
      if (language !== 'x-default') assert.ok(other.includes(`<html lang="${language}">`));
    }
  }
});

test('home pages describe the same clinic with valid JSON-LD', () => {
  for (const path of ['/', '/korean']) {
    const html = pages.get(origin + path);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.equal(blocks.length, 1);
    const data = JSON.parse(blocks[0][1]);
    const clinic = data['@graph'].find(item => item['@type'] === 'Dentist');
    assert.equal(clinic['@id'], origin + '/#clinic');
    assert.equal(clinic.telephone.replace(/[^0-9]/g, ''), '821029848823');
    assert.ok(html.includes('tel:01029848823'));
    assert.equal(clinic.address.addressCountry, 'KR');
    assert.equal(clinic.aggregateRating, undefined);
  }
});

test('search crawling stays open while administrative routes are excluded', async () => {
  const robots = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /User-agent: \*\nAllow: \/\n/);
  for (const path of ['/admin', '/api/', '/reservation/received.html']) assert.ok(robots.includes(`Disallow: ${path}\n`));
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
});
