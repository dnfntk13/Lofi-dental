(() => {
  if (!document.documentElement.classList.contains('ai-embedded')) return;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) parent.postMessage({ type: 'admin-ai-minimize' }, location.origin);
  });
})();
