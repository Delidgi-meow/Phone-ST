import { getMeta, getThread, getSettings } from './state.js';
import { getCalls, acceptPhoneCall, endPhoneCall } from './calls.js';
import { getContactAvatar } from './social.js';
import { bankIcon as icon } from './bank-icons.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let viewportBound=false;

function position(){
    const host=document.getElementById('gp-notifications');if(!host)return;
    const viewport=window.visualViewport;
    host.style.setProperty('--gp-notify-x',((viewport?.offsetLeft||0)+(viewport?.width||window.innerWidth)/2)+'px');
    host.style.setProperty('--gp-notify-y',((viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)/2)+'px');
    host.style.maxHeight=Math.max(160,(viewport?.height||window.innerHeight)*.8)+'px';
}
export function notificationHost(){
    let host=document.getElementById('gp-notifications');
    if(!host){host=document.createElement('div');host.id='gp-notifications';host.setAttribute('aria-label',L('Уведомления телефона','Phone notifications'));document.body.append(host);}
    const theme=getComputedStyle(document.getElementById('gp-phone')||document.documentElement);
    for(const property of ['--gp-accent-a','--gp-accent-b','--gp-text','--gp-text-dim','--gp-border','--gp-border-soft','--gp-home-sheet-bg','--gp-glass','--gp-glass-strong']){
        const value=theme.getPropertyValue(property).trim();if(value)host.style.setProperty(property,value);
    }
    if(!viewportBound){viewportBound=true;window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);}
    position();return host;
}
export function clearPhoneNotifications(){
    document.getElementById('gp-notifications')?.querySelectorAll('.gp-toast,.gp-call-notification').forEach(element=>{element.cleanup?.();element.remove();});
}

export function showIncomingCallNotice(call,api){
    if(!call||call.status!=='ringing'||!getSettings().isEnabled||getSettings().quietMode)return;
    const host=notificationHost();
    if([...host.querySelectorAll('[data-phone-call]')].some(el=>el.dataset.phoneCall===call.id))return;
    const owner=getMeta(), card=document.createElement('section'), image=getContactAvatar(call.key);
    card.className='gp-call-notification';card.dataset.phoneCall=call.id;
    card.setAttribute('role','dialog');card.setAttribute('aria-label',L('Входящий звонок','Incoming call'));card.setAttribute('aria-live','polite');
    card.innerHTML=`<div class="gp-call-notice-top"><span class="gp-call-notice-avatar">${image?`<img src="${esc(image)}" alt="">`:esc(call.name.slice(0,1).toUpperCase())}</span><span class="gp-call-notice-person"><small>${icon('PhoneIncoming')}${L('Входящий звонок','Incoming call')}</small><b data-caller-name>${esc(getThread(call.key)?.name||call.name)}</b>${call.reason?`<span>${esc(call.reason)}</span>`:''}</span><span class="gp-call-notice-pulse" aria-hidden="true"></span></div>
        <p class="gp-call-notice-error" role="alert" hidden></p><div class="gp-call-notice-actions"><button type="button" data-call-decline>${icon('PhoneOff')}<span>${L('Отклонить','Decline')}</span></button><button type="button" data-call-accept>${icon('PhoneIncoming')}<span>${L('Принять','Accept')}</span></button></div>`;
    const remove=()=>{clearInterval(timer);card.remove();};
    const current=()=>getMeta()===owner&&getCalls().history.some(item=>item.id===call.id&&item.status==='ringing');
    const buttons=[...card.querySelectorAll('button')];
    card.querySelector('[data-call-decline]').onclick=()=>{
        if(!current()){remove();return;}
        endPhoneCall(call.id);remove();api.changed();
    };
    card.querySelector('[data-call-accept]').onclick=async()=>{
        if(!current()){remove();return;}
        buttons.forEach(button=>button.disabled=true);
        try{
            const pending=acceptPhoneCall(call.id);remove();api.open(call.id);api.changed();
            await pending;
            if(getMeta()===owner)api.changed();
        }catch(error){
            if(getMeta()===owner){remove();api.error(String(error.message||error));}
        }
    };
    host.prepend(card);
    const timer=setInterval(()=>{
        if(!current()||!getSettings().isEnabled||getSettings().quietMode){remove();if(getMeta()===owner)api.changed();return;}
        const name=getThread(call.key)?.name||call.name;
        if(card.querySelector('[data-caller-name]').textContent!==name)card.querySelector('[data-caller-name]').textContent=name;
    },1000);
    card.cleanup=()=>clearInterval(timer);
}
