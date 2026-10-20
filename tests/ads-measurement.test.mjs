import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const client = readFileSync(new URL('../assets/ads-measurement.js', import.meta.url), 'utf8');
const child = readFileSync(new URL('../ads-measurement.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const consentKey = 'lofi_ads_consent_v1', clickKey = 'lofi_ads_click_v1';
function setup({consent, url='https://lofiesthetic.com/', blocked=false, oldClick}={}) {
  const values = new Map(), sessions = new Map(), events = {}, nodes = [], messages = [], timers = new Map();
  if (consent) values.set(consentKey, JSON.stringify({choice:consent,version:'2026-10-20'}));
  if (oldClick) values.set(clickKey, JSON.stringify(oldClick));
  const storage = map => ({
    getItem:k=>{if(blocked)throw Error();return map.get(k)||null;},
    setItem:(k,v)=>{if(blocked)throw Error();map.set(k,v);},
    removeItem:k=>{if(blocked)throw Error();map.delete(k);},
  });
  function element(tag) {
    const node = {tag,children:[],attrs:{},hidden:false,
      append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},
      setAttribute(k,v){this.attrs[k]=v;},remove(){this.removed=true;},
      querySelector(){return {focus(){}};},
      contentWindow:{postMessage(data,target){messages.push({data,target});}},
    };
    nodes.push(node);return node;
  }
  const window = {addEventListener:(name,handler)=>{events[name]=handler;}};
  const document = {head:element('head'),body:element('body'),readyState:'complete',
    documentElement:{lang:'en'},createElement:element};
  const context = {window,document,location:new URL(url),localStorage:storage(values),sessionStorage:storage(sessions),
    URLSearchParams,Map,Set,Date,Promise,setTimeout:(fn)=>{const key={};timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key)};
  runInNewContext(client,context);
  const frame=()=>nodes.findLast(n=>n.tag==='iframe'&&!n.removed);
  const choose=label=>nodes.find(n=>n.tag==='button'&&n.textContent===label).onclick();
  const message=(type,source=frame()?.contentWindow,origin='null')=>events.message({source,origin,data:{type}});
  return {window,context,nodes,values,sessions,messages,timers,events,frame,choose,message};
}
test('no frame or click storage before permission, or after decline',()=>{
  const s=setup({url:'https://lofiesthetic.com/?gclid=abcdefghijklmnopqrstuvw&email=secret'});
  assert.equal(s.frame(),undefined);assert.equal(s.values.has(clickKey),false);
  s.choose('Decline / withdraw');assert.equal(s.frame(),undefined);
});
test('opt-in persists only allowlisted click IDs in an opaque, no-referrer frame',()=>{
  const s=setup({url:'https://lofiesthetic.com/?gclid=abcdefghijklmnopqrstuvw&email=secret&concerns=pain'});
  s.choose('Allow measurement');
  assert.equal(s.frame().attrs.sandbox,'allow-scripts');
  assert.equal(s.frame().referrerPolicy,'no-referrer');
  assert.equal(s.frame().src,'/ads-measurement.html?gclid=abcdefghijklmnopqrstuvw');
  assert.doesNotMatch(JSON.stringify([...s.values]),/secret|pain/);
});
test('completion waits for ready, ignores forged messages, sends once without IDs',async()=>{
  const s=setup({consent:'accepted'});
  const promise=s.window.lofiAds.trackCompleted('private-local-id');
  s.message('lofi:measurement-ready',{},'null');assert.equal(s.messages.length,0);
  s.message('lofi:measurement-ready',s.frame().contentWindow,'https://evil.example');assert.equal(s.messages.length,0);
  s.message('lofi:measurement-ready');
  assert.deepEqual(JSON.parse(JSON.stringify(s.messages)),[{data:{type:'lofi:booking-completed'},target:'*'}]);
  assert.equal(await s.window.lofiAds.trackCompleted('private-local-id'),false);
  s.message('lofi:measurement-sent');assert.equal(await promise,true);
  assert.doesNotMatch(JSON.stringify(s.messages),/private-local-id/);
});
test('withdrawal removes frame, identifiers and queued completion',async()=>{
  const s=setup({consent:'accepted'});
  const promise=s.window.lofiAds.trackCompleted('key');
  s.choose('Decline / withdraw');
  assert.equal(await promise,false);assert.equal(s.frame(),undefined);assert.equal(s.values.has(clickKey),false);
});
test('ad blocker timeout resolves, never blocks booking forever',async()=>{
  const s=setup({consent:'accepted'});
  const promise=s.window.lofiAds.trackCompleted('key');
  [...s.timers.values()].forEach(fn=>fn());
  assert.equal(await promise,false);
  s.message('lofi:measurement-ready');assert.equal(s.messages.length,0);
});
test('expired attribution is removed and blocked storage still respects session consent',()=>{
  const s=setup({consent:'accepted',oldClick:{at:Date.now()-91*86400000,ids:{gclid:'abcdefghijklmnopqrstuvw'}}});
  assert.equal(s.frame().src,'/ads-measurement.html');assert.equal(s.values.has(clickKey),false);
  const blocked=setup({blocked:true});assert.equal(blocked.frame(),undefined);
  blocked.choose('Allow measurement');assert.ok(blocked.frame());
  blocked.choose('Decline / withdraw');assert.equal(blocked.frame(),undefined);
});
test('development hosts cannot initialize production measurement',()=>{
  for(const url of ['http://localhost:5173/','https://concourse.to/','https://lofiesthetic.com.example/']){
    assert.equal(setup({consent:'accepted',url}).window.lofiAds,undefined);
  }
});
test('child validates parent, loads after consent and emits generic event once',()=>{
  const scripts=[],messages=[],events={};
  const parent={postMessage:(data,origin)=>messages.push({data,origin})};
  const window={parent,addEventListener:(key,fn)=>events[key]=fn};
  const document={head:{appendChild:n=>scripts.push(n)},createElement:()=>({})};
  runInNewContext(child,{window,document,Date});
  const send=(type,origin='https://lofiesthetic.com',source=parent)=>events.message({source,origin,data:{type}});
  send('lofi:measurement-init','https://evil.example');assert.equal(scripts.length,0);
  send('lofi:booking-completed');assert.equal(window.dataLayer.length,0);
  send('lofi:measurement-init');assert.equal(scripts.length,1);
  const commands=window.dataLayer.map(args=>Array.from(args));
  assert.equal(commands[0][2].ad_user_data,'denied');assert.equal(commands[1][2].ad_user_data,'granted');
  assert.equal(commands[1][2].ad_storage,'denied');
  scripts[0].onload();
  send('lofi:booking-completed');send('lofi:booking-completed');
  const conversions=window.dataLayer.filter(args=>args[0]==='event');
  assert.equal(conversions.length,1);
  assert.equal(conversions[0][2].send_to,'AW-18223406681/vWfPCOr0maMdENm8zPFD');
  assert.doesNotMatch(JSON.stringify(conversions),/email|phone|concerns|treatment|transaction_id/);
});
test('completion wired after accepted POST; receipt page has no replay hook',()=>{
  const form=readFileSync(new URL('../reservation/concerns.html',import.meta.url),'utf8');
  const receipt=readFileSync(new URL('../reservation/received.html',import.meta.url),'utf8');
  assert.equal((form.match(/trackCompleted\(/g)||[]).length,1);
  assert.ok(form.indexOf('trackCompleted(')>form.indexOf('if (!response.ok)'));
  assert.ok(form.indexOf('trackCompleted(')>form.indexOf('submitting = false;',form.indexOf('if (!response.ok)')));
  assert.doesNotMatch(receipt,/trackCompleted/);
});
