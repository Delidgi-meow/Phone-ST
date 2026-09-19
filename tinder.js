// Тиндер: своя анкета, колода чужих и мэтчи. Анкета здесь — не пара строчек,
// а полноценная карточка персонажа: ей же потом модель играет человека в
// переписке. Данные per-chat в meta; переписка после мэтча уходит в обычные
// «Сообщения», чтобы работали смс, ммс, голосовые и память ролевой.

import { getMeta, saveMeta, keyOf, getSettings, addManualContact } from './state.js';
import { logSocialToChat, getUserName, getUserHandle, setContactAvatar } from './social.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function tinderEnabled() { return getSettings().tinder !== false; }

export function getTinder() {
    const m = getMeta();
    if (!m.tinder || typeof m.tinder !== 'object') m.tinder = {};
    const t = m.tinder;
    if (!t.me || typeof t.me !== 'object') t.me = null;   // своя анкета
    if (!Array.isArray(t.deck)) t.deck = [];              // кого ещё не листала
    if (!Array.isArray(t.matches)) t.matches = [];        // взаимные лайки
    if (!Array.isArray(t.seen)) t.seen = [];              // имена, чтобы не повторяться
    if (!t.lastSwipe || typeof t.lastSwipe !== 'object') t.lastSwipe = null;
    return t;
}

// ── Своя анкета ──
export function getTinderMe() {
    return getTinder().me;
}

export function saveTinderMe(p) {
    const t = getTinder();
    const name = String(p?.name || '').trim().slice(0, 40) || getUserName();
    t.me = {
        name,
        age: Math.max(18, Math.min(99, parseInt(p?.age) || 25)),
        job: String(p?.job || '').trim().slice(0, 80),
        bio: String(p?.bio || '').trim().slice(0, 300),
        looking: String(p?.looking || '').trim().slice(0, 120),
        bed: String(p?.bed || '').trim().slice(0, 300),
        photo: p?.photo || t.me?.photo || null,
        look: String(p?.look || t.me?.look || '').slice(0, 600),
    };
    saveMeta();
    return t.me;
}

export function setTinderMePhoto(src, look = '') {
    const t = getTinder();
    if (!t.me) saveTinderMe({});
    t.me.photo = src || null;
    if (look) t.me.look = String(look).slice(0, 600);
    saveMeta();
    return t.me;
}

// ── Колода ──
// Всё, что приходит от модели, приводим к одному виду. Пустые поля не страшны:
// анкета покажет только заполненное, а картинка рисуется по look.
function normProfile(p) {
    const name = String(p?.name || '').trim().slice(0, 60);
    if (!name) return null;
    const s = (v, n) => String(v || '').trim().slice(0, n);
    return {
        id: genId(),
        name,
        age: Math.max(18, Math.min(99, parseInt(p.age) || 30)),
        job: s(p.job, 80),
        bio: s(p.bio, 300),
        dist: Math.max(1, Math.min(99, parseInt(p.dist) || (1 + Math.floor(Math.random() * 20)))),
        // Двенадцать полей карточки
        who: s(p.who, 600),
        build: s(p.build, 600),
        face: s(p.face, 600),
        voice: s(p.voice, 600),
        temper: s(p.temper, 900),
        life: s(p.life, 900),
        writes: s(p.writes, 600),
        crush: s(p.crush, 600),
        bed: s(p.bed, 600),
        secret: s(p.secret, 400),
        // Плотная визуальная строка — только по ней рисуется фото
        look: s(p.look, 900),
        // Знакомый из ролевой? Такие выпадают редко и это отдельный сюжет
        known: !!p.known,
        // Ответит ли взаимностью. Решает модель, а не бросок кубика
        likesBack: p.likes_back !== false,
        image: null,
        time: Date.now(),
    };
}

export function addTinderProfiles(arr) {
    const t = getTinder();
    const seen = new Set(t.seen.map(keyOf));
    for (const x of [...t.deck, ...t.matches]) seen.add(keyOf(x.name));
    const fresh = (Array.isArray(arr) ? arr : [])
        .map(normProfile)
        .filter(p => {
            if (!p || seen.has(keyOf(p.name))) return false;
            seen.add(keyOf(p.name));
            return true;
        })
        .slice(0, 8);
    if (!fresh.length) return 0;
    t.deck = [...t.deck, ...fresh].slice(0, 30);
    t.seen = [...t.seen, ...fresh.map(p => p.name)].slice(-80);
    saveMeta();
    return fresh.length;
}

