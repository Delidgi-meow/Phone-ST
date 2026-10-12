// This module only reads image extension data, so the phone follows changes
// to its enabled presets and lorebooks on every generation.
export function containsPresetName(text, name) {
    const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return !!escaped && new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(text);
}

// Keep Cyrillic preset substitution inside the phone extension.
export function applyPhoneImagePresets(prompt, settings) {
    let result = String(prompt || '');
    for (const preset of settings?.novelaiPresets || []) {
        const value = String(preset?.value ?? (typeof preset?.tags === 'string' ? preset.tags : '')).trim();
        if (!preset || preset.enabled === false || !preset.name || !value) continue;
        const escaped = String(preset.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'giu');
        result = result.replace(regex, (_match, boundary) => boundary + value);
    }
    return result;
}

// The original image pipeline matches on the final prompt. Mark entries
// already matched against the untranslated scene for this phone request.
export function phoneLorebookOverrides(settings, matchedReferences) {
    if (!matchedReferences?.length) return {};
    const matched = ref => matchedReferences.some(entry => entry.name === ref.name && entry.imagePath === ref.imagePath);
    const prepare = refs => (refs || []).map(ref => matched(ref)
        ? { ...ref, matchMode: 'always', secondaryKeys: '' } : ref);
    const overrides = {};
    if (Array.isArray(settings?.lorebooks)) overrides.lorebooks = settings.lorebooks.map(book => ({ ...book, refs: prepare(book.refs) }));
    if (Array.isArray(settings?.additionalReferences)) overrides.additionalReferences = prepare(settings.additionalReferences);
    return overrides;
}

export function buildPhoneImageContext(scene, settings, parser) {
    const result = { hints: '', presetTags: [], lorebookDescriptions: [], references: null };
    if (!settings) return result;
    const hints = [];
    for (const preset of settings.novelaiPresets || []) {
        const value = String(preset?.value ?? (typeof preset?.tags === 'string' ? preset.tags : '')).trim();
        if (!preset || preset.enabled === false || !value || !containsPresetName(scene, preset.name)) continue;
        result.presetTags.push(value);
        hints.push(`${preset.name}: ${value}`);
    }
    // Use the extension's own matching rules (aliases, regex, secondary keys,
    // priority and "always") for lorebook entries and reference images.
    if (typeof parser?.getMatchedAdditionalReferences === 'function') {
        result.references = parser.getMatchedAdditionalReferences(scene);
    }
    const books = Array.isArray(settings.lorebooks) ? settings.lorebooks : [];
    const refs = books.length
        ? books.filter(book => book?.enabled !== false).flatMap(book => book.refs || [])
        : (settings.additionalReferences || []);
    const ordered = refs.filter(ref => ref?.enabled !== false && ref.name)
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    for (const ref of ordered) {
        const primary = ref.matchMode === 'always' || (typeof parser?.promptMatchesPrimaryKey === 'function'
            ? parser.promptMatchesPrimaryKey(scene, ref.name, ref.useRegex)
            : String(ref.name).split(',').some(name => containsPresetName(scene, name.trim())));
        const secondary = typeof parser?.promptMatchesAllSecondaryKeys === 'function'
            ? parser.promptMatchesAllSecondaryKeys(scene, ref.secondaryKeys)
            : String(ref.secondaryKeys || '').split(',').filter(key => key.trim())
                .every(key => containsPresetName(scene, key.trim()));
        if (!primary || !secondary || !ref.description) continue;
        const description = String(ref.description).trim();
        hints.push(`${ref.name}: ${description}`);
        // The provider appends descriptions for image refs itself. Only text
        // entries need to be added here, to avoid duplicate prompt blocks.
        if (!ref.imagePath || settings.novelaiEnableReferences === false
            || !result.references?.some(match => match.id === ref.id && match.name === ref.name)) {
            result.lorebookDescriptions.push(description);
        }
    }
    result.presetTags = [...new Set(result.presetTags)];
    result.lorebookDescriptions = [...new Set(result.lorebookDescriptions)];
    result.hints = [...new Set(hints)].join('\n');
    return result;
}
