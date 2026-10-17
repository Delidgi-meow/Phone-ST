import { getPhoneMessageText } from './state.js';
import { messageForward } from './message-forward.js';

// Private app records are not shared story history. The recipient's own
// conversation is supplied separately, including only attached forward excerpts.
export function publicRoleplayMessage(message) {
    const text = getPhoneMessageText(message);
    return !/<!--\s*tel:(?:priv\b|out:|sms:|sent:|igdm:)|\[(?:СМС|SMS|Голосовое|Voice)\s*(?:→|в\s+чат|to\s+chat)/i.test(text);
}

export function privateThreadTurns(messages, { user, peer, limit = 24 } = {}) {
    const rows = (messages || []).slice(-limit);
    return rows.map((message, index) => {
        const share = message.shot || message.share;
        const forward = messageForward(share);
        const shared = forward ? {
            app: 'msg', messages: forward.messages.map(({ author, text, voice, photo, image }) =>
                ({ author, text, ...(voice ? { voice: true } : {}), ...(photo || image ? { photo: photo || 'Shared photo; visual details unavailable.' } : {}) })),
        } : share ? { app: share.app, author: share.author, text: share.text, photo: share.imgDesc || '' } : null;
        return {
            speaker: message.dir === 'out' ? user : message.from || peer,
            text: String(message.text || '').slice(0, index === rows.length - 1 ? 8000 : 2400),
            ...(message.voice ? { voice: true } : {}),
            ...(message.photoDesc ? { photo: message.photoDesc } : message.img ? { photo: 'Attached photo; details unavailable unless included in this request.' } : {}),
            ...(shared ? { shared } : {}),
        };
    });
}
