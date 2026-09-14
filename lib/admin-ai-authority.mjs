import { randomBytes } from 'node:crypto';

const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const recordOperations = ['createReservation', 'updateReservation', 'deleteReservation', 'updatePatientName', 'deletePatient', 'sendThreadReply', 'deleteThreadMessage', 'markThreadRead'];
export const websiteOperations = ['readWebsiteFile', 'editWebsiteFile', 'deployWebsite', 'getDeploymentStatus'];
export const allAdminOperations = [...recordOperations, ...websiteOperations];

export function validateWebsitePath(value) {
  const name = String(value || '');
  if (!name || name.length > 200 || name.includes('\\') || name.includes('%') || name.startsWith('/') || name.split('/').some(part => !part || part.startsWith('.')) || !/\.(html|css|js|mjs)$/.test(name)) {
    throw error('편집 가능한 사이트 소스 파일 경로를 지정해주세요. 비밀 설정·숨김 파일은 접근할 수 없습니다.');
  }
  if (/^(node_modules|output|tests|tools)\//.test(name)) throw error('사이트 실행 소스 파일만 관리할 수 있습니다.');
  return name;
}

export function replaceExactText(content, before, after) {
  if (typeof before !== 'string' || !before || typeof after !== 'string' || before.length > 12000 || after.length > 12000) throw error('변경 전·후 코드를 각각 12,000자 이내로 지정해주세요.');
  const at = content.indexOf(before);
  if (at < 0 || content.indexOf(before, at + before.length) >= 0) throw error('변경할 부분이 없거나 여러 곳에 있습니다. 파일을 다시 읽고 정확한 부분을 지정해주세요.', 409);
  if (before === after) throw error('변경 전·후 내용이 같습니다.');
  return content.slice(0, at) + after + content.slice(at + before.length);
}

export function createAdminAuthority({ env = process.env, fetchImpl = fetch, executeRecord, now = Date.now } = {}) {
  const repo = 'dnfntk13/Lofi-dental';
  const branch = 'main';
  const githubToken = env.ADMIN_AI_GITHUB_TOKEN || '';
  const renderToken = env.RENDER_API_KEY || '';
  const service = env.RENDER_SERVICE_ID || 'srv-d8l6hspkh4rs73fqrtqg';
  const pending = new Map();
  const githubBase = `https://api.github.com/repos/${repo}`;
  const renderBase = `https://api.render.com/v1/services/${encodeURIComponent(service)}`;
  const capabilities = () => ({
    operations: allAdminOperations.map(operation => ({ operation, available: operation === 'editWebsiteFile' ? Boolean(githubToken) : ['deployWebsite', 'getDeploymentStatus'].includes(operation) ? Boolean(renderToken) : true })),
    repository: repo, branch,
    confirmations: 'All writes require a staff-reviewed, single-use action preview. Website edits commit to main and may trigger configured auto-deployment. Deployment requires an exact commit.',
    missingConfiguration: [...(!githubToken ? ['ADMIN_AI_GITHUB_TOKEN'] : []), ...(!renderToken ? ['RENDER_API_KEY'] : [])],
  });
  async function api(url, token, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Lofi-Admin-AI', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    } catch { throw error('외부 서비스 요청 결과를 확인할 수 없습니다. 작업 이력을 확인한 후 다시 시도해주세요.', 502); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw error(`외부 서비스 요청 실패 (${response.status}). 연결 권한과 최신 상태를 확인해주세요.`, response.status === 409 ? 409 : 502);
    return data;
  }
  async function readFile(name) {
    const path = validateWebsitePath(name);
    const file = await api(`${githubBase}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${branch}`, githubToken);
    if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 500000 || typeof file.content !== 'string' || !/^[a-f0-9]{40}$/.test(file.sha || '')) throw error('이 파일 형식이나 크기는 지원하지 않습니다.');
    return { path, sha: file.sha, content: Buffer.from(file.content, 'base64').toString('utf8') };
  }
  function check(operation) {
    const capability = capabilities().operations.find(item => item.operation === operation);
    if (!capability) throw error('허용되지 않은 관리 작업입니다.');
    if (!capability.available) throw error('이 작업에 필요한 서버 연결이 설정되지 않았습니다. 관리자 권한 패널을 확인해주세요.', 503);
  }
  async function prepare(operation, input = {}) {
    check(operation);
    for (const [key, entry] of pending) if (entry.expiresAt <= now()) pending.delete(key);
    if (pending.size >= 100) throw error('대기 중인 작업이 많습니다. 잠시 후 다시 시도해주세요.', 429);
    let payload = JSON.parse(JSON.stringify(input));
    let preview;
    if (operation === 'readWebsiteFile') {
      const file = await readFile(payload.path);
      const start = Math.max(1, Math.floor(Number(payload.startLine) || 1));
      const lines = file.content.split('\n');
      const text = lines.slice(start - 1, start + 119).map((line, i) => `${start + i}: ${line}`).join('\n').slice(0, 18000);
      return { ok: true, readOnly: true, operation, result: { path: file.path, sha: file.sha, startLine: start, totalLines: lines.length, content: text } };
    }
    if (operation === 'getDeploymentStatus') {
      if (!/^dep-[a-zA-Z0-9]+$/.test(payload.id || '')) throw error('정확한 배포 ID가 필요합니다.');
      const data = await api(`${renderBase}/deploys/${payload.id}`, renderToken);
      return { ok: true, readOnly: true, operation, result: { id: data.id, status: data.status, commitId: data.commit?.id } };
    }
    if (operation === 'editWebsiteFile') {
      const file = await readFile(payload.path);
      const content = replaceExactText(file.content, payload.before, payload.after);
      payload = { path: file.path, sha: file.sha, content };
      preview = { operation, repository: repo, branch, path: file.path, before: input.before, after: input.after, effect: 'GitHub main에 커밋합니다. 자동 배포 설정이 있다면 사이트에 즉시 반영될 수 있습니다.' };
    } else if (operation === 'deployWebsite') {
      const head = await api(`${githubBase}/commits/${branch}`, githubToken);
      if (!/^[a-f0-9]{40}$/.test(head.sha || '') || (input.commitId && input.commitId !== head.sha)) throw error('요청한 커밋이 현재 main과 다릅니다. 최신 상태로 다시 준비해주세요.', 409);
      payload = { commitId: head.sha };
      preview = { operation, repository: repo, branch, commitId: head.sha, message: head.commit?.message, effect: '이 커밋을 운영 사이트에 배포합니다.' };
    } else {
      preview = { operation, payload, effect: operation === 'deletePatient' ? '환자와 연결된 예약·메시지가 삭제될 수 있습니다.' : operation.startsWith('delete') ? '이 데이터를 삭제합니다.' : operation === 'sendThreadReply' ? '아래 수신 대상과 내용으로 발송 또는 채널 저장을 실행합니다.' : '관리자 데이터를 변경합니다.' };
    }
    const token = randomBytes(32).toString('hex');
    pending.set(token, { operation, payload, expiresAt: now() + 10 * 60 * 1000 });
    return { ok: true, operation, preview, confirmationToken: token, expiresInSeconds: 600 };
  }
  async function execute(token, confirmed) {
    if (confirmed !== true) throw error('실행할 내용을 확인해주세요.', 403);
    const entry = pending.get(token);
    if (!entry || entry.expiresAt <= now()) { pending.delete(token); throw error('작업이 만료됐거나 이미 실행됐습니다. 다시 준비해주세요.', 409); }
    pending.delete(token); // Consume before awaiting: double-clicks cannot replay writes.
    const { operation, payload } = entry;
    check(operation);
    if (operation === 'editWebsiteFile') {
      const file = await readFile(payload.path);
      if (file.sha !== payload.sha) throw error('확인 이후 파일이 변경됐습니다. 최신 내용으로 다시 준비해주세요.', 409);
      const result = await api(`${githubBase}/contents/${payload.path.split('/').map(encodeURIComponent).join('/')}`, githubToken, { method: 'PUT', body: JSON.stringify({ branch, sha: payload.sha, content: Buffer.from(payload.content).toString('base64'), message: `Admin AI: update ${payload.path} (staff confirmed)` }) });
      return { ok: true, operation, commitId: result.commit?.sha, url: result.commit?.html_url, message: 'GitHub에 반영했습니다. 운영 반영 여부는 배포 상태로 확인하세요.' };
    }
    if (operation === 'deployWebsite') {
      const result = await api(`${renderBase}/deploys`, renderToken, { method: 'POST', body: JSON.stringify({ clearCache: 'do_not_clear', commitId: payload.commitId }) });
      return { ok: true, operation, id: result.id, status: result.status, commitId: payload.commitId, message: '배포를 요청했습니다. getDeploymentStatus로 완료 여부를 확인하세요.' };
    }
    return executeRecord(operation, payload);
  }
  return { capabilities, prepare, execute };
}