export function currentCard() { return getTinder().deck[0] || null; }
export function findProfile(id) {
    const t = getTinder();
    return t.deck.find(p => p.id === id) || t.matches.find(p => p.id === id) || null;
}

// ── Свайп ──
// Возвращает { matched, profile }. Мэтч — только если модель заранее решила,
// что человек ответит взаимностью: так это остаётся сюжетом, а не рулеткой.
export function swipeTinder(id, dir) {
    const t = getTinder();
    const i = t.deck.findIndex(p => p.id === id);
    if (i < 0) return { matched: false, profile: null };
    const [p] = t.deck.splice(i, 1);
    t.lastSwipe = { profile: p, dir, at: i };
    let matched = false;
    if (dir === 'like' && p.likesBack) {
        matched = true;
        p.matchedAt = Date.now();
        p.irl = false;
        t.matches = [p, ...t.matches].slice(0, 40);
        // Номерами ещё не обменивались: в списке «Сообщений» человека не видно,
        // а переписка открывается из Тиндера. Контакт при этом заводится — на
        // нём держится весь тред, без него открывать было бы нечего.
        p.inApp = true;
        try {
            addManualContact(p.name, '');
            if (p.image) setContactAvatar(keyOf(p.name), p.image);
        } catch (e) { /* ignore */ }
        logSocialToChat(
            `У ${getUserName()} мэтч в Тиндере: ${p.name}, ${p.age}${p.job ? `, ${p.job}` : ''}. `
            + `Они понравились друг другу и теперь могут переписываться. ${p.name} видел${/[аяь]$/i.test(p.name) ? 'а' : ''} только анкету ${getUserName()} в приложении — `
            + `где ${getUserName()} работает, с кем живёт и что было в прошлом, ${p.name} не знает, пока не расскажут. `
            + `Переписка идёт внутри приложения — телефонами они пока не обменивались.`, { priv: true });
    }
    saveMeta();
    return { matched, profile: p };
}

export function undoSwipe() {
    const t = getTinder();
    const last = t.lastSwipe;
    if (!last?.profile) return false;
    // Вернуть можно только «нет»: мэтч уже случился, его не отматывают
    if (last.dir === 'like' && t.matches.some(m => m.id === last.profile.id)) return false;
    t.deck.splice(Math.max(0, Math.min(t.deck.length, last.at)), 0, last.profile);
    t.lastSwipe = null;
    saveMeta();
    return true;
}

// ── Мэтчи ──
export function getMatches() { return getTinder().matches; }

// Контакт в «Сообщениях» и анкета в Тиндере — один человек. Связь по имени:
// номера у мэтча нет, ключ контакта строится из имени.
export function matchByContactKey(key) {
    if (!tinderEnabled() || !key) return null;
    return getTinder().matches.find(m => keyOf(m.name) === key) || null;
}

export function matchBadge() {
    return getTinder().matches.filter(m => !m.opened).length;
}

export function markMatchOpened(id) {
    const m = getMatches().find(x => x.id === id);
    if (!m || m.opened) return;
    m.opened = true;
    saveMeta();
}

// Встретились вживую — граница «он знает только анкету» снимается насовсем
export function setMatchIrl(id, v) {
    const m = getMatches().find(x => x.id === id);
    if (!m) return false;
    m.irl = !!v;
    saveMeta();
    if (m.irl) {
        logSocialToChat(`${getUserName()} и ${m.name} (знакомство из Тиндера) встретились вживую — дальше ${m.name} знает ${getUserName()} как обычного человека, а не по анкете.`, { priv: true });
    }
    return m.irl;
}

// Дали номер — человек переезжает в «Сообщения» и становится обычным
// контактом. Обратной дороги нет: номер уже у него.
export function giveNumberTo(id) {
    const m = getMatches().find(x => x.id === id);
    if (!m || !m.inApp) return false;
    m.inApp = false;
    saveMeta();
    try {
        addManualContact(m.name, '');
        if (m.image) setContactAvatar(keyOf(m.name), m.image);
    } catch (e) { /* ignore */ }
    logSocialToChat(`${getUserName()} даёт ${m.name} свой номер — дальше они пишут уже не в приложении, а в обычной переписке.`, { priv: true });
    return true;
}

export function isInAppMatch(key) {
    const m = matchByContactKey(key);
    return !!(m && m.inApp);
}

// Мэтчи, заведённые до того, как контакт стал обязательным, остались без него
// — тред таким не открыть. Чиним по требованию, при первом же заходе.
export function ensureMatchContact(id) {
    const m = getMatches().find(x => x.id === id);
    if (!m) return false;
    try {
        addManualContact(m.name, '');
        if (m.image) setContactAvatar(keyOf(m.name), m.image);
    } catch (e) { return false; }
    return true;
}

