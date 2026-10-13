import { MailParser } from 'mailparser';

// Conversation sync only stores text and headers, never attachment contents.
export function parseConversationEmail(source) {
  return new Promise((resolve, reject) => {
    const parser = new MailParser({ skipTextToHtml: true, skipImageLinks: true });
    const mail = {};
    parser.on('headers', headers => {
      mail.headers = headers;
      for (const key of ['from', 'to', 'cc', 'bcc', 'subject', 'date']) mail[key] = headers.get(key);
      mail.messageId = headers.get('message-id');
    });
    parser.on('data', part => {
      if (part.type === 'attachment') {
        part.content.once('error', reject);
        part.content.once('end', () => part.release());
        part.content.resume();
      } else if (part.type === 'text') {
        mail.text = part.text || '';
      }
    });
    source.once('error', error => parser.destroy(error));
    parser.once('error', reject);
    parser.once('end', () => resolve(mail));
    source.pipe(parser);
  });
}

export function pendingMailboxUids(mailbox, uids, processed) {
  return uids.filter(uid => !processed[`${mailbox}:${uid}`]);
}
