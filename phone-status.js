const batteries=new WeakMap();
export function phoneStatusMarkup(settings={}){
 return '<span class="gp-status-left"><span id="gp-clock">--:--</span></span><span class="gp-status-right"><svg class="gp-cellular" viewBox="0 0 20 16" aria-label="Связь"><rect x="1" y="10" width="3" height="5" rx="1"/><rect x="6" y="7" width="3" height="8" rx="1"/><rect x="11" y="4" width="3" height="11" rx="1"/><rect x="16" y="1" width="3" height="14" rx="1"/></svg><svg class="gp-status-wifi" viewBox="0 0 20 16" aria-label="Wi-Fi"><path d="M2 5a13 13 0 0 1 16 0M5 8.3a8.3 8.3 0 0 1 10 0M8 11.5a3.5 3.5 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="10" cy="14" r="1.2"/></svg><span id="gp-rpdate" class="gp-rpdate" hidden></span><button type="button" class="gp-quiet-indicator" id="gp-quiet-indicator" title="Без звука" aria-label="Без звука" '+(settings.quietMode?'':'hidden')+'><i class="fa-solid fa-bell-slash"></i></button><span class="gp-status-battery" role="img"><i></i><span class="gp-charge-percent" aria-hidden="true"></span></span></span>';
}
export function refreshPhoneStatus(phone,settings={}){
 if(!phone)return;
 const state=batteries.get(phone),raw=state?Math.round(state.level*100):0,level=Math.max(0,Math.min(100,Number.isFinite(raw)?raw:100));
 const percent=phone.querySelector('.gp-charge-percent'),icon=phone.querySelector('.gp-status-battery');
 if(percent)percent.textContent=state?String(level):'—';
 if(icon){icon.style.setProperty('--gp-charge',level+'%');icon.dataset.level=!state?'unknown':level<=20?'low':level<=40?'medium':'full';icon.setAttribute('aria-label',state?(settings.lang==='en'?'Battery ':'Заряд ')+level+'%':(settings.lang==='en'?'Battery unavailable':'Заряд недоступен'));icon.title=state?(settings.lang==='en'?'Device battery':'Заряд устройства'):(settings.lang==='en'?'Battery unavailable':'Браузер не передаёт заряд');}
}
export function bindPhoneBattery(phone,getSettings,nav=navigator){
 if(typeof nav.getBattery!=='function')return;
 nav.getBattery().then(battery=>{batteries.set(phone,battery);const update=()=>refreshPhoneStatus(phone,getSettings());battery.addEventListener('levelchange',update);update();}).catch(()=>{});
}
