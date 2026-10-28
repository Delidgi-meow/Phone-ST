import { getMeta, getSettings, saveMeta } from './state.js';

// Cache the prepared request, including block options, before calling the image
// provider. A failed image request can then be retried without another text call.
function identity(post, cancelKey, blockKey = getSettings().imageGenBlockKey || '') {
    const input = JSON.stringify([
        blockKey,
        post.kind || 'ig', post.ak || '', post.author || '', post.imgDesc || '',
        post.caption || '', post.framing || '', post.aspect || '', !!post.mms,
        !!post.stream, !!post.tryOn, post.personaAvatarId || '',
        post.contactAppearance || null, post.preparedImageTags || '',post.mediaKind||'',post.stickerCaption||'',
    ]);
    const key = JSON.stringify([post.kind || 'ig', cancelKey || post.id || input]);
    return { key, input };
}

export function savedImagePrompt(post, cancelKey = null, blockKey) {
    const { key, input } = identity(post, cancelKey, blockKey);
    const cached = getMeta().imagePrompts?.[key];
    return cached?.input === input && (post.imageSubjectSignature === undefined || post.imageSubjectSignature === cached.subjectSignature) && typeof cached.prompt === 'string' && cached.prompt.trim()
        ? cached : null;
}

export function saveImagePrompt(post, cancelKey, prompt, instruction, blockKey) {
    const { key, input } = identity(post, cancelKey, blockKey), root = getMeta();
    if (!root.imagePrompts || typeof root.imagePrompts !== 'object' || Array.isArray(root.imagePrompts)) root.imagePrompts = {};
    root.imagePrompts[key] = { input, subjectSignature:post.imageSubjectSignature, prompt, instruction: instruction ? { ...instruction } : null, at: Date.now() };
    const entries = Object.entries(root.imagePrompts).sort((a, b) => Number(b[1]?.at || 0) - Number(a[1]?.at || 0));
    for (const [oldKey] of entries.slice(250)) delete root.imagePrompts[oldKey];
    saveMeta();
}
