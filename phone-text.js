// Normalize phone copies, never the underlying roleplay message. Keep regular
// spacing, tabs, paragraphs, ZWJ and ZWNJ (emoji/language shaping) unchanged.
const SPECIAL_SPACE = /[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/g;
const INVISIBLE_FORMAT = /[\u2060\ufeff]/g;

export function normalizePhoneSpaces(value) {
    return String(value ?? '').replace(SPECIAL_SPACE, ' ').replace(INVISIBLE_FORMAT, '');
}

// Unicode spacing between JSON tokens is invalid JSON. Fix those separators
// while preserving quoted URLs, paths and stable identifiers byte-for-byte.
const JSON_PART = /"(?:\\[\s\S]|[^"\\])*"|[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\u2060\ufeff]/g;
const OPAQUE_KEY = /^(?:id|key|ak|handle|url|image|img|avatar|src|path|source|dedupe|marker|apiKey|token)$|(?:Id|Key|Url|URL|Path)$/;

export function parsePhoneJson(raw) {
    const text = String(raw ?? '').replace(JSON_PART, part => part.startsWith('"') ? part : ' ');
    return JSON.parse(text, (key, value) => typeof value === 'string' && !OPAQUE_KEY.test(key)
        ? normalizePhoneSpaces(value) : value);
}

// Also cover content saved before normalization was introduced. Only text nodes
// are changed: app state, message tags, attributes and input drafts stay intact.
export function normalizePhoneTextNodes(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('script,style,textarea,input,[contenteditable="true"]')) continue;
        const text = normalizePhoneSpaces(node.nodeValue);
        if (text !== node.nodeValue) node.nodeValue = text;
    }
}
