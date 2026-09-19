// Каналы: свой и чужие, посты с реакциями, просмотрами и обсуждением.
// Данные лежат per-chat в meta; генерация — по кнопкам и после своих постов.

import { getMeta, saveMeta, keyOf, stripThink, getSettings } from './state.js';
import { logSocialToChat, getUserName, getUserHandle, resolveAuthorKey } from './social.js';
import { getBank, addTransaction, fmtMoney } from './bank.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export const CHAN_REACTS = ['🔥', '❤️', '😮', '😂', '💔', '👍'];

export function getChannels() {
    const m = getMeta();
    if (!m.channels || typeof m.channels !== 'object') m.channels = {};
    const c = m.channels;
    if (!('mine' in c)) c.mine = null;          // свой канал (один)
    if (!Array.isArray(c.list)) c.list = [];    // чужие: найденные и подписки
    return c;
}

export function myChannel() { return getChannels().mine; }

// ══ Подслушано: городская анонимка ══
// Канал есть всегда и не удаляется. Туда валятся сплетни города и вопросы
// лично ей через @ник; автор поста скрыт, но его можно пробить за деньги.
export const ANON_ID = 'anon';
export const ANON_NAME = 'Подслушано';

export function anonEnabled() { return getSettings().anonChannel !== false; }

export function getAnonChannel() {
    const c = getChannels();
    if (!c.anon || typeof c.anon !== 'object') {
        c.anon = {
            id: ANON_ID,
            system: true,
            mine: false,
            subscribed: true,
            name: ANON_NAME,
            desc: 'Городские сплетни. Присылают анонимно',
            subs: 4200 + Math.floor(Math.random() * 6000),
            posts: [],
            unread: 0,
            reveals: 0,
        };
        saveMeta();
    }
    const a = c.anon;
    if (!Array.isArray(a.posts)) a.posts = [];
    if (typeof a.reveals !== 'number') a.reveals = 0;
    a.id = ANON_ID;
    a.system = true;
    return a;
}

// Свой канал в общем списке идёт первым — экранам удобнее один массив
export function allChannels() {
    const c = getChannels();
    const head = c.mine ? [c.mine] : [];
    return anonEnabled() ? [...head, getAnonChannel(), ...c.list] : [...head, ...c.list];
}

// '@ник' в едином виде: без решёток и лишних пробелов, но с одной собакой
function normHandle(v) {
    const h = String(v || '').trim().replace(/^@+/, '').slice(0, 24);
    return h ? '@' + h : '';
}

// Пост адресован лично ей? Сравниваем с её ником в соцсетях
export function anonPostToUser(post) {
    if (!post?.to) return false;
    const mine = normHandle(getUserHandle()).toLowerCase();
    const to = normHandle(post.to).toLowerCase();
    if (mine && to === mine) return true;
    // Модель иногда адресует по имени, а не по нику
    return to.slice(1) === keyOf(getUserName());
}

export function addAnonPosts(arr) {
    const ch = getAnonChannel();
    const fresh = (Array.isArray(arr) ? arr : [])
        .filter(p => p && String(p.text || '').trim())
        .slice(0, 6)
        .map((p, i) => ({
            id: genId(),
            anon: true,
            text: String(p.text).trim().slice(0, 900),
            to: normHandle(p.to),
            // Настоящий автор нужен для платного вскрытия. Юзеру он не виден
            // ни в одном экране, пока она не заплатит.
            realAuthor: String(p.from || '').trim().slice(0, 40),
            revealed: false,
            time: Date.now() - i * 41 * 60000,
            views: 0,
            reacts: [],
            comments: [],
            commentsOn: true,
        }));
    if (!fresh.length) return 0;
    ch.posts = [...fresh, ...ch.posts].slice(0, 40);
    ch.unread = (ch.unread || 0) + fresh.length;
    saveMeta();
    return fresh.length;
}

