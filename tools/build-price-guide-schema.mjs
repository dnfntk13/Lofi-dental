import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Derive machine-readable prices and answers from the visible English page.
// After editing the table or FAQ, run this script; --check detects stale markup.
const file = fileURLToPath(new URL('../price-guide.html', import.meta.url));
const html = fs.readFileSync(file, 'utf8');
const text = value => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const url = 'https://lofiesthetic.com/price-guide.html';
const clinic = { '@id': 'https://lofiesthetic.com/#clinic' };
const conditions = 'Clinic prices depend on active Korean National Health Insurance enrollment; this does not mean all listed services are insured. Extraction and checkup & cleaning prices with KNHI are estimates for eligible covered care. Included treatment, additional procedures, applicable taxes and final cost are confirmed before treatment.';
const offers = [];
const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
if (!body) throw new Error('Visible price table is missing');
for (const row of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
  const heading = row[1].match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1];
  const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
  if (!heading || cells.length !== 2) throw new Error('Expected a treatment and two insurance columns');
  const name = text(heading.replace(/<small>[\s\S]*?<\/small>/, ''));
  const unit = text(heading.match(/<small>([\s\S]*?)<\/small>/)?.[1] || '');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  cells.forEach((cell, index) => {
    const amounts = text(cell[1]).match(/\d[\d,]*/g)?.map(value => Number(value.replaceAll(',', '')));
    if (!amounts?.length || amounts.length > 2 || amounts.some(value => !Number.isFinite(value))) throw new Error(`Invalid price for ${name}`);
    const insurance = index === 0 ? 'with active KNHI' : 'without KNHI';
    const priceSpecification = { '@type': 'PriceSpecification', priceCurrency: 'KRW', ...(amounts.length === 1 ? { price: amounts[0] } : { minPrice: amounts[0], maxPrice: amounts[1] }), description: [unit, insurance, conditions].filter(Boolean).join('. ') };
    offers.push({ '@type': 'Offer', '@id': `${url}#${slug}-${index === 0 ? 'with' : 'without'}-knhi`, name: `${name} — ${insurance}`, url: `${url}#prices`, description: conditions, offeredBy: clinic, itemOffered: { '@type': 'Service', '@id': `${url}#service-${slug}`, name, provider: clinic, ...(unit ? { description: unit } : {}) }, priceSpecification });
  });
}
if (offers.length !== 16) throw new Error('Expected all eight approved treatments in both insurance columns');
const questions = [...html.matchAll(/<details id="([^"]+)"[^>]*><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(([, id, question, answer]) => ({ '@type': 'Question', '@id': `${url}#${id}`, name: text(question), acceptedAnswer: { '@type': 'Answer', text: text(answer) } }));
if (!questions.length) throw new Error('Visible FAQ is missing');
const schema = { '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', '@id': url, name: 'Dental Treatment Prices in Seoul', url, inLanguage: 'en', dateModified: '2026-10-29', about: clinic, mainEntity: { '@id': `${url}#price-catalog` }, hasPart: { '@id': `${url}#price-questions` } },
  { '@type': 'Dentist', ...clinic, name: 'lofi esthetic dentistry', url: 'https://lofiesthetic.com/', address: { '@type': 'PostalAddress', streetAddress: '3F, 49 Apgujeong-ro 28-gil', addressLocality: 'Gangnam-gu', addressRegion: 'Seoul', addressCountry: 'KR' }, hasOfferCatalog: { '@id': `${url}#price-catalog` } },
  { '@type': 'OfferCatalog', '@id': `${url}#price-catalog`, name: 'Dental treatment prices with and without Korean National Health Insurance', description: conditions, numberOfItems: offers.length, itemListElement: offers },
  { '@type': 'FAQPage', '@id': `${url}#price-questions`, inLanguage: 'en', isPartOf: { '@id': url }, mainEntity: questions }
] };
const script = `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
const updated = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, script);
if (process.argv.includes('--check')) {
  if (updated !== html) throw new Error('Price schema is stale; run node tools/build-price-guide-schema.mjs');
  console.log('Price schema matches all 16 visible prices and FAQ answers.');
} else {
  fs.writeFileSync(file, updated);
  console.log('Updated price guide schema from the visible table and FAQ.');
}
