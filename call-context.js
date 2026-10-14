import { getMeta, getThread, getPhoneMessageText, stripThink, resolveContactKey, contactOriginalName, getRpDateTime, keyOf } from './state.js';
import { logReq } from './debug-log.js';

function clip(value,limit){
    const text=String(value||'').trim();if(text.length<=limit)return text;
    const marker='\n[… omitted to fit the call context …]\n',head=Math.floor((limit-marker.length)*.65);
    return text.slice(0,head)+marker+text.slice(-(limit-marker.length-head));
}
function plain(value){return stripThink(String(value||'')).replace(/<!--[\s\S]*?-->/g,'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').trim();}
function cardName(card){return String(card?.name||card?.data?.name||'').trim();}
function characterCards(ctx,key){
    const list=Array.isArray(ctx.characters)?ctx.characters:[];
    const active=ctx.characterId!==undefined&&ctx.characterId!==null?list[ctx.characterId]:null;
    const group=ctx.groupId?(ctx.groups||[]).find(g=>String(g.id)===String(ctx.groupId)):null;
    const members=group?list.filter(c=>(group.members||[]).includes(c.avatar)):[];
    // Only cards in this roleplay are relevant; a namesake in another chat is not this contact.
    const available=[...new Set([active,...members].filter(Boolean))];
    const recipient=available.find(c=>resolveContactKey(cardName(c))===key);
    return [...new Set([recipient,active,...(active||recipient?[]:members.slice(0,3))].filter(Boolean))].map(card=>({card,index:list.indexOf(card),recipient:card===recipient}));
}
function substitute(ctx,text,name){
    try{
        if(ctx.substituteParamsExtended)return String(ctx.substituteParamsExtended(String(text||''),{char:name,user:ctx.name1||'User'}));
        return String(ctx.substituteParams?ctx.substituteParams(String(text||'')):text||'');
    }catch{return String(text||'');}
}
function fieldsFor(ctx,item){
    const card=item.card,data=card.data||{};let resolved={};
    try{resolved=ctx.getCharacterCardFields?.({chid:item.index})||{};}catch{/* Raw V1/V2 fields remain available. */}
    const group=!!ctx.groupId;
    const field=(name,raw)=>substitute(ctx,(!group&&resolved[name])||raw,cardName(card));
    return {
        name:cardName(card),
        description:field('description',card.description||data.description),
        personality:field('personality',card.personality||data.personality),
        scenario:field('scenario',ctx.chatMetadata?.scenario||card.scenario||data.scenario),
        examples:field('mesExamples',ctx.chatMetadata?.mes_example||card.mes_example||data.mes_example),
        notes:field('charDepthPrompt',data.extensions?.depth_prompt?.prompt)
    };
}
function formatCard(fields,recipient){
    const sections=[['DESCRIPTION',fields.description,12000],['PERSONALITY',fields.personality,3500],['SCENARIO',fields.scenario,4000],['DIALOGUE EXAMPLES / VOICE',fields.examples,4000],['CHARACTER NOTES',fields.notes,3000]];
    return '=== '+(recipient?'CALLED CHARACTER CARD':'CURRENT ROLEPLAY CHARACTER CARD — background, not necessarily the person on the phone')+' '+JSON.stringify(fields.name)+' ===\n'+
        sections.filter(([,text])=>text).map(([label,text,budget])=>label+':\n'+clip(text,budget)).join('\n\n');
}
function recentHistory(ctx){
    const rows=[];
    for(const message of ctx.chat||[]){
        if(!message||message.is_system)continue;
        const text=plain(getPhoneMessageText(message));if(!text)continue;
        rows.push({speaker:message.is_user?(ctx.name1||'User'):(message.name||ctx.name2||'Character'),text});
    }
    const chosen=[];let remaining=26000;
    for(const row of rows.slice(-40).reverse()){
        const prefix=row.speaker+': ';
        if(remaining<prefix.length+120)break;
        const text=clip(row.text,Math.min(6500,remaining-prefix.length-2));
        chosen.unshift(prefix+text);remaining-=prefix.length+text.length+2;
    }
    return {count:chosen.length,text:chosen.join('\n\n')};
}
function memory(ctx){
    for(let i=(ctx.chat||[]).length-1;i>=0;i--){
        const summary=ctx.chat[i]?.extra?.memory;
        if(typeof summary==='string'&&summary.trim())return clip(plain(summary),6000);
    }
    const summary=ctx.extensionPrompts?.['1_memory']?.value;
    return typeof summary==='string'?clip(plain(summary),6000):'';
}
export function loreText(result){
    const values=[result?.worldInfoBefore,result?.worldInfoAfter];
    const strings=value=>{
        if(typeof value==='string')return value;
        if(Array.isArray(value))return value.map(strings).filter(Boolean).join('\n');
        return value&&typeof value==='object'?strings(value.entries||value.content||value.text):'';
    };
    for(const key of ['worldInfoExamples','worldInfoDepth','anBefore','anAfter'])values.push(strings(result?.[key]));
    for(const value of Object.values(result?.outletEntries||{}))values.push(strings(value));
    if(!values.some(Boolean))values.push(result?.worldInfoString);
    return [...new Set(values.filter(Boolean))].join('\n');
}
export async function buildPhoneCallContext(contact,transcript=[],utterance=''){
    const ctx=SillyTavern.getContext(),root=getMeta(),key=resolveContactKey(contact.key||contact.name),thread=getThread(key);
    const original=contactOriginalName(key,contact.originalName||contact.name),label=thread?.name||contact.name||original;
    const items=characterCards(ctx,key),cards=items.map(item=>({item,fields:fieldsFor(ctx,item)}));
    const sub=text=>substitute(ctx,text,ctx.name2||original),history=recentHistory(ctx),summary=memory(ctx);
    let persona='';
    try{persona=ctx.getCharacterCardFields?.()?.persona||sub('{{persona}}');}catch{/* No card API on older hosts. */}
    if(persona==='{{persona}}')persona='';
    const sms=(thread?.messages||[]).slice(-12).map(m=>(m.dir==='out'?(ctx.name1||'User'):original)+': '+plain(m.text)).join('\n');
    const blocks=[
        'You are continuing a private roleplay PHONE CALL as '+JSON.stringify(original)+'. Use the character definition and established events below as canon. Speak only for that person in the requested JSON format.',
        'CONTACT IDENTITY: canonical character '+JSON.stringify(original)+'; permanent key '+JSON.stringify(key)+'; saved by the user as '+JSON.stringify(label)+'. The saved name is their personal label for the same person, not a new identity. Know how the user named this contact.',
        cards.map(({item,fields})=>formatCard(fields,item.recipient)).join('\n\n')
    ];
    if(persona)blocks.push('=== USER PERSONA ===\n'+clip(persona,4000));
    if(summary)blocks.push('=== EXISTING STORY SUMMARY / MEMORY ===\n'+summary);
    if(history.text)blocks.push('=== RECENT ROLEPLAY HISTORY — chronological, up to 40 messages ===\n'+history.text);
    if(sms)blocks.push('=== PRIVATE MESSAGES WITH THIS CONTACT ===\n'+clip(sms,6000));
    let lore='';
    try{
        const {getWorldInfoPrompt}=await import('../../../world-info.js');
        if(typeof getWorldInfoPrompt==='function'){
            const focus='Phone conversation with '+original+'. '+transcript.slice(-6).map(t=>plain(t.text)).join('\n')+'\n'+plain(utterance);
            const scanData={personaDescription:persona,characterDescription:cards.map(c=>c.fields.description).join('\n'),characterPersonality:cards.map(c=>c.fields.personality).join('\n'),
                characterDepthPrompt:cards.map(c=>c.fields.notes).join('\n'),scenario:cards.map(c=>c.fields.scenario).join('\n'),creatorNotes:'',trigger:'normal'};
            const messages=[focus,...(ctx.chat||[]).filter(m=>m&&!m.is_system).slice(-40).map(m=>plain(getPhoneMessageText(m))).filter(Boolean).reverse()];
            const result=await getWorldInfoPrompt(messages,Math.max(2048,Math.min(32768,Number(ctx.maxContext)||8192)),true,scanData);
            lore=clip(sub(loreText(result)),8000);
        }
    }catch(e){console.warn('[GlassPhone] call lorebook context:',e);}
    if(getMeta()!==root)throw new Error('Чат изменился во время подготовки звонка.');
    if(lore)blocks.push('=== WORLD / LOREBOOK — relevant activated entries ===\n'+lore);
    const time=getRpDateTime();
    if(time)blocks.push('=== CURRENT IN-WORLD TIME ===\n'+JSON.stringify(time)+'. This is the roleplay clock; do not replace it with the computer date.');
    blocks.push('KNOWLEDGE AND CONTINUITY: These materials guide the author; the person on the phone only knows what they learned or witnessed in the story and their own messages. Do not reveal other people’s private thoughts or messages. Keep established relationships, commitments, recent events and their own voice. When another character’s card supplies background, do not adopt that character’s identity. Never invent a past event to fill missing context.');
    logReq('контекст звонка','карточки: '+cards.length+' · история: '+history.count+' сообщ. · память: '+(summary?'да':'нет')+' · лорбук: '+lore.length+' симв.');
    return blocks.filter(Boolean).join('\n\n');
}

