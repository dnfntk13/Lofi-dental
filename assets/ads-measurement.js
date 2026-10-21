/* Optional Google Ads measurement. Patient data stays outside the isolated frame. */
(function () {
  'use strict';
  if (window.lofiAds || location.protocol !== 'https:' ||
      !['lofiesthetic.com', 'www.lofiesthetic.com'].includes(location.hostname)) return;
  var consentKey = 'lofi_ads_consent_v1', clickKey = 'lofi_ads_click_v1';
  var version = '2026-10-21', maxAge = 90 * 86400000;
  var choice = '', frame, ready = false, pending = new Map(), sent = new Set();
  var memoryClick = null, panel, settings;
  function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function accepted() { return choice === 'accepted'; }
  function clickIds() {
    if (!accepted()) return {};
    var query = new URLSearchParams(location.search), ids = {};
    ['gclid', 'gbraid', 'wbraid'].forEach(function (key) {
      var value = query.get(key);
      if (value && /^[A-Za-z0-9_-]{20,256}$/.test(value)) ids[key] = value;
    });
    if (Object.keys(ids).length) {
      memoryClick = { at: Date.now(), ids: ids }; write(clickKey, memoryClick);
    }
    var saved = memoryClick || read(clickKey);
    if (!saved || !Number.isFinite(saved.at) || saved.at > Date.now() || Date.now() - saved.at > maxAge) {
      memoryClick = null; remove(clickKey); return {};
    }
    var clean = {};
    ['gclid', 'gbraid', 'wbraid'].forEach(function (key) {
      if (/^[A-Za-z0-9_-]{20,256}$/.test(saved.ids?.[key] || '')) clean[key] = saved.ids[key];
    });
    return clean;
  }
  function stop() {
    ready = false;
    if (frame) frame.remove();
    frame = null;
    pending.forEach(function (item) { clearTimeout(item.timer); item.resolve(false); });
    pending.clear();
  }
  function start() {
    if (!accepted() || frame) return;
    var query = new URLSearchParams(clickIds()).toString();
    frame = document.createElement('iframe');
    frame.id = 'lofi-ads-measurement';
    frame.title = 'Advertising measurement';
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.referrerPolicy = 'no-referrer';
    frame.src = '/ads-measurement.html' + (query ? '?' + query : '');
    frame.onload = function () {
      if (accepted() && frame) frame.contentWindow.postMessage({ type: 'lofi:measurement-init' }, '*');
    };
    document.body.appendChild(frame);
  }
  function alreadySent(key) {
    try { return sent.has(key) || sessionStorage.getItem('lofi_ads_sent_' + key) === '1'; }
    catch (_) { return sent.has(key); }
  }
  function flush() {
    if (!accepted() || !ready || !frame) return;
    pending.forEach(function (item, key) {
      if (item.dispatched) return;
      item.dispatched = true; sent.add(key);
      try { sessionStorage.setItem('lofi_ads_sent_' + key, '1'); } catch (_) {}
      // No patient ID, submission ID, URL, treatment, date, or contact fields.
      frame.contentWindow.postMessage({ type: item.type }, '*');
    });
  }
  function trackEvent(key, type) {
    if (!accepted() || typeof key !== 'string' || !key || alreadySent(key)) return Promise.resolve(false);
    if (pending.has(key)) return pending.get(key).promise;
    var resolve, promise = new Promise(function (done) { resolve = done; });
    var timer = setTimeout(function () { pending.delete(key); resolve(false); }, 2000);
    pending.set(key, { type: type, resolve: resolve, promise: promise, timer: timer, dispatched: false });
    start(); flush();
    return promise;
  }
  function trackCompleted(key) {
    if (typeof key !== 'string' || !key) return Promise.resolve(false);
    return trackEvent('booking:' + key, 'lofi:booking-completed');
  }
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || !accepted()) return;
    var link = event.target.closest?.('a');
    if (!link?.href) return;
    var url;
    try { url = new URL(link.href); } catch (_) { return; }
    if (url.protocol !== 'https:' || !['whatsapp.com', 'www.whatsapp.com'].includes(url.hostname) ||
        !/^\/channel\/[^/]+\/?$/.test(url.pathname)) return;
    // A channel visit is separate from booking; no address or contact data leaves this page.
    var completion = trackEvent('whatsapp-channel', 'lofi:whatsapp-channel-click');
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
        event.button === 0 && (!link.target || link.target === '_self') && !link.hasAttribute('download')) {
      event.preventDefault();
      completion.finally(function () { location.assign(link.href); });
    }
  });
  window.addEventListener('message', function (event) {
    if (!accepted() || !frame || event.source !== frame.contentWindow || event.origin !== 'null') return;
    if (event.data?.type === 'lofi:measurement-ready') { ready = true; flush(); }
    if (event.data?.type === 'lofi:measurement-failed') stop();
    if (event.data?.type === 'lofi:measurement-sent') {
      pending.forEach(function (item, key) {
        if (item.dispatched && item.type === event.data.eventType) { clearTimeout(item.timer); item.resolve(true); pending.delete(key); }
      });
    }
  });
  function choose(value) {
    choice = value;
    write(consentKey, { choice: value, version: version, recordedAt: new Date().toISOString() });
    if (!accepted()) { memoryClick = null; remove(clickKey); stop(); }
    else { clickIds(); start(); }
    if (panel) panel.hidden = true;
  }
  function init() {
    var saved = read(consentKey);
    choice = saved?.version === version ? saved.choice : '';
    if (!accepted()) remove(clickKey);
    var ko = document.documentElement.lang.startsWith('ko') || new URLSearchParams(location.search).get('lang') === 'ko';
    var style = document.createElement('style');
    style.textContent = '#lofi-ads-choice{position:fixed;bottom:18px;left:18px;z-index:10020;max-width:420px;width:calc(100vw - 36px);box-sizing:border-box;padding:20px;background:#fffdf9;color:#242132;border:1px solid #d8d0df;border-radius:12px;box-shadow:0 4px 24px #0002;font:13px/1.55 Arial,sans-serif}#lofi-ads-choice[hidden]{display:none}#lofi-ads-choice h2{font-size:16px;margin:0 0 8px}#lofi-ads-choice p{margin:8px 0}#lofi-ads-choice button,#lofi-ads-settings{font:inherit;cursor:pointer;border:1px solid #887796;border-radius:6px;background:#fff;color:#362346;padding:9px 12px}#lofi-ads-choice .actions{display:flex;gap:8px;flex-wrap:wrap}#lofi-ads-settings{display:block;margin:16px auto;font:12px Arial,sans-serif}';
    document.head.appendChild(style);
    panel = document.createElement('section'); panel.id = 'lofi-ads-choice';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', ko ? '광고 측정 선택' : 'Advertising measurement choice');
    var title = document.createElement('h2');
    title.textContent = ko ? '광고 효과 측정 (선택)' : 'Advertising measurement (optional)';
    var notice = document.createElement('p');
    notice.textContent = ko
      ? '동의하면 Google LLC(미국)에 광고 클릭 식별자, 접속 정보, 일반적인 예약 요청 접수 완료 및 WhatsApp 채널 클릭 신호를 전달합니다. 연락처·진료 내용·예약 일시는 전달하지 않으며 맞춤 광고는 사용하지 않습니다. 거절해도 예약과 진료에 영향이 없습니다.'
      : 'With your permission, Google LLC (United States) receives advertising click identifiers, connection data, generic booking-request completion and WhatsApp channel click signals. We do not send contact details, treatment information or appointment times, and do not enable personalised ads. Declining does not affect booking or care.';
    var retention = document.createElement('p');
    retention.textContent = ko
      ? '이 브라우저에 선택을 저장하며, 동의한 광고 클릭 식별자는 최대 90일 보관합니다. 페이지 하단의 광고 측정 설정에서 언제든 철회할 수 있습니다.'
      : 'This browser remembers your choice and keeps consented click identifiers for up to 90 days. Withdraw anytime using Advertising measurement settings at the bottom of the page.';
    var actions = document.createElement('div'); actions.className = 'actions';
    [['accepted', ko ? '측정 허용' : 'Allow measurement'], ['rejected', ko ? '허용하지 않음 / 철회' : 'Decline / withdraw']].forEach(function (option) {
      var button = document.createElement('button'); button.type = 'button'; button.textContent = option[1];
      button.onclick = function () { choose(option[0]); };
      actions.appendChild(button);
    });
    panel.append(title, notice, retention, actions);
    panel.hidden = choice === 'accepted' || choice === 'rejected';
    settings = document.createElement('button'); settings.id = 'lofi-ads-settings'; settings.type = 'button';
    settings.textContent = ko ? '광고 측정 설정' : 'Advertising measurement settings';
    settings.onclick = function () { panel.hidden = false; panel.querySelector('button').focus(); };
    document.body.append(settings, panel);
    if (accepted()) start();
  }
  window.addEventListener('storage', function (event) {
    if (event.key !== consentKey) return;
    var saved = read(consentKey);
    choice = saved?.version === version ? saved.choice : '';
    if (!accepted()) { memoryClick = null; remove(clickKey); stop(); } else start();
  });
  window.lofiAds = { trackCompleted: trackCompleted };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
