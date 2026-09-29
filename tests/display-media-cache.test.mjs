import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup() {
  const requests = [], timers = new Map(), revoked = [], results = [];
  const window = {};
  let id = 0;
  vm.runInNewContext(fs.readFileSync(new URL('../display/media-cache.js', import.meta.url), 'utf8'), {window});
  const cache = window.cacheDisplayMedia([{src:'a.mp4'}, {src:'b.mp4'}], value => results.push(value), {
    makeRequest() {
      const request = {open(method, src) {this.src = src;}, send() {}, abort() {this.aborted = true;}};
      requests.push(request); return request;
    },
    urls: {createObjectURL: blob => 'blob:' + blob.name, revokeObjectURL: url => revoked.push(url)},
    setTimeout: fn => {timers.set(++id, fn); return id;}, clearTimeout: key => timers.delete(key)
  });
  function complete(request, name, status=200, type='video/mp4') {
    request.status = status; request.response = {size:100, type, name}; request.onload();
  }
  return {cache, requests, timers, revoked, results, complete};
}

test('starts playback only after every full clip is downloaded; URLs are reusable without network', () => {
  const s = setup();
  assert.equal(s.requests.length, 1);
  s.complete(s.requests[0], 'a');
  assert.equal(s.results.length, 0);
  assert.equal(s.requests[1].src, 'b.mp4');
  s.complete(s.requests[1], 'b');
  assert.equal(JSON.stringify(s.results), '[[{"src":"blob:a","fallbackSrc":"a.mp4"},{"src":"blob:b","fallbackSrc":"b.mp4"}]]');
  s.cache.destroy(); assert.deepEqual(s.revoked, ['blob:a','blob:b']);
});

test('failed clip falls back to its URL instead of blocking all playback', () => {
  const s = setup();
  s.complete(s.requests[0], 'a');
  s.complete(s.requests[1], 'error', 200, 'text/html');
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0][1].src, 'b.mp4');
  assert.equal(s.timers.size, 0);
  s.cache.destroy();
});

test('deadline aborts a stalled download and delivers playable original URLs once', () => {
  const s = setup(), late = s.requests[0].onload;
  [...s.timers.values()][0]();
  assert.equal(s.requests[0].aborted, true);
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0][0].src, 'a.mp4');
  late();
  assert.equal(s.results.length, 1);
  s.cache.destroy();
});

test('destroy aborts downloading and late events cannot start playback', () => {
  const s = setup(), late = s.requests[0].onerror;
  s.cache.destroy(); late();
  assert.equal(s.requests[0].aborted, true);
  assert.equal(s.timers.size, 0); assert.equal(s.results.length, 0);
});