// Её собственная анонимка. В канале имени нет, но в журнал строка уходит:
// слух реально пошёл по городу, и персонаж может докопаться, чей он.
export function postAnonAsUser(text, to = '') {
    const ch = getAnonChannel();
    const t = String(text || '').trim();
    if (!t) throw new Error('Пустая анонимка');
    const post = {
        id: genId(),
        anon: true,
        byUser: true,
        text: t.slice(0, 900),
        to: normHandle(to),
        realAuthor: getUserName(),
        revealed: false,
        time: Date.now(),
        views: 0,
        reacts: [],
        comments: [],
        commentsOn: true,
    };
    ch.posts = [post, ...ch.posts].slice(0, 40);
    saveMeta();
    logSocialToChat(`${getUserName()} анонимно отправляет пост в «${ANON_NAME}»${post.to ? ` и адресует его ${post.to}` : ''}: «${post.text.slice(0, 400)}». В канале её имени не видно, но админ канала продаёт авторов — при желании это можно пробить.`);
    return post;
}

// Цена растёт: первое имя дешёвое, дальше админ поднимает ставку
export function anonRevealPrice() {
    const base = Math.max(1, Math.round(Number(getSettings().anonRevealPrice) || 2500));
    return base * ((getAnonChannel().reveals || 0) + 1);
}

export function canAffordAnonReveal() {
    try { return getBank().balance >= anonRevealPrice(); } catch (e) { return false; }
}

// Похоже ли на имя, а не на описание вроде «девушка из ТЦ Галерея»
function looksLikeName(v) {
    const t = String(v || '').trim();
    if (!t) return false;
    const first = t.split(/[\s,]+/)[0] || '';
    if (first.length < 2) return false;
    // Имя начинается с заглавной и не с предлога
    if (first[0] !== first[0].toUpperCase() || first[0] === first[0].toLowerCase()) return false;
    return !/^(из|с|со|от|в|во|у|про|для|один|одна)$/i.test(first);
}

// Проверить и списать — без генерации. Возвращает цену, если платёж прошёл.
export function chargeAnonReveal(postId) {
    const ch = getAnonChannel();
    const post = ch.posts.find(p => p.id === postId);
    if (!post) throw new Error('Пост не найден');
    if (post.revealed) return 0;
    if (post.byUser) throw new Error('Это твой собственный пост');
    const price = anonRevealPrice();
    if (getBank().balance < price) throw new Error('Не хватает денег на карте');
    addTransaction({ amount: -price, label: `Автор анонимки в «${ANON_NAME}»`, category: 'анонимка', silent: true });
    post.revealed = true;
    post.revealPrice = price;
    ch.reveals = (ch.reveals || 0) + 1;
    saveMeta();
    return price;
}

// Записать выясненную личность и отправить строку в журнал
export function setAnonAuthor(postId, { name = '', who = '', why = '' } = {}) {
    const post = getAnonChannel().posts.find(p => p.id === postId);
    if (!post) return null;
    if (name) post.realAuthor = String(name).trim().slice(0, 60);
    if (who) post.realWho = String(who).trim().slice(0, 300);
    if (why) post.realWhy = String(why).trim().slice(0, 300);
    saveMeta();
    logSocialToChat(
        `${getUserName()} платит ${fmtMoney(post.revealPrice || 0)} админу «${ANON_NAME}», чтобы узнать, кто прислал пост «${post.text.slice(0, 140)}». `
        + `Называют имя: ${post.realAuthor || 'автора так и не нашли'}.${post.realWho ? ` ${post.realWho}` : ''}${post.realWhy ? ` ${post.realWhy}` : ''} `
        + `Знает об этом только ${getUserName()} — сам автор не в курсе, что его вычислили.`,
    );
    return post;
}

// Нужно ли доспрашивать модель: в анкете поста имени нет
export function anonAuthorNeedsLookup(postId) {
    const post = getAnonChannel().posts.find(p => p.id === postId);
    return !!post && !looksLikeName(post.realAuthor);
}

