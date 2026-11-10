import { getMeta, invalidateChatCache } from './state.js';
import { phoneMessageSources, replacePhoneMessageTag } from './message-sources.js';
import { SMS_REACTIONS } from './sms-reactions.js';
import { saveChatConditional } from '../../../../script.js';

export async function applyBotSmsReactions(target,replies,owner){
    if(!target||target.dir!=='out'||getMeta()!==owner)return;
    const message=SillyTavern.getContext()?.chat?.[target.idx];if(!message)return;
    const source=phoneMessageSources(message).find(s=>s.text.includes(target.tagText));if(!source)return;
    const match=target.tagText.match(/<!--\s*tel:out:(\{[\s\S]*\})\s*-->/i);if(!match)return;
    let data;try{data=JSON.parse(match[1]);}catch{return;}
    let changed=false;data.botReactions=Array.isArray(data.botReactions)?data.botReactions:[];
    for(const reply of replies){
        const reaction=SMS_REACTIONS.find(r=>r.id===reply.reaction||r.emoji===reply.reaction);
        if(!reaction||!reply.from)continue;
        data.botReactions=data.botReactions.filter(r=>r.from!==reply.from);
        data.botReactions.push({from:reply.from,emoji:reaction.emoji});changed=true;
    }
    if(!changed)return;
    const tag='<!--tel:out:'+JSON.stringify(data)+'-->';
    if(replacePhoneMessageTag(message,target.tagText,tag)){target.tagText=tag;target.botReactions=data.botReactions;invalidateChatCache();await saveChatConditional();}
}
