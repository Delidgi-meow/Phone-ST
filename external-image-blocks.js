import { extensionNames, extension_settings } from '../../../extensions.js';
import { getSettings, stripThink } from './state.js';

// Read every saved set, not only the currently active ExtBlocks preset.
export function collectImageBlocks(settings, character) {
    const entries = [];
    const add = (blocks, source, owner, set = null) => {
        for (const block of Array.isArray(blocks) ? blocks : []) {
            if (!block?.name || (block.block_type && block.block_type !== 'generated')) continue;
            entries.push({
                key: JSON.stringify([source, owner, block.id || block.name]),
                label: `${owner} → ${block.name} · ${block.api_preset || settings?.active_api_preset || 'big'}${block.disabled ? ' (авто отключено)' : ''}`,
                block, set,
            });
        }
    };
    for (const set of settings?.sets || []) add(set.global_blocks, 'set', set.name, set);
    if (character) add(character.data?.extensions?.ExtBlocks, 'character', character.avatar || character.name);
    return entries;
}

export function listPhoneImageBlocks() {
    const context = SillyTavern.getContext();
    return collectImageBlocks(extension_settings.ExtBlocks,
        context.characters?.[context.characterId]);
}

let bridgePromise = null;
async function loadExtBlocksBridge() {
    if (bridgePromise) return bridgePromise;
    bridgePromise = (async () => {
        const folders = (extensionNames || []).filter(name => typeof name === 'string' && name.startsWith('third-party/'));
        folders.sort((a, b) => Number(/ext.?blocks/i.test(b)) - Number(/ext.?blocks/i.test(a)));
        for (const folder of folders) {
            const base = `/scripts/extensions/${folder}/src`;
            try {
                const [{ BlockService }, { ContextService }, { MacroService }, { ApiService }, { extStates }] = await Promise.all([
                    import(`${base}/services/BlockService.js`),
                    import(`${base}/services/ContextService.js`),
                    import(`${base}/services/MacroService.js`),
                    import(`${base}/services/ApiService.js`),
                    import(`${base}/core/state.js`),
                ]);
                if (BlockService && ContextService && MacroService && ApiService) return { BlockService, ContextService, MacroService, ApiService, extStates };
            } catch (_error) { /* Another extension, not ExtBlocks. */ }
        }
        throw new Error('ExtBlocks не найден. Включите установленное расширение внешних блоков.');
    })().catch(error => { bridgePromise = null; throw error; });
    return bridgePromise;
}

function imageInstruction(data) {
    if (!data || typeof data.prompt !== 'string' || !data.prompt.trim()) return null;
    return {
        prompt: data.prompt.trim(),
        style: typeof data.style === 'string' ? data.style : '',
        aspectRatio: data.aspect_ratio || data.aspectRatio || null,
        imageSize: data.image_size || data.imageSize || null,
        quality: data.quality || null,
        preset: data.preset || null,
    };
}

