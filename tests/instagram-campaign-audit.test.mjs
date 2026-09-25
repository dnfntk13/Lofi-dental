import test from 'node:test';
import assert from 'node:assert/strict';
import {auditWindow, validateCampaignAudit, summarizeCampaignAudit} from '../lib/instagram-campaign-audit.mjs';
const now = new Date('2026-09-25T12:00:00Z');
const row = (n,day='2026-09-12',extra={}) => ({patientKey:'patient-key-0000'+n,confirmedDay:day,status:'confirmed',visitKind:'new',campaignId:'video',videoTitle:'Real video title',evidenceUrl:'https://www.instagram.com/direct/t/123/',...extra});
const audit = patients => validateCampaignAudit({auditedAt:now.toISOString(),coverage:{sinceDay:'2026-09-12',throughDay:'2026-09-25'},patients},now);
test('uses Korean calendar days and exactly 14 inclusive days',()=>{
 assert.deepEqual(auditWindow(now),{sinceDay:'2026-09-12',throughDay:'2026-09-25'});
 assert.deepEqual(auditWindow('2026-09-25T15:00:00Z'),{sinceDay:'2026-09-13',throughDay:'2026-09-26'});
});
test('counts first confirmations, excludes old confirmations, cancellations and followups',()=>{
 const s=summarizeCampaignAudit(audit([row(1),row(2,'2026-09-25'),row(3,'2026-09-11'),row(4,'2026-09-20',{status:'cancelled'}),row(5,'2026-09-20',{visitKind:'followup'}),row(6,'2026-09-20',{status:'pending'}),row(7,'2026-09-20',{campaignId:'',videoTitle:''})]),{},now);
 assert.equal(s.totalPatients,3); assert.equal(s.campaignPatients,2); assert.equal(s.unknownCampaignPatients,1);assert.equal(s.pendingPatients,1);assert.equal(s.byCampaign[0].patients,2);assert.equal(s.stale,false);
 assert.doesNotMatch(JSON.stringify(s),/patient-key|direct\/t/);
});
test('rejects duplicate patients rather than silently double counting multiple campaigns',()=>{
 assert.throws(()=>audit([row(1),row(1,'2026-09-20',{campaignId:'other'})]),/unique/);
});
test('expires older confirmations and marks missing coverage as stale',()=>{
 const s=summarizeCampaignAudit(audit([row(1),row(2,'2026-09-25')]),{},new Date('2026-09-26T02:00:00Z'));
 assert.equal(s.totalPatients,1);assert.equal(s.stale,true);assert.equal(s.throughDay,'2026-09-26');
 const missing=summarizeCampaignAudit(null,{},now);assert.equal(missing.available,false);assert.equal(missing.stale,true);
});
test('does not turn numeric identifiers into video titles and supports title corrections',()=>{
 const a=audit([row(1,'2026-09-25',{campaignId:'12345',videoTitle:''})]);
 assert.equal(summarizeCampaignAudit(a,{},now).byCampaign[0].label,'Video title unavailable');
 assert.equal(summarizeCampaignAudit(a,{'12345':'Correct title'},now).byCampaign[0].label,'Correct title');
});
test('rejects invalid evidence, dates and future audits',()=>{
 assert.throws(()=>audit([row(1,'2026-02-30')]),/date/);
 assert.throws(()=>audit([row(1,'2026-09-26')]),/date/);
 assert.throws(()=>audit([row(1,'2026-09-25',{evidenceUrl:'https://example.com/'})]),/evidence/);
 assert.throws(()=>validateCampaignAudit({...audit([]),auditedAt:'2026-09-26T00:00:00Z'},now),/timestamp/);
});
