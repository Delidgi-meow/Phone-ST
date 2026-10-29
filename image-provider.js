// Request-local adapter for modular image extensions. Never mutates their settings.
function throwIfAborted(signal) {
    if (signal?.aborted) throw signal.reason || new DOMException('Генерация отменена', 'AbortError');
}

function waitForRetry(ms, signal) {
    return new Promise((resolve, reject) => {
        throwIfAborted(signal);
        const abort = () => { clearTimeout(timer); reject(signal.reason || new DOMException('Генерация отменена', 'AbortError')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
        signal?.addEventListener('abort', abort, { once: true });
    });
}

// Match the extension's pipeline: collection belongs to the provider, even
// when an OpenAI-compatible proxy uses an unknown/custom model identifier.
// NovelAI alone explicitly disables collection for unsupported model versions.
export function canCollectPhoneReferences(provider,settings){
    return settings.apiType!=='novelai'||provider.supportsReferences?.(settings)!==false;
}

export async function imageProviderSupportsReferences(mod,settings){
    if(mod.folder&&!mod.builtin){
        try{const providers=await import('/scripts/extensions/third-party/'+mod.folder+'/src/providers.js');const provider=providers.resolveActiveProvider(settings);return !!provider&&canCollectPhoneReferences(provider,settings);}catch{return false;}
    }
    const model=String(settings.naisteraModel||settings.model||'').toLowerCase();
    if(settings.apiType==='naistera')return ['grok','nano banana','grok-pro'].includes(model);
    if(settings.apiType==='novelai')return false;
    return !/dall[ -]?e/.test(model);
}

export async function generateIsolatedImage(mod, prompt, style, onStatus, options, sceneReferences = null) {
    const settings = options.providerSettings;
    // Channels request 4:3, but NovelAI's resolution presets do not support it.
    // Keep supported phone formats; otherwise use this request's profile ratio.
    if (settings.apiType === 'novelai' && options.aspectRatio) {
        const supportedAspects = ['1:1', '2:3', '3:2', '9:16', '16:9'];
        if (!supportedAspects.includes(options.aspectRatio)) {
            options = { ...options, aspectRatio: supportedAspects.includes(settings.novelaiAspectRatio)
                ? settings.novelaiAspectRatio : '1:1' };
        }
    }
    throwIfAborted(options.signal);
    let providers;
    try {
        if (!mod.folder) throw new Error('No modular provider API');
        providers = await import('/scripts/extensions/third-party/' + mod.folder + '/src/providers.js');
    } catch (_error) {
        // Other forks can expose only a pipeline. Pass the same request-local configuration.
        return mod.pipeline.generateImageWithRetry(prompt, style, onStatus, options);
    }
    providers.validateSettings(settings);
    const provider = providers.resolveActiveProvider(settings);
    if (!provider) throw new Error('Провайдер картинок не настроен');
    const refsEnabled = canCollectPhoneReferences(provider,settings);
    const matched = !refsEnabled?[]:['contacts','description','subjects'].includes(options.referencePolicy)?(sceneReferences||[]):!options.referencePolicy?[...(sceneReferences || []), ...(mod.parser?.getMatchedAdditionalReferences?.(prompt) || [])]:[];
    const seen = new Set();
    const matchedAdditionalRefs = matched.filter(ref => {
        const key = JSON.stringify([ref.name, ref.imagePath]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    let references=[];
    if(refsEnabled&&options.referencePolicy!=='none'){
        const contactRefs=options.phoneContactReferences||[];
        if(contactRefs.length){
            // Use the provider's own encoding and sizing (including NovelAI Precise Reference).
            const avatarSettings={...structuredClone(settings),sendCharAvatar:false,sendUserAvatar:false,naisteraSendCharAvatar:false,naisteraSendUserAvatar:false,swSendOutfitImageBot:false,swSendOutfitImageUser:false,autoDetectNames:false,imageContextEnabled:false,npcList:[],npcReferences:[],characterReferenceLibrary:{characters:{},users:{}},activeCustomReferenceProfiles:{char:'',user:''}};
            references=await provider.collectReferences({prompt,messageId:options.messageId,matchedAdditionalRefs:contactRefs,providerOptions:{...options,providerSettings:avatarSettings}});
            if(!references.length)throw new Error('Не удалось загрузить аватарку контакта для референса. Проверь изображение в профиле контакта.');
        }
        throwIfAborted(options.signal);
        references.push(...await provider.collectReferences({ prompt, messageId: options.messageId, matchedAdditionalRefs, providerOptions: options }));
        let limit=Math.max(1,Number(provider.capabilities?.referencesMaxCount)||16);
        if(settings.apiType==='gemini')try{const caps=await import('/scripts/extensions/third-party/'+mod.folder+'/src/providers/caps.js');limit=caps.getGeminiCapabilities(settings.model).maxReferences||limit;}catch{/* Use the provider's declared limit. */}
        const seenImages=new Set();references=references.filter(ref=>{const key=typeof ref==='string'?ref:ref.image;if(!key||seenImages.has(key))return false;seenImages.add(key);return true;}).slice(0,limit);
    }
    throwIfAborted(options.signal);
    let requestPrompt = prompt;
    if (settings.apiType !== 'gemini' && refsEnabled&&!options.referencePolicy) {
        const refs = await import('/scripts/extensions/third-party/' + mod.folder + '/src/references.js');
        const library = await refs.buildActiveCharacterLibraryPromptBlock(settings, prompt);
        if (library) requestPrompt += '\n\n' + library;
    }
    const retries = Math.max(0, Math.min(10, Number(settings.maxRetries) || 0));
    for (let attempt = 0; ; attempt++) {
        throwIfAborted(options.signal);
        onStatus?.(attempt ? 'Повторная генерация…' : 'Генерирую…');
        try {
            const result = await provider.generate({ prompt: requestPrompt, style, references, options: { ...options, matchedAdditionalRefs } });
            throwIfAborted(options.signal);
            return result;
        } catch (error) {
            throwIfAborted(options.signal);
            if (error?.name === 'AbortError' || error?.retryable === false || attempt >= retries) throw error;
            const delay = Math.min(60000, Math.max(0, Number(settings.retryDelay) || 1000) * (2 ** attempt));
            await waitForRetry(delay, options.signal);
        }
    }
}