export function revealAnonAuthor(postId) {
    const price = chargeAnonReveal(postId);
    if (!price) return getAnonChannel().posts.find(p => p.id === postId);
    return setAnonAuthor(postId, {});
}

export function findChannel(id) { return allChannels().find(x => x.id === id) || null; }

export function findChanPost(chanId, postId) {
    return (findChannel(chanId)?.posts || []).find(p => p.id === postId) || null;
}

export function unreadChannels() {
    return allChannels().reduce((n, ch) => n + (ch.mine ? 0 : (ch.unread || 0)), 0);
}

export function markChannelRead(id) {
    const ch = findChannel(id);
    if (!ch || !ch.unread) return;
    ch.unread = 0;
    saveMeta();
}

export function createMyChannel(name, desc) {
    const c = getChannels();
    const n = String(name || '').trim().slice(0, 60);
    if (!n) throw new Error('Назови канал');
    c.mine = {
        id: genId(),
        mine: true,
        name: n,
        desc: String(desc || '').trim().slice(0, 200),
        author: getUserName(),
        subs: 20 + Math.floor(Math.random() * 40),
        subsDelta: 0,
        posts: [],
        createdAt: Date.now(),
    };
    saveMeta();
    logSocialToChat(`${getUserName()} заводит свой канал «${c.mine.name}»${c.mine.desc ? ` (${c.mine.desc})` : ''}`);
    return c.mine;
}

export function deleteMyChannel() {
    const c = getChannels();
    if (!c.mine) return false;
    const gone = c.mine;
    c.mine = null;
    saveMeta();
    logSocialToChat(`${getUserName()} удаляет свой канал «${gone.name}»`);
    return true;
}

// ── Чужие каналы ──
export function addFoundChannels(arr) {
    const c = getChannels();
    const known = new Set(c.list.map(x => keyOf(x.name)));
    if (c.mine) known.add(keyOf(c.mine.name));
    const fresh = (Array.isArray(arr) ? arr : [])
        .filter(x => {
            if (!x || !x.name || known.has(keyOf(x.name))) return false;
            known.add(keyOf(x.name));
            return true;
        })
        .slice(0, 5)
        .map(x => ({
            id: genId(),
            mine: false,
            name: String(x.name).slice(0, 60),
            desc: String(x.desc || '').slice(0, 200),
            author: String(x.author || '').slice(0, 40),
            subs: Math.max(12, Math.round(Number(x.subs) || 500)),
            subscribed: false,
            unread: 0,
            posts: normalizePosts(x.posts),
        }));
    c.list = [...c.list, ...fresh].slice(0, 12);
    saveMeta();
    return fresh.length;
}

function normalizePosts(arr) {
    return (Array.isArray(arr) ? arr : [])
        .filter(p => p && (p.text || p.photo))
        .slice(0, 6)
        .map((p, i) => ({
            id: genId(),
            text: String(p.text || '').slice(0, 1200),
            imgDesc: String(p.photo || '').slice(0, 300),
            image: null,
            // Свежий пост сверху: чем дальше по списку, тем он старше
            time: Date.now() - i * 47 * 60000,
            views: 0,
            reacts: [],
            comments: [],
            commentsOn: p.comments_off ? false : true,
        }));
}

export function toggleSubscribe(id) {
    const ch = findChannel(id);
    if (!ch || ch.mine || ch.system) return false;
    ch.subscribed = !ch.subscribed;
    if (ch.subscribed) ch.subs++;
    else { ch.subs = Math.max(0, ch.subs - 1); ch.unread = 0; }
    saveMeta();
    logSocialToChat(ch.subscribed
        ? `${getUserName()} подписывается на канал «${ch.name}»`
        : `${getUserName()} отписывается от канала «${ch.name}»`);
    return ch.subscribed;
}

export function deleteChannel(id) {
    if (id === ANON_ID) return false;   // городская анонимка не удаляется
    const c = getChannels();
    c.list = c.list.filter(x => x.id !== id);
    saveMeta();
}

