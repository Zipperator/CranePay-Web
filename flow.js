(function(){
'use strict';
const api=window.CranePayAPI, by=id=>document.getElementById(id);
const phases=[['yard','Start at yard'],['pickupArrive','Arrive at crane yard'],['craneDepart','Depart crane yard with crane'],['site','Arrive at jobsite'],['setup','Finish crane setup'],['work','Begin crane work'],['workEnd','Finish crane work'],['breakdown','Finish breakdown'],['craneReturn','Return crane to crane yard'],['pickupDepart','Leave crane yard for home'],['end','Return to yard']];
const secondaryStages=new Set(['pickupArrive','craneDepart','craneReturn','pickupDepart']);
function visiblePhases(){
 // A yard-only shift has no yard-to-job travel. Keep the working checkpoints only.
 if(day.yardOnly)return phases.filter(p=>p[0]==='work'||p[0]==='workEnd');
 return day.multiYard?phases:phases.filter(p=>!secondaryStages.has(p[0]));
}
function labelFor(code){
 const home=day.homeYard?.trim(),pickup=day.pickupYard?.trim();
 const labels={
  yard:'Start at '+(home||'home')+' yard',
  pickupArrive:'Arrive at '+(pickup||'crane')+' yard',
  craneDepart:'Depart '+(pickup||'crane')+' yard with crane',
  site:'Arrive at jobsite with crane',
  setup:'Finish crane setup',
  work:'Begin crane work',
  workEnd:'Finish crane work',
  breakdown:'Finish breakdown',
  craneReturn:'Return crane to '+(pickup||'crane')+' yard',
  pickupDepart:'Leave '+(pickup||'crane')+' yard for home',
  end:'Return to '+(home||'home')+' yard'
 };
 return day.multiYard?labels[code]:phases.find(p=>p[0]===code)?.[1]||code;
}

let day=null;let lastSavedOK=true;let saveMessage='';
function iso(){const x=new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function now(){const x=new Date();return String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')}
function shiftDate(d,offset){const a=d.split('-').map(Number),x=new Date(a[0],a[1]-1,a[2],12);x.setDate(x.getDate()+offset);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function populated(x){return x&&(Object.keys(x.times||{}).length>0||x.notes||x.multiYard||x.yardOnly||x.base||x.boom||x.wwiw||x.lattice||x.lunch||x.lunchClaim)}
function data(){const x=api.getData();x.guided=x.guided||{};return x}
function id(date,op){return op+'|'+date}
function fresh(date,op){return {date,operatorId:op,groupId:api.getOperator(op).classId,times:{},crewRole:'operator',multiYard:false,yardOnly:false,homeYard:'',pickupYard:'',base:false,boom:false,holidayPay:false,lattice:false,wwiw:false,lunch:false,lunchClaim:false,subsistence:'none',main:'',jib:'',baseStart:'site',baseEnd:'breakdown',boomStart:'work',boomEnd:'workEnd',wwiwStart:'work',wwiwEnd:'workEnd',notes:'',status:'open'}}
function save(){
 // One saved workday must have one consistent timeline and payroll calculation.
 // Older builds only updated guided times after Finish Day, leaving stale wages
 // in data.days until the user manually finished again on the other device.
 const review=day.status==='done'?refreshCompletedPayroll():'';
 data().guided[id(day.date,day.operatorId)]=JSON.parse(JSON.stringify(day));
 try{lastSavedOK=api.save()===true;}catch(e){lastSavedOK=false;}
 const a=by('guideStatus');
 if(a){
  a.textContent=!lastSavedOK?'SAVE FAILED — keep this screen open':review?'Saved — payroll needs review':'Saved on device';
  a.style.color=!lastSavedOK?'#ffaaaa':review?'#ffd2a1':'#b8eec0';
 }
 if(lastSavedOK&&day.status==='done'){
  const summary=document.querySelector('#flowApp .gsummary');
  if(summary)summary.outerHTML=shiftOverview();
  api.renderDayList();api.renderMini();
 }
 if(lastSavedOK&&window.CraneDriveSync?.localChanged)window.CraneDriveSync.localChanged();
 return lastSavedOK;
}
function open(date=iso(),op=api.getOperatorId(),saveBlank=true){
 const stored=data(),saved=stored.guided[id(date,op)];
 day=saved?JSON.parse(JSON.stringify(saved)):fresh(date,op);
 // Remember the exact workday the operator opened, including role-only/blank days.
 // Previously resumeJob() skipped those and silently reopened an older Oiler day.
 stored.lastGuidedWorkday={date,operatorId:op};
 saveMessage='';
 if(saved||saveBlank){save()}else{lastSavedOK=true}
 render();document.body.classList.add('guided');
}
function escaped(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function opts(value,arr){return arr.map(x=>'<option value="'+escaped(x[0])+'" '+(x[0]===value?'selected':'')+'>'+escaped(x[1])+'</option>').join('')}
function currentGroupWage(groupId){
 const c=api.getClass(groupId);
 return typeof api.rateFor==='function'
   ?Number(api.rateFor(api.getOperator(day.operatorId),groupId,day.date)||0)
   :Number(c?.rate||0);
}
function baseGroupOptions(){return data().classes.map(x=>{const rate=currentGroupWage(x.id);return [x.id,x.name+(rate>0?' — '+String.fromCharCode(36)+rate.toFixed(2)+'/hr':'')]})}
function clock(code,label,step){const v=day.times[code]||'',h=v?Number(v.slice(0,2)):5;
 const text=v?String(h%12||12).padStart(2,'0')+v.slice(3).replace(':',''):'';
 const am=h>=12?'PM':'AM';
 return '<div class="gline'+(v?' recorded':'')+(secondaryStages.has(code)?' travel-stop':'')+'" data-stage="'+code+'"><div class="gstep"><span class="gstepnum">'+String(step).padStart(2,'0')+'</span><label>'+escaped(label)+'</label><span class="gstepcheck" aria-hidden="true">'+(v?'✓':'')+'</span></div><div class="gclock"><input inputmode="numeric" maxlength="4" placeholder="0500" aria-label="'+escaped(label)+' time" data-time="'+code+'" value="'+text+'"><select aria-label="'+escaped(label)+' AM or PM" data-ampm="'+code+'">'+opts(am,[['AM','AM'],['PM','PM']])+'</select><button type="button" class="gbutton gnow" data-now="'+code+'">NOW</button></div></div>'
}
function range(prefix,title){return '<div class="grange"><span>'+title+'</span><select data-field="'+prefix+'Start">'+opts(day[prefix+'Start'],visiblePhases().map(x=>[x[0],'From '+labelFor(x[0])]))+'</select><select data-field="'+prefix+'End">'+opts(day[prefix+'End'],visiblePhases().map(x=>[x[0],'To '+labelFor(x[0])]))+'</select></div>'}
function check(k,label){return '<label class="gcheck"><input type="checkbox" data-flag="'+k+'" '+(day[k]?'checked':'')+'>'+label+'</label>'}
function field(k,label,kind='text'){return '<label class="gfield">'+label+'<input data-field="'+k+'" type="'+kind+'" value="'+escaped(day[k])+'"></label>'}
function crewRole(){return ['operator','oiler','third'].includes(day.crewRole)?day.crewRole:'operator'}
function crewRoleControl(){
 const role=crewRole();
 const hint=role==='operator'?'Full long-boom pay: $0.75 per tier.':
 role==='oiler'?'Long-boom pay: $0.25 per tier.':
 'Third man: no boom pay.';
 return '<div class="gcrewbox"><label for="gCrewRole">Crew role</label>'+
 '<select id="gCrewRole" aria-label="Crew role">'+opts(role,[['operator','Operator'],['oiler','Oiler'],['third','Third man']])+'</select>'+
 '<p class="gcrewnote">'+escaped(hint)+'</p></div>';
}
function syncCompletedRole(){
 if(day.status!=='done')return;
 const recorded=data().days.find(x=>x.operatorId===day.operatorId&&x.date===day.date&&x.timeline);
 if(!recorded)return;
 recorded.classId=day.groupId;
 recorded.baseRate=currentGroupWage(day.groupId);
 recorded.timeline.crewRole=crewRole();
}
function subsistenceAmount(kind){return kind==='short'?85:kind==='long'?200:0}
function subsistenceSelect(){
 const selected=day.subsistence||'none';
 return '<div class="gsubarea"><label for="gSubsistence">Subsistence allowance</label>'+
 '<select id="gSubsistence" aria-label="Subsistence allowance">'+opts(selected,[['none','None'],['short','Short / standard — $85 per day'],['long','Long-distance weekend — $200 per day']])+'</select>'+
 '<div class="gsubhint">Short: overnight or qualifying job 45+ miles from home yard. Long: weekend subsistence over 77½ miles. Select only when eligible; travel-pay alternatives may apply.</div></div>'
}
function holidayBanner(){
 if(!api.isHoliday(day.date)&&!day.holidayPay)return '';
 return '<div class="gholiday" role="status" aria-label="Contract holiday, triple time pay">'+
 '<strong>HOLIDAY — TRIPLE TIME (3×)</strong>'+
 '<span>'+(day.holidayPay?'Manually selected':'Contract holiday')+' · 8-hour minimum if worked</span></div>';
}
function payBreakdown(rec,computed){
 const h=computed?.classHours||{},hours={};
 for(const k of ['REG','OT','DT','TT'])hours[k]=Number(h[k])||0;
 const premium=flag=>{
  if(!rec.timeline?.[flag])return 0;
  try{const copy={...rec,timeline:{...rec.timeline,[flag]:false}};return Math.max(0,Number(computed.wages)-Number(api.computeDay(copy).wages))}catch(e){return null}
 };
 return {hours,base:premium('base'),boom:premium('boom')};
}
function liveMoney(){
 const started=day.yardOnly?day.times.work:day.times.yard;
 if(day.status==='done'){
  const saved=data().days.find(x=>x.operatorId===day.operatorId&&x.date===day.date&&x.timeline);
  if(!saved)return {amount:null,note:'Completed workday — saved payroll not found'};
  if(saved.calculationPending)return {amount:null,note:'Pay needs review — check the saved timecard'};
  try{
   const result=api.computeDay(saved);
   const amount=Number(result?.wages);
   if(Number.isFinite(amount)&&amount>=0)return {amount,note:'Final estimated gross · saved workday',final:true,breakdown:payBreakdown(saved,result)};
  }catch(e){}
  return {amount:null,note:'Saved payroll could not be calculated — review this day'};
 }
 if(!started)return {amount:null,note:'Enter your start time to begin'};
 const [yy,mm,dd]=day.date.split('-').map(Number),[hh,mi]=started.split(':').map(Number);
 const start=new Date(yy,mm-1,dd,hh,mi).getTime(),elapsed=(Date.now()-start)/60000;
 if(elapsed<0)return {amount:null,note:'Shift has not started yet'};
 if(elapsed>1440)return {amount:null,note:'Over 24 hours — review the shift date and times'};
 const now=new Date(),whole=Math.floor(elapsed),fraction=elapsed-whole;
 const rec={operatorId:day.operatorId,date:day.date,classId:day.groupId,baseRate:currentGroupWage(day.groupId),
  startTime:started,endTime:'',loggedHours:0,breakMinutes:0,chargeLunch:false,
  hours:{REG:0,OT:0,DT:0,TT:0},manualSplit:false,lattice:day.lattice,wwiw:false,military:false,boom:false,
  crewRole:crewRole(),subsistenceType:'none',subsistenceAmount:0,
  timeline:JSON.parse(JSON.stringify(day))};
 // Calculate two adjacent minute checkpoints with the normal payroll engine,
 // then interpolate by elapsed seconds. No saved times or payroll records change.
 const checkpoint=mins=>{
  const instant=new Date(start+mins*60000);
  const clock=String(instant.getHours()).padStart(2,'0')+':'+String(instant.getMinutes()).padStart(2,'0');
  rec.endTime=clock;rec.loggedHours=mins/60;
  rec.timeline.times[day.yardOnly?'workEnd':'end']=clock;
  for(const flag of ['boom','base','wwiw']){const from=rec.timeline[flag+'Start'],to=rec.timeline[flag+'End'];if(rec.timeline[flag]&&from&&to&&rec.timeline.times[from]&&!rec.timeline.times[to])rec.timeline.times[to]=clock;}
  const result=api.computeDay(rec);
  const amount=Number(result?.wages);
  return Number.isFinite(amount)&&amount>=0?{amount,breakdown:payBreakdown(rec,result)}:null;
 };
 try{
  const low=checkpoint(whole),high=checkpoint(whole+1);
  if(low!==null&&high!==null){
 const mix=(a,b)=>a+(b-a)*fraction,hours={};
 for(const k of ['REG','OT','DT','TT'])hours[k]=mix(low.breakdown.hours[k],high.breakdown.hours[k]);
 const base=low.breakdown.base===null||high.breakdown.base===null?null:mix(low.breakdown.base,high.breakdown.base);
 const boom=low.breakdown.boom===null||high.breakdown.boom===null?null:mix(low.breakdown.boom,high.breakdown.boom);
 return {amount:mix(low.amount,high.amount),breakdown:{hours,base,boom},note:'Live estimated gross · counting every 0.1 second'};
}
 }catch(e){}
 return {amount:Math.max(0,elapsed)*Number(rec.baseRate)/60,note:'Approximate base wages only · premiums/OT not verified'};
}
function updateLiveMoney(){
 const amount=by('gLiveMoney'),note=by('gLiveNote'),heading=by('gLiveHeading'),details=by('gLiveBreakdown');
 if(!amount||!note||!day)return;
 const result=liveMoney();
 if(heading)heading.textContent=result.final?'TOTAL EARNINGS · ESTIMATED GROSS':'LIVE EARNINGS · ESTIMATED GROSS';
 amount.textContent=result.amount===null?'—':'$'+result.amount.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
 const subsistence=subsistenceAmount(day.subsistence||'none');
 const subLine=by('gLiveSubsistence'),totalLine=by('gLiveTotalPay');
 if(subLine)subLine.textContent=String.fromCharCode(36)+subsistence.toFixed(2)+(day.subsistence==='long'?' (Long)':'');
 if(totalLine)totalLine.textContent=result.amount===null?'—':String.fromCharCode(36)+(result.amount+subsistence).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 note.textContent=result.note;
 if(details){const b=result.breakdown;details.style.display=b?'grid':'none';if(b){
 for(const k of ['REG','OT','DT']){const el=by('gLive'+k);if(el)el.textContent=b.hours[k].toFixed(2)+' h'}
  const triple=by('gLiveTT');if(triple)triple.textContent=String.fromCharCode(36)+(b.hours.TT*currentGroupWage(day.groupId)*3).toFixed(2);
 for(const [key,value] of [['Base',b.base],['Boom',b.boom]]){
  const el=by('gLive'+key);
  if(el)el.textContent=value===null?'—':'$'+value.toFixed(2);
 }
 }}
}
function shiftOverview(){
 const a=day.yardOnly?day.times.work:day.times.yard,b=day.yardOnly?day.times.workEnd:day.times.end;
 let hrs='—';
 if(a&&b){
  let span=minutes(b)-minutes(a);
  if(span<=0)span+=1440;
  hrs=(Math.max(0,span-(day.lunch?30:0))/60).toFixed(1).replace(/[.]0$/,'')+' h';
 }
 // Read final hours from the completed payroll record, never from unfinished edits.
 const payroll=data().days.find(x=>x.operatorId===day.operatorId&&x.date===day.date&&x.timeline);
 const completed=day.status==='done'&&payroll&&!payroll.calculationPending;
 const savedHours=completed?Number(payroll.loggedHours):0;
 const hoursLabel=String(Math.round(savedHours*100)/100).replace(/[.]0+$/,'');
 const banner=completed?'<div class="gcomplete-banner" role="status" aria-label="Workday completed"><span class="gcomplete-icon" aria-hidden="true">✓</span><span class="gcomplete-message">WORKDAY COMPLETED</span><strong>'+hoursLabel+' HOURS</strong></div>':'';
 const status=completed?'SAVED':payroll?.calculationPending?'PAY NEEDS REVIEW':Object.keys(day.times||{}).length?'IN PROGRESS':'READY';
 return '<div class="gsummary compact-summary-card'+(completed?' is-complete':'')+'" aria-label="Workday summary">'+
 '<div class="gsummaryhead"><span>'+escaped(day.date)+'</span><span class="gstate">'+status+'</span></div>'+
 banner+
 ''+
 '</div>';
}
function multiYardOptions(){
 if(day.yardOnly)return '';
 return '<div class="groutebox"><label class="gcheck grootetoggle"><input type="checkbox" id="gMultiYard" '+(day.multiYard?'checked':'')+'><span><strong>Multi-yard / crane pickup trip</strong><small>Record travel to another yard, moving the crane to the job, and the return trips.</small></span></label>'+
 (day.multiYard?'<div class="gtwo groutefields">'+field('homeYard','Home yard (e.g., Santa Maria)')+field('pickupYard','Crane yard (e.g., Bakersfield)')+'</div><div class="grouteguide">Home yard → crane yard → jobsite → crane yard → home yard</div>':'')+'</div>';
}
function render(){
const others=Object.values(data().guided).filter(x=>x.operatorId===day.operatorId&&(populated(x)||x.status==='done')).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,14);
by('flowApp').innerHTML='<div class="ghead"><div class="gpagehead"><strong>My Workday</strong></div><button type="button" class="gbutton alt gweek" id="gWeek">Week / Pay Stub</button></div>'+
 shiftOverview()+
'<div id="gLiveCard" role="status" aria-live="off" style="margin:12px 0 20px;padding:18px 22px;border:2px solid #2eaaa4;border-radius:18px;background:linear-gradient(115deg,#113b43,#162d47);color:#eafff8;box-shadow:0 6px 20px #0004"><div id="gLiveHeading" style="font-size:14px;font-weight:700;letter-spacing:1px;color:#9ee9df">LIVE EARNINGS · ESTIMATED GROSS</div><div id="gLiveMoney" style="font-size:clamp(32px,9vw,54px);font-weight:800;line-height:1.35;font-variant-numeric:tabular-nums">—</div><div id="gLiveNote" style="font-size:13px;color:#c0d9e0">Enter your start time to begin</div>'+
'<div id="gLiveBreakdown" style="display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;margin-top:14px;padding-top:12px;border-top:1px solid #50737c;font-size:13px">'+
 [['REG','Regular'],['OT','Overtime'],['DT','Double time'],['TT','Triple time'],['Boom','Boom pay'],['Base','Military base pay'],['Subsistence','Subsistence'],['TotalPay','Total expected pay']].map(([id,label])=>'<div style="min-width:0"><div style="color:#b8d0d8">'+label+'</div><strong id="gLive'+id+'" style="color:#fff;font-variant-numeric:tabular-nums">—</strong></div>').join('')+'</div></div>'+
'<div class="gcard"><div class="ghead"><b>'+escaped(day.date)+'</b><span id="guideStatus">'+(lastSavedOK?'Saved on phone':'SAVE FAILED')+'</span></div>'+
'<label class="gdatefield">Date<input type="date" id="gDate" value="'+escaped(day.date)+'"></label>'+
'<div class="gdaynav"><button type="button" class="gbutton alt" id="gPrevious" aria-label="Previous day">← Prev</button><button type="button" class="gbutton alt" id="gCurrent">Today</button><button type="button" class="gbutton alt" id="gNext" aria-label="Next day">Next →</button></div>'+
 holidayBanner()+
crewRoleControl()+'<label>Pay group (base rate)<select data-field="groupId">'+opts(day.groupId,baseGroupOptions())+'</select></label>'+field('notes','Job / crane')+'</div>'+
'<div class="gcard"><h3><span class="gsectionicon">01</span> Time checkpoints</h3><div class="gsectionhint">Tap NOW while working, or type an earlier time.</div>'+
'<div class="groutebox"><label class="gcheck grootetoggle"><input type="checkbox" id="gYardOnly" '+(day.yardOnly?'checked':'')+'><span><strong>Yard work only — no travel</strong><small>For work at the crane yard: enter Begin crane work and Finish crane work only.</small></span></label></div>'+
multiYardOptions()+visiblePhases().map((x,i)=>clock(x[0],labelFor(x[0]),i+1)).join('')+'</div>'+
'<div class="gcard"><h3><span class="gsectionicon">02</span> Pay conditions</h3>'+check('holidayPay','Holiday pay — triple time (3×) for the paid shift')+check('base','Military base (+$10/hr)')+(day.base?range('base','Time on base'):'')+
check('boom',crewRole()==='third'?'Long boom (third man: no premium)':crewRole()==='oiler'?'Long boom pay ($0.25 per tier)':'Long boom pay ($0.75 per tier)')+(day.boom?'<div class="gtwo">'+field('main','Main boom feet','number')+field('jib','Jib feet','number')+'</div>'+range('boom','Boom working time'):'')+

check('wwiw','WWIW — ironworkers')+(day.wwiw?range('wwiw','Ironworker time'):'')+
check('lunch','Took 30-minute lunch')+(!day.lunch?check('lunchClaim','Charge missed-lunch pay'):'')+subsistenceSelect()+'</div>'+
'<div class="gcard gsavecard">'+(day.status==='done'?'<button type="button" class="gbutton primary" style="width:100%;margin-bottom:12px" id="gExplain">EXPLAIN MY PAY</button>':'')+'<h3><span class="gsectionicon">03</span> Save workday</h3><button type="button" class="gbutton primary" id="gSave">SAVE PROGRESS</button>'+
'<div class="gmuted" id="gSaveResult" aria-live="polite">'+escaped(saveMessage||'Save anytime, even before your shift ends.')+'</div>'+
'<button class="gbutton alt" style="width:100%;margin-top:9px" id="gFinish">Finish day & calculate pay</button>'+
'<div class="gmuted">'+(day.yardOnly?'Yard-only: Finish Day uses crane work start and finish times.':'Travel day: Finish Day needs start-at-yard and return-to-yard times.')+'</div></div>'+
'<div class="gcard"><h3><span class="gsectionicon">04</span> Saved workdays</h3><button type="button" class="gbutton alt" id="gToday">Go to Today</button> '+
others.map(x=>'<div class="gsaved"><button class="gbutton alt" data-open="'+escaped(x.date)+'">'+escaped(x.date)+(x.status==='done'?' ✓':' •')+'</button><button type="button" class="gbutton danger" data-delete="'+escaped(x.date)+'" aria-label="Delete saved workday '+escaped(x.date)+'">Delete</button></div>').join(' ')+
'<div class="gbackuparea"><button type="button" class="gbutton alt" id="gBackup">Back up my workdays</button><span>Export a copy before changing phones or uninstalling.</span></div></div>';
wire();updateLiveMoney();
}

function explainPay(){
 const rec=data().days.find(x=>x.operatorId===day.operatorId&&x.date===day.date&&x.timeline);
 if(!rec||rec.calculationPending){alert('Finish and calculate this day first.');return;}
 const t=rec.timeline,z=t.times||{},calc=api.computeDay(rec);
 const starts=t.yardOnly?'work':'yard',ends=t.yardOnly?'workEnd':'end';
 if(!z[starts]||!z[ends])return alert('Missing time entries.');
 const m=x=>Number(x.slice(0,2))*60+Number(x.slice(3));
 const start=m(z[starts]);let span=m(z[ends])-start;if(span<=0)span+=1440;
 const fmt=n=>{n=(n+1440)%1440;const h=Math.floor(n/60);return (h%12||12)+':'+String(n%60).padStart(2,'0')+(h>=12?' PM':' AM')};
 const range=(a,b)=>{if(!z[a]||!z[b])return null;let x=m(z[a])-start,y=m(z[b])-start;if(x<0)x+=1440;if(y<0)y+=1440;return y>=x&&y<=span?[x,y]:null};
 const base=t.base?range(t.baseStart,t.baseEnd):null,boom=t.boom?range(t.boomStart,t.boomEnd):null,iron=t.wwiw?range(t.wwiwStart,t.wwiwEnd):null;
 const inR=(r,i)=>r&&i>=r[0]&&i<r[1];
 const feet=Number(t.main||0)+Number(t.jib||0),tiers=feet<80?0:1+Math.max(0,Math.ceil((feet-100-.00001)/20));
 const boomAdd=tiers*(t.crewRole==='oiler'?.25:t.crewRole==='third'?0:.75);
 const group=Number(String(rec.classId).split('-').pop()),lattice=t.lattice?(t.crewRole==='oiler'?.5:t.crewRole==='third'?0:group>=6?1:0):0;
 const wd=new Date(day.date+'T12:00:00').getDay(),holiday=api.isHoliday(day.date)||day.holidayPay,special=api.specialDoubleSaturday(day.date);
 const prior=data().days.filter(x=>x!==rec&&x.operatorId===rec.operatorId&&x.date<rec.date&&api.weekOf(x.date)===api.weekOf(rec.date));
 let priorReg=0;for(const p of prior)if(!p.timeline)priorReg+=Number(api.effectiveHours(p).REG||0)*60;
 let count=0,regular=0,items=[],last=null;const totals={REG:0,OT:0,DT:0,TT:0};let baseM=0,boomM=0;
 const lunch=t.lunch?Math.floor((span-30)/2):-1;
 for(let i=0;i<span;i++){
  if(t.lunch&&i>=lunch&&i<lunch+30){if(last){items.push(last);last=null}continue}
  const clock=(start+i)%1440,ww=inR(iron,i),cut=ww?(wd===6?480:600):720;
  let type,why;
  if(holiday){type='TT';why='Holiday'}
  else if(wd===0||special){type='DT';why=wd===0?'Sunday':'Special Saturday'}
  else if(count>=cut){type='DT';why=ww?'Ironworker rule':'Over 12 hours'}
  else if(wd===6||start+i>=1440||clock<360||clock>=1020||regular>=480||priorReg+regular>=2400){type='OT';why=wd===6?'Saturday':clock<360?'Before 6 AM':clock>=1020?'After 5 PM':regular>=480?'After 8 regular hours':'Weekly overtime'}
  else{type='REG';why='Regular';regular++}
  const b=!!inR(base,i),o=!!inR(boom,i),rate=(Number(rec.baseRate)+(b?10:0)+(o?boomAdd:0)+lattice)*({REG:1,OT:1.5,DT:2,TT:3}[type]);
  const work=inR(range('work','workEnd'),i)?'Crane work':inR(range('yard','site'),i)?'Travel to job':inR(range('workEnd','end'),i)?'Return / breakdown':'On duty';
  const key=[type,why,b,o,work,rate].join('|');
  if(last&&last.key===key&&last.end===i)last.end++;else{if(last)items.push(last);last={key,start:i,end:i+1,type,why,b,o,work,rate}}
  totals[type]++;if(b)baseM++;if(o)boomM++;count++;
 }
 if(last)items.push(last);
 const money=n=>String.fromCharCode(36)+Number(n).toFixed(2);
 const hrs=n=>(n/60).toFixed(2);
 const names={REG:'Regular',OT:'Overtime 1.5x',DT:'Double time 2x',TT:'Triple time 3x'};
 const lines=items.map(x=>'<div class="gexrow"><div><b>'+fmt(start+x.start)+' - '+fmt(start+x.end)+'</b><small>'+x.work+' / '+x.why+'</small><small>'+(x.b?'Military base premium ':'')+(x.o?'Boom premium':'')+'</small></div><div class="gexright"><b>'+names[x.type]+'</b><span>'+hrs(x.end-x.start)+' h at '+money(x.rate)+'/h</span><strong>'+money((x.end-x.start)*x.rate/60)+'</strong></div></div>').join('');
 const summary=Object.keys(totals).map(k=>'<div class="gexstat"><span>'+names[k]+'</span><b>'+hrs(totals[k])+' h</b></div>').join('');
 const box=document.createElement('div');box.className='gexoverlay';
 box.innerHTML='<div class="gexpanel"><button class="gbutton alt" id="gExplainClose">Back to workday</button><h2>Explain My Pay</h2><p>'+day.date+'</p><div class="gextotal">Calculated wages <b>'+money(calc.wages)+'</b></div><h3>Workday timeline</h3>'+lines+'<h3>Pay hours</h3>'+summary+'<div class="gexstat"><span>Base premium</span><b>'+hrs(baseM)+' h</b></div><div class="gexstat"><span>'+feet+' ft boom</span><b>'+hrs(boomM)+' h</b></div><p class="gexnote">Premium hours overlap worked hours. Display amounts are rounded; saved payroll totals control.</p></div>';
 document.body.appendChild(box);box.querySelector('#gExplainClose').onclick=()=>box.remove();box.onclick=e=>{if(e.target===box)box.remove()};
}
function minutes(t){return Number(t.slice(0,2))*60+Number(t.slice(3))}
function to24(raw,ampm){let digits=raw.replace(/\D/g,'');if(digits.length===3)digits='0'+digits;
if(!/^\d{4}$/.test(digits))return null;let h=Number(digits.slice(0,2)),m=Number(digits.slice(2));
if(h<1||h>12||m>59)return null;return String(h%12+(ampm==='PM'?12:0)).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function commitTime(code){const text=document.querySelector('[data-time="'+code+'"]');if(!text)return;
if(!text.value.trim()){delete day.times[code];save();return}
const p=document.querySelector('[data-ampm="'+code+'"]').value,v=to24(text.value,p);
if(!v){text.style.borderColor='tomato';return}text.style.borderColor='';day.times[code]=v;save()}
function wire(){
by('gWeek').onclick=()=>{document.body.classList.remove('guided');api.setTab('week')};
by('gToday').onclick=()=>navigate(iso());
by('gCurrent').onclick=()=>navigate(iso());
by('gPrevious').onclick=()=>navigate(shiftDate(day.date,-1));
by('gNext').onclick=()=>navigate(shiftDate(day.date,1));
by('gDate').onchange=e=>navigate(e.target.value||day.date);
by('gCrewRole').onchange=e=>{
 const newRole=e.target.value,previousRole=crewRole();
 if(newRole==='oiler'&&!['group-1','group-2'].includes(day.groupId)){
  if(previousRole!=='oiler')day.operatorGroupBackup=day.groupId;
  day.groupId='group-2';
 }
 if(newRole==='operator'&&['group-1','group-2'].includes(day.groupId)){
  const previous=day.operatorGroupBackup||api.getOperator(day.operatorId)?.classId;
  if(previous&&api.getClass(previous)&&!['group-1','group-2'].includes(previous))day.groupId=previous;
 }
 day.crewRole=newRole;
 syncCompletedRole();save();render();
};
document.querySelectorAll('[data-open]').forEach(x=>x.onclick=()=>navigate(x.dataset.open));
document.querySelectorAll('[data-delete]').forEach(x=>x.onclick=()=>removeSavedDate(x.dataset.delete));
const yardOnly=by('gYardOnly');
yardOnly.onchange=e=>{
 if(!commitPending()){render();return;}
 if(e.target.checked){
  const other=Object.keys(day.times||{}).filter(k=>k!=='work'&&k!=='workEnd');
  if(other.length&&!confirm('Switch to yard-only work? Existing travel and yard checkpoint entries will be cleared, but your work start and finish times will remain.')){
   render();return;
  }
  for(const k of other)delete day.times[k];
  day.multiYard=false;
  day.baseStart='work';day.baseEnd='workEnd';
 }else if(day.baseStart==='work'&&day.baseEnd==='workEnd'){
  day.baseStart='site';day.baseEnd='breakdown';
 }
 day.yardOnly=e.target.checked;
 save();render();
};
const multiYard=by('gMultiYard');
if(multiYard)multiYard.onchange=e=>{
 day.multiYard=e.target.checked;
 save();render();
};
document.querySelectorAll('[data-now]').forEach(x=>x.onclick=()=>{day.times[x.dataset.now]=now();save();render()});
document.querySelectorAll('[data-time]').forEach(x=>{x.onchange=()=>commitTime(x.dataset.time);x.onblur=()=>commitTime(x.dataset.time);x.oninput=()=>{if(/^\d{4}$/.test(x.value))commitTime(x.dataset.time)}});
document.querySelectorAll('[data-ampm]').forEach(x=>x.onchange=()=>commitTime(x.dataset.ampm));
document.querySelectorAll('[data-field]').forEach(x=>{
 const update=()=>{
  day[x.dataset.field]=x.value;
  if(x.dataset.field==='groupId')syncCompletedRole();
  save();
 };
 x.oninput=update;x.onchange=update;
});
document.querySelectorAll('[data-flag]').forEach(x=>x.onchange=()=>{day[x.dataset.flag]=x.checked;if(day.lunch)day.lunchClaim=false;save();render()});
by('gBackup').onclick=()=>{
 if(!commitPending()||!save()){alert('Could not save this workday. Keep the app open.');return}
 const backup=by('backupButton');
 if(backup)backup.click();else alert('Backup is unavailable in this version.');
};
by('gSubsistence').onchange=e=>{
 day.subsistence=e.target.value;
 if(day.status==='done'){
  const logged=data().days.find(x=>x.operatorId===day.operatorId&&x.date===day.date&&x.timeline);
  if(logged){
   logged.subsistenceType=day.subsistence;
   logged.subsistenceAmount=subsistenceAmount(day.subsistence);
   logged.timeline.subsistence=day.subsistence;
  }
 }
 save();
};
const explain=by('gExplain');if(explain)explain.onclick=explainPay;
by('gSave').onclick=saveProgress;
by('gFinish').onclick=finish;
}
function navigate(date,op=day.operatorId){
 if(!date||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return;
 if(!commitPending()){render();return}
 if(!save()){alert('Could not save this day. Keep the app open.');render();return}
 open(date,op);
}
function removeSavedDate(date){
 const op=day.operatorId,k=id(date,op);
 const stored=data(),existing=stored.guided[k];
 if(!existing)return;
 const hasCompleted=stored.days.some(x=>x.operatorId===op&&x.date===date&&x.timeline);
 if(!confirm('Delete '+date+'?'+(hasCompleted?' Its hours will also be removed from the weekly totals.':'')+' This cannot be undone.'))return;
 if(day.date!==date){
   if(!commitPending()||!save()){alert('Could not save your current workday, so nothing was deleted.');return}
 }
 const oldRecord=stored.guided[k];
 const previousDays=stored.days;
 delete stored.guided[k];
 stored.days=previousDays.filter(x=>!(x.operatorId===op&&x.date===date&&x.timeline));
 if(!api.save()){
   stored.guided[k]=oldRecord;
   stored.days=previousDays;
   alert('Delete failed. The saved day has been kept.');return;
 }
 const candidate=Object.values(stored.guided).filter(x=>x.operatorId===op&&(populated(x)||x.status==='done')).sort((a,b)=>b.date.localeCompare(a.date));
 const nextDate=(day.date===date)?(candidate[0]?.date||iso()):day.date;
 saveMessage='Deleted '+date;
 open(nextDate,op,nextDate!==date);
 saveMessage='Deleted '+date;
 render();
 api.renderDayList();api.renderMini();
}
function saveProgress(){
 if(!commitPending())return;
 if(save()){
  const completed=visiblePhases().filter(x=>!!day.times[x[0]]).length;
  saveMessage='Progress saved — '+completed+' time'+(completed===1?'':'s')+' recorded.';
  render();
 }else{
  saveMessage='Could not save. Keep the app open.';
  const msg=by('gSaveResult');if(msg)msg.textContent=saveMessage;
 }
}
function commitPending(){
 for(const input of document.querySelectorAll('[data-time]')){
  const code=input.dataset.time,raw=input.value.trim();
  if(!raw){delete day.times[code];continue;}
  const ap=document.querySelector('[data-ampm="'+code+'"]').value;
  const t=to24(raw,ap);
  if(!t){input.style.borderColor='tomato';input.focus();alert('Check the time entered for '+labelFor(code)+'. Use four digits, such as 0500.');return false}
  day.times[code]=t;
 }
 return true;
}
// Build the single source-of-truth payroll snapshot from an existing timecard.
// Called for initial completion and each subsequent edit to a completed day.
function buildCompletedPayroll(){
 const t=day.times;
 const start=day.yardOnly?t.work:t.yard;
 const end=day.yardOnly?t.workEnd:t.end;
 if(!start||!end)return {error:day.yardOnly?
  'For yard-only work, enter Begin crane work and Finish crane work.':
  'Enter start at yard and return to yard.'};
 let span=minutes(end)-minutes(start);if(span<=0)span+=1440;
 if(span>1440||span-(day.lunch?30:0)<=0)return {error:'Check the start/end times.'};
 for(const [flag,from,to] of [['base','baseStart','baseEnd'],['boom','boomStart','boomEnd'],['wwiw','wwiwStart','wwiwEnd']]){
  if(day[flag]&&(!t[day[from]]||!t[day[to]]))return {error:'Enter both times for '+flag+'.'};
 }
 if(day.boom&&Number(day.main)+Number(day.jib)<80)return {error:'Enter qualifying main boom and jib lengths.'};
 if(day.multiYard){
  let previous=-1;
  for(const [key] of visiblePhases()){
   if(!t[key])continue;
   let offset=minutes(t[key])-minutes(start);
   if(offset<0)offset+=1440;
   if(offset<previous||offset>span)return {error:'Check the travel sequence at '+labelFor(key)+'. Times must go in order between the home-yard start and end.'};
   previous=offset;
  }
 }
 const old=data().days.find(x=>x.operatorId===day.operatorId&&x.date===day.date);
 const record={id:old?.id||Date.now().toString(),operatorId:day.operatorId,date:day.date,classId:day.groupId,
  baseRate:currentGroupWage(day.groupId),startTime:start,endTime:end,
  loggedHours:(span-(day.lunch?30:0))/60,breakMinutes:day.lunch?30:0,chargeLunch:day.lunchClaim,
  manualSplit:false,hours:{REG:0,OT:0,DT:0,TT:0},
  lattice:day.lattice,wwiw:false,military:false,boom:false,boomFeet:null,boomHours:null,
  note:day.notes,crewRole:crewRole(),subsistenceType:day.subsistence||'none',
  subsistenceAmount:subsistenceAmount(day.subsistence),
  timeline:JSON.parse(JSON.stringify(day)),calculationPending:false};
 return {record};
}
function refreshCompletedPayroll(){
 const result=buildCompletedPayroll();
 const old=data().days.find(x=>x.operatorId===day.operatorId&&x.date===day.date);
 if(result.error){
  // Preserve the last calculated amount, but visibly flag it as unverified
  // until the timecard has valid start/end checkpoints again.
  if(old)old.calculationPending=true;
  return result.error;
 }
 if(old)Object.assign(old,result.record);else data().days.push(result.record);
 return '';
}
function finish(){
 if(!commitPending())return;
 if(!save()){alert('Progress could not be saved. Keep the app open.');return}
 const result=buildCompletedPayroll();
 if(result.error)return alert(result.error);
 day.status='done';
 if(!save())return alert('Save failed! Keep this screen open.');
 api.renderDayList();api.renderMini();render();alert('Workday saved. Reopen any time to edit.');
}
function show(){
 if(!day){resumeJob();return}
 render();document.body.classList.add('guided');window.scrollTo?.(0,0);
}
function invalidate(date,op){
 // When the weekly ledger deletes a date, don't let the open workday screen
 // resurrect the stale in-memory timecard the next time it is displayed.
 if(day&&day.date===date&&day.operatorId===op){
  day=fresh(date,op);saveMessage='';render();
 }
}
window.CranePayFlow={open,render,show,invalidate};
by('flowBack').onclick=()=>resumeJob();
function resumeJob(){
 const stored=data(),op=api.getOperatorId();
 const last=stored.lastGuidedWorkday;
 // On a new day, never reopen yesterday's finished shift by default.
 // Preserve an unfinished overnight shift, anchored to its original work date.
 const today=iso();
 if(last&&last.operatorId===op&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(last.date)&&stored.guided[id(last.date,op)]){
  const previous=stored.guided[id(last.date,op)];
  const start=previous.yardOnly?previous.times?.work:previous.times?.yard;
  if(last.date===today){open(today,op);return;}
  if(last.date<today&&previous.status!=='done'&&start&&shiftDate(last.date,1)===today){
   open(last.date,op);return;
  }
  open(today,op);return;
 }
 // Compatibility with older saved data that predates the last-viewed bookmark.
 const unfinished=Object.values(stored.guided).filter(x=>x.operatorId===op&&x.status!=='done'&&populated(x)).sort((a,b)=>b.date.localeCompare(a.date));
 const todayEntry=stored.guided[id(iso(),op)];
 const match=todayEntry&&todayEntry.status!=='done'?todayEntry:unfinished[0];
 open(match?match.date:iso(),op);
}
resumeJob();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&day&&day.status==='done'&&day.date<iso())open(iso(),day.operatorId)});
setInterval(()=>{if(document.body.classList.contains('guided'))updateLiveMoney()},100);
})()
