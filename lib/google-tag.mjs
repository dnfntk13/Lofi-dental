import { readFileSync } from 'node:fs';

// Build-time only: preserve the user-supplied snippet without rewriting its contents.
export const googleTagSnippet = readFileSync(new URL('../content/google-tag.html', import.meta.url), 'utf8');
export function addGoogleTagToPage(html) {
  if (html.includes(googleTagSnippet)) return html;
  if (!/<head\b[^>]*>/i.test(html)) throw new Error('HTML head is required');
  return html.replace(/<head\b[^>]*>/i, match => match + '\n' + googleTagSnippet + '\n');
}
