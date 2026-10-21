import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { addGoogleTagToPage, googleTagId, googleAdsId } from '../lib/google-tag.mjs';

const html = '<!doctype html><html><head><title>Lofi</title></head><body></body></html>';
const tagged = addGoogleTagToPage(html, '/english/index.html');
const script = tagged.match(/<script id="lofi-google-tag">([\s\S]*?)<\/script>/)[1];

test('anonymous public pages and bilingual articles get one tag in the initial head', () => {
  for (const page of ['/index.html','/english/index.html','/articles/index.html','/articles/ko/veneers-or-whitening.html','/dental-implants-seoul.html','/price-guide.html','/whatsapp/index.html','/instagram/index.html']) {
    const result = addGoogleTagToPage(html,page);
    assert.ok(result.indexOf('lofi-google-tag') < result.indexOf('<title>'));
    assert.equal(addGoogleTagToPage(result,page),result);
    assert.ok(result.includes(googleTagId));
    assert.ok(result.includes(googleAdsId));
    assert.ok(!result.includes('GTM-T6JDX3SJ'));
  }
});

test('patient, booking, unknown and staff views never receive the tag', () => {
  for (const page of ['/admin/index.html','/admin/calendar.html','/patient-reply.html','/play/index.html','/display/index.html','/concourse-app.html','/unknown.html']) {
    assert.equal(addGoogleTagToPage(html,page),html);
  }
  assert.equal(addGoogleTagToPage(html,'/index.html',true),html);
  for (const page of ['/reservation/index.html','/reservation/concerns.html','/reservation/received.html']) {
    const pageHtml = addGoogleTagToPage(html,page);
    assert.ok(pageHtml.includes('lofi-ads-consent-client'));
    assert.doesNotMatch(pageHtml, /id="lofi-google-tag"|googletagmanager/);
    assert.equal(addGoogleTagToPage(html,page,true),html);
  }
});

function browser(url) {
  const nodes = [];
  const window = { location:new URL(url) };
  const document = {
    head:{appendChild:node=>nodes.push(node)},
    createElement:()=>({}),
    getElementById:id=>nodes.find(node=>node.id===id),
  };
  return {window,document,nodes};
}

test('first visit loads once, with denied consent before config and no personal URL data', () => {
  const context = browser('https://lofiesthetic.com/?email=private@example.com#gclid=secret');
  runInNewContext(script,context);
  runInNewContext(script,context);
  assert.equal(context.nodes.length,1);
  assert.equal(context.nodes[0].src,`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`);
  const commands = context.window.dataLayer.map(args=>Array.from(args));
  assert.equal(commands[0][0],'consent');
  assert.ok(Object.values(commands[0][2]).every(value=>value==='denied'));
  const config = commands.find(args=>args[0]==='config')[2];
  assert.deepEqual(Array.from(commands.filter(args=>args[0]==='config'),args=>args[1]),[googleTagId,googleAdsId]);
  assert.equal(config.page_location,'https://lofiesthetic.com/');
  assert.equal(config.page_referrer,'');
  assert.equal(config.send_page_view,false);
  assert.doesNotMatch(JSON.stringify(commands),/private@example|gclid|secret/);
  assert.ok(!commands.some(args=>args[0]==='event'));
});

test('development and other origins do not load the production tag', () => {
  for (const url of ['http://localhost:5173/','http://lofiesthetic.com/','https://concourse.to/','https://lofiesthetic.com.example/']) {
    const context=browser(url);
    runInNewContext(script,context);
    assert.equal(context.nodes.length,0);
  }
});
