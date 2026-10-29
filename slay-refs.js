// SLAY Images (slay_image_gen) не отдаёт модульный провайдер, поэтому телефон
// рисует через встроенный драйвер. Здесь читаем данные SLAY так же, как их
// читает сам SLAY: рефы лежат ПО ПЕРСОНАЖАМ (perCharacterRefs[имя]), а плоские
// charRef/userRef/npcReferences — хвост старых версий, обычно пустой.

export function isSlayBucket(bucket) {
    return !!bucket && typeof bucket === 'object'
        && ('slayStyle' in bucket || (!!bucket.perCharacterRefs && typeof bucket.perCharacterRefs === 'object'));
}

function activeCharName() {
    try { const ctx = SillyTavern.getContext(); return ctx.characters?.[ctx.characterId]?.name || ''; } catch (e) { return ''; }
}

function hasImage(ref) { return !!(ref && ref.enabled !== false && (ref.imagePath || ref.imageBase64 || ref.imageData)); }

function ownRefs(bucket, name) {
    const r = name && bucket.perCharacterRefs?.[name];
    return {
        charRef: r?.charRef || null,
        userRef: r?.userRef || null,
        npcReferences: Array.isArray(r?.npcReferences) ? r.npcReferences : [],
    };
}

function groupMembers(ctx) {
    const g = (ctx.groups || []).find(x => String(x.id) === String(ctx.groupId));
    return (g?.members || []).map(a => (ctx.characters || []).find(c => c.avatar === a)?.name).filter(Boolean);
}

// Группа, как в SLAY: лицо бота — у автора поста, лицо юзерки — групповой
// слот (иначе слот юзерки автора), остальные участники и все их NPC — по
// имени. Старые общие рефы в группе не берём никогда.
function groupRefs(bucket, ctx, author) {
    const members = groupMembers(ctx);
    const low = s => String(s || '').trim().toLowerCase();
    const me = members.find(m => low(m) === low(author)
        || slayNames(ownRefs(bucket, m).charRef?.name).some(n => low(n) === low(author))) || '';
    const own = ownRefs(bucket, me);
    const grpUser = bucket.slayGroupRefs?.[ctx.groupId]?.userRef;
    const npcs = [], seen = new Set();
    const add = (ref, extra) => {
        if (!hasImage(ref)) return;
        const key = (ref.imagePath || '') + '|' + low(ref.name);
        if (seen.has(key)) return;
        seen.add(key);
        npcs.push({ ...ref, ...extra });
    };
    for (const m of members) {
        if (m === me) continue;
        const r = ownRefs(bucket, m).charRef;
        const names = String(r?.name || '').trim();
        add(r, { name: slayNames(names).some(n => low(n) === low(m)) ? names : [m, names].filter(Boolean).join(', '), _member: m });
    }
    for (const m of [me, ...members.filter(x => x !== me)].filter(Boolean)) {
        for (const npc of ownRefs(bucket, m).npcReferences) add(npc, {});
    }
    return {
        charRef: me && hasImage(own.charRef) ? { ...own.charRef, name: own.charRef.name || me } : null,
        userRef: hasImage(grpUser) ? grpUser : own.userRef,
        npcReferences: npcs,
        member: me,
    };
}

// author — кто прислал пост (нужен только в групповом чате)
export function slayActiveRefs(bucket, author = '') {
    if (!isSlayBucket(bucket)) return null;
    try {
        const ctx = SillyTavern.getContext();
        if (ctx.groupId !== undefined && ctx.groupId !== null && ctx.groupId !== '') return groupRefs(bucket, ctx, author);
    } catch (e) { return null; }
    const name = activeCharName();
    const own = name && bucket.perCharacterRefs?.[name];
    // Legacy global slots apply only to legacy-only settings. If another
    // character has scoped slots, never borrow a stale global face for this one.
    const scoped = bucket.perCharacterRefs && Object.keys(bucket.perCharacterRefs).length > 0;
    const src = own || (scoped ? {} : bucket);
    return {
        charRef: hasImage(src.charRef) ? src.charRef : null,
        userRef: hasImage(src.userRef) ? src.userRef : null,
        npcReferences: Array.isArray(src.npcReferences) ? src.npcReferences.filter(hasImage) : [],
        member: '',
    };
}

// Имена из слотов SLAY для распознавания «кто в кадре» (resolveImageSubjects)
export function slayIdentityLibrary(refs) {
    const lib = {};
    if (refs?.userRef?.name) lib.user = { displayName: slayNames(refs.userRef.name).join(', ') };
    if (refs?.charRef?.name) lib.char = { displayName: slayNames(refs.charRef.name).join(', ') };
    return lib;
}

// В одном слоте SLAY может быть несколько имён: «Mike, Майк»
export function slayNames(raw) {
    return String(raw || '').split(/[,;|/]+/).map(s => s.trim()).filter(s => s.length >= 2);
}

export function slayRefSrc(ref) {
    if (!ref || ref.enabled === false) return '';
    if (ref.imagePath) return String(ref.imagePath);
    const b64 = String(ref.imageBase64 || ref.imageData || '');
    if (!b64) return '';
    return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
}

// Выбранный в SLAY стиль. Даже если SLAY пишет стиль в тогл пресета, телефону
// он нужен текстом: свой промпт телефон собирает сам и пресет не видит.
export function slayStyleText(bucket) {
    if (!isSlayBucket(bucket)) return '';
    if (bucket.slayStyle) return String(bucket.slayStyle).trim();
    const custom = (bucket.slayCustomStyles || []).find(s => s && s.id === bucket.slayStyleCustomId);
    const desc = String(custom?.desc || '').trim();
    // Свой стиль, вставленный готовым <image_gen>-блоком, — инструкция для текстовой модели, не стиль
    if (!desc || /^<image_gen/i.test(desc)) return '';
    return desc.replace(/(^|\n|\.\s*)avoid\s*:[\s\S]*$/i, '$1').trim();
}

// Текущий образ из гардероба SLAY: картинка (base64) и описание.
// who: 'bot' | 'user'; member — участник группы (в обычном чате пусто).
// Галочки гардероба уважаем — их ставит пользователь.
export async function slayOutfit(who, member = '', includeImage = true) {
    const out = { image: '', desc: '' };
    try {
        const w = window.slayWardrobe;
        if (!w?.isReady?.()) return out;
        const sw = SillyTavern.getContext().extensionSettings?.slay_wardrobe || {};
        if (includeImage && sw[who === 'bot' ? 'sendOutfitImageBot' : 'sendOutfitImageUser'] !== false) out.image = (await w.getActiveOutfitBase64(who, member || undefined)) || '';
        if (sw.sendOutfitDescription !== false) out.desc = String(w.getActiveOutfitDescription?.(who, member || undefined) || '').trim();
    } catch (e) { /* без гардероба */ }
    return out;
}
