(function(){
window.CranePayTimeline=function(d,data,h){
const t=d.timeline.times||{},names=['REG','OT','DT','TT'],hours={REG:0,OT:0,DT:0,TT:0},buckets=[],issues=[];
const min=s=>s?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
// For a yard-only shift, the two working checkpoints define the paid day.
// Do not manufacture travel or yard departure/return timestamps.
const start=min(d.timeline.yardOnly?t.work:t.yard);
const end=min(d.timeline.yardOnly?t.workEnd:t.end);
const empty={hours:0,classHours:hours,classifiedHours:0,premiumHours:0,guaranteedHours:0,buckets:[],issues:['Incomplete timeline'],wages:0};
if(start===null||end===null)return empty;
let duration=end-start;if(duration<=0)duration+=1440;if(duration>1440)return empty;
const N=x=>Number(x)||0,wd=new Date(d.date+'T12:00:00').getDay(),holiday=h.isContractHoliday(d.date)||!!d.timeline.holidayPay,special=h.specialDoubleSaturday(d.date);
const interval=(a,b)=>{if(!t[a]||!t[b])return null;let x=min(t[a])-start,y=min(t[b])-start;if(x<0)x+=1440;if(y<0)y+=1440;return y>=x&&y<=duration?[x,y]:null};
const base=d.timeline.base?interval(d.timeline.baseStart,d.timeline.baseEnd):null;
const boom=d.timeline.boom?interval(d.timeline.boomStart,d.timeline.boomEnd):null;
const iron=d.timeline.wwiw?interval(d.timeline.wwiwStart,d.timeline.wwiwEnd):null;
if(d.timeline.base&&!base)issues.push('Base hours incomplete');
if(d.timeline.boom&&!boom)issues.push('Boom hours incomplete');
if(d.timeline.wwiw&&!iron)issues.push('WWIW hours incomplete');
const inRange=(r,i)=>r&&i>=r[0]&&i<r[1];
const boomFeet=N(d.timeline.main)+N(d.timeline.jib);
// Article IV-B: for every $0.75/operator long-boom tier, the oiler gets $0.25.
const crewRole=['operator','oiler','third'].includes(d.timeline.crewRole)?d.timeline.crewRole:'operator';
const boomTiers=boomFeet<80?0:1+Math.max(0,Math.ceil((boomFeet-100-0.00001)/20));
const boomPremium=boomTiers*(crewRole==='operator'?0.75:crewRole==='oiler'?0.25:0);
const groupNumber=Number(String(d.classId||'').split('-').pop());
const lattice=d.timeline.lattice?(crewRole==='operator'?(groupNumber>=6?1:0):crewRole==='oiler'?0.50:0):0;
const baseRate=N(d.baseRate);
if(crewRole==='oiler'&&groupNumber!==1&&groupNumber!==2)issues.push('Oiler pay group should be Group 1 or Group 2 — verify classification');
if(crewRole==='third')issues.push('Third-man classification/rate requires payroll confirmation; no boom or lattice premium is applied');
if(d.timeline.lattice&&crewRole==='operator'&&groupNumber<6)issues.push('Operator lattice premium requires a qualifying Group 6+ crane');

const prior=data.days.filter(x=>x!==d&&x.operatorId===d.operatorId&&x.date<d.date&&h.weekOf(x.date)===h.weekOf(d.date));
let priorREG=0;for(const x of prior){if(!x.timeline){const s=h.effectiveHours(x);priorREG+=N(s.REG)*60}}
const lunchStart=d.timeline.lunch?Math.floor((duration-30)/2):-1;
// Early overtime does not consume the eight straight-time hours.
const rows=new Map();let count=0,regular=0;
function add(type,rate){let key=type+'|'+rate,entry=rows.get(key);if(!entry){entry={type,rate,hours:0,amount:0};rows.set(key,entry)}entry.hours+=1/60;hours[type]+=1/60}
for(let i=0;i<duration;i++){
if(d.timeline.lunch&&i>=lunchStart&&i<lunchStart+30)continue;
const minute=(start+i)%1440;
const wwiw=inRange(iron,i),dtCutoff=wwiw?(wd===6?480:600):720;
let type;
if(holiday)type='TT';
else if(wd===0||special||count>=dtCutoff)type='DT';
else if(wd===6||start+i>=1440||minute<360||minute>=1020||regular>=480||priorREG+regular>=2400)type='OT';
else{type='REG';regular++}
let premium=(inRange(base,i)?10:0)+(inRange(boom,i)?boomPremium:0)+lattice;
let mult={REG:1,OT:1.5,DT:2,TT:3}[type];
add(type,Math.round((baseRate+premium)*mult*1000000)/1000000);count++;
}
for(const b of rows.values()){b.hours=Math.round(b.hours*100000)/100000;b.amount=Math.round(b.hours*b.rate*100)/100;buckets.push(b)}
let extraHours=0;
if(d.timeline.lunchClaim&&!d.timeline.lunch){extraHours=.5;buckets.push({type:'DT',hours:.5,rate:baseRate*2,amount:Math.round(baseRate*100)/100});}
let guarantee=0;if(holiday&&count>0&&count<480){guarantee=(480-count)/60;buckets.push({type:'TT',rate:baseRate*3,hours:guarantee,amount:Math.round(guarantee*baseRate*3*100)/100})}
if(!d.timeline.boom&&boomFeet>0)issues.push('Boom is turned off');
if(d.calculationPending)issues.push('Completed timecard changed; recheck start and finish times before using payroll total');
const sum=buckets.reduce((s,x)=>s+x.amount,0);
return {hours:count/60,classHours:hours,classifiedHours:count/60+extraHours+guarantee,premiumHours:extraHours,guaranteedHours:guarantee,buckets,issues,wages:Math.round(sum*100)/100};
};
})();