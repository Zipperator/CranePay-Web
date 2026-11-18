'use strict';
/* Crane Pay Android Drive document sync. Uses Android's Storage Access Framework:
   no web OAuth secrets and no Drive credentials in this app.
   Uses the same CranePay-Sync.json document as the Windows version.
   Never silently resolves conflicting concurrent edits. */
(()=>{
  if (!window.CraneDrive || !window.CraneStorage) return;
  const FILENAME='CranePay-Sync.json', MAX=8*1024*1024;
  const MISSING=Symbol('missing');
  const obj=x=>x!==null && typeof x==='object' && !Array.isArray(x);
  function canon(x) {
    if(x===MISSING)return '#MISSING';
    if(Array.isArray(x))return '['+x.map(canon).join(',')+']';
    if(obj(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}';
    return JSON.stringify(x);
  }
  const eq=(x,y)=>canon(x)===canon(y);
  const valid=x=>obj(x)&&Array.isArray(x.days)&&Array.isArray(x.operators)&&Array.isArray(x.classes)
    &&Array.isArray(x.tiers)&&Array.isArray(x.stubs)&&obj(x.settings);
  const integrity=window.CranePayIntegrity;
  const prepared=x=>{
    if(!x)return x;
    const c=JSON.parse(JSON.stringify(x));
    if(integrity)integrity.repair(c);
    return c;
  };
  function merge(base,local,remote) {
    base=prepared(base);local=prepared(local);remote=prepared(remote);
    const conflicts=[];
    function pick(b,l,r,path) {
      if(eq(l,r))return l;
      if(eq(l,b))return r;
      if(eq(r,b))return l;
      if(path.startsWith('data.days[')&&path.endsWith('.id')&&
          typeof l==='string'&&typeof r==='string'&&l!==r)
        return typeof b==='string'?b:[l,r].sort()[0];
      if(obj(l)&&obj(r)&&(obj(b)||b===MISSING)){
        const result={};
        for(const key of new Set([...Object.keys(b===MISSING?{}:b),...Object.keys(l),...Object.keys(r)])){
          const v=pick(b===MISSING?MISSING:Object.hasOwn(b,key)?b[key]:MISSING,
            Object.hasOwn(l,key)?l[key]:MISSING,Object.hasOwn(r,key)?r[key]:MISSING,path+'.'+key);
          if(v!==MISSING)result[key]=v;
        }
        return result;
      }
      if(Array.isArray(l)&&Array.isArray(r)&&(Array.isArray(b)||b===MISSING)){
        const all=[...(b===MISSING?[]:b),...l,...r];
        if(all.every(x=>obj(x)&&typeof x.id==='string'&&x.id.length>0)){
          // Match by workday identity, not the different IDs created by devices.
          const key=x=>path==='data.days'?(integrity?.dayKey(x)||x.id):x.id;
          const bm=new Map((b===MISSING?[]:b).map(x=>[key(x),x]));
          const lm=new Map(l.map(x=>[key(x),x])),rm=new Map(r.map(x=>[key(x),x]));
          const out=[];
          for(const id of new Set([...rm.keys(),...lm.keys(),...bm.keys()])){
            const v=pick(bm.has(id)?bm.get(id):MISSING,
              lm.has(id)?lm.get(id):MISSING,rm.has(id)?rm.get(id):MISSING,path+'['+id+']');
            if(v!==MISSING)out.push(v);
          }
          return out;
        }
      }
      conflicts.push(path);
      return l;
    }
    return {data:pick(base===null?MISSING:base,local,remote,'data'),conflicts};
  }

  const nav=document.querySelector('main nav')||document.querySelector('nav');
  const target=nav||document.querySelector('main');
  if(!target)return;
  const panel=document.createElement('section');
  panel.id='cp-android-drive';
  panel.style.cssText='margin:12px auto;max-width:900px;padding:14px;border:1px solid #4c758b;border-radius:12px;background:#10283b;color:#e9f9ff;font:13px/1.45 system-ui,sans-serif';
  panel.innerHTML='<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">'+
    '<strong style="margin-right:auto">☁ Google Drive Sync</strong>'+
    '<button type="button" id="cpDriveLink" style="background:#4ce0cc;border:0;border-radius:7px;padding:9px;color:#082d35;font-weight:bold">Select Drive file</button>'+
    '<button type="button" id="cpDriveSyncNow" hidden style="background:#28526e;color:#fff;border:1px solid #669cb2;border-radius:7px;padding:9px">Sync now</button>'+
    '<button type="button" id="cpDriveUnlink" hidden style="background:transparent;color:#d7ecf0;border:1px solid #68889a;border-radius:7px;padding:9px">Unlink</button></div>'+
    '<div role="status" id="cpDriveMessage" style="margin-top:9px">Choose '+FILENAME+' from Google Drive once to link your Windows workdays.</div>'+
    '<div style="color:#afd0de;font-size:11px;margin-top:7px">Sync checks while this app is open. Keep your own workday backups. Drive must be available in Android’s file picker.</div>';
  if(nav)nav.insertAdjacentElement('afterend',panel);else target.insertAdjacentElement('afterbegin',panel);
  const $=id=>document.getElementById(id);
  const link=$('cpDriveLink'),syncNow=$('cpDriveSyncNow'),unlink=$('cpDriveUnlink'),message=$('cpDriveMessage');
  let busy=false,waiting=null,timer=0,lastSync='',syncedOnce=false,changeQueued=false;
  function status(t,warning=false){
    message.textContent=t;message.style.color=warning?'#ffcb9b':'#ddf5fa';
  }
  function refresh(){
    const linked=window.CraneDrive.isLinked();
    link.hidden=linked;syncNow.hidden=!linked;unlink.hidden=!linked;
    link.disabled=busy;syncNow.disabled=busy;unlink.disabled=busy;
  }
  function call(action,...args){
    if(waiting)throw Error('A Drive operation is already in progress.');
    return new Promise((resolve,reject)=>{
      waiting={action,resolve,reject};
      try{window.CraneDrive[action](...args)}catch(e){waiting=null;reject(e)}
    });
  }
  function readLocal(){
    const raw=window.CraneStorage.read();
    if(!raw)throw Error('Phone records are not yet ready.');
    const value=JSON.parse(raw);
    if(!valid(value))throw Error('Phone records are invalid; no changes made.');
    return value;
  }
  function readBase(){
    const raw=window.CraneDrive.getBase();
    if(!raw)return null;
    const base=JSON.parse(raw);
    if(!valid(base))throw Error('Saved sync history is invalid; no changes made.');
    return base;
  }
  async function sync(){
    if(busy||!window.CraneDrive.isLinked())return;
    busy=true;refresh();status('Checking Google Drive…');
    try{
      const before=readLocal(),base=readBase();
      const remoteRaw=await call('readRemote');
      if(typeof remoteRaw!=='string'||remoteRaw.length>MAX)throw Error('Drive data is too large.');
      const remoteFile=JSON.parse(remoteRaw);
      if(remoteFile.app!=='crane-pay-sync'||remoteFile.schema!==1||!valid(remoteFile.data))
        throw Error('Selected file is not valid Crane Pay sync data. Nothing changed.');
      const remote=remoteFile.data;
      let merged;
      if(base===null&&before.days.length===0&&before.stubs.length===0){
        // First setup on an empty phone; explicitly approve replacing default settings.
        if(!syncedOnce&&!eq(before,remote) &&
           !confirm('Use your Windows Crane Pay workdays and settings on this phone? Your phone has no saved workdays.'))
          throw Error('First sync cancelled. Phone records were not changed.');
        merged={data:prepared(remote),conflicts:[]};
      }else merged=merge(base,before,remote);
      if(integrity)integrity.repair(merged.data);
      if(merged.conflicts.length){
        throw Error('Phone and Windows have conflicting changes ('+
          merged.conflicts.slice(0,3).join(', ')+'). Nothing was overwritten; make a backup before resolving.');
      }
      if(!eq(before,readLocal()))throw Error('Phone records changed while syncing. Try again.');
      const download=!eq(merged.data,before),upload=!eq(merged.data,remote);
      if(download){
        if(!window.CraneStorage.write(JSON.stringify(merged.data)))
          throw Error('Could not save downloaded records on phone. Cloud was not changed.');
      }
      if(upload){
        const blob=JSON.stringify({app:'crane-pay-sync',schema:1,data:merged.data,updatedAt:new Date().toISOString()});
        if(blob.length>MAX)throw Error('Merged records are too large.');
        // Native code re-reads the document before writing, and refuses if it changed.
        await call('writeRemote',remoteRaw,blob);
      }
      if(!window.CraneDrive.setBase(JSON.stringify(merged.data)))
        throw Error('Records synced, but sync history could not be saved. Make a backup.');
      syncedOnce=true;lastSync=new Date().toLocaleString();
      if(download){
        status('Windows workdays received. Refreshing the display…');
        setTimeout(()=>window.location.reload(),250);
      }else status(upload?'Changes saved to Google Drive · '+lastSync:'Up to date · '+lastSync);
    }catch(e){
      status('⚠ '+(e.message||String(e)),true);
    }finally{busy=false;refresh();if(changeQueued){changeQueued=false;changed();}}
  }
  function changed(){
    if(!window.CraneDrive.isLinked())return;
    if(busy){changeQueued=true;return;}
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>{timer=0;sync()},3500);
  }
  window.CraneDriveSync={
    nativeResult(action,ok,payload){
      if(!waiting||waiting.action!==action)return;
      const w=waiting;waiting=null;
      if(ok)w.resolve(payload);else w.reject(new Error(payload||'Google Drive operation failed.'));
    },
    localChanged:changed,
    onResume(){if(window.CraneDrive.isLinked())sync();}
  };
  link.addEventListener('click',async()=>{
    if(busy)return;busy=true;refresh();status('In the picker, choose Google Drive → '+FILENAME);
    try{await call('pick');status('Linked. Checking the file…');}
    catch(e){status('⚠ '+e.message,true);}
    finally{busy=false;refresh();}
    if(window.CraneDrive.isLinked())sync();
  });
  syncNow.addEventListener('click',sync);
  unlink.addEventListener('click',()=>{
    if(busy||!confirm('Unlink Google Drive on this phone? Saved phone workdays will remain.'))return;
    window.CraneDrive.unlink();syncedOnce=false;lastSync='';
    status('Drive file unlinked. Phone workdays remain saved here.');refresh();
  });
  refresh();
  if(window.CraneDrive.isLinked()){
    status('Linked to '+FILENAME+'. Checking for updated workdays…');
    setTimeout(sync,1200);
  }
  setInterval(()=>{if(window.CraneDrive.isLinked()&&!busy)sync()},90000);
})();