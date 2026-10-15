import { getMeta, saveMeta, getThreadList, displayName } from './state.js';
import { instagramIdentity, instagramIdentitySignature, repairInstagramIdentity, redirectedIgThreadId, canonicalIgSource } from './instagram-identity.js';

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clean=(value,max=400)=>String(value??'').replace(/[\u200b\ufeff]/g,'').trim().slice(0,max);
const identities = new WeakMap();
function instagramContext(){
    const root=getMeta();if(!root.social||typeof root.social!=='object')root.social={};
    if(!root.social.instagram||typeof root.social.instagram!=='object')root.social.instagram={};
    const data=root.social.instagram;
    for(const key of ['threads','activity','seenTags'])if(!Array.isArray(data[key]))data[key]=[];
    const contacts=getThreadList().filter(item=>!item.isGroup);
    const signature=instagramIdentitySignature(root,contacts,data);
    let cached=identities.get(root);
    if(!cached||cached.data!==data||cached.signature!==signature){
        const partyFor=instagramIdentity(root,contacts,data);
        const changed=repairInstagramIdentity(data,partyFor);
        cached={data,partyFor,signature:instagramIdentitySignature(root,contacts,data)};
        identities.set(root,cached);
        if(changed)saveMeta();
    }
    return cached;
}
export function getInstagram(){return instagramContext().data;}
export function igParty(value){
    return instagramContext().partyFor(value);
}
export function igPerson(thread){
    const current=igThread(thread.id)||thread;
    return {...current,name:current.contactKey?displayName(current.contactKey,current.author):current.author};
}
export function ensureIgThread(value){
    const party=igParty(value);if(!party.author||party.id==='account:')return null;
    const data=getInstagram();let thread=data.threads.find(item=>item.id===party.id);
    let changed=false;
    if(!thread){thread={...party,messages:[],at:Date.now()};data.threads.unshift(thread);changed=true;}
    for(const [key,value]of Object.entries(party))if(thread[key]!==value){thread[key]=value;changed=true;}
    if(!Array.isArray(thread.messages))thread.messages=[];
    if(changed)saveMeta();
    return thread;
}
export function igThreads(){return [...getInstagram().threads].sort((a,b)=>(b.messages?.at(-1)?.at||b.at||0)-(a.messages?.at(-1)?.at||a.at||0));}
export function canonicalIgThreadId(id){return redirectedIgThreadId(getInstagram(),id);}
export function igThread(id){const data=getInstagram(),key=redirectedIgThreadId(data,id);return data.threads.find(item=>item.id===key)||null;}
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
    const data=getInstagram(),sourceKey=canonicalIgSource(source,data);
    if(source&&thread.messages.some(message=>canonicalIgSource(message.source,data)===sourceKey))return null;
    const message={id:uid(),dir:dir==='out'?'out':'in',text,share,at:Date.now(),read:dir==='out',...(source?{source:clean(source,200)}:{})};
    thread.messages.push(message);thread.messages=thread.messages.slice(-Math.max(200,Number(thread.historyLimit)||200));saveMeta();
    if(message.dir==='in')addIgActivity({kind:'dm',author:thread.author,ak:thread.ak,target:'dm',targetId:thread.id,text:share?(share.replyTo?'Ответ на историю: ':'Переслано: ')+(text||share.text):text,dedupe:'dm:'+message.id});
    return {thread,message};
}
export function addIgActivity({kind='comment',author='',ak='random',target='post',targetId='',text='',dedupe=''}={}){
    const data=getInstagram();if(dedupe&&data.activity.some(item=>item.kind===kind&&canonicalIgSource(item.dedupe,data)===canonicalIgSource(dedupe,data)))return null;
    if(kind!=='likes'){const person=igParty({author,ak});if(person.contactKey){author=person.author;ak=person.ak;}}
    if(target==='dm')targetId=redirectedIgThreadId(data,targetId);
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
