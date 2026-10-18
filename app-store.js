import { PHONE_APPS } from './phone-apps.js';
import { getSettings, isPhoneAppInstalled, setPhoneAppInstalled } from './state.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { lang } from './i18n.js';

const L=(ru,en)=>lang()==='en'?en:ru;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let query='', filter='all';
export function renderAppStore(screen,api){
    const scrollTop=screen.querySelector('.gp-store-scroll')?.scrollTop ?? 0;
    screen.innerHTML=`<section class="gp-store"><header><button type="button" data-store-home aria-label="${L('Назад','Back')}"><i class="fa-solid fa-chevron-left"></i></button><span>App Store</span><small>${PHONE_APPS.filter(app=>isPhoneAppInstalled(app.id)).length} ${L('установлено','installed')}</small></header><div class="gp-store-scroll"><label class="gp-store-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-store-search value="${esc(query)}" placeholder="${L('Найти приложение','Find an app')}"></label><nav class="gp-store-filters">${[['all',L('Все','All')],['installed',L('На телефоне','Installed')],['available',L('Можно установить','Available')]].map(([id,title])=>`<button type="button" data-store-filter="${id}" aria-pressed="${filter===id}">${title}</button>`).join('')}</nav><div class="gp-store-list"></div><p class="gp-store-footnote">${L('Данные сохраняются при удалении. Настройки и App Store — системные приложения.','App data is kept after removal. Settings and App Store are system apps.')}</p></div></section>`;
    const list=screen.querySelector('.gp-store-list');
    function draw(){
        const apps=PHONE_APPS.filter(app=>{
            const installed=isPhoneAppInstalled(app.id);
            return (filter==='all'||(filter==='installed'?installed:!installed))&&`${app.name} ${app.en} ${app.description} ${app.descriptionEn}`.toLowerCase().includes(query.toLowerCase());
        });
        list.innerHTML=apps.map(app=>{const installed=isPhoneAppInstalled(app.id);return `<article class="gp-store-app"><div class="gp-store-icon" style="--store-color:${app.color}"><i class="${['ig','tw','discord','twitch'].includes(app.id)?'fa-brands':'fa-solid'} ${app.icon}"></i></div><div class="gp-store-copy"><b>${esc(L(app.name,app.en))}</b><p>${esc(L(app.description,app.descriptionEn))}</p>${app.essential?`<small>${L('Системное','System app')}</small>`:''}</div><div class="gp-store-actions">${installed?`<button type="button" data-store-open="${app.id}">${L('Открыть','Open')}</button>${!app.essential?`<button type="button" class="gp-store-remove" data-store-remove="${app.id}">${L('Удалить','Remove')}</button>`:''}`:`<button type="button" data-store-install="${app.id}"><i class="fa-solid fa-cloud-arrow-down"></i> ${L('Установить','Get')}</button>`}</div></article>`;}).join('')||`<p class="gp-store-empty">${L('Ничего не нашлось','No apps found')}</p>`;
        list.querySelectorAll('[data-store-open]').forEach(button=>button.onclick=()=>api.open(button.dataset.storeOpen==='events'?'socialhub':button.dataset.storeOpen));
        list.querySelectorAll('[data-store-install],[data-store-remove]').forEach(button=>button.onclick=()=>{
            const install=button.hasAttribute('data-store-install'),id=button.dataset.storeInstall||button.dataset.storeRemove;
            if(!setPhoneAppInstalled(id,install))return;
            if(id==='tinder'&&install)getSettings().tinder=true;
            saveSettingsDebounced();api.changed(id,install);renderAppStore(screen,api);
        });
    }
    screen.querySelector('[data-store-home]').onclick=api.home;
    screen.querySelector('[data-store-search]').oninput=event=>{query=event.target.value;draw();};
    screen.querySelectorAll('[data-store-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.storeFilter;renderAppStore(screen,api);});
    draw();
    screen.querySelector('.gp-store-scroll').scrollTop=scrollTop;
}
