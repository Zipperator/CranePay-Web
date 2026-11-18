/* V6.9 — on-device paycheck scan and verified comparison. */
(function(){
'use strict';
let recognized='';
const $=id=>document.getElementById(id);
const money=n=>'$'+Number(n||0).toFixed(2);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function parseRows(raw){
 const result=[];
 for(const line of raw.split(/\r?\n/)){
  const type=/\b(triple\s*time|double\s*time|overtime|regular|reg|ot|dt|tt)\b/i.exec(line);
  if(!type)continue;
  const key=type[0].toUpperCase().replace(/\s+/g,'');
  const category=key==='REG'||key==='REGULAR'?'REG':key==='OT'||key==='OVERTIME'?'OT':key==='DT'||key==='DOUBLETIME'?'DT':'TT';
  const nums=(line.slice(type.index+type[0].length).match(/-?\$?-?\d[\d,]*(?:\.\d+)?-?/g)||[]).map(v=>{const negative=v.includes('-');const n=Number(v.replace(/[$,\-]/g,''));return negative?-n:n;});
  if(nums.length<3)continue;
  const [hours,rate,amount]=nums.slice(-3);
  if(hours!==0&&Math.abs(hours)<200&&rate>0&&rate<1000&&Math.abs(amount)>0)result.push({type:category,hours,rate,amount});
 }
 return result;
}
function row(r){return '<div class="scan-row" style="display:grid;grid-template-columns:22% 21% 27% 30%;gap:2px;margin:6px 0">'+
 '<select aria-label="Pay type" class="scan-type">'+['REG','OT','DT','TT'].map(t=>'<option '+(t===r.type?'selected':'')+'>'+t+'</option>').join('')+'</select>'+
 '<input class="scan-hours" aria-label="Hours" type="number" step="0.01" value="'+esc(r.hours)+'">'+
 '<input class="scan-rate" aria-label="Rate" type="number" step="0.001" value="'+esc(r.rate)+'">'+
 '<input class="scan-amount" aria-label="Amount" type="number" step="0.01" value="'+esc(r.amount)+'"></div>';}
function readRows(){return [...document.querySelectorAll('#scanRows .scan-row')].map(el=>({
 type:el.querySelector('.scan-type').value,
 hours:Number(el.querySelector('.scan-hours').value),
 rate:Number(el.querySelector('.scan-rate').value),
 amount:Number(el.querySelector('.scan-amount').value)
})).filter(r=>r.hours!==0&&r.rate>0&&Number.isFinite(r.amount));}
function compare(){
 const api=window.CranePayAPI;
 const week=$('weekLabel')?.textContent||'';
 const expected=api.getExpectedPaycheckLines();
 const scanned=readRows();
 if(!scanned.length){$('scanComparison').textContent='No verified earnings lines yet. Add or correct rows first.';return;}
 const key=r=>r.type+'|'+Number(r.rate).toFixed(3);
 const group=lines=>{const m=new Map();for(const l of lines){const k=key(l),v=m.get(k)||{type:l.type,rate:l.rate,hours:0,amount:0};v.hours+=l.hours;v.amount+=l.amount;m.set(k,v);}return m;};
 // Negative correction entries are reversals, not additional work hours.
 const a=group(expected),b=group(scanned);
 const keys=[...new Set([...a.keys(),...b.keys()])].sort();
 let html='<p class="tiny">Comparison for '+esc(week)+'. Differences are estimates; confirm OCR entries and payroll rules.</p>'+
 '<div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse"><tr><th>Pay/rate</th><th>Expected hrs</th><th>Stub hrs</th><th>Pay diff</th></tr>';
 for(const k of keys){const x=a.get(k),y=b.get(k),delta=(x?.amount||0)-(y?.amount||0);
 html+='<tr style="background:'+(Math.abs(delta)>0.02?'#fff0e5':'#e8f7eb')+';color:#111"><td>'+esc((x||y).type)+' '+esc((x||y).rate)+'</td><td>'+Number(x?.hours||0).toFixed(2)+'</td><td>'+Number(y?.hours||0).toFixed(2)+'</td><td>'+money(delta)+'</td></tr>';}
 const exp=expected.reduce((v,l)=>v+l.amount,0),paid=scanned.reduce((v,l)=>v+l.amount,0);
 html+='</table></div><p><b>Expected hourly:</b> '+money(exp)+'<br><b>Scanned hourly:</b> '+money(paid)+'<br><b>Difference:</b> '+money(exp-paid)+'</p>';
 $('scanComparison').innerHTML=html;
}
function init(){
 const button=$('comparePaycheck');if(!button)return;
 button.insertAdjacentHTML('afterend','<button id="scanStubButton" type="button" class="button secondary wide" style="margin-top:10px">📷 Scan & Compare Bragg Paycheck</button>'+
 '<section id="scanStubPanel" hidden style="margin-top:12px"><h3>Scan paycheck (on this phone)</h3><p class="tiny">The photo is processed on your device. OCR may misread numbers: check every row before comparing. No photo is uploaded to an AI service. For correction checks, enter reversed hours and amounts as negative numbers. The scan is not yet reliable for the separate printed columns on Bragg pay stubs.</p>'+
 '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="button secondary" id="scanCamera" type="button">Take photo</button><button class="button secondary" id="scanGallery" type="button">Choose photo</button></div>'+
 '<p id="scanStatus" role="status"></p><details><summary>Recognized text — check against paycheck</summary><pre id="scanRaw" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px"></pre></details>'+
 '<p><b>Review recognized earnings lines</b> (hours / rate / amount)</p><div style="display:grid;grid-template-columns:22% 21% 27% 30%;font-size:11px"><b>Type</b><b>Hours</b><b>Rate</b><b>Amount</b></div>'+
 '<div id="scanRows"></div><button class="button secondary small" id="scanAdd" type="button">+ Add missing line</button>'+
 '<button class="button wide" id="scanCompare" type="button" style="margin-top:12px">Compare verified lines</button><div id="scanComparison"></div></section>');
 $('scanStubButton').onclick=()=>{$('scanStubPanel').hidden=!$('scanStubPanel').hidden;};
 $('scanCamera').onclick=()=>{if(!window.CraneStubScanner)return alert('Camera scanner requires the Android app.');$('scanStatus').textContent='Opening camera…';window.CraneStubScanner.takePhoto();};
 $('scanGallery').onclick=()=>{if(!window.CraneStubScanner)return alert('Photo scanner requires the Android app.');$('scanStatus').textContent='Choose a photo…';window.CraneStubScanner.choosePhoto();};
 $('scanAdd').onclick=()=>$('scanRows').insertAdjacentHTML('beforeend',row({type:'REG',hours:0,rate:0,amount:0}));
 $('scanCompare').onclick=compare;
}
window.CraneStubScan={receive(ok,text){
 if(!$('scanStatus'))return;
 $('scanStubPanel').hidden=false;
 if(!ok){$('scanStatus').textContent=text||'Scan cancelled';return;}
 recognized=text;$('scanRaw').textContent=text;
 const rows=parseRows(text);$('scanRows').innerHTML=rows.map(row).join('');
 $('scanStatus').textContent=rows.length?rows.length+' possible earnings lines recognized. Verify all values before comparing.':'Text read, but earnings lines could not be reliably identified. Add them manually from the stub.';
 $('scanComparison').textContent='';
}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
