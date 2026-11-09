import { getMeta, saveMeta } from './state.js';
import { generatePhoneWeb } from './social.js';

const sessions = new WeakMap();
const busy = new WeakSet();
const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const id = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const PLACE_CATEGORIES = [
    ['all','Всё','fa-compass'], ['museum','Музеи','fa-landmark'],
    ['exhibition','Выставки','fa-palette'], ['cinema','Кино','fa-film'],
    ['theatre','Театры','fa-masks-theater'], ['cafe','Кафе','fa-mug-saucer'],
    ['park','Парки','fa-tree'], ['music','Концерты','fa-music'],
];
export function webState() {
    const root = getMeta();
    if (!root.web || typeof root.web !== 'object') root.web = {};
    const w = root.web;
    for (const key of ['pages','places','history','bookmarks','savedPlaces','tabs']) if (!Array.isArray(w[key])) w[key] = [];
    if (!sessions.has(root)) sessions.set(root, { private: false, pages: [], history: [], tabs: [], active: '', query: '', results: [] });
    return { root, w, session: sessions.get(root) };
}
export function webBusy() { return busy.has(getMeta()); }
export function webTabs() { const {w,session}=webState(); return session.private ? session.tabs : w.tabs; }
export function currentWebTab() { const {w,session}=webState(); const key=session.private?session.active:w.active; return webTabs().find(t=>t.id===key)||null; }
export function currentWebPage() { const {w,session}=webState(); const tab=currentWebTab(); return (session.private?session.pages:w.pages).find(p=>p.id===tab?.stack?.[tab.index])||null; }
export function setPrivateWeb(value) { const {session}=webState(); session.private=!!value; session.query=''; session.results=[]; }
export function newWebTab() { const {w,session}=webState();const tabs=webTabs();const tab={id:id(),stack:[],index:-1};tabs.push(tab);if(tabs.length>12)tabs.shift();if(session.private)session.active=tab.id;else{w.active=tab.id;saveMeta();}return tab; }
export function selectWebTab(key) { const {w,session}=webState();if(!webTabs().some(t=>t.id===key))return;if(session.private)session.active=key;else{w.active=key;saveMeta();} }
export function closeWebTab(key) { const {w,session}=webState();const tabs=webTabs();const index=tabs.findIndex(t=>t.id===key);if(index<0)return;tabs.splice(index,1);const active=session.private?session.active:w.active;if(active===key){if(session.private)session.active=tabs.at(-1)?.id||'';else w.active=tabs.at(-1)?.id||'';}if(session.private){const kept=new Set(tabs.flatMap(t=>t.stack));session.pages=session.pages.filter(p=>kept.has(p.id));if(!tabs.length){session.history=[];session.query='';session.results=[];}}else saveMeta(); }
export function openWebPage(key) { const {w,session}=webState();const pages=session.private?session.pages:w.pages;const p=pages.find(p=>p.id===key);if(!p)return;let tab=currentWebTab();if(!tab)tab=newWebTab();if(tab.stack[tab.index]!==key){tab.stack=tab.stack.slice(0,tab.index+1);tab.stack.push(key);if(tab.stack.length>30)tab.stack.shift();tab.index=tab.stack.length-1;}if(!session.private){w.history=[{pageId:key,at:Date.now()},...w.history.filter(x=>x.pageId!==key)].slice(0,50);saveMeta();} }
export function moveWebPage(delta) {const {session}=webState();const tab=currentWebTab();if(!tab)return;tab.index=Math.max(-1,Math.min(tab.stack.length-1,tab.index+delta));if(!session.private)saveMeta();}
export function webStart() {const {session}=webState();const tab=currentWebTab();if(tab)tab.index=-1;session.results=[];session.query='';if(!session.private)saveMeta();}
export function toggleWebBookmark(key) { const {w,session}=webState();if(session.private)return false;const i=w.bookmarks.indexOf(key);if(i>=0)w.bookmarks.splice(i,1);else{w.bookmarks.unshift(key);w.bookmarks=w.bookmarks.slice(0,40);}saveMeta();return i<0; }
export function toggleSavedPlace(key) {const {w}=webState();const i=w.savedPlaces.indexOf(key);if(i>=0)w.savedPlaces.splice(i,1);else{w.savedPlaces.unshift(key);w.savedPlaces=w.savedPlaces.slice(0,40);}saveMeta();return i<0;}
export function clearWebHistory() {const {w}=webState();w.history=[];saveMeta();}
export function findWebPlace(key) {return webState().w.places.find(p=>p.id===key);}
export function webLink(p) { return p?.url || ('https://phone-map.test/place/' + encodeURIComponent(p?.id||'place')); }
export function webShareText(p) {return [p.title||p.name,p.summary||p.description,p.address,p.event ? [p.event,p.date,p.time].filter(Boolean).join(' · ') : '',webLink(p)].filter(Boolean).join('\n').slice(0,1000);}
function coordinate(v,fallback) {return Number.isFinite(Number(v))?Math.max(12,Math.min(88,Number(v))):fallback;}
export async function searchPhoneWeb(query, mode = 'search', category = 'all') {
    const {root,w,session}=webState();query=text(query,160);if(!query)throw new Error('Введи, что хочешь найти');if(busy.has(root))return null;
    const isPrivate=session.private;
    if(mode==='search'){const pool=isPrivate?session.pages:w.pages;const existing=pool.find(p=>p.url.replace(/\/$/,'')===query.replace(/\/$/,''));if(existing){session.query=query;session.results=[existing.id];return {pages:[existing.id],places:[]};}}
    busy.add(root);
    try {
        const result=await generatePhoneWeb(query,mode,category,w.places.map(p=>({name:p.name,address:p.address,category:p.category})).slice(0,20));
        if(getMeta()!==root || (mode==='search' && session.private!==isPrivate))return null;
        const pages=(Array.isArray(result.pages)?result.pages:[]).filter(p=>p&&text(p.title,120)).slice(0,5).map(p=>({id:id(),title:text(p.title,120),url:syntheticUrl(p.url,p.title),summary:text(p.summary,400),paragraphs:(Array.isArray(p.paragraphs)?p.paragraphs:[]).map(x=>text(x,1400)).filter(Boolean).slice(0,5),kind:['article','forum','listing','site'].includes(p.kind)?p.kind:'site'}));
        const venues=(Array.isArray(result.places)?result.places:[]).filter(p=>p&&text(p.name,100)).slice(0,8);
        const placeIds=[];
        const city=text(result.city,100)||w.city||'';
        // Private browser queries never save their results or places to chat metadata.
        if(!isPrivate||mode==='map') for(const [index,p]of venues.entries()){
            const name=text(p.name,100);const existing=w.places.find(x=>x.name.toLocaleLowerCase()===name.toLocaleLowerCase()&&(!x.city||x.city===city));
            if(existing){for(const key of ['description','hours','price','travel','event','date','time'])if(Object.hasOwn(p,key))existing[key]=text(p[key],key==='description'?900:180);placeIds.push(existing.id);continue;}
            const place={id:id(),name,city,category:PLACE_CATEGORIES.some(c=>c[0]===p.category)?p.category:'other',description:text(p.description,900),address:text(p.address,180),hours:text(p.hours,100),price:text(p.price,80),phone:text(p.phone,50),travel:text(p.travel,100),event:text(p.event,180),date:text(p.date,30),time:text(p.time,5),x:coordinate(p.x,20+(index*23)%65),y:coordinate(p.y,20+(index*31)%65)};
            w.places.push(place);placeIds.push(place.id);
        }
        if(mode==='map') {if(!placeIds.length)throw new Error('Места не найдены. Попробуй уточнить запрос.');w.city=city;w.mapResults=placeIds;w.places=w.places.filter((p,i)=>w.savedPlaces.includes(p.id)||i>=w.places.length-100);saveMeta();return {pages:[],places:placeIds};}
        if(!pages.length)throw new Error('Поиск не вернул страниц. Попробуй уточнить запрос.');
        const target=isPrivate?session.pages:w.pages;target.push(...pages);
        if(isPrivate){const protectedIds=new Set(session.tabs.flatMap(t=>t.stack));session.pages=session.pages.filter((p,i)=>protectedIds.has(p.id)||i>=session.pages.length-60);}
        if(!isPrivate){const protectedIds=new Set([...w.bookmarks,...w.tabs.flatMap(t=>t.stack)]);w.pages=w.pages.filter((p,i)=>protectedIds.has(p.id)||i>=w.pages.length-60);w.history=w.history.filter(h=>w.pages.some(p=>p.id===h.pageId));saveMeta();}
        session.results=pages.map(p=>p.id);session.query=query;return {pages:session.results,places:placeIds};
    } finally {busy.delete(root);}
}
function syntheticUrl(raw,title) {try{const u=new URL(String(raw));if(['https:','http:'].includes(u.protocol)&&u.hostname.endsWith('.test'))return u.href;}catch{}const name=String(title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,35)||'city';return 'https://'+name+'.test';}
