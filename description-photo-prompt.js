import { matchesImageIdentity } from './image-subjects.js';

// A manual photo has its own scene. Never expand arbitrary ST/ExtBlocks
// macros here: they can read chat history, previous images or the main prompt.
export function descriptionBlockMessages(block, post, imageContext = '', identities = {}) {
    const scene = String(post.imgDesc || '').trim();
    if (!scene) throw new Error('Опиши, что должно быть на фото.');
    const values = {
        phoneScene: scene, phoneAuthor: post.author || '', phoneApp: post.kind || 'ig',
        phoneCaption: '', phoneImageContext: imageContext, user: post.author || '', char: '',
    };
    const formatText = text => String(text || '').replace(/\{\{([\s\S]*?)\}\}/g,
        (_match, key) => values[key.trim()] ?? '');
    const mentions = (text, name) => String(name || '').split(',').map(alias => alias.trim()).filter(Boolean)
        .some(alias => new RegExp(`(^|[^\\p{L}\\p{N}_])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(text));
    const picturedChar=post.imageSubjects?.subjects?.find(subject=>subject.role==='char');
    if (post.imageSubjects?.char || mentions(scene, identities.charName)) values.char = picturedChar?.name||identities.charName;
    const appearances = [];
    for (const item of block.context || []) {
        // Read only literal identity specifications. Do not call ContextService:
        // history and previous blocks must remain absent from a manual photo.
        if (item?.disabled || item?.type !== 'text' || !item.text) continue;
        const rawName = String(item.name || '').trim();
        // In a group, the pictured author can differ from the active ST card.
        // Never relabel that active card's appearance as another participant.
        if(/^\{\{\s*char\s*\}\}$/i.test(rawName)&&picturedChar&&identities.charName&&!matchesImageIdentity(identities.charName,picturedChar))continue;
        const name = formatText(rawName).trim();
        const isUser = /^\{\{\s*user\s*\}\}$/i.test(rawName)
            || (name && mentions(post.author || '', name));
        const pictured = name && (mentions(scene, name) || post.imageSubjects?.subjects?.some(subject=>matchesImageIdentity(name,subject)));
        if (!isUser && !pictured) continue;
        const text = formatText(item.text).trim();
        if (text) appearances.push(`${name || post.author} — identity/appearance only, use ONLY if this person is requested in the photo:\n${text}`);
    }
    const appearance = [...appearances, imageContext].filter(Boolean).join('\n\n');
    return [
        { role: 'system', content: `Create one image instruction for a standalone manually described photo. The requested photo is the ONLY source of scene, people, actions, props and setting. This is not a snapshot or continuation of roleplay. Do not add the roleplay partner, NPCs or bystanders unless the requested photo includes them. A single named person means one person, solo. Use supplied appearance details only for people requested in the photo. Do not infer the scene from those details.
The block specification below is a reference for output syntax, image tags and style ONLY. Disregard its instructions to use latest RP, chat history, previous blocks, mandatory named characters or missing contexts. History and previous image contexts are intentionally unavailable. Dedicated appearance specifications supplied below are authoritative for the requested people: preserve their hair color, eye color and all compatible physical traits, including weighted tag syntax. These specifications never require adding someone to the frame. The requested description overrides conflicting scene instructions. Preserve the configured output format, return exactly one image instruction, no commentary.` },
        { role: 'user', content: `Output format specification:\n${formatText(block.prompt)}\n\nBlock template:\n${formatText(block.template)}\n\nRelevant appearance (only for requested subjects):\n${appearance}\n\nFraming: ${post.framing || ''}\nRequested photo — sole scene source:\n${scene}` },
    ];
}
