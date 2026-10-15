import { getMeta, resolveContactKey, contactOriginalName, displayName, textMentionsName } from './state.js';
import { containsPresetName } from './image-context.js';

const clean=value=>String(value||'').trim();
const portrait=/селфи|автопортрет|портрет|\bselfie\b|\bportrait\b|head.?and.?shoulders/i;
function namesFor(meta,key){
    const handle=clean(meta.handles?.[key]);
    return [...new Set([contactOriginalName(key,key),displayName(key,key),key,handle,handle.replace(/^@/,''),...(meta.contactIdentities?.[key]?.aliases||[])].map(clean).filter(Boolean))];
}
function outsideFrame(scene,names){
    const lower=scene.toLowerCase();
    return names.some(name=>{
        const at=lower.indexOf(name.toLowerCase());if(at<0)return false;
        return /(?:без|нет|without|not)\s*$/.test(lower.slice(Math.max(0,at-25),at))
            || /^\s*(?:не\s+(?:в\s+кадре|виден|видна)|за\s+кадром|behind\s+the\s+camera|is\s+not\s+(?:shown|visible))/.test(lower.slice(at+name.length));
    });
}
export function contactImageSubjects(post,avatarFor){
    if(post.kind==='shop')return [];
    const meta=getMeta(),authorKey=String(post.ak||'').startsWith('contact:')?resolveContactKey(post.ak.slice(8)):'';
    const forced=post.contactAvatarKey?resolveContactKey(post.contactAvatarKey):'';
    const keys=new Set([...Object.keys(meta.avatars||{}).filter(key=>key!=='__user__'),...(authorKey?[authorKey]:[]),...(forced?[forced]:[])].map(resolveContactKey));
    const scene=clean(post.imgDesc),candidates=[];
    for(const key of keys){
        if(!key||key.startsWith('group:'))continue;
        const src=avatarFor(key);if(!src&&!(forced===key&&post.contactAppearance))continue;
        const names=namesFor(meta,key),profile=forced===key&&post.contactAppearance?post.contactAppearance:meta.avatarProfiles?.[key]||{};
        if(outsideFrame(scene,names)&&forced!==key)continue;
        const exact=names.some(name=>containsPresetName(scene,name)),loose=names.some(name=>textMentionsName(scene,name));
        const authorPortrait=key===authorKey&&(post.kind==='avatar'||portrait.test(scene+' '+(post.framing||'')));
        const authorPerson=key===authorKey&&!post.blog&&!post.mms&&!/незнаком|прохож|чужой|stranger|someone else/i.test(scene)
            && /(?:^|\s)(?:мужчина|женщина|девушка|парень|человек|man|woman|girl|boy|person)(?=\s|[,.:;]|$)/i.test(scene);
        const score=forced===key?4:exact?3:authorPortrait||authorPerson?2:loose?1:0;
        if(score)candidates.push({key,name:contactOriginalName(key,key),names,src,appearance:clean(profile.appearance),tags:clean(profile.tags),score});
    }
    const firstNames=item=>item.names.map(name=>name.toLowerCase().split(/\s+/)[0]);
    const exact=candidates.filter(item=>item.score>=3);
    const definite=candidates.filter(item=>item.score>1&&!(item.score===2&&exact.some(other=>other.key!==item.key)));
    const loose=candidates.filter(item=>item.score===1&&!definite.some(other=>firstNames(other).some(name=>firstNames(item).includes(name))));
    if(loose.length===1)definite.push(loose[0]);
    else if(loose.length>1&&!definite.some(item=>item.key===authorKey)){const author=loose.find(item=>item.key===authorKey);if(author)definite.push(author);}
    return definite.sort((a,b)=>(b.key===forced)-(a.key===forced)||(b.key===authorKey)-(a.key===authorKey)||b.score-a.score);
}

// A phone avatar replaces other image-library versions of that same person.
// Keep styles and unrelated lorebook/object references intact.
export function contactImageSettings(settings,subjects){
    const copy=structuredClone(settings),names=new Set(subjects.flatMap(item=>item.names).map(value=>value.toLowerCase()));
    const matches=value=>String(value||'').split(',').some(name=>names.has(name.trim().toLowerCase()));
    for(const field of ['npcList','npcReferences'])if(Array.isArray(copy[field]))copy[field]=copy[field].filter(item=>!matches(item.name)&&!(Array.isArray(item.aliases)?item.aliases:String(item.aliases||'').split(',')).some(matches));
    if(Array.isArray(copy.novelaiPresets))copy.novelaiPresets=copy.novelaiPresets.filter(item=>!matches(item.name));
    if(Array.isArray(copy.additionalReferences))copy.additionalReferences=copy.additionalReferences.filter(item=>!matches(item.name));
    if(Array.isArray(copy.lorebooks))copy.lorebooks=copy.lorebooks.map(book=>({...book,refs:(book.refs||[]).filter(item=>!matches(item.name))}));
    return copy;
}

export function contactReferenceHints(subjects){
    return subjects.filter(item=>item.appearance||item.tags).map(item=>item.name+': '+(item.appearance||item.tags)).join('\n');
}
export function contactReferenceMatches(references,subjects){
    const names=new Set(subjects.flatMap(item=>item.names).map(name=>name.toLowerCase()));
    return (references||[]).filter(item=>!String(item.name||'').split(',').some(name=>names.has(name.trim().toLowerCase())));
}
