const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const batteries=new WeakMap();
export function phoneStatusMarkup(settings={}){
 return '<span class="gp-status-left"><span id="gp-clock">--:--</span><span class="gp-carrier" data-gp-content>'+esc(settings.statusLabel||'')+'</span></span><span class="gp-status-right"><span class="gp-cellular" aria-label="Signal"><i></i><i></i><i></i><i></i></span><span class="gp-status-wifi" aria-label="Wi-Fi"></span><span id="gp-rpdate" class="gp-rpdate" hidden></span><button type="button" class="gp-quiet-indicator" id="gp-quiet-indicator" title="Без звука" aria-label="Без звука" '+(settings.quietMode?'':'hidden')+'><i class="fa-solid fa-bell-slash"></i></button><span class="gp-charge-percent"></span><span class="gp-status-battery" role="img"><i></i></span><button class="gp-close" id="gp-close" title="Закрыть" aria-label="Закрыть">×</button></span>';
}
export function refreshPhoneStatus(phone,settings={}){
 if(!phone)return;const carrier=phone.querySelector('.gp-carrier');if(carrier)carrier.textContent=settings.statusLabel||'';
 const state=batteries.get(phone),raw=state?Math.round(state.level*100):Number(settings.statusBattery??100),level=Math.max(0,Math.min(100,Number.isFinite(raw)?raw:100));
 const percent=phone.querySelector('.gp-charge-percent'),icon=phone.querySelector('.gp-status-battery');
 if(percent)percent.textContent=level+'%';
 if(icon){icon.style.setProperty('--gp-charge',level+'%');icon.dataset.level=level<=20?'low':level<=40?'medium':'full';icon.setAttribute('aria-label',(settings.lang==='en'?'Battery ':'Заряд ')+level+'%');icon.title=state?(settings.lang==='en'?'Device battery':'Заряд устройства'):(settings.lang==='en'?'Phone appearance setting':'Заряд из настроек оформления');}
}
export function bindPhoneBattery(phone,getSettings,nav=navigator){
 if(typeof nav.getBattery!=='function')return;
 nav.getBattery().then(battery=>{batteries.set(phone,battery);const update=()=>refreshPhoneStatus(phone,getSettings());battery.addEventListener('levelchange',update);update();}).catch(()=>{});
}
