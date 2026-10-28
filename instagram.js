import { isPhoneAppInstalled } from './state.js';
import { getDeviceEvents } from './state.js';
import { parsePhoneJson } from './phone-text.js';
import { getMeta, saveMeta, getPhoneActivityText as getPhoneMessageText, stripThink, isUserName, isBanned, getSettings, phoneActivityAllowed } from './state.js';
import { generateInstagramDmReply, logSocialToChat, getUserName, getStories, addIgComment, resolveAuthorKey } from './social.js';
import { getInstagram, addIgDm, addIgActivity, igParty, igThread, igPerson, igEventText } from './instagram-state.js';
import { applyPrivateBankEvents } from './bank.js';
import { messageForward } from './message-forward.js';

const busy=new WeakMap();
const pendingFor=owner=>{if(!busy.has(owner))busy.set(owner,new Set());return busy.get(owner);};
export const igDmBusy=thread=>!!thread&&(igThread(thread.id)||thread).messages.some(message=>busy.get(getMeta())?.has(message.id));
export function igDmRetryMessage(thread){
    const last=thread?.messages?.at(-1);
    return last?.dir==='out'&&last.replyState!=='complete'&&!igDmBusy(thread)?last:null;
}
async function requestIgReply(owner,thread,sent){
    const activityVersion = getSettings().phoneActivityVersion;
    if (!(isPhoneAppInstalled('ig') && phoneActivityAllowed(activityVersion))) { sent.message.replyState='complete'; saveMeta(); return sent; }
    const pending=pendingFor(owner),pendingId=sent.message.id;pending.add(pendingId);sent.message.replyState='pending';saveMeta();
    try{
        const reply=await generateInstagramDmReply(thread);
        if(getMeta()!==owner)return sent;
        if (!(isPhoneAppInstalled('ig') && phoneActivityAllowed(activityVersion))) { sent.message.replyState='complete'; saveMeta(); return sent; }
        thread=igThread(thread.id)||thread;
        sent.thread=thread;sent.message=thread.messages.find(message=>message.id===sent.message.id)||sent.message;
        if(reply?.text || reply?.share){
            addIgDm(thread,{dir:'in',text:reply.text,share:reply.share,source:'reply:'+sent.message.id});
            applyPrivateBankEvents(reply.bank,'igdm:'+sent.message.id,thread.author);
        }
        sent.message.replyState='complete';saveMeta();return sent;
    }catch(error){
        if (getMeta()===owner && !(isPhoneAppInstalled('ig') && phoneActivityAllowed(activityVersion))) { sent.message.replyState='complete'; saveMeta(); return sent; }
        if(getMeta()===owner){sent.message.replyState='failed';saveMeta();}
        throw error;
    }finally{pending.delete(pendingId);}
}
export async function retryIgDm(id,messageId){
    const owner=getMeta(),thread=igThread(id),message=igDmRetryMessage(thread);
    if(!message||message.id!==messageId)return null;
    return requestIgReply(owner,thread,{thread,message});
}
export async function sendIgDm(id,text='',share=null){
    const owner=getMeta(),thread=igThread(id);if(!thread||igDmBusy(thread))return null;
    const sent=addIgDm(thread,{dir:'out',text,share});if(!sent)return null;
    const label=igPerson(thread).name;
    const forwarded=messageForward(share);
    logSocialToChat(getUserName()+' пишет '+thread.author+' (в контактах «'+label+'») в Instagram Direct: '+(text||'пересылает сообщение')+(share?' [переслано: '+(forwarded?forwarded.messages.length+' сообщений':share.author+' — '+share.text)+']':''),{priv:true,marker:'igdm:'+sent.message.id,
        ...(forwarded?{context:{app:'instagram',from:getUserName(),to:thread.author,forward:forwarded}}:{})});
    return requestIgReply(owner,thread,sent);
}
export function receiveIgStoryReactions(story,result){
    for(const reaction of result?.reactions||[])addIgActivity({kind:'story_like',author:reaction.author,target:'story',targetId:story.id,text:({fire:'🔥',heart:'❤️',laugh:'😂',wow:'😮',sad:'😢'})[reaction.icon]||'❤️',dedupe:'story:'+story.id+':'+igParty(reaction.author).id+':'+reaction.icon});
    for(const dm of result?.dms||[])addIgDm(dm.from,{text:dm.text,share:{app:'st',id:story.id,author:story.author,text:story.caption||story.imgDesc,imgDesc:story.imgDesc||'',image:story.image,replyTo:true},source:'story:'+story.id+':'+igParty(dm.from).id+':'+dm.text.slice(0,80)});
}
export async function flushInstagramJournal(){
    const owner=getMeta();
    const pending=getInstagram().activity.filter(event=>!event.journaled).reverse();if(!pending.length)return;
    if (!isPhoneAppInstalled('ig') || getSettings().quietMode) { for (const event of pending) event.journaled=true; saveMeta(); return; }
    // One compact journal entry for a burst of comments/reactions.
    for(let i=0;i<pending.length;i+=6){
        if(getMeta()!==owner)return;
        const batch=pending.slice(i,i+6),forwards=[];
        for(const event of batch){
            event.journaled=true;
            if(event.kind!=='dm')continue;
            const message=igThread(event.targetId)?.messages.find(message=>'dm:'+message.id===event.dedupe);
            const forward=messageForward(message?.share);
            if(forward)forwards.push({app:'instagram',from:event.author,to:getUserName(),forward});
        }
        saveMeta();
        await logSocialToChat('Instagram — '+batch.map(igEventText).join('\n').slice(0,1450),{priv:true,marker:'ign:'+batch.at(-1).id,...(forwards.length?{context:forwards}:{})});
    }
}
function hash(text){let h=0;for(const char of text)h=(Math.imul(h,31)+char.charCodeAt(0))|0;return h.toString(36);}
function incomingShare(value){
    if (value?.app === 'msg') return messageForward(value);
    if(!value||!['ig','st'].includes(value.app))return null;
    const items=value.app==='ig'?(getMeta().social?.igPosts||[]):getStories();
    const found=items.find(item=>item.id===value.id);
    if(!found)return null;
    return {app:value.app,id:found.id,author:found.author,text:found.caption||found.imgDesc||'',image:found.image};
}
export function harvestInstagramTags(){
    if (!isPhoneAppInstalled('ig')) return 0;
    const data=getInstagram(),seen=new Set(data.seenTags);let added=0,changed=false;
    for(const event of getDeviceEvents())if(event.app==='ig'&&event.action==='send'&&!event.chat){
        if(addIgDm(event.to,{dir:'out',text:event.text,actor:event.actor,source:'device:'+event.index+':'+hash(event.tag)}))added++;
    }
    const chat=SillyTavern.getContext()?.chat||[];
    for(let i=0;i<chat.length;i++){
        const message=chat[i];if(!message||message.is_user||message.is_system)continue;
        const source=stripThink(getPhoneMessageText(message,i));if(/<!--\s*tel:log\s*-->/i.test(source))continue;
        const occurrences={};
        for(const match of source.matchAll(/<!--\s*tel:(igdm|ignotify):(\{[\s\S]*?\})\s*-->/gi)){
            const base=match[1]+':'+hash(match[2])+':'+(message.send_date||message.extra?.gen_id||i),key=base+':'+(occurrences[base]=(occurrences[base]||0)+1);
            if(seen.has(key))continue;
            if (!isPhoneAppInstalled('ig') || getSettings().quietMode) { seen.add(key); data.seenTags.push(key); changed=true; continue; }
            let event;try{event=parsePhoneJson(match[2]);}catch{continue;}
            if(typeof event.from!=='string'||!event.from.trim()||isUserName(event.from)||isBanned(event.from)||(event.to&&!isUserName(event.to)))continue;
            const existingActivity=new Set(data.activity.map(item=>item.id));
            if(match[1].toLowerCase()==='igdm'){
                const share=incomingShare(event.shot);
                if((typeof event.text!=='string'||!event.text.trim())&&!share)continue;
                const story=event.storyId?getStories().find(item=>item.id===event.storyId&&item.ak==='user'):null;
                const received=addIgDm({name:event.from,handle:event.handle||''},{text:event.text||'',source:key,share:share||(story?{app:'st',id:story.id,author:story.author,text:story.caption||story.imgDesc,imgDesc:story.imgDesc||'',image:story.image,replyTo:true}:null)});
                if(received){
                    added++;
                }
            }else{
                const kind=event.kind;if(!['like','comment','follow','story_like'].includes(kind))continue;
                const target=kind==='story_like'?'story':kind==='follow'?'profile':'post';
                const post=target==='post'?getMeta().social?.igPosts?.find(item=>item.id===event.postId&&item.ak==='user'):target==='story'?getStories().find(item=>item.id===event.storyId&&item.ak==='user'):null;
                if(target!=='profile'&&!post)continue;
                if(kind==='comment'){
                    if(typeof event.text!=='string'||!event.text.trim())continue;
                    if(addIgComment(post.id,event.text,event.from,resolveAuthorKey(event.from)))added++;
                }else{
                    const dedupe='rp:'+kind+':'+(post?.id||'profile')+':'+igParty(event.from).id;
                    if(addIgActivity({kind,author:event.from,target,targetId:post?.id||'',text:event.text||'',dedupe})){
                        if(kind==='like')post.likes=(post.likes||0)+1;
                        if(kind==='follow'&&getMeta().social?.socialProfiles?.instagram)getMeta().social.socialProfiles.instagram.followers++;
                        added++;
                    }
                }
            }
            // These events already exist as full tags in Tavern. Journal only
            // events created by separate app requests, not another copy here.
            for(const activity of data.activity)if(!existingActivity.has(activity.id))activity.journaled=true;
            seen.add(key);data.seenTags.push(key);changed=true;
        }
    }
    if(data.seenTags.length>600)data.seenTags=data.seenTags.slice(-600);if(changed)saveMeta();return added;
}
export function instagramInjectLine(){
    if (!isPhoneAppInstalled('ig')) return '';
    const root=getMeta(),data=getInstagram(),social=root.social;
    if(!social?.igPosts?.length&&!social?.stories?.length&&!social?.instagram?.threads?.length)return '';
    const posts=social.igPosts||[],own=posts.filter(item=>item.ak==='user').slice(0,3),others=posts.filter(item=>item.ak!=='user').slice(0,2);
    const ids=[...[...own,...others].map(item=>'ig '+item.id+' by '+item.author+': '+String(item.caption||item.imgDesc||'photo').slice(0,85)),...(social.stories||[]).filter(item=>Date.now()-item.time<86400000).slice(0,4).map(item=>'st '+item.id+' by '+item.author+': '+String(item.caption||item.imgDesc||'photo').slice(0,85))];
    const recent=data.threads.filter(thread=>thread.messages?.length).sort((a,b)=>b.messages.at(-1).at-a.messages.at(-1).at).slice(0,3).map(thread=>thread.author+' (saved as '+igPerson(thread).name+'): '+thread.messages.slice(-2).map(message=>(message.dir==='out'?'user':'contact')+': '+message.text.slice(0,180)).join(' | '));
    return 'INSTAGRAM: route story replies and explicitly established Direct exchanges here. Ordinary personal texts from known phone contacts default to SMS; the presence of an Instagram account or saved Direct history does not change their channel. Incoming DM: <!--tel:igdm:{"from":"canonical name","text":"message"}-->, optional "storyId" for a reply to a listed story. Characters may SEND existing Instagram posts and stories (including the user’s) to the user with an in-character comment: put "shot":{"app":"ig|st","id":"listed ID","author":"post author","text":"post/story content"} in '+(isPhoneAppInstalled('list')?'tel:igdm or tel:sms, choosing the actual delivery app':'tel:igdm')+'. This creates a forwarded card, not a new post. Do not only narrate the share or copy it as plain text. For an established notification: <!--tel:ignotify:{"from":"canonical name","kind":"like|comment|follow|story_like","postId":"listed ID","text":"optional comment"}-->; story reactions use "storyId". Notify only on the user’s content. Do not repeat events, invent user actions, or expose private DMs to outsiders. AVAILABLE POSTS/STORIES:\n'+ids.join('\n')+(recent.length?'\nPRIVATE DIRECT — only participants know:\n'+recent.join('\n'):'');
}
