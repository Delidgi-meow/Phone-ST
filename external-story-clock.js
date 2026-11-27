// Infoblock clock: the time/date the preset's status block shows.
// Sources: hidden comment blocks (<!--scene ...-->, <!--sims ...--> …), ExtBlocks
// and HTML blocks. Never CSS, scripts, phone tags, timestamps or image URLs.
// Returns {day,month,year,hours?,minutes?}, {hours,minutes,timeOnly:true} or null.

const CLOCK_LINE_RE=/[\u{1F550}-\u{1F567}⏰⌚⏱\u{1F570}]|(?:^|[^а-яёa-z])(?:время|time|час|clock)\s*[:：]/iu;
const DATE_LINE_RE=/[\u{1F4C5}\u{1F4C6}\u{1F5D3}]|(?:^|[^а-яёa-z])(?:дата|date)\s*[:：]/iu;
const PAIR_DATE_RE=/\b(?:\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{1,2}-\d{1,2})\b/g;
const PAIR_TIME_RE=/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;

function clean(source){
 return source.replace(/<(style|script|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ')
  .replace(/&(?:nbsp|#160|#8199);/gi,' ').replace(/[   ]/g,' ');
}

// Hidden status blocks written as HTML comments: everything except our own tel: tags.
function commentBlocks(mes){
 const out=[];
 for(const m of String(mes||'').matchAll(/<!--([\s\S]*?)-->/g)){
  const body=m[1];
  if(/^\s*tel:/i.test(body))continue;
  out.push(body.replace(/^\s*[a-z_-]+\s*\n/i,'')); // "<!--scene\n" — drop the block name line
 }
 return out;
}

function blockClock(text,parse){
 const header=text.split(/Детали персонажей|Character details/i)[0].slice(0,1200);
 const lines=header.split('\n');
 let time=null,date=null;
 // 1) Labelled lines: 🕒 10:36 / Время: … / 📅 2 сентября 2024 / Дата: …
 for(const line of lines){
  const clockLine=CLOCK_LINE_RE.test(line),dateLine=DATE_LINE_RE.test(line);
  if(!clockLine&&!dateLine)continue;
  const r=parse(line);
  if(!r)continue;
  if(!date&&!r.timeOnly)date=r;
  if(!time&&clockLine&&r.hours!==undefined)time=r;
 }
 // 2) Unlabelled header: numeric date with a time close to it.
 if(!date){
  const dates=[...header.matchAll(PAIR_DATE_RE)],times=[...header.matchAll(PAIR_TIME_RE)];
  for(const d of dates){
   const t=times.filter(x=>Math.abs(x.index-d.index)<220).sort((a,b)=>Math.abs(a.index-d.index)-Math.abs(b.index-d.index))[0];
   const r=parse((t?t[0]+' ':'')+d[0]);
   if(r&&!r.timeOnly){date=r;if(!time&&r.hours!==undefined)time=r;break;}
  }
 }
 if(!time&&!date)return null;
 if(date){
  const res={day:date.day,month:date.month,year:date.year};
  const src=time||date;
  if(src.hours!==undefined){res.hours=src.hours;res.minutes=src.minutes;}
  return res;
 }
 return {hours:time.hours,minutes:time.minutes,timeOnly:true};
}

export function externalStoryClock(message,parse){
 if(!message||message.is_system||/<!--\s*tel:(?:priv|log)\s*-->/i.test(message.mes||''))return null;
 const sources=[message.extra?.extblocks,message.extra?.display_text];
 if(/<(?:div|section|header|time)\b/i.test(message.mes||''))sources.push(message.mes);
 let timeOnly=null;
 for(const source of sources){
  if(typeof source!=='string'||!source.trim())continue;
  const r=blockClock(clean(source),parse);
  if(r&&!r.timeOnly)return r;
  if(r&&!timeOnly)timeOnly=r;
 }
 for(const body of commentBlocks(message.mes)){
  const r=blockClock(clean(body),parse);
  if(r&&!r.timeOnly)return r;
  if(r&&!timeOnly)timeOnly=r;
 }
 return timeOnly;
}

// Infoblock with only a clock: take the day from the same message's phone tag,
// otherwise from the previous known moment. A clock that jumps far backwards
// means the scene crossed midnight.
export function resolveInfoblockDate(parts,ownTag,previous){
 if(!parts)return null;
 if(!parts.timeOnly)return parts;
 const withDay=(d)=>({day:d.getDate(),month:d.getMonth()+1,year:d.getFullYear(),hours:parts.hours,minutes:parts.minutes});
 if(ownTag&&!ownTag.timeOnly)return withDay(new Date(ownTag.year,ownTag.month-1,ownTag.day));
 if(previous instanceof Date&&Number.isFinite(previous.getTime())){
  const d=new Date(previous.getFullYear(),previous.getMonth(),previous.getDate(),parts.hours,parts.minutes);
  if(previous.getTime()-d.getTime()>3*3600000)d.setDate(d.getDate()+1);
  return withDay(d);
 }
 return null;
}

const revisions=new WeakMap();let revision=0;
export function externalClockRevision(chat){
 for(const message of chat.slice(-20)){if(!message)continue;const sources=[message.mes,message.extra?.extblocks,message.extra?.display_text],previous=revisions.get(message);if(!previous||sources.some((value,i)=>value!==previous[i])){revisions.set(message,sources);revision++;}}
 return revision;
}
