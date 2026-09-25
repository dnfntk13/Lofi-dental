import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeInstagramCampaigns, campaignLabel} from '../lib/instagram-campaign-insights.mjs';
const booking={date:'2026-09-25',time:'1:00 PM'};
test('counts unique patients with calendar bookings, linking separate DM records',()=>{
 const records=[{id:'dm',source:'instagram-dm',email:'a@x',phone:'010-1234-5678',acquisition:{source:'ig',campaign:'123'},date:'Instagram DM',time:'Live'},{...booking,id:'b',phone:'01012345678'},{...booking,id:'c',email:'a@x'},{...booking,id:'d',email:'b@x',source:'instagram-dm'},{source:'instagram-dm',email:'c@x',date:'Instagram DM',time:'Live'},{...booking,id:'e',email:'d@x',source:'instagram-dm',status:'cancelled'}];
 const s=summarizeInstagramCampaigns(records,[],{'123':'Lab video'});
 assert.equal(s.totalPatients,2);assert.equal(s.unknownCampaignPatients,1);assert.equal(s.byCampaign[0].patients,1);assert.equal(s.byCampaign[0].label,'Lab video');assert.doesNotMatch(JSON.stringify(s),/a@x|010123/);
});
test('unidentified bookings are not invented patients and numeric IDs are not titles',()=>{
 const s=summarizeInstagramCampaigns([{...booking,source:'instagram-dm'}],[{campaign:{source:'ig',name:'123'}}]);
 assert.equal(s.totalPatients,0);assert.equal(s.unidentifiedRecords,1);assert.equal(s.byCampaign[0].titleMissing,true);assert.equal(campaignLabel('123'),'Video title not set');assert.equal(typeof campaignLabel('constructor'),'string');
});

test('invalid dates and times are never bookings',()=>{ assert.equal(summarizeInstagramCampaigns([{date:'2026-02-30',time:'12:00 PM',source:'instagram-dm',email:'a@x'},{date:'2026-09-25',time:'25:00',source:'instagram-dm',email:'b@x'}]).totalPatients,0); });
