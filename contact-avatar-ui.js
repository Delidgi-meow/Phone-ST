import { getMeta } from './state.js';
import { generateContactAvatar, cancelImageGen } from './social.js';
import { bankIcon } from './bank-icons.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
export function contactAvatarGeneratorHtml(){
    return `<div class="gp-contact-avatar-tools"><button type="button" data-avatar-toggle title="${L('Сгенерировать аватарку','Generate avatar')}" aria-label="${L('Сгенерировать аватарку','Generate avatar')}">${bankIcon('Sparkles')}</button><div class="gp-contact-avatar-generator" hidden><textarea data-avatar-description rows="2" maxlength="1400" placeholder="${L('Внешность или пожелания · можно оставить пустым','Appearance or preferences · optional')}"></textarea><div><button type="button" data-avatar-generate>${bankIcon('Sparkles')}<span>${L('Сгенерировать','Generate')}</span></button><button type="button" data-avatar-cancel hidden>${L('Отменить','Cancel')}</button></div><small data-avatar-status role="status"></small></div></div>`;
}
export function bindContactAvatarGenerator(host,{contact,onGenerated,onBusy=()=>{},toast}){
    const owner=getMeta(),panel=host.querySelector('.gp-contact-avatar-generator'),toggle=host.querySelector('[data-avatar-toggle]'),generate=host.querySelector('[data-avatar-generate]'),cancel=host.querySelector('[data-avatar-cancel]'),input=host.querySelector('[data-avatar-description]'),status=host.querySelector('[data-avatar-status]');
    if(!panel)return ()=>{};
    let active=null;
    const busy=value=>{generate.disabled=value;input.disabled=value;cancel.hidden=!value;onBusy(value);};
    const stop=()=>{if(!active)return;active.cancelled=true;cancelImageGen(active.key);active=null;busy(false);status.textContent=L('Отменено','Cancelled');};
    toggle.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus();};cancel.onclick=stop;
    generate.onclick=async()=>{
        if(active)return;const target=contact();if(!target.name?.trim()){toast(L('Сначала введи имя персонажа','Enter the character’s name first'),'fa-circle-exclamation');return;}
        const job={key:'contact-avatar:'+Date.now()+':'+Math.random().toString(36).slice(2),cancelled:false};active=job;busy(true);
        const current=()=>active===job&&!job.cancelled&&host.isConnected&&getMeta()===owner;
        try{
            const result=await generateContactAvatar({...target,description:input.value.trim()},{cancelKey:job.key,onStatus:text=>{if(current())status.textContent=text;},isCurrent:current});
            if(current()){await onGenerated(result);status.textContent=L('Аватарка готова','Avatar is ready');}
        }catch(error){if(current()){status.textContent=String(error?.message||error);if(error?.name!=='ImageGenCancelled')toast(status.textContent,'fa-circle-exclamation');}}
        finally{if(active===job){active=null;if(host.isConnected)busy(false);}}
    };
    return stop;
}
