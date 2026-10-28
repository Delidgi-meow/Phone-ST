import { getMeta, getThreadList } from './state.js';
import { isDeviceContactBlocked, overrideDeviceContactBlock } from './state.js';
import { openStickerPicker } from './sticker-picker.js';
import { getInstagram, igThreads, igThread, igParty, igPerson, igUnread, igUnreadTotal, markIgRead, igActivityUnread, markIgActivityRead, ensureIgThread, igEventText, canonicalIgThreadId } from './instagram-state.js';
import { sendIgDm, igDmBusy, igDmRetryMessage, retryIgDm } from './instagram.js';
import { getUserName, avatarForAuthor, handleFor, timeAgo } from './social.js';
import { bankIcon as icon } from './bank-icons.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';
import { messageForwardHtml, forwardMessageSnapshot } from './message-forward.js';
import { bindMessageForwarding } from './message-forward-ui.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=count=>count?'<i class="gp-insta-badge">'+(count>9?'9+':count)+'</i>':'';
const ava=(name,src,cls='')=>'<span class="gp-insta-avatar '+cls+'">'+(src?'<img src="'+esc(src)+'" alt="">':esc((name||'?').slice(0,1).toUpperCase()))+'</span>';
export function instagramHeader(){return `<header class="gp-insta-header"><button type="button" data-insta-home aria-label="${L('На главный экран','Home')}">${icon('ChevronLeft')}</button><h1>Instagram</h1><button type="button" data-insta-activity aria-label="${L('Уведомления Instagram','Instagram notifications')}">${icon('Heart')}${badge(igActivityUnread())}</button><button type="button" data-insta-inbox aria-label="${L('Direct','Direct')}">${icon('Send')}${badge(igUnreadTotal())}</button></header>`;}
export function instagramNav(profile=false){return `<nav class="gp-insta-nav" aria-label="Instagram"><button type="button" data-insta-feed aria-label="${L('Лента','Feed')}" ${profile?'':'aria-current="page"'}>${icon('House')}</button><button type="button" id="gp-ig-gen" aria-label="${L('Найти новые публикации','Discover posts')}">${icon('Compass')}</button><button type="button" id="gp-ig-new" aria-label="${L('Новый пост','New post')}">${icon('SquarePlus')}</button><button type="button" data-insta-menu aria-label="${L('Ещё','More')}">${icon('Ellipsis')}</button><button type="button" data-insta-profile aria-label="${L('Мой профиль','My profile')}" ${profile?'aria-current="page"':''}>${ava(getUserName(),avatarForAuthor('user'))}</button></nav>`;}
export function bindInstagramNavigation(host,api){
    host.querySelector('[data-insta-home]')?.addEventListener('click',api.home);
    host.querySelector('[data-insta-feed]')?.addEventListener('click',api.feed);
    host.querySelector('[data-insta-profile]')?.addEventListener('click',api.profile);
    host.querySelector('[data-insta-inbox]')?.addEventListener('click',api.inbox);
    host.querySelector('[data-insta-activity]')?.addEventListener('click',api.activity);
    host.querySelector('[data-insta-menu]')?.addEventListener('click',()=>{
        const sheet=openPhoneSheet(host,L('Instagram','Instagram'),`<div class="gp-insta-menu"><button type="button" data-insta-reload>${icon('RotateCw')}${L('Обновить ленту','Refresh feed')}</button><button type="button" data-insta-social>${icon('ChartNoAxesCombined')}${L('Статистика и задания','Insights and tasks')}</button><button type="button" data-insta-story>${icon('CirclePlus')}${L('Добавить историю','Add story')}</button></div>`,'ig');sheet.classList.add('gp-insta-sheet');
        for(const [key,action]of [['reload',api.refresh],['social',api.social],['story',api.story]])sheet.querySelector('[data-insta-'+key+']').onclick=()=>{closePhoneSheet(sheet);action();};
    });
}
export function instagramProfile(posts){
    const mine=posts.filter(post=>post.ak==='user'),profile=getMeta().social?.socialProfiles?.instagram||{};
    return `<div class="gp-insta-profile"><div class="gp-insta-profile-top">${ava(getUserName(),avatarForAuthor('user'))}<div><b>${mine.length}</b><span>${L('публикаций','posts')}</span></div><div><b>${profile.followers||0}</b><span>${L('подписчиков','followers')}</span></div></div><b>${esc(getUserName())}</b><small>${esc(handleFor('user',getUserName()))}</small><div class="gp-insta-profile-grid">${mine.map(post=>`<button type="button" data-open-ig2="${esc(post.id)}" aria-label="${esc(post.caption||post.imgDesc||L('Открыть публикацию','Open post'))}">${post.image?`<img src="${esc(post.image)}" alt="">`:`${icon('Image')}<span>${esc(post.caption||post.imgDesc||'')}</span>`}</button>`).join('')}</div>${mine.length?'':`<p class="gp-insta-empty">${L('Здесь будут твои публикации','Your posts will appear here')}</p>`}</div>`;
}
function newMessage(host,api){
    const owner=getMeta(), contacts=getThreadList().filter(thread=>!thread.isGroup), existing=igThreads();
    const parties=[...existing.map(igPerson)];for(const contact of contacts){const party=igParty(contact);if(!parties.some(item=>item.id===party.id))parties.push({...party,name:contact.name});}
    const shade=openPhoneSheet(host,L('Новое сообщение','New message'),`<div class="gp-insta-people">${parties.map((party,index)=>`<button type="button" data-insta-party="${index}">${ava(party.name,avatarForAuthor(party.ak))}<span>${esc(party.name)}</span></button>`).join('')||`<p>${L('Добавь контакт или напиши автору публикации','Add a contact or message a post’s author')}</p>`}</div>`,'igdms');shade.classList.add('gp-insta-sheet');
    shade.querySelectorAll('[data-insta-party]').forEach(button=>button.onclick=()=>{if(getMeta()!==owner)return;const thread=ensureIgThread(parties[Number(button.dataset.instaParty)]);closePhoneSheet(shade);api.thread(thread.id);});
}
export function renderInstagramInbox(host,api){
    host.innerHTML=`<div class="gp-instagram-shell"><header class="gp-insta-subheader"><button type="button" data-insta-back aria-label="${L('Назад','Back')}">${icon('ChevronLeft')}</button><h2>${esc(handleFor('user',getUserName()))}</h2><button type="button" data-insta-new-dm aria-label="${L('Новое сообщение','New message')}">${icon('SquarePen')}</button></header><div class="gp-insta-scroll"><h3 class="gp-insta-section">${L('Сообщения','Messages')}</h3>${igThreads().map(thread=>{const person=igPerson(thread),last=thread.messages?.at(-1),unread=igUnread(thread);return `<button type="button" class="gp-insta-dm-row ${unread?'is-unread':''}" data-insta-thread="${esc(thread.id)}">${ava(person.name,avatarForAuthor(thread.ak))}<span><b>${esc(person.name)}</b><small>${esc(last?((last.dir==='out'?L('Вы: ','You: '):'')+(last.text||L('Публикация','Shared post'))):L('Начать переписку','Start a conversation'))}</small></span>${unread?'<i class="gp-insta-dot"></i>':last?`<time>${esc(timeAgo(last.at))}</time>`:''}</button>`;}).join('')||`<div class="gp-insta-empty">${icon('Send')}<b>${L('Твой Direct','Your Direct')}</b><p>${L('Ответы на истории и личные сообщения появятся здесь.','Story replies and private messages appear here.')}</p><button type="button" data-insta-start>${L('Написать сообщение','Send a message')}</button></div>`}</div></div>`;
    host.querySelector('[data-insta-back]').onclick=api.back;host.querySelector('[data-insta-new-dm]').onclick=()=>newMessage(host,api);host.querySelector('[data-insta-start]')?.addEventListener('click',()=>newMessage(host,api));
    host.querySelectorAll('[data-insta-thread]').forEach(button=>button.onclick=()=>api.thread(button.dataset.instaThread));
}
const drafts=new WeakMap();
function draftMap(){const owner=getMeta();if(!drafts.has(owner))drafts.set(owner,new Map());return drafts.get(owner);}
export function renderInstagramThread(host,id,api){
    const thread=igThread(id);if(!thread){api.back();return;}const owner=getMeta(),person=igPerson(thread),map=draftMap(),busy=igDmBusy(thread),old=host.querySelector('[data-insta-draft]'),focused=old===document.activeElement,caret=old?.selectionStart;
    id=thread.id;
    for(const [previous,text]of [...map])if(previous!==id&&canonicalIgThreadId(previous)===id){
        if(text&&map.get(id)!==text)map.set(id,[map.get(id),text].filter(Boolean).join('\n'));
        map.delete(previous);
    }
    markIgRead(id);
    host.innerHTML=`<div class="gp-instagram-shell"><header class="gp-insta-subheader"><button type="button" data-insta-back aria-label="${L('Назад','Back')}">${icon('ChevronLeft')}</button>${ava(person.name,avatarForAuthor(thread.ak),'is-small')}<div><h2>${esc(person.name)}</h2><small>${esc(thread.handle||handleFor(thread.ak,thread.author))}</small></div></header><div class="gp-insta-conversation">${thread.messages.map(message=>`<div class="gp-insta-dm-message ${message.dir==='out'?'is-out':'is-in'}">${message.share?`<button type="button" class="gp-insta-shared" data-insta-shared="${esc(message.id)}">${message.share.image?`<img src="${esc(message.share.image)}" alt="">`:icon(message.share.app==='st'?'CircleUserRound':'Image')}<span><small>${message.share.app==='st'?L('История','Story'):L('Публикация','Post')} · ${esc(message.share.author)}</small><b>${esc(message.share.text||L('Фото','Photo'))}</b></span></button>`:''}${message.text?`<span>${esc(message.text)}</span>`:''}<time>${esc(new Date(message.at).toLocaleTimeString(lang()==='en'?'en-GB':'ru-RU',{hour:'2-digit',minute:'2-digit'}))}</time></div>`).join('')}${busy?`<div class="gp-insta-typing" role="status">${esc(person.name)} ${L('печатает…','is typing…')}</div>`:''}</div><form class="gp-insta-compose"><textarea data-insta-draft rows="1" placeholder="${L('Сообщение…','Message…')}" maxlength="2000">${esc(map.get(id)||'')}</textarea><button type="submit" aria-label="${L('Отправить','Send')}" ${busy?'disabled':''}>${icon('Send')}</button></form></div>`;
    host.querySelectorAll('[data-insta-shared]').forEach(button => {
        const share = thread.messages.find(message => message.id === button.dataset.instaShared)?.share;
        if (share?.app !== 'msg') return;
        const card = document.createElement('div');
        card.innerHTML = messageForwardHtml(share, L('Пересланные сообщения', 'Forwarded messages'));
        button.replaceWith(card.firstElementChild || card);
    });
    const input=host.querySelector('[data-insta-draft]');input.oninput=()=>map.set(id,input.value);
    if(focused){input.focus({preventScroll:true});input.setSelectionRange(caret,caret);}
    const scroll=host.querySelector('.gp-insta-conversation'),retry=igDmRetryMessage(thread);
    if(retry){
        const row=document.createElement('div');row.className='gp-insta-retry';
        row.innerHTML=`<span>${retry.replyState==='failed'?L('Ответ не получен','Couldn’t get a reply'):L('Нет ответа на последнее сообщение','No reply to the last message')}</span><button type="button" data-insta-retry>${icon('RotateCw')}${L('Повторить ответ','Retry reply')}</button>`;
        scroll.appendChild(row);
        row.querySelector('button').onclick=async()=>{const pending=retryIgDm(id,retry.id);api.render();try{await pending;}catch(error){if(getMeta()===owner)api.toast(String(error.message||error),'fa-circle-exclamation');}finally{if(getMeta()===owner)api.render();}};
    }
    scroll.scrollTop=scroll.scrollHeight;
    host.querySelector('[data-insta-back]').onclick=api.back;
    if(isDeviceContactBlocked('ig',thread.contactKey||thread.author)){const unblock=document.createElement('button');unblock.type='button';unblock.className='gp-insta-unblock';unblock.textContent=L('Разблокировать','Unblock');unblock.onclick=()=>{overrideDeviceContactBlock('ig',thread.contactKey||thread.author,false);api.render();};host.querySelector('.gp-insta-subheader').appendChild(unblock);}
    host.querySelectorAll('.gp-insta-dm-message').forEach((row,index)=>{if(thread.messages[index]?.actor){const actor=document.createElement('small');actor.className='gp-device-actor';actor.textContent=L('С телефона отправил(а): ','Sent using this phone by: ')+thread.messages[index].actor;row.prepend(actor);}});
    const stickerButton=document.createElement('button');stickerButton.type='button';stickerButton.className='gp-insta-sticker-button';stickerButton.setAttribute('aria-label',L('Стикеры','Stickers'));stickerButton.innerHTML=icon('Smile');
    host.querySelector('.gp-insta-compose').prepend(stickerButton);
    stickerButton.onclick=()=>{if(igDmBusy(thread))return;openStickerPicker(host,{phoneApp:'ig',view:'igdm:'+id,selected:async attachment=>{
        if(getMeta()!==owner)return;const pending=sendIgDm(id,'',{app:'sticker',id:attachment.stickerId,author:getUserName(),text:attachment.description,image:attachment.image});api.render();try{await pending;}catch(error){if(getMeta()===owner)api.toast(String(error.message||error),'fa-circle-exclamation');}finally{if(getMeta()===owner)api.render();}
    }});};
    const send=async()=>{const text=input.value.trim();if(!text||igDmBusy(thread))return;map.delete(id);const pending=sendIgDm(id,text);api.render();try{await pending;}catch(error){if(getMeta()===owner)api.toast(String(error.message||error),'fa-circle-exclamation');}finally{if(getMeta()===owner)api.render();}};
    host.querySelector('form').onsubmit=event=>{event.preventDefault();send();};input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}};
    host.querySelectorAll('[data-insta-shared]').forEach(button=>button.onclick=()=>{const share=thread.messages.find(message=>message.id===button.dataset.instaShared)?.share;if(share&&!['sticker','meme'].includes(share.app))api.openShare(share);});
    host.querySelectorAll('[data-insta-shared]').forEach(button=>{const share=thread.messages.find(message=>message.id===button.dataset.instaShared)?.share;if(['sticker','meme'].includes(share?.app)){button.classList.add('gp-chat-'+share.app);const label=button.querySelector('small');if(label)label.textContent=share.app==='sticker'?L('Стикер','Sticker'):L('Мем','Meme');}});
    bindMessageForwarding(host, {
        view: 'igdm:' + id, header: host.querySelector('.gp-insta-subheader'), composer: host.querySelector('.gp-insta-compose'),
        rows: host.querySelectorAll('.gp-insta-dm-message'), messages: thread.messages, key: message => message.id,
        snapshot: message => forwardMessageSnapshot(message, { user: getUserName(), peer: thread.author }),
        sourceApp: 'instagram', peer: person.name, forward: api.forward,
    });
}
export function renderInstagramActivity(host,api){
    const activity=getInstagram().activity;markIgActivityRead();
    host.innerHTML=`<div class="gp-instagram-shell"><header class="gp-insta-subheader"><button type="button" data-insta-back aria-label="${L('Назад','Back')}">${icon('ChevronLeft')}</button><h2>${L('Уведомления','Notifications')}</h2></header><div class="gp-insta-scroll">${activity.map(event=>`<button type="button" class="gp-insta-activity-row" data-insta-event="${esc(event.id)}">${ava(event.author,avatarForAuthor(event.ak))}<span><b>${esc(event.author)}</b> ${esc(igEventText(event).replace(event.author+': ',''))}<time>${esc(timeAgo(event.at))}</time></span>${icon(event.kind==='dm'?'Send':event.kind==='comment'?'MessageCircle':'Heart')}</button>`).join('')||`<div class="gp-insta-empty">${icon('Heart')}<b>${L('Пока всё спокойно','All quiet for now')}</b><p>${L('Лайки, комментарии, подписки и ответы на истории появятся здесь.','Likes, comments, follows and story replies appear here.')}</p></div>`}</div></div>`;
    host.querySelector('[data-insta-back]').onclick=api.back;host.querySelectorAll('[data-insta-event]').forEach(button=>button.onclick=()=>{const event=activity.find(item=>item.id===button.dataset.instaEvent);if(event?.target==='dm')api.thread(event.targetId);else if(event?.target==='story')api.story(event.targetId);else if(event?.target==='post')api.post(event.targetId);});
}
