export function addAdminAiToPage(html, authorized, pathname = '') {
  if (!authorized || !/^\/admin(?:\/|$)/.test(pathname) || !/<\/body>/i.test(html)) return html;
  // Dedicated signage screens must stay clear even when staff are signed in.
  if (/<body\b[^>]*\bdata-display=["'](?:logo|video)["']/i.test(html)) return html;
  // Only admin pages use the management assistant, including for signed-in staff.
  const page = html.replace(/<script\b[^>]*src=["']\/assets\/consult-chat\.js["'][^>]*>\s*<\/script>/gi, '');
  if (page.includes('src="/admin/ai-widget.js"')) return page;
  return page.replace(/<\/body>/i, '<script src="/admin/ai-widget.js" defer></script></body>');
}
