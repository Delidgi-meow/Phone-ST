import { externalStoryClock } from './external-story-clock.js';
import { storyClockText, storyDate } from './rp-time.js';
import { getMeta, saveMeta, getRpNow, getRpDateTime, parseAnyDateTime, parseTimeTag, stripThink, invalidateChatCache } from './state.js';

export function phoneTimeTag(date){
    const p=n=>String(n).padStart(2,'0');
    return `<!--tel:time:${p(date.getHours())}:${p(date.getMinutes())} ${p(date.getDate())}.${p(date.getMonth()+1)}.${date.getFullYear()}-->`;
}
export function clockAnchor(chat){
    for(let i=chat.length-1;i>=0;i--){const parts=parseTimeTag(stripThink(chat[i]?.mes||''));if(parts)return i+':'+JSON.stringify(parts);}
    return '';
}
// One RP minute per meaningful phone action. Browsing and network latency do
// not move the clock; explicit RP timestamps remain authoritative.
export function phoneEventTime({advance=true,at=null}={}){
    const current=getRpNow(),date=Number.isFinite(at)?new Date(Math.max(at,current.getTime())):new Date(current.getTime()+(advance?60000:0));
    if(date>=current){
        getMeta().phoneClock={at:date.getTime(),sceneKey:getRpDateTime()?.clockSourceKey||'',anchor:clockAnchor(SillyTavern.getContext()?.chat||[])};
        saveMeta();invalidateChatCache();
    }
    return date;
}
export function stampPhoneText(text,options={}){
    const explicit=parseTimeTag(stripThink(text||''));
    if(explicit){const date=new Date(explicit.year,explicit.month-1,explicit.day,explicit.hours,explicit.minutes);return {text,at:date.getTime()};}
    const known=getRpDateTime();
    if(!known||known.timeOnly)return {text:String(text||'').trim(),at:null};
    const date=phoneEventTime(options);return {text:String(text||'').trim()+'\n'+phoneTimeTag(date),at:date.getTime()};
}
export function stampNewChatMessage(message){
    if(!message||typeof message.mes!=='string'||message.is_system||/<!--\s*tel:(?:log|silent)\b/i.test(message.mes))return false;
    if(externalStoryClock(message,parseAnyDateTime))return stampExternalClockMessage(message);
    if(parseTimeTag(stripThink(message.mes)))return false;
    const base=getRpDateTime();
    const narrative=storyClockText(message);
    const parts=externalStoryClock(message,parseAnyDateTime)||(narrative?parseAnyDateTime(narrative,base):null);
    const date=storyDate(parts,base&&!base.timeOnly?storyDate(base):null);
    const stamped=date?{text:message.mes.trim()+'\n'+phoneTimeTag(date),at:date.getTime()}:stampPhoneText(message.mes);
    if(!Number.isFinite(stamped.at))return false;
    message.mes=stamped.text;message.extra||={};message.extra.phoneRpTime=stamped.at;message.extra.phoneAutoTime=true;
    if(Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id))message.swipes[message.swipe_id]=message.mes;
    invalidateChatCache();return true;
}

export function stampExternalClockMessage(message){
 const parts=externalStoryClock(message,parseAnyDateTime),date=storyDate(parts);if(!date||typeof message?.mes!=='string')return false;
 const text=message.mes.replace(/<!--\s*tel:time:[\s\S]*?-->/gi,'').trimEnd()+'\n'+phoneTimeTag(date);
 if(text===message.mes)return false;
 message.mes=text;message.extra||={};message.extra.phoneRpTime=date.getTime();message.extra.phoneAutoTime=true;
 if(Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id))message.swipes[message.swipe_id]=text;
 invalidateChatCache();return true;
}
