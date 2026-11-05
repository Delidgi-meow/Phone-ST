export const SMS_REACTIONS = [
    ['heart','❤️','сердечко'],['like','👍','лайк'],['laugh','😂','смех'],['wow','😮','вау'],
    ['sad','😢','грусть'],['angry','😡','злость'],['fire','🔥','огонь'],['love','🥰','любовь'],
    ['cry','😭','слёзы'],['skull','💀','умер со смеху'],['clap','👏','аплодисменты'],['party','🎉','ура'],
    ['eyes','👀','любопытство'],['think','🤔','думаю'],['kiss','💋','поцелуй'],['hug','🫂','обнимаю'],
    ['dislike','👎','не нравится'],['sick','🤢','фу'],['shrug','🤷','не знаю'],['sparkles','✨','красота'],
].map(([id,emoji,ru])=>({id,emoji,ru}));

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
