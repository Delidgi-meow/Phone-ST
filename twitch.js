// Твич: чужие стримы (визуальная новелла — кадр перерисовывается от событий
// и комментов) и свой эфир (зрительский чат реагирует на действия юзера).
// Всё лениво, per-chat. В журнал: комменты в чужой чат, старт/итог своего эфира.

import { getMeta, saveMeta } from './state.js';
import {
    generateStreamList, generateStreamTick, generateMyStreamTick,
    logSocialToChat, getUserName,
} from './social.js';
import { getBank, addTransaction, fmtMoney } from './bank.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function getTwitch() {
    const m = getMeta();
    if (!m.twitch || typeof m.twitch !== 'object') m.twitch = {};
    const t = m.twitch;
    if (!Array.isArray(t.streams)) t.streams = [];
    if (!t.myStream || typeof t.myStream !== 'object') t.myStream = null;
    if (typeof t.nick !== 'string') t.nick = '';
    return t;
}

// ── Ник на площадке ──
// На твиче сидят под ником, а не под паспортным именем: зрители и стримеры
// зовут её именно так. Пусто = имя персонажа (старые чаты не поедут).
export function getTwitchNick() {
    return getTwitch().nick || getUserName();
}

export function setTwitchNick(nick) {
    const t = getTwitch();
    const v = String(nick || '').trim().replace(/^@+/, '').slice(0, 25);
    t.nick = v === getUserName() ? '' : v;
    saveMeta();
    return getTwitchNick();
}

// Для журнала: ролевая должна понимать, что ник в чате — это она
function userAs() {
    const nick = getTwitchNick();
    return nick === getUserName() ? getUserName() : `${getUserName()} (на твиче под ником ${nick})`;
}

export function findStream(id) { return getTwitch().streams.find(s => s.id === id) || null; }

let _inflight = false;
export function twitchBusy() { return _inflight; }

export async function refreshStreams() {
    if (_inflight) throw new Error('уже генерируется');
    _inflight = true;
    try {
        const t = getTwitch();
        const arr = await generateStreamList(t.streams.map(s => `${s.streamer}: ${s.title}`));
        if (!Array.isArray(arr) || !arr.length) throw new Error('Эфиры не сгенерировались — попробуй ещё раз');
        t.streams = arr.filter(s => s && s.streamer && s.title).slice(0, 6).map(s => ({
            id: genId(),
            streamer: String(s.streamer).slice(0, 32),
            title: String(s.title).slice(0, 90),
            category: String(s.category || 'IRL').slice(0, 32),
            viewers: Math.max(1, Math.round(Number(s.viewers) || 50)),
            scene: String(s.scene || '').slice(0, 300),
            chat: [],
            image: null,
        }));
        saveMeta();
        return t.streams.length;
    } finally {
        _inflight = false;
    }
}

function pushChat(target, arr, cap = 60) {
    const fresh = (Array.isArray(arr) ? arr : []).filter(x => x && x.author && x.text).map(x => ({
        id: genId(),
        author: String(x.author).slice(0, 32),
        text: String(x.text).slice(0, 300),
    }));
    target.chat = [...target.chat, ...fresh].slice(-cap);
    return fresh.length;
}

// Тик чужого стрима: событие на экране (и реакция на коммент/донат юзера).
// Возвращает true, если сцена ИЗМЕНИЛАСЬ (пора перерисовать кадр).
export async function tickStream(id, userComment = null, donation = null) {
    if (_inflight) throw new Error('уже генерируется');
    const s = findStream(id);
    if (!s) return false;
    // Первое касание эфира: ролевая должна знать, что она сейчас его смотрит.
    // Дальше хватает её собственных реплик в чате — иначе журнал засорится.
    if (!s.watched) {
        s.watched = true;
        saveMeta();
        if (!userComment && !donation) {
            logSocialToChat(`${userAs()} смотрит стрим «${s.title}» (${s.streamer}): ${s.scene || s.category}`);
        }
    }
    if (userComment || donation) {
        const entry = { id: genId(), author: getTwitchNick(), text: String(userComment || '').slice(0, 300), user: true };
        if (donation) entry.don = donation.amount;
        s.chat = [...s.chat, entry].slice(-60);
        saveMeta();
        logSocialToChat(donation
            ? `${userAs()} донатит стримеру ${s.streamer} ${fmtMoney(donation.amount)} на стриме «${s.title}»${userComment ? ` с сообщением: «${userComment}»` : ''}`
            : `${userAs()} смотрит стрим «${s.title}» (${s.streamer}) и пишет в чат: «${userComment}»`);
    }
    _inflight = true;
    try {
        const tick = await generateStreamTick(s, s.chat, userComment, donation, getTwitchNick());
        if (!tick) throw new Error('Стрим завис — попробуй ещё раз');
        const oldScene = s.scene;
        if (tick.scene) s.scene = String(tick.scene).slice(0, 300);
        if (tick.streamer) s.chat = [...s.chat, { id: genId(), author: s.streamer, text: String(tick.streamer).slice(0, 300), host: true }].slice(-60);
        pushChat(s, tick.chat);
        if (Number(tick.viewers)) s.viewers = Math.max(1, Math.round(Number(tick.viewers)));
        saveMeta();
        return s.scene !== oldScene;
    } finally {
        _inflight = false;
    }
}

