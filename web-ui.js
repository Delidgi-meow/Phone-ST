import { quizHubHTML, quizPageHTML, bindBrowserQuizzes, createBrowserQuiz, quizShareText } from './web-quizzes.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import {
    webState, webBusy, webTabs, currentWebTab, currentWebPage, setPrivateWeb,
    newWebTab, selectWebTab, closeWebTab, openWebPage, moveWebPage, webStart,
    toggleWebBookmark, toggleSavedPlace, clearWebHistory, findWebPlace,
    searchPhoneWeb, webShareText, PLACE_CATEGORIES,
} from './web.js';
import { getMeta, saveMeta, addManualContact } from './state.js';
import { addPlan, getPlans, rpToday, parsePlanDate } from './plans.js';
import { logSocialToChat, getUserName } from './social.js';
import { lang } from './i18n.js';

const views = new WeakMap();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => '<i class="fa-solid ' + name + '" aria-hidden="true"></i>';
const label = (ru,en) => lang()==='en'?en:ru;
function view() {
    const root=getMeta();
    if(!views.has(root))views.set(root,{panel:'',mapQuery:'',category:'all',place:'',route:false,savedOnly:false,error:''});
    return views.get(root);
}
function category(p) {return PLACE_CATEGORIES.find(c=>c[0]===p.category)||['other',label('Место','Place'),'fa-location-dot'];}
function action(name,ico,title,attrs='') {return '<button type="button" class="gp-web-icon" data-web-action="'+name+'" title="'+esc(title)+'" aria-label="'+esc(title)+'" '+attrs+'>'+icon(ico)+'</button>';}
function heroMark(name,ico) {return '<span class="gp-web-mark">'+icon(ico)+'</span><span>'+esc(name)+'</span>';}
function showSheet(screen,title,body){return openPhoneSheet(screen,title,body,screen.querySelector('.gp-maps-shell')?'maps':'browser');}
function planSheet(screen,p,api) {
    const shade=showSheet(screen,label('Запланировать','Add to calendar'),
        '<div class="gp-web-sheet-body"><p>'+esc(p.event||p.name)+'</p><label>'+label('Дата','Date')+'<input id="gp-web-plan-date" type="date" value="'+esc(parsePlanDate(p.date||rpToday()))+'"></label><label>'+label('Время','Time')+'<input id="gp-web-plan-time" type="time" value="'+esc(/^\d{2}:\d{2}$/.test(p.time)?p.time:'')+'"></label><button class="gp-web-primary" id="gp-web-plan-save">'+icon('fa-calendar-plus')+' '+label('Добавить в календарь','Add to calendar')+'</button></div>');
    shade.querySelector('#gp-web-plan-save').onclick=()=>{
        const date=shade.querySelector('#gp-web-plan-date').value;
        if(!date){api.toast(label('Выбери дату','Choose a date'));return;}
        const time=shade.querySelector('#gp-web-plan-time').value;
        const text=[p.event||p.name,p.event?p.name:'',p.address].filter(Boolean).join(' — ').slice(0,200);
        if(!getPlans().some(plan=>!plan.done&&plan.text===text&&plan.date===date&&plan.time===time))addPlan({text,date,time});
        closePhoneSheet(shade);api.changed();api.toast(label('Добавлено в календарь','Added to calendar'),'fa-calendar-check');
    };
}
function shareSheet(screen,p,api) {
    const contacts=api.contacts();
    const shade=showSheet(screen,label('Отправить в СМС','Send in Messages'),'<div class="gp-web-sheet-body"><p>'+esc(p.title||p.name)+'</p>'+(contacts.length?contacts.map((c,i)=>'<button class="gp-web-contact" data-web-recipient="'+i+'">'+icon('fa-comment')+' '+esc(c.name)+'</button>').join(''):'<p>'+label('Сначала добавь контакт в телефоне','Add a phone contact first')+'</p>')+'</div>');
    shade.querySelectorAll('[data-web-recipient]').forEach(b=>b.onclick=()=>{
        const contact=contacts[Number(b.dataset.webRecipient)];
        if(contact){closePhoneSheet(shade);api.share(contact.key,p.kind==='quiz'?quizShareText(p):webShareText(p));}
    });
}
function bindVenueActions(screen,p,api) {
    screen.querySelector('[data-venue-plan]')?.addEventListener('click',()=>planSheet(screen,p,api));
    screen.querySelector('[data-venue-share]')?.addEventListener('click',()=>shareSheet(screen,p,api));
    screen.querySelector('[data-venue-save]')?.addEventListener('click',()=>{toggleSavedPlace(p.id);api.render();});
    screen.querySelector('[data-venue-contact]')?.addEventListener('click',()=>{
        const existing=getMeta().contacts.some(c=>c.name===p.name);
        addManualContact(p.name,p.phone);
        if(!existing){const contact=getMeta().contacts.find(c=>c.name===p.name);if(contact)contact.publicListing=true;saveMeta();}
        api.changed();api.toast(label('Контакт сохранён','Contact saved'),'fa-address-book');
    });
    screen.querySelector('[data-venue-read]')?.addEventListener('click',()=>{
        logSocialToChat(getUserName()+' изучает в картах '+p.name+': '+p.description+'; '+p.address,{priv:true});
        api.changed();api.toast(label('Можно обсудить в ролевой','Added to roleplay'),'fa-comment');
    });
}
function venueDetails(p) {
    const {w}=webState();const cat=category(p);
    return '<article class="gp-map-detail"><div class="gp-map-cover gp-map-cover-'+p.category+'">'+icon(cat[2])+'<span>'+esc(cat[1])+'</span></div><div class="gp-map-detail-body"><div class="gp-web-eyebrow">'+esc(p.category==='cinema'?label('Сегодня в кино','At the movies'):label('Открой свой город','Discover your city'))+'</div><h2>'+esc(p.name)+'</h2><p>'+esc(p.description)+'</p><div class="gp-map-facts">'+
        [[icon('fa-location-dot'),p.address],[icon('fa-clock'),p.hours],[icon('fa-ticket'),p.price],[icon('fa-person-walking'),p.travel]].filter(x=>x[1]).map(x=>'<div>'+x[0]+'<span>'+esc(x[1])+'</span></div>').join('')+'</div>'+
        (p.event?'<div class="gp-map-event"><span>'+icon('fa-star')+' '+label('Афиша','What’s on')+'</span><b>'+esc(p.event)+'</b><small>'+esc([p.date,p.time].filter(Boolean).join(' · '))+'</small></div>':'')+
        '<div class="gp-map-actions"><button data-venue-plan>'+icon('fa-calendar-plus')+' '+label('В планы','Plan a visit')+'</button><button data-venue-share>'+icon('fa-paper-plane')+' '+label('Отправить','Share')+'</button><button data-venue-save>'+icon(w.savedPlaces.includes(p.id)?'fa-bookmark':'fa-star')+' '+label(w.savedPlaces.includes(p.id)?'Сохранено':'Сохранить',w.savedPlaces.includes(p.id)?'Saved':'Save')+'</button></div>'+
        (p.phone?'<button class="gp-web-textbutton" data-venue-contact>'+icon('fa-address-book')+' '+label('Сохранить контакт','Save contact')+'</button>':'')+
        '<button class="gp-web-textbutton" data-venue-read>'+label('Обсудить в ролевой','Discuss in roleplay')+'</button></div></article>';
}
async function search(screen,api,query,mode,cat='all') {
    const root=getMeta(),v=view();v.error='';
    const promise=searchPhoneWeb(query,mode,cat);api.render();
    try {const found=await promise;if(getMeta()!==root||!found)return;v.panel='';if(mode==='search'){const tab=currentWebTab();if(tab)tab.index=-1;}else{v.place='';v.savedOnly=false;}}
    catch(e){if(getMeta()===root)v.error=String(e?.message||e).slice(0,220);}
    finally{if(getMeta()===root)api.render();}
}
export function renderPhoneBrowser(screen,api) {
    if(!webTabs().length)newWebTab();
    const {w,session}=webState(),v=view(),tab=currentWebTab(),page=currentWebPage(),tabs=webTabs(),busy=webBusy();
    let content='';
    if(v.panel==='quizzes'){content=quizHubHTML();
    } else if(v.panel==='tabs') {
        content='<div class="gp-web-sectionhead"><h2>'+label('Вкладки','Tabs')+'</h2><button class="gp-web-textbutton" data-web-action="private">'+icon('fa-mask')+' '+label(session.private?'Обычные':'Частные',session.private?'Regular':'Private')+'</button></div><div class="gp-web-tabs">'+
            tabs.map(t=>{const p=(session.private?session.pages:w.pages).find(p=>p.id===t.stack[t.index]);return '<article class="gp-web-tab '+(t.id===tab?.id?'gp-selected':'')+'"><button class="gp-web-tab-close" data-close-tab="'+esc(t.id)+'" aria-label="'+label('Закрыть вкладку','Close tab')+'">'+icon('fa-xmark')+'</button><button class="gp-web-tab-open" data-select-tab="'+esc(t.id)+'"><div>'+heroMark(p?.title||label('Начальная страница','Start page'),'fa-compass')+'</div><p>'+esc(p?.summary||label('Новый взгляд на город','A new way to see your city'))+'</p><small>'+esc(p?.url||'phone://start')+'</small></button></article>';}).join('')+
            '<button class="gp-web-tab gp-web-tab-new" data-web-action="new">'+icon('fa-plus')+'<span>'+label('Новая вкладка','New tab')+'</span></button></div>'+
            (session.private?'<p class="gp-web-disclaimer">'+label('Частные вкладки не сохраняют историю и исчезают после перезагрузки.','Private tabs do not save history and disappear after a reload.')+'</p>':'');
    } else if(v.panel==='bookmarks'||v.panel==='history') {
        const entries=v.panel==='bookmarks'?w.bookmarks:w.history.map(h=>h.pageId);
        content='<div class="gp-web-sectionhead"><h2>'+label(v.panel==='bookmarks'?'Закладки':'История',v.panel==='bookmarks'?'Bookmarks':'History')+'</h2>'+(v.panel==='history'?'<button class="gp-web-textbutton" data-web-action="clear">'+label('Очистить','Clear')+'</button>':'')+'</div>'+entries.map(key=>w.pages.find(p=>p.id===key)).filter(Boolean).map(p=>resultCard(p)).join('');
        if(!entries.length)content+='<p class="gp-web-muted">'+label('Здесь пока пусто','Nothing here yet')+'</p>';
    } else if(page?.kind==='quiz'&&page.quiz){content=quizPageHTML(page);
    } else if(page) {
        content='<article class="gp-web-page"><div class="gp-web-sitebar">'+heroMark(new URL(page.url).hostname,'fa-globe')+'<span>'+label('В мире истории','Story world')+'</span></div><div class="gp-web-page-hero"><span>'+esc(label(page.kind==='forum'?'ОБСУЖДЕНИЕ':'ГОРОДСКОЙ ЖУРНАЛ',page.kind==='forum'?'DISCUSSION':'CITY JOURNAL'))+'</span><h1>'+esc(page.title)+'</h1><p>'+esc(page.summary)+'</p></div><div class="gp-web-article">'+page.paragraphs.map((p,i)=>'<p class="'+(i===0?'gp-web-lead':'')+'">'+esc(p)+'</p>').join('')+'</div><div class="gp-web-page-actions"><button data-web-action="bookmark" '+(session.private?'disabled':'')+'>'+icon('fa-bookmark')+' '+label(w.bookmarks.includes(page.id)?'В закладках':'В закладки',w.bookmarks.includes(page.id)?'Bookmarked':'Bookmark')+'</button><button data-web-action="share">'+icon('fa-paper-plane')+' '+label('Отправить','Share')+'</button><button data-web-action="read">'+icon('fa-comment')+' '+label('В ролевую','Discuss')+'</button></div></article>';
    } else if(session.results.length) {
        const pool=session.private?session.pages:w.pages;
        content='<div class="gp-web-searchhead"><span>'+label('Найдено в мире истории','Found in the story world')+'</span><h2>'+esc(session.query)+'</h2></div>'+session.results.map(key=>pool.find(p=>p.id===key)).filter(Boolean).map(resultCard).join('');
    } else {
        content='<div class="gp-web-start"><div class="gp-web-start-glow"></div><span class="gp-web-eyebrow">'+label('ТВОЙ МАЛЕНЬКИЙ ИНТЕРНЕТ','YOUR LITTLE INTERNET')+'</span><h1>'+label('Мир ближе,<br>чем кажется.','The world is<br>closer than you think.')+'</h1><p>'+label('Найди место для вечера, новую историю или повод написать первой.','Find somewhere for tonight, a new story, or a reason to text first.')+'</p><div class="gp-web-favorites">'+[['Куда сходить','What’s on','fa-map-location-dot','map'],['Афиша города','City events','fa-ticket','Афиша города на ближайшие дни'],['Новости','News','fa-newspaper','Новости города'],['Тесты','Quizzes','fa-puzzle-piece','quizzes']].map(x=>'<button '+(['map','quizzes'].includes(x[3])?'data-web-action="'+x[3]+'"':'data-web-query="'+esc(x[3])+'"')+'><span>'+icon(x[2])+'</span>'+label(x[0],x[1])+'</button>').join('')+'</div></div><section class="gp-web-discover"><div class="gp-web-sectionhead"><h2>'+label('Избранное','Favorites')+'</h2><button data-web-action="bookmarks" class="gp-web-textbutton">'+label('Все','All')+'</button></div>'+w.bookmarks.slice(0,4).map(id=>w.pages.find(p=>p.id===id)).filter(Boolean).map(resultCard).join('')+(w.bookmarks.length?'':'<p class="gp-web-muted">'+label('Сохраняй страницы, к которым хочется вернуться.','Save the pages you want to return to.')+'</p>')+'</section>';
    }
    screen.innerHTML='<div class="gp-web-shell '+(session.private?'gp-web-private':'')+'"><header class="gp-web-top">'+action('home','fa-chevron-left',label('Домой','Home'))+'<b>'+label('Браузер','Browser')+'</b><button class="gp-web-mode" data-web-action="private">'+icon(session.private?'fa-mask':'fa-compass')+' '+label(session.private?'Частный':'Обычный',session.private?'Private':'Regular')+'</button></header><div class="gp-web-scroll">'+(v.error?'<div class="gp-web-error" role="alert">'+esc(v.error)+'</div>':'')+(busy?'<div class="gp-web-loading" role="status">'+icon('fa-spinner fa-spin')+' '+label('Ищем в твоём мире…','Searching your world…')+'</div>':'')+content+'</div><footer class="gp-web-bottom"><form class="gp-web-address" id="gp-web-search">'+icon('fa-magnifying-glass')+'<input id="gp-web-query" maxlength="160" aria-label="'+label('Поиск','Search')+'" placeholder="'+label('Поиск или адрес сайта','Search or website address')+'" value="'+esc(page?.url||session.query)+'" '+(busy?'disabled':'')+'><button type="submit" aria-label="'+label('Найти','Search')+'" '+(busy?'disabled':'')+'>'+icon('fa-arrow-right')+'</button></form><nav>'+action('back','fa-chevron-left',label('Назад','Back'),tab&&tab.index>=0?'':'disabled')+action('forward','fa-chevron-right',label('Вперёд','Forward'),tab&&tab.index<tab.stack.length-1?'':'disabled')+action('start','fa-house',label('Начальная страница','Start page'))+action('history','fa-clock-rotate-left',label('История','History'),session.private?'disabled':'')+action('tabs','fa-clone',label('Вкладки','Tabs'))+'<span class="gp-web-tabcount">'+tabs.length+'</span></nav></footer></div>';
    screen.querySelector('#gp-web-query').addEventListener('input',e=>{session.query=e.target.value;});
    screen.querySelector('#gp-web-search').onsubmit=e=>{e.preventDefault();const query=screen.querySelector('#gp-web-query').value;if(/(?:^|\s)(?:тест(?:ы|ик)?|quiz|опрос)(?:\s|:|$)/i.test(query)){createBrowserQuiz(query,api,v).catch(e=>api.toast(e.message));}else search(screen,api,query,'search');};
    screen.querySelectorAll('[data-open-page]').forEach(b=>b.onclick=()=>{openWebPage(b.dataset.openPage);v.panel='';api.render();});
    screen.querySelectorAll('[data-web-query]').forEach(b=>b.onclick=()=>search(screen,api,b.dataset.webQuery,'search'));
    screen.querySelectorAll('[data-close-tab]').forEach(b=>b.onclick=e=>{e.stopPropagation();closeWebTab(b.dataset.closeTab);api.render();});
    screen.querySelectorAll('[data-select-tab]').forEach(b=>b.onclick=()=>{selectWebTab(b.dataset.selectTab);v.panel='';api.render();});
    screen.querySelectorAll('[data-web-action]').forEach(b=>b.onclick=()=>{
        switch(b.dataset.webAction) {
            case 'home':api.home();return;
            case 'map':api.map();return;
            case 'back':moveWebPage(-1);v.panel='';break;
            case 'forward':moveWebPage(1);v.panel='';break;
            case 'start':webStart();v.panel='';break;
            case 'new':newWebTab();webStart();v.panel='';break;
            case 'private':setPrivateWeb(!session.private);v.panel='tabs';break;
            case 'quizzes':case 'tabs':case 'bookmarks':case 'history':v.panel=b.dataset.webAction;break;
            case 'clear':clearWebHistory();break;
            case 'bookmark':if(page)toggleWebBookmark(page.id);break;
            case 'share':if(page)shareSheet(screen,page,api);return;
            case 'read':if(page){logSocialToChat(getUserName()+' читает в браузере «'+page.title+'»: '+[page.summary,...page.paragraphs].join(' ').slice(0,1000),{priv:true});api.changed();api.toast(label('Добавлено в ролевую','Added to roleplay'),'fa-comment');}return;
        }
        api.render();
    });
    bindBrowserQuizzes(screen,api,v,page);
}
function resultCard(p) {
    let host='';try{host=new URL(p.url).hostname;}catch{}
    return '<button class="gp-web-result" data-open-page="'+esc(p.id)+'"><span class="gp-web-result-source">'+icon('fa-globe')+' '+esc(host)+'</span><b>'+esc(p.title)+'</b><p>'+esc(p.summary)+'</p><small>'+label('Открыть страницу','Open page')+' '+icon('fa-arrow-up-right-from-square')+'</small></button>';
}
function bindMapCategoryScroll(bar,v){
    if(!bar)return;
    let gesture=null,suppress=0;
    bar.scrollLeft=Number(v.categoryScroll)||0;
    const active=bar.querySelector('.gp-active');
    if(active){const a=active.getBoundingClientRect(),b=bar.getBoundingClientRect();if(a.left<b.left+12)bar.scrollLeft-=b.left+12-a.left;else if(a.right>b.right-12)bar.scrollLeft+=a.right-b.right+12;}
    bar.addEventListener('scroll',()=>{v.categoryScroll=bar.scrollLeft;},{passive:true});
    bar.addEventListener('pointerdown',e=>{if(e.button>0||!e.isPrimary)return;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:bar.scrollLeft,dragged:false};},{passive:true});
    bar.addEventListener('pointermove',e=>{
        if(!gesture||gesture.id!==e.pointerId)return;
        const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
        if(!gesture.dragged){if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}if(Math.abs(dx)<6)return;gesture.dragged=true;try{bar.setPointerCapture(e.pointerId);}catch{}}
        e.preventDefault();bar.scrollLeft=gesture.left-dx;
    },{passive:false});
    bar.addEventListener('pointerup',()=>{if(gesture?.dragged)suppress=Date.now()+250;gesture=null;});
    bar.addEventListener('pointercancel',()=>{gesture=null;});
    bar.addEventListener('click',e=>{if(Date.now()<suppress){e.preventDefault();e.stopImmediatePropagation();}},true);
    bar.addEventListener('wheel',e=>{
        if(bar.scrollWidth<=bar.clientWidth)return;
        const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
        bar.scrollLeft+=delta;e.preventDefault();
    },{passive:false});
}

