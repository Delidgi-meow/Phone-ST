import { isPhoneAppInstalled, phoneAppForThread } from './state.js';
import { getMeta, getThreadList } from './state.js';
import { getContactAvatar, avatarForAuthor } from './social.js';
import { igThreads, igPerson, igParty, canonicalIgThreadId } from './instagram-state.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { bankIcon as icon } from './bank-icons.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openPhoneSharePicker(host,shot,api){
    const sms=isPhoneAppInstalled('list'), dm=isPhoneAppInstalled('ig');
    if(!sms&&!dm){api.toast(L('Установи Сообщения или Instagram в App Store','Install Messages or Instagram in App Store'),'fa-store');return;}
    const owner=getMeta(),contacts=getThreadList().filter(item=>phoneAppForThread(item.key)==='list');let mode=['ig','st'].includes(shot.app)||(shot.app==='msg'&&shot.sourceApp==='instagram')?'dm':'sms',selected=null;
    if(mode==='sms'&&!sms)mode='dm';if(mode==='dm'&&!dm)mode='sms';
    const shade=openPhoneSheet(host,L('Поделиться','Share'),`<div class="gp-share-picker"><div class="gp-share-preview">${shot.image?`<img src="${esc(shot.image)}" alt="">`:icon(shot.app==='st'?'CircleUserRound':'Image')}<span><b>${esc(shot.author)}</b><small>${esc(shot.text)}</small></span></div><div class="gp-share-tabs"><button type="button" data-share-mode="sms">${L('Сообщения','Messages')}</button><button type="button" data-share-mode="dm">Instagram Direct</button></div><input type="search" data-share-search placeholder="${L('Найти получателя','Find recipient')}"><div class="gp-share-people"></div><textarea data-share-caption rows="2" maxlength="1000" placeholder="${L('Добавить сообщение…','Add a message…')}"></textarea><button type="button" class="gp-share-submit" disabled>${icon('Send')}${L('Отправить','Send')}</button></div>`,api.view);shade.classList.add('gp-share-sheet');
    shade.querySelectorAll('[data-share-mode]').forEach(button=>{if(button.dataset.shareMode==='sms'?!sms:!dm)button.remove();});
    function people(){
        if(mode==='sms')return contacts;
        const result=igThreads().map(igPerson);for(const contact of contacts.filter(item=>!item.isGroup)){const party=igParty(contact);if(!result.some(item=>item.id===party.id))result.push({...party,name:contact.name});}return result;
    }
    function list(){
        const query=shade.querySelector('[data-share-search]').value.toLowerCase(),items=people().filter(item=>(item.name+' '+(item.author||'')).toLowerCase().includes(query));
        shade.querySelectorAll('[data-share-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.shareMode===mode)));
        shade.querySelector('.gp-share-people').innerHTML=items.map((item,index)=>{const key=mode==='sms'?item.key:item.id,src=mode==='sms'?getContactAvatar(item.key):avatarForAuthor(item.ak);return `<button type="button" data-share-recipient="${index}" aria-pressed="${selected==key}"><span class="gp-share-avatar">${src?`<img src="${esc(src)}" alt="">`:item.isGroup?icon('UsersRound'):esc(item.name.slice(0,1).toUpperCase())}</span><span>${esc(item.name)}</span><i></i></button>`;}).join('')||`<p>${L('Получатели не найдены','No recipients found')}</p>`;
        shade.querySelectorAll('[data-share-recipient]').forEach(button=>button.onclick=()=>{const item=items[Number(button.dataset.shareRecipient)];selected=mode==='sms'?item.key:item.id;list();shade.querySelector('.gp-share-submit').disabled=false;});
    }
    shade.querySelectorAll('[data-share-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.shareMode;selected=null;shade.querySelector('.gp-share-submit').disabled=true;list();});
    shade.querySelector('[data-share-search]').oninput=list;
    shade.querySelector('.gp-share-submit').onclick=async()=>{
        if(!selected||getMeta()!==owner||!isPhoneAppInstalled(mode==='sms'?'list':'ig'))return;const person=people().find(item=>mode==='sms'?item.key===selected:canonicalIgThreadId(item.id)===canonicalIgThreadId(selected));if(!person)return;
        const note=shade.querySelector('[data-share-caption]').value.trim(),destination=mode;closePhoneSheet(shade);
        try{if(destination==='sms')await api.sms(person.key,note,shot);else await api.dm(person,note,shot);}catch(error){if(getMeta()===owner)api.toast(String(error.message||error),'fa-circle-exclamation');}
    };
    list();
}
