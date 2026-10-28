export const CHAT_MEDIA_DIRECTIVE='CHAT MEDIA: Characters may sometimes send memes if that fits their personality, sense of humor and the conversation. A meme is an IMAGE plus a FUNNY CAPTION; its visual style may range from photorealism to chibi. Use "meme":{"description":"what is shown in the funny image","caption":"the funny text written on the image","style":"visual style, from realism to chibi"}. For a chibi sticker use "sticker":{"description":"person or creature, expression and gesture","caption":"optional short text"}. The description is drawing instructions, not text to print; only caption is lettering. These fields produce real image attachments. Existing stickers may be reused with "sticker":{"id":"saved sticker id"}; use only supplied saved ids. Do not request sexualized chibi.';
export function chatMedia(value){
    const kind=value?.sticker?'sticker':value?.meme?'meme':'';if(!kind)return null;
    const raw=value[kind];if(!raw||typeof raw!=='object')return null;
    if(kind==='sticker'&&typeof raw.id==='string')return {kind,id:raw.id.slice(0,100)};
    if(typeof raw.description!=='string'||!raw.description.trim())return null;
    return {kind,description:raw.description.trim().slice(0,1400),caption:typeof raw.caption==='string'?raw.caption.trim().slice(0,100):'',style:kind==='meme'&&typeof raw.style==='string'?raw.style.trim().slice(0,100):''};
}
export const chatMediaKey=(index,tag)=>JSON.stringify([index,tag]);
export function stickerPromptRules(caption=''){
    const text=String(caption||'').trim().slice(0,100);
    return 'STICKER OUTPUT: one chibi illustration filling the ENTIRE circular sticker area on a square canvas. The artwork must occupy 94–98% of the canvas diameter. Frame the character large: head, expression and gesture fill the circle, not a tiny full-body figure in its center. Keep all essential features and any permitted lettering fully INSIDE the circular crop with only a 3% safety inset. One circle only: NO nested badge, NO small sticker inside a larger circle, NO surrounding white disk, NO wide empty border or blank outer margin. Extend the artwork/background to the circle edge; never crop the face, hands or allowed words at that edge. The drawing description, character names, emotions and instructions are VISUAL DIRECTIONS ONLY, never lettering. No description labels, subtitles, speech bubbles, explanatory text, watermark or UI. '+(text?'The ONLY permitted lettering is exactly '+JSON.stringify(text)+'. Do not add, paraphrase or extend it. Keep that short caption inside the circle.':'NO TEXT AT ALL: no words, names, letters or captions anywhere.');
}
export function saveSticker(meta,{image,description='',caption=''}){
    meta.stickers||=[];
    const existing=meta.stickers.find(item=>item.image===image);if(existing)return existing;
    const sticker={id:'st-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),image,description,caption,at:Date.now()};
    meta.stickers.unshift(sticker);return sticker;
}
