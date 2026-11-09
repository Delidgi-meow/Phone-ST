import { parsePhoneJson } from './phone-text.js';

// Possession must be an established scene fact, not an incoming-message guess.
export function deviceActions(text) {
    const source=String(text||''),visible=source.replace(/<!--[\s\S]*?-->/g,'');
    const result=[];
    for(const match of source.matchAll(/<!--\s*tel:device:(\{[\s\S]*?\})\s*-->/gi)){
        let value;try{value=parsePhoneJson(match[1]);}catch{continue;}
        if(value?.phone!=='user'||!['send','block','unblock'].includes(value.action)||typeof value.actor!=='string'||!value.actor.trim())continue;
        if(typeof value.evidence!=='string'||value.evidence.trim().length<12||!visible.includes(value.evidence.trim()))continue;
        if(!['sms','ig'].includes(value.app||'sms'))continue;
        const target=String(value.chat||value.to||'').trim();if(!target||target.length>120)continue;
        if(value.action==='send'&&(typeof value.text!=='string'||!value.text.trim()))continue;
        result.push({actor:value.actor.trim().slice(0,100),action:value.action,app:value.app||'sms',to:target,chat:value.chat?target:'',text:String(value.text||'').slice(0,2000),tag:match[0]});
    }
    return result;
}

export const DEVICE_DIRECTIVE='PHONE IN ANOTHER PERSON’S HANDS: only when the established scene actually gives a character access to {{user}}’s phone, they may send messages or block/unblock contacts from that account. Do not invent possession or {{user}}’s own decisions. Narrate the actual action, then append <!--tel:device:{"phone":"user","actor":"character name","app":"sms|ig","action":"send|block|unblock","to":"recipient","text":"exact sent text","evidence":"exact quote from your visible scene establishing use of the user phone"}-->. For a group send use "chat":"exact group name" instead of to. Evidence must be a verbatim passage of your visible narration. This is outgoing from the USER ACCOUNT, with the acting character retained separately. Never use tel:sms from {{user}} for this. Do not repeat already recorded actions. This grants access only to the in-story phone, not other accounts or devices.';
