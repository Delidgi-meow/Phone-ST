import { clearPhoneHistory } from './phone-cleanup.js';
import { clearPhoneCaches } from './state.js';
import { lang } from './i18n.js';
import { getSettings } from './state.js';
import { saveSettingsDebounced } from '../../../../script.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const I=n=>'<i class="fa-solid '+n+'" aria-hidden="true"></i>';
let panel=null,settingsApi=null;
function mountDataTools(node){
    const host=node.querySelector('[data-settings-behavior] .gp-settings-group-body');if(!host||host.querySelector('.gp-phone-data-group'))return;
    const tools=document.createElement('details');tools.className='gp-phone-data-group';
    tools.innerHTML='<summary>'+L('Данные телефона','Phone data')+'</summary><button type="button" class="gp-save-preset" data-phone-cache-clear>'+L('Обновить кэш телефона','Refresh phone cache')+'</button><button type="button" class="gp-save-preset gp-danger" data-phone-history-clear>'+L('Очистить историю телефона','Clear phone history')+'</button><small>'+L('СМС, ленты и сторис этого чата. Контакты, баланс, заметки, стикеры и текст РП сохранятся.','SMS, feeds and stories in this chat. Contacts, balance, notes, stickers and RP text are kept.')+'</small>';
    tools.querySelector('[data-phone-cache-clear]').onclick=()=>{clearPhoneCaches();settingsApi?.changed?.();};
    tools.querySelector('[data-phone-history-clear]').onclick=async event=>{if(!confirm(L('Очистить СМС, ленты, сторис и кэш телефона в этом чате? Текст РП, контакты, баланс, заметки и стикеры сохранятся.','Clear SMS, feeds, stories and phone cache in this chat? RP text, contacts, balance, notes and stickers will be kept.')))return;const button=event.currentTarget;button.disabled=true;try{await clearPhoneHistory();settingsApi?.home();}catch(error){button.disabled=false;alert(String(error.message||error));}};
    host.append(tools);
}

function storage(){
    let node=document.getElementById('gp-settings-storage');
    if(!node){node=document.createElement('div');node.id='gp-settings-storage';node.hidden=true;document.body.appendChild(node);}
    return node;
}
// Keep one set of bound controls alive between screens, including file pickers and drafts.
export function registerPhoneSettings(node){panel=node;mountDataTools(node);storage().appendChild(node);}
export function parkPhoneSettings(){
    if(!panel||panel.parentElement===storage())return;
    if(panel.contains(document.activeElement))document.activeElement.blur();
    storage().appendChild(panel);
}
export function renderPhoneSettings(screen,api){
    settingsApi=api;
    const mounted=screen.querySelector('.gp-phone-settings-mount');
    if(mounted){if(panel&&panel.parentElement!==mounted)mounted.appendChild(panel);return;}
    parkPhoneSettings();
    screen.innerHTML='<header class="gp-header"><button type="button" class="gp-iconbtn" id="gp-settings-back" aria-label="'+L('На главный экран','Home')+'">'+I('fa-chevron-left')+'</button><h2>'+L('Настройки','Settings')+'</h2><span class="gp-settings-header-space"></span></header>'+
        '<div class="gp-phone-settings"><div class="gp-phone-settings-links">'+
        [['appstore','fa-store',L('App Store','App Store'),L('Установить и удалить приложения','Install and remove apps')],['appearance','fa-palette',L('Оформление телефона','Phone appearance'),L('Тема, иконки и главный экран','Theme, icons and home screen')],['lock','fa-lock',L('Экран блокировки','Lock screen'),L('Часы, дата и отдельные обои','Clock, date and wallpaper')],['chats','fa-comments',L('Оформление переписок','Chat appearance'),L('Общий стандарт обоев и пузырей','Default wallpaper and bubbles')]].map(([id,icon,title,subtitle])=>'<button type="button" data-settings-open="'+id+'"><i class="fa-solid '+icon+'" aria-hidden="true"></i><span><b>'+title+'</b><small>'+subtitle+'</small></span>'+I('fa-chevron-right')+'</button>').join('')+
        '</div><details class="gp-phone-extra-group"><summary>'+L('Сторис','Stories')+'</summary><label class="gp-story-questions-setting"><span class="gp-story-questions-copy"><b id="gp-story-questions-title">'+L('Анонимные вопросы','Anonymous questions')+'</b><small id="gp-story-questions-hint">'+L('В сторис со стикером. Сбор — вручную.','Stories with a sticker. Collected manually.')+'</small></span><span class="gp-story-questions-switch"><input type="checkbox" role="switch" aria-labelledby="gp-story-questions-title" aria-describedby="gp-story-questions-hint" data-story-questions-setting '+(getSettings().storyQuestionsEnabled!==false?'checked':'')+'><span class="gp-story-questions-track" aria-hidden="true"></span></span></label></details><div class="gp-phone-settings-mount"></div></div>';
    screen.querySelector('[data-story-questions-setting]').onchange=e=>{getSettings().storyQuestionsEnabled=e.target.checked;saveSettingsDebounced();};
    screen.querySelector('#gp-settings-back').onclick=api.home;
    screen.querySelector('[data-settings-open="appstore"]').onclick=api.appstore;
    screen.querySelector('[data-settings-open="appearance"]').onclick=api.appearance;
    screen.querySelector('[data-settings-open="lock"]').onclick=api.lock;
    screen.querySelector('[data-settings-open="chats"]').onclick=api.chats;
    const values=document.createElement('button');values.type='button';values.innerHTML=I('fa-sliders')+'<span><b>'+L('Баланс и подписчики','Balance and followers')+'</b><small>'+L('Вручную или по сюжету: банк, Telegram, Instagram, Twitter и OnlyFans','Manual or story-based: bank, Telegram, Instagram, Twitter and OnlyFans')+'</small></span>'+I('fa-chevron-right');values.onclick=api.values;screen.querySelector('.gp-phone-settings-links').prepend(values);
    if(panel)screen.querySelector('.gp-phone-settings-mount').appendChild(panel);
}

