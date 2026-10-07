// IMAP APPEND saves a local mailbox copy; it never sends an email.
export function sentMailboxPaths(boxes, prefix = '') {
  const result = [];
  for (const [name, box] of Object.entries(boxes || {})) {
    const path = prefix + name;
    if ((box.attribs || []).some(a => a.toLowerCase() === '\\sent')) result.push(path);
    result.push(...sentMailboxPaths(box.children, path + (box.delimiter || '/')));
  }
  return result;
}
export async function appendSentCopy(imap, raw, messageId, candidates) {
  const call = (method, ...args) => new Promise((resolve,reject) => imap[method](...args,(err,value)=>err?reject(err):resolve(value)));
  await new Promise((resolve,reject)=>{
    imap.once('ready',resolve); imap.once('error',reject); imap.connect();
  });
  try {
    const boxes = await call('getBoxes');
    const paths = [...new Set([...sentMailboxPaths(boxes), ...candidates])];
    let selected;
    for (const path of paths) {
      try { await call('openBox',path,false); selected=path; break; } catch {}
    }
    if (!selected) throw new Error('No accessible Sent mailbox');
    const criteria = [['HEADER','Message-ID',messageId]];
    let matches = await call('search',criteria);
    if (!matches.length) {
      await call('append',raw,{mailbox:selected,flags:['\\Seen']});
      matches = await call('search',criteria);
    }
    if (!matches.length) throw new Error('Sent copy verification failed');
    return {mailbox:selected, uid:matches[0]};
  } finally { imap.end(); }
}
