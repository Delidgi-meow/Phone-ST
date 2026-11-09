// ExtBlocks stores content separately and mirrors it into display_text.
// Keep repeated events inside one source, but do not count storage mirrors twice.
const TEL_TAG = /<!--\s*tel:[\s\S]*?-->/gi;

export function readPhoneMessage(message, externalBlocks = true, clean = text => text) {
    const main = typeof message?.mes === 'string' ? message.mes : '';
    if (!externalBlocks) return clean(main);
    const counts = new Map();
    const merge = (text, tagsOnly = false) => {
        const local = new Map();
        const cleaned = clean(String(text || '')).replace(TEL_TAG, tag => {
            const n = (local.get(tag) || 0) + 1;
            local.set(tag, n);
            return n > (counts.get(tag) || 0) ? tag : '';
        });
        for (const [tag, n] of local) counts.set(tag, Math.max(n, counts.get(tag) || 0));
        return tagsOnly ? (cleaned.match(TEL_TAG) || []).join('\n') : cleaned;
    };
    return [merge(main), merge(message?.extra?.extblocks), merge(message?.extra?.display_text, true)]
        .filter(Boolean).join('\n');
}

export function phoneMessageSources(message) {
    const sources = [];
    const add = (object, key) => {
        if (typeof object?.[key] === 'string') sources.push({ object, key, text: object[key] });
    };
    add(message, 'mes');
    add(message?.extra, 'extblocks');
    add(message?.extra, 'display_text');
    return sources;
}

function replaceVisibleTag(text, tag, replacement) {
    const visible = text.replace(/<(think|thinking|reasoning|analysis|reflection)[^>]*>[\s\S]*?<\/\1>/gi,
        block => ' '.repeat(block.length));
    const index = visible.indexOf(tag);
    return index < 0 ? text : text.slice(0, index) + replacement + text.slice(index + tag.length);
}

// Only synchronize the active swipe; other variants retain their own images.
export function replacePhoneMessageTag(message, tag, replacement) {
    if (!tag) return false;
    let changed = false;
    for (const { object, key, text } of phoneMessageSources(message)) {
        const updated = replaceVisibleTag(text, tag, replacement);
        if (updated !== text) {
            object[key] = updated;
            changed = true;
        }
    }
    if (!changed) return false;
    const swipeId = message.swipe_id;
    if (swipeId !== undefined) {
        if (typeof message.swipes?.[swipeId] === 'string') {
            message.swipes[swipeId] = replaceVisibleTag(message.swipes[swipeId], tag, replacement);
        }
        // ExtBlocks can omit storage for swipe 0. Initialize its mirror from
        // the current message so switching away and back retains the image.
        if (typeof message.extra?.extblocks === 'string') {
            if (!message.swipe_info) message.swipe_info = [];
            if (!message.swipe_info[swipeId]) message.swipe_info[swipeId] = { extra: {} };
            if (!message.swipe_info[swipeId].extra) message.swipe_info[swipeId].extra = {};
        }
        const extra = message.swipe_info?.[swipeId]?.extra;
        for (const key of ['extblocks', 'display_text']) {
            if (!extra) continue;
            if (typeof message.extra?.[key] === 'string') extra[key] = message.extra[key];
            else if (typeof extra[key] === 'string') extra[key] = replaceVisibleTag(extra[key], tag, replacement);
        }
    }
    return true;
}
