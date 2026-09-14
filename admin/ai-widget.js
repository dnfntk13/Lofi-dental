(() => {
  if (window.self !== window.top || document.getElementById('admin-ai-widget')) return;
  const host = document.createElement('div');
  host.id = 'admin-ai-widget';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { position: fixed; right: max(18px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom)); z-index: 10000; font: 14px 'Segoe UI', sans-serif; color: #1f2d66; }
      * { box-sizing: border-box; }
      button, a { font: inherit; }
      button { cursor: pointer; }
      button:focus-visible, a:focus-visible { outline: 3px solid #aa8fd0; outline-offset: 3px; }
      .launcher { border: 0; border-radius: 999px; padding: 15px 22px; background: #5b3d8f; color: white; font-weight: 700; box-shadow: 0 6px 24px #31204b40; }
      .panel { width: min(420px, calc(100vw - 36px)); height: min(640px, calc(100dvh - 100px)); margin-bottom: 12px; display: flex; flex-direction: column; border: 1px solid #ded5ed; border-radius: 20px; background: white; box-shadow: 0 16px 60px #25173e30; overflow: hidden; }
      .panel[hidden] { display: none; }
      header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #5b3d8f; color: white; }
      strong { flex: 1; font-size: 16px; }
      .expand { border: 0; background: transparent; color: white; text-decoration: underline; font-size: 12px; }
      :host([expanded]) { inset: 0; }
      :host([expanded]) .panel { width: 100%; height: 100dvh; margin: 0; border-radius: 0; }
      :host([expanded]) .foot { display: none; }
      .minimize { border: 0; background: transparent; color: white; font-size: 24px; width: 32px; height: 32px; }
      iframe { display: block; width: 100%; flex: 1; min-height: 0; border: 0; background: #faf8ff; }
      .foot { display: flex; justify-content: flex-end; }
      @media (max-width: 520px) { :host { right: max(10px, env(safe-area-inset-right)); bottom: max(10px, env(safe-area-inset-bottom)); } .panel { width: calc(100vw - 20px); height: min(640px, calc(100dvh - 88px)); } }
    </style>
    <section class="panel" id="chat-panel" aria-label="Admin AI 채팅" hidden>
      <header><strong>Admin AI</strong><button class="expand" type="button" aria-pressed="false">전체 화면 ↗</button><button class="minimize" type="button" aria-label="채팅 최소화">−</button></header>
    </section>
    <div class="foot"><button class="launcher" type="button" aria-expanded="false" aria-controls="chat-panel">✦ Admin AI</button></div>`;
  const panel = root.querySelector('.panel');
  const launcher = root.querySelector('.launcher');
  const expand = root.querySelector('.expand');
  function setExpanded(expanded) {
    host.toggleAttribute('expanded', expanded);
    expand.setAttribute('aria-pressed', String(expanded));
    expand.textContent = expanded ? '작게 보기 ↙' : '전체 화면 ↗';
  }
  function escapeChat() {
    if (host.hasAttribute('expanded')) setExpanded(false);
    else setOpen(false);
  }
  let frame;
  function setOpen(open, focus = true) {
    if (open && !frame) {
      frame = document.createElement('iframe');
      frame.title = 'Admin AI 채팅 및 관리 도구';
      frame.src = '/admin/ai?embed=1';
      panel.append(frame);
    }
    panel.hidden = !open;
    if (!open) setExpanded(false);
    launcher.setAttribute('aria-expanded', String(open));
    launcher.textContent = open ? '채팅 접기' : '✦ Admin AI';
    try { sessionStorage.setItem('admin-ai-open', String(open)); } catch {}
    if (focus) (open ? root.querySelector('.minimize') : launcher).focus();
  }
  launcher.addEventListener('click', () => setOpen(panel.hidden));
  expand.addEventListener('click', () => setExpanded(!host.hasAttribute('expanded')));
  root.querySelector('.minimize').addEventListener('click', () => setOpen(false));
  root.addEventListener('keydown', event => { if (event.key === 'Escape') escapeChat(); });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === frame?.contentWindow && event.data?.type === 'admin-ai-minimize') escapeChat();
  });
  document.body.append(host);
  let open = true;
  try { open = sessionStorage.getItem('admin-ai-open') !== 'false'; } catch {}
  setOpen(open, false);
})();
