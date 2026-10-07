import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {appendSentCopy,sentMailboxPaths} from '../lib/sent-mail-copy.mjs';
class FakeImap extends EventEmitter {
 constructor(){super();this.saved=false;this.appended=0;}
 connect(){queueMicrotask(()=>this.emit('ready'));}
 end(){this.ended=true;}
 getBoxes(cb){cb(null,{'Mailbox':{delimiter:'/',children:{Sent:{attribs:['\\Sent']}}}});}
 openBox(path,write,cb){this.path=path;cb(null,{});}
 search(criteria,cb){cb(null,this.saved?[12]:[]);}
 append(raw,opts,cb){this.appended++;this.saved=true;cb(null);}
}
test('discover localized special-use folder and verify append; retry deduplicates',async()=>{
 const imap=new FakeImap();let result=await appendSentCopy(imap,Buffer.from('mail'),'<id@test>',[]);
 assert.equal(result.mailbox,'Mailbox/Sent');assert.equal(result.uid,12);assert.equal(imap.appended,1);
 await appendSentCopy(imap,Buffer.from('mail'),'<id@test>',[]);assert.equal(imap.appended,1);assert.equal(imap.ended,true);
});
test('failed append is reported and connection closed',async()=>{
 const imap=new FakeImap();imap.append=(r,o,cb)=>cb(Error('network'));
 await assert.rejects(appendSentCopy(imap,Buffer.from('mail'),'<id@test>',[]));assert.equal(imap.ended,true);
});
