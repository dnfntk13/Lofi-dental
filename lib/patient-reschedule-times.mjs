import { appointmentStamp } from './linked-reschedule.mjs';
import { protectedReservationOverlap } from './reservation-windows.mjs';

// Same published schedule as the patient booking calendar, in Asia/Seoul.
const holidays = new Set(['2026-12-25','2027-01-01','2027-02-06','2027-02-07','2027-02-08','2027-03-01','2027-05-05','2027-05-13','2027-06-06','2027-06-07','2027-08-15','2027-08-16','2027-09-14','2027-09-15','2027-09-16','2027-10-03','2027-10-04','2027-10-09','2027-12-25']);
export const koreanNow = now => new Date(now.getTime()+9*3600000).toISOString().slice(0,16);
export const minuteOf = time => Number(time.slice(0,2))*60+Number(time.slice(3));
export function validChangeDay(date, now = new Date()) {
  try { appointmentStamp(date, '00:00'); } catch { return false; }
  const today = koreanNow(now).slice(0,10);
  const last = new Date(Date.parse(today+'T00:00:00Z')+90*86400000).toISOString().slice(0,10);
  return date >= today && date <= last && !holidays.has(date);
}
export function changeTimes(date, duration, busy = [], now = new Date()) {
  if (!validChangeDay(date,now) || !Number.isInteger(duration) || duration<1 || duration>255) return [];
  const day=new Date(date+'T00:00:00Z').getUTCDay();
  const ranges=day===0||day===6?[[600,960]]:[[600,780],[840,1140]];
  const times=[];
  for(const [start,end] of ranges)for(let m=start;m+duration<=end;m+=30){
    const time=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
    if(date+'T'+time<=koreanNow(now)||protectedReservationOverlap({date,time,durationMinutes:duration}))continue;
    if(busy.some(b=>m<b.endMinute&&m+duration>b.startMinute))continue;
    times.push(time);
  }
  return times;
}
