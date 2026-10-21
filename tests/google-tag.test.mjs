import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import { addGoogleTagToPage, googleTagSnippet } from '../lib/google-tag.mjs';

const root=new URL('../',import.meta.url);
const htmlFiles=fs.readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.html')&&!/^(node_modules|output|\.git)[\\/]/.test(p));
test('literal snippet is present once inside each installed HTML head',()=>{
  let count=0;
  for(const p of htmlFiles){
    const html=fs.readFileSync(new URL(p.replaceAll('\\','/'),root),'utf8');
    if(!html.includes('G-S9ZX4LDDRR'))continue;
    if(p.replaceAll('\\','/')==='content/google-tag.html')continue;
    count++;
    const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
    assert.ok(head?.includes(googleTagSnippet),p);
    assert.equal(html.split(googleTagSnippet).length-1,1,p);
    assert.equal((html.match(/googletagmanager\.com\/gtag\/js\?id=/g)||[]).length,1,p);
    assert.doesNotMatch(html,/lofiAds|lofi-google-tag|lofi-ads-consent-client|ads-measurement\.js/);
  }
  assert.equal(count,38);
});
test('article generation preserves exact snippet without duplication',()=>{
  const html='<html><head><title>Article</title></head><body></body></html>';
  const tagged=addGoogleTagToPage(html);
  assert.ok(tagged.includes(googleTagSnippet));
  assert.equal(addGoogleTagToPage(tagged),tagged);
  assert.match(fs.readFileSync(new URL('tools/build-articles.mjs',root),'utf8'),/writeFileSync\(filename, addGoogleTagToPage\(html\)\)/);
});
test('server serves static head and does not inject a second tag',()=>{
  assert.doesNotMatch(fs.readFileSync(new URL('server.mjs',root),'utf8'),/addGoogleTagToPage/);
  assert.doesNotMatch(fs.readFileSync(new URL('reservation/concerns.html',root),'utf8'),/trackCompleted|measurementSubmissionKey/);
});
test('supplied script configures both IDs and uses the supplied conversion behavior',()=>{
  const handlers={},context={window:{},document:{addEventListener:(name,fn)=>handlers[name]=fn},Date};
  context.dataLayer=context.window.dataLayer=[];
  for(const [,script] of googleTagSnippet.matchAll(/<script>([\s\S]*?)<\/script>/g))runInNewContext(script,context);
  const commands=()=>Array.from(context.dataLayer,args=>Array.from(args));
  assert.deepEqual(commands().filter(a=>a[0]==='config').map(a=>a[1]),['G-S9ZX4LDDRR','AW-18223406681']);
  assert.equal(commands().filter(a=>a[0]==='event').length,0);
  handlers.submit({target:{closest:()=>null}});
  assert.equal(commands().filter(a=>a[0]==='event').length,0);
  handlers.submit({target:{closest:()=>({querySelector:()=>({value:' test@example.invalid '})})}});
  assert.equal(commands().find(a=>a[1]==='user_data')[2].email,'test@example.invalid');
  handlers.click({target:{closest:()=>({href:'https://whatsapp.com/channel/example'})}});
  assert.deepEqual(commands().filter(a=>a[0]==='event').map(a=>a[2].send_to),['AW-18223406681/vWfPCOr0maMdENm8zPFD','AW-18223406681/VlJ6CPr1kKQdENm8zPFD']);
});
