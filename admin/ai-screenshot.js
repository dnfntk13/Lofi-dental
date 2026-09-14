(() => {
  const el = id => document.getElementById(id);
  const form = el('screenshotForm');
  const reservationForm = el('screenshotReservation');
  const fields = ['name', 'date', 'time', 'phone', 'email', 'visitingFrom', 'concerns'];
  let images = [];
  let busy = false;
  let saved = false;
  const status = (message, error = false, target = 'screenshotStatus') => {
    el(target).textContent = message;
    el(target).className = `import-status${error ? ' error' : ''}`;
  };
  function invalidate() {
    el('screenshotDraft').hidden = true;
    el('screenshotConfirmed').checked = false;
    saved = false;
  }
  function setBusy(value) {
    busy = value;
    form.querySelectorAll('input,textarea,button').forEach(node => { node.disabled = value; });
    reservationForm.querySelectorAll('input,textarea,button').forEach(node => { node.disabled = value || saved; });
  }
  function previews() {
    el('screenshotPreviews').replaceChildren();
    images.forEach((item, index) => {
      const box = document.createElement('div');
      const img = document.createElement('img');
      img.src = item.url; img.alt = `대화 캡처 ${index + 1}`;
      img.style.cssText = 'display:block;width:100px;height:140px;object-fit:contain;background:#f5f7ff';
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = `${index + 1}번 사진 삭제`;
      remove.className = 'quick-btn';
      remove.addEventListener('click', () => { if (busy) return; images.splice(index, 1); invalidate(); previews(); });
      box.append(img, remove); el('screenshotPreviews').append(box);
    });
  }
  async function attach(files) {
    if (busy || !files.length) return;
    if (images.length + files.length > 4) { status('사진은 최대 4장입니다.', true); return; }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024)) {
      status('PNG, JPEG, WebP 사진을 장당 4MB 이하로 첨부해주세요.', true); return;
    }
    if ([...images, ...files].reduce((total, file) => total + file.size, 0) > 12 * 1024 * 1024) { status('전체 사진 용량은 12MB까지 가능합니다.', true); return; }
    setBusy(true);
    try {
      const added = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ url: reader.result, size: file.size });
        reader.onerror = () => reject(new Error('사진을 읽지 못했습니다. 다시 첨부해주세요.'));
        reader.readAsDataURL(file);
      })));
      images.push(...added); invalidate(); previews(); status(`${images.length}장 첨부됨. 사진 분석을 시작하세요.`);
    } catch (error) { status(error.message, true); }
    finally { setBusy(false); }
  }
  el('screenshotFiles').addEventListener('change', event => {
    const files = Array.from(event.target.files); event.target.value = ''; attach(files);
  });
  el('screenshotPanel').addEventListener('paste', event => {
    const files = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
    if (files.length) { event.preventDefault(); attach(files); }
  });
  el('screenshotNote').addEventListener('input', invalidate);
  reservationForm.addEventListener('input', event => {
    if (event.target.id !== 'screenshotConfirmed') el('screenshotConfirmed').checked = false;
  });
  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(75000) });
    const data = await response.json().catch(() => ({}));
    document.dispatchEvent(new Event('admin-ai-usage-refresh'));
    if (!response.ok || !data.ok) throw new Error(data.message || (response.status === 401 ? '관리자 로그인이 필요합니다. 새로고침 후 다시 로그인해주세요.' : '요청에 실패했습니다. 다시 시도해주세요.'));
    return data;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!images.length) { status('대화 사진을 먼저 첨부해주세요.', true); return; }
    invalidate(); setBusy(true); status('사진에서 대화와 예약 정보를 읽고 있습니다…');
    try {
      const { draft } = await post('/api/admin/ai-screenshot', { images: images.map(item => item.url), note: el('screenshotNote').value });
      reservationForm.reset();
      fields.forEach(key => { reservationForm.elements.namedItem(key).value = draft.reservation[key] || ''; });
      el('screenshotSummary').textContent = draft.summary;
      el('screenshotTranscript').textContent = draft.transcript || '읽을 수 있는 대화가 없습니다.';
      el('screenshotWarnings').replaceChildren(...draft.warnings.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
      status('', false, 'screenshotSaveStatus'); el('screenshotCalendar').hidden = true;
      el('screenshotDraft').hidden = false;
      status('분석 완료. 아래 정보를 확인해주세요. 아직 예약은 저장되지 않았습니다.');
    } catch (error) { status(error.name === 'TimeoutError' ? '분석 시간이 초과됐습니다. 다시 시도해주세요.' : error.message, true); }
    finally { setBusy(false); }
  });
  reservationForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || saved || !reservationForm.reportValidity()) return;
    const reservation = Object.fromEntries(fields.map(key => [key, reservationForm.elements.namedItem(key).value.trim()]));
    if (!reservation.name) { status('환자 이름을 입력해주세요.', true, 'screenshotSaveStatus'); return; }
    setBusy(true); status('예약 저장 중…', false, 'screenshotSaveStatus');
    try {
      const data = await post('/api/admin/ai-screenshot/reservation', { reservation, confirmed: el('screenshotConfirmed').checked });
      saved = true;
      status(data.duplicate ? '같은 이름·날짜·시간의 예약이 이미 있습니다. 중복으로 추가하지 않았습니다.' : '예약이 추가되었습니다.', false, 'screenshotSaveStatus');
      el('screenshotCalendar').hidden = false;
    } catch (error) { status(`${error.message} 저장 여부가 불확실하면 Calendar에서 확인 후 다시 시도해주세요.`, true, 'screenshotSaveStatus'); }
    finally { setBusy(false); }
  });
})();
