export const SMS_REACTIONS = [
    ['heart','❤️','сердечко'],['like','👍','лайк'],['laugh','😂','смех'],['wow','😮','вау'],
    ['sad','😢','грусть'],['angry','😡','злость'],['fire','🔥','огонь'],['love','🥰','любовь'],
    ['cry','😭','слёзы'],['skull','💀','умер со смеху'],['clap','👏','аплодисменты'],['party','🎉','ура'],
    ['eyes','👀','любопытство'],['think','🤔','думаю'],['kiss','💋','поцелуй'],['hug','🫂','обнимаю'],
    ['dislike','👎','не нравится'],['sick','🤢','фу'],['shrug','🤷','не знаю'],['sparkles','✨','красота'],
    ['poop','💩','какашка'],
].map(([id,emoji,ru])=>({id,emoji,ru}));

const appleCodes=['2764-fe0f','1f44d','1f602','1f62e','1f622','1f621','1f525','1f970','1f62d','1f480','1f44f','1f389','1f440','1f914','1f48b','1fac2','1f44e','1f922','1f937','2728','1f4a9'];
export function appleReaction(reaction){
    const value=typeof reaction==='string'?reaction:reaction?.emoji||reaction?.id;
    const found=SMS_REACTIONS.find(r=>r.id===value||r.emoji.replace(/\uFE0F/g,'')===String(value).replace(/\uFE0F/g,''));
    const emoji=found?.emoji||value||'';
    if(!/^[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]+$/u.test(emoji))return '';
    const index=SMS_REACTIONS.indexOf(found),code=index>=0?appleCodes[index]:emoji==='💔'?'1f494':null;
    const src=code?new URL('./assets/apple-reactions/'+code+'.png',import.meta.url).href:'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/'+[...emoji].map(c=>c.codePointAt(0).toString(16)).join('-')+'.png';
    return '<img class="gp-apple-emoji" src="'+src+'" alt="'+emoji+'" draggable="false">';
}

export function appleReactionText(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
        .replace(/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*/gu,emoji=>appleReaction(emoji));
}

export function smsReactions(message) {
    const values = Array.isArray(message?.reactions) ? message.reactions : [message?.react];
    return [...new Set(values)].filter(id=>SMS_REACTIONS.some(reaction=>reaction.id===id));
}

export function toggleSmsReaction(message,id) {
    const values=smsReactions(message);
    return values.includes(id) ? values.filter(value=>value!==id) : [...values,id];
}

// Media generated from RP tags is hydrated from a cache keyed by the complete
// tag. Editing reactions changes that key: persist the displayed attachment.
export function preserveSmsMedia(tag,message) {
    for(const [source,target] of [['img','img'],['mediaKind','mediaKind'],['stickerId','stickerId'],
        ['stickerCaption','stickerCaption'],['photoDesc','photo'],['shot','shot']]) {
        if(message[source]!=null && tag[target]==null)tag[target]=message[source];
    }
    return tag;
}
