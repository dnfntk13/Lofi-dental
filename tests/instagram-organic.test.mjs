import test from 'node:test';
import assert from 'node:assert/strict';
import { instagramOrganicKind, summarizeInstagramOrganic } from '../lib/instagram-organic.mjs';
test('only explicit organic tags classify; paid and legacy ig/social remain separate',()=>{
  const base={source:'instagram',medium:'organic_social'};
  assert.equal(instagramOrganicKind({...base,campaign:'lofi_ig_organic_profile_20261107'}),'organic');
  assert.equal(instagramOrganicKind({...base,campaign:'lofi_ig_organic_20261107_0900_dental_checkup_feed_story'}),'organic');
  assert.equal(instagramOrganicKind({...base,medium:'paid_social',campaign:'lofi_ig_organic_profile_20261107'}),null);
  assert.equal(instagramOrganicKind({source:'ig',medium:'social'}),null);
});
test('all post keys survive top-ten limits and QA counts stay separate without inflating visitors',()=>{
  const events=Array.from({length:12},(_,i)=>({campaign:{source:'instagram',medium:'organic_social',name:'lofi_ig_organic_20261107_0900_topic'+i+'_reel_story'},day:'2026-11-07',visitorId:'visitor',timestamp:'2026-11-07T01:00:00Z'}));
  events.push({...events[0]}, {...events[0],campaign:{...events[0].campaign,name:'lofi_ig_organic_qa_20261107_0900'}});
  const result=summarizeInstagramOrganic(events);
  assert.equal(result.rows.length,12); assert.equal(result.checks.length,1);
  assert.equal(result.rows[0].views,2); assert.equal(result.rows[0].visitors,1);
});
