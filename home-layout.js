import { getPlans, rpToday, fmtPlanDate } from './plans.js';
import { getSettings, getThreadList } from './state.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { saveBase64AsFile } from '../../../utils.js';
import { compressImage } from './social.js';
import { getNotes } from './notes.js';
import { lang } from './i18n.js';

const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L=(ru,en)=>lang()==='en'?en:ru;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const I=n=>'<i class="fa-solid '+n+'" aria-hidden="true"></i>';
const canonical=app=>['socialhub','storyevent'].includes(app)?'events':app;
const known=new Set(['list','tw','ig','events','of','bank','shop','chans','casino','browser','maps','discord','twitch','notes','tinder','appearance','settings','phone','contacts','calendar']);
let state={page:0,editing:false,folder:'',suppress:0};
let gesture=null;
const mounts=new WeakMap();
export function homeInteractionBusy(){return !!gesture?.armed||!!document.querySelector('.gp-home-os .gp-home-sheet-shade')||document.activeElement?.matches('.gp-home-os [data-folder-name]');}
export function cancelHomeGesture(){if(gesture){clearTimeout(gesture.timer);clearTimeout(gesture.edgeTimer);gesture.ghost?.remove();gesture.source?.classList.remove('gp-home-drag-source');}document.querySelectorAll('.gp-home-drop-merge,.gp-home-drop-before').forEach(e=>e.classList.remove('gp-home-drop-merge','gp-home-drop-before'));gesture=null;}
export function disposePhoneHome(screen){if(screen){screen.querySelectorAll('.gp-home-sheet-shade').forEach(closeSheet);mounts.get(screen)?.abort();mounts.delete(screen);}cancelHomeGesture();state.editing=false;state.folder='';}
function save(){saveSettingsDebounced();}
function layout(templates){
    const settings=getSettings();let changed=false;
    if(!settings.homeLayout||typeof settings.homeLayout!=='object'){settings.homeLayout={version:1,entries:[],dock:['list','phone','browser','maps'],widgets:[]};changed=true;}
    const h=settings.homeLayout;h.entries=Array.isArray(h.entries)?h.entries:[];h.widgets=Array.isArray(h.widgets)?h.widgets:[];h.dock=Array.isArray(h.dock)?h.dock.slice(0,4):['list','phone','browser','maps'];
    const before=JSON.stringify([h.entries,h.dock,h.widgets]);
    while(h.dock.length<4)h.dock.push(null);
    const used=new Set();h.dock=h.dock.map(app=>{if(!known.has(app)||used.has(app))return null;used.add(app);return app;});
    h.entries=h.entries.filter(e=>{
        if(e?.type==='folder'&&Array.isArray(e.apps)){e.apps=e.apps.filter(app=>{if(!known.has(app)||used.has(app))return false;used.add(app);return true;});return e.apps.length>0;}
        if(e?.type==='app'&&known.has(e.app)&&!used.has(e.app)){used.add(e.app);return true;}return false;
    });
    for(const app of templates.keys())if(!used.has(app)){h.entries.push({id:'app:'+app,type:'app',app});used.add(app);changed=true;}
    h.widgets=h.widgets.filter(w=>w&&['image','note','messages','calendar'].includes(w.type)).slice(0,8);
    if(before!==JSON.stringify([h.entries,h.dock,h.widgets])){syncGridOrder(h);changed=true;}
    if(changed)save();return h;
}
function removeApp(h,app){
    const dock=h.dock.indexOf(app);if(dock>=0)h.dock[dock]=null;
    for(let i=h.entries.length-1;i>=0;i--){const e=h.entries[i];if(e.type==='app'&&e.app===app)h.entries.splice(i,1);else if(e.type==='folder'){e.apps=e.apps.filter(x=>x!==app);if(!e.apps.length)h.entries.splice(i,1);else if(e.apps.length===1)h.entries.splice(i,1,{id:'app:'+e.apps[0],type:'app',app:e.apps[0]});}}
}
function dockApp(h,app,index){
    if(h.dock[index]===app)return;const old=h.dock[index],from=h.dock.indexOf(app);
    if(from>=0){h.dock[from]=old;h.dock[index]=app;}
    else{const pos=h.entries.findIndex(e=>e.app===app||e.apps?.includes(app));removeApp(h,app);h.dock[index]=app;if(old)h.entries.splice(Math.max(0,pos),0,{id:'app:'+old,type:'app',app:old});}save();
}
function makeFolder(h,app,target){
    if(app===target)return;syncGridOrder(h);
    if(!h.entries.some(e=>e.type==='app'&&e.app===target))return;
    const folderId='folder:'+uid(),oldOrder=h.order.slice(),targetPosition=h.positions['app:'+target];
    removeApp(h,app);const at=h.entries.findIndex(e=>e.type==='app'&&e.app===target);if(at<0)return;
    const social=new Set(['tw','ig','of','chans','discord','twitch','tinder']);
    h.entries.splice(at,1,{id:folderId,type:'folder',name:L(social.has(app)&&social.has(target)?'Общение':'Папка',social.has(app)&&social.has(target)?'Social':'Folder'),apps:[target,app]});
    h.order=oldOrder.filter(id=>id!=='app:'+app).map(id=>id==='app:'+target?folderId:id);
    if(targetPosition)h.positions[folderId]={...targetPosition};delete h.positions['app:'+target];syncGridOrder(h);save();
}
function putInFolder(h,app,key){const folder=h.entries.find(e=>e.type==='folder'&&e.id===key);if(!folder||folder.apps.includes(app))return;removeApp(h,app);folder.apps.push(app);save();}
function reorder(h,key,target,before=true){
    syncGridOrder(h);if(!h.order.includes(key))return;
    h.order=h.order.filter(id=>id!==key);const at=h.order.indexOf(target);h.order.splice(at<0?h.order.length:at+(before?0:1),0,key);delete h.positions[key];save();
}
function extract(h,app){const folder=h.entries.find(e=>e.type==='folder'&&e.apps.includes(app));if(!folder)return;const at=h.entries.indexOf(folder);removeApp(h,app);h.entries.splice(at+1,0,{id:'app:'+app,type:'app',app});save();}
function widgetsPages(widgets){
    const pages=[];let row=[],slots=0;
    for(const w of widgets){const size=w.wide?2:1;if(slots+size>2){pages.push(row);row=[];slots=0;}row.push(w);slots+=size;}if(row.length)pages.push(row);return pages;
}
function syncGridOrder(h){
    const keys=[...h.widgets.map(w=>w.id),...h.entries.map(e=>e.id)],valid=new Set(keys);
    if(!Array.isArray(h.order))h.order=keys;
    h.order=h.order.filter((key,i,a)=>valid.has(key)&&a.indexOf(key)===i);
    for(const key of keys)if(!h.order.includes(key))h.order.push(key);
    if(!h.positions||typeof h.positions!=='object')h.positions={};
    for(const key of Object.keys(h.positions))if(!valid.has(key))delete h.positions[key];
    return h.order;
}
function placeWidgetInOrder(h,id,position){
    syncGridOrder(h);h.order=h.order.filter(key=>key!==id);delete h.positions[id];
    const next=h.widgets[position+1]?.id,previous=h.widgets[position-1]?.id;
    const at=next?h.order.indexOf(next):previous?h.order.indexOf(previous)+1:0;
    h.order.splice(Math.max(0,at),0,id);
}
function pages(h,templates){
    syncGridOrder(h);
    const entries=new Map(h.entries.filter(e=>e.type==='app'?templates.has(e.app):e.apps.some(a=>templates.has(a))).map(e=>[e.id,e]));
    for(const widget of h.widgets)entries.set(widget.id,{id:widget.id,type:'widget',widget});
    const output=[],placed=new Set();
    const pageAt=index=>{while(output.length<=index)output.push({items:[],widgets:[],cells:Array(16).fill(false)});return output[index];};
    function fit(page,row,col,width,height){
        if(row<0||col<0||row+height>4||col+width>4)return false;
        for(let y=row;y<row+height;y++)for(let x=col;x<col+width;x++)if(page.cells[y*4+x])return false;
        return true;
    }
    function put(e,index,row,col){
        const width=e.type==='widget'?(e.widget.wide?4:2):1,height=e.type==='widget'?2:1,page=pageAt(index);
        if(!fit(page,row,col,width,height))return false;
        for(let y=row;y<row+height;y++)for(let x=col;x<col+width;x++)page.cells[y*4+x]=true;
        page.items.push({...e,row,col,width,height});if(e.type==='widget')page.widgets.push(e.widget);placed.add(e.id);return true;
    }
    for(const key of h.order){
        const e=entries.get(key),p=h.positions[key];
        if(e&&p&&Number.isInteger(p.page)&&p.page>=0&&p.page<16&&Number.isInteger(p.row)&&Number.isInteger(p.col))put(e,p.page,p.row,p.col);
    }
    for(const key of h.order){
        const e=entries.get(key);if(!e||placed.has(key))continue;
        let inserted=false;
        for(let index=0;!inserted&&index<20;index++)for(let cell=0;!inserted&&cell<16;cell++)inserted=put(e,index,Math.floor(cell/4),cell%4);
    }
    if(!output.length)pageAt(0);
    for(const page of output){page.items.sort((a,b)=>a.row-b.row||a.col-b.col);page.capacity=16;}
    return output;
}
function gridItem(e,templates){
    const html=e.type==='widget'?widgetHTML(e.widget):e.type==='folder'?folderTile(e,templates):tile(e.app,templates);
    const box=document.createElement('div');box.innerHTML=html;const element=box.firstElementChild;if(!element)return '';
    element.style.gridColumn=(e.col+1)+' / span '+e.width;element.style.gridRow=(e.row+1)+' / span '+e.height;
    return element.outerHTML;
}
function tile(app,templates,dock=false){
    const template=templates.get(app);if(!template)return '';
    const el=template.cloneNode(true);el.setAttribute('data-home-item','app:'+app);el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label',el.querySelector('.gp-app-name')?.textContent||app);
    if(dock)el.classList.add('gp-dock-app');return el.outerHTML;
}
function folderTile(e,templates){
    const icons=e.apps.slice(0,9).map(app=>{const node=templates.get(app)?.querySelector('.gp-app-icon')?.cloneNode(true);if(!node)return '<span></span>';node.querySelectorAll('.gp-app-badge').forEach(b=>b.remove());return '<span>'+node.innerHTML+'</span>';}).join('');
    const unread=e.apps.some(a=>templates.get(a)?.querySelector('.gp-app-badge'));
    return '<div class="gp-app gp-home-folder" role="button" tabindex="0" data-home-item="'+esc(e.id)+'" aria-label="'+esc(e.name)+'"><div class="gp-app-icon gp-folder-preview">'+icons+(unread?'<b class="gp-folder-alert"></b>':'')+'</div><div class="gp-app-name">'+esc(e.name)+'</div></div>';
}
function widgetHTML(w){
    let content='',route='';
    if(w.type==='image')content=w.image?'<img src="'+esc(w.image)+'" alt="'+esc(L('Картинка','Photo'))+'">':'<div class="gp-widget-placeholder">'+I('fa-image')+'</div>';
    if(w.type==='note'){const note=getNotes().find(n=>n.id===w.noteId);content='<span class="gp-widget-heading">'+I('fa-note-sticky')+' '+esc(L('Заметка','Note'))+'</span><p>'+esc(note?.text||w.text||L('Твои маленькие планы','Your little plans'))+'</p>';route='notes';}
    if(w.type==='messages'){const threads=getThreadList();const choices=w.threadKey&&w.threadKey!=='recent'?threads.filter(t=>t.key===w.threadKey):threads.filter(t=>t.last||t.unread).slice(0,2);content='<span class="gp-widget-heading">'+I('fa-comment-dots')+' '+L('Сообщения','Messages')+'</span>'+choices.map(t=>'<div class="gp-widget-message"><b>'+esc(t.name)+(t.unread?' <i>'+t.unread+'</i>':'')+'</b><small>'+esc(t.last?.text||L('Открыть переписку','Open conversation'))+'</small></div>').join('');if(!choices.length)content+='<p>'+L('Пока нет сообщений','No messages yet')+'</p>';route='list';}
    if(w.type==='calendar'){
        const today=rpToday(),filter=w.who||'all';
        const all=getPlans().filter(p=>!p.done&&(filter==='all'||p.who===filter||(filter!=='both'&&p.who==='both')));
        all.sort((a,b)=>a.date.localeCompare(b.date)||String(a.time||'99:99').localeCompare(String(b.time||'99:99')));
        const upcoming=all.filter(p=>p.date>=today),items=(upcoming.length?upcoming:all).slice(0,w.wide?3:2);
        const date=new Date(today+'T12:00:00'),month=date.toLocaleDateString(lang()==='en'?'en-US':'ru-RU',{month:'long'});
        content='<span class="gp-widget-heading">'+I('fa-calendar-days')+' '+L('Календарь','Calendar')+'</span><div class="gp-widget-caldate"><b>'+Number(today.slice(8))+'</b><small>'+esc(month)+'</small></div>'+
            (items.length?items.map(p=>'<div class="gp-widget-plan"><b>'+esc(p.date===today?(p.time||L('Сегодня','Today')):fmtPlanDate(p.date))+'</b><span>'+esc(p.text)+'</span><small>'+L(p.who==='user'?'Я':p.who==='char'?'Персонаж':'Вместе',p.who==='user'?'You':p.who==='char'?'Character':'Together')+'</small></div>').join(''):'<p>'+L('Ближайших планов нет','No upcoming plans')+'</p>');
        route='calendar';
    }
    return '<div class="gp-home-widget gp-widget-'+w.type+(w.wide?' gp-widget-wide':'')+'" data-widget="'+esc(w.id)+'" '+(route?'data-widget-route="'+route+'"':'')+' role="button" tabindex="0">'+content+(state.editing?'<button class="gp-widget-edit" data-edit-widget="'+esc(w.id)+'" aria-label="'+L('Настроить виджет','Edit widget')+'">'+I('fa-pen')+'</button><button class="gp-widget-remove" data-remove-widget="'+esc(w.id)+'" aria-label="'+L('Убрать виджет','Remove widget')+'">'+I('fa-minus')+'</button>':'')+'</div>';
}
function closeSheet(shade){
    const home=shade.parentElement;if(!home)return;
    shade.cleanup?.();shade.remove();home.classList.remove('gp-home-sheet-open');
    [...home.children].forEach(el=>{el.inert=false;});
    if(shade.returnFocus?.isConnected)shade.returnFocus.focus({preventScroll:true});
}
function sheet(home,title,body){
    const returnFocus=document.activeElement;
    home.querySelectorAll('.gp-home-sheet-shade').forEach(closeSheet);
    cancelHomeGesture();
    const shade=document.createElement('div');shade.className='gp-home-sheet-shade';shade.returnFocus=returnFocus;
    shade.innerHTML='<section class="gp-home-sheet" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><header><b>'+esc(title)+'</b><button data-sheet-close aria-label="'+L('Закрыть','Close')+'">'+I('fa-xmark')+'</button></header>'+body+'</section>';
    home.appendChild(shade);home.classList.add('gp-home-sheet-open');
    [...home.children].forEach(el=>{el.inert=el!==shade;});
    shade.querySelector('[data-sheet-close]').onclick=()=>closeSheet(shade);
    shade.onclick=e=>{if(e.target===shade)closeSheet(shade);};
    shade.onkeydown=e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSheet(shade);}
        if(e.key==='Tab'){
            const controls=[...shade.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
            const first=controls[0],last=controls.at(-1);
            if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
            else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
    };
    shade.querySelector('[data-sheet-close]').focus({preventScroll:true});return shade;
}
function imageAddress(value){
    const raw=String(value||'').trim();if(!raw)return '';
    if(!/^https?:\/\//i.test(raw)&&!/^\/(?!\/)/.test(raw))throw new Error(L('Вставь ссылку http:// или https:// на картинку','Paste an http:// or https:// image URL'));
    const url=new URL(raw,location.href);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error(L('Не удалось прочитать ссылку на картинку','Invalid image URL'));
    return raw;
}
function loadWidgetImage(src){
    return new Promise((resolve,reject)=>{
        const img=new Image();const timer=setTimeout(()=>finish(new Error(L('Картинка не загрузилась. Попробуй выбрать файл','Image did not load. Try choosing a file'))),15000);
        function finish(error){clearTimeout(timer);img.onload=null;img.onerror=null;error?reject(error):resolve();}
        img.onload=()=>finish();img.onerror=()=>finish(new Error(L('По этой ссылке нет доступной картинки. Выбери файл или другую ссылку','Image unavailable. Choose a file or another URL')));img.src=src;
    });
}
function widgetEditor(home,h,widget,repaint,api){
    const w=widget||{id:'widget:'+uid(),type:'note',wide:false};
    const notes=getNotes(),threads=getThreadList();
    const at=h.widgets.findIndex(x=>x.id===w.id),total=h.widgets.length+(at<0?1:0);
    let position=at<0?h.widgets.length:at,previewUrl='';
    const shade=sheet(home,L('Настроить виджет','Widget settings'),'<div class="gp-home-widget-editor">'+
    (w.type==='note'?'<label>'+L('Заметка из телефона','Phone note')+'<select id="gp-widget-note"><option value="">'+L('Свой текст','Custom text')+'</option>'+notes.map(n=>'<option value="'+esc(n.id)+'" '+(w.noteId===n.id?'selected':'')+'>'+esc(n.text.slice(0,50))+'</option>').join('')+'</select></label><textarea id="gp-widget-text" rows="4" maxlength="500" placeholder="'+L('Что хочется держать перед глазами?','What would you like to pin?')+'">'+esc(w.text||'')+'</textarea>':'')+
    (w.type==='messages'?'<label>'+L('Переписка','Conversation')+'<select id="gp-widget-thread"><option value="recent">'+L('Последние сообщения','Recent messages')+'</option>'+threads.map(t=>'<option value="'+esc(t.key)+'" '+(w.threadKey===t.key?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>':'')+
    (w.type==='calendar'?'<label>'+L('Чьи планы','Whose plans')+'<select id="gp-widget-calendar-who">'+[['all','Все','All'],['user','Мои','Mine'],['char','Персонажа','Character'],['both','Совместные','Together']].map(x=>'<option value="'+x[0]+'" '+((w.who||'all')===x[0]?'selected':'')+'>'+L(x[1],x[2])+'</option>').join('')+'</select></label>':'')+
    (w.type==='image'?'<div class="gp-widget-image-source"><input type="file" accept="image/*" id="gp-widget-file" hidden><button type="button" class="gp-widget-file-button" id="gp-widget-file-pick">'+I('fa-arrow-up-from-bracket')+' '+L('Выбрать файл','Choose a file')+'</button><small id="gp-widget-file-name">'+L('С компьютера или телефона','From your computer or phone')+'</small><label>'+L('Или ссылка на картинку','Or an image URL')+'<input type="url" id="gp-widget-url" placeholder="https://…" value="'+esc(w.image||'')+'"></label><img class="gp-widget-image-preview" id="gp-widget-image-preview" '+(w.image?'src="'+esc(w.image)+'"':'hidden')+' alt="'+L('Предпросмотр картинки','Image preview')+'"></div>':'')+
    '<label class="gp-widget-size"><input type="checkbox" id="gp-widget-wide" '+(w.wide?'checked':'')+'>'+L('На всю ширину','Full width')+'</label>'+
    (total>1?'<div class="gp-widget-order"><button type="button" data-widget-shift="-1" aria-label="'+L('Раньше','Move earlier')+'">'+I('fa-arrow-left')+'</button><span data-widget-position aria-live="polite"></span><button type="button" data-widget-shift="1" aria-label="'+L('Позже','Move later')+'">'+I('fa-arrow-right')+'</button></div>':'')+
    '<button id="gp-widget-save" class="gp-home-primary">'+L('Сохранить','Save')+'</button></div>');
    function showPosition(){
        const label=shade.querySelector('[data-widget-position]');
        if(label)label.textContent=L('Место ','Position ')+(position+1)+L(' из ',' of ')+total;
        shade.querySelectorAll('[data-widget-shift]').forEach(b=>{const next=position+Number(b.dataset.widgetShift);b.disabled=next<0||next>=total;});
    }
    shade.querySelectorAll('[data-widget-shift]').forEach(b=>b.onclick=()=>{position=Math.max(0,Math.min(total-1,position+Number(b.dataset.widgetShift)));showPosition();});
    showPosition();
    if(w.type==='note'){
        const selected=shade.querySelector('#gp-widget-note'),text=shade.querySelector('#gp-widget-text');
        const showNote=()=>{text.hidden=!!selected.value;};selected.onchange=showNote;showNote();
    }
    if(w.type==='image'){
        const fileInput=shade.querySelector('#gp-widget-file'),urlInput=shade.querySelector('#gp-widget-url'),preview=shade.querySelector('#gp-widget-image-preview');
        shade.cleanup=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);};
        shade.querySelector('#gp-widget-file-pick').onclick=()=>fileInput.click();
        fileInput.onchange=()=>{
            const file=fileInput.files[0];if(!file)return;
            if(previewUrl)URL.revokeObjectURL(previewUrl);
            previewUrl=URL.createObjectURL(file);preview.src=previewUrl;preview.hidden=false;urlInput.value='';
            shade.querySelector('#gp-widget-file-name').textContent=file.name;
        };
        urlInput.oninput=()=>{
            fileInput.value='';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}
            shade.querySelector('#gp-widget-file-name').textContent=L('С компьютера или телефона','From your computer or phone');
            try{const src=imageAddress(urlInput.value);preview.hidden=!src;if(src)preview.src=src;else preview.removeAttribute('src');}
            catch{preview.hidden=true;preview.removeAttribute('src');}
        };
        preview.onerror=()=>{preview.hidden=true;};
    }
    shade.querySelector('#gp-widget-save').onclick=async()=>{
        const btn=shade.querySelector('#gp-widget-save');btn.disabled=true;btn.textContent=L('Сохраняю…','Saving…');
        const settings=getSettings();
        try{
            const updated={...w,wide:shade.querySelector('#gp-widget-wide').checked};delete updated.title;
            if(w.type==='note'){updated.noteId=shade.querySelector('#gp-widget-note').value;updated.text=shade.querySelector('#gp-widget-text').value.trim();}
            if(w.type==='messages')updated.threadKey=shade.querySelector('#gp-widget-thread').value;
            if(w.type==='calendar')updated.who=shade.querySelector('#gp-widget-calendar-who').value;
            if(w.type==='image'){
                const file=shade.querySelector('#gp-widget-file').files[0];
                if(file){
                    if(file.type&&!file.type.startsWith('image/'))throw new Error(L('Выбери файл с картинкой','Choose an image file'));
                    const data=await compressImage(file,1000,.82);
                    updated.image=await saveBase64AsFile(data.slice(data.indexOf(',')+1),'glassphone','widget_'+uid(),'jpeg');
                }else{updated.image=imageAddress(shade.querySelector('#gp-widget-url').value);if(!updated.image)throw new Error(L('Выбери файл или вставь ссылку на картинку','Choose a file or paste an image URL'));await loadWidgetImage(updated.image);}
            }
            if(!shade.isConnected||getSettings()!==settings||settings.homeLayout!==h)return;
            const widgets=h.widgets.filter(x=>x.id!==w.id);
            if(widgets.length>=8)throw new Error(L('Можно добавить до восьми виджетов','Up to eight widgets'));
            widgets.splice(Math.min(position,widgets.length),0,updated);h.widgets=widgets;
            if(at<0||position!==at)placeWidgetInOrder(h,w.id,position);
            state.jumpWidget=w.id;
            save();closeSheet(shade);api.render();
        }catch(e){if(shade.isConnected){api.toast(String(e?.message||e).slice(0,120),'fa-circle-exclamation');btn.disabled=false;btn.textContent=L('Сохранить','Save');}}
    };
}
function homeTools(){
    if(!state.editing)return '';
    return '<button data-home-action="widgets" aria-label="'+L('Добавить виджет','Add widget')+'">'+I('fa-plus')+'</button>'+
        (state.editing?'<button data-home-action="edit">'+L('Готово','Done')+'</button>':'');
}
function widgetGallery(home,h,repaint,api){
    const shade=sheet(home,L('Добавить виджет','Add a widget'),'<div class="gp-widget-gallery">'+[['image','fa-image','Картинка','Photo'],['note','fa-note-sticky','Заметка','Note'],['messages','fa-comment-dots','Сообщения','Messages'],['calendar','fa-calendar-days','Календарь','Calendar']].map(x=>'<button data-widget-type="'+x[0]+'"><span>'+I(x[1])+'</span><b>'+L(x[2],x[3])+'</b></button>').join('')+'</div>');
    shade.querySelectorAll('[data-widget-type]').forEach(b=>b.onclick=()=>{closeSheet(shade);widgetEditor(home,h,{id:'widget:'+uid(),type:b.dataset.widgetType,wide:b.dataset.widgetType==='messages'},repaint,api);});
}
export function enhancePhoneHome(screen,api){
    const previous=mounts.get(screen);previous?.abort();
    cancelHomeGesture();const controller=new AbortController();mounts.set(screen,controller);const signal=controller.signal;
    const existing=screen.querySelector('.gp-home');if(!existing)return;
    const clock=existing.querySelector('.gp-home-clock')?.outerHTML||'',date=existing.querySelector('.gp-home-date')?.outerHTML||'';
    const templates=new Map();existing.querySelectorAll('.gp-app[data-app]').forEach(e=>templates.set(canonical(e.dataset.app),e.cloneNode(true)));
    const h=layout(templates);existing.className='gp-home gp-home-os';
    const home=existing;
    function resizeGrid(){home.style.setProperty('--gp-home-cell',Math.max(40,(home.clientWidth-34)/4)+'px');}
    if(globalThis.ResizeObserver){const observer=new ResizeObserver(resizeGrid);observer.observe(home);signal.addEventListener('abort',()=>observer.disconnect(),{once:true});}
    function repaint(){
        const all=pages(h,templates);
        if(state.jumpWidget){const index=all.findIndex(page=>page.widgets.some(w=>w.id===state.jumpWidget));if(index>=0)state.page=index;state.jumpWidget='';}
        state.page=Math.max(0,Math.min(state.page,all.length-1));const page=all[state.page],openFolder=h.entries.find(e=>e.id===state.folder&&e.type==='folder');
        home.classList.toggle('gp-home-editing',state.editing);home.classList.toggle('gp-home-with-widgets',page.widgets.length>0);
        home.innerHTML='<div class="gp-home-tools">'+homeTools()+'</div><div class="gp-home-heading">'+clock+date+'</div><div class="gp-home-stage"><div class="gp-home-grid gp-home-mixed-grid">'+page.items.map(e=>gridItem(e,templates)).join('')+
            (state.editing?page.cells.map((used,cell)=>used?'':'<div class="gp-home-empty-slot" data-home-blank="'+cell+'" data-home-row="'+Math.floor(cell/4)+'" data-home-col="'+(cell%4)+'" style="grid-column:'+(cell%4+1)+';grid-row:'+(Math.floor(cell/4)+1)+'"></div>').join(''):'')+
            '</div></div><nav class="gp-home-pages" aria-label="'+L('Страницы','Pages')+'">'+all.map((_,i)=>'<button data-home-page="'+i+'" class="'+(i===state.page?'gp-active':'')+'" aria-label="'+L('Страница ','Page ')+(i+1)+'"></button>').join('')+'</nav><div class="gp-home-dock">'+h.dock.map((app,i)=>'<div class="gp-dock-slot" data-home-dock="'+i+'">'+(app?tile(app,templates,true):'<button class="gp-dock-empty" data-pick-dock="'+i+'" aria-label="'+L('Выбрать приложение','Choose an app')+'">'+I('fa-plus')+'</button>')+'</div>').join('')+'</div>'+
            (openFolder?'<div class="gp-home-folder-shade"><div class="gp-folder-heading"><input data-folder-name maxlength="35" aria-label="'+L('Название папки','Folder name')+'" value="'+esc(openFolder.name)+'"><button data-home-action="closefolder">'+I('fa-xmark')+'</button></div><div class="gp-folder-grid">'+openFolder.apps.map(a=>tile(a,templates)).join('')+'</div>'+(state.editing?'<div class="gp-folder-extract" data-home-extract>'+I('fa-arrow-up-right-from-square')+' '+L('Перетащи сюда, чтобы вынести на главный экран','Drop here to move to the Home screen')+'</div>':'')+'</div>':'');
        resizeGrid();bindControls(openFolder);
    }
    function bindTools(){
        home.querySelector('[data-home-action="edit"]')?.addEventListener('click',()=>{state.editing=false;state.folder='';repaint();});
        home.querySelector('[data-home-action="widgets"]')?.addEventListener('click',()=>{state.editing=true;repaint();widgetGallery(home,h,repaint,api);});
    }
    function bindControls(folder){
        bindTools();
        home.querySelector('[data-home-action="closefolder"]')?.addEventListener('click',()=>{state.folder='';repaint();});
        home.querySelector('[data-folder-name]')?.addEventListener('input',e=>{if(folder){folder.name=e.target.value.trim()||L('Папка','Folder');save();}});
        home.querySelector('[data-folder-name]')?.addEventListener('keydown',e=>{if(e.key==='Enter')e.target.blur();});
        home.querySelector('.gp-home-folder-shade')?.addEventListener('click',e=>{if(e.target===e.currentTarget&&!gesture&&Date.now()>=state.suppress){state.folder='';repaint();}});
        home.querySelectorAll('[data-home-page]').forEach(b=>b.onclick=()=>{state.page=Number(b.dataset.homePage);repaint();});
        home.querySelectorAll('[data-remove-widget]').forEach(b=>b.onclick=()=>{h.widgets=h.widgets.filter(w=>w.id!==b.dataset.removeWidget);save();repaint();});
        home.querySelectorAll('[data-edit-widget]').forEach(b=>b.onclick=()=>widgetEditor(home,h,h.widgets.find(w=>w.id===b.dataset.editWidget),repaint,api));
        home.querySelectorAll('[data-home-item]').forEach(el=>{
            el.onclick=()=>{
                if(Date.now()<state.suppress||gesture)return;
                const key=el.dataset.homeItem;
                if(key.startsWith('folder:')){state.folder=key;repaint();return;}
                if(state.editing){const slot=el.closest('[data-home-dock]');if(slot){pickDock(Number(slot.dataset.homeDock));}return;}
                const app=key.slice(4);api.open(templates.get(app)?.dataset.app||app);
            };
            el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};
        });
        home.querySelectorAll('[data-widget-route]').forEach(el=>el.onclick=e=>{if(!state.editing&&!e.target.closest('button'))api.open(el.dataset.widgetRoute);});
        home.querySelectorAll('[data-widget]').forEach(el=>el.oncontextmenu=e=>e.preventDefault());
        home.querySelectorAll('[data-pick-dock]').forEach(b=>b.onclick=()=>pickDock(Number(b.dataset.pickDock)));
    }
    function pickDock(index){
        const shade=sheet(home,L('Быстрый доступ','Dock apps'),'<div class="gp-dock-picker">'+[...templates.keys()].map(app=>'<button data-dock-choice="'+app+'">'+templates.get(app).querySelector('.gp-app-icon').outerHTML+'<span>'+esc(templates.get(app).querySelector('.gp-app-name').textContent)+'</span></button>').join('')+'</div>');
        shade.querySelectorAll('[data-dock-choice]').forEach(b=>b.onclick=()=>{dockApp(h,b.dataset.dockChoice,index);closeSheet(shade);api.render();});
    }
    function candidate(e){
        const hit=document.elementFromPoint(e.clientX,e.clientY);
        if(!hit||!screen.contains(hit))return null;
        if(hit.closest('[data-home-extract]'))return {type:'extract'};
        const dock=hit.closest('[data-home-dock]');if(dock&&gesture?.key?.startsWith('folder:'))return null;if(dock)return {type:'dock',index:Number(dock.dataset.homeDock),node:dock};
        const blank=hit.closest('[data-home-blank]');if(blank)return {type:'blank',row:Number(blank.dataset.homeRow),col:Number(blank.dataset.homeCol),node:blank};
        const node=hit.closest('[data-home-item],[data-widget]');if(!node||(node.dataset.homeItem||node.dataset.widget)===gesture?.key)return null;
        const rect=node.getBoundingClientRect(),center=Math.abs(e.clientX-(rect.left+rect.width/2))<rect.width*.3&&Math.abs(e.clientY-(rect.top+rect.height/2))<rect.height*.35;
        return {type:'item',key:node.dataset.homeItem||node.dataset.widget,merge:center&&!node.dataset.widget,node,before:e.clientX<rect.left+rect.width/2};
    }
    function arm(){
        if(!gesture)return;gesture.armed=true;state.editing=true;state.suppress=Date.now()+900;
        try{screen.setPointerCapture(gesture.pointerId);}catch{}
        home.classList.add('gp-home-editing');
        if(state.folder&&!home.querySelector('[data-home-extract]')){const drop=document.createElement('div');drop.className='gp-folder-extract';drop.dataset.homeExtract='';drop.textContent=L('Перетащи сюда, чтобы вынести на главный экран','Drop here to move to the Home screen');home.querySelector('.gp-home-folder-shade')?.appendChild(drop);}
        home.querySelector('.gp-home-tools').innerHTML=homeTools();bindTools();
    }
    function ghost(e){
        if(!gesture.ghost){
            const g=gesture.source.cloneNode(true);g.classList.add('gp-home-ghost');g.removeAttribute('data-home-item');
            if(gesture.source.dataset.widget){const css=getComputedStyle(gesture.source);g.style.width='100px';g.style.height='100px';g.style.background=css.background;g.style.border=css.border;g.style.borderRadius='18px';g.style.overflow='hidden';g.style.fontSize='9px';g.querySelectorAll('button').forEach(b=>b.remove());g.querySelectorAll('img').forEach(img=>{img.style.width='100%';img.style.height='100%';img.style.objectFit='cover';});}
            const original=gesture.source.querySelector('.gp-app-icon'),copy=g.querySelector('.gp-app-icon');
            if(original&&copy){const c=getComputedStyle(original);for(const k of ['background','color','border','borderRadius','fontSize','boxShadow','backdropFilter'])copy.style[k]=c[k];copy.style.width='58px';copy.style.height='58px';}
            g.style.color=getComputedStyle(gesture.source).color;document.body.appendChild(g);gesture.ghost=g;gesture.source.classList.add('gp-home-drag-source');
        }
        gesture.ghost.style.left=(e.clientX-36)+'px';gesture.ghost.style.top=(e.clientY-40)+'px';
    }
    screen.addEventListener('contextmenu',e=>{if(e.target.closest('.gp-home-os'))e.preventDefault();},{signal});
    screen.addEventListener('pointerdown',e=>{
        if(e.button>0||!e.isPrimary||e.target.closest('button,input,textarea,select,.gp-home-sheet-shade'))return;
        const el=e.target.closest('[data-home-item]');
        const widget=e.target.closest('[data-widget]');
        if(!el&&!widget&&!e.target.closest('.gp-home-stage'))return;
        cancelHomeGesture();gesture={pointerId:e.pointerId,key:el?.dataset.homeItem||widget?.dataset.widget||'',source:el||widget,x:e.clientX,y:e.clientY,armed:false,moved:false,fromFolder:!!el?.closest('.gp-home-folder-shade')};
        if(el||widget)gesture.timer=setTimeout(arm,state.editing?0:480);
    },{signal});
    screen.addEventListener('pointermove',e=>{
        if(!gesture||gesture.pointerId!==e.pointerId)return;
        const distance=Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y);
        if(!gesture.armed){if(distance>9){clearTimeout(gesture.timer);gesture.moved=true;}return;}
        if(!gesture.source)return;
        e.preventDefault();if(distance<4&&!gesture.moved)return;gesture.moved=true;ghost(e);
        document.querySelectorAll('.gp-home-drop-merge,.gp-home-drop-before').forEach(n=>n.classList.remove('gp-home-drop-merge','gp-home-drop-before'));
        gesture.target=candidate(e);gesture.target?.node?.classList.add(gesture.target.merge?'gp-home-drop-merge':'gp-home-drop-before');
        const rect=home.getBoundingClientRect(),all=pages(h,templates);const direction=e.clientX<rect.left+18?-1:e.clientX>rect.right-18?1:0;
        if(direction&&state.page+direction>=0&&state.page+direction<all.length&&!state.folder){
            if(!gesture.edgeTimer)gesture.edgeTimer=setTimeout(()=>{if(gesture){state.page+=direction;gesture.edgeTimer=null;repaint();}},550);
        }else{clearTimeout(gesture.edgeTimer);gesture.edgeTimer=null;}
    },{signal,passive:false});
    screen.addEventListener('pointerup',e=>{
        if(!gesture||gesture.pointerId!==e.pointerId)return;
        const g=gesture;clearTimeout(g.timer);clearTimeout(g.edgeTimer);
        if(g.armed&&g.moved){const drop=candidate(e)||g.target;const app=g.key.startsWith('app:')?g.key.slice(4):'';
            if(drop?.type==='dock'&&app)dockApp(h,app,drop.index);
            else if(drop?.type==='extract'&&app)extract(h,app);
            else if(drop?.type==='item'){
                if(g.fromFolder&&state.folder){const f=h.entries.find(x=>x.id===state.folder);const other=drop.key.slice(4);if(f&&app&&f.apps.includes(other)){f.apps=f.apps.filter(x=>x!==app);f.apps.splice(f.apps.indexOf(other),0,app);save();}}
                else if(drop.merge&&app&&drop.key.startsWith('folder:'))putInFolder(h,app,drop.key);
                else if(drop.merge&&app&&drop.key.startsWith('app:'))makeFolder(h,app,drop.key.slice(4));
                else{if(app&&!h.entries.some(x=>x.id===g.key)){removeApp(h,app);h.entries.push({id:g.key,type:'app',app});}reorder(h,g.key,drop.key,drop.before);}
            }else if(drop?.type==='blank'){
                if(app&&!h.entries.some(e=>e.id===g.key)){removeApp(h,app);h.entries.push({id:g.key,type:'app',app});}
                syncGridOrder(h);h.positions[g.key]={page:state.page,row:drop.row,col:drop.col};save();
            }
            state.suppress=Date.now()+180;
        }else if(!g.armed&&g.moved&&Math.abs(e.clientX-g.x)>45&&Math.abs(e.clientY-g.y)<65){
            state.page+=e.clientX<g.x?1:-1;state.suppress=Date.now()+180;
        }
        const rerender=g.armed||g.moved;if(rerender)state.suppress=Date.now()+180;cancelHomeGesture();
        if(rerender){repaint();api.refreshAfterGesture?.();}
    },{signal});
    screen.addEventListener('pointercancel',()=>{cancelHomeGesture();repaint();},{signal});
    screen.addEventListener('lostpointercapture',()=>{if(gesture){cancelHomeGesture();repaint();}},{signal});
    repaint();
}

