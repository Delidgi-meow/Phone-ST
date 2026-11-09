import { getSettings, getMeta, saveMeta, resolveContactKey } from './state.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { saveBase64AsFile } from '../../../utils.js';
import { compressImage } from './social.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const I=n=>'<i class="fa-solid '+n+'" aria-hidden="true"></i>';
const number=(value,fallback,max=1)=>Number.isFinite(Number(value))&&value!==null&&value!==''?Math.max(0,Math.min(max,Number(value))):fallback;
const color=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?value.toLowerCase():'';
const palettes=[
    {name:()=>L('Тема телефона','Phone theme'),incomingColor:'',outgoingColor:''},
    {name:()=>L('Розовый','Rose'),incomingColor:'#29272d',outgoingColor:'#b75d90'},
    {name:()=>L('Сиреневый','Lilac'),incomingColor:'#29272d',outgoingColor:'#7870c4'},
    {name:()=>L('Океан','Ocean'),incomingColor:'#252c35',outgoingColor:'#497fac'},
    {name:()=>L('Мята','Mint'),incomingColor:'#26332f',outgoingColor:'#71b49b'},
    {name:()=>L('Золото','Gold'),incomingColor:'#302c26',outgoingColor:'#d8b67c'},
    {name:()=>L('Облако','Cloud'),incomingColor:'#d2d4db',outgoingColor:'#9fb6d9'}
];
function overrides(){const m=getMeta();if(!m.threadAppearance||typeof m.threadAppearance!=='object'||Array.isArray(m.threadAppearance))m.threadAppearance={};return m.threadAppearance;}
function raw(value){
    const v=value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};
    // Older versions stored only image/dim. An empty image meant the phone wallpaper.
    if(Object.hasOwn(v,'image')&&!Object.hasOwn(v,'wallpaperMode'))v.wallpaperMode=v.image?'image':'phone';
    return v;
}
function normalize(value){
    const v=raw(value);
    return {image:typeof v.image==='string'?v.image:'',wallpaperMode:['phone','image','none'].includes(v.wallpaperMode)?v.wallpaperMode:'phone',dim:number(v.dim,0,.9),
        incomingColor:color(v.incomingColor),outgoingColor:color(v.outgoingColor),incomingOpacity:number(v.incomingOpacity,.9),outgoingOpacity:number(v.outgoingOpacity,.94)};
}
function globalAppearance(){return normalize(getSettings().messageAppearance);}
function ownAppearance(key){const k=resolveContactKey(key),local=overrides();return Object.hasOwn(local,k)?local[k]:Object.entries(local).find(([old])=>resolveContactKey(old)===k)?.[1];}
function removeOwn(key){const k=resolveContactKey(key);for(const old of Object.keys(overrides()))if(old===k||resolveContactKey(old)===k)delete overrides()[old];}
export function threadAppearance(key){return normalize({...raw(getSettings().messageAppearance),...raw(ownAppearance(key))});}
function imageUrl(value){
    const text=String(value||'').trim();if(!text)return '';
    if(!/^https?:\/\//i.test(text)&&!/^\/(?!\/)/.test(text))throw new Error(L('Нужна ссылка http:// или https:// на картинку','Use an http:// or https:// image URL'));
    const u=new URL(text,location.href);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error(L('Не удалось прочитать ссылку','Invalid URL'));
    return text;
}
function wallpaper(value){return value.wallpaperMode==='none'?'':value.wallpaperMode==='image'?value.image:getSettings().wallpaper||'';}
function setBackground(element,image,dim){
    element.style.backgroundImage=image?'linear-gradient(rgba(0,0,0,'+dim+'),rgba(0,0,0,'+dim+')),url('+JSON.stringify(image)+')':'none';
    element.style.backgroundColor=image?'transparent':'rgba(0,0,0,'+dim+')';
}
function setBubbles(element,value){
    for(const [direction,field] of [['in','incoming'],['out','outgoing']]){
        const hex=value[field+'Color'],alpha=value[field+'Opacity'];
        element.classList.toggle('gp-custom-bubbles-'+direction,!!hex);
        if(!hex){element.style.removeProperty('--gp-chat-'+direction+'-bg');element.style.removeProperty('--gp-chat-'+direction+'-ink');continue;}
        const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
        element.style.setProperty('--gp-chat-'+direction+'-bg','rgba('+rgb.join(',')+','+alpha+')');
        const blended=rgb.map(c=>(c*alpha+28*(1-alpha))/255).map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));
        const luminance=.2126*blended[0]+.7152*blended[1]+.0722*blended[2];
        element.style.setProperty('--gp-chat-'+direction+'-ink',alpha<.25?'var(--gp-text)':luminance>.179?'#151519':'#ffffff');
    }
}
export function clearThreadAppearance(){const phone=document.getElementById('gp-phone');phone?.querySelector('.gp-chat-wallpaper')?.remove();phone?.classList.remove('gp-chat-wallpaper-active','gp-chat-no-wallpaper');}
export function applyThreadAppearance(screen,key){
    const phone=document.getElementById('gp-phone');if(!phone)return;
    const value=threadAppearance(key),image=wallpaper(value),messages=screen.querySelector('#gp-msgs');
    if(messages)setBubbles(messages,value);
    if(!image&&!value.dim){clearThreadAppearance();phone.classList.toggle('gp-chat-no-wallpaper',value.wallpaperMode==='none');return;}
    phone.classList.toggle('gp-chat-no-wallpaper',value.wallpaperMode==='none');
    let layer=phone.querySelector('.gp-chat-wallpaper');if(!layer){layer=document.createElement('div');layer.className='gp-chat-wallpaper';phone.prepend(layer);}
    setBackground(layer,image,value.dim);phone.classList.add('gp-chat-wallpaper-active');
    if(messages){messages.style.backgroundImage='none';messages.style.backgroundColor='transparent';}
}
function bubbleControls(field,title){
    return '<div class="gp-appearance-bubble-control"><label class="gp-appearance-color-row" for="gp-thread-'+field+'-color"><span>'+title+'</span><input type="color" id="gp-thread-'+field+'-color" aria-label="'+title+' — '+L('цвет','color')+'"></label>'+
        '<label class="gp-appearance-slider" for="gp-thread-'+field+'-transparency"><span>'+L('Прозрачность','Transparency')+'<output id="gp-thread-'+field+'-value"></output></span><input type="range" min="0" max="100" step="1" id="gp-thread-'+field+'-transparency"></label></div>';
}
export function editThreadAppearance(screen,key,api,options={}){
    const root=getMeta(),k=key?resolveContactKey(key):'',startAll=options.scope==='all'||!k;
    let objectUrl='',busy=false,currentScope=startAll?'all':'thread';
    const uploads={thread:null,all:null},objectUrls={thread:'',all:''};
    const drafts={thread:k?threadAppearance(k):globalAppearance(),all:globalAppearance()};
    const shade=openPhoneSheet(screen,L('Оформление','Appearance'),
        '<div class="gp-thread-appearance">'+
        (k?'<div class="gp-appearance-scope" role="group" aria-label="'+L('Применить оформление','Appearance scope')+'"><button type="button" data-appearance-scope="thread">'+L('Этот чат','This chat')+'</button><button type="button" data-appearance-scope="all">'+L('Стандарт для всех','Default for all')+'</button></div>':'')+
        '<p class="gp-appearance-scope-note" id="gp-thread-scope-note"></p>'+
        '<div class="gp-appearance-preview" id="gp-thread-wall-preview"><div class="gp-in"><div class="gp-bubble">'+L('Пойдём сегодня гулять? ✨','Shall we go out today? ✨')+'<small>18:24</small></div></div><div class="gp-out"><div class="gp-bubble">'+L('Да! Уже собираюсь 🤍','Yes! Getting ready 🤍')+'<small>18:25 ✓✓</small></div></div></div>'+
        '<h2>'+L('Быстрые темы','Quick themes')+'</h2><div class="gp-appearance-palettes">'+palettes.map((p,i)=>'<button type="button" data-appearance-palette="'+i+'" aria-label="'+p.name()+'"><span class="gp-palette-bubbles"><i style="background:'+(p.incomingColor||'var(--gp-glass-strong)')+'"></i><i style="background:'+(p.outgoingColor||'var(--gp-accent-a)')+'"></i></span><small>'+p.name()+'</small></button>').join('')+'</div>'+
        '<h2>'+L('Пузыри сообщений','Message bubbles')+'</h2><section class="gp-appearance-card">'+bubbleControls('incoming',L('Ответы','Incoming'))+bubbleControls('outgoing',L('Твои сообщения','Your messages'))+'</section>'+
        '<h2>'+L('Обои','Wallpaper')+'</h2><section class="gp-appearance-card gp-appearance-wall">'+
        '<label class="gp-appearance-wall-mode"><span>'+L('Фон переписки','Chat background')+'</span><select id="gp-thread-wall-mode"><option value="phone">'+L('Обои телефона','Phone wallpaper')+'</option><option value="image">'+L('Своя картинка','Custom image')+'</option><option value="none">'+L('Без обоев','No wallpaper')+'</option></select></label>'+
        '<input type="file" accept="image/*" id="gp-thread-wall-file" hidden><button type="button" class="gp-widget-file-button" id="gp-thread-wall-pick">'+I('fa-image')+' '+L('Загрузить картинку','Upload an image')+'</button><small id="gp-thread-wall-filename"></small>'+
        '<details class="gp-appearance-url"><summary>'+L('Использовать ссылку','Use an image URL')+'</summary><input id="gp-thread-wall-url" type="url" placeholder="https://…" aria-label="'+L('Ссылка на обои','Wallpaper URL')+'"></details>'+
        '<label class="gp-appearance-slider" for="gp-thread-wall-dim"><span>'+L('Затемнение обоев','Wallpaper dimming')+'<output id="gp-thread-wall-dim-value"></output></span><input type="range" min="0" max="90" step="1" id="gp-thread-wall-dim"></label></section></div>'+
        '<footer class="gp-appearance-footer"><button type="button" id="gp-thread-wall-reset"></button><button type="button" class="gp-web-primary" id="gp-thread-wall-save">'+L('Сохранить','Save')+'</button></footer>',
        k?'thread:'+k:(screen.dataset.phoneView||'appearance'));
    shade.classList.add('gp-appearance-shade');
    const stage=document.createElement('div');stage.className='gp-appearance-stage';
    for(const selector of ['.gp-appearance-scope','.gp-appearance-scope-note','.gp-appearance-preview']){const element=shade.querySelector(selector);if(element)stage.appendChild(element);}
    shade.querySelector('.gp-thread-appearance').before(stage);
    const themeAccent=color(getComputedStyle(document.getElementById('gp-phone')).getPropertyValue('--gp-accent-a').trim())||'#b75d90';
    const close=shade.querySelector('[data-sheet-close]');close.innerHTML=I('fa-chevron-left');close.setAttribute('aria-label',L('Назад','Back'));
    const file=shade.querySelector('#gp-thread-wall-file'),url=shade.querySelector('#gp-thread-wall-url'),dim=shade.querySelector('#gp-thread-wall-dim'),mode=shade.querySelector('#gp-thread-wall-mode'),preview=shade.querySelector('#gp-thread-wall-preview');
    const draft=()=>drafts[currentScope];
    const revoke=()=>{if(objectUrls[currentScope])URL.revokeObjectURL(objectUrls[currentScope]);objectUrls[currentScope]='';objectUrl='';};
    const update=()=>{
        const v=draft();
        shade.querySelector('#gp-thread-wall-dim-value').value=Math.round(v.dim*100)+'%';
        for(const field of ['incoming','outgoing'])shade.querySelector('#gp-thread-'+field+'-value').value=Math.round((1-v[field+'Opacity'])*100)+'%';
        setBackground(preview,v.wallpaperMode==='image'?(objectUrl||v.image):wallpaper(v),v.dim);setBubbles(preview,v);
        shade.querySelectorAll('[data-appearance-palette]').forEach(button=>{const p=palettes[Number(button.dataset.appearancePalette)],selected=v.incomingColor===p.incomingColor&&v.outgoingColor===p.outgoingColor;button.classList.toggle('gp-active',selected);button.setAttribute('aria-pressed',String(selected));});
    };
    const load=()=>{
        const v=draft();objectUrl=objectUrls[currentScope];url.value=v.image;dim.value=Math.round(v.dim*100);mode.value=v.wallpaperMode;
        shade.querySelector('#gp-thread-wall-filename').textContent=uploads[currentScope]?.name||'';
        for(const field of ['incoming','outgoing']){
            shade.querySelector('#gp-thread-'+field+'-color').value=v[field+'Color']||(field==='incoming'?'#29272d':themeAccent);
            shade.querySelector('#gp-thread-'+field+'-transparency').value=Math.round((1-v[field+'Opacity'])*100);
        }
        shade.querySelectorAll('[data-appearance-scope]').forEach(b=>{const selected=b.dataset.appearanceScope===currentScope;b.classList.toggle('gp-active',selected);b.setAttribute('aria-pressed',String(selected));});
        shade.querySelector('#gp-thread-scope-note').textContent=currentScope==='all'?L('Для чатов без личного оформления.','For chats without their own appearance.'):L('Обои и цвета только для этой переписки.','Wallpaper and colors for this conversation.');
        shade.querySelector('#gp-thread-wall-reset').textContent=currentScope==='all'?L('Сбросить стандарт','Reset default'):L('Общий стандарт','Use default');
        update();
    };
    shade.querySelectorAll('[data-appearance-scope]').forEach(b=>b.onclick=()=>{
        if(busy||currentScope===b.dataset.appearanceScope)return;
        currentScope=b.dataset.appearanceScope;file.value='';load();
    });
    shade.querySelectorAll('[data-appearance-palette]').forEach(b=>b.onclick=()=>{
        const p=palettes[Number(b.dataset.appearancePalette)];Object.assign(draft(),{incomingColor:p.incomingColor,outgoingColor:p.outgoingColor,incomingOpacity:.9,outgoingOpacity:.94});load();
    });
    for(const field of ['incoming','outgoing']){
        const picker=shade.querySelector('#gp-thread-'+field+'-color'),slider=shade.querySelector('#gp-thread-'+field+'-transparency');
        picker.oninput=()=>{draft()[field+'Color']=picker.value;update();};
        slider.oninput=()=>{draft()[field+'Color'] ||= picker.value;draft()[field+'Opacity']=1-Number(slider.value)/100;update();};
    }
    mode.onchange=()=>{draft().wallpaperMode=mode.value;update();};
    shade.querySelector('#gp-thread-wall-pick').onclick=()=>file.click();
    file.onchange=()=>{if(!file.files[0])return;revoke();uploads[currentScope]=file.files[0];if(uploads[currentScope]){objectUrl=URL.createObjectURL(uploads[currentScope]);objectUrls[currentScope]=objectUrl;draft().wallpaperMode='image';mode.value='image';url.value='';draft().image='';}shade.querySelector('#gp-thread-wall-filename').textContent=file.files[0]?.name||'';update();};
    url.oninput=()=>{file.value='';uploads[currentScope]=null;revoke();draft().image=url.value.trim();draft().wallpaperMode=draft().image?'image':'phone';mode.value=draft().wallpaperMode;shade.querySelector('#gp-thread-wall-filename').textContent='';update();};
    dim.oninput=()=>{draft().dim=Number(dim.value)/100;update();};
    shade.cleanup=()=>{for(const url of Object.values(objectUrls))if(url)URL.revokeObjectURL(url);};load();
    shade.querySelector('#gp-thread-wall-reset').onclick=()=>{
        if(busy||getMeta()!==root)return;
        if(currentScope==='all'){delete getSettings().messageAppearance;saveSettingsDebounced();}
        else{removeOwn(k);saveMeta();}
        closePhoneSheet(shade);api.render();
    };
    shade.querySelector('#gp-thread-wall-save').onclick=async()=>{
        if(busy)return;busy=true;const button=shade.querySelector('#gp-thread-wall-save'),value=normalize(draft()),target=currentScope;
        button.disabled=true;shade.querySelectorAll('input,select,button:not([data-sheet-close])').forEach(el=>el.disabled=true);
        try{
            if(value.wallpaperMode==='image'){
                value.image=imageUrl(value.image);
                if(uploads[target]){const data=await compressImage(uploads[target],1600,.85);if(!shade.isConnected||getMeta()!==root)return;value.image=await saveBase64AsFile(data.slice(data.indexOf(',')+1),'glassphone','messages_'+Date.now(),'jpeg');}
                if(!value.image)throw new Error(L('Выбери картинку для обоев','Choose a wallpaper image'));
            }else value.image='';
            if(!shade.isConnected||getMeta()!==root)return;
            if(target==='all'){getSettings().messageAppearance=value;saveSettingsDebounced();}
            else{removeOwn(k);overrides()[k]=value;saveMeta();}
            closePhoneSheet(shade);api.render();api.toast(L('Оформление сохранено','Appearance saved'),'fa-check');
        }catch(e){if(shade.isConnected){api.toast(String(e?.message||e),'fa-circle-exclamation');busy=false;shade.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);}}
    };
}

