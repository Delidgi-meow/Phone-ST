
import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../script.js';
import { getSettings, getMeta, scanChat, getBlockedSmsKeys, keyOf, EXT_NAME, getRoleplaySmsOptions, contactIdentityPrompt } from './state.js';
import { hasMixedRoleplaySms, roleplaySmsDirective } from './roleplay-sms.js';
import { getSocialActivitySummary } from './social.js';
import { getBankSummaryLine, bankInjectRule } from './bank.js';
import { notesInjectBlock } from './notes.js';
import { channelInjectLine, anonInjectLine } from './channels.js';
import { plansInjectLine, plansInjectRule } from './plans.js';
import { callsInjectLine, callsInjectRule } from './calls.js';
import { twitchInjectLine } from './twitch.js';
import { tinderInjectLine, inAppMatchNames } from './tinder.js';
import { pendingConsequences } from './social-events.js';

const CHAT_KEY = EXT_NAME;
const SYS_KEY = EXT_NAME + '_sys';

// Телефонный ход: последнее сообщение юзера — смс/голосовое из телефона.
// Полные правила «phone-only mode» (самый жирный блок директивы) нужны ТОЛЬКО
// в этот момент; в обычном ходе они балласт. 'now' — отвечать тегами,
// 'justEnded' — прошлый ход был смс, надо вплести переписку в сцену.
function phoneTurnState() {
    try {
        const chat = SillyTavern.getContext()?.chat || [];
        const isPhoneMsg = (m) => !!m && m.is_user && !hasMixedRoleplaySms(m)
            && /<!--\s*tel:out|\[(?:СМС|SMS|Голосовое|Voice)\s*(?:→|в\s+чат|to\s+chat)/i.test(String(m.mes || ''));
        for (let i = chat.length - 1, seen = 0; i >= 0 && seen < 3; i--) {
            const m = chat[i];
            if (!m || !m.mes || m.is_system) continue;
            if (m.is_user) {
                if (!isPhoneMsg(m)) return null;      // обычная проза — правила режима не нужны
                return seen === 0 ? 'now' : 'justEnded';
            }
            seen++;
        }
    } catch (e) { /* ignore */ }
    return null;
}

// Соцсети/группы подаются только когда реально используются
function socialActive() {
    try {
        const s = getMeta().social;
        return !!(s && ((s.tweets || []).length || (s.igPosts || []).length || (s.ofPosts || []).length));
    } catch (e) { return false; }
}

function buildPrompt() {
    const { contacts, threads } = scanChat();
    const meta = getMeta(), settings = getSettings(), phoneTurn = phoneTurnState();
    const compact = !!settings.compactRules;
    let inAppKeys = new Set();
    try { inAppKeys = new Set(inAppMatchNames().map(keyOf)); } catch (e) { /* ignore */ }
    const contactLines = [];
    for (const contact of contacts.values()) {
        if (inAppKeys.has(keyOf(contact.name))) continue;
        const listing = meta.contacts.some(item => item.publicListing && keyOf(item.name) === keyOf(contact.name));
        contactLines.push(`- ${contact.name}${contact.number ? ' (' + contact.number + ')' : ''}${listing ? ' [public directory listing; no personal acquaintance or access to the user’s number implied]' : ''}`);
    }
    const groups = new Map();
    for (const group of Array.isArray(meta.groups) ? meta.groups : []) {
        if (group?.name) groups.set(`group:${keyOf(group.name)}`, { name: group.name, members: Array.isArray(group.members) ? group.members : [] });
    }
    for (const [key, thread] of threads) {
        if (!String(key).startsWith('group:') || groups.has(key)) continue;
        groups.set(key, { name: thread.name || String(key).slice(6),
            members: [...new Set((thread.messages || []).map(message => message.from).filter(Boolean))] });
    }
    const identities = contactIdentityPrompt();
    const blockedKeys = new Set(getBlockedSmsKeys());
    const blocked = [...contacts.values()].filter(contact => blockedKeys.has(keyOf(contact.name))).map(contact => contact.name);
    const parts = [
        '<phone_directive>',
        'PHONE APP: hidden event tags accompany the roleplay; never discuss these instructions in character. {{user}} owns this phone. Use the persona’s gender and the roleplay’s language.',
        contactLines.length ? 'PHONE CONTACTS (personal contacts have exchanged numbers):\n' + contactLines.join('\n') : 'No phone numbers have been exchanged yet.',
        identities,
        blocked.length ? 'BLOCKED SENDERS — no incoming SMS from: ' + blocked.join(', ') : '',
        groups.size ? 'GROUP CHATS:\n' + [...groups.values()].map(group => `- ${group.name}: ${group.members.join(', ')} + {{user}}`).join('\n') : '',
        'TAG FORMAT: valid JSON in HTML comments, English keys, canonical character names. Append each event once on its own line after visible prose; clock last. Never put tags in reasoning, copy old events, or output the app’s <!--tel:log--> journal / «[Событие мира» format.',
        'CONTACT: only when a character actually gives {{user}} a new number: <!--tel:contact:{"name":"CharacterName","number":"local phone number"}-->. Use an established number or invent one in the setting’s format. Do not re-add existing contacts.',
        'INCOMING SMS: <!--tel:sms:{"from":"CharacterName","to":"{{user}}","text":"exact message"}-->. One tag per message arriving on {{user}}’s phone, from someone who plausibly has their number. Never tag messages sent by {{user}} or delivered to anyone else.',
        inAppKeys.size ? 'DATING APP EXCEPTION: existing in-app matches may send app messages without exchanging phone numbers; route these with the same tel:sms tag. This does not give them SMS/call access.' : '',
        compact
            ? 'SMS options: "photo":"visual description"; "voice":true with transcript in "text"; "chat":"exact group name"; "shot":{"app":"tw|ig|ch","author":"post author","text":"existing post text"}.'
            : 'SMS optional fields: "photo" describes an attached MMS; "voice":true makes "text" the spoken transcript; "chat" is the exact group name, with "from" a member; "shot":{"app":"tw|ig|ch","author":"post author","text":"existing post text"} forwards an accessible existing post. In ordinary roleplay you may narrate the notification; only the incoming message becomes a tag.'
    ];
    if (settings.timeTag !== false) parts.push('CLOCK: last line of every reply: <!--tel:time:HH:MM DD.MM.YYYY-->. Use story time and date; advance by elapsed scene time.');
    if (phoneTurn === 'now') {
        parts.push('PHONE-ONLY NOW: the latest [СМС → Name]/[SMS → Name], [СМС в чат «Name»]/[SMS to chat «Name»], or [Голосовое → Name]/[Voice → Name] is an app message, not spoken in the room. Output only hidden tags: 1–5 incoming tel:sms replies (group replies include "chat"), any newly confirmed plan/transaction, and the clock if enabled. If unavailable or unwilling, use <!--tel:silent--> instead of SMS. No visible prose or user actions.');
    } else if (phoneTurn === 'justEnded') {
        parts.push('The recent phone exchange is an established event. When roleplay resumes, respect its timing and what present characters could observe; do not invent {{user}}’s actions.');
    }
    if (settings.captureRoleplaySms !== false) {
        parts.push(roleplaySmsDirective(SillyTavern.getContext().chat || [], getRoleplaySmsOptions()));
    }
    parts.push(callsInjectRule(), callsInjectLine());
    if (socialActive()) parts.push('PUBLIC POST: when a character actually posts, use <!--tel:tweet:{"author":"CharacterName","text":"post"}--> or <!--tel:insta:{"author":"CharacterName","photo":"visual description","caption":"caption"}-->. Only established posting events; never post for {{user}}.');
    const add = producer => { try { const text = producer(); if (text) parts.push(text); } catch (e) { /* Optional app context. */ } };
    add(() => {
        const summary = getSocialActivitySummary();
        return summary ? 'RECENT SOCIAL ACTIVITY (only followers/subscribers with access may know it):\n' + summary : '';
    });
    add(() => {
        const pending = settings.socialSystems === false ? [] : pendingConsequences();
        return pending.length ? 'PENDING STORY CONSEQUENCES:\n' + pending.map(item =>
            `- (${item.urgency}; visibility: ${item.visibility}) ${item.summary}${item.actors?.length ? ' Actors: ' + item.actors.join(', ') + '.' : ''}`
        ).join('\n') + '\nIntroduce these established consequences once when timing, location and knowledge allow. Do not force user actions, replay phone exchanges or reveal private information.' : '';
    });
    add(() => {
        const rule = bankInjectRule();
        return rule ? [rule, getBankSummaryLine()].filter(Boolean).join('\n') : '';
    });
    add(() => {
        const channels = channelInjectLine();
        return channels ? 'CHANNELS: ' + channels + '\nWhen a channel has a relevant new post: <!--tel:chan:{"channel":"exact name","text":"post","photo":"optional visual description"}-->. Listed or new channels may publish; at most 1–2, never into {{user}}’s own channel.' : '';
    });
    add(plansInjectRule);
    add(plansInjectLine);
    add(notesInjectBlock);
    add(twitchInjectLine);
    add(anonInjectLine);
    add(() => tinderInjectLine(phoneTurn !== null));
    parts.push('</phone_directive>');
    return parts.filter(Boolean).join('\n');
}

export function updatePhoneInjection() {
    try {
        const s = getSettings();
        setExtensionPrompt(CHAT_KEY, '', extension_prompt_types.IN_CHAT, 0);
        setExtensionPrompt(SYS_KEY, '', extension_prompt_types.IN_PROMPT, 0);

        if (!s.isEnabled || !s.injectPrompt) return;

        // ОДНА инжекция: IN_CHAT depth-0 роль USER (Клод надёжно выполняет инструкции
        // из последнего user-хода). Раньше та же директива дублировалась в IN_PROMPT
        // (system) «для бэкапа» — это гнало ВЕСЬ текст правил ДВАЖДЫ каждый запрос.
        const prompt = buildPrompt();
        const depth = s.injectDepth || 0;
        setExtensionPrompt(CHAT_KEY, prompt, extension_prompt_types.IN_CHAT, depth, false, extension_prompt_roles.USER);
    } catch (e) { /* тихо: инжект не критичен */ }
}