export function addChannelPosts(id, arr) {
    const ch = findChannel(id);
    if (!ch) return 0;
    const fresh = normalizePosts(arr);
    if (!fresh.length) return 0;
    ch.posts = [...fresh, ...(ch.posts || [])].slice(0, 40);
    if (ch.subscribed) ch.unread = (ch.unread || 0) + fresh.length;
    saveMeta();
    return fresh.length;
}

// Канал знакомого добавляется по её выбору, поэтому сразу подписан:
// она бы не стала искать человека, чтобы потом не читать его.
export function addPersonChannel(person, gen) {
    const c = getChannels();
    const who = String(person || '').trim();
    if (!who) throw new Error('Выбери человека');
    if (c.list.some(x => x.person && keyOf(x.author) === keyOf(who))) {
        throw new Error('Канал этого человека уже добавлен');
    }
    const ch = {
        id: genId(),
        mine: false,
        person: true,
        name: String(gen?.name || who).slice(0, 60),
        desc: String(gen?.desc || '').slice(0, 200),
        author: who.slice(0, 40),
        subs: Math.max(8, Math.round(Number(gen?.subs) || 120)),
        subscribed: true,
        unread: 0,
        posts: normalizePosts(gen?.posts),
    };
    c.list = [ch, ...c.list].slice(0, 14);
    saveMeta();
    logSocialToChat(`${getUserName()} находит канал ${who} — «${ch.name}» — и подписывается`);
    return ch;
}

// Аватарка канала живёт на самом канале: у чужого она может отличаться
// от аватарки автора — это разные вещи.
export function setChannelAvatar(id, src) {
    const ch = findChannel(id);
    if (!ch || !src) return false;
    ch.avatar = String(src);
    saveMeta();
    return true;
}

export function clearChannelAvatar(id) {
    const ch = findChannel(id);
    if (!ch) return false;
    delete ch.avatar;
    saveMeta();
    return true;
}

// ── Свой пост ──
export function publishToMyChannel({ text = '', image = null, imgDesc = '', commentsOn = true }) {
    const ch = myChannel();
    if (!ch) throw new Error('Сначала заведи канал');
    if (!text.trim() && !image && !imgDesc.trim()) throw new Error('Пустой пост');
    const post = {
        id: genId(),
        text: String(text).slice(0, 1200),
        image,
        imgDesc: String(imgDesc).slice(0, 300),
        time: Date.now(),
        views: 0,
        reacts: [],
        comments: [],
        commentsOn: !!commentsOn,
        mine: true,
    };
    ch.posts = [post, ...(ch.posts || [])].slice(0, 40);
    saveMeta();
    return post;
}

export function deleteChanPost(chanId, postId) {
    const ch = findChannel(chanId);
    if (!ch) return false;
    ch.posts = (ch.posts || []).filter(p => p.id !== postId);
    saveMeta();
    return true;
}

export function toggleComments(chanId, postId) {
    const p = findChanPost(chanId, postId);
    if (!p) return false;
    p.commentsOn = !p.commentsOn;
    saveMeta();
    return p.commentsOn;
}

// Реакция юзера: одна на пост, повторный тап снимает
export function toggleReact(chanId, postId, emoji) {
    const p = findChanPost(chanId, postId);
    if (!p) return;
    if (!Array.isArray(p.reacts)) p.reacts = [];
    const prev = p.reacts.find(r => r.mine);
    if (prev) {
        prev.n = Math.max(0, (prev.n || 1) - 1);
        prev.mine = false;
        if (!prev.n) p.reacts = p.reacts.filter(r => r !== prev);
        if (prev.emoji === emoji) { saveMeta(); return; }
    }
    const hit = p.reacts.find(r => r.emoji === emoji);
    if (hit) { hit.n = (hit.n || 0) + 1; hit.mine = true; }
    else p.reacts.push({ emoji, n: 1, mine: true });
    saveMeta();
}

