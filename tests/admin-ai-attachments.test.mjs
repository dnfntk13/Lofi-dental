import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAdminAttachments } from '../lib/admin-ai-attachments.mjs';
const attachment = (name,text,type='text/plain') => ({name,data:`data:${type};base64,${Buffer.from(text).toString('base64')}`});
test('text files become bounded untrusted model context', async()=>{
  const parts=await prepareAdminAttachments([attachment('notes.txt','예약 메모')]);
  assert.equal(parts[0].type,'text'); assert.ok(parts[0].text.includes('예약 메모'));
});
test('PDF extraction and unreadable PDF handling',async()=>{
  const file=attachment('a.pdf','%PDF-test','application/pdf');
  assert.ok((await prepareAdminAttachments([file],async()=> 'PDF text'))[0].text.includes('PDF text'));
  await assert.rejects(prepareAdminAttachments([file],async()=>''));
});
test('unsupported, forged and oversized files are rejected',async()=>{
  await assert.rejects(prepareAdminAttachments([attachment('a.exe','code')]));
  await assert.rejects(prepareAdminAttachments([attachment('a.png','fake','image/png')]));
  await assert.rejects(prepareAdminAttachments(Array(5).fill(attachment('a.txt','x'))));
  await assert.rejects(prepareAdminAttachments([attachment('a.txt','x'.repeat(40001))]));
});
