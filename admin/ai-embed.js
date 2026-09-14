(() => {
  if (!document.documentElement.classList.contains('ai-embedded')) return;
  const tabs = document.createElement('nav');
  tabs.className = 'embed-tabs';
  tabs.setAttribute('aria-label', 'AI 보기');
  tabs.innerHTML = '<button type="button" aria-pressed="true">채팅</button><button type="button" aria-pressed="false">작업·사진</button>';
  const [chat, details] = tabs.children;
  document.querySelector('.wrap').prepend(tabs);
  document.querySelector('.side').append(document.getElementById('screenshotPanel'));
  function showTools(value) {
    document.documentElement.classList.toggle('show-tools', value);
    chat.setAttribute('aria-pressed', String(!value));
    details.setAttribute('aria-pressed', String(value));
    if (value) details.textContent = '작업·사진';
  }
  chat.addEventListener('click', () => showTools(false));
  details.addEventListener('click', () => showTools(true));
  new MutationObserver(() => {
    if (document.querySelector('#suggestedActions .action-card')) details.textContent = '작업·사진 ●';
  }).observe(document.getElementById('suggestedActions'), { childList: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) parent.postMessage({ type: 'admin-ai-minimize' }, location.origin);
  });
  document.querySelectorAll('a[href]').forEach(link => {
    if (!link.target) link.target = '_top';
  });
})();
