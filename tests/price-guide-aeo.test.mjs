import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('price-guide.html', root), 'utf8');
const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
const catalog = graph.find(item => item['@type'] === 'OfferCatalog');

test('all approved insurance-specific prices remain exact, without invented units or taxes', () => {
  const expected = [
    [[2000000,4500000],[3000000,6000000]], [[700000,900000],[1000000,1500000]],
    [[400000,500000],[600000,700000]], [[100000,150000],[150000,200000]],
    [[200000,450000],[400000,700000]], [[120000],[150000]],
    [[20000,30000],[150000]], [[20000,30000],[100000]]
  ].flat();
  assert.equal(catalog.itemListElement.length, 16);
  assert.equal(new Set(catalog.itemListElement.map(offer => offer['@id'])).size, 16);
  catalog.itemListElement.forEach((offer, index) => {
    const price = offer.priceSpecification;
    assert.deepEqual(price.price === undefined ? [price.minPrice,price.maxPrice] : [price.price], expected[index]);
    assert.equal(price.priceCurrency, 'KRW');
    assert.equal(price.valueAddedTaxIncluded, undefined);
    assert.match(offer.name, index % 2 === 0 ? /with active KNHI/ : /without KNHI/);
    assert.match(offer.description, /does not mean all listed services are insured/);
    if ([2,3,4,5,6,7,8,9,12,13].includes(index)) assert.equal(offer.itemOffered.description, 'Per tooth');
    else assert.equal(offer.itemOffered.description, undefined);
  });
});

test('structured prices and FAQ stay synchronized with visible HTML', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('tools/build-price-guide-schema.mjs', root)), '--check']);
  const faq = graph.find(item => item['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 5);
  for (const question of faq.mainEntity) {
    assert.ok(html.includes(question.name.replaceAll('&', '&amp;')));
    assert.ok(html.includes(question.acceptedAnswer.text.replaceAll('&', '&amp;')));
    assert.ok(html.includes(`id="${question['@id'].split('#')[1]}"`));
  }
});

test('English price guide is directly indexable with consistent canonical and discovery links', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="robots" content="index, follow"/);
  assert.doesNotMatch(html, /http-equiv="refresh"|noindex/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /rel="canonical" href="https:\/\/lofiesthetic.com\/price-guide.html"/);
  assert.match(html, /<time datetime="2026-10-28">/); // Price review date is preserved.
  for (const page of ['dental-implants-seoul.html','teeth-whitening-seoul.html','smile-makeover-seoul.html']) {
    assert.match(fs.readFileSync(new URL(page, root), 'utf8'), /href="\/price-guide.html"/);
  }
});
