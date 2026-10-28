import { normalizePhoneSpaces, parsePhoneJson } from './phone-text.js';
import { getPhoneMessageText, stripThink } from './state.js';
import { messageForward } from './message-forward.js';

// Private app records are not shared story history. The recipient's own
// conversation is supplied separately, including only attached forward excerpts.
export function publicRoleplayMessage(message) {
    const text = getPhoneMessageText(message);
    return !/<!--\s*tel:(?:priv\b|out:|sms:|sent:|igdm:)|\[(?:СМС|SMS|Голосовое|Voice)\s*(?:→|в\s+чат|to\s+chat)/i.test(text);
}

// A story turn may end with phone tags. Keep the scene itself for private
// conversations; dropping the whole turn would erase the character's memories.
// Public-feed generation deliberately keeps the stricter filter above.
export function privateRoleplayText(message) {
    if (!message || message.is_system) return '';
    const source = normalizePhoneSpaces(stripThink(getPhoneMessageText(message)));
    if (/<!--\s*tel:(?:log|priv)\s*-->/i.test(source)) return '';
    if (/^\s*\[(?:СМС|SMS|Голосовое|Voice)\s*(?:→|в\s+чат|to\s+chat)/i.test(source.replace(/<!--[\s\S]*?-->/g, ''))) return '';
    const privateTexts = new Set();
    for (const hit of source.matchAll(/<!--\s*tel:(out|sms|igdm):(\{[\s\S]*?\})\s*-->/gi)) {
        let data;
        try { data = parsePhoneJson(hit[2]); } catch { continue; }
        // Native phone sends are stored separately from narrative. Mixed RP
        // captures retain the surrounding actions after their quote is removed.
        if (message.is_user && hit[1].toLowerCase() === 'out' && !data.mixed && data.origin !== 'rp') return '';
        for (const value of [data.text, data.rpQuote]) if (typeof value === 'string' && value.trim()) privateTexts.add(value.trim());
        if (data.shot?.app === 'msg' && Array.isArray(data.shot.messages)) for (const quoted of data.shot.messages)
            if (typeof quoted?.text === 'string' && quoted.text.trim()) privateTexts.add(quoted.text.trim());
    }
    let text = source.replace(/<!--[\s\S]*?-->/g, '');
    for (const privateText of privateTexts) {
        if (privateText.length >= 20) text = text.split(privateText).join('[private phone message omitted]');
        else for (const [open, close] of [['«','»'], ['"','"'], ['“','”']])
            text = text.split(open + privateText + close).join(open + '[private phone message omitted]' + close);
    }
    return text.trim();
}

export function privateThreadTurns(messages, { user, peer, limit = 24 } = {}) {
    const rows = (messages || []).slice(-limit);
    return rows.map((message, index) => {
        const share = message.shot || message.share;
        const forward = messageForward(share);
        const shared = forward ? {
            app: 'msg', messages: forward.messages.map(({ author, text, voice, photo, image }) =>
                ({ author, text, ...(voice ? { voice: true } : {}), ...(photo || image ? { photo: photo || 'Shared photo; visual details unavailable.' } : {}) })),
        } : share ? { app: share.app, author: normalizePhoneSpaces(share.author), text: normalizePhoneSpaces(share.text),
            ...(share.replyTo ? { replyTo: true } : {}),
            ...(share.imgDesc ? { photo: normalizePhoneSpaces(share.imgDesc) } : share.image ? { photo: 'Shared image; visual details unavailable unless attached to this request.' } : {}),
        } : null;
        return {
            role: message.dir === 'out' ? 'user' : 'contact',
            speaker: normalizePhoneSpaces(message.dir === 'out' ? user : message.from || peer),
              ...(message.actor?{accountActor:normalizePhoneSpaces(message.actor),accountOwner:user}:{}),
              ...(message.mediaKind?{mediaKind:message.mediaKind}:{}),
            text: normalizePhoneSpaces(message.text).slice(0, index === rows.length - 1 ? 8000 : 2400),
            ...(message.voice ? { voice: true } : {}),
            ...(message.photoDesc ? { photo: message.photoDesc } : message.img ? { photo: 'Attached photo; details unavailable unless included in this request.' } : {}),
            ...(shared ? { shared } : {}),
        };
    });
}
