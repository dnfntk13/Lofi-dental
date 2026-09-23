export function addAdminAiToPage(html, authorized) {
  if (!authorized || !/<\/body>/i.test(html)) return html;
  // The clinic's logo-only screen must stay clear even when staff are signed in.
  if (/<body\b[^>]*\bdata-display=["']logo["']/i.test(html)) return html;
  // Staff use the management assistant; visitors keep the consultation assistant.
  const page = html.replace(/<script\b[^>]*src=["']\/assets\/consult-chat\.js["'][^>]*>\s*<\/script>/gi, '');
  if (page.includes('src="/admin/ai-widget.js"')) return page;
  return page.replace(/<\/body>/i, '<script src="/admin/ai-widget.js" defer></script></body>');
}
