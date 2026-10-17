import { openPhoneContactEditor } from './contact-editor.js';
import { getMeta, saveMeta, getThreadList, getRpDateTime, getPhoneActivityText as getPhoneMessageText, isSmsBlocked, isUserName, getSettings } from './state.js';
import { generatePhoneCallReply, logSocialToChat, getUserName, getContactAvatar } from './social.js';
import { addManualContact, renameContact, keyOf, resolveContactKey, contactOriginalName } from './state.js';
import { lang } from './i18n.js';
import { applyPrivateBankEvents } from './bank.js';

const busy=new WeakSet();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L=(ru,en)=>lang()==='en'?en:ru;
const I=n=>'<i class="fa-solid '+n+'" aria-hidden="true"></i>';
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const views=new WeakMap();
function view(){const m=getMeta();if(!views.has(m))views.set(m,{tab:'recents',digits:'',query:'',selected:'',draft:'',draftCall:''});return views.get(m);}
export function phoneBook(){return getThreadList().filter(t=>!t.isGroup).sort((a,b)=>a.name.localeCompare(b.name,lang()==='en'?'en':'ru'));}
export function getCalls(){
    const m=getMeta();if(!m.calls||typeof m.calls!=='object')m.calls={history:[],tags:[]};
    const c=m.calls;if(!Array.isArray(c.history))c.history=[];if(!Array.isArray(c.tags))c.tags=[];
    for(const call of c.history)if(call.status==='ringing'&&Date.now()-call.at>90000){call.status='missed';call.ended=Date.now();saveMeta();}
    return c;
}
export function callBadge(){return getCalls().history.filter(c=>c.status==='ringing'||(c.unread&&['missed','declined'].includes(c.status))).length;}
function active(){return getCalls().history.find(c=>['connecting','active'].includes(c.status));}
function findCall(id){return getCalls().history.find(c=>c.id===id);}
function duration(call){return call.started?Math.max(0,Math.floor(((call.ended||Date.now())-call.started)/1000)):0;}
function fmtDuration(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
function avatar(c){const src=getContactAvatar(c.key||keyOf(c.name));return src?'<img src="'+esc(src)+'" alt="">':'<span>'+esc((c.name||'?').slice(0,1).toUpperCase())+'</span>';}
function journal(call){
    if(call.logged)return;call.logged=true;
    const title=getUserName()+(call.direction==='in'?(call.started?' разговаривает по телефону с ':' отклоняет входящий звонок от '):' звонит ')+call.name;
    const lines=call.transcript.map(t=>(t.role==='user'?getUserName():call.name)+': '+t.text).join('\n').slice(-4500);
    logSocialToChat(title+'. '+(call.status==='ended'?'Разговор завершён ('+fmtDuration(duration(call))+'). ':'Связаться не удалось: '+(call.reason||call.status)+'. ')+lines,{priv:true,marker:'call:'+call.id});
}
export function endPhoneCall(id){
    const call=findCall(id);if(!call)return;
    const wasActive=call.status==='active';if(!['connecting','active','ringing'].includes(call.status))return;
    call.status=wasActive?'ended':call.direction==='in'?'declined':'cancelled';if(!wasActive)call.reason=call.direction==='in'?'Вызов отклонён':'Вызов отменён';call.ended=Date.now();call.unread=false;
    journal(call);saveMeta();
}
async function connect(call,forceIncoming=false){
    const root=getMeta();busy.add(call);call.status='connecting';saveMeta();
    try{
        const reply=await generatePhoneCallReply({key:call.key,name:call.name,originalName:call.originalName,number:call.number,direction:call.direction,connected:forceIncoming,reason:call.reason||''},[], '');
        if(getMeta()!==root||call.status!=='connecting')return;
        if(!reply.answered){call.status='unanswered';call.reason=reply.reason||L('Не отвечает','No answer');call.ended=Date.now();journal(call);}
        else{call.status='active';call.started=Date.now();if(reply.text){call.transcript.push({role:'contact',text:reply.text,at:Date.now()});applyPrivateBankEvents(reply.bank,call.id+':connect',contactOriginalName(call.key,call.originalName||call.name));}}
        saveMeta();
    }catch(e){if(getMeta()===root&&call.status==='connecting'){call.status='failed';call.reason=String(e?.message||e).slice(0,240);call.ended=Date.now();saveMeta();}}
    finally{busy.delete(call);}
}
export function startPhoneCall(contact){
    if(!String(contact?.number||'').trim())throw new Error(L('Сначала сохрани номер контакта','Save this contact’s phone number first'));
    if(active())throw new Error(L('Сначала заверши текущий звонок','End your current call first'));
    const call={id:'call:'+uid(),key:contact.key||keyOf(contact.name),name:contact.name,originalName:contact.originalName,number:contact.number||'',direction:'out',status:'connecting',at:Date.now(),when:getRpDateTime()?.label||'',transcript:[],unread:false};
    const calls=getCalls();calls.history.unshift(call);calls.history=calls.history.slice(0,80);saveMeta();return connect(call);
}
export function acceptPhoneCall(id){if(active())throw new Error(L('Сначала заверши текущий звонок','End your current call first'));const call=findCall(id);if(!call||call.status!=='ringing')return Promise.resolve();call.unread=false;return connect(call,true);}
export async function speakOnPhone(id,text){
    const root=getMeta(),call=findCall(id);text=String(text||'').trim().slice(0,1500);
    if(!call||call.status!=='active'||!text||busy.has(call))return;
    busy.add(call);call.transcript.push({role:'user',text,at:Date.now()});saveMeta();
    try{
        const reply=await generatePhoneCallReply({key:call.key,name:call.name,originalName:call.originalName,number:call.number,direction:call.direction,reason:call.reason||'',connected:true},call.transcript,text);
        if(getMeta()!==root||call.status!=='active')return;
        if(reply.text){call.transcript.push({role:'contact',text:reply.text,at:Date.now()});applyPrivateBankEvents(reply.bank,call.id+':turn:'+call.transcript.length,contactOriginalName(call.key,call.originalName||call.name));}
        saveMeta();
    }catch(e){if(getMeta()===root&&call.status==='active'){call.error=String(e?.message||e).slice(0,200);saveMeta();}}
    finally{busy.delete(call);}
}
function hash(s){let h=0;for(const c of s)h=(Math.imul(h,31)+c.charCodeAt(0))|0;return h.toString(36);}
export function harvestPhoneCalls(){
    const root=getMeta(),calls=getCalls(),seen=new Set(calls.tags),incoming=[];
    const chat=SillyTavern.getContext().chat||[];let consumed=false;
    for(let i=0;i<chat.length;i++){
        const m=chat[i];if(!m||m.is_user||m.is_system)continue;
        for(const tag of getPhoneMessageText(m,i).matchAll(/<!--\s*tel:call:(\{[\s\S]*?\})\s*-->/gi)){
            const key=hash(tag[1])+':'+(m.send_date||m.extra?.gen_id||i);
            if(seen.has(key))continue;
            let data;try{data=JSON.parse(tag[1]);}catch{continue;}
            const name=typeof data.from==='string'?data.from.trim().slice(0,100):'';
            if(!name)continue;seen.add(key);calls.tags.push(key);consumed=true;
            if(getSettings().quietMode||isUserName(name)||(data.to&&!isUserName(data.to)))continue;
            const contact=phoneBook().find(c=>c.key===resolveContactKey(name));
            // Unknown people and blocked callers cannot call just because a model emits a tag.
            if(!contact||!contact.number||isSmsBlocked(contact.key))continue;
            const publicListing=root.contacts.some(c=>c.publicListing&&keyOf(c.name)===contact.key);
            if(publicListing&&!calls.history.some(c=>c.key===contact.key&&c.direction==='out'&&['active','ended'].includes(c.status)))continue;
            if(calls.history.some(c=>c.key===contact.key&&c.status==='ringing'))continue;
            const call={id:'call:'+uid(),key:contact.key,name:contact.name,originalName:contact.originalName,number:contact.number,direction:'in',status:'ringing',at:Date.now(),when:getRpDateTime()?.label||'',reason:String(data.reason||'').slice(0,300),transcript:[],unread:true};
            calls.history.unshift(call);incoming.push(call);
        }
    }
    calls.history=calls.history.slice(0,80);calls.tags=calls.tags.slice(-600);if(consumed&&getMeta()===root)saveMeta();return incoming;
}
export function callsInjectLine(){
    const c=active();if(!c)return '';
    return '[PHONE CALL IN PROGRESS] '+getUserName()+(c.status==='active'?' is speaking by phone to ':' is waiting for a phone connection with ')+c.name+'. They are not necessarily together. Latest spoken lines: '+c.transcript.slice(-6).map(t=>(t.role==='user'?getUserName():c.name)+': '+t.text).join(' | ').slice(0,2200);
}
export function callsInjectRule() {
    return '[CALLS] A contact with the user’s number may call when the scene gives a reason, usually while apart: <!--tel:call:{"from":"canonical contact name","to":"{{user}}","reason":"why"}-->. One call event; no SMS substitute or second call during an active call. The app handles acceptance and dialogue. Saving a venue listing does not give it the user’s number.';
}
function contactEditor(screen,contact,api){return openPhoneContactEditor(screen,api,{contact,number:view().digits});}
let callTimer=null;
export function stopPhoneCallTimer(){clearInterval(callTimer);callTimer=null;}
export function renderPhoneBook(screen,api,onlyBook=false){
    stopPhoneCallTimer();const root=getMeta(),v=view(),calls=getCalls(),current=active(),book=phoneBook();
    if(current&&v.draftCall!==current.id){v.draft='';v.draftCall=current.id;}
    if(onlyBook)v.tab='contacts';
    const ringing=calls.history.filter(c=>c.status==='ringing');
    let body='';
    if(current&&!onlyBook){
        body='<div class="gp-live-call"><div class="gp-call-avatar">'+avatar(current)+'</div><h1>'+esc(current.name)+'</h1><span class="gp-call-status" data-call-status>'+L(current.status==='connecting'?'Соединение…':'Разговор',current.status==='connecting'?'Connecting…':'Connected')+(current.started?' · '+fmtDuration(duration(current)):'')+'</span><div class="gp-call-transcript">'+current.transcript.map(t=>'<p class="'+(t.role==='user'?'gp-call-me':'')+'"><small>'+esc(t.role==='user'?L('Ты','You'):current.name)+'</small><span>'+esc(t.text)+'</span></p>').join('')+'</div>'+(current.error?'<div class="gp-call-error">'+esc(current.error)+'</div>':'')+'<form id="gp-call-speak"><input id="gp-call-words" maxlength="1500" placeholder="'+L('Что ты говоришь…','What you say…')+'" value="'+esc(v.draft)+'" '+(current.status!=='active'||busy.has(current)?'disabled':'')+'><button '+(current.status!=='active'||busy.has(current)?'disabled':'')+'>'+I(busy.has(current)?'fa-spinner fa-spin':'fa-microphone')+'</button></form><button class="gp-call-hangup" data-call-end="'+esc(current.id)+'">'+I('fa-phone-slash')+'</button><small>'+L('Ролевой разговор · реплики вводятся текстом','Roleplay call · type your spoken words')+'</small></div>';
    }else if(v.tab==='keypad'&&!onlyBook){
        body='<div class="gp-dialer"><input id="gp-dial-number" type="tel" maxlength="40" value="'+esc(v.digits)+'" aria-label="'+L('Номер телефона','Phone number')+'" placeholder=""><div class="gp-dial-keys">'+[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']].map(x=>'<button data-dial-key="'+x[0]+'"><b>'+x[0]+'</b><small>'+x[1]+'</small></button>').join('')+'</div><div class="gp-dial-bottom"><span class="gp-dial-spacer" aria-hidden="true"></span><button class="gp-call-green" data-dial-call>'+I('fa-phone')+'</button><button data-dial-back aria-label="'+L('Удалить цифру','Delete digit')+'" style="visibility:'+(v.digits?'visible':'hidden')+'">'+I('fa-delete-left')+'</button></div></div>';
    }else if(v.tab==='contacts'||onlyBook){
        const selected=book.find(c=>c.key===v.selected);
        if(selected)body='<div class="gp-book-profile"><button class="gp-book-back" data-book-list>'+I('fa-chevron-left')+' '+L('Контакты','Contacts')+'</button><div class="gp-call-avatar">'+avatar(selected)+'</div><h1>'+esc(selected.name)+'</h1><p>'+esc(selected.number||L('Номер не указан','No number saved'))+'</p><div class="gp-book-actions"><button data-call-contact="'+esc(selected.key)+'">'+I('fa-phone')+'<span>'+L('Позвонить','Call')+'</span></button><button data-sms-contact="'+esc(selected.key)+'">'+I('fa-comment-dots')+'<span>'+L('Сообщение','Message')+'</span></button><button data-book-edit="'+esc(selected.key)+'">'+I('fa-user-pen')+'<span>'+L('Изменить','Edit')+'</span></button></div></div>';
        else{const query=v.query.toLocaleLowerCase();body='<div class="gp-book-search">'+I('fa-magnifying-glass')+'<input id="gp-book-search" maxlength="100" value="'+esc(v.query)+'" placeholder="'+L('Имя или номер','Name or number')+'"></div><div class="gp-book-list">'+book.filter(c=>(c.name+' '+c.number).toLocaleLowerCase().includes(query)).map(c=>'<button data-book-contact="'+esc(c.key)+'"><span class="gp-book-small-avatar">'+avatar(c)+'</span><span><b>'+esc(c.name)+'</b><small>'+esc(c.number||'')+'</small></span>'+I('fa-chevron-right')+'</button>').join('')+(book.length?'':'<div class="gp-call-empty">'+I('fa-address-book')+'<h3>'+L('Твоя телефонная книга','Your address book')+'</h3><p>'+L('Здесь появятся контакты из переписок. Можно добавить новый вручную.','Contacts from your messages appear here. You can also add one manually.')+'</p></div>')+'</div>';}
    }else{
        body='<div class="gp-calls-list">'+calls.history.map(c=>'<button data-call-history="'+esc(c.id)+'" class="'+(c.status==='missed'?'gp-call-missed':'')+'"><span>'+I(c.direction==='in'?'fa-arrow-down':'fa-arrow-up')+'</span><span><b>'+esc(c.name)+'</b><small>'+esc(L(({ended:'Завершён',unanswered:'Нет ответа',cancelled:'Отменён',failed:'Ошибка соединения',declined:'Отклонён',missed:'Пропущенный',ringing:'Входящий'})[c.status]||c.status,({ended:'Completed',unanswered:'No answer',cancelled:'Cancelled',failed:'Connection error',declined:'Declined',missed:'Missed',ringing:'Incoming'})[c.status]||c.status))+(c.started?' · '+fmtDuration(duration(c)):'')+'</small></span><time>'+esc(c.when||new Date(c.at).toLocaleDateString())+'</time></button>').join('')+(calls.history.length?'':'<div class="gp-call-empty">'+I('fa-phone')+'<h3>'+L('Здесь будут твои звонки','Your calls will appear here')+'</h3><p>'+L('Выбери контакт или набери сохранённый номер.','Choose a contact or dial a saved number.')+'</p></div>')+'</div>';
    }
    screen.innerHTML='<div class="gp-phonebook-shell '+(!onlyBook&&v.tab==='keypad'&&!current?'gp-clean-dialer':'')+'"><header><button data-phone-home>'+I('fa-chevron-left')+'</button><h2>'+(!onlyBook&&v.tab==='keypad'&&!current?'':L(onlyBook?'Контакты':'Телефон',onlyBook?'Contacts':'Phone'))+'</h2><button data-book-new title="'+L('Новый контакт','New contact')+'">'+I('fa-plus')+'</button></header>'+(!current?ringing.map(c=>'<article class="gp-call-incoming"><span>'+L('Входящий звонок','Incoming call')+'</span><b>'+esc(c.name)+'</b><small>'+esc(c.reason)+'</small><div><button data-call-end="'+esc(c.id)+'">'+I('fa-phone-slash')+' '+L('Отклонить','Decline')+'</button><button data-call-accept="'+esc(c.id)+'">'+I('fa-phone')+' '+L('Ответить','Answer')+'</button></div></article>').join(''):'')+'<div class="gp-phonebook-scroll">'+body+'</div>'+(!onlyBook?'<nav>'+[['recents','fa-clock-rotate-left','Недавние','Recents'],['contacts','fa-address-book','Контакты','Contacts'],['keypad','fa-table-cells','Клавиши','Keypad']].map(x=>'<button data-phone-tab="'+x[0]+'" class="'+(v.tab===x[0]?'gp-active':'')+'">'+I(x[1])+'<span>'+L(x[2],x[3])+'</span></button>').join('')+'</nav>':'')+'</div>';
    async function call(contact){if(!contact)return;try{api.phone();const task=startPhoneCall(contact);api.render();await task;}catch(e){api.toast(String(e?.message||e));}finally{if(getMeta()===root){api.changed();api.render();}}}
    screen.querySelector('[data-phone-home]').onclick=api.home;
    screen.querySelectorAll('[data-book-new]').forEach(b=>b.onclick=()=>contactEditor(screen,null,api));
    screen.querySelectorAll('[data-phone-tab]').forEach(b=>b.onclick=()=>{v.tab=b.dataset.phoneTab;v.selected='';api.render();});
    screen.querySelectorAll('[data-book-contact]').forEach(b=>b.onclick=()=>{v.selected=b.dataset.bookContact;api.render();});
    screen.querySelector('[data-book-list]')?.addEventListener('click',()=>{v.selected='';api.render();});
    screen.querySelectorAll('[data-call-contact]').forEach(b=>b.onclick=()=>call(book.find(c=>c.key===b.dataset.callContact)));
    screen.querySelectorAll('[data-sms-contact]').forEach(b=>b.onclick=()=>api.sms(b.dataset.smsContact));
    screen.querySelectorAll('[data-book-edit]').forEach(b=>b.onclick=()=>contactEditor(screen,book.find(c=>c.key===b.dataset.bookEdit),api));
    screen.querySelector('#gp-book-search')?.addEventListener('input',e=>{v.query=e.target.value;const pos=e.target.selectionStart;api.render();const input=screen.querySelector('#gp-book-search');input?.focus();input?.setSelectionRange(pos,pos);});
    function syncDial(){const input=screen.querySelector('#gp-dial-number');if(input)input.value=v.digits;const back=screen.querySelector('[data-dial-back]');if(back){back.style.visibility=v.digits?'visible':'hidden';back.setAttribute('aria-hidden',v.digits?'false':'true');}}
    screen.querySelector('#gp-dial-number')?.addEventListener('input',e=>{v.digits=e.target.value;syncDial();});
    screen.querySelectorAll('[data-dial-key]').forEach(b=>b.onclick=()=>{v.digits=(v.digits+b.dataset.dialKey).slice(0,40);syncDial();});
    screen.querySelector('[data-dial-back]')?.addEventListener('click',()=>{v.digits=v.digits.slice(0,-1);syncDial();});
    screen.querySelector('[data-dial-call]')?.addEventListener('click',()=>{const digits=v.digits.replace(/\D/g,'');if(!digits)return;const contact=book.find(c=>c.number.replace(/\D/g,'')===digits);if(contact)call(contact);else contactEditor(screen,null,api);});
    screen.querySelectorAll('[data-call-end]').forEach(b=>b.onclick=()=>{endPhoneCall(b.dataset.callEnd);api.changed();api.render();});
    screen.querySelectorAll('[data-call-accept]').forEach(b=>b.onclick=async()=>{try{api.phone();const task=acceptPhoneCall(b.dataset.callAccept);api.render();await task;}catch(e){api.toast(e.message);}finally{if(getMeta()===root){api.changed();api.render();}}});
    screen.querySelectorAll('[data-call-history]').forEach(b=>b.onclick=()=>historySheet(screen,findCall(b.dataset.callHistory),api,call));
    if(current){
        screen.querySelector('#gp-call-words')?.addEventListener('input',e=>{v.draft=e.target.value;});
        screen.querySelector('#gp-call-speak').onsubmit=async e=>{e.preventDefault();const text=v.draft.trim();if(!text||busy.has(current))return;v.draft='';current.error='';const task=speakOnPhone(current.id,text);api.render();await task;if(getMeta()===root){api.changed();api.render();}};
        const transcript=screen.querySelector('.gp-call-transcript');if(transcript)transcript.scrollTop=transcript.scrollHeight;
        callTimer=setInterval(()=>{if(getMeta()!==root||!screen.querySelector('.gp-phonebook-shell')){stopPhoneCallTimer();return;}const c=findCall(current.id);if(c?.started){const s=screen.querySelector('[data-call-status]');if(s)s.textContent=L('Разговор','Connected')+' · '+fmtDuration(duration(c));}},1000);
    }else if(v.tab==='recents'){const unread=calls.history.some(c=>c.unread&&c.status!=='ringing');if(unread){calls.history.forEach(c=>{if(c.status!=='ringing')c.unread=false;});saveMeta();}}
}
function historySheet(screen,c,api,start){
    if(!c)return;const shade=document.createElement('div');shade.className='gp-phonebook-shade';
    shade.innerHTML='<section class="gp-phonebook-editor gp-call-history-sheet"><header><b>'+esc(c.name)+'</b><button data-call-close>'+I('fa-xmark')+'</button></header><p>'+esc(c.when)+' '+(c.started?fmtDuration(duration(c)):'')+'</p><div class="gp-call-transcript">'+c.transcript.map(t=>'<p><small>'+esc(t.role==='user'?L('Ты','You'):c.name)+'</small><span>'+esc(t.text)+'</span></p>').join('')+(c.reason?'<p>'+esc(c.reason)+'</p>':'')+'</div><button data-redial>'+I('fa-phone')+' '+L('Позвонить снова','Call again')+'</button></section>';
    screen.appendChild(shade);shade.querySelector('[data-call-close]').onclick=()=>shade.remove();shade.querySelector('[data-redial]').onclick=()=>{shade.remove();start(c);};
}