// Имена тех, у кого её номера НЕТ: они пишут внутри приложения, и в списке
// «у этих есть твой номер» им не место
export function inAppMatchNames() {
    if (!tinderEnabled()) return [];
    return getTinder().matches.filter(m => m.inApp).map(m => m.name);
}

export function deleteMatch(id) {
    const t = getTinder();
    t.matches = t.matches.filter(m => m.id !== id);
    saveMeta();
}

export function setProfileImage(id, src) {
    const p = findProfile(id);
    if (!p) return false;
    p.image = src || null;
    // Фото могли нарисовать уже после мэтча — контакт должен его подхватить
    if (src && getTinder().matches.some(m => m.id === id)) {
        try { setContactAvatar(keyOf(p.name), src); } catch (e) { /* ignore */ }
    }
    saveMeta();
    return true;
}

// ── Инжект ──
// Два режима. Пока она переписывается — полная карточка того, с кем говорит:
// модель должна играть человека, а не «парня из приложения». В обычных ходах
// ролевой — одна строка на мэтч, чтобы факт остался, а контекст не пух.
function fullCard(p) {
    const rows = [
        ['WHO THEY ARE', p.who],
        ['HEIGHT AND BUILD', p.build],
        ['FACE AND HANDS', p.face],
        ['VOICE AND THINGS', p.voice],
        ['TEMPERAMENT AND CHARACTER', p.temper],
        ['HOME, HANDS, FOOD', p.life],
        ['HOW THEY TEXT', p.writes],
        ['WHEN THEY ARE INTERESTED IN SOMEONE', p.crush],
        ['IN BED', p.bed],
        ['WHAT THEY HIDE (they never volunteer this)', p.secret],
    ].filter(([, v]) => v);
    return `${p.name}, ${p.age}${p.job ? `, ${p.job}` : ''}\n`
        + rows.map(([k, v]) => `- ${k}: ${v}`).join('\n');
}

function meLine() {
    const me = getTinderMe();
    if (!me) return '';
    const bits = [`${me.name}, ${me.age}`];
    if (me.job) bits.push(me.job);
    if (me.bio) bits.push(`"${me.bio}"`);
    if (me.looking) bits.push(`looking for: ${me.looking}`);
    if (me.bed) bits.push(`shown only to matches: ${me.bed}`);
    return bits.join(' · ');
}

export function tinderInjectLine(texting = false) {
    if (!tinderEnabled()) return '';
    const t = getTinder();
    const me = getTinderMe();
    const matches = t.matches;
    if (!me && !matches.length) return '';

    const out = [];
    out.push(`[{{user}} uses a dating app (Tinder) on their phone.${me ? ` Their own profile — this is ALL a stranger there can see about them: ${meLine()}` : ''}]`);

    if (!matches.length) return out.join('\n');

    // Переписка идёт прямо сейчас: даём того, с кем говорят, целиком
    const active = texting ? matches.filter(m => !m.irl).slice(0, 2) : [];
    if (active.length) {
        for (const m of active) {
            out.push(`[MATCH {{user}} IS TEXTING${m.inApp ? ' inside the dating app — they have NOT exchanged phone numbers yet, so this is app chat, not SMS' : ' (they have each other\'s numbers now)'} — play them exactly as written, this is a real person with their own voice:\n${fullCard(m)}]`);
        }
        out.push(`[WHAT THEY KNOW ABOUT {{user}}: ONLY the dating profile above and whatever {{user}} has told them in these messages. They have never met. They do NOT know where {{user}} works, who they live with, who their friends are or what happened in their life — even if that appears elsewhere in this context. Do not let them use it. Asking is fine; knowing is not.]`);
    }

    // Короткие строки: мэтч остаётся фактом мира и в обычной сцене
    const lines = matches.slice(0, 6).map((m) => {
        const days = Math.max(0, Math.round((Date.now() - (m.matchedAt || Date.now())) / 86400000));
        const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
        const trait = String(m.temper || '').split(/(?<=\.)\s/)[0] || '';
        return `- ${m.name}, ${m.age}${m.job ? `, ${m.job}` : ''} — matched ${when}${m.irl ? ', they have already met in person' : ', never met in person yet'}${trait ? `. ${trait}` : ''}`;
    });
    out.push(`[{{user}}'S MATCHES]\n${lines.join('\n')}`);
    return out.join('\n');
}
