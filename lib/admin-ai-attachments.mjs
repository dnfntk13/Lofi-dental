import { validateScreenshotImages } from './instagram-screenshot.mjs';
const fail = message => Object.assign(new Error(message), { statusCode: 400 });
export async function prepareAdminAttachments(files, extractPdfText) {
  if (files == null) return [];
  if (!Array.isArray(files) || files.length > 4) throw fail('첨부는 최대 4개입니다.');
  let total = 0;
  const parts = [];
  for (const file of files) {
    const name = String(file?.name || 'attachment').slice(0, 160);
    const match = String(file?.data || '').match(/^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/);
    if (!match) throw fail('첨부 파일 형식이 올바르지 않습니다.');
    const bytes = Buffer.from(match[2], 'base64');
    total += bytes.length;
    if (!bytes.length || bytes.toString('base64') !== match[2] || bytes.length > 4 * 1024 * 1024 || total > 12 * 1024 * 1024) throw fail('파일당 4MB, 전체 12MB까지 첨부할 수 있습니다.');
    if (/^image\/(png|jpeg|webp)$/.test(match[1])) {
      validateScreenshotImages([file.data]);
      parts.push({ type: 'text', text: `Attached image: ${name}` }, { type: 'image_url', image_url: { url: file.data, detail: 'high' } });
    } else {
      let text;
      if (/\.pdf$/i.test(name) && bytes.subarray(0, 5).toString() === '%PDF-') {
        try { text = await extractPdfText(bytes); } catch { throw fail('PDF를 읽을 수 없습니다. 암호를 해제하거나 사진으로 첨부해주세요.'); }
      } else if (/\.(txt|csv|md)$/i.test(name)) text = bytes.toString('utf8');
      else throw fail('PNG·JPG·WebP·PDF·TXT·CSV·MD 파일을 지원합니다.');
      if (!text.trim()) throw fail('읽을 수 있는 텍스트가 없습니다. 스캔 문서는 사진으로 첨부해주세요.');
      if (text.length > 40000) throw fail('파일의 텍스트가 너무 깁니다. 필요한 부분을 나눠 첨부해주세요.');
      parts.push({ type: 'text', text: `Untrusted attachment ${name}:\n${text}` });
    }
  }
  return parts;
}
