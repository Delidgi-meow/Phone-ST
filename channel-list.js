import { getMeta, getThreadList } from './state.js';
import { getChannels, getAnonChannel, anonEnabled, markAnonOpened, createMyChannel } from './channels.js';
import { getContactAvatar } from './social.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { bankIcon as icon } from './bank-icons.js';
import { lang } from './i18n.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L = (ru,en) => lang()==='en' ? en : ru;
const searches = new WeakMap();

function sheet(host,title,body) {
    const shade=openPhoneSheet(host,title,body,'chans');shade.classList.add('gp-tg-sheet');
    shade.querySelector('[data-sheet-close]').innerHTML=icon('X');return shade;
}
function create(host,api) {
    const owner=getMeta(), shade=sheet(host,L('Новый канал','New channel'),`<form class="gp-tg-form">
        <label>${L('Название','Name')}<input name="name" maxlength="60" required autocomplete="off"></label>
        <label>${L('Описание','Description')}<textarea name="description" rows="3" maxlength="300"></textarea></label>
        <p class="gp-tg-form-error" role="alert" hidden></p><button type="submit">${L('Создать канал','Create channel')}</button></form>`);
    const form=shade.querySelector('form');
    form.onsubmit=event=>{
        event.preventDefault();if(owner!==getMeta()){closePhoneSheet(shade);return;}
        const name=form.elements.name.value.trim();if(!name)return;
        try{const ch=createMyChannel(name,form.elements.description.value.trim());closePhoneSheet(shade);api.changed();api.open(ch.id);}
        catch(error){const out=form.querySelector('[role=alert]');out.textContent=String(error.message||error);out.hidden=false;}
    };
}
function friends(host,api) {
    const owner=getMeta(), contacts=getThreadList().filter(t=>!t.isGroup);
    const shade=sheet(host,L('Канал знакомого','A contact’s channel'),`<div class="gp-tg-contacts">${contacts.map((t,index)=>{
        const avatar=getContactAvatar(t.key);
        return `<button type="button" data-tg-person="${index}"><span class="gp-tg-contact-avatar">${avatar ? `<img src="${esc(avatar)}" alt="">` : esc(t.name.slice(0,1).toUpperCase())}</span><span><b>${esc(t.name)}</b><small>${esc(t.originalName)}</small></span></button>`;
    }).join('') || `<p>${L('Сначала добавь контакт в телефон','Add a phone contact first')}</p>`}</div>`);
    shade.querySelectorAll('[data-tg-person]').forEach(button=>button.onclick=()=>{
        if(owner!==getMeta()){closePhoneSheet(shade);return;}
        const contact=contacts[Number(button.dataset.tgPerson)];closePhoneSheet(shade);
        api.addPerson(contact.originalName || contact.name);
    });
}
function menu(host,api) {
    const owner=getMeta(), mine=getChannels().mine;
    const options=[['SquarePen',mine ? L('Мой канал','My channel') : L('Создать канал','Create channel'),'own'],['UserPlus',L('Канал знакомого','A contact’s channel'),'person'],['Compass',L('Найти каналы','Discover channels'),'discover']];
    const shade=sheet(host,L('Каналы','Channels'),`<div class="gp-tg-menu">${options.map(([i,label,key])=>`<button type="button" data-tg-action="${key}">${icon(i)}<span>${label}</span></button>`).join('')}</div>`);
    shade.querySelectorAll('[data-tg-action]').forEach(button=>button.onclick=()=>{
        if(owner!==getMeta()){closePhoneSheet(shade);return;}
        const action=button.dataset.tgAction;closePhoneSheet(shade);
        if(action==='own'){if(mine)api.open(mine.id);else create(host,api);}
        if(action==='person')friends(host,api);
        if(action==='discover')api.discover();
    });
}

