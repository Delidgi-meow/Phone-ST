import assert from 'node:assert/strict';
import test from 'node:test';
import { generateIsolatedImage } from '../image-provider.js';

async function forwardedOptions(settings, aspectRatio) {
    const options = Object.freeze({ providerSettings: Object.freeze(settings), aspectRatio });
    const mod = { pipeline: { generateImageWithRetry: async (prompt, style, onStatus, forwarded) => forwarded } };
    const forwarded = await generateIsolatedImage(mod, 'test scene', null, null, options);
    assert.equal(options.aspectRatio, aspectRatio, 'caller options must not change');
    assert.equal(forwarded.providerSettings, settings, 'profile settings must not be replaced');
    return forwarded;
}

test('channel 4:3 falls back to the selected NovelAI profile ratio and retains its size', async () => {
    for (const novelaiResolution of ['small', 'normal', 'big']) {
        const forwarded = await forwardedOptions({ apiType: 'novelai', novelaiAspectRatio: '3:2', novelaiResolution }, '4:3');
        assert.equal(forwarded.aspectRatio, '3:2');
        assert.equal(forwarded.providerSettings.novelaiResolution, novelaiResolution);
    }
});

test('supported phone formats retain priority over the NovelAI profile ratio', async () => {
    for (const aspectRatio of ['1:1', '2:3', '3:2', '9:16', '16:9']) {
        const forwarded = await forwardedOptions({ apiType: 'novelai', novelaiAspectRatio: '1:1' }, aspectRatio);
        assert.equal(forwarded.aspectRatio, aspectRatio);
    }
});

test('invalid NovelAI profile ratios fall back to square', async () => {
    for (const novelaiAspectRatio of [undefined, '', '4:3', 'auto']) {
        const forwarded = await forwardedOptions({ apiType: 'novelai', novelaiAspectRatio }, '4:3');
        assert.equal(forwarded.aspectRatio, '1:1');
    }
});

test('other unsupported phone formats also use the NovelAI profile ratio', async () => {
    const forwarded = await forwardedOptions({ apiType: 'novelai', novelaiAspectRatio: '2:3' }, '3:4');
    assert.equal(forwarded.aspectRatio, '2:3');
});

test('other providers keep the channel format', async () => {
    for (const apiType of ['gemini', 'openai', 'naistera']) {
        const forwarded = await forwardedOptions({ apiType }, '4:3');
        assert.equal(forwarded.aspectRatio, '4:3');
    }
});

test('an omitted phone ratio stays omitted', async () => {
    const forwarded = await forwardedOptions({ apiType: 'novelai', novelaiAspectRatio: '3:2' }, undefined);
    assert.equal(forwarded.aspectRatio, undefined);
});
