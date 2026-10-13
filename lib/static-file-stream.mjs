import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

export async function sendStaticFile(request, response, filePath, contentType, extraHeaders = {}) {
  const { size } = await stat(filePath);
  let start = 0, end = size - 1, status = 200;
  const headers = { 'Content-Type': contentType, 'Content-Length': size, ...extraHeaders };
  if (contentType === 'video/mp4') {
    headers['Accept-Ranges'] = 'bytes';
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range || ''));
    if (match) {
      if (!match[1] && match[2]) start = Math.max(0, size - Number(match[2]));
      else if (match[1]) start = Number(match[1]);
      if (match[1] && match[2]) end = Math.min(Number(match[2]), size - 1);
      if ((!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}`, ...extraHeaders });
        response.end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = end - start + 1;
    }
  }
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || !size) { response.end(); return; }
  await pipeline(createReadStream(filePath, { start, end }), response);
}