export function renderChannelList(host,api) {
    const owner=getMeta(), c=getChannels(), query=searches.get(owner)||'';
    const previous=host.querySelector('[data-tg-search]'), focused=previous===document.activeElement, caret=previous?.selectionStart;
    const top=host.querySelector('.gp-tg-scroll')?.scrollTop||0;
    if(anonEnabled())markAnonOpened();
    const sections=[
        [L('Мой канал','My channel'),c.mine ? [c.mine] : []],
        [L('Город','City'),anonEnabled() ? [getAnonChannel()] : []],
        [L('Каналы знакомых','Contacts’ channels'),c.list.filter(ch=>ch.person)],
        [L('Подписки','Subscriptions'),c.list.filter(ch=>!ch.person&&ch.subscribed)],
        [L('Можно подписаться','Discover'),c.list.filter(ch=>!ch.person&&!ch.subscribed)],
    ];
    const row=ch=>{
        const last=ch.posts?.[0], snippet=last ? (last.text || last.imgDesc || L('Фото','Photo')) : (ch.desc || api.subscribers(ch));
        return `<button type="button" class="gp-tg-row" data-tg-channel="${esc(ch.id)}">${api.avatar(ch,'gp-avatar')}<span class="gp-tg-row-copy"><span class="gp-tg-row-top"><b>${esc(ch.name)}</b>${last ? `<time>${esc(api.timeAgo(last.time))}</time>` : ''}</span><span class="gp-tg-row-preview">${esc(snippet)}</span></span>${ch.unread ? `<span class="gp-tg-unread">${ch.unread}</span>` : ''}</button>`;
    };
    host.innerHTML=`<div class="gp-channels-list"><header class="gp-tg-header"><button type="button" data-tg-home>${icon('ChevronLeft')}<span>${L('Назад','Back')}</span></button><h2>${L('Каналы','Channels')}</h2><button type="button" data-tg-menu aria-label="${L('Добавить канал','Add channel')}" ${api.busy ? 'disabled' : ''}>${icon(api.busy ? 'LoaderCircle' : 'SquarePen')}</button></header>
        <label class="gp-tg-search">${icon('Search')}<input type="search" data-tg-search value="${esc(query)}" placeholder="${L('Поиск','Search')}" aria-label="${L('Поиск каналов','Search channels')}" autocomplete="off"></label>
        <div class="gp-tg-scroll">${sections.filter(([,items])=>items.length).map(([name,items])=>`<section class="gp-tg-group"><h3>${name}</h3>${items.map(row).join('')}</section>`).join('')}
        <div class="gp-tg-empty" ${sections.some(([,items])=>items.length) ? 'hidden' : ''}><b>${L('Пока нет каналов','No channels yet')}</b><p>${L('Найди интересные каналы<br>или создай свой.','Find interesting channels<br>or create your own.')}</p><button type="button" data-tg-discover ${api.busy ? 'disabled' : ''}>${L('Найти каналы','Discover channels')}</button></div>
        <p class="gp-tg-no-results" aria-live="polite" hidden>${L('Ничего не найдено','Nothing found')}</p></div></div>`;
    const input=host.querySelector('[data-tg-search]');
    function filter(){
        const term=input.value.trim().toLowerCase().replace(/ё/g,'е');searches.set(owner,input.value);
        let visible=0;
        host.querySelectorAll('.gp-tg-group').forEach(section=>{
            let count=0;section.querySelectorAll('.gp-tg-row').forEach(row=>{row.hidden=!!term&&!row.textContent.toLowerCase().replace(/ё/g,'е').includes(term);if(!row.hidden)count++;});
            section.hidden=!count;visible+=count;
        });
        host.querySelector('.gp-tg-no-results').hidden=!term||!!visible;
        host.querySelector('.gp-tg-empty').hidden=!!term||sections.some(([,items])=>items.length);
    }
    input.oninput=filter;filter();host.querySelector('.gp-tg-scroll').scrollTop=top;
    if(focused){input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret);}catch{/* Search selection differs by browser. */}}
    host.querySelector('[data-tg-home]').onclick=api.home;
    host.querySelector('[data-tg-menu]').onclick=()=>menu(host,api);
    host.querySelector('[data-tg-discover]')?.addEventListener('click',api.discover);
    host.querySelectorAll('[data-tg-channel]').forEach(button=>button.onclick=()=>api.open(button.dataset.tgChannel));
}
