import { normalizePhoneSpaces } from './phone-text.js';
// A forward is a snapshot of explicitly shared messages, never a link giving
// access to another person's phone or the rest of the source conversation.
const clean = (value, limit = 8000) => normalizePhoneSpaces(value).trim().slice(0, limit);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

export function messageForward(value) {
    if (value?.app !== 'msg' || !Array.isArray(value.messages)) return null;
    const messages = value.messages.slice(0, 30).map(message => ({
        author: clean(message?.author, 100), text: clean(message?.text),
        ...(message?.voice ? { voice: true } : {}),
        ...(message?.photo ? { photo: clean(message.photo, 1000) } : {}),
        ...(typeof message?.image === 'string' && message.image.length < 2048 ? { image: message.image } : {}),
    })).filter(message => message.author && (message.text || message.photo || message.image));
    if (!messages.length) return null;
    return { app: 'msg', sourceApp: ['instagram', 'discord'].includes(value.sourceApp) ? value.sourceApp : 'sms',
        author: clean(value.author || messages[0].author, 100),
        text: clean(value.text || messages.map(message => message.author + ': ' + (message.text || message.photo || 'Фото')).join('\n'), 600), messages };
}

export function messageForwardText(value) {
    const forward = messageForward(value);
    return forward ? forward.messages.map(message => message.author + ': ' +
        (message.voice ? '[голосовое] ' : '') + message.text + (message.photo ? ' [фото: ' + message.photo + ']' : '')).join('\n') : '';
}

export function messageForwardHtml(value, title = 'Пересланные сообщения') {
    const forward = messageForward(value);
    if (!forward) return '';
    return '<div class="gp-message-forward"><small>' + esc(title) + '</small>' + forward.messages.map(message =>
        '<div><b>' + esc(message.author) + '</b>' + (message.image ? '<img src="' + esc(message.image) + '" alt="">' : '') +
        '<p>' + (message.voice ? '◖ ' : '') + esc(message.text || message.photo || 'Фото') + '</p></div>').join('') + '</div>';
}

export function forwardMessageSnapshot(message, { user, peer } = {}) {
    const share = message.shot || message.share;
    const attachment = share?.app === 'msg' ? messageForwardText(share) : share ?
        '[' + (share.author || '') + ': ' + (share.text || '') + ']' : '';
    return { author: message.dir === 'out' ? user : message.from || peer,
        text: [attachment, message.text || ''].filter(Boolean).join('\n'),
        ...(message.voice ? { voice: true } : {}), ...(message.photoDesc ? { photo: message.photoDesc } : {}),
        ...(message.img || share?.image ? { image: message.img || share.image } : {}) };
}
