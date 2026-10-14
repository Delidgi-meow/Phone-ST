import { getMeta, getThread, resolveContactKey, renameContact, addManualContact, saveMeta, isSmsBlocked, randomNumber } from './state.js';
import { getContactAvatar, setContactAvatar, handleFor, setContactHandle, compressImage } from './social.js';
import { saveBase64AsFile } from '../../../utils.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { editThreadAppearance } from './thread-appearance.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const I=n=>'<i class="fa-solid '+n+'" aria-hidden="true"></i>';
function avatar(t){const url=getContactAvatar(t.key);return url?'<img src="'+esc(url)+'" alt="">':'<span>'+esc(t.name.slice(0,1).toUpperCase())+'</span>';}
export function openThreadProfile(screen,thread,api){
    const t=getThread(thread.key)||thread,root=getMeta(),src=getContactAvatar(t.key),handle=t.isGroup?'':handleFor('contact:'+t.key,t.originalName||t.name);
    const shade=openPhoneSheet(screen,t.name,'<div class="gp-contact-profile">'+
        '<div class="gp-contact-profile-hero"><div class="gp-contact-profile-backdrop"></div><button type="button" class="gp-profile-avatar" id="gp-profile-avatar" aria-label="'+L('Изменить фото контакта','Change contact photo')+'">'+(t.isGroup?I('fa-users'):avatar(t))+'</button>'+
        '<input type="file" accept="image/*" id="gp-profile-avatar-file" hidden><h1>'+esc(t.name)+'</h1><p>'+esc(t.isGroup?(t.members||[]).join(', '):t.originalName+' · '+handle)+'</p>'+
        '<div class="gp-profile-shortcuts">'+(!t.isGroup?'<button type="button" data-profile-call title="'+L('Звонок','Call')+'" aria-label="'+L('Звонок','Call')+'" '+(!t.number?'disabled':'')+'>'+I('fa-phone')+'</button>':'')+
        '<button type="button" data-profile-wall title="'+L('Оформление чата','Chat appearance')+'" aria-label="'+L('Оформление чата','Chat appearance')+'">'+I('fa-image')+'</button></div></div>'+
        '<div class="gp-profile-fields"><label>'+L('Имя в твоих контактах','Your saved name')+'<input id="gp-profile-name" maxlength="60" value="'+esc(t.name)+'"></label>'+
        (!t.isGroup?'<label>'+L('Ник','Handle')+'<input id="gp-profile-handle" maxlength="21" value="'+esc(handle)+'"></label><label>'+L('Номер телефона','Phone number')+'<div class="gp-profile-number-row"><input id="gp-profile-number" maxlength="60" value="'+esc(t.number)+'"><button type="button" id="gp-profile-number-generate" title="'+L('Сгенерировать номер','Generate number')+'" aria-label="'+L('Сгенерировать номер','Generate number')+'">'+I('fa-rotate-right')+'</button></div></label>':'')+
        '<button class="gp-web-primary" id="gp-profile-save">'+L('Сохранить изменения','Save changes')+'</button></div>'+
        '<div class="gp-profile-actions">'+(!t.isGroup?'<button data-profile-legacy="gp-sms-block">'+I(isSmsBlocked(t.key)?'fa-lock-open':'fa-ban')+' '+L(isSmsBlocked(t.key)?'Разблокировать SMS':'Заблокировать SMS',isSmsBlocked(t.key)?'Unblock SMS':'Block SMS')+'</button>':'<button data-profile-legacy="gp-add-member">'+I('fa-user-plus')+' '+L('Добавить участника','Add a member')+'</button><button data-profile-legacy="gp-kick-member">'+I('fa-user-minus')+' '+L('Убрать участника','Remove a member')+'</button>')+
        (screen.querySelector('#gp-tin-open')?'<button data-profile-legacy="gp-tin-open">'+I('fa-fire')+' '+L('Анкета в Тиндере','Dating profile')+'</button>':'')+
        '<button class="gp-profile-danger" data-profile-legacy="gp-del">'+I('fa-trash-can')+' '+L(t.isGroup?'Удалить чат':'Удалить контакт',t.isGroup?'Delete chat':'Delete contact')+'</button></div></div>','thread:'+t.key);
    shade.classList.add('gp-contact-profile-shade');
    if(src)shade.querySelector('.gp-contact-profile-backdrop').style.backgroundImage='url('+JSON.stringify(src)+')';
    const avatarButton=shade.querySelector('#gp-profile-avatar'),file=shade.querySelector('#gp-profile-avatar-file');
    avatarButton.onclick=()=>file.click();
    file.onchange=async()=>{
        if(!file.files[0])return;avatarButton.disabled=true;
        try{const data=await compressImage(file.files[0],512,.85);const url=await saveBase64AsFile(data.slice(data.indexOf(',')+1),'glassphone','contact_'+Date.now(),'jpeg');
            if(getMeta()!==root||!shade.isConnected)return;setContactAvatar(t.key,url);avatarButton.innerHTML='<img src="'+esc(url)+'" alt="">';shade.querySelector('.gp-contact-profile-backdrop').style.backgroundImage='url('+JSON.stringify(url)+')';
        }catch(e){api.toast(L('Не удалось загрузить фото','Could not upload photo'),'fa-circle-exclamation');}finally{if(shade.isConnected)avatarButton.disabled=false;}
    };
    shade.querySelector('#gp-profile-number-generate')?.addEventListener('click',()=>{shade.querySelector('#gp-profile-number').value=randomNumber();});
    shade.querySelector('#gp-profile-save').onclick=()=>{
        if(getMeta()!==root)return;
        const name=shade.querySelector('#gp-profile-name').value.trim();renameContact(t.key,name);
        if(!t.isGroup){
            const nick=shade.querySelector('#gp-profile-handle').value.trim();if(nick!==handle)setContactHandle(t.key,nick);
            const number=shade.querySelector('#gp-profile-number').value.trim();
            let contact=getMeta().contacts.find(c=>resolveContactKey(c.name)===t.key);if(!contact){addManualContact(t.originalName,number);contact=getMeta().contacts.find(c=>resolveContactKey(c.name)===t.key);}if(contact)contact.number=number;
            saveMeta();
        }
        api.changed();closePhoneSheet(shade);api.render();api.toast(L('Изменения сохранены','Changes saved'),'fa-check');
    };
    shade.querySelector('[data-profile-wall]').onclick=()=>{closePhoneSheet(shade);editThreadAppearance(screen,t.key,api);};
    shade.querySelector('[data-profile-call]')?.addEventListener('click',()=>{closePhoneSheet(shade);api.call(t);});
    shade.querySelectorAll('[data-profile-legacy]').forEach(b=>b.onclick=()=>{const target=screen.querySelector('#'+b.dataset.profileLegacy);closePhoneSheet(shade);target?.click();});
}
export function decorateThreadHeader(screen,t,api){
    const old=screen.querySelector('.gp-thread-header');if(!old)return;
    const back=old.querySelector('#gp-back'),hidden=document.createElement('div');hidden.className='gp-thread-legacy-tools';hidden.hidden=true;
    while(old.firstChild)hidden.appendChild(old.firstChild);
    const header=document.createElement('header');header.className='gp-thread-header gp-thread-float';
    header.innerHTML='<button class="gp-thread-name-pill" id="gp-thread-info"><b>'+esc(t.name)+'</b></button><button class="gp-thread-avatar-pill" id="gp-contact-profile" aria-label="'+L('Профиль и настройки контакта','Contact profile and settings')+'">'+(t.isGroup?I('fa-users'):avatar(t))+'</button>';
    if(back)header.prepend(back);old.replaceWith(header);header.after(hidden);
    const open=()=>openThreadProfile(screen,t,api);
    header.querySelector('#gp-contact-profile').onclick=open;header.querySelector('#gp-thread-info').onclick=open;
}
