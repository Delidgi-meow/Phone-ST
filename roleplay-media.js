import { getMeta, getSettings, getPhoneMessageText, stripThink, isUserName, isPhoneAppInstalled, invalidateChatCache, saveMeta, isSmsBlocked, isDeviceContactBlocked } from './state.js';
import { chatMedia, chatMediaKey } from './chat-media.js';
import { generateChatAttachment } from './social.js';
import { addIgDm } from './instagram-state.js';
import { parsePhoneJson } from './phone-text.js';
const pending=new WeakMap();
export async function generateRoleplayMedia(){
    const owner=getMeta();if(pending.has(owner))return pending.get(owner);
    const task=(async()=>{
        if(getSettings().quietMode||getSettings().isEnabled===false)return;
        const chat=SillyTavern.getContext()?.chat||[];
        let index=chat.length-1;while(index>=0&&(chat[index]?.is_user||chat[index]?.is_system))index--;
        if(index<0)return;
        const message=chat[index],source=stripThink(getPhoneMessageText(message,index));
        owner.generatedChatMedia||={};
        for(const match of source.matchAll(/<!--\s*tel:(sms|igdm):(\{[\s\S]*?\})\s*-->/gi)){
            let event;try{event=parsePhoneJson(match[2]);}catch{continue;}
            const descriptor=chatMedia(event);if(!descriptor)continue;
            const key=chatMediaKey(index,match[0]);if(owner.generatedChatMedia[key])continue;
            const app=match[1].toLowerCase()==='igdm'?'ig':'list';
            if(!event.from||isUserName(event.from)||event.to&&!event.chat&&!isUserName(event.to)||!isPhoneAppInstalled(app)||isDeviceContactBlocked(app==='ig'?'ig':'sms',event.from)||app==='list'&&!event.chat&&isSmsBlocked(event.from))continue;
            owner.generatedChatMedia[key]={status:'pending'};saveMeta();
            try{
                const attachment=await generateChatAttachment(descriptor,{speaker:event.from,phoneApp:app});
                if(getMeta()!==owner)return;
                if(!chat.includes(message)||!stripThink(getPhoneMessageText(message,chat.indexOf(message))).includes(match[0])){delete owner.generatedChatMedia[key];saveMeta();continue;}
                owner.generatedChatMedia[key]={status:'ready',...attachment};
                if(app==='ig')addIgDm(event.from,{source:'media:'+key,share:{app:attachment.mediaKind,id:attachment.stickerId||'',author:event.from,text:attachment.photo,image:attachment.img}});
            }catch(error){if(getMeta()!==owner)return;owner.generatedChatMedia[key]={status:'failed'};console.warn('[GlassPhone] Chat media:',error);}
            saveMeta();invalidateChatCache();
        }
    })();pending.set(owner,task);try{await task;}finally{pending.delete(owner);}
}
