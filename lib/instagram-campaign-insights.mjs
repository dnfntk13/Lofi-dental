const text = value => String(value || '').trim();
export const isInstagram = value => /^(ig|instagram)$/i.test(text(value?.source)) || /(^|\.)instagram\.com$/i.test(text(value?.referrerHost)) || value?.channel === 'instagram' || value?.source === 'instagram-dm';
export function campaignLabel(id, titles = {}) {
  return (Object.hasOwn(titles,id) ? titles[id] : null) || (/^\d+$/.test(text(id)) ? 'Video title not set' : text(id)) || 'Campaign unknown';
}
function isCalendarBooking(record) {
  const day=text(record.date), time=text(record.time);
  const date=new Date(day+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==day)return false;
  return /^(?:(?:[01]?\d|2[0-3]):[0-5]\d|(?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M)$/i.test(time) && !/cancel|deleted/i.test(text(record.status));
}
export function summarizeInstagramCampaigns(records, events = [], titles = {}) {
  const groups = new Map(), parents = new Map();
  const root = key => { if (!parents.has(key)) parents.set(key,key); if (parents.get(key)!==key) parents.set(key,root(parents.get(key))); return parents.get(key); };
  const keys = record => [record.patientId && 'patient:'+record.patientId, record.instagramSenderId && 'ig:'+record.instagramSenderId, text(record.email) && 'email:'+text(record.email).toLowerCase(), text(record.phone).replace(/\D/g,'').length >= 7 && 'phone:'+text(record.phone).replace(/\D/g,'')].filter(Boolean);
  for (const record of records) { const ids=keys(record); for(const id of ids) parents.set(root(id),root(ids[0])); }
  const group = id => { if(!groups.has(id)) groups.set(id,{id,label:campaignLabel(id,titles),patients:new Set()}); return groups.get(id); };
  for(const event of events) if(isInstagram(event.campaign)) { const id=text(event.campaign?.name); if(id)group(id); }
  const all=new Set(),unknown=new Set(); let unidentifiedRecords=0;
  for(const record of records) {
    if(!isCalendarBooking(record))continue;
    const identity=keys(record)[0];
    const related=identity ? records.filter(r=>keys(r).some(k=>root(k)===root(identity))) : [record];
    const sources=related.filter(r=>isInstagram(r.acquisition)||isInstagram(r));
    if(!sources.length)continue;
    if(!identity){unidentifiedRecords++;continue;}
    const patient=root(identity); all.add(patient);
    const campaignIds=[...new Set(sources.map(r=>text(r.acquisition?.campaign)).filter(Boolean))];
    if(!campaignIds.length)unknown.add(patient);
    for(const id of campaignIds)group(id).patients.add(patient);
  }
  return {totalPatients:all.size,unknownCampaignPatients:unknown.size,unidentifiedRecords,byCampaign:[...groups.values()].map(g=>({id:g.id,label:g.label,patients:g.patients.size,titleMissing:!titles[g.id]&&/^\d+$/.test(g.id)})).sort((a,b)=>b.patients-a.patients)};
}
