import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseConversationEmail, pendingMailboxUids } from '../lib/imap-conversation-parser.mjs';

test('streams a large attachment while retaining conversation headers and text', async () => {
  async function* message() {
    yield 'From: Patient <patient@example.test>\r\nTo: Clinic <clinic@example.test>\r\nSubject: Appointment\r\nMessage-ID: <test@example.test>\r\nDate: Tue, 13 Oct 2026 09:00:00 +0900\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=parts\r\n\r\n--parts\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPlease confirm my appointment.\r\n--parts\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=large.bin\r\nContent-Transfer-Encoding: base64\r\n\r\n';
    const chunk = 'A'.repeat(76) + '\r\n';
    for (let i = 0; i < 300000; i++) yield chunk;
    yield '\r\n--parts--\r\n';
  }
  const mail = await parseConversationEmail(Readable.from(message()));
  assert.match(mail.text, /Please confirm/);
  assert.equal(mail.from.value[0].address, 'patient@example.test');
  assert.equal(mail.to.value[0].address, 'clinic@example.test');
  assert.equal(mail.messageId, '<test@example.test>');
  assert.equal(mail.subject, 'Appointment');
  assert.equal(mail.date.toISOString(), '2026-10-13T00:00:00.000Z');
  assert.equal(mail.attachments, undefined);
});

test('HTML-only emails still produce conversation text', async () => {
  const mail = await parseConversationEmail(Readable.from(['Content-Type: text/html; charset=utf-8\r\n\r\n<p>Appointment changed</p>']));
  assert.match(mail.text, /Appointment changed/);
});

test('already processed UIDs are excluded before downloading, scoped to mailbox', () => {
  assert.deepEqual(pendingMailboxUids('Sent', [1,2,3], {'Sent:1':true,'INBOX:2':true}), [2,3]);
});
