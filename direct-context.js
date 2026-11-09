import { normalizePhoneSpaces } from './phone-text.js';
import { resolveContactKey } from './state.js';
import { privateThreadTurns } from './private-context.js';

// Resolve only media already attached to THIS conversation. Never read another
// person's private thread or enumerate unrelated posts as recipient knowledge.
export function directConversationMedia(thread, root, { user, peer } = {}) {
    const messages = (thread.messages || []).slice(-16).map(message => {
        if (message.dir === 'in' && String(message.source || '').startsWith('reply:')
            && directReplyRoleError({ from: peer, to: user, text: message.text || '' }, { speaker: peer, user })) {
            return { ...message, text: '[An earlier generated reply used the wrong speaker and is not a canon event.]', share: null };
        }
        const share = message.share;
        if (!share || !['st', 'ig'].includes(share.app)) return message;
        const pool = share.app === 'st' ? root.social?.stories : root.social?.igPosts;
        const source = (pool || []).find(item => item.id === share.id);
        return { ...message, share: { ...share,
            imgDesc: share.imgDesc || source?.imgDesc || '',
            image: share.image || source?.image || '',
        } };
    });
    const turns = privateThreadTurns(messages, { user, peer, limit: 16 });
    const visual = [...messages].reverse().find(message => ['st', 'ig'].includes(message.share?.app) && message.share.image);
    return { turns, image: visual?.share.image || null,
        imageContext: visual ? { app: visual.share.app, author: visual.share.author,
            text: visual.share.text, photo: visual.share.imgDesc, replyTo: !!visual.share.replyTo } : null };
}

const same = (a, b) => !!a && !!b && resolveContactKey(a) === resolveContactKey(b);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function directReplyRoleError(reply, { speaker, user, requireIdentity = true } = {}) {
    if (!reply || typeof reply !== 'object') return 'Return a JSON object.';
    if ((requireIdentity || reply.from) && !same(reply.from, speaker)) return 'The sender must be ' + JSON.stringify(speaker) + ', never the user or another character.';
    if ((requireIdentity || reply.to) && !same(reply.to, user)) return 'The recipient must be ' + JSON.stringify(user) + '.';
    if (typeof reply.text !== 'string') return 'The text must be a string.';
    const text = normalizePhoneSpaces(reply.text).trim();
    const userLabels = [user, user?.split(/\s+/)[0]].filter(name => name?.length >= 3);
    if (userLabels.some(name => new RegExp('(?:^|\\n)\\s*' + escape(name) + '\\s*[:：]', 'i').test(text))) return 'Do not write a dialogue line as the user.';
    // An explicit vocative of the sender's own name is a strong sign that the
    // model continued as the other participant (e.g. "В каком наряде, Вадим?").
    const unquoted = text.replace(/«[^»]*»|“[^”]*”|"[^"]*"/g, '');
    const labels = [speaker, speaker?.split(/\s+/)[0]].filter(name => name?.length >= 3 && !userLabels.some(label => same(label, name)));
    for (const name of labels) {
        const n = escape(name);
        if (new RegExp('^\\s*' + n + '\\s*[,!?]|,\\s*' + n + '\\s*[?!]', 'i').test(unquoted)
            && !new RegExp('(?:это\\s+я|меня\\s+зовут)[,\\s]+' + n, 'i').test(unquoted)) return 'You addressed the sender as if you were the user. Reply as ' + JSON.stringify(speaker) + ' to ' + JSON.stringify(user) + '.';
    }
    return '';
}
