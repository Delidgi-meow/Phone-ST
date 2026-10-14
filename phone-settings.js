import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const I=n=>'<i class="fa-solid '+n+'" aria-hidden="true"></i>';
let panel=null;
function storage(){
    let node=document.getElementById('gp-settings-storage');
    if(!node){node=document.createElement('div');node.id='gp-settings-storage';node.hidden=true;document.body.appendChild(node);}
    return node;
}
// Keep one set of bound controls alive between screens, including file pickers and drafts.
export function registerPhoneSettings(node){panel=node;storage().appendChild(node);}
export function parkPhoneSettings(){
    if(!panel||panel.parentElement===storage())return;
    if(panel.contains(document.activeElement))document.activeElement.blur();
    storage().appendChild(panel);
}
export function renderPhoneSettings(screen,api){
    const mounted=screen.querySelector('.gp-phone-settings-mount');
    if(mounted){if(panel&&panel.parentElement!==mounted)mounted.appendChild(panel);return;}
    parkPhoneSettings();
    screen.innerHTML='<header class="gp-header"><button type="button" class="gp-iconbtn" id="gp-settings-back" aria-label="'+L('На главный экран','Home')+'">'+I('fa-chevron-left')+'</button><h2>'+L('Настройки','Settings')+'</h2><span class="gp-settings-header-space"></span></header>'+
        '<div class="gp-phone-settings"><div class="gp-phone-settings-links">'+
        [['appearance','fa-palette',L('Оформление телефона','Phone appearance'),L('Тема, иконки и главный экран','Theme, icons and home screen')],['lock','fa-lock',L('Экран блокировки','Lock screen'),L('Часы, дата и отдельные обои','Clock, date and wallpaper')],['chats','fa-comments',L('Оформление переписок','Chat appearance'),L('Общий стандарт обоев и пузырей','Default wallpaper and bubbles')]].map(([id,icon,title,subtitle])=>'<button type="button" data-settings-open="'+id+'"><i class="fa-solid '+icon+'" aria-hidden="true"></i><span><b>'+title+'</b><small>'+subtitle+'</small></span>'+I('fa-chevron-right')+'</button>').join('')+
        '</div><div class="gp-phone-settings-mount"></div></div>';
    screen.querySelector('#gp-settings-back').onclick=api.home;
    screen.querySelector('[data-settings-open="appearance"]').onclick=api.appearance;
    screen.querySelector('[data-settings-open="lock"]').onclick=api.lock;
    screen.querySelector('[data-settings-open="chats"]').onclick=api.chats;
    if(panel)screen.querySelector('.gp-phone-settings-mount').appendChild(panel);
}

