import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { addAdminAiToPage } from '../lib/admin-ai-page.mjs';

function setup() {
  let time = 0, id = 0;
  const timers = new Map(), items = [], standby = [];
  const schedule = (fn, delay, interval = 0) => { const key = ++id; timers.set(key, {fn, at:time + delay, interval}); return key; };
  const tick = (amount) => {
    const end = time + amount;
    for (;;) {
      const entry = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!entry) break;
      const [key, timer] = entry;
      time = timer.at; timers.delete(key);
      if (timer.interval) timers.set(key, {...timer, at:time + timer.interval});
      timer.fn();
    }
    time = end;
  };
  const videos = [0,1].map(() => ({
    src:'', currentTime:0, duration:20, paused:true, ended:false, error:null, className:'display-video', loads:0, plays:0,
    getAttribute(name) { return this[name]; },
    load() { this.loads++; this.error=null; this.currentTime=0; this.ended=false; },
    play() { this.plays++; this.paused=false; return Promise.resolve(); },
    pause() { this.paused=true; }
  }));
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../display/player.js',import.meta.url),'utf8'), {window});
  const player = window.createDisplayPlayer({videos, playlist:[{src:'a.mp4'},{src:'b.mp4'},{src:'c.mp4'}],
    now:()=>time, setTimeout:(fn,ms)=>schedule(fn,ms), clearTimeout:key=>timers.delete(key),
    setInterval:(fn,ms)=>schedule(fn,ms,ms), clearInterval:key=>timers.delete(key),
    onItem:i=>items.push(i), onStandby:v=>standby.push(v)
  });
  player.start();
  return {player,videos,tick,items,standby,timers};
}

test('preloads next video and keeps old frame until the next actually plays; wraps playlist', () => {
  const s=setup(), [a,b]=s.videos;
  a.onplaying(); s.tick(700);
  assert.equal(b.src,'b.mp4'); assert.equal(b.plays,0);
  a.onended();
  assert.match(a.className,/is-active/); assert.doesNotMatch(b.className,/is-active/);
  assert.equal(b.loads,1, 'reuse preloaded data');
  b.onplaying(); s.tick(700);
  assert.equal(a.src,'c.mp4'); assert.equal(a.paused,true);
  b.onended(); a.onplaying(); s.tick(700);
  a.onended(); b.onplaying();
  assert.deepEqual(s.items,[0,1,2,0]);
  s.player.destroy();
});
test('failed preloading does not interrupt current video and reloads when needed', () => {
  const s=setup(), [a,b]=s.videos;
  a.onplaying(); s.tick(700); b.error={code:3};
  assert.equal(b.onerror,null); assert.match(a.className,/is-active/);
  a.onended(); assert.equal(b.loads,2); b.onplaying();
  assert.deepEqual(s.items,[0,1]); s.player.destroy();
});
test('load timeout skips a broken clip, late callbacks cannot select it', () => {
  const s=setup(), [a]=s.videos, stale=a.onplaying;
  s.tick(15250); assert.equal(a.src,'b.mp4'); stale();
  assert.deepEqual(s.items,[]); a.onplaying(); assert.deepEqual(s.items,[1]);
  s.player.destroy();
});
test('all clips failing enters a bounded 30-second retry instead of a tight loop', () => {
  const s=setup(), [a]=s.videos;
  a.onerror(); s.tick(250); a.onerror(); s.tick(250); a.onerror();
  const loads=a.loads; s.tick(29999); assert.equal(a.loads,loads);
  assert.equal(s.standby.at(-1),true);
  s.tick(1); assert.equal(a.src,'a.mp4'); assert.ok(a.loads>loads);
  s.player.destroy();
});
test('rejected autoplay advances without unhandled rejections', async () => {
  const s=setup(), [a]=s.videos;
  a.play=()=>Promise.reject(new Error('blocked'));
  a.onerror(); s.tick(250); await Promise.resolve(); await Promise.resolve();
  s.tick(250); assert.equal(a.src,'c.mp4'); s.player.destroy();
});
test('stalled playback advances, and destroy cancels recovery work', () => {
  const s=setup(), [a,b]=s.videos;
  a.onplaying(); s.tick(15250); assert.equal(b.src,'b.mp4'); assert.equal(b.plays,1);
  s.player.destroy(); const plays=b.plays; s.tick(60000);
  assert.equal(b.plays,plays); assert.equal(s.timers.size,0);
});
test('authenticated signage stays free of admin chat while ordinary pages still get it', () => {
  const html=fs.readFileSync(new URL('../display/index.html',import.meta.url),'utf8');
  assert.equal(addAdminAiToPage(html,true),html);
  assert.match(addAdminAiToPage('<body>Clinic</body>',true),/ai-widget/);
});