export function addReacts(post, arr) {
    if (!post || !Array.isArray(arr)) return;
    if (!Array.isArray(post.reacts)) post.reacts = [];
    for (const r of arr.slice(0, 4)) {
        const raw = String(r?.emoji || '').trim();
        const emoji = raw && [...raw].length <= 3 && !/[\w\s]/.test(raw) ? raw : CHAN_REACTS[0];
        const n = Math.max(1, Math.min(9999, Math.round(Number(r?.n) || 1)));
        const hit = post.reacts.find(x => x.emoji === emoji);
        if (hit) hit.n = (hit.n || 0) + n;
        else post.reacts.push({ emoji, n });
    }
    post.reacts = post.reacts.slice(0, 6);
}

// ── Обсуждение ──
export function addComments(post, arr, { fromUser = false } = {}) {
    if (!post) return 0;
    if (!Array.isArray(post.comments)) post.comments = [];
    const fresh = (Array.isArray(arr) ? arr : [])
        .filter(c => c && c.author && c.text)
        .slice(0, 8)
        .map(c => ({
            id: genId(),
            author: String(c.author).slice(0, 40),
            handle: String(c.handle || '').slice(0, 32),
            text: String(c.text).slice(0, 600),
            ts: Date.now(),
            // Ключ автора решает, чьё лицо встанет на аватарку: знакомый
            // подтягивает контакт/реф, незнакомый остаётся градиентом
            ak: fromUser ? 'user' : resolveAuthorKey(c.author),
            replyTo: c.reply_to ? String(c.reply_to).slice(0, 40) : null,
            likes: Math.max(0, Math.round(Number(c.likes) || 0)),
        }));
    post.comments = [...post.comments, ...fresh].slice(-60);
    saveMeta();
    return fresh.length;
}

export function addMyComment(post, text, replyTo = null) {
    if (!post || !text.trim()) return null;
    if (!Array.isArray(post.comments)) post.comments = [];
    const c = {
        id: genId(),
        author: getUserName(),
        text: String(text).slice(0, 600),
        ts: Date.now(),
        ak: 'user',
        replyTo: replyTo ? String(replyTo).slice(0, 40) : null,
        likes: 0,
    };
    post.comments.push(c);
    post.comments = post.comments.slice(-60);
    saveMeta();
    return c;
}

export function deleteComment(post, id) {
    if (!post || !Array.isArray(post.comments)) return;
    post.comments = post.comments.filter(c => c.id !== id);
    saveMeta();
}

// Просмотры подтягиваются ко времени: свежий пост добирает охват постепенно
export function bumpViews(channel, post) {
    if (!channel || !post) return 0;
    const reach = Math.max(10, Math.round((channel.subs || 50) * 0.72));
    const ageMin = (Date.now() - (post.time || Date.now())) / 60000;
    const target = Math.round(reach * Math.min(1, 0.15 + ageMin / 600));
    if (target > (post.views || 0)) {
        post.views = target;
        saveMeta();
    }
    return post.views || 0;
}

export function addSubs(channel, n) {
    if (!channel || !n) return;
    channel.subs = Math.max(0, (channel.subs || 0) + n);
    channel.subsDelta = (channel.subsDelta || 0) + n;
    saveMeta();
}

// ── Скрин поста в лс ──
// Модель не знает id постов, поэтому ссылается на автора и текст. Ищем, что она
// имела в виду: тот же автор и заметное совпадение слов. Не нашли — карточка
// покажется серой заглушкой, а не выдумает несуществующий пост.
function words(s) {
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 4);
}

export function matchPostByText(posts, text, author = '') {
    const want = words(text);
    if (!posts?.length || !want.length) return null;
    const ak = keyOf(author);
    let best = null, bestScore = 0;
    for (const p of posts) {
        if (ak && p.author && keyOf(p.author) !== ak) continue;
        const have = new Set(words(`${p.text || ''} ${p.caption || ''} ${p.imgDesc || ''}`));
        let score = 0;
        for (const w of want) if (have.has(w)) score++;
        if (score > bestScore) { bestScore = score; best = p; }
    }
    return bestScore >= 2 ? best : null;
}


