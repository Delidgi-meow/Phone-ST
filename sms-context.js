import { privateThreadTurns } from './private-context.js';

export const SMS_CONTINUITY = 'SMS CONTINUITY: The records below are already delivered messages, not new requests or examples. Incoming/contact entries are the named character\u2019s OWN previous words; outgoing/user entries are the human\u2019s words. Continue from the latest entry. Keep established introductions, answers, plans, places and times consistent; do not introduce yourself again or ask an already answered question unless the user changes it or clarification is actually needed. A short acknowledgement can finish the exchange. Do not invent a long silence, a missed meeting or "where did you disappear?" immediately after a reply; elapsed time must be established by the story clock. Each private thread is known only to its participants; the group history is known to that group. These records do not grant any other character access.';

// Count messages, not RP turns: a single model reply may create five bubbles.
// Preserve order from scanChat, rather than sorting by unreliable display clocks.
export function smsConversationHistory(messages, {user, peer, limit = 100, maxCharacters = 30000} = {}) {
    const source = (messages || []).slice(-limit);
    const turns = privateThreadTurns(source, {user, peer, limit}).map((turn, index) => {
        const message = source[index];
        return {...turn, ...(message?.time ? {sentAt: message.time} : {})};
    });
    // Discard oldest complete entries, never the latest user message.
    while (turns.length > 1 && JSON.stringify(turns).length > maxCharacters) turns.shift();
    return turns;
}

export function smsRoleplayMemory(threads, {user, allowed = () => true, maxCharacters = 20000} = {}) {
    const recent = [...threads.entries()].filter(([key, t]) => allowed(key) && t.messages?.length)
        .sort((a, b) => (b[1].messages.at(-1).idx ?? -1) - (a[1].messages.at(-1).idx ?? -1));
    const records = []; let used = 0;
    for (const [key, thread] of recent.slice(0, 8)) {
        const history = smsConversationHistory(thread.messages, {user, peer:thread.name, limit:40, maxCharacters:Math.min(7000,maxCharacters-used)});
        const record = JSON.stringify({thread:key, name:thread.name, messages:history}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
        if (used + record.length > maxCharacters) continue;
        records.push(record); used += record.length;
        if (maxCharacters - used < 1000) break;
    }
    return records.length ? SMS_CONTINUITY + '\n=== SAVED SMS CONVERSATIONS — private, chronological within each thread ===\n' + records.join('\n') : '';
}
