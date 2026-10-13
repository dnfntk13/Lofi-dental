import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sendStaticFile } from '../lib/static-file-stream.mjs';

test('streams full media, HEAD and byte ranges with correct headers', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lofi-stream-'));
  const file = path.join(dir, 'sample.mp4');
  await writeFile(file, '0123456789');
  const server = createServer((req, res) => { sendStaticFile(req, res, file, 'video/mp4').catch(() => res.destroy()); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    let r = await fetch(url);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '0123456789');
    r = await fetch(url, {method:'HEAD'});
    assert.equal(r.headers.get('content-length'), '10');
    assert.equal(await r.text(), '');
    r = await fetch(url, {headers:{Range:'bytes=2-5'}});
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await r.text(), '2345');
    r = await fetch(url, {headers:{Range:'bytes=-3'}});
    assert.equal(await r.text(), '789');
    r = await fetch(url, {headers:{Range:'bytes=10-'}});
    assert.equal(r.status, 416);
    assert.equal(r.headers.get('content-range'), 'bytes */10');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, {recursive:true, force:true});
  }
});
