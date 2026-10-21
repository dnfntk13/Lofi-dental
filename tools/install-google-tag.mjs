import fs from 'node:fs';
import { addGoogleTagToPage } from '../lib/google-tag.mjs';
const publicPages = [
  'index.html','english.html','english/index.html','english-dentist-seoul.html',
  'teeth-whitening-seoul.html','smile-makeover-seoul.html','dental-implants-seoul.html',
  'full-mouth-restoration-seoul.html','lofi-lab.html','lofi-lab-en.html','before-after.html',
  'before-after-en.html','meetdrkim.html','dr-kim-story.html','로우파이 이야기.html',
  'contact-options.html','price-guide.html','whatsapp/index.html','instagram/index.html',
  'reservation/index.html','reservation/concerns.html','reservation/received.html',
  ...fs.readdirSync(new URL('../articles/', import.meta.url),{recursive:true})
    .filter(p=>p.endsWith('.html')).map(p=>'articles/'+p.replaceAll('\\','/'))
];
for (const page of publicPages) {
  const file = new URL('../'+page, import.meta.url);
  fs.writeFileSync(file, addGoogleTagToPage(fs.readFileSync(file,'utf8')));
}
console.log(`Installed the unchanged supplied snippet in ${publicPages.length} HTML files.`);
