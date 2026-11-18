(function(){
'use strict';
const api=window.CranePayAPI;
if(!api)return;
const pane=document.getElementById('pane-week');
if(!pane)return;
const key='cranepay-vacation-tracker-v1';
let saved={rate:3.45,actual:{},deposits:{}};
try{const x=JSON.parse(localStorage.getItem(key)||'{}');saved={...saved,...x,actual:x.actual||{},deposits:x.deposits||{}}}catch(e){}
const box=document.createElement('div');
box.className='card';
box.style.cssText='margin:12px 0;padding:14px;border:1px solid #426c81;border-radius:12px';
box.innerHTML='<h3 style="margin:0 0 8px">Vacation pay verification</h3>'+
'<p class="tiny">Provisional hourly rate. Estimates are separate from gross wages. Confirm the contract rate and which hours qualify.</p>'+
'<label>Vacation rate per worked hour ($)<input id="vacRate" type="number" min="0" step="0.01" inputmode="decimal"></label>'+
'<label>Four-week period ending (week starting)<input id="vacEndWeek" type="date"></label>'+
'<div id="vacResults" aria-live="polite"></div>'+
'<label>Vacation amount on selected week\'s paycheck ($)<input id="vacActual" type="number" min="0" step="0.01" placeholder="Enter from pay stub"></label>'+
'<label>OE Federal deposit for these four weeks ($)<input id="vacDeposit" type="number" min="0" step="0.01" placeholder="Enter deposit when received"></label>'+
'<p class="tiny">Paycheck and deposit amounts are saved on this device. A deposit may cover a different reporting period.</p>';
const anchor=document.getElementById('comparePaycheck');
if(anchor&&anchor.closest('.card'))anchor.closest('.card').insertAdjacentElement('afterend',box);else pane.appendChild(box);
const el=id=>document.getElementById(id),money=n=>'$'+n.toFixed(2);
const weekStart=date=>api.weekOf(date);
const shift=(d,n)=>{const a=new Date(d+'T12:00:00');a.setDate(a.getDate()+n);return [a.getFullYear(),String(a.getMonth()+1).padStart(2,'0'),String(a.getDate()).padStart(2,'0')].join('-')};
const save=()=>{try{localStorage.setItem(key,JSON.stringify(saved))}catch(e){}};
el('vacRate').value=saved.rate;
el('vacEndWeek').value=weekStart(api.localToday());
function render(){
 const end=weekStart(el('vacEndWeek').value||api.localToday());
 const rate=Number(saved.rate)||0;
 const days=api.getData().days.filter(d=>d.operatorId===api.getOperatorId());
 const rows=[];
 for(let i=3;i>=0;i--){
  const week=shift(end,-7*i);
  const matching=days.filter(d=>weekStart(d.date)===week);
  const hours=matching.reduce((sum,d)=>{try{const c=api.computeDay(d);return sum+Object.values(c.classHours||{}).reduce((v,h)=>v+(Number(h)||0),0)}catch(e){return sum+(Number(d.loggedHours)||0)}},0);
  const estimate=Math.round(hours*rate*100)/100;
  const actual=saved.actual[api.getOperatorId()+'|'+week];
  rows.push({week,hours,estimate,actual,hasDays:matching.length>0});
 }
 const sum=rows.reduce((v,r)=>v+r.estimate,0),hours=rows.reduce((v,r)=>v+r.hours,0);
 const actuals=rows.filter(r=>r.actual!==undefined&&r.actual!==null);
 const actualSum=actuals.reduce((v,r)=>v+Number(r.actual),0);
 const depKey=api.getOperatorId()+'|'+end,deposit=saved.deposits[depKey];
 el('vacResults').innerHTML='<div style="overflow-x:auto"><table style="width:100%;font-size:12px"><thead><tr><th>Week</th><th>Hours</th><th>Estimated</th><th>Stub</th></tr></thead><tbody>'+
 rows.map(r=>'<tr><td>'+r.week+'</td><td>'+r.hours.toFixed(2)+'</td><td>'+money(r.estimate)+'</td><td>'+(r.actual===undefined?'—':money(Number(r.actual)))+'</td></tr>').join('')+
 '</tbody></table></div><p><strong>Four-week estimate: '+money(sum)+'</strong> · '+hours.toFixed(2)+' hours</p>'+
 '<p class="tiny">Verified pay stubs: '+actuals.length+'/4'+(actuals.length?' · '+money(actualSum):'')+'. '+(actuals.length===4?'Difference from estimate: '+money(actualSum-sum):'Enter all four stubs for a complete comparison.')+'</p>'+
 '<p class="tiny">'+(deposit===undefined?'No deposit entered for this four-week period.':'OE Federal deposit: '+money(Number(deposit))+' · Difference from estimate: '+money(Number(deposit)-sum))+'</p>'+
 (!rows.every(r=>r.hasDays)?'<p class="tiny">Some weeks have no saved workdays; totals may be incomplete.</p>':'');
 const selected=saved.actual[depKey];el('vacActual').value=selected===undefined?'':selected;
 el('vacDeposit').value=deposit===undefined?'':deposit;
}
el('vacRate').addEventListener('change',()=>{const n=Number(el('vacRate').value);if(!Number.isFinite(n)||n<0)return; saved.rate=n;save();render()});
el('vacEndWeek').addEventListener('change',render);
el('vacActual').addEventListener('change',()=>{const k=api.getOperatorId()+'|'+weekStart(el('vacEndWeek').value);const v=el('vacActual').value;if(v==='')delete saved.actual[k];else if(Number(v)>=0)saved.actual[k]=Number(v);save();render()});
el('vacDeposit').addEventListener('change',()=>{const k=api.getOperatorId()+'|'+weekStart(el('vacEndWeek').value);const v=el('vacDeposit').value;if(v==='')delete saved.deposits[k];else if(Number(v)>=0)saved.deposits[k]=Number(v);save();render()});
pane.addEventListener('click',e=>{if(e.target.closest('#prevWeek,#nextWeek')){const d=weekStart(el('vacEndWeek').value);el('vacEndWeek').value=shift(d,e.target.id==='prevWeek'?-7:7);render()}});
document.getElementById('weekOperator')?.addEventListener('change',()=>setTimeout(render,0));
render();
})();