// ── Посты из ролевой ──
// Модель ведёт чужие каналы сама: <!--tel:chan:{"channel":"Имя","text":"…","photo":"…"}-->
// Свой канал пишет только она — тег с его именем игнорируется.

const CHAN_TAG_RE = /<!--\s*tel:chan:(\{[\s\S]*?\})\s*-->/gi;

function hash32(str) {
    let h = 0;
    const t = String(str);
    for (let i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0;
    return String(h);
}

function safeJson(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function applyChannelTag(j) {
    const name = String(j?.channel || j?.name || '').trim().slice(0, 60);
    const text = String(j?.text || '').trim();
    const photo = String(j?.photo || '').trim();
    if (!name || (!text && !photo)) return null;
    // Модель может прислать анонимку обычным tel:chan — не плодим двойник
    // канала, а кладём пост туда, куда он и метил
    if (anonEnabled() && keyOf(name) === keyOf(ANON_NAME)) {
        return addAnonPosts([{ text, to: j.to, from: j.from || j.author }]) ? ANON_NAME : null;
    }
    const c = getChannels();
    if (c.mine && keyOf(c.mine.name) === keyOf(name)) return null;
    let ch = c.list.find(x => keyOf(x.name) === keyOf(name));
    // Канал знакомого ролевая зовёт по имени человека, а не по названию канала
    if (!ch) {
        const who = keyOf(j.author || name);
        ch = c.list.find(x => x.person && keyOf(x.author) === who);
    }
    if (!ch) {
        // Канал, о котором ролевая заговорила впервые, появляется в списке
        // найденных — подписаться на него она решает сама
        addFoundChannels([{
            name,
            desc: String(j.desc || '').slice(0, 200),
            author: String(j.author || '').slice(0, 40),
            subs: Number(j.subs) || 0,
            posts: [],
        }]);
        ch = getChannels().list.find(x => keyOf(x.name) === keyOf(name));
        if (!ch) return null;
        ch.fromRp = true;
    }
    return addChannelPosts(ch.id, [{ text, photo }]) ? ch.name : null;
}

export function harvestChannelTags() {
    const c = getChannels();
    if (!Array.isArray(c.seenTags)) c.seenTags = [];
    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { return { n: 0, names: [] }; }
    const seen = new Set(c.seenTags);
    const names = [];
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        // Свои сообщения не сканируем: посты в каналы она публикует из телефона
        if (!msg || !msg.mes || msg.is_user || !/tel:chan/i.test(msg.mes)) continue;
        const text = stripThink(msg.mes);
        const occ = {};
        CHAN_TAG_RE.lastIndex = 0;
        let m;
        while ((m = CHAN_TAG_RE.exec(text)) !== null) {
            // Ключ как у банка: содержимое + сообщение + номер повтора. Позиция
            // тега не годится — она съезжает от любой правки текста
            const base = `cp${hash32(m[1])}:${String(msg.send_date || msg.extra?.gen_id || i)}`;
            const n = occ[base] = (occ[base] || 0) + 1;
            const key = `${base}#${n}`;
            if (seen.has(key)) continue;
            seen.add(key);
            c.seenTags.push(key);
            const added = applyChannelTag(safeJson(m[1]));
            if (added) names.push(added);
        }
    }
    if (c.seenTags.length > 300) c.seenTags = c.seenTags.slice(-300);
    saveMeta();
    return { n: names.length, names: [...new Set(names)] };
}

// ── Теги анонимки ──
const ANON_TAG_RE = /<!--\s*tel:anon:(\{[\s\S]*?\})\s*-->/gi;

export function harvestAnonTags() {
    if (!anonEnabled()) return 0;
    const c = getChannels();
    if (!Array.isArray(c.anonSeen)) c.anonSeen = [];
    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { return 0; }
    const seen = new Set(c.anonSeen);
    let n = 0;
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg || !msg.mes || msg.is_user || !/tel:anon/i.test(msg.mes)) continue;
        const text = stripThink(msg.mes);
        const occ = {};
        ANON_TAG_RE.lastIndex = 0;
        let m;
        while ((m = ANON_TAG_RE.exec(text)) !== null) {
            const base = `an${hash32(m[1])}:${String(msg.send_date || msg.extra?.gen_id || i)}`;
            const k = occ[base] = (occ[base] || 0) + 1;
            const key = `${base}#${k}`;
            if (seen.has(key)) continue;
            seen.add(key);
            c.anonSeen.push(key);
            const j = safeJson(m[1]);
            if (j && String(j.text || '').trim()) n += addAnonPosts([j]);
        }
    }
    if (c.anonSeen.length > 300) c.anonSeen = c.anonSeen.slice(-300);
    saveMeta();
    return n;
}

