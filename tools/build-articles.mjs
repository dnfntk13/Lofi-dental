import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updated } from '../content/articles.mjs';
import { articles } from '../content/article-answers.mjs';
import { addGoogleTagToPage } from '../lib/google-tag.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://lofiesthetic.com';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const href = (lang, slug = '') => `/articles/${lang === 'ko' ? 'ko/' : ''}${slug ? slug + '.html' : ''}`;
const home = lang => lang === 'ko' ? '/korean' : '/';
const ui = {
  en: { title: 'Dental articles from Seoul', intro: 'Thoughtful answers before your next appointment. Explore smile makeovers, veneers, implants, full mouth restoration and teeth whitening with lofi in Apgujeong, Gangnam.', nav: 'Articles', doctors: 'Meet our doctors', read: 'Read article', all: 'All articles', updated: 'Updated', contents: 'In this article', related: 'Keep reading', sources: 'Sources & further reading', cta: 'Bring your questions to lofi.', ctaBody: 'Discuss your priorities in an English consultation in Apgujeong, Gangnam, Seoul.', book: 'Request a consultation', guide: 'Explore this treatment', note: 'General patient information. An examination is needed to determine the care appropriate for your teeth.', location: '3F, 49 Apgujeong-ro 28-gil, Gangnam-gu, Seoul', teaser: 'A little clarity, before your visit.', more: 'Explore all articles', switch: '한국어' },
  ko: { title: '진료를 이해하는 시간', intro: '스마일 메이크오버부터 라미네이트, 임플란트, 전악 수복, 치아미백까지. 압구정 로우파이 치과에서 상담 전에 알아두면 좋은 질문과 정보를 전합니다.', nav: '아티클', doctors: '의료진 소개', read: '글 읽기', all: '전체 아티클', updated: '업데이트', contents: '이 글의 내용', related: '함께 읽어보세요', sources: '출처 및 참고 자료', cta: '궁금한 점을 함께 이야기해요.', ctaBody: '서울 강남구 압구정 로우파이 치과에서 원하는 변화와 진료 계획을 상담하세요.', book: '상담 예약하기', guide: '관련 진료 알아보기', note: '일반적인 환자 안내 자료입니다. 본인에게 적합한 치료는 구강검사 후 판단합니다.', location: '서울특별시 강남구 압구정로28길 49, 3층', teaser: '상담 전에, 조금 더 알아보세요.', more: '전체 아티클 보기', switch: 'English' }
};
function head(lang, title, description, url, alternate, schema, image = 'waiting-room.jpg') {
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | lofi</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${origin + url}"><link rel="alternate" hreflang="en" href="${origin + (lang === 'en' ? url : alternate)}"><link rel="alternate" hreflang="ko" href="${origin + (lang === 'ko' ? url : alternate)}"><link rel="alternate" hreflang="x-default" href="${origin + (lang === 'en' ? url : alternate)}">
<meta property="og:type" content="${schema[0]['@type'] === 'Article' ? 'article' : 'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${origin + url}"><meta property="og:image" content="${origin}/assets/story/${image}">
<meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/assets/articles.css">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': schema }).replaceAll('<', '\\u003c')}</script>
<script src="/assets/visitor-attribution.js" defer></script><script src="/assets/booking-funnel.js" defer></script></head>`;
}
function header(lang, alternate) {
  const t = ui[lang];
  return `<body class="journal-page"><a class="journal-skip" href="#main">${lang === 'ko' ? '본문 바로가기' : 'Skip to content'}</a><header class="journal-header"><a href="${home(lang)}" aria-label="lofi home"><img src="/assets/lofi-logo-violet.png" alt="lofi esthetic dentistry" width="126"></a><nav aria-label="${lang === 'ko' ? '사이트 메뉴' : 'Site navigation'}"><a href="${href(lang)}">${t.nav}</a><a href="${home(lang)}#meet-our-doctors">${t.doctors}</a><a href="${alternate}" lang="${lang === 'ko' ? 'en' : 'ko'}">${t.switch}</a></nav></header>`;
}
function footer(lang) {
  const t = ui[lang];
  return `<footer class="journal-footer"><a href="${home(lang)}">lofi esthetic dentistry</a><p>${t.location}</p><a href="${home(lang)}#location">${lang === 'ko' ? '오시는 길' : 'Find us in Apgujeong'}</a></footer></body></html>\n`;
}
function cards(lang, items, level = 3) {
  const t = ui[lang], i = lang === 'ko' ? 1 : 0;
  return `<div class="journal-grid">${items.map(a => `<article class="journal-card"><a class="journal-image-link" href="${href(lang, a.slug)}" tabindex="-1" aria-hidden="true"><img src="/assets/story/${a.image}" alt="" width="640" height="400" loading="lazy"></a><div class="journal-card-body"><p class="journal-kicker">${a.category[i]}</p><h${level}><a href="${href(lang, a.slug)}">${esc(a[lang].title)}</a></h${level}><p>${esc(a[lang].description)}</p><a class="journal-text-link" href="${href(lang, a.slug)}" aria-label="${esc(t.read + ': ' + a[lang].title)}">${t.read} <span aria-hidden="true">↗</span></a></div></article>`).join('\n')}</div>`;
}
function answerContent(c, lang) {
  const table = c.table;
  return `<section id="comparison" class="journal-comparison"><h2>${esc(table.title)}</h2><div class="journal-table-scroll" role="region" aria-label="${esc(table.title)}" tabindex="0"><table><caption class="journal-sr-only">${esc(table.title)}</caption><thead><tr>${table.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section><section id="questions" class="journal-faq"><h2>${lang === 'ko' ? '자주 묻는 질문' : 'Frequently asked questions'}</h2>${[[c.question, c.answer], ...c.faqs].map(([q, a]) => `<div><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('')}</section>`;
}
function write(url, html) {
  const filename = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, addGoogleTagToPage(html));
}
for (const lang of ['en', 'ko']) {
  const t = ui[lang], other = lang === 'en' ? 'ko' : 'en';
  const collection = { '@type': 'CollectionPage', name: t.title, description: t.intro, url: origin + href(lang), inLanguage: lang, mainEntity: { '@type': 'ItemList', itemListElement: articles.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: origin + href(lang, a.slug), name: a[lang].title })) } };
  write(href(lang), head(lang, t.title, t.intro, href(lang), href(other), [collection]) + header(lang, href(other)) + `<main id="main" class="journal-main"><div class="journal-intro"><p class="journal-kicker">LOFI JOURNAL · SEOUL</p><h1>${t.title}</h1><p>${t.intro}</p></div><section aria-label="${t.all}">${cards(lang, articles, 2)}</section></main>` + footer(lang));
  for (const [index, a] of articles.entries()) {
    const c = a[lang], url = href(lang, a.slug), alternate = href(other, a.slug), i = lang === 'ko' ? 1 : 0;
    const schema = { '@type': 'Article', headline: c.title, description: c.description, inLanguage: lang, dateModified: updated, image: origin + '/assets/story/' + a.image, mainEntityOfPage: origin + url, author: { '@type': 'Organization', '@id': origin + '/#clinic', name: 'lofi esthetic dentistry', url: origin }, publisher: { '@id': origin + '/#clinic', '@type': 'Dentist', name: 'lofi esthetic dentistry', url: origin } };
    const breadcrumb = { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'lofi', item: origin + home(lang) }, { '@type': 'ListItem', position: 2, name: t.nav, item: origin + href(lang) }, { '@type': 'ListItem', position: 3, name: c.title, item: origin + url }] };
    const sections = c.sections.map(([title, ...paragraphs], n) => `<section id="section-${n + 1}"><h2>${esc(title)}</h2>${paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}</section>`).join('\n');
    const related = [articles[(index + 1) % articles.length], articles[(index + 2) % articles.length]];
    write(url, head(lang, c.title, c.description, url, alternate, [schema, breadcrumb], a.image) + header(lang, alternate) + `<main id="main" class="journal-main"><article><header class="journal-intro"><a class="journal-back" href="${href(lang)}">← ${t.all}</a><p class="journal-kicker">${a.category[i]} · APGUJEONG, SEOUL</p><h1>${esc(c.title)}</h1><p class="journal-deck">${esc(c.intro)}</p><p class="journal-meta">lofi esthetic dentistry · ${t.updated} <time datetime="${updated}">${updated}</time></p><div class="journal-answer"><p class="journal-kicker">${lang === 'ko' ? '핵심 답변' : 'The short answer'}</p><p>${esc(c.directAnswer)}</p></div></header>
<img class="journal-hero-image" src="/assets/story/${a.image}" alt="${esc(a.alt[i])}" width="1200" height="640">
<div class="journal-reading-layout"><nav class="journal-toc" aria-label="${t.contents}"><p>${t.contents}</p><ol>${c.sections.map(([title], n) => `<li><a href="#section-${n + 1}">${esc(title)}</a></li>`).join('')}<li><a href="#comparison">${esc(c.table.title)}</a></li><li><a href="#questions">${lang === 'ko' ? '자주 묻는 질문' : 'Frequently asked questions'}</a></li></ol></nav><div class="journal-prose">${sections}${answerContent(c, lang)}<p><a href="${a.guide[i]}" class="journal-text-link">${t.guide} →</a></p>${a.mapLink ? `<p><a class="journal-text-link" href="${esc(a.mapLink)}">${lang === 'ko' ? '안다즈에서 구글 지도 길찾기' : 'Directions from Andaz on Google Maps'} ↗</a></p>` : ''}<aside class="journal-clinic"><h2>${lang === 'ko' ? '로우파이 치과에서 상담하기' : 'Consultation at lofi'}</h2><p>${lang === 'ko' ? '서울 강남구 압구정로28길 49, 3층. 영어 상담이 가능합니다.' : 'English consultation at 3F, 49 Apgujeong-ro 28-gil, Apgujeong, Gangnam, Seoul.'}</p><a href="${home(lang)}#meet-our-doctors">${lang === 'ko' ? 'Dr. Ryan Kim · Dr. Joey Chung 의료진 소개' : 'Meet Dr. Ryan Kim and Dr. Joey Chung'}</a></aside><aside class="journal-sources"><h2>${t.sources}</h2><ul>${a.sources.map(([title, link]) => `<li><a href="${link}">${esc(title)}</a></li>`).join('')}</ul><p>${t.note}</p></aside></div></div></article>
<aside class="journal-cta"><h2>${t.cta}</h2><p>${t.ctaBody}</p><a class="journal-button" href="/reservation/${lang === 'ko' ? '?lang=ko' : ''}">${t.book} ↗</a></aside><section class="journal-related" aria-labelledby="related-title"><h2 id="related-title">${t.related}</h2>${cards(lang, related)}</section></main>` + footer(lang));
  }
  const file = path.join(root, lang === 'en' ? 'english/index.html' : 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const section = `<!-- articles:start -->\n<section class="section journal-home" id="articles" aria-labelledby="articles-title"><div class="journal-home-heading"><div><p class="section-label">LOFI JOURNAL</p><h2 id="articles-title">${t.teaser}</h2></div><a class="journal-text-link" href="${href(lang)}">${t.more} ↗</a></div><p class="journal-home-intro">${t.intro}</p>${cards(lang, articles.slice(0, 3))}</section>\n<!-- articles:end -->`;
  if (html.includes('<!-- articles:start -->')) html = html.replace(/<!-- articles:start -->[\s\S]*?<!-- articles:end -->/, section);
  else html = html.replace('</main>', section + '\n      </main>');
  if (!html.includes('href="/assets/articles.css"')) html = html.replace('</head>', '<link rel="stylesheet" href="/assets/articles.css">\n</head>');
  if (!html.includes('class="journal-nav-link"')) html = html.replace('<a class="lang-toggle"', `<a class="journal-nav-link" href="#articles">${t.nav}</a><a class="lang-toggle"`);
  fs.writeFileSync(file, html);
}
const sitemapPath = path.join(root, 'sitemap.xml');
// Contextual links make the library discoverable from established treatment pages.
for (const a of articles.filter(a => a.slug !== 'dentist-near-andaz-seoul-gangnam')) {
  for (const [i, guide] of a.guide.entries()) {
    if (!guide.endsWith('.html')) continue;
    const file = path.join(root, guide);
    const lang = i === 1 ? 'ko' : 'en';
    let html = fs.readFileSync(file, 'utf8');
    const related = `<!-- journal-link:start --><aside class="journal-guide-link"><h2>${lang === 'ko' ? '상담 전 읽어보세요' : 'Before your consultation'}</h2><p><a href="${href(lang, a.slug)}">${esc(a[lang].title)} →</a></p><p><a href="${href(lang)}">${ui[lang].all} →</a></p></aside><!-- journal-link:end -->`;
    if (html.includes('<!-- journal-link:start -->')) html = html.replace(/<!-- journal-link:start -->[\s\S]*?<!-- journal-link:end -->/, related);
    else html = html.replace('</main>', related + '\n</main>');
    if (!html.includes('href="/assets/articles.css"')) html = html.replace('</head>', '<link rel="stylesheet" href="/assets/articles.css">\n</head>');
    fs.writeFileSync(file, html);
  }
}
let sitemap = fs.readFileSync(sitemapPath, 'utf8').replace(/\s*<!-- articles:start -->[\s\S]*?<!-- articles:end -->/, '');
const entries = ['', ...articles.map(a => a.slug)].flatMap(slug => ['en', 'ko'].map(lang => `<url><loc>${origin + href(lang, slug)}</loc><lastmod>${updated}</lastmod><xhtml:link rel="alternate" hreflang="en" href="${origin + href('en', slug)}"/><xhtml:link rel="alternate" hreflang="ko" href="${origin + href('ko', slug)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${origin + href('en', slug)}"/></url>`));
sitemap = sitemap.replace('</urlset>', `  <!-- articles:start -->\n  ${entries.join('\n  ')}\n  <!-- articles:end -->\n</urlset>`);
fs.writeFileSync(sitemapPath, sitemap);
console.log(`Built ${articles.length * 2} articles, two indexes, homepage sections and sitemap entries.`);

