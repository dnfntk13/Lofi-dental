import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(reject=false){
 let id=0;const timers=new Map(), button={style:{},focus(){}},video={currentTime:0,paused:true,pause(){this.paused=true},load(){},play(){this.paused=false;return reject?Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})):Promise.resolve()}};
 const window={setTimeout:f=>{timers.set(++id,f);return id},clearTimeout:i=>timers.delete(i),setInterval:()=>99,clearInterval(){}};
 vm.runInNewContext(fs.readFileSync('display/tv-player.js','utf8'),{window,Date});
 const player=window.createTvDisplayPlayer(video,[{src:'a.mp4'},{src:'b.mp4'}],button);
 return {player,video,button,timers};
}
test('TV starts a visible direct URL and advances using the same decoder',()=>{const s=setup();assert.equal(s.video.src,'a.mp4');assert.match(s.video.className,/is-active/);s.video.onended();assert.equal(s.video.src,'b.mp4');s.video.onended();assert.equal(s.video.src,'a.mp4');s.player.destroy()});
test('blocked autoplay shows an actionable remote-control play button',async()=>{const s=setup(true);await Promise.resolve();assert.equal(s.button.style.display,'block');assert.equal(s.timers.size,0);s.video.play=()=>Promise.resolve();s.button.onclick();s.video.onplaying();assert.equal(s.button.style.display,'none');s.player.destroy()});
test('decode failure advances instead of leaving the display stopped',()=>{const s=setup();s.video.onerror();assert.equal(s.video.paused,true);[...s.timers.values()][0]();assert.equal(s.video.src,'b.mp4');s.player.destroy()});