export async function parseExternalImagePrompt(raw, parser, blockName) {
    let text = stripThink(String(raw || '')).trim();
    if (!text) throw new Error('Внешний блок вернул пустой промпт.');
    if (typeof parser?.parseImageTags === 'function') {
        const tags = await parser.parseImageTags(text, { forceAll: true });
        if (tags.length > 1) throw new Error('Внешний блок вернул несколько картинок. Для телефона нужна одна.');
        if (tags.length === 1 && tags[0].prompt?.trim()) return imageInstruction(tags[0]);
    }
    // A block may return JSON inside an img instruction, a legacy IMG tag,
    // or its own XML wrapper. Parse balanced JSON, including escaped quotes.
    const instructions = [];
    for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
        let depth = 0, quoted = false, escaped = false;
        for (let index = start; index < text.length; index++) {
            const char = text[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
            } else if (char === '"') quoted = true;
            else if (char === '{') depth++;
            else if (char === '}' && --depth === 0) {
                try {
                    const instruction = imageInstruction(JSON.parse(text.slice(start, index + 1)));
                    if (instruction) instructions.push(instruction);
                } catch (_error) { /* Try the next object. */ }
                start = index;
                break;
            }
        }
    }
    if (instructions.length > 1) throw new Error('Внешний блок вернул несколько картинок. Для телефона нужна одна.');
    if (instructions.length === 1) return instructions[0];
    if (/data-iig-instruction|\[IMG:GEN|^\s*\{/i.test(text)) {
        throw new Error('Не удалось прочитать промпт картинки из выбранного блока.');
    }
    text = text.replace(/^```[^\n]*\n?/, '').replace(/```\s*$/, '').trim();
    const closingName = String(blockName || '').split(/\s+/)[0];
    if (closingName && text.startsWith(`<${closingName}`) && text.endsWith(`</${closingName}>`)) {
        text = text.slice(text.indexOf('>') + 1, -(`</${closingName}>`.length)).trim();
    }
    const instruction = imageInstruction({ prompt: text });
    if (!instruction) throw new Error('Внешний блок вернул пустой промпт.');
    return instruction;
}

export async function generatePhoneBlockPrompt(post, { imageContext = '', parser, onStatus, signal, blockKey = getSettings().imageGenBlockKey } = {}) {
    const selectedKey = blockKey;
    if (!selectedKey) return null;
    const selected = listPhoneImageBlocks().find(entry => entry.key === selectedKey);
    if (!selected) throw new Error('Выбранный внешний блок недоступен. Выберите блок заново в настройках телефона.');
    const { BlockService, ContextService, MacroService, ApiService, extStates } = await loadExtBlocksBridge();
    const context = SillyTavern.getContext();
    const messageId = Math.max(0, (context.chat?.length || 0) - 1);
    const block = { ...selected.block, context: selected.block.context || [] };
    const available = selected.set
        ? [...(context.characters?.[context.characterId]?.data?.extensions?.ExtBlocks || []), ...(selected.set.global_blocks || [])]
        : BlockService.getAllBlocks();
    const allBlocks = [...new Map(available.map(item => [item.name, item])).values()];
    const scene = post.imgDesc || post.caption || '';
    const macros = {
        phoneScene: scene, phoneAuthor: post.author || '', phoneApp: post.kind || 'ig',
        phoneCaption: post.caption || '', phoneImageContext: imageContext,
    };
    onStatus?.(`Составляю промпт: ${block.name}…`);
    if (signal?.aborted) throw new DOMException('Генерация остановлена', 'AbortError');
    let messages = BlockService.getBlocksFullPrompt([block], messageId, allBlocks, macros);
    // ExtBlocks normally requires a character; phone drafts in a temporary
    // chat still need the selected block's template and configured context.
    if (!messages.length) {
        messages = [{ role: 'system', content: `Block(s) prompt:\n${context.substituteParams(block.prompt || '', { dynamicMacros: macros })}\n\nBlock(s) template:\n${context.substituteParams(block.template || '', { dynamicMacros: macros })}` },
            ...ContextService.getBlockCombinedContext(block, messageId, allBlocks, macros)];
    }
    messages.push({ role: 'user', content: `Create exactly one image instruction in the configured block’s format; no commentary. Use the requested photo, not another roleplay moment. Describe visible subjects only; captions and app names are context, not text/UI to draw unless explicitly requested.\nApp: ${post.kind || 'ig'}; photographer: ${post.author || ''}\nBehind camera: ${post._behindCamera ? post._cameraName || post.author || 'author' : 'unspecified'}\n${post.mms ? 'MMS: the user is the recipient, outside the frame unless explicitly pictured.\n' : ''}Requested photo:\n${scene}\nFraming: ${post.framing || ''}\n${imageContext ? 'Relevant appearance/preset details (only for pictured subjects):\n' + imageContext : ''}` });
    messages = await MacroService.checkAllMacros(messages);
    if (signal?.aborted) throw new DOMException('Генерация остановлена', 'AbortError');
    const presetName = block.api_preset || extension_settings.ExtBlocks.active_api_preset;
    const preset = ApiService.getApiPreset(presetName);
    // Capture this request's controller from the unmodified ExtBlocks API.
    // Aborting the phone must not abort a later request started elsewhere.
    const pending = ApiService.generateBlocks(messages, presetName);
    const requestController = extStates?.abortController;
    const abort = () => requestController?.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let data;
    try { data = await pending; }
    finally { signal?.removeEventListener('abort', abort); }
    if (signal?.aborted) throw new DOMException('Генерация остановлена', 'AbortError');
    return await parseExternalImagePrompt(ApiService.extractMessageFromData(data, preset), parser, block.name);
}
