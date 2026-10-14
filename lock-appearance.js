import { getSettings, getMeta, getRpDateTime } from './state.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { saveBase64AsFile } from '../../../utils.js';
import { compressImage } from './social.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang, DAYS_I18N, MONTHS_I18N } from './i18n.js';
const L=(ru,en)=>lang()==='en'?en:ru;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const I=n=>'<i class="fa-solid '+n+'" aria-hidden="true"></i>';
const clamp=(value,fallback,min,max)=>Number.isFinite(Number(value))&&value!==null&&value!==''?Math.max(min,Math.min(max,Number(value))):fallback;
function normalize(value={}){
    const v=value&&typeof value==='object'?value:{};
    return {clockSize:clamp(v.clockSize,68,40,110),clockWeight:[200,400,650].includes(Number(v.clockWeight))?Number(v.clockWeight):200,
        clockColor:/^#[0-9a-f]{6}$/i.test(String(v.clockColor||''))?v.clockColor:'',showDate:v.showDate!==false,
        wallpaperMode:['phone','image','none'].includes(v.wallpaperMode)?v.wallpaperMode:'phone',image:typeof v.image==='string'?v.image:'',dim:clamp(v.dim,0,0,.9)};
}
export function lockAppearance(){return normalize(getSettings().lockAppearance);}
function background(element,image,dim){
    element.style.backgroundImage=image?'linear-gradient(rgba(0,0,0,'+dim+'),rgba(0,0,0,'+dim+')),url('+JSON.stringify(image)+')':'none';
    element.style.backgroundColor=image?'transparent':'rgba(0,0,0,'+dim+')';
}
function clockStyles(host,value){
    host.style.setProperty('--gp-lock-clock-size',value.clockSize+'px');host.style.setProperty('--gp-lock-clock-weight',value.clockWeight);
    host.style.setProperty('--gp-lock-clock-color',value.clockColor||'var(--gp-text)');
    const date=host.querySelector('.gp-lock-date');if(date)date.hidden=!value.showDate;
}
export function clearLockAppearance(){
    const phone=document.getElementById('gp-phone');phone?.querySelector('.gp-lock-wallpaper')?.remove();phone?.classList.remove('gp-lock-active','gp-lock-no-wallpaper');
}
export function applyLockAppearance(screen){
    clearLockAppearance();const phone=document.getElementById('gp-phone'),lock=screen.querySelector('#gp-lock');if(!phone||!lock)return;
    const v=lockAppearance();clockStyles(lock,v);phone.classList.add('gp-lock-active');phone.classList.toggle('gp-lock-no-wallpaper',v.wallpaperMode==='none');
    if((v.wallpaperMode!=='image'||!v.image)&&!v.dim)return;
    const layer=document.createElement('div');layer.className='gp-lock-wallpaper';background(layer,v.wallpaperMode==='image'?v.image:'',v.dim);phone.prepend(layer);
}
function imageUrl(value){
    const text=String(value||'').trim();if(!text)return '';
    if(!/^https?:\/\//i.test(text)&&!/^\/(?!\/)/.test(text))throw new Error(L('Нужна ссылка http:// или https:// на картинку','Use an http:// or https:// image URL'));
    const u=new URL(text,location.href);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error(L('Не удалось прочитать ссылку','Invalid URL'));
    return text;
}
function clockText(){
    const rp=getRpDateTime(),now=new Date(),date=rp?new Date(rp.year,rp.month-1,rp.day):now;
    return {time:String(rp?.hours??now.getHours()).padStart(2,'0')+':'+String(rp?.minutes??now.getMinutes()).padStart(2,'0'),
        date:DAYS_I18N[lang()][date.getDay()]+', '+date.getDate()+' '+MONTHS_I18N[lang()][date.getMonth()]};
}
export function editLockAppearance(screen,api){
    const root=getMeta(),draft=lockAppearance(),text=clockText();let objectUrl='',busy=false,upload=null;
    const shade=openPhoneSheet(screen,L('Экран блокировки','Lock screen'),
        '<div class="gp-lock-appearance-stage"><div class="gp-lock-preview"><div class="gp-lock-preview-wall"></div><div class="gp-lock-top"><div class="gp-lock-clock">'+text.time+'</div><div class="gp-lock-date">'+esc(text.date)+'</div></div><div class="gp-lock-preview-hint">'+I('fa-lock')+'</div></div></div>'+
        '<div class="gp-thread-appearance gp-lock-appearance-controls"><h2>'+L('Часы','Clock')+'</h2><section class="gp-appearance-card gp-lock-clock-controls">'+
        '<label class="gp-appearance-slider" for="gp-lock-clock-size"><span>'+L('Размер часов','Clock size')+'<output id="gp-lock-size-value"></output></span><input type="range" min="40" max="110" step="1" id="gp-lock-clock-size" value="'+draft.clockSize+'"></label>'+
        '<div class="gp-lock-weight" role="group" aria-label="'+L('Начертание часов','Clock weight')+'">'+[[200,L('Тонкие','Thin')],[400,L('Обычные','Regular')],[650,L('Жирные','Bold')]].map(([w,label])=>'<button type="button" data-lock-weight="'+w+'" style="font-weight:'+w+'">'+label+'</button>').join('')+'</div>'+
        '<label class="gp-appearance-color-row" for="gp-lock-clock-color"><span>'+L('Цвет часов','Clock color')+'</span><input type="color" id="gp-lock-clock-color" value="'+(draft.clockColor||'#ffffff')+'"></label><button type="button" class="gp-lock-theme-color" id="gp-lock-theme-color">'+L('Цвет из темы телефона','Use phone theme color')+'</button>'+
        '<label class="gp-lock-show-date"><span>'+L('Показывать дату','Show date')+'</span><input type="checkbox" id="gp-lock-show-date" '+(draft.showDate?'checked':'')+'></label></section>'+
        '<h2>'+L('Обои блокировки','Lock screen wallpaper')+'</h2><section class="gp-appearance-card gp-appearance-wall">'+
        '<label class="gp-appearance-wall-mode"><span>'+L('Фон экрана','Screen background')+'</span><select id="gp-lock-wall-mode"><option value="phone">'+L('Как на главном экране','Same as home screen')+'</option><option value="image">'+L('Своя картинка','Custom image')+'</option><option value="none">'+L('Без обоев','No wallpaper')+'</option></select></label>'+
        '<input type="file" accept="image/*" id="gp-lock-wall-file" hidden><button type="button" class="gp-widget-file-button" id="gp-lock-wall-pick">'+I('fa-image')+' '+L('Загрузить картинку','Upload an image')+'</button><small id="gp-lock-wall-filename"></small>'+
        '<details class="gp-appearance-url"><summary>'+L('Использовать ссылку','Use an image URL')+'</summary><input type="url" id="gp-lock-wall-url" placeholder="https://…" aria-label="'+L('Ссылка на обои блокировки','Lock screen wallpaper URL')+'" value="'+esc(draft.image)+'"></details>'+
        '<label class="gp-appearance-slider" for="gp-lock-wall-dim"><span>'+L('Затемнение','Dimming')+'<output id="gp-lock-dim-value"></output></span><input type="range" min="0" max="90" step="1" id="gp-lock-wall-dim" value="'+Math.round(draft.dim*100)+'"></label></section></div>'+
        '<footer class="gp-appearance-footer"><button type="button" id="gp-lock-appearance-reset">'+L('Сбросить','Reset')+'</button><button type="button" class="gp-web-primary" id="gp-lock-appearance-save">'+L('Сохранить','Save')+'</button></footer>',
        screen.dataset.phoneView||'appearance');
    shade.classList.add('gp-appearance-shade','gp-lock-appearance-shade');
    const close=shade.querySelector('[data-sheet-close]');close.innerHTML=I('fa-chevron-left');close.setAttribute('aria-label',L('Назад','Back'));
    const preview=shade.querySelector('.gp-lock-preview'),wall=shade.querySelector('.gp-lock-preview-wall'),mode=shade.querySelector('#gp-lock-wall-mode'),file=shade.querySelector('#gp-lock-wall-file'),url=shade.querySelector('#gp-lock-wall-url');
    mode.value=draft.wallpaperMode;
    const update=()=>{
        clockStyles(preview,draft);shade.querySelector('#gp-lock-size-value').value=Math.round(draft.clockSize)+' px';shade.querySelector('#gp-lock-dim-value').value=Math.round(draft.dim*100)+'%';
        const image=draft.wallpaperMode==='phone'?getSettings().wallpaper||'':draft.wallpaperMode==='image'?objectUrl||draft.image:'';
        background(wall,image,draft.dim);preview.classList.toggle('gp-lock-preview-inherit',draft.wallpaperMode==='phone'&&!!image);
        shade.querySelectorAll('[data-lock-weight]').forEach(b=>{const active=Number(b.dataset.lockWeight)===draft.clockWeight;b.classList.toggle('gp-active',active);b.setAttribute('aria-pressed',String(active));});
    };
    const revoke=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}};
    shade.querySelector('#gp-lock-clock-size').oninput=e=>{draft.clockSize=Number(e.target.value);update();};
    shade.querySelector('#gp-lock-clock-color').oninput=e=>{draft.clockColor=e.target.value;update();};
    shade.querySelector('#gp-lock-theme-color').onclick=()=>{draft.clockColor='';update();};
    shade.querySelector('#gp-lock-show-date').onchange=e=>{draft.showDate=e.target.checked;update();};
    shade.querySelectorAll('[data-lock-weight]').forEach(b=>b.onclick=()=>{draft.clockWeight=Number(b.dataset.lockWeight);update();});
    mode.onchange=()=>{draft.wallpaperMode=mode.value;update();};
    shade.querySelector('#gp-lock-wall-pick').onclick=()=>file.click();
    file.onchange=()=>{if(!file.files[0])return;revoke();upload=file.files[0];objectUrl=URL.createObjectURL(upload);draft.image='';url.value='';draft.wallpaperMode='image';mode.value='image';shade.querySelector('#gp-lock-wall-filename').textContent=upload.name;update();};
    url.oninput=()=>{revoke();upload=null;file.value='';draft.image=url.value.trim();draft.wallpaperMode=draft.image?'image':'phone';mode.value=draft.wallpaperMode;shade.querySelector('#gp-lock-wall-filename').textContent='';update();};
    shade.querySelector('#gp-lock-wall-dim').oninput=e=>{draft.dim=Number(e.target.value)/100;update();};
    shade.cleanup=revoke;update();
    shade.querySelector('#gp-lock-appearance-reset').onclick=()=>{if(busy||getMeta()!==root)return;delete getSettings().lockAppearance;saveSettingsDebounced();closePhoneSheet(shade);api.render();};
    shade.querySelector('#gp-lock-appearance-save').onclick=async()=>{
        if(busy)return;busy=true;shade.querySelectorAll('input,select,button:not([data-sheet-close])').forEach(el=>el.disabled=true);
        try{
            const value=normalize(draft);
            if(value.wallpaperMode==='image'){
                value.image=imageUrl(value.image);
                if(upload){const data=await compressImage(upload,1600,.85);if(!shade.isConnected||getMeta()!==root)return;value.image=await saveBase64AsFile(data.slice(data.indexOf(',')+1),'glassphone','lock_'+Date.now(),'jpeg');}
                if(!value.image)throw new Error(L('Выбери картинку для обоев','Choose a wallpaper image'));
            }else value.image='';
            if(!shade.isConnected||getMeta()!==root)return;
            getSettings().lockAppearance=value;saveSettingsDebounced();closePhoneSheet(shade);api.render();api.toast(L('Экран блокировки обновлён','Lock screen updated'),'fa-check');
        }catch(e){if(shade.isConnected){busy=false;shade.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);api.toast(String(e?.message||e),'fa-circle-exclamation');}}
    };
}

