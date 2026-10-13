const TAGS = /<!--\s*tel:(sent|sms):(\{[\s\S]*?\})\s*-->/gi;
const OUTGOING = /<!--\s*tel:out:(\{[\s\S]*?\})\s*-->/gi;
const norm = value => String(value || '').trim().replace(/^@+/, '').toLocaleLowerCase();
const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parse = value => { try { return JSON.parse(value); } catch (_error) { return null; } };

export function extractRoleplaySms(text, { otherNames = [] } = {}) {
    const source = String(text || '').replace(/<!--[\s\S]*?-->|```[\s\S]*?```/g, value => ' '.repeat(value.length));
    const candidates = [];
    let ordinal = 0;
    for (const match of source.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
        const quoteIndex = ordinal++;
        const body = match[1].trim();
        if (!body || /^\[(?:СМС|SMS|Голосовое|Voice)\b/i.test(body) || /^\s*(?:const |let |var |\{|\/)/.test(body)) continue;
        const before = source.slice(Math.max(0, match.index - 180), match.index);
        const clause = before.split(/[.!?;\n]/u).at(-1) || '';
        const after = source.slice(match.index + match[0].length, match.index + match[0].length + 90);
        // Never infer an outgoing message from a received notification,
        // quoted conversation, a social post, or another person's action.
        if (/(?:прочитал[аи]?|получил[аи]?|увидел[аи]?|пришло|входящее|сообщение\s+от|смс\s+от|цитат|подпись|опубликов|(?:^|\s)пост(?:\s|$)|read\s+(?:a\s+)?message|received|caption|posted)/iu.test(clause)) continue;
        if (/(?:он|она|они|бот|персонаж|he|she|they)\s+(?:\S+\s+){0,2}(?:пишет|написал[аи]?|ответил[аи]?|отправил[аи]?|набрал[аи]?|читает|writes|texts|sent|replied)/iu.test(clause)) continue;
        if (/^\s*[,—-]?\s*(?:написал|прислал|отправил|пишет|wrote|sent)\s+(?:он|она|бот|персонаж|he|she)(?![\p{L}\p{N}_])/iu.test(after)) continue;
        if (/(?:хотел[аи]?|собирал(?:ся|ась)|думал[аи]?|черновик|не\s+(?:отправил[аи]?|написал[аи]?)|wanted\s+to|draft|did\s+not\s+send|never\s+sent)/iu.test(clause + ' ' + after)) continue;
        const actors = otherNames.flatMap(name => [name, String(name).split(/\s+/)[0]]).filter(Boolean);
        if (actors.some(name => new RegExp(`(^|[^\\p{L}])${escape(name)}\\s+(?:\\S+\\s+){0,2}(?:пишет|написал[аи]?|отправил[аи]?|ответил[аи]?|набрал[аи]?|writes|texts|sent)`, 'iu').test(clause))) continue;
        candidates.push({ quoteIndex, text: body });
    }
    return candidates;
}

export function roleplaySmsKey(quoteIndex, text) { return JSON.stringify([quoteIndex, text]); }

export function resolveRoleplaySms(userMessage, userIndex, replyText, options = {}) {
    if (!userMessage?.is_user || userMessage.is_system) return [];
    const candidates = extractRoleplaySms(userMessage.mes, options);
    if (!candidates.length) return [];
    const userNames = (options.userNames || []).map(norm);
    const isUser = name => userNames.includes(norm(name));
    const sent = new Map();
    for (const match of String(replyText || '').matchAll(TAGS)) {
        const data = parse(match[2]);
        if (!data) continue;
        if (match[1].toLowerCase() === 'sent') {
            if ((data.source !== userIndex && data.source !== userMessage.extra?.glassphoneRpSmsSource) || (data.from && !isUser(data.from))) continue;
            const candidate = candidates.find(item => item.quoteIndex === data.quoteIndex && item.text === String(data.text || '').trim());
            const target = data.chat || data.to;
            if (!candidate || typeof target !== 'string' || !target.trim() || target.length > 120 || /[\r\n]/.test(target) || (data.to && isUser(data.to))) continue;
            sent.set(candidate.quoteIndex, { ...candidate, to: String(data.to || ''), group: data.chat ? String(data.chat) : null });
        }
    }
    const hidden = new Set(userMessage.extra?.glassphoneRpSmsHidden || []);
    return [...sent.values()].filter(item => {
        const key = roleplaySmsKey(item.quoteIndex, item.text);
        return !hidden.has(key);
    });
}

// Reconcile every user turn with its current assistant replies after edits/swipes.
export function captureRoleplaySms(chat, readMessage, options = {}) {
    let changed = 0;
    const clean = text => String(text || '').replace(OUTGOING, (tag, json) => parse(json)?.origin === 'rp' ? '' : tag).trimEnd();
    for (let userIndex = 0; userIndex < chat.length; userIndex++) {
        const message = chat[userIndex];
        if (!message?.is_user || message.is_system) continue;
        let end = userIndex + 1;
        while (end < chat.length && !chat[end]?.is_user) end++;
        const replies = chat.slice(userIndex + 1, end).filter(item => item && !item.is_system).map(readMessage).join('\n');
        const outgoing = resolveRoleplaySms(message, userIndex, replies, options);
        const tags = outgoing.map(item => {
            const data = { to: item.to, text: item.text, mixed: true, origin: 'rp', quoteIndex: item.quoteIndex, rpQuote: item.text };
            if (item.group) data.group = item.group;
            const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
            return '<!--tel:out:' + json + '-->';
        }).join('\n');
        const update = text => clean(text) + (tags ? '\n' + tags : '');
        const next = update(message.mes);
        if (next === message.mes) continue;
        if (outgoing.length) {
            message.extra ||= {};
            message.extra.glassphoneRpSmsSource ??= userIndex;
        }
        message.mes = next;
        if (typeof message.extra?.display_text === 'string') message.extra.display_text = update(message.extra.display_text);
        if (typeof message.swipes?.[message.swipe_id] === 'string') message.swipes[message.swipe_id] = next;
        changed++;
    }
    return changed;
}

export function hasMixedRoleplaySms(message) {
    return [...String(message?.mes || '').matchAll(OUTGOING)].some(match => parse(match[1])?.mixed === true);
}

export function roleplaySmsDirective(chat, options = {}) {
    let source = -1;
    for (let index = chat.length - 1; index >= 0; index--) {
        if (chat[index]?.is_user && !chat[index].is_system) { source = index; break; }
    }
    if (source < 0) return '';
    const candidates = extractRoleplaySms(chat[source].mes, options);
    if (!candidates.length) return '';
    return `[MIXED ROLEPLAY + USER'S PHONE] The latest user message (source ${source}) contains these inline-backtick fragments: ${JSON.stringify(candidates)}. Determine from the scene which fragments are SMS actually SENT BY {{user}} and who receives each. For each real outgoing SMS append <!--tel:sent:{"source":${source},"quoteIndex":0,"to":"recipient name","text":"exact fragment"}--> with its actual quoteIndex and exact text. For a group use "chat":"group name". Do not invent or rephrase a sent message. Never tag drafts, received messages, quoted messages, social posts or texting by OTHER characters, even when the user narrates it. If the recipient cannot be determined, omit the tag. Continue the visible roleplay normally, including actions after the SMS; this mixed message is NOT phone-only mode. Incoming tel:sms tags must describe only messages addressed to {{user}}; include "to":"{{user}}", and never tag messages delivered to the bot or other people.\n`;
}
