// Pure request helpers. Image extension settings are always copied for one request.
export function shopImagePost(item,{tryOn=false,personaName='',personaAvatarId=''}={}){
    return {kind:'shop',ak:tryOn?'user':'random',author:tryOn?personaName:'',aspect:'1:1',tryOn,personaAvatarId,productName:item.name,productDescription:item.desc||'',
        imgDesc:(tryOn?'Show '+personaName+' wearing this exact catalog item: ':'Show only this catalog item: ')+item.name+'. '+(item.desc||''),
        framing:tryOn?'Clothing fitting, show the exact garment clearly on the persona. Frame the body area wearing the item; trousers and shoes require a full-body view. Preserve the persona’s face, hair and body, replace their original outfit with this garment. No isolated face portrait, no unrelated clothing, no text or watermark.':'Catalog product display, the entire item centered on a plain background, accurate color, material and cut. No people, no faces, no portraits, no models, no body parts, no text or watermark.'};
}
export function personaImageTags(settings,avatarId,name=''){
    const users=settings?.characterReferenceLibrary?.users||{};
    const entry=users['avatar:'+avatarId]||users[settings?.activeCustomReferenceProfiles?.user];
    const parts=[entry?.primary?.enabled!==false?entry?.primary?.description:'',...(entry?.appearanceItems||[]).filter(item=>item.enabled!==false).map(item=>item.description)];
    const legacy=settings?.avatarItems?.find(item=>item.id===settings.activeAvatarUser);if(legacy?.appearance)parts.push(legacy.appearance);
    for(const preset of settings?.novelaiPresets||[]){if(preset.enabled===false)continue;const names=String(preset.name||'').split(',').map(value=>value.trim().toLowerCase());if(names.some(value=>value===String(name).toLowerCase()||value==='{{user}}'))parts.push(preset.value||preset.tags);}
    return [...new Set(parts.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))].join(', ');
}
export function isolateShopImageSettings(settings,{tryOn=false,avatarId='',personaName=''}={}){
    const copy=structuredClone(settings||{});
    Object.assign(copy,{sendCharAvatar:false,naisteraSendCharAvatar:false,sendUserAvatar:!!tryOn,naisteraSendUserAvatar:!!tryOn,swSendOutfitImageBot:false,swSendOutfitImageUser:false,imageContextEnabled:false,autoDetectNames:false,npcList:[],npcReferences:[],additionalReferences:[],lorebooks:[],activePrefixId:'',prefixes:[],activeSuffixId:'',suffixes:[],novelaiPresets:[],optionalAvatarSending:false});
    if(tryOn&&avatarId){
        const key='custom:phone-shop-persona';copy.characterReferenceLibrary={characters:{},users:{[key]:{custom:true,displayName:personaName,primary:{enabled:true,imagePath:'/User Avatars/'+encodeURIComponent(avatarId),description:personaImageTags(settings,avatarId,personaName)},appearanceItems:[]}}};
        copy.activeCustomReferenceProfiles={char:'',user:key};copy.useActiveUserPersonaAvatar=false;
    }else{copy.characterReferenceLibrary={characters:{},users:{}};copy.activeCustomReferenceProfiles={char:'',user:''};}
    return copy;
}

// Keep the literal product identity ahead of the model's decorative suggestions.
export function shopProductTags(post){
    const name=String(post.productName||post.imgDesc||'').toLowerCase();
    const types=[[/водолазк|turtleneck/,['turtleneck sweater','long sleeves','high collar']],[/пиджак|блейзер|blazer/,['blazer','lapels','long sleeves']],[/брюк|trousers|pants/,['pants']],[/джинс|jeans/,['jeans']],[/пальто|overcoat/,['coat','long sleeves']],[/плать|dress/,['dress']],[/юбк|skirt/,['skirt']],[/рубаш|shirt/,['shirt']],[/футбол|t-shirt/,['t-shirt']],[/свитер|джемпер|sweater/,['sweater']],[/кроссов|sneakers/,['sneakers']],[/туфл|heels/,['shoes']],[/сапог|boots/,['boots']],[/сумк|handbag/,['handbag']],[/рюкзак|backpack/,['backpack']],[/серьг|моносерьг|earring/,['earrings']]];
    const tags=[...(types.find(([pattern])=>pattern.test(name))?.[1]||[])];
    for(const[pattern,tag]of [[/ч[её]рн|black/,'black'],[/бел|white/,'white'],[/серебр|silver/,'silver'],[/красн|red/,'red'],[/син|blue/,'blue'],[/беж|молочн|ivory|beige/,'beige'],[/кашемир|cashmere/,'cashmere'],[/шерст|wool/,'wool'],[/кожан|leather/,'leather']])if(pattern.test(name+' '+post.productDescription))tags.push(tag);
    return tags;
}
export function shopBooruPrompt(raw,post,appearance=''){
    const values=String(raw||'').replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```[\s\S]*?\n|```/g,'').replace(/^\s*(?:tags?|danbooru tags?)\s*:\s*/i,'').split(/[\r\n,]+/).map(value=>value.trim().toLowerCase()).filter(value=>value&&value.length<85&&/^[a-z0-9_ ():\-.+\\/]+$/.test(value));
    if(values.length<3)throw new Error('Не удалось собрать Danbooru-теги товара. Нажми перерисовку, чтобы повторить; запрос картинки не отправлен.');
    const anchors=shopProductTags(post),source=String(post.productName||post.imgDesc||'')+' '+String(post.productDescription||'');
    const tags=values.filter(value=>!(!post.tryOn&&/(?:\b[1-9](?:girl|boy|girls|boys)\b|portrait|\b(?:hair|eyes|face|skin)\b)/.test(value)));
    if(anchors.length&&!/рюкзак|сумк|брон|тактич|военн|backpack|handbag|armor|tactical/i.test(source))for(let i=tags.length-1;i>=0;i--)if(/\b(?:backpack|handbag|bag|armor|tactical|military)\b/.test(tags[i]))tags.splice(i,1);
    const framing=post.tryOn?['clothing focus',/брюк|обув|кроссов|туфл|сапог|pants|shoes|boots|sneakers/i.test(source)?'full body':'cowboy shot']:['no humans','still life','product focus','simple background','white background'];
    const traits=post.tryOn?String(appearance||'').split(',').map(value=>value.trim()).filter(value=>/^[a-z0-9_ ():\-.+\\/]+$/i.test(value)):[];
    return [...new Set([...framing,...anchors,...tags,...traits])].join(', ');
}