// ── Инжект ──
// Одна строка: где она ведёт канал и на что подписана. Без постов — их и так
// видно по журналу.
export function channelInjectLine() {
    const c = getChannels();
    const parts = [];
    if (c.mine) {
        parts.push(`Runs a channel «${c.mine.name}»${c.mine.desc ? ` (${c.mine.desc})` : ''} — ${c.mine.subs} subscribers`);
    }
    const subs = c.list.filter(x => x.subscribed)
        .map(x => (x.person && x.author ? `«${x.name}» (${x.author}'s own channel)` : `«${x.name}»`));
    if (subs.length) parts.push(`Follows channels: ${subs.slice(0, 6).join(', ')}`);
    return parts.join('. ');
}


// Анонимка — отдельной строкой: в ней и правило про тег, и то, что ролевая
// обязана знать про её собственные анонимки и про уже пробитых авторов.
export function anonInjectLine() {
    if (!anonEnabled()) return '';
    const ch = getAnonChannel();
    const handle = getUserHandle();
    const mine = ch.posts.filter(p => p.byUser).slice(0, 3);
    const known = ch.posts.filter(p => p.revealed && p.realAuthor).slice(0, 3);
    const recent = ch.posts.filter(p => !p.byUser).slice(0, 3)
        .map(p => `«${p.text.slice(0, 80)}»`).join('; ');
    let s = `[«${ANON_NAME}» — the town's anonymous gossip channel on {{user}}'s phone, ${ch.subs} subscribers. Anyone submits posts WITHOUT a name: rumours about local people, confessions, questions someone would never ask to your face. A post aimed at a person names them by @handle — {{user}} is ${handle}.]\n`;
    s += `[RULE — ANONYMOUS POST] When the story gives a reason (a rumour starts going round, someone wants to ask {{user}} something anonymously, the town notices something), append at the END: <!--tel:anon:{"text":"the post exactly as the sender wrote it, no name","to":"@handle it is aimed at — omit if it is aimed at nobody","from":"who REALLY sent it — a character's name, or a plain description like «сосед сверху»"}-->. The "from" field is HIDDEN from {{user}}: never name the sender in visible prose, and never have a character admit it unprompted. At most 1-2 such posts per reply, only when the story earns it.\n`;
    if (recent) s += `Latest posts there: ${recent}.\n`;
    if (mine.length) {
        s += `{{user}} has posted there anonymously themselves: ${mine.map(p => `«${p.text.slice(0, 90)}»`).join('; ')}. The channel shows no name — but the admin sells authors for money, so a character who is angry or curious enough CAN buy that information and confront {{user}} with it. Use this only when the story builds to it.\n`;
    }
    if (known.length) {
        s += `{{user}} has paid to unmask these: ${known.map(p => `«${p.text.slice(0, 60)}» — sent by ${p.realAuthor}${p.realWho ? ` (${p.realWho})` : ''}`).join('; ')}. ONLY {{user}} knows this; the authors have no idea they were exposed. {{user}} may drop hints, and they would be rattled.\n`;
    }
    return s.trim();
}
