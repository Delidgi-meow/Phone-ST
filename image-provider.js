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

export async function imageProviderSupportsReferences(mod,settings){
    if(mod.folder&&!mod.builtin){
        try{const providers=await import('/scripts/extensions/third-party/'+mod.folder+'/src/providers.js');const provider=providers.resolveActiveProvider(settings);if(provider)return provider.supportsReferences?.(settings)!==false;}catch{/* A single-file fork uses the built-in driver below. */}
    }
    const model=String(settings.naisteraModel||settings.model||'').toLowerCase();
    if(settings.apiType==='naistera')return ['grok','nano banana','grok-pro'].includes(model);
    if(settings.apiType==='novelai')return false;
    return !/dall[ -]?e/.test(model);
}

export async function generateIsolatedImage(mod, prompt, style, onStatus, options, sceneReferences = null) {
    const settings = options.providerSettings;
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
    const refsEnabled = provider.supportsReferences?.(settings)!==false;
    const matched = refsEnabled&&!options.referencePolicy ? [...(sceneReferences || []), ...(mod.parser?.getMatchedAdditionalReferences?.(prompt) || [])] : [];
    const seen = new Set();
    const matchedAdditionalRefs = matched.filter(ref => {
        const key = JSON.stringify([ref.name, ref.imagePath]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    const references = refsEnabled&&options.referencePolicy!=='none' ? await provider.collectReferences({ prompt, messageId: options.messageId, matchedAdditionalRefs, providerOptions: options }) : [];
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