export function renderPhoneMaps(screen,api) {
    const {w}=webState(),v=view(),busy=webBusy();
    let places=w.places.filter(p=>(v.savedOnly||!p.city||!w.city||p.city===w.city)&&(v.category==='all'||p.category===v.category)&&(!v.savedOnly||w.savedPlaces.includes(p.id)));
    const selected=findWebPlace(v.place);
    const pins=places.map((p,i)=>'<button class="gp-map-pin '+(p.id===v.place?'gp-active':'')+'" data-map-place="'+esc(p.id)+'" style="left:'+p.x+'%;top:'+p.y+'%" title="'+esc(p.name)+'"><span>'+icon(category(p)[2])+'</span><small>'+esc(p.name)+'</small></button>').join('');
    const route=v.route&&selected?'<path d="M 50 62 L '+Number(selected.x)+' '+Number(selected.y)+'" class="gp-map-route"/>':'';
    const map='<div class="gp-map-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="100" fill="var(--gp-map-land)"/><path d="M -5 70 Q 20 52 42 67 T 105 41" fill="none" stroke="var(--gp-map-water)" stroke-width="12"/><path d="M 9 8 H 34 V 32 H 9 Z M 62 12 H 85 V 27 H 62 Z M 19 80 H 40 V 94 H 19 Z" fill="var(--gp-map-park)"/><g fill="none" stroke="var(--gp-map-road)" stroke-width="4"><path d="M 0 16 H 100 M 0 36 H 100 M 0 80 H 100 M 15 0 V 100 M 45 0 V 100 M 72 0 V 100 M 93 0 V 100"/><path d="M -10 100 L 110 0" stroke-width="6"/></g><g fill="none" stroke="var(--gp-map-road-edge)" stroke-width=".35"><path d="M 0 16 H 100 M 0 36 H 100 M 0 80 H 100 M 15 0 V 100 M 45 0 V 100 M 72 0 V 100 M 93 0 V 100"/></g>'+route+'</svg><div class="gp-map-center"><span></span></div>'+pins+'<span class="gp-map-scale">'+label('Схема района · без GPS','District sketch · no GPS')+'</span></div>';
    screen.innerHTML='<div class="gp-maps-shell"><header class="gp-map-header">'+action('home','fa-chevron-left',label('Домой','Home'))+'<div><span>'+label('ОТКРОЙ СВОЙ ГОРОД','DISCOVER YOUR CITY')+'</span><h2>'+esc(w.city||label('Куда сегодня?','Where to today?'))+'</h2></div>'+action('saved','fa-bookmark',label('Сохранённые места','Saved places'))+'</header><form id="gp-map-search" class="gp-map-search">'+icon('fa-magnifying-glass')+'<input id="gp-map-query" maxlength="160" value="'+esc(v.mapQuery)+'" placeholder="'+label('Музеи, выставки, кино…','Museums, exhibitions, movies…')+'" '+(busy?'disabled':'')+'><button type="submit" '+(busy?'disabled':'')+'>'+icon(busy?'fa-spinner fa-spin':'fa-arrow-right')+'</button></form><div class="gp-map-categories">'+PLACE_CATEGORIES.map(c=>'<button data-map-cat="'+c[0]+'" class="'+(v.category===c[0]?'gp-active':'')+'">'+icon(c[2])+' '+esc(c[1])+'</button>').join('')+'</div><div class="gp-map-scroll">'+(v.error?'<div class="gp-web-error" role="alert">'+esc(v.error)+'</div>':'')+map+
        (selected?'<div class="gp-map-selected"><button class="gp-web-textbutton" data-close-place>'+icon('fa-chevron-left')+' '+label('Все места','All places')+'</button><button class="gp-web-textbutton" data-route>'+icon('fa-route')+' '+label(v.route?'Скрыть путь':'Путь на схеме',v.route?'Hide path':'Sketch a path')+'</button></div>'+venueDetails(selected):
        '<div class="gp-map-sectionhead"><h3>'+label(v.savedOnly?'Твои места':'Маленькие планы на большой день',v.savedOnly?'Your places':'Little plans for a big day')+'</h3><span>'+places.length+'</span></div>'+
        (places.length?places.map(p=>'<button class="gp-map-card" data-map-place="'+esc(p.id)+'"><span class="gp-map-card-icon gp-map-cover-'+p.category+'">'+icon(category(p)[2])+'</span><span><small>'+esc(category(p)[1])+'</small><b>'+esc(p.name)+'</b><p>'+esc(p.event||p.description)+'</p><em>'+esc([p.price,p.travel].filter(Boolean).join(' · '))+'</em></span>'+icon('fa-chevron-right')+'</button>').join(''):
        '<div class="gp-map-empty">'+icon('fa-map-location-dot')+'<h3>'+label('Вечер ещё не спланирован','Your evening is still unwritten')+'</h3><p>'+label('Найди интересные места в городе твоей истории.','Discover places in the city of your story.')+'</p><button class="gp-web-primary" data-discover '+(busy?'disabled':'')+'>'+icon(busy?'fa-spinner fa-spin':'fa-compass')+' '+label('Покажи, куда сходить','Find somewhere to go')+'</button></div>'))+
        '<p class="gp-web-disclaimer">'+label('Места и афиша создаются для мира ролевой. Путь на карте — схема, без геолокации.','Places and events are created for the story world. Paths are schematic, without geolocation.')+'</p></div></div>';
    bindMapCategoryScroll(screen.querySelector('.gp-map-categories'),v);
    screen.querySelector('#gp-map-query').oninput=e=>{v.mapQuery=e.target.value;};
    const find=()=>search(screen,api,v.mapQuery||label('Интересные места и события рядом с текущим местом в истории','Interesting places and events near the current story location'),'map',v.category);
    screen.querySelector('#gp-map-search').onsubmit=e=>{e.preventDefault();find();};
    screen.querySelector('[data-discover]')?.addEventListener('click',find);
    screen.querySelectorAll('[data-map-cat]').forEach(b=>b.onclick=()=>{v.category=b.dataset.mapCat;v.place='';v.route=false;api.render();});
    screen.querySelectorAll('[data-map-place]').forEach(b=>b.onclick=()=>{v.place=b.dataset.mapPlace;v.route=false;api.render();});
    screen.querySelector('[data-close-place]')?.addEventListener('click',()=>{v.place='';v.route=false;api.render();});
    screen.querySelector('[data-route]')?.addEventListener('click',()=>{v.route=!v.route;api.render();});
    screen.querySelector('[data-web-action="home"]').onclick=api.home;
    screen.querySelector('[data-web-action="saved"]').onclick=()=>{v.savedOnly=!v.savedOnly;v.place='';api.render();};
    if(selected)bindVenueActions(screen,selected,api);
}

