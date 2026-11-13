export async function handlePatientReschedule({pathname,request,response,readBody,authorized,service}){
  const publicPrefix='/api/reservation-management/';
  const result=pathname.match(/^\/api\/admin\/dentweb\/patient-reschedule\/reads\/([a-f0-9-]{36})\/result$/);
  if(!pathname.startsWith(publicPrefix)&&!result)return false;
  const send=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(body));};
  try{
    if(result){if(!authorized){send(401,{code:'authentication_required'});return true;}if(request.method!=='POST'){send(405,{code:'method_not_allowed'});return true;}send(200,await service.readResult(result[1],await readBody(request)));return true;}
    const action=pathname.slice(publicPrefix.length);
    if(action==='config'&&request.method==='GET'){send(200,await service.config());return true;}
    if(request.method!=='POST'){send(405,{code:'method_not_allowed'});return true;}
    const body=await readBody(request);
    // Render terminates the connection. Prefer its real client header; do not trust arbitrary X-Forwarded-For chains.
    const ip=String(request.headers['cf-connecting-ip']||request.socket?.remoteAddress||'unknown').slice(0,100);
    if(action==='code'){send(200,await service.start(body.email,ip));return true;}
    if(action==='verify'){send(200,await service.verify(body.email,body.code,ip));return true;}
    const token=String(request.headers.authorization||'').replace(/^Bearer /,'');
    const email=await service.authenticate(token);
    let data;
    if(action==='logout')data=await service.logout(token);
    else if(action==='reservations')data=await service.list(email);
    else if(action==='availability')data=await service.availability(email,body.reservationId,body.date);
    else if(action==='availability-status')data=await service.getAvailability(email,body.readId);
    else if(action==='reschedule')data=await service.submit(email,body);
    else if(action==='status')data=await service.status(email,body.reservationId,body.operationId);
    else {send(404,{code:'not_found'});return true;}
    send(200,data);
  }catch(e){send(e.statusCode||409,{code:typeof e.code==='string'?e.code:'clinic_review_required'});}
  return true;
}