// Донат стримеру: деньги с банка, алерт на стриме, стример реагирует
export async function donateToStream(id, amount, text) {
    const s = findStream(id);
    amount = Math.round(Number(amount) || 0);
    if (!s || amount <= 0) throw new Error('Сумма доната должна быть больше нуля');
    if (getBank().balance < amount) throw new Error('Не хватает денег на счету');
    addTransaction({ amount: -amount, label: `Донат: ${s.streamer}`, category: 'донат', silent: true });
    return tickStream(id, text || null, { amount });
}

// ── Свой эфир ──
export function startMyStream(title, category) {
    const t = getTwitch();
    t.myStream = {
        title: String(title || 'Без названия').slice(0, 90),
        category: String(category || 'IRL').slice(0, 32),
        viewers: 3 + Math.floor(Math.random() * 12),
        peak: 0,
        startedAt: Date.now(),
        scene: '',
        image: null,
        chat: [],
        msgCount: 0,
    };
    saveMeta();
    logSocialToChat(`${getUserName()} запускает свой стрим на канале ${getTwitchNick()}: «${t.myStream.title}» (${t.myStream.category})`);
    return t.myStream;
}

export async function tickMyStream(userLine = null) {
    if (_inflight) throw new Error('уже генерируется');
    const t = getTwitch();
    const my = t.myStream;
    if (!my) return false;
    const oldScene = my.scene;
    if (userLine) {
        my.scene = String(userLine).slice(0, 300); // её действие = что в кадре
        my.msgCount++;
    }
    _inflight = true;
    try {
        const tick = await generateMyStreamTick(my, my.chat, userLine, getTwitchNick());
        if (!tick) throw new Error('Зрители молчат — попробуй ещё раз');
        pushChat(my, tick.chat);
        // Донаты зрителей: деньги в банк + алерты для оверлея
        const alerts = [];
        for (const d of (Array.isArray(tick.donations) ? tick.donations : []).slice(0, 2)) {
            const amt = Math.round(Number(d?.amount) || 0);
            if (amt <= 0) continue;
            const from = String(d.from || 'зритель').slice(0, 32);
            const dText = String(d.text || '').slice(0, 200);
            addTransaction({ amount: amt, label: `Донат от ${from}`, category: 'стрим', silent: true });
            my.donTotal = (my.donTotal || 0) + amt;
            my.chat = [...my.chat, { id: genId(), author: from, text: dText, don: amt }].slice(-60);
            alerts.push({ from, amount: amt, text: dText });
        }
        if (Number(tick.viewers)) my.viewers = Math.max(1, Math.round(Number(tick.viewers)));
        my.peak = Math.max(my.peak || 0, my.viewers);
        if (tick.scene) my.scene = String(tick.scene).slice(0, 300);
        saveMeta();
        // Эфир должен доходить до ролевой ПОКА он идёт, а не одной строкой в
        // конце: её реплика в кадре — это её действие в мире, донат — событие.
        // Холостой тик (зрители сами по себе) не логируем, чтобы не сорить.
        if (userLine || alerts.length) {
            const donLine = alerts.length
                ? ` Донаты в эфир: ${alerts.map(a => `${a.from} — ${fmtMoney(a.amount)}${a.text ? ` («${a.text}»)` : ''}`).join(', ')}.`
                : '';
            logSocialToChat(`${getUserName()} в прямом эфире на канале ${getTwitchNick()} («${my.title}», зрителей ${my.viewers})${userLine ? `: ${userLine}` : ''}.${donLine}`);
        }
        return { sceneChanged: my.scene !== oldScene, alerts };
    } finally {
        _inflight = false;
    }
}

// Пока эфир идёт — это часть текущей сцены: она физически перед камерой, и
// персонажи, знающие её канал, могут смотреть и написать ей об этом.
export function twitchInjectLine() {
    const my = getTwitch().myStream;
    if (!my) return '';
    const mins = Math.max(1, Math.round((Date.now() - (my.startedAt || Date.now())) / 60000));
    const last = (my.chat || []).slice(-3)
        .map(c => `${c.author}: "${String(c.text || '').slice(0, 70)}"`).join(' | ');
    return `[{{user}} IS LIVE RIGHT NOW — streaming from their phone on the channel "${getTwitchNick()}": «${my.title}»${my.category ? ` (${my.category})` : ''}, ${my.viewers || 0} viewers, on air for ~${mins} min. On camera now: ${my.scene || 'they just went live'}.${last ? ` Latest stream chat: ${last}` : ''} This is happening IN THE SCENE: they are in front of a camera with an audience watching, so anything happening around them is semi-public. Characters who know their channel may be watching and may text or call them about it. Do NOT write the stream chat yourself — the app generates it.]`;
}

export function endMyStream() {
    const t = getTwitch();
    const my = t.myStream;
    if (!my) return;
    const mins = Math.max(1, Math.round((Date.now() - (my.startedAt || Date.now())) / 60000));
    logSocialToChat(`${getUserName()} (канал ${getTwitchNick()}) заканчивает стрим «${my.title}»: ~${mins} мин в эфире, пик зрителей ${my.peak || my.viewers}${my.donTotal ? `, донатов на ${fmtMoney(my.donTotal)}` : ''}.`);
    t.myStream = null;
    saveMeta();
}
