import { nameAliases } from './state.js';

const translit = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const normalized = value => String(value || '').toLowerCase().replace(/[а-яё]/g, char => translit[char]).replace(/ya|ia/g,'ia');
const names = value => (Array.isArray(value) ? value : String(value || '').split(',')).map(value => String(value).trim()).filter(Boolean);
function aliases(values) {
    return new Set(values.flatMap(value => [value, ...nameAliases(value)]).map(normalized).filter(Boolean));
}
function occurrences(scene, values) {
    const forms=aliases(values), hits=[];
    for(const match of scene.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu)) {
        const tokenForms=aliases([match[0]]);
        const found=[...tokenForms].some(form=>forms.has(form)) || /[а-яё]/i.test(match[0])&&[...forms].some(form=>{
            const stem=form.slice(0,-1),token=normalized(match[0]);
            return stem.length>=4&&token.startsWith(stem)&&token.length>=stem.length&&token.length<=stem.length+2;
        });
        if(!found)continue;
        const before=scene.slice(Math.max(0,match.index-30),match.index),after=scene.slice(match.index+match[0].length);
        const previous=hits.at(-1);
        const absent=/(?:\bwithout|\bnot|без|кроме|нет)\s*$/iu.test(before)
            || previous?.absent&&scene.slice(previous.index+previous.name.length,match.index).trim()===''
            || /^\s*(?:за\s+кадром|не\s+(?:в\s+кадре|виден|видна)|behind\s+the\s+camera|is\s+not\s+(?:shown|visible))/iu.test(after);
        hits.push({name:match[0],absent,index:match.index});
    }
    return hits;
}

export function matchesImageIdentity(text, subject) {
    return occurrences(String(text||''),subject.names||[]).some(hit=>!hit.absent);
}

// Resolve the original description once, before translation can drop names.
// Wardrobe labels never participate in identity matching.
export function resolveImageSubjects(scene, {userName='',charName='',cardName='',settings={},meta={},library={}}={}) {
    const records=[{role:'user',name:userName,names:[userName,...names(library.user?.displayName),...names(library.user?.triggerKeywords)]},
        {role:'char',name:cardName||charName,names:[charName,cardName,...names(library.char?.displayName),...names(library.char?.triggerKeywords)]}];
    const npcByName=new Map();
    for(const npc of [...(settings.npcList||[]),...(settings.npcReferences||[])]){
        if(!npc?.name||npc.enabled===false)continue;
        const record={role:'npc',name:npc.name,names:[...names(npc.name),...names(npc.aliases)],npc};
        const linked=records.find(item=>record.names.some(name=>[...aliases([name])].some(form=>aliases(item.names).has(form))));
        if(linked){linked.names.push(...record.names);continue;}
        npcByName.set(normalized(npc.name),record);
    }
    records.push(...npcByName.values());
    for(const [key,identity] of Object.entries(meta.contactIdentities||{})){
        const values=[key,identity.originalName,...(identity.aliases||[]),meta.contactNames?.[key]].filter(Boolean);
        const linked=records.find(item=>values.some(value=>[...aliases([value])].some(form=>aliases(item.names).has(form))));
        if(linked)linked.names.push(...values);
        else records.push({role:'npc',name:identity.originalName||key,names:values});
    }
    // Preset aliases link to a known identity, never to an outfit or arbitrary order.
    for(const preset of settings.novelaiPresets||[]){
        if(preset?.enabled===false)continue;
        const values=names(preset?.name);
        const linked=records.filter(item=>values.some(value=>[...aliases([value])].some(form=>aliases(item.names).has(form))));
        if(linked.length===1)linked[0].names.push(...values);
    }
    const source=String(scene||'');
    const expanded=source.replace(/<\s*(user|char|bot)\s*>|\{\{\s*(user|char|bot)\s*\}\}/gi,(_all,a,b)=>{
        const record=records[(a||b).toLowerCase()==='user'?0:1];return record.name||record.names.find(Boolean)||_all;
    });
    const detected=records.map(record=>({...record,hits:occurrences(expanded,record.names)}));
    const pictured=detected.filter(record=>record.hits.some(hit=>!hit.absent));
    // An ambiguous short name must not silently pull in several different people.
    const subjects=pictured.filter(record=>record.hits.some(hit=>!hit.absent&&!pictured.some(other=>other!==record&&other.hits.some(candidate=>!candidate.absent&&candidate.name===hit.name))));
    for(const role of ['user','char']){
        const marker=role==='user'?/<\s*user\s*>|\{\{\s*user\s*\}\}/i:/<\s*(?:char|bot)\s*>|\{\{\s*(?:char|bot)\s*\}\}/i;
        const record=detected.find(item=>item.role===role);
        if(marker.test(source)&&record.hits.some(hit=>!hit.absent)&&!subjects.includes(record))subjects.push(record);
    }
    const absentAt=new Set(detected.flatMap(record=>record.hits.filter(hit=>hit.absent).map(hit=>hit.index)));
    const matchingScene=expanded.replace(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu,(word,index)=>absentAt.has(index)?'':word);
    return {scene:expanded,subjects,user:subjects.some(item=>item.role==='user'),char:subjects.some(item=>item.role==='char'),
        excludedUser:detected[0].hits.length>0&&detected[0].hits.every(hit=>hit.absent),
        excludedChar:detected[1].hits.length>0&&detected[1].hits.every(hit=>hit.absent),
        matchText:[matchingScene,...subjects.flatMap(item=>[item.name,...item.names])].filter(Boolean).join('\n'),
        hints:subjects.map(item=>`Requested subject ${item.role==='npc'?'NPC':`<${item.role}>`}: ${item.name}. Names in the description: ${[...new Set(item.hits.filter(hit=>!hit.absent).map(hit=>hit.name))].join(', ')}. This is one identity, not additional people.`).join('\n')};
}

// Read the extension's own active library/wardrobe selection, on each request.
export async function loadImageIdentityContext(mod,settings) {
    const result={};
    if(!mod.folder||mod.builtin)return result;
    const base='/scripts/extensions/third-party/'+mod.folder+'/src/';
    try {
        const refs=await import(base+'references.js');
        for(const role of ['user','char']){
            const key=role==='user'?await refs.getEffectiveCurrentUserReferenceKey(settings):refs.getEffectiveCurrentCharacterReferenceKey(settings);
            const entry=settings.characterReferenceLibrary?.[role==='user'?'users':'characters']?.[key];
            if(entry)result[role]={displayName:entry.displayName,triggerKeywords:entry.triggerKeywords,
                description:[entry.primary?.enabled!==false?entry.primary?.description:'',...(entry.appearanceItems||[]).filter(item=>item.enabled!==false).map(item=>item.description)].filter(Boolean).join('\n')};
        }
    }catch{/* Older forks have no unified library. Presets and phone contacts still work. */}
    try {
        const wardrobe=await import(base+'wardrobe.js');
        result.outfitUser=wardrobe.getActiveOutfitDescription?.('user')||'';
        result.outfitChar=wardrobe.getActiveOutfitDescription?.('bot')||'';
    }catch{/* Wardrobe is optional. */}
    return result;
}
