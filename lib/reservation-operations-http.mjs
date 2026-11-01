// Kept independent of server globals so the authenticated HTTP contract is testable.
export async function handleReservationOperations({ pathname, request, response, authorized, readBody, service }) {
  const match = pathname.match(/^\/api\/admin\/dentweb\/reservations\/(\d+)\/operations(?:\/([A-Za-z0-9_-]+)(?:\/(result|recover))?)?$/);
  if (!match) return false;
  const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
  if (!authorized) { send(401, { message: 'Authentication required' }); return true; }
  try {
    const id = Number(match[1]), op = match[2], action = match[3];
    let result;
    if (request.method === 'GET' && !action) result = await service.get(id, op);
    else if (request.method === 'POST' && !op) result = await service.queue(id, await readBody(request));
    else if (request.method === 'POST' && action === 'result') result = await service.complete(id, op, await readBody(request));
    else if (request.method === 'POST' && action === 'recover') result = await service.recover(id, op);
    else { send(405, { message: 'Method not supported' }); return true; }
    send(result ? 200 : 404, result ? { ok: true, operation: result } : { message: 'Operation not found' });
  } catch (e) { send(409, { message: e.message }); }
  return true;
}
