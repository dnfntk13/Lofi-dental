import test from 'node:test';
import assert from 'node:assert/strict';
import {sameDentwebReservation as same, dentwebReservationId} from './dentweb-import-identity.mjs';
const slot = {date:'2026-09-29',time:'10:00'};
test('different patients at the same time are both kept',()=>{
 assert.equal(same({...slot,name:'Jason',dentwebReservationId:716},{...slot,name:'THANDAR KHAING',dentwebReservationId:733}),false);
 assert.equal(same({...slot,name:'김기영',phone:'01011112222'},{...slot,name:'RHONE MEGAN',phone:'01033334444'}),false);
});
test('linked reservation remains the same when moved or renamed',()=>{
 assert.equal(same({...slot,name:'Old',dentwebReservationId:733},{date:'2026-10-03',time:'14:00',name:'New',concerns:'[Dentweb #733] memo'}),true);
});
test('legacy unlinked records match normalized phone or name only at same time',()=>{
 assert.equal(same({...slot,name:'Khan',phone:'010-1234-5678'},{...slot,name:'칸',phone:'+82 10 1234 5678'}),true);
 assert.equal(same({...slot,name:'Thandar Khaing'},{...slot,name:'THANDAR KHAING'}),true);
 assert.equal(same({...slot,name:'Khan',phone:'01012345678'},{...slot,time:'11:00',name:'Khan',phone:'01012345678'}),false);
 assert.equal(dentwebReservationId({concerns:'[Dentweb #154] note'}),154);
});
