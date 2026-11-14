// Read only visible clock/date text, never CSS, scripts, timestamps or image URLs.
export function externalStoryClock(message,parse){
 if(!message||message.is_system||/<!--\s*tel:(?:priv|log)\s*-->/i.test(message.mes||''))return null;
 const sources=[message.extra?.extblocks,message.extra?.display_text];
 if(/<(?:div|section|header|time)\b/i.test(message.mes||''))sources.push(message.mes);
 for(const source of sources){
  if(typeof source!=='string'||!source.trim())continue;
  const text=source.replace(/<(style|script|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160|#8199);/gi,' ').replace(/[\u00a0\u2007\u202f]/g,' ');
  const header=text.split(/Детали персонажей|Character details/i)[0].slice(0,1200);
  const dates=[...header.matchAll(/\b(?:\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{1,2}-\d{1,2})\b/g)];
  const times=[...header.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)];
  for(const date of dates){const time=times.filter(t=>Math.abs(t.index-date.index)<220).sort((a,b)=>Math.abs(a.index-date.index)-Math.abs(b.index-date.index))[0];if(!time)continue;const result=parse(time[0]+' '+date[0]);if(result&&!result.timeOnly)return result;}
 }
 return null;
}
const revisions=new WeakMap();let revision=0;
export function externalClockRevision(chat){
 for(const message of chat.slice(-20)){if(!message)continue;const sources=[message.mes,message.extra?.extblocks,message.extra?.display_text],previous=revisions.get(message);if(!previous||sources.some((value,i)=>value!==previous[i])){revisions.set(message,sources);revision++;}}
 return revision;
}
