/* Crane Pay — deterministic, non-destructive duplicate-day repair.
 * A payable workday is unique by operatorId + date. Keep one in the active
 * ledger and copy *all* alternate originals to duplicateWorkdayArchive.
 * This runs before display and on both sides of Drive reconciliation.
 */
(function(root){
'use strict';
function clone(x){return JSON.parse(JSON.stringify(x))}
function dayKey(x){
 if(!x||typeof x.operatorId!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x.date||''))return '';
 return x.operatorId+'|'+x.date;
}
function hash(x){const s=JSON.stringify(x);let n=2166136261;for(let i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619)}return (n>>>0).toString(36)}
function mins(t){if(!/^\d\d:\d\d$/.test(t||''))return null;return Number(t.slice(0,2))*60+Number(t.slice(3))}
function expected(g){
 if(!g||!g.times)return null;
 const start=mins(g.yardOnly?g.times.work:g.times.yard),end=mins(g.yardOnly?g.times.workEnd:g.times.end);
 if(start===null||end===null)return null;
 let span=end-start;if(span<=0)span+=1440;
 return {start:g.yardOnly?g.times.work:g.times.yard,end:g.yardOnly?g.times.workEnd:g.times.end,
  hours:Math.max(0,(span-(g.lunch?30:0))/60)};
}
function score(d,g){
 let n=0;
 if(d.timeline)n+=5;
 if(!d.calculationPending)n+=5;
 if(d.startTime&&d.endTime)n+=2;
 if(g&&g.status==='done'){
  const e=expected(g);
  if(e){
   if(d.startTime===e.start)n+=24;
   if(d.endTime===e.end)n+=24;
   if(Math.abs((Number(d.loggedHours)||0)-e.hours)<0.001)n+=35;
  }
  if(d.timeline?.times&&JSON.stringify(d.timeline.times)===JSON.stringify(g.times))n+=50;
  if(d.timeline?.yardOnly===g.yardOnly)n+=6;
 }
 return n;
}
function repair(data){
 if(!data||!Array.isArray(data.days))return {repaired:0,archived:0};
 const groups=new Map(),order=[];
 for(const d of data.days){
  const k=dayKey(d)||'invalid-record:'+order.length;
  if(!groups.has(k)){groups.set(k,[]);order.push(k)}
  groups.get(k).push(d);
 }
 const archive=Array.isArray(data.duplicateWorkdayArchive)?data.duplicateWorkdayArchive:[];
 const seen=new Set(archive.map(x=>x.id));
 const kept=[];
 let repaired=0,archived=0;
 for(const key of order){
  const rows=groups.get(key);
  if(rows.length===1){kept.push(rows[0]);continue}
  const g=data.guided&&data.guided[key];
  const ranked=rows.map((d,i)=>({d,i,score:score(d,g)})).sort((a,b)=>
   b.score-a.score||
   String(a.d.id||'').localeCompare(String(b.d.id||''))||
   hash(a.d).localeCompare(hash(b.d))||a.i-b.i);
  const winner=ranked[0].d;
  kept.push(winner);
  repaired+=rows.length-1;
  for(const {d} of ranked.slice(1)){
   const id='duplicate-'+(dayKey(d)||'unknown')+'-'+String(d.id||'no-id')+'-'+hash(d);
   if(seen.has(id))continue;
   archive.push({id,operatorId:d.operatorId,date:d.date,record:clone(d),
    note:'Automatically archived duplicate payday record; active record kept separately.'});
   seen.add(id);archived++;
  }
 }
 if(repaired){data.days=kept;data.duplicateWorkdayArchive=archive;}
 return {repaired,archived};
}
const api={repair,dayKey};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.CranePayIntegrity=api;
})(typeof window!=='undefined'?window:null);
