import { getMeta, saveMeta, getThreadList, resolveContactKey, contactOriginalName, displayName } from './state.js';

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clean=(value,max=400)=>String(value??'').replace(/[\u200b\ufeff]/g,'').trim().slice(0,max);
export function getInstagram(){
    const root=getMeta();if(!root.social||typeof root.social!=='object')root.social={};
    if(!root.social.instagram||typeof root.social.instagram!=='object')root.social.instagram={};
    const data=root.social.instagram;
    for(const key of ['threads','activity','seenTags'])if(!Array.isArray(data[key]))data[key]=[];
    return data;
}
export function igParty(value){
    const input=typeof value==='string'?{name:value}:value||{},name=clean(input.originalName||input.author||input.name,100);
    const wanted=resolveContactKey(input.contactKey||input.key||name);
    const contact=getThreadList().find(item=>!item.isGroup&&item.key===wanted);
    const contactKey=contact?.key||(String(input.ak||'').startsWith('contact:')?resolveContactKey(input.ak.slice(8)):'');
    if(contactKey)return {id:'contact:'+contactKey,contactKey,author:contactOriginalName(contactKey,name),ak:'contact:'+contactKey,handle:clean(input.handle,60)};
    const handle=clean(input.handle,60),key=(handle||name).normalize('NFC').replace(/^@/,'').replace(/\s+/g,' ').toLowerCase();
    return {id:'account:'+key,author:name||handle,ak:'random',handle};
}
export function igPerson(thread){
    return {...thread,name:thread.contactKey?displayName(thread.contactKey,thread.author):thread.author};
}
export function ensureIgThread(value){
    const party=igParty(value);if(!party.author||party.id==='account:')return null;
    const data=getInstagram();let thread=data.threads.find(item=>item.id===party.id);
    if(!thread){thread={...party,messages:[],at:Date.now()};data.threads.unshift(thread);}
    if(!Array.isArray(thread.messages))thread.messages=[];
    return thread;
}
export function igThreads(){return [...getInstagram().threads].sort((a,b)=>(b.messages?.at(-1)?.at||b.at||0)-(a.messages?.at(-1)?.at||a.at||0));}
export function igThread(id){return getInstagram().threads.find(item=>item.id===id)||null;}
export function igUnread(thread){return (thread?.messages||[]).filter(message=>message.dir==='in'&&!message.read).length;}
export function igUnreadTotal(){return igThreads().reduce((sum,thread)=>sum+igUnread(thread),0);}
export function markIgRead(id){const thread=igThread(id);let changed=false;for(const message of thread?.messages||[])if(message.dir==='in'&&!message.read){message.read=true;changed=true;}if(changed)saveMeta();}
export function safeIgShare(value){
    if(!value||!['tw','ig','st','ch','of','web','map'].includes(value.app))return null;
    return {app:value.app,id:clean(value.id,100),author:clean(value.author,100),text:clean(value.text,600),...(value.replyTo?{replyTo:true}:{}),...(typeof value.image==='string'&&value.image.length<2048?{image:value.image}:{}),...(value.chan?{chan:clean(value.chan,100)}:{})};
}
export function addIgDm(value,{dir='in',text='',share=null,source='' }={}){
    text=clean(text,2000);share=safeIgShare(share);if(!text&&!share)return null;
    const thread=ensureIgThread(value);if(!thread)return null;
    if(source&&thread.messages.some(message=>message.source===source))return null;
    const message={id:uid(),dir:dir==='out'?'out':'in',text,share,at:Date.now(),read:dir==='out',...(source?{source:clean(source,200)}:{})};
    thread.messages.push(message);thread.messages=thread.messages.slice(-200);saveMeta();
    if(message.dir==='in')addIgActivity({kind:'dm',author:thread.author,ak:thread.ak,target:'dm',targetId:thread.id,text:share?(share.replyTo?'Ответ на историю: ':'Переслано: ')+(text||share.text):text,dedupe:'dm:'+message.id});
    return {thread,message};
}
export function addIgActivity({kind='comment',author='',ak='random',target='post',targetId='',text='',dedupe=''}={}){
    const data=getInstagram();if(dedupe&&data.activity.some(item=>item.dedupe===dedupe))return null;
    const event={id:uid(),kind,author:clean(author,100),ak,target,targetId:clean(targetId,100),text:clean(text,700),at:Date.now(),read:false,journaled:false,dedupe:clean(dedupe,220)};
    data.activity.unshift(event);data.activity=data.activity.slice(0,160);saveMeta();
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('gp:instagram',{detail:{event,owner:getMeta()}}));
    return event;
}
export function markIgActivityRead(){let changed=false;for(const event of getInstagram().activity)if(!event.read){event.read=true;changed=true;}if(changed)saveMeta();}
export function igActivityUnread(){return getInstagram().activity.filter(event=>!event.read).length;}
export function igEventText(event){
    if(event.kind==='likes')return 'У вашей публикации '+event.text+' отметок «Нравится»';
    const name=event.author||'Аккаунт';
    const action={like:'нравится ваша публикация',likes:'отметок «Нравится» у вашей публикации',comment:'комментирует вашу публикацию',follow:'теперь подписан(а) на вас',story_like:'реагирует на вашу историю',dm:'пишет в Direct'}[event.kind]||'новое событие';
    return name+': '+action+(event.text?' — '+event.text:'');
}
