import { normalizePhoneSpaces, parsePhoneJson } from './phone-text.js';
import { deviceActions } from './device-actions.js';
import { chatMedia, chatMediaKey } from './chat-media.js';
import { PHONE_APPS, phoneAppId, phoneAppInstalled, phoneTagApp } from './phone-apps.js';

import { chat_metadata } from '../../../../script.js';
import { extension_settings, saveMetadataDebounced } from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import { readPhoneMessage } from './message-sources.js';
import { captureRoleplaySms, extractRoleplaySms, hasMixedRoleplaySms } from './roleplay-sms.js';
import { cleanContactName, contactNameKey, redirectedContactKey, resolveIdentity, repairContactMetadata } from './contact-identity.js';

export const EXT_NAME = 'glassphone';
// Версия для сверки инстансов (ПК ↔ айфон): видна в настройках и в консоли.
// БАМПАТЬ при каждом коммите вместе с manifest.json!
export const GP_VERSION = '2.57.6';
const META_KEY = 'glassphone';

// ── Глобальные настройки ──
const defaultSettings = () => ({
    isEnabled: true,
    // Язык интерфейса: 'ru' | 'en' (переводится и панель настроек, и весь телефон)
    lang: 'ru',
    injectPrompt: true,
    quietMode: false,
    phoneActivityVersion: 0,
    removedPhoneApps: {},
    phoneAppVersions: {},
    toastPosition: 'center',
    showFab: true,
    fabPos: null, // {right, bottom} — сохранённая позиция кнопки
    injectDepth: 0, // глубина инжекта (0 = последний ход)
    // Прятать смс-переписку из ленты чата (сообщения ОСТАЮТСЯ в истории и контексте
    // модели — скрывается только отображение; телефон это единственное «окно» в смс)
    hideSmsInChat: true,
    captureRoleplaySms: true,
    // Профиль подключения для генерации соцсетей ('' = текущий API через generateRaw,
    // изолированно от пресета). Отдельный профиль дополнительно включает вижн.
    socialProfileId: '',
    // Префилл ответа: отдельное финальное assistant-сообщение с началом JSON.
    // Для несовместимых text-completion путей используется безопасная эмуляция.
    usePrefill: false,
    // Отдельная опция: просить модель использовать U+2007 между словами.
    // На выходе эти пробелы всегда нормализуются обратно в обычные.
    useFigureSpaces: false,
    // Контекст для генерации соцсетей:
    // 'rich' — карточка бота + персона + триггернутый лорбук + история чата (дефолт)
    // 'lite' — только короткий срез чата (максимальная изоляция)
    socialContextMode: 'rich',
    // Спам/мошенники: редкие скам-смс с незнакомых номеров (кулдаун ~35 мин)
    scamEnabled: true,
    // Картинко-расширение: '' = АВТООПРЕДЕЛЕНИЕ (ищем среди установленных
    // third-party расширений подходящее — src/pipeline.js с
    // generateImageWithRetry). Непустое = ручной оверрайд имени папки.
    imageGenExtension: '',
    // Какое картинко-расширение брать, если установлено несколько
    // ('' = автоматически: настроенное побеждает пустое)
    imageCfgKey: '',
    // Генерация картинок: модель-оверрайд ('' = модель из настроек расширения)
    imageGenModel: '',
    // Модель расширения на момент выбора оверрайда: если её там сменили,
    // оверрайд считается устаревшим и телефон следует за расширением
    imageGenModelBase: '',
    // Профиль подключения картинко-расширения ТОЛЬКО для телефона
    // ('' = активный профиль основного чата). Профили живут в
    // Профили живут в настройках самого картинко-расширения (connectionProfiles)
    imageGenProfileId: '',
    // Стиль картинко-расширения ТОЛЬКО для телефона ('' = активный стиль).
    // Стили у новорака ГЛОБАЛЬНЫЕ (не входят в профиль подключения) — поэтому
    // телефону нужен свой выбор: на другой модели нужен другой стиль
    imageGenStyleId: '',
    // One saved ExtBlocks block supplies prompts for every phone image.
    imageGenBlockKey: '',
    // Верхний лимит ответа. 0 = бюджет задачи; короткие задачи не раздуваются.
    socialMaxTokens: 0,
    // Квадрат 1:1 для инста-постов
    imageGenSquare: true,
    // Промпт-префикс картинок (стиль/кадр). Описание поста и запрет рисовать
    // главперсонажей на чужих аккаунтах дописываются автоматически ПОСЛЕ него.
    imgPromptIg: 'social media post, self-taken candid framing',
    imgPromptOf: 'intimate boudoir shot, self-taken framing',
    // Кадры твича: чужой эфир (что показывает камера стрима) и свой (фейскам)
    imgPromptTwWatch: 'livestream video frame, what the stream camera shows, stream overlay vibe',
    imgPromptTwMy: 'live webcam stream frame, streamer facecam view, stream overlay vibe',
    // Booru-теги: перед генерацией сцена конвертируется в англ. danbooru-теги
    // (1girl/1boy, solo, hair, ...) — для NovelAI и аниме-моделей, которые не
    // понимают короткие описания на русском. Стоит доп. текстовый запрос.
    imgTagMode: false,
    // Read telephone tags from ExtBlocks storage and rendered text as well.
    externalBlocks: true,
    // Reuse enabled image presets and matching image lorebook entries.
    imageGenExtensionContext: true,
    // Обои телефона (URL файла; '' = стандартный стеклянный градиент)
    wallpaper: '',
    // Размыть обои (blur-фильтр на слое обоев)
    wallpaperBlur: false,
    // Тема телефона: indigo | sunset | zephyr | neon | noir | fern | lcd | void | porcelain
    skin: 'quiet',
    // Визуальные поправки, настраиваемые прямо в приложении «Оформление».
    // null у цветов означает «использовать авторскую палитру выбранной темы».
    themeCustom: {
        accentA: null,
        accentB: null,
        radius: 18,
        transparency: 10,
        iconScale: 100,
    },
    // Пользовательские снимки оформления: [{id,name,skin,custom}]
    themePresets: [],
    // Кастомный CSS телефона
    customCss: '',
    // Автоматически тянуть аватарки из карточек персонажей/персоны
    autoAvatars: true,
    // Прикладывать фото к генерации комментов, даже когда есть описание (дороже по токенам)
    visionInComments: false,
    // Журнал соцсетей: посты юзера пишутся скрытой строкой в чат — попадают в контекст
    // по месту в истории и в саммарайз (долговременная память без роста инжекта)
    socialLogToChat: true,
    // Экран с системной панелью (приложения-обёртки вроде Tauri Tavern):
    // сдвигает телефон и кнопку из-под неё. Определяется автоматически,
    // здесь — ручной оверрайд, если обёртка не отдала безопасные отступы.
    forceSafeArea: false,
    // Компактные пояснения полей в уже сокращённой директиве
    compactRules: false,
    // Городская анонимка «Подслушано» в каналах
    anonChannel: true,
    // Тиндер: анкеты, колода и мэтчи
    tinder: true,
    // Сколько админ канала берёт за первое имя. Дальше цена растёт кратно.
    anonRevealPrice: 2500,
    // Соц-системы: подписчики, охваты, репутация, сюжетные ивенты, реклама.
    // Выключено — соцсети остаются, но постишь просто так, без цифр и поворотов.
    socialSystems: true,
});

export function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = defaultSettings();
    }
    const s = extension_settings[EXT_NAME];
    const def = defaultSettings();
    // Миграция со старой объединённой опции «префилл + фигурные пробелы»:
    // если отдельного флага ещё нет, сохраняем прежнее поведение пользователя.
    const hadFigureSpacesSetting = Object.prototype.hasOwnProperty.call(s, 'useFigureSpaces');
    for (const k in def) if (s[k] === undefined) s[k] = def[k];
    if (!hadFigureSpacesSetting) s.useFigureSpaces = !!s.usePrefill;
    if (!s.themeCustom || typeof s.themeCustom !== 'object' || Array.isArray(s.themeCustom)) {
        s.themeCustom = { ...def.themeCustom };
    } else {
        for (const k in def.themeCustom) if (s.themeCustom[k] === undefined) s.themeCustom[k] = def.themeCustom[k];
    }
    if (!Array.isArray(s.themePresets)) s.themePresets = [];
    else s.themePresets = s.themePresets.filter(p => p && typeof p === 'object' && typeof p.id === 'string');
    return s;
}

// ── Per-chat метаданные ──
const repairedContactRoots = new WeakSet();
export function getMeta() {
    const md = chat_metadata;
    if (!md[META_KEY]) {
        md[META_KEY] = { contacts: [], lastRead: {}, hidden: [] };
    }
    const m = md[META_KEY];
    if (!Array.isArray(m.contacts)) m.contacts = [];
    if (!m.lastRead || typeof m.lastRead !== 'object') m.lastRead = {};
    if (!Array.isArray(m.hidden)) m.hidden = [];
    // Ники (@handle): per-chat, override поверх авто-генерации из имени
    if (!m.handles || typeof m.handles !== 'object') m.handles = {};
    if (typeof m.userHandle !== 'string') m.userHandle = '';
    // Групповые смс-чаты: [{id, name, members: [имена]}]
    if (!Array.isArray(m.groups)) m.groups = [];
    // Переименования контактов (отображаемое имя поверх имени из чата), по ключу
    if (!m.names || typeof m.names !== 'object') m.names = {};
    if (!m.contactIdentities || typeof m.contactIdentities !== 'object' || Array.isArray(m.contactIdentities)) m.contactIdentities = {};
    for (const c of m.contacts) { const k=redirectedContactKey(m,keyOf(c?.name)); if(k&&!Object.hasOwn(m.contactIdentities,k))m.contactIdentities[k]={originalName:c.name,aliases:[]}; }
    for (const k of Object.keys(m.names)) if(!k.startsWith('group:')&&!Object.hasOwn(m.contactIdentities,k))m.contactIdentities[k]={originalName:k,aliases:[]};
    // Забаненные аккаунты соцсетей (нормализованные ключи имени/ника)
    if (!Array.isArray(m.banned)) m.banned = [];
    // Интервалы блокировки SMS по ключу контакта. Храним интервалы индексов чата,
    // а не один флаг: после разблокировки сообщения, пришедшие во время блока,
    // не должны появляться задним числом при очередном пересканировании chat[].
    if (!m.smsBlocks || typeof m.smsBlocks !== 'object' || Array.isArray(m.smsBlocks)) m.smsBlocks = {};
    if (!repairedContactRoots.has(m)) {
        repairedContactRoots.add(m);
        if (repairContactMetadata(m)) saveMeta();
    }
    // Per-chat intervals prevent paused messages from appearing on a later scan
    // or after reload. Existing history remains available while quiet mode is on.
    if (getSettings().quietMode || Array.isArray(m.quietPeriods)) {
        if (!Array.isArray(m.quietPeriods)) m.quietPeriods = [];
        const open = m.quietPeriods.at(-1);
        let changed = false;
        if (getSettings().quietMode && (!open || open.to != null)) {
            m.quietPeriods.push({ from: currentChatLength(), to: null, baseline: quietActivityBaseline() });
            changed = true;
        } else if (!getSettings().quietMode && open?.to === null) {
            open.to = currentChatLength() - 1;
            const chat = SillyTavern.getContext()?.chat || [];
            open.messages = Object.fromEntries(chat.slice(open.from, open.to + 1)
                .map((message, offset) => [quietMessageId(message, open.from + offset), true]));
            delete open.baseline;
            quietBaselineSets.delete(open);
            changed = true;
        } else if (open?.to === null && open.from > currentChatLength()) {
            open.from = currentChatLength();
            changed = true;
        }
        if (changed) { invalidateChatCache(); saveMetadataDebounced(); }
    }
    syncPhoneApps(m);
    return m;
}

export function isPhoneAppInstalled(id) { return phoneAppInstalled(getSettings(), id); }

// Keep a per-chat snapshot so events emitted while an app was removed cannot
// replay after reinstall, including tags appended to an older streaming reply.
const APP_TAGS = /<!--\s*tel:([a-z_]+):([\s\S]*?)-->/gi;
const appTagSets = new WeakMap();
const syncedAppVersions = new WeakMap();
function appSets(entry) {
    let sets = appTagSets.get(entry);
    if (!sets) { sets = { accepted: new Set(entry.accepted || []), ignored: new Set(entry.ignored || []) }; appTagSets.set(entry, sets); }
    return sets;
}
function appForEvent(root, kind, body) {
    if (kind.toLowerCase() === 'sms' || kind.toLowerCase() === 'out') {
        try {
            const data = parsePhoneJson(body), name = data.from || data.to || '';
            if (!data.chat && root.tinder?.matches?.some(match => match.inApp && keyOf(match.name) === keyOf(name))) return 'tinder';
        } catch (_) { /* Partial tag. */ }
    }
    return phoneTagApp(kind);
}
function visitAppTags(root, message, index, visit) {
    const counts = new Map();
    return getPhoneMessageText(message).replace(APP_TAGS, (tag, kind, body) => {
        const app = appForEvent(root, kind, body);
        if (!app) return tag;
        const base = quietActivityKey(message, index, kind, body);
        const count = (counts.get(base) || 0) + 1; counts.set(base, count);
        return visit(app, base + ':' + count, tag);
    });
}
function currentAppTags(root) {
    const result = new Map();
    for (const [index, message] of (SillyTavern.getContext()?.chat || []).entries()) {
        visitAppTags(root, message, index, (app, key, tag) => {
            if (!result.has(app)) result.set(app, new Set());
            result.get(app).add(key); return tag;
        });
    }
    return result;
}
function syncPhoneApps(root) {
    const settings = getSettings(), signature = JSON.stringify(settings.phoneAppVersions || {});
    if (syncedAppVersions.get(root) === signature) return;
    if (!root.appLifecycle || typeof root.appLifecycle !== 'object') root.appLifecycle = {};
    const tags = currentAppTags(root);
    for (const app of PHONE_APPS) {
        const version = Number(settings.phoneAppVersions?.[app.id]) || 0;
        let entry = root.appLifecycle[app.id];
        if (!entry) entry = root.appLifecycle[app.id] = { version, accepted: [...(tags.get(app.id) || [])], ignored: [] };
        else if (entry.version !== version) {
            const sets = appSets(entry);
            for (const key of tags.get(app.id) || []) if (!sets.accepted.has(key)) sets.ignored.add(key);
            entry.ignored = [...sets.ignored]; entry.version = version;
        }
    }
    syncedAppVersions.set(root, signature);
    saveMetadataDebounced();
}
export function setPhoneAppInstalled(id, installed) {
    id = phoneAppId(id);
    const app = PHONE_APPS.find(item => item.id === id);
    if (!app || app.essential || isPhoneAppInstalled(id) === !!installed) return false;
    const root = getMeta(), settings = getSettings();
    // Record the current history before disabling; record exclusions before enabling.
    (SillyTavern.getContext()?.chat || []).forEach((message, index) => getPhoneAppText(message, index));
    if (!settings.removedPhoneApps || typeof settings.removedPhoneApps !== 'object') settings.removedPhoneApps = {};
    if (!settings.phoneAppVersions || typeof settings.phoneAppVersions !== 'object') settings.phoneAppVersions = {};
    if (installed) delete settings.removedPhoneApps[id]; else settings.removedPhoneApps[id] = true;
    settings.phoneAppVersions[id] = (Number(settings.phoneAppVersions[id]) || 0) + 1;
    settings.phoneActivityVersion = (Number(settings.phoneActivityVersion) || 0) + 1;
    syncedAppVersions.delete(root); syncPhoneApps(root); invalidateChatCache();
    return true;
}
export function getPhoneAppText(message, index) {
    const root = getMeta();
    if (!Number.isInteger(index)) index = (SillyTavern.getContext()?.chat || []).indexOf(message);
    let changed = false;
    const text = visitAppTags(root, message, index, (app, key, tag) => {
        const entry = root.appLifecycle[app], sets = appSets(entry);
        if (sets.ignored.has(key)) return tag.replace(/[^\r\n]/g, ' ');
        if (!isPhoneAppInstalled(app)) {
            if (!sets.accepted.has(key)) { sets.ignored.add(key); entry.ignored.push(key); changed = true; }
            return tag.replace(/[^\r\n]/g, ' ');
        }
        if (!sets.accepted.has(key)) { sets.accepted.add(key); entry.accepted.push(key); changed = true; }
        return tag;
    });
    if (changed) saveMetadataDebounced();
    return text;
}

export function phoneActivityAllowed(version = getSettings().phoneActivityVersion) {
    const settings = getSettings();
    return !settings.quietMode && version === settings.phoneActivityVersion;
}

export function setPhoneQuietMode(enabled) {
    getMeta();
    const settings = getSettings();
    if (settings.quietMode === !!enabled) return false;
    // Include tags appended to an already existing streaming message or swipe.
    // They need a permanent exclusion as their message index predates the pause.
    if (settings.quietMode) {
        const chat = SillyTavern.getContext()?.chat || [];
        chat.forEach((message, index) => getPhoneActivityText(message, index));
    }
    settings.quietMode = !!enabled;
    settings.phoneActivityVersion = (Number(settings.phoneActivityVersion) || 0) + 1;
    getMeta();
    invalidateChatCache();
    return true;
}

export function wasPhoneQuietAt(index, message = SillyTavern.getContext()?.chat?.[index]) {
    const key = quietMessageId(message, index);
    return (getMeta().quietPeriods || []).some(period => period.messages
        ? !!period.messages[key] : index >= period.from && (period.to == null || index <= period.to));
}

export function getPhoneActivityText(message, index) {
    const text = getPhoneAppText(message, index);
    if (message?.is_user) return text;
    if (!Number.isInteger(index)) index = (SillyTavern.getContext()?.chat || []).indexOf(message);
    if (index >= 0 && wasPhoneQuietAt(index, message)) return '';
    const root = getMeta(), paused = !!getSettings().quietMode;
    if (!paused && !root.quietIgnoredTags) return text;
    const period = paused ? root.quietPeriods?.at(-1) : null;
    let baseline = period ? quietBaselineSets.get(period) : null;
    if (period && !baseline) { baseline = new Set(period.baseline || []); quietBaselineSets.set(period, baseline); }
    const counts = new Map();
    let changed = false;
    const filtered = text.replace(QUIET_ACTIVITY_TAG, (tag, kind, body) => {
        const base = quietActivityKey(message, index, kind, body);
        const count = (counts.get(base) || 0) + 1;
        counts.set(base, count);
        const key = base + ':' + count;
        if (root.quietIgnoredTags?.[key]) return '';
        if (!paused || baseline?.has(key)) return tag;
        if (!root.quietIgnoredTags) root.quietIgnoredTags = {};
        root.quietIgnoredTags[key] = true;
        changed = true;
        return '';
    });
    if (changed) { invalidateChatCache(); saveMetadataDebounced(); }
    return filtered;
}

const QUIET_ACTIVITY_TAG = /<!--\s*tel:(?!bank\b|plan\b|time\b|out\b|sent\b|silent\b|log\b|priv\b|mark\b)([a-z_]+):([\s\S]*?)-->/gi;
const quietBaselineSets = new WeakMap();
function quietMessageId(message, index) {
    return JSON.stringify([message?.send_date || message?.extra?.gen_id || index,
        message?.name || '', !!message?.is_user, message?.extra?.gen_id || '']);
}
function quietActivityKey(message, index, kind, body) {
    let normalized = body;
    try {
        const data = JSON.parse(body);
        normalized = JSON.stringify(Object.fromEntries(Object.keys(data).sort()
            .filter(key => key !== 'img' && key !== 'react').map(key => [key, data[key]])));
    } catch (_error) { /* A partial streaming tag is suppressed as well. */ }
    let hash = 2166136261;
    for (const char of kind.toLowerCase() + ':' + normalized) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return String(message?.send_date || message?.extra?.gen_id || index) + ':' + (hash >>> 0).toString(36);
}
function quietActivityBaseline() {
    const keys = [];
    for (const [index, message] of (SillyTavern.getContext()?.chat || []).entries()) {
        if (!message || message.is_user) continue;
        const counts = new Map();
        const text = readPhoneMessage(message, getSettings().externalBlocks !== false, stripThink);
        for (const match of text.matchAll(QUIET_ACTIVITY_TAG)) {
            const base = quietActivityKey(message, index, match[1], match[2]);
            const count = (counts.get(base) || 0) + 1;
            counts.set(base, count);
            keys.push(base + ':' + count);
        }
    }
    return keys;
}

// ── Сброс к заводским ──
// Два независимых хранилища: настройки расширения общие для всех чатов,
// данные телефона (контакты, переписки, банк, магазин, соцсети) — свои у
// каждого чата. Что чистить, решает вызывающий.
export function factoryReset({ settings = true, chatData = true } = {}) {
    if (settings) {
        extension_settings[EXT_NAME] = defaultSettings();
    }
    if (chatData) {
        try { delete chat_metadata[META_KEY]; } catch (e) { chat_metadata[META_KEY] = undefined; }
        getMeta();          // сразу пересоздаём пустую структуру
        invalidateChatCache();
        saveMeta();
    }
}

// Следы телефона в САМОЙ истории чата: служебные строки журнала и скрытые
// теги внутри реплик. Без их удаления контакты и переписки воскресают при
// первом же пересканировании — метаданные телефона строятся из чата.
// Возвращает {removed, cleaned} — сколько сообщений удалено и подчищено.
export async function wipePhoneTraces() {
    let removed = 0, cleaned = 0;
    try {
        const ctx = SillyTavern.getContext();
        const chat = ctx?.chat;
        if (!Array.isArray(chat)) return { removed, cleaned };
        const TAGS = /<!--\s*tel:[\s\S]*?-->\s*/gi;
        for (let i = chat.length - 1; i >= 0; i--) {
            const m = chat[i];
            if (!m || typeof m.mes !== 'string') continue;
            // Целиком наши строки журнала — удаляем сообщение
            if (/<!--\s*tel:log\s*-->/i.test(m.mes)) {
                chat.splice(i, 1);
                removed++;
                continue;
            }
            if (!/<!--\s*tel:/i.test(m.mes)) continue;
            const next = m.mes.replace(TAGS, '').replace(/\n{3,}/g, '\n\n').trim();
            if (next !== m.mes) { m.mes = next; cleaned++; }
        }
        invalidateChatCache();
        if (typeof ctx.saveChat === 'function') await ctx.saveChat();
    } catch (e) {
        console.warn('[GlassPhone] wipePhoneTraces failed:', e);
    }
    return { removed, cleaned };
}

// ── Имя {{user}} и проверка «это она сама» ──
export function userName() {
    try { return SillyTavern.getContext()?.name1 || ''; } catch (e) { return ''; }
}
// Модель порой пишет от лица {{user}}: постит её твиты, шлёт смс «от неё».
// Такие теги в телефон попадать не должны — свой канал у неё уже есть.
export function isUserName(name) {
    const k = keyOf(stripHandle(name));
    if (!k) return false;
    if (k === keyOf(userName())) return true;
    const own = getMeta().userHandle;
    return !!own && k === keyOf(stripHandle(own));
}

// ── Убрать @ из ника/имени ──
export function stripHandle(s) {
    return String(s || '').replace(/^@+/, '').trim();
}

// A contact keeps its original identity; address-book labels are personal aliases.
export function resolveContactKey(value){
    return resolveIdentity(getMeta(),value);
}
function rememberContact(name,key=resolveContactKey(name)){
    if(!key||key.startsWith('group:'))return;
    const m=getMeta(),ids=m.contactIdentities;
    if(!Object.hasOwn(ids,key))ids[key]={originalName:cleanContactName(name||key),aliases:[]};
    const item=ids[key];
    if(!Array.isArray(item.aliases))item.aliases=[];
    if(!item.originalName||(item.originalName===key&&contactNameKey(name)===contactNameKey(key)))item.originalName=cleanContactName(name||key);
}
export function contactOriginalName(key,fallback=''){
    const k=resolveContactKey(key),m=getMeta();
    const record=Object.hasOwn(m.contactIdentities,k)?m.contactIdentities[k]:null;
    return record?.originalName||m.contacts.find(c=>resolveIdentity(m,c.name)===k)?.name||fallback||k;
}
export function displayName(key,fallback){
    const m=getMeta(),k=resolveContactKey(key);
    return (Object.hasOwn(m.names,k)&&m.names[k])||fallback||k;
}
export function renameContact(key,newName){
    const m=getMeta(),k=resolveContactKey(key),n=String(newName||'').trim().slice(0,60);
    if(k.startsWith('group:')){if(n)m.names[k]=n;else delete m.names[k];saveMeta();return;}
    rememberContact(contactOriginalName(k),k);
    const item=m.contactIdentities[k],old=m.names[k];
    if(old&&old!==n&&!item.aliases.includes(old))item.aliases.push(old);
    item.aliases=item.aliases.slice(-20);
    if(n)m.names[k]=n;else delete m.names[k];
    m.lastRenamedContact=k;
    saveMeta();
}
export function contactIdentityPrompt() {
    const focus=getMeta().lastRenamedContact;
    const aliases = getThreadList().filter(thread => !thread.isGroup && thread.name !== thread.originalName)
        .sort((a,b)=>Number(b.key===focus)-Number(a.key===focus)).slice(0, 60);
    if (!aliases.length) return '';
    return 'CONTACT LABELS (canonical character = name saved by {{user}}). These are the same people, with the same lore and stable handles. Remember the saved label in conversations with that contact; never treat it as a new person or infer that unrelated characters know the address book. Use canonical character names in phone tags, not the saved labels:\n'
        + aliases.map(thread => JSON.stringify(thread.originalName) + ' = ' + JSON.stringify(thread.name)).join('\n');
}

// ── Бан аккаунтов соцсетей ──
export function banKey(nameOrHandle) {
    return keyOf(stripHandle(nameOrHandle));
}
export function banAccount(nameOrHandle) {
    const m = getMeta();
    const k = banKey(nameOrHandle);
    if (k && !m.banned.includes(k)) m.banned.push(k);
    saveMeta();
}
export function unbanAccount(nameOrHandle) {
    const m = getMeta();
    const k = banKey(nameOrHandle);
    m.banned = m.banned.filter(x => x !== k);
    saveMeta();
}
export function isBanned(nameOrHandle, handle) {
    const m = getMeta();
    if (!m.banned.length) return false;
    const k1 = banKey(nameOrHandle);
    const k2 = handle ? banKey(handle) : null;
    return (k1 && m.banned.includes(k1)) || (k2 && m.banned.includes(k2));
}
export function getBanned() { return getMeta().banned; }

// ── Блокировка входящих SMS ──
function currentChatLength() {
    try { return SillyTavern.getContext()?.chat?.length || 0; } catch (e) { return 0; }
}

export function isSmsBlocked(key) {
    return wasSmsBlockedAt(key,currentChatLength());
}

let deviceEventSnapshot=null;
export function getDeviceEvents(){
    if(deviceEventSnapshot)return deviceEventSnapshot;
    const chat=SillyTavern.getContext()?.chat||[],events=[];
    for(let i=0;i<chat.length;i++){const message=chat[i];if(!message||message.is_user||message.is_system)continue;
        for(const event of deviceActions(stripThink(getPhoneActivityText(message,i))))if(!isUserName(event.actor))events.push({...event,index:i});}
    return events;
}
export function isDeviceContactBlocked(app,key,index=currentChatLength()){
    const k=resolveContactKey(key),events=[];
    for(const event of getDeviceEvents())if(event.index<=index&&event.app===app&&resolveContactKey(event.to)===k&&event.action!=='send')events.push({index:event.index,blocked:event.action==='block'});
    events.push(...(getMeta().deviceBlockOverrides?.[app]?.[k]||[]));events.sort((a,b)=>a.index-b.index);
    return events.filter(event=>event.index<=index).at(-1)?.blocked===true;
}
export function overrideDeviceContactBlock(app,key,blocked){const meta=getMeta();meta.deviceBlockOverrides||={};meta.deviceBlockOverrides[app]||={};(meta.deviceBlockOverrides[app][resolveContactKey(key)]||=[]).push({index:currentChatLength(),blocked:!!blocked});saveMeta();}

export function blockSmsContact(key) {
    const k = resolveContactKey(key);
    if (!k || k.startsWith('group:')) return false;
    const meta = getMeta();
    if(isSmsBlocked(k))return false;
    meta.smsBlockManual||={};(meta.smsBlockManual[k]||=[]).push({index:currentChatLength(),blocked:true});
    if (!Array.isArray(meta.smsBlocks[k])) meta.smsBlocks[k] = [];
    meta.smsBlocks[k].push({ from: currentChatLength(), to: null });
    saveMeta();
    return true;
}

export function unblockSmsContact(key) {
    const k = resolveContactKey(key);
    const meta = getMeta();
    if(!isSmsBlocked(k))return false;
    meta.smsBlockManual||={};(meta.smsBlockManual[k]||=[]).push({index:currentChatLength(),blocked:false});
    const ranges = meta.smsBlocks[k];
    if (!Array.isArray(ranges)){saveMeta();return true;}
    const open = [...ranges].reverse().find(r => r && r.to == null);
    if (!open){saveMeta();return true;}
    open.to = currentChatLength() - 1;
    saveMeta();
    return true;
}

export function getBlockedSmsKeys() {
    const meta = getMeta();
    return [...new Set([...Object.keys(meta.smsBlocks),...getDeviceEvents().filter(event=>event.app==='sms').map(event=>resolveContactKey(event.to))])].filter(k => isSmsBlocked(k));
}

function wasSmsBlockedAt(key, chatIndex) {
    const meta=getMeta(),k=resolveContactKey(key),events=[];
    for(const range of meta.smsBlocks[k]||[]){events.push({index:Number(range.from),blocked:true});if(range.to!=null)events.push({index:Number(range.to)+1,blocked:false});}
    for(const event of getDeviceEvents())if(event.app==='sms'&&resolveContactKey(event.to)===k&&event.action!=='send')events.push({index:event.index,blocked:event.action==='block'});
    events.push(...(meta.smsBlockManual?.[k]||[]));events.sort((a,b)=>a.index-b.index);
    return events.filter(event=>event.index<=chatIndex).at(-1)?.blocked===true;
}

// ── Группы ──
export function addGroup(name, members) {
    const m = getMeta();
    const id = 'g' + Date.now().toString(36);
    m.groups.push({ id, name: String(name).trim(), members: (members || []).map(x => String(x).trim()).filter(Boolean) });
    saveMeta();
    return id;
}
export function delGroup(groupKey) {
    const m = getMeta();
    // Old group tags remain in the roleplay chat: hide their thread as well.
    hideContact(groupKey);
    m.groups = m.groups.filter(g => `group:${keyOf(g.name)}` !== groupKey);
    saveMeta();
}
export function updateGroupMembers(groupKey, members) {
    const m = getMeta();
    let g = m.groups.find(g => `group:${keyOf(g.name)}` === groupKey);
    if (!g) {
        const thread = getThread(groupKey);
        if (!thread?.isGroup) return false;
        g = {id:'g' + Date.now().toString(36), name:thread.originalName, members:[]};
        m.groups.push(g);
    }
    g.members = (members || []).map(x => String(x).trim()).filter(Boolean);
    saveMeta();
    return true;
}

// Версия метаданных: любое сохранение инвалидирует кэш scanChat
let _metaVersion = 0;
let metadataNoticeQueued = false;
let metadataNoticeOwner = null;
export function saveMeta() {
    _metaVersion++;
    try { saveMetadataDebounced(); } catch (e) { console.warn('[GlassPhone] saveMeta failed:', e); }
    scheduleImageOffload();
    // Coalesce app writes so a locked phone refreshes after the whole update,
    // including async reactions and deliveries outside the main chat handler.
    if(typeof window!=='undefined'){
        metadataNoticeOwner=chat_metadata[META_KEY];
        if(!metadataNoticeQueued){metadataNoticeQueued=true;queueMicrotask(()=>{
            metadataNoticeQueued=false;
            window.dispatchEvent(new CustomEvent('gp:metadata',{detail:{owner:metadataNoticeOwner}}));
        });}
    }
}

// ── Фото из метаданных — в файлы ──
// Загруженные ею снимки (каналы, сторис, инста, OF, тиндер, аватарки) ложились
// в chat_metadata строкой base64: одна картинка канала — 150 КБ, и весь этот
// груз переписывался в файл чата при каждом сохранении. Выносим такие строки
// в /user/images/glassphone, в метаданных остаётся короткий путь. Проходит и по
// старым чатам — при первом же сохранении.
const IMG_DATA_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
let _offloadTimer = null;
let _offloading = false;

function scheduleImageOffload() {
    clearTimeout(_offloadTimer);
    _offloadTimer = setTimeout(() => { offloadMetaImages(); }, 2000);
}

export async function offloadMetaImages() {
    if (_offloading) return 0;
    _offloading = true;
    try {
        const root = getMeta();
        const hits = [];
        const walk = (node, depth) => {
            if (!node || typeof node !== 'object' || depth > 12) return;
            for (const k of Object.keys(node)) {
                const v = node[k];
                if (typeof v === 'string') {
                    if (v.length > 4096 && IMG_DATA_RE.test(v)) hits.push([node, k, v]);
                } else if (v && typeof v === 'object') {
                    walk(v, depth + 1);
                }
            }
        };
        walk(root, 0);
        if (!hits.length) return 0;

        const saved = new Map(); // одна и та же картинка — один файл
        let n = 0;
        for (const [node, k, v] of hits) {
            let path = saved.get(v);
            if (!path) {
                const ext = (v.match(IMG_DATA_RE)[1] || 'jpeg').toLowerCase().replace('jpg', 'jpeg');
                try {
                    path = await saveBase64AsFile(v.replace(IMG_DATA_RE, ''), 'glassphone', `meta_${Date.now()}_${n}`, ext);
                } catch (e) {
                    console.warn('[GlassPhone] image offload failed:', e);
                    continue;
                }
                if (!path) continue;
                saved.set(v, path);
            }
            // Пока файл писался, могли переключить чат — чужие метаданные не трогаем
            if (getMeta() !== root) return n;
            if (node[k] === v) { node[k] = path; n++; }
        }
        if (n) {
            _metaVersion++;
            try { saveMetadataDebounced(); } catch (e) { /* ignore */ }
        }
        return n;
    } finally {
        _offloading = false;
    }
}

// ── Кэш тяжёлых проходов по чату ──
// scanChat/getHiddenMessageIndexes читают ВЕСЬ чат со stripThink-регэкспами на
// каждом сообщении. Их дёргают рендер, инжект, харвест тегов и MutationObserver —
// а resolveAuthorKey звал scanChat внутри цикла по тегам, давая O(n²)
// (чат 1000 сообщений ≈ 400+ мс на событие → заметные фризы).
// Сигнатура дешёвая: длина чата + хвост последнего сообщения + версия метаданных.
export function getPhoneMessageText(message) {
    return readPhoneMessage(message, getSettings().externalBlocks !== false, stripThink);
}

export function getRoleplaySmsOptions() {
    const context = SillyTavern.getContext();
    return {
        userNames: [context.name1, getMeta().userHandle, 'User', '{{user}}'].filter(Boolean),
        otherNames: [context.name2, ...(getMeta().contacts || []).map(contact => contact.name)]
            .filter(name => name && !isUserName(name)),
    };
}

export function captureRoleplayOutgoing() {
    if (!isPhoneAppInstalled('list') || getSettings().quietMode || getSettings().captureRoleplaySms === false) return 0;
    const count = captureRoleplaySms(SillyTavern.getContext().chat || [], getPhoneMessageText, getRoleplaySmsOptions());
    if (count) invalidateChatCache();
    return count;
}

function chatSignature() {
    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { return 'x'; }
    const last = chat.length ? chat[chat.length - 1] : null;
    const tail = last ? getPhoneMessageText(last).slice(-160) : '';
    const swipe = last?.swipe_id ?? '';
    return `${chat.length}|${swipe}|${tail}|${_metaVersion}`;
}

let _scanCache = null, _scanSig = null;
let _hiddenCache = null, _hiddenSig = null;

// Принудительный сброс (правки сообщений, смена чата)
export function invalidateChatCache() {
    _scanSig = null; _hiddenSig = null;
}

// ── Ключ треда/контакта: нормализованное имя ──
export function keyOf(name) {
    return String(name || '').trim().toLowerCase();
}

// ── Упоминается ли имя (или любое его слово ≥3 симв.) в тексте ──
// КРИТИЧНО: обычный \b НЕ работает с кириллицей (JS \w = только ASCII) — из-за
// этого имена вроде «Вадим Огнев» не находились. Здесь границы проверяем вручную
// по классу буква/цифра (латиница+кириллица).
// Уменьшительные формы русских имён: «Танюша» должна матчиться с персоной
// «Татьяна», «Вадик» — с карточкой «Вадим Огнев» (иначе рефы не тянутся)
const NAME_DIMINUTIVES = {
    'александр': ['саша', 'саня', 'шура', 'санёк', 'санек'],
    'александра': ['саша', 'шура', 'сашенька'],
    'алексей': ['лёша', 'леша', 'алёша', 'алеша', 'лёха', 'леха'],
    'анастасия': ['настя', 'ася', 'настенька', 'настюша'],
    'анна': ['аня', 'анюта', 'нюра', 'анечка'],
    'андрей': ['андрюша', 'дрон'],
    'артём': ['тёма', 'тема', 'тёмка', 'темка'],
    'артем': ['тёма', 'тема', 'тёмка', 'темка'],
    'борис': ['боря'],
    'вадим': ['вадик', 'вадя', 'вадимка'],
    'валентина': ['валя', 'валюша'],
    'варвара': ['варя'],
    'василий': ['вася'],
    'виктор': ['витя'],
    'виктория': ['вика', 'викуся'],
    'владимир': ['вова', 'володя', 'вовка'],
    'владислав': ['влад', 'славик'],
    'галина': ['галя'],
    'григорий': ['гриша'],
    'дарья': ['даша', 'дашенька', 'дашка'],
    'дмитрий': ['дима', 'димка', 'митя'],
    'евгений': ['женя', 'женёк'],
    'евгения': ['женя'],
    'екатерина': ['катя', 'катюша', 'катенька', 'катька'],
    'елена': ['лена', 'ленка', 'алёна', 'алена', 'леночка'],
    'елизавета': ['лиза', 'лизонька'],
    'иван': ['ваня', 'ванюша', 'ванька'],
    'ирина': ['ира', 'иришка', 'ирочка'],
    'константин': ['костя'],
    'ксения': ['ксюша', 'ксюха'],
    'любовь': ['люба', 'любаша'],
    'людмила': ['люда', 'мила', 'люся'],
    'маргарита': ['рита', 'марго'],
    'мария': ['маша', 'маруся', 'машенька', 'машка'],
    'михаил': ['миша', 'мишка'],
    'надежда': ['надя', 'надюша'],
    'наталья': ['наташа', 'ната', 'наташка'],
    'наталия': ['наташа', 'ната'],
    'николай': ['коля', 'колян'],
    'ольга': ['оля', 'олечка', 'олька'],
    'павел': ['паша', 'пашка'],
    'пётр': ['петя'],
    'петр': ['петя'],
    'полина': ['поля', 'полечка'],
    'роман': ['рома', 'ромка'],
    'светлана': ['света', 'светик'],
    'сергей': ['серёжа', 'сережа', 'серый', 'серёга', 'серега'],
    'софия': ['соня', 'сонечка'],
    'софья': ['соня', 'сонечка'],
    'станислав': ['стас'],
    'степан': ['стёпа', 'степа'],
    'татьяна': ['таня', 'танюша', 'танечка', 'танюха', 'тата', 'танька'],
    'фёдор': ['федя'],
    'федор': ['федя'],
    'юлия': ['юля', 'юлечка', 'юлька'],
    'юрий': ['юра', 'юрка'],
    'яков': ['яша'],
};

// Все формы имени: слова полного имени + уменьшительные (в обе стороны:
// персона «Таня» тоже должна ловить «Татьяна» и «Танюша» в тексте)
export function nameAliases(name) {
    const words = String(name || '').toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    const out = new Set(words);
    for (const w of words) {
        for (const d of (NAME_DIMINUTIVES[w] || [])) out.add(d);
        for (const [full, dims] of Object.entries(NAME_DIMINUTIVES)) {
            if (dims.includes(w)) {
                out.add(full);
                for (const d of dims) out.add(d);
            }
        }
    }
    return [...out].filter(w => w.length >= 3);
}

export function textMentionsName(text, name) {
    const t = String(text || '').toLowerCase();
    if (!t || !name) return false;
    const isWordChar = (c) => !!c && /[a-zа-яё0-9ё]/i.test(c);
    const words = nameAliases(name);
    const hit = (needle, maxTail) => {
        let from = 0, i;
        while ((i = t.indexOf(needle, from)) !== -1) {
            const before = t[i - 1];
            if (!isWordChar(before)) {
                // Хвост — падежное окончание: «Татьяну», «Татьяной», «Елисея»
                for (let tail = 0; tail <= maxTail; tail++) {
                    const after = t[i + needle.length + tail];
                    if (tail > 0 && !isWordChar(t[i + needle.length + tail - 1])) break;
                    if (!isWordChar(after)) return true;
                }
            }
            from = i + 1;
        }
        return false;
    };
    for (const w of words) {
        if (hit(w, 0)) return true;
        // Русские имена склоняются: ищем основу, разрешая до двух букв
        // окончания. Основа короче четырёх букв ловила бы «вер» в «верно».
        const stem = w.slice(0, -1);
        if (stem.length >= 4 && hit(stem, 2)) return true;
    }
    return false;
}

// ── Картинка сообщения: extra.media (ST 1.18+) с фолбэком на extra.image ──
// В ST 1.18 extra.image превращён в deprecated-геттер (console.trace при каждом
// чтении) поверх массива extra.media. Читаем массив напрямую; старый плоский
// image берём только если это обычное СВОЁ свойство (без геттера — без трейсов).
export function extraImageOf(msg) {
    const ex = msg?.extra;
    if (!ex || typeof ex !== 'object') return '';
    if (Array.isArray(ex.media)) {
        const m = ex.media.find(x => x && x.type === 'image' && typeof x.url === 'string' && x.url);
        if (m) return m.url;
    }
    const desc = Object.getOwnPropertyDescriptor(ex, 'image');
    if (desc && 'value' in desc && typeof desc.value === 'string') return desc.value;
    return '';
}

// ── Вырезать CoT-блоки (<think> и подобные) ──
// КРИТИЧНО: reasoning-модели иногда пишут теги tel:sms с текстами сообщений прямо
// в цепочке размышлений → сканер видел их и ДУБЛИРОВАЛ сообщения в телефоне.
// Всё, что внутри think-блоков, для телефона не существует.
export function stripThink(text) {
    if (!text) return '';
    let res = String(text);
    // Сначала удаляем закрытые блоки, чтобы избежать дублей (модель могла написать теги и в think, и в ответе)
    res = res.replace(/<(think|thinking|reasoning|analysis|reflection)[^>]*>[\s\S]*?<\/\1>/gi, '');
    
    // Для незакрытого блока:
    const unclosedMatch = res.match(/<(think|thinking|reasoning)[^>]*>([\s\S]*)$/i);
    if (unclosedMatch) {
        const inside = unclosedMatch[2];
        // Если внутри незакрытого блока есть теги телефона, значит модель забыла закрыть блок
        // и выдала итоговые теги прямо внутри. В таком случае оставляем содержимое.
        if (/<!--\s*tel:/i.test(inside)) {
            res = res.replace(/<(think|thinking|reasoning)[^>]*>/gi, '');
        } else {
            // Тегов нет, безопасно удаляем всё до конца (видимо, модель просто оборвала мысль)
            res = res.replace(/<(think|thinking|reasoning)[^>]*>[\s\S]*$/gi, '');
        }
    }
    return res;
}

// ── Толерантный JSON-парсер (модели любят одинарные кавычки и висячие запятые) ──
function safeJson(raw) {
    if (!raw) return null;
    try { return parsePhoneJson(raw); } catch (e) {}
    try {
        const fixed = raw.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
        return parsePhoneJson(fixed);
    } catch (e2) {}
    try {
        // Fallback для неэкранированных переносов строк внутри значений (частая ошибка моделей)
        let f = raw.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
        f = f.replace(/([^\\])\n/g, '$1\\n').replace(/([^\\])\r/g, '$1\\r');
        return parsePhoneJson(f);
    } catch (e3) {}
    try {
        // Последняя надежда: извлекаем ключи регулярками
        const res = {};
        const extract = (key) => {
            const re = new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'i');
            const m = raw.match(re) || raw.replace(/'/g, '"').match(re);
            if (m) return normalizePhoneSpaces(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'));
            return null;
        };
        res.from = extract('from');
        res.text = extract('text');
        res.to = extract('to');
        res.photo = extract('photo');
        res.chat = extract('chat');
        res.name = extract('name');
        res.number = extract('number');
        if (res.from || res.name) return res;
    } catch (e4) {}
    return null;
}

// ── Регэкспы тегов ──
const TAG_RE = /<!--\s*tel:(contact|sms):(\{[\s\S]*?\})\s*-->/gi;
const OUT_RE = /<!--\s*tel:out:(\{[\s\S]*?\})\s*-->/i;
const OUT_ALL_RE = /<!--\s*tel:out:(\{[\s\S]*?\})\s*-->/gi;
// «Персонаж решил не отвечать на смс» — пустой ответ телефона
const SILENT_RE = /<!--\s*tel:silent\s*-->/i;
// Журнальная запись соцсетей (скрыта из ленты, но в контексте модели)
const LOG_RE = /<!--\s*tel:log\s*-->/i;
// Запись журнала пишет телефон: имя GlassPhone либо сообщение НАЧИНАЕТСЯ
// с метки и ничего кроме журнальной строки в нём нет.
export function isAppJournal(msg) {
    if (!msg || !msg.mes) return false;
    if (msg.name === 'GlassPhone' || msg.extra?.model === 'GlassPhone') return true;
    return /^\s*<!--\s*tel:log\s*-->/i.test(String(msg.mes));
}
// Любой наш тег (для детекта смс-only сообщений)
const ANY_TEL_RE = /<!--\s*tel:(sms|contact|out|sent|silent|log)/i;
// Видимый формат исходящей смс (парсим как fallback, если JSON битый)
// Видимый формат двуязычный: [СМС → X] / [SMS → X] (телефон пишет по языку UI);
// [Голосовое → X] / [Voice → X] — голосовое сообщение (текст = расшифровка)
const OUT_VISIBLE_RE = /\[(СМС|SMS|Голосовое|Voice)\s*→\s*([^\]]+)\]\s*([\s\S]*)/i;
// Видимый формат групповой исходящей смс: [СМС в чат «Название»] текст
const OUT_VISIBLE_GROUP_RE = /\[(СМС|SMS|Голосовое|Voice)\s+(?:в\s+чат|to\s+chat)\s*[«"]([^»"]+)[»"]\]\s*([\s\S]*)/i;
const VOICE_KIND_RE = /^(голосовое|voice)$/i;

// Смс попадают в телефон ТОЛЬКО из явных tel:sms тегов — это наш протокол,
// модель ставит их осознанно. Эвристики «чей телефон» и бэктик-парсер прозы
// удалены: от тегов внутри CoT защищает stripThink, от адресованных боту — j.to.

// ── Детект номера в обычной прозе («вот мой номер: +7 900...») ──
// Контекстное слово должно быть в пределах ±120 символов от числа.
const PHONE_NUM_RE = /(?:\+?\d[\d\-\s()]{7,17}\d)/g;
const PHONE_CTX_RE = /(номер|телефон|запиши|звони|набери|позвони|пиши\s+мне|наберёшь|наберешь|смс|sms|phone|number|call\s+me|text\s+me|reach\s+me)/i;

function detectProseNumber(text) {
    if (!text) return null;
    PHONE_NUM_RE.lastIndex = 0;
    let m;
    while ((m = PHONE_NUM_RE.exec(text)) !== null) {
        const numStr = m[0].trim();
        const digits = numStr.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) continue;
        const start = Math.max(0, m.index - 120);
        const end = Math.min(text.length, m.index + numStr.length + 120);
        const ctx = text.slice(start, end);
        if (PHONE_CTX_RE.test(ctx)) return numStr;
    }
    return null;
}

// ── Маппинг реальных дат на RP-шкалу ──
// Вычисляет offset между реальным «сейчас» и RP «сейчас», сдвигает все даты.
// Кэшируется на тот же цикл, что и getRpDateTime.
let _rpOffsetMs = null;
let _rpOffsetSig = null;

function getRpOffsetMs() {
    const rpDt = getRpDateTime();
    if (!rpDt) return 0; // нет RP — offset 0, показываем реальные даты
    const sig = `${rpDt.day}|${rpDt.month}|${rpDt.year}|${rpDt.hours}|${rpDt.minutes}`;
    if (sig === _rpOffsetSig && _rpOffsetMs !== null) return _rpOffsetMs;
    _rpOffsetSig = sig;
    const realNow = new Date();
    const rpNow = new Date(
        rpDt.year, rpDt.month - 1, rpDt.day,
        rpDt.hours ?? realNow.getHours(),
        rpDt.minutes ?? realNow.getMinutes(),
        0, 0,
    );
    _rpOffsetMs = rpNow.getTime() - realNow.getTime();
    return _rpOffsetMs;
}

/** Преобразует реальную дату в RP-дату (сдвиг на offset) */
export function realToRpDate(realDate) {
    if (!realDate) return null;
    const off = getRpOffsetMs();
    if (off === 0) return realDate;
    return new Date(realDate.getTime() + off);
}

function parseRealDate(sd) {
    if (typeof sd === 'number') {
        const d = new Date(sd);
        if (!isNaN(d.getTime())) return d;
    } else if (typeof sd === 'string') {
        const d = new Date(sd);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

export function fmtTime(date) {
    if (!date) return '';
    // date уже в RP-шкале (через parseMsgDate → realToRpDate),
    // «сегодня» = текущая RP-дата
    const rpDt = getRpDateTime();
    const now = rpDt
        ? new Date(rpDt.year, rpDt.month - 1, rpDt.day)
        : new Date();
    const sameDay = date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
    if (sameDay) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ── RP-дата/время: из ЛЮБОГО источника ──
// Приоритет: (1) инжект календаря (rp-calendar и т.п. — читаем extension_prompts,
// парсим дату+время из текста), (2) тег Pregnancy [RP_DATE:DD.MM.YYYY],
// (3) дата/время в прозе последних сообщений. Иначе null → телефон берёт реальное.
const RP_DATE_RE = /\[RP_DATE[:\s]+\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?\s*\]/i;

// Метка времени, которую модель ставит в конце ответа. Это самый надёжный
// источник: у каждого сообщения своё время сюжета, а не сдвиг от реальных
// часов. Принимаем и наш скрытый комментарий, и «стрелочную» запись.
const TIME_TAG_RE = /(?:<!--\s*tel:time:|<-{2,}\s*)\s*(\d{1,2}):([0-5]\d)\s*[-–—,;| ]\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})\s*(?:-->|-{2,}>)/i;

// Время сюжета из метки в тексте сообщения
export function parseTimeTag(text) {
    if (!text) return null;
    const m = String(text).match(TIME_TAG_RE);
    if (!m) return null;
    const hours = Number(m[1]), minutes = Number(m[2]);
    const day = Number(m[3]), month = Number(m[4]);
    let year = Number(m[5]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    if (hours > 23 || day < 1 || day > 31 || month < 1 || month > 12) return null;
    return { day, month, year, hours, minutes };
}

// Ставит ли модель метки времени: если да, события идут строго по часам
// сюжета, а не по числу ходов
export function rpTimeTagged() {
    try {
        const chat = SillyTavern.getContext()?.chat || [];
        for (let i = chat.length - 1; i >= 0 && i >= chat.length - 8; i--) {
            if (chat[i]?.mes && parseTimeTag(stripThink(chat[i].mes))) return true;
        }
    } catch (e) { /* ignore */ }
    return false;
}

// Русские месяцы (стемы, от специфичного к общему — «мар» до «ма»)
const RU_MONTHS = [
    ['декабр', 12], ['ноябр', 11], ['октябр', 10], ['сентябр', 9], ['август', 8],
    ['июл', 7], ['июн', 6], ['апрел', 4], ['март', 3], ['феврал', 2], ['январ', 1], ['мая', 5], ['май', 5],
];
const EN_MONTHS = [
    ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['may', 5], ['jun', 6],
    ['jul', 7], ['aug', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12],
];

// Толерантный парс даты+времени из произвольного текста. Возвращает
// {day,month,year,hours?,minutes?} или null.
export function parseAnyDateTime(text, base = null) {
    if (!text) return null;
    const t = String(text);
    let day = null, month = null, year = null, hours, minutes;

    // Время: 19:30 / 19.30 / 7:30 PM / 7 PM / «в 7 вечера».
    const tm = t.match(/\b(1[0-2]|0?\d)(?::|\.)([0-5]\d)(?![.\/-]\d)\s*(am|pm)\b/i)
        || t.match(/\b(1[0-2]|0?\d)\s*(am|pm)\b/i)
        // Сначала часы с двоеточием. Точку разрешаем отдельно только когда
        // совпадение не является началом даты вроде 15.06.2025: раньше такая
        // дата ошибочно превращала RP-время в 15:06, игнорируя стоящее далее 19:35.
        || t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
        || t.match(/\b([01]?\d|2[0-3])\.([0-5]\d)(?![.\/-]\d)\b/);
    if (tm) {
        hours = parseInt(tm[1]);
        if (/am|pm/i.test(tm[tm.length - 1] || '')) {
            const ap = String(tm[tm.length - 1]).toLowerCase();
            minutes = tm.length > 3 ? parseInt(tm[2]) : 0;
            if (ap === 'pm' && hours < 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        } else minutes = parseInt(tm[2]);
    }
    if (hours === undefined) {
        const proseTime = t.match(/(?:\bв|\bat|около|примерно)\s+(\d{1,2})(?:[:.]([0-5]\d))?\s*(утра|дня|вечера|ночи)\b/i);
        if (proseTime) {
            hours = parseInt(proseTime[1]); minutes = parseInt(proseTime[2] || '0');
            const part = proseTime[3].toLowerCase();
            if ((part === 'дня' || part === 'вечера') && hours < 12) hours += 12;
            if (part === 'ночи' && hours === 12) hours = 0;
        } else if (/\b(?:полдень|noon)\b/i.test(t)) { hours = 12; minutes = 0; }
        else if (/\b(?:полночь|midnight)\b/i.test(t)) { hours = 0; minutes = 0; }
    }

    // 1) [RP_DATE:DD.MM.YYYY]
    let m = t.match(RP_DATE_RE);
    if (m) {
        day = parseInt(m[1]); month = parseInt(m[2]); year = parseInt(m[3]);
        if (m[4] !== undefined) { hours = parseInt(m[4]); minutes = parseInt(m[5]); }
    }
    // 2) Именованный месяц: «15 января 2025» / «January 15, 2025» / «15 January 2025»
    if (day === null) {
        const low = t.toLowerCase();
        const findMonth = () => {
            for (const [stem, num] of [...RU_MONTHS, ...EN_MONTHS]) {
                const idx = low.indexOf(stem);
                if (idx !== -1) return { stem, num, idx };
            }
            return null;
        };
        const mo = findMonth();
        if (mo) {
            month = mo.num;
            // день рядом с месяцем (до или после, в пределах ~12 симв.)
            const around = low.slice(Math.max(0, mo.idx - 12), mo.idx + mo.stem.length + 12);
            const dMatch = around.match(/\b(\d{1,2})\b/);
            if (dMatch) day = parseInt(dMatch[1]);
            // год — 4 цифры где-то в тексте; без года наследуем RP-год.
            const yMatch = low.match(/\b(19|20)\d{2}\b/);
            if (yMatch) year = parseInt(yMatch[0]);
            else if (base?.year) year = base.year;
        }
    }
    // 3) Числовая дата DD.MM.YYYY / DD/MM/YYYY / YYYY-MM-DD
    if (day === null) {
        let dm = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/); // ISO
        if (dm) { year = parseInt(dm[1]); month = parseInt(dm[2]); day = parseInt(dm[3]); }
        else {
            dm = t.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
            if (dm) { day = parseInt(dm[1]); month = parseInt(dm[2]); year = parseInt(dm[3]); }
            else {
                dm = t.match(/\b(\d{1,2})[.\/-](\d{1,2})(?![.\/-]\d)\b/);
                if (dm && base?.year) { day = parseInt(dm[1]); month = parseInt(dm[2]); year = base.year; }
            }
        }
    }

    // Относительная дата считается только при известной базовой RP-дате.
    if (day === null && base?.year && /\b(?:сегодня|today|завтра|tomorrow|послезавтра|day after tomorrow|вчера|yesterday)\b/i.test(t)) {
        let shift = 0;
        if (/\b(?:послезавтра|day after tomorrow)\b/i.test(t)) shift = 2;
        else if (/\b(?:завтра|tomorrow)\b/i.test(t)) shift = 1;
        else if (/\b(?:вчера|yesterday)\b/i.test(t)) shift = -1;
        const d = new Date(base.year, base.month - 1, base.day + shift);
        day = d.getDate(); month = d.getMonth() + 1; year = d.getFullYear();
    }

    if (day === null && hours === undefined) return null; // ничего не нашли
    if (year !== null && year !== undefined && year < 100) year += 2000;
    // Валидация
    if (day !== null && (day < 1 || day > 31)) day = null;
    if (month !== null && (month < 1 || month > 12)) month = null;
    if (day === null || month === null || year === null) {
        // Есть только время — вернём его (день недели/дата с реального времени)
        if (hours === undefined) return null;
        return { hours, minutes, timeOnly: true };
    }
    const res = {
        day, month, year,
        label: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`,
    };
    if (hours !== undefined) { res.hours = hours; res.minutes = minutes; }
    return res;
}

// Текстовый контекст сохраняем вместе с нормализованным значением: модели важно
// отличать «завтра в 8» от даты публикации и не подменять её реальными часами.
export function extractTemporalContext(text, base = null) {
    const source = String(text || '').trim();
    if (!source) return { raw: '', normalized: '' };
    const effectiveBase = base || getRpDateTime();
    const parsed = parseAnyDateTime(source, effectiveBase);
    const mentions = source.match(/(?:\b(?:сегодня|завтра|послезавтра|вчера|today|tomorrow|yesterday|noon|midnight)\b[^.!?\n]{0,35}|\b\d{1,2}[.:]\d{2}\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b|\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b|\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\s+(?:январ\w*|феврал\w*|март\w*|апрел\w*|ма[йя]|июн\w*|июл\w*|август\w*|сентябр\w*|октябр\w*|ноябр\w*|декабр\w*|jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)[^.!?\n]{0,12})/gi) || [];
    let normalized = '';
    if (parsed) {
        const date = parsed.timeOnly ? '' : `${String(parsed.day).padStart(2, '0')}.${String(parsed.month).padStart(2, '0')}.${parsed.year}`;
        const time = parsed.hours === undefined ? '' : `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes || 0).padStart(2, '0')}`;
        normalized = [date, time].filter(Boolean).join(' ');
    }
    return { raw: mentions.join(' | ').slice(0, 300), normalized };
}

// Собрать текст инжектов календаря (rp-calendar и подобные) из реестра
// extension_prompts. Ключей календаря мы не знаем — берём ВСЕ инжекты, где
// есть слова про дату/время/календарь, чтобы не тащить лишнее.
function calendarInjectText() {
    try {
        const ctx = SillyTavern.getContext();
        const eps = ctx?.extensionPrompts || {};
        const chunks = [];
        for (const key of Object.keys(eps)) {
            const val = eps[key]?.value;
            if (typeof val !== 'string' || !val) continue;
            const k = key.toLowerCase();
            const looksCalendar = /calendar|date|time|день|дата|время|clock/i.test(k)
                || /\b\d{1,2}:\d{2}\b/.test(val) && /(date|дата|day|день|month|месяц|year|год)/i.test(val);
            if (looksCalendar) chunks.push(val);
        }
        return chunks.join('\n');
    } catch (e) { return ''; }
}

// Полный парсинг RP-даты/времени. Лёгкий кэш по сигнатуре (длина чата + первые
// символы календарь-инжекта), чтобы не парсить на каждый tick.
let _rpDateCache = null;
let _rpDateSig = null;
export function getRpDateTime() {
    try {
        const chat = SillyTavern.getContext()?.chat || [];
        const calText = calendarInjectText();
        let chatSig = '';
        for (let i = Math.max(0, chat.length - 20); i < chat.length; i++) {
            const m = chat[i]?.mes || '';
            chatSig += m.length + '|' + m.slice(0, 50) + '|' + m.slice(-50) + '|';
        }
        const sig = `${chat.length}|${calText.length}|${calText.slice(0, 100)}|${calText.slice(-100)}|${chatSig}`;
        if (sig === _rpDateSig) return _rpDateCache;
        _rpDateSig = sig;

        // Метка времени бьёт все остальные источники: её ставит сама модель,
        // зная, сколько времени прошло в сюжете.
        for (let i = chat.length - 1; i >= 0 && i >= chat.length - 8; i--) {
            const mes = chat[i]?.mes;
            if (!mes) continue;
            const tagged = parseTimeTag(stripThink(mes));
            if (tagged) {
                _rpDateCache = { ...tagged, label: `${String(tagged.day).padStart(2, '0')}.${String(tagged.month).padStart(2, '0')}` };
                return _rpDateCache;
            }
        }

        // Источники идут по приоритету. Дату и часы ищем независимо: свежая
        // реплика «сейчас 18:40» должна обновить часы, но сохранить RP-день из
        // календаря/предыдущей реплики, а не подставить сегодняшнюю реальную дату.
        const parsed = [];
        for (let i = chat.length - 1; i >= 0 && i >= chat.length - 3; i--) {
            const mes = chat[i]?.mes;
            if (mes && !chat[i].is_system) parsed.push(parseAnyDateTime(mes));
        }
        parsed.push(parseAnyDateTime(calText));
        for (let i = chat.length - 4; i >= 0 && i >= chat.length - 20; i--) {
            const mes = chat[i]?.mes;
            if (mes && !chat[i].is_system) parsed.push(parseAnyDateTime(mes));
        }

        const full = parsed.find(r => r && !r.timeOnly) || null;
        const clock = parsed.find(r => r && r.hours !== undefined) || null;
        let res = full ? { ...full } : null;
        if (res && clock) {
            res.hours = clock.hours;
            res.minutes = clock.minutes;
        } else if (!res && clock) {
            // Без RP-даты часы всё равно полезны; реальная дата здесь лишь
            // нейтральный контейнер для существующего API экрана телефона.
            const now = new Date();
            res = {
                day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear(),
                hours: clock.hours, minutes: clock.minutes,
                label: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`,
                timeOnly: true,
            };
        }

        _rpDateCache = res || null;
        return _rpDateCache;
    } catch (e) { _rpDateCache = null; return null; }
}

// Обратная совместимость: label «ДД.ММ»
// Возвращает { contacts: Map(key → {name, number, source}), threads: Map(key → {name, messages[]}) }
// messages: {dir:'in'|'out', text, idx, time}
export function scanChat() {
    const sig = chatSignature();
    if (_scanSig === sig && _scanCache) return _scanCache;
    const previous=deviceEventSnapshot;deviceEventSnapshot=getDeviceEvents();
    let res;try{res=scanChatUncached();}finally{deviceEventSnapshot=previous;}
    _scanSig = sig; _scanCache = res;
    return res;
}

function scanChatUncached() {
    const contacts = new Map();
    const threads = new Map();

    const addContact = (name, number, source) => {
        const k = resolveContactKey(name);
        if (!k) return;
        rememberContact(name,k);
        const originalName=contactOriginalName(k,String(name).trim());
        const existing = contacts.get(k);
        if (!existing) {
            contacts.set(k, { name: originalName, number: String(number || '').trim(), source });
        } else if (!existing.number && number) {
            existing.number = String(number).trim();
        }
    };

    // name может быть готовым ключом 'group:xxx' (displayName тогда обязателен)
    const pushMsg = (name, entry, displayName = null) => {
        const k = String(name).startsWith('group:') ? String(name) : resolveContactKey(name);
        if (!k || k === 'group:') return;
        if (!threads.has(k)) {
            threads.set(k, {
                name: displayName || String(name).trim(),
                messages: [],
                isGroup: k.startsWith('group:'),
            });
        }
        threads.get(k).messages.push(entry);
    };

    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { /* ignore */ }

    const currentGlobalOffset = getRpOffsetMs();
    const offsets = new Array(chat.length).fill(null);
    let lastKnownOffset = null;

    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (msg && msg.mes) {
            // Метка времени точнее прозы: берём её, не разбирая текст дальше
            const tagged = parseTimeTag(stripThink(msg.mes));
            if (tagged) {
                const realDate = parseRealDate(msg.send_date) || new Date();
                const rpDate = new Date(tagged.year, tagged.month - 1, tagged.day, tagged.hours, tagged.minutes, 0, 0);
                lastKnownOffset = rpDate.getTime() - realDate.getTime();
                offsets[i] = lastKnownOffset;
                continue;
            }
        }
        if (msg && msg.mes && !msg.is_system) {
            const r = parseAnyDateTime(msg.mes);
            if (r && !r.timeOnly) {
                const realDate = parseRealDate(msg.send_date) || new Date();
                const rpDate = new Date(
                    r.year, r.month - 1, r.day,
                    r.hours ?? realDate.getHours(),
                    r.minutes ?? realDate.getMinutes(),
                    0, 0
                );
                lastKnownOffset = rpDate.getTime() - realDate.getTime();
            }
        }
        offsets[i] = lastKnownOffset;
    }

    let firstKnown = offsets.find(o => o !== null);
    if (firstKnown === undefined) firstKnown = currentGlobalOffset;

    for (let i = 0; i < chat.length; i++) {
        if (offsets[i] === null) offsets[i] = firstKnown;
    }

    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        const sourceText = getPhoneActivityText(msg, i);
        if (!msg || !sourceText) continue;
        // Системные сообщения пропускаем, НО наши SMS-ответы (is_system с tel: тегами) — парсим
        if (msg.is_system && !ANY_TEL_RE.test(sourceText)) continue;
        // Теги внутри CoT-блоков не считаются (иначе дубли сообщений)
        let text = stripThink(sourceText);
        const deviceSends=!msg.is_user?deviceActions(text).filter(event=>event.action==='send'&&event.app==='sms'&&!isUserName(event.actor)):[];
        for(const event of deviceSends)text+='\n<!--tel:out:'+JSON.stringify({to:event.to,...(event.chat?{group:event.chat}:{}),text:event.text,mixed:true,actor:event.actor,deviceTag:event.tag}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')+'-->';

        let time = null;
        const realDate = parseRealDate(msg.send_date);
        if (realDate) {
            time = new Date(realDate.getTime() + (offsets[i] || 0));
        }

        if (msg.is_user || deviceSends.length) {
            // Исходящая смс юзера
            const rpQuotes = extractRoleplaySms(text, getRoleplaySmsOptions());
            for (const om of text.matchAll(OUT_ALL_RE)) {
                const j = safeJson(om[1]) || {};
                if (j.origin === 'rp' && !rpQuotes.some(quote => quote.quoteIndex === j.quoteIndex && normalizePhoneSpaces(quote.text) === normalizePhoneSpaces(j.rpQuote || j.text))) continue;
                const stripped = text.replace(OUT_RE, '').trim();
                const vis = stripped.match(OUT_VISIBLE_RE);
                const visGroup = !vis ? stripped.match(OUT_VISIBLE_GROUP_RE) : null;
                let to = j.contactKey || j.to || (vis ? vis[2].trim() : null);
                const body = j.mixed ? String(j.text || '') : (vis ? vis[3].trim() : (visGroup ? visGroup[3].trim() : (j.text || '')));
                const isVoice = !!j.voice || VOICE_KIND_RE.test(vis?.[1] || visGroup?.[1] || '');
                // Групповой чат: to = "группа:Название" (или поле group)
                const groupName = j.group || (typeof to === 'string' && to.match(/^группа:\s*(.+)$/i)?.[1]) || null;
                // В пузыре телефона токен «*фото...*» не показываем — там миниатюра;
                // полное описание остаётся в mes (для модели и саммари)
                const displayBody = normalizePhoneSpaces(body.replace(/\*(?:фото|photo):[^*]*\*\s*/i, '').replace(/\*(?:фото|photo)\*\s*/i, '').replace(/\*(?:переслано|forwarded):[^*]*\*\s*/i, '').trim());
                const tagStart = text.indexOf(om[0]);
                const entry = { dir: 'out', text: displayBody, idx: i, time, tagStart, tagEnd: tagStart + om[0].length, tagText: om[0] };
                if(j.actor){entry.actor=String(j.actor);entry.tagText=j.deviceTag||entry.tagText;}
                if(j.mediaKind)entry.mediaKind=j.mediaKind;
                if(j.stickerId)entry.stickerId=j.stickerId;
                if(j.stickerCaption)entry.stickerCaption=j.stickerCaption;
                if (isVoice) entry.voice = true;
                if (j.react) entry.react = String(j.react);
                // Фото: путь из маркера (надёжно — часть текста) ИЛИ из extra.media (ST-нативно)
                if (j.img) entry.img = j.img;
                else {
                    const ei = extraImageOf(msg);
                    if (ei) entry.img = ei;
                }
                if (j.photo) entry.photoDesc = String(j.photo).slice(0, 200);
                const savedSticker=entry.img&&getMeta().stickers?.find(item=>item.image===entry.img);
                if(savedSticker&&!entry.mediaKind){entry.mediaKind='sticker';entry.stickerId=savedSticker.id;entry.stickerCaption=savedSticker.caption||'';}
                if (j.shot) entry.shot = j.shot;
                if (groupName) {
                    if (body || entry.img) pushMsg(`group:${keyOf(groupName)}`, entry, groupName);
                } else if (to && (body || entry.img)) {
                    pushMsg(to, entry);
                    // Раз юзер пишет этому имени — контакт точно есть
                    addContact(to, '', 'implicit');
                }
            }
        }

        // ── Сообщения бота (или юзера) ──

        // ГЛАВНАЯ ПРОВЕРКА: бот описывает СВОЙ телефон?
        if (!msg.is_user && wasPhoneQuietAt(i)) continue;
        // Если да — это НЕ смс юзеру, пропускаем всё кроме contact-тегов.
        // Для сообщений юзера эта проверка всегда false, так как мы хотим парсить их тэги.
        TAG_RE.lastIndex = 0;
        let tm;
        let smsTagsInMsg = 0;
        while ((tm = TAG_RE.exec(text)) !== null) {
            const kind = tm[1].toLowerCase();
            const j = safeJson(tm[2]);
            if (!j) continue;
            if (kind === 'contact' && j.name) {
                addContact(j.name, j.number || '', 'tag');
            } else if (kind === 'sms' && j.from && (j.text || j.photo || j.shot || j.sticker || j.meme)) {
                // Явные теги = наш протокол, модель ставит их осознанно — доверяем.
                // Исключение первое: тег явно адресован боту (j.to = имя бота).
                if (j.to && !msg.is_user && keyOf(j.to) === keyOf(msg.name)) {
                    continue;
                }
                // Исключение второе: адресат — кто угодно, кроме {{user}}. Модель
                // описывает переписку между персонажами и всё равно вешает тег —
                // такие сообщения на её телефон приходить не должны.
                if (j.to && !j.chat && !msg.is_user && !isUserName(j.to)) {
                    continue;
                }
                // Исключение третье: отправитель — сама {{user}}. Свои сообщения
                // она отправляет из телефона; тег «от неё» означает, что модель
                // описала её реплику в чужой переписке.
                if (!msg.is_user && isUserName(j.from)) {
                    continue;
                }
                // Заблокированный контакт не создаёт пузырь/непрочитанное. Проверка
                // идёт по историческому интервалу, поэтому блок переживает reload,
                // а разблокировка не возвращает пропущенные сообщения задним числом.
                if (!j.chat && wasSmsBlockedAt(resolveContactKey(j.from), i)) {
                    continue;
                }
                const entry = {
                    dir: 'in', from: String(j.from), text: String(j.text || ''), idx: i, time,
                    tagStart: tm.index, tagEnd: tm.index + tm[0].length,
                    // Точный текст тега: индексы посчитаны по stripThink-версии и
                    // съезжают, если в сообщении был <think> — перезапись ищет по нему
                    tagText: tm[0],
                    eventId: `${i}:${tm.index}`,
                };
                // ММС от персонажа: описание фото → стеклянная заглушка в пузыре
                if (j.photo) entry.photoDesc = String(j.photo).slice(0, 200);
                // Голосовое: text = расшифровка, в пузыре рисуем дорожку
                if (j.voice) entry.voice = true;
                // Сгенерированное фото ММС (кнопка на заглушке пишет img в тег)
                if (j.img) entry.img = String(j.img);
                if(j.mediaKind)entry.mediaKind=j.mediaKind;
                if(j.stickerId)entry.stickerId=j.stickerId;
                if(j.stickerCaption)entry.stickerCaption=j.stickerCaption;
                const generated=getMeta().generatedChatMedia?.[chatMediaKey(i,tm[0])];
                const descriptor=chatMedia(j);
                if(generated?.img){entry.img=generated.img;entry.mediaKind=generated.mediaKind;entry.stickerId=generated.stickerId;entry.stickerCaption=generated.stickerCaption;entry.photoDesc=generated.photo;}
                else if(descriptor&&generated?.status!=='skipped'){entry.photoDesc=descriptor.description||'Стикер';entry.mediaKind=descriptor.kind;}
                const savedSticker=entry.img&&getMeta().stickers?.find(item=>item.image===entry.img);
                if(savedSticker&&!entry.mediaKind){entry.mediaKind='sticker';entry.stickerId=savedSticker.id;entry.stickerCaption=savedSticker.caption||'';}
                // Реакция юзера на сообщение (пишется в тег из UI)
                if (j.react) entry.react = String(j.react);
                // Скрин поста из соцсети или канала: карточку рисует телефон
                if (j.shot) entry.shot = j.shot;
                if(!entry.text&&!entry.img&&!entry.photoDesc&&!entry.shot)continue;
                if (j.chat) {
                    // Сообщение в групповой чат
                    pushMsg(`group:${keyOf(j.chat)}`, entry, String(j.chat));
                } else {
                    pushMsg(j.from, entry);
                    addContact(j.from, j.number || '', 'implicit');
                }
                smsTagsInMsg++;
            }
        }

        // Fallback: номер в прозе без тега («подхватываем»).
        // ТОЛЬКО видимый текст: html-комменты вырезаются — иначе таймстамп в имени
        // файла из маркера (sms_1783152188594.jpeg) ловился как «номер телефона»
        // и создавал контакт с именем автора сообщения (даже самого юзера).
        if (!msg.is_user) {
            const proseNum = detectProseNumber(text.replace(/<!--[\s\S]*?-->/g, ''));
            if (proseNum) {
                const charName = msg.name || null;
                if (charName && !contacts.has(keyOf(charName))) {
                    addContact(charName, proseNum, 'prose');
                }
            }
        }
    }

    // ── Ручные контакты из метаданных (мерж; ручной номер приоритетнее пустого) ──
    const meta = getMeta();
    for (const c of meta.contacts) {
        if (!c || !c.name) continue;
        const k = resolveContactKey(c.name);
        rememberContact(c.name,k);
        const existing = contacts.get(k);
        if (!existing) {
            contacts.set(k, { name: c.name, number: c.number || '', source: 'manual' });
        } else if (c.number) {
            existing.number = c.number;
        }
    }

    // ── Скрытые треды: прячем контакт, если после скрытия не появилось новых смс ──
    for (const h of meta.hidden) {
        if (!h || !h.key) continue;
        const t = threads.get(h.key);
        const lastIdx = t && t.messages.length > 0 ? t.messages[t.messages.length - 1].idx : -1;
        if (lastIdx <= (h.atIdx ?? -1)) {
            threads.delete(h.key);
            contacts.delete(h.key);
        }
    }

    return { contacts, threads };
}

// ── Список для экрана «Сообщения»: контакты + треды, отсортированы по свежести ──
export function getThreadList() {
    const { contacts, threads } = scanChat();
    const meta = getMeta();
    const list = [];
    const keys = new Set([...contacts.keys(), ...threads.keys()]);
    // Группы из метаданных — даже пустые (только что созданные)
    const groupByKey = new Map();
    for (const g of meta.groups) {
        const gk = `group:${keyOf(g.name)}`;
        groupByKey.set(gk, g);
        keys.add(gk);
    }
    for (const k of keys) {
        const c = contacts.get(k);
        const t = threads.get(k);
        const g = groupByKey.get(k);
        const msgs = t ? t.messages : [];
        const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const incomingMsgs = msgs.filter(m => m.dir === 'in');
        const incoming = incomingMsgs.length;
        const read = meta.lastRead[k] || 0;
        let unread;
        if (typeof read === 'string' && /^\d+:\d+$/.test(read)) {
            const [readIdx, readPos] = read.split(':').map(Number);
            unread = incomingMsgs.filter(m => m.idx > readIdx || (m.idx === readIdx && (m.tagStart || 0) > readPos)).length;
        } else {
            // Legacy metadata stored a count. It remains valid until the thread
            // is opened once and migrated to an event cursor by markRead().
            unread = Math.max(0, incoming - (Number(read) || 0));
        }
        const isGroup = k.startsWith('group:');
        list.push({
            key: k,
            name: displayName(k, (g && g.name) || (c && c.name) || (t && t.name) || k),
            originalName: isGroup ? ((g && g.name) || (t && t.name) || k) : contactOriginalName(k,(c && c.name) || (t && t.name) || k),
            number: (c && c.number) || '',
            isGroup,
            members: g ? g.members : (isGroup ? [...new Set(msgs.filter(m => m.from).map(m => m.from))] : []),
            last,
            lastIdx: last ? last.idx : -1,
            unread,
            messages: msgs,
        });
    }
    list.sort((a, b) => b.lastIdx - a.lastIdx);
    return list;
}

export function getThread(key) {
    const resolved=resolveContactKey(key);
    return getThreadList().find(t => t.key === resolved) || null;
}

export function phoneAppForThread(key) {
    const root = getMeta();
    return root.tinder?.matches?.some(match => match.inApp && resolveIdentity(root, match.name) === resolveIdentity(root, key)) ? 'tinder' : 'list';
}

export function getTotalUnread() {
    return getThreadList().filter(t => isPhoneAppInstalled(phoneAppForThread(t.key))).reduce((sum, t) => sum + t.unread, 0);
}

export function markRead(key) {
    key=resolveContactKey(key);
    const t = getThread(key);
    if (!t) return;
    const meta = getMeta();
    const incoming = t.messages.filter(m => m.dir === 'in');
    const last = incoming[incoming.length - 1];
    const cursor = last ? (last.eventId || `${last.idx}:${last.tagStart || 0}`) : 0;
    if ((meta.lastRead[key] || 0) !== cursor) {
        meta.lastRead[key] = cursor;
        saveMeta();
    }
}

export function addManualContact(name, number) {
    const meta = getMeta();
    const k = resolveContactKey(name);
    if (!k) return false;
    rememberContact(name,k);
    // Снимаем скрытие, если было
    meta.hidden = meta.hidden.filter(h => h.key !== k);
    const existing = meta.contacts.find(c => resolveContactKey(c.name) === k);
    if (existing) {
        if (number) existing.number = number;
    } else {
        meta.contacts.push({ name: contactOriginalName(k,String(name).trim()), number: String(number || '').trim() });
    }
    saveMeta();
    return true;
}

export function hideContact(key) {
    const meta = getMeta();
    key=resolveContactKey(key);
    meta.contacts = meta.contacts.filter(c => resolveContactKey(c.name) !== key);
    const t = getThread(key);
    const atIdx = t && t.last ? t.last.idx : Number.MAX_SAFE_INTEGER;
    meta.hidden = meta.hidden.filter(h => h.key !== key);
    meta.hidden.push({ key, atIdx });
    saveMeta();
}

// ── Индексы сообщений чата, которые надо СПРЯТАТЬ из ленты (режим «чистый чат») ──
// Прячем: исходящие смс юзера (tel:out) и «смс-only» ответы бота — сообщения,
// где после удаления ВСЕХ html-комментариев не остаётся видимого текста
// (бот ответил только тегами tel:sms / tel:silent + служебные теги других расширений).
// Обычные RP-посты, где смс вплетена в повествование, НЕ прячутся никогда.
export function getHiddenMessageIndexes() {
    const sig = chatSignature();
    if (_hiddenSig === sig && _hiddenCache) return _hiddenCache;
    const res = hiddenMessageIndexesUncached();
    _hiddenSig = sig; _hiddenCache = res;
    return res;
}

function hiddenMessageIndexesUncached() {
    const out = [];
    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { return out; }
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg || !msg.mes) continue;
        // Журнал соцсетей всегда скрыт из визуальной ленты независимо от роли
        // записи (legacy был is_user, актуальный формат — нейтральный comment).
        // ВАЖНО: журналом считается только запись, которую написало само
        // приложение. Модель подсматривает формат в истории и вставляет
        // такую строку в середину своего поста — раньше из-за этого прятался
        // весь ответ целиком.
        if (LOG_RE.test(msg.mes) && isAppJournal(msg)) { out.push(i); continue; }
        // Системные сообщения пропускаем, но наши SMS-ответы прячем
        if (msg.is_system && !ANY_TEL_RE.test(msg.mes) && !SILENT_RE.test(msg.mes)) continue;
        if (msg.is_user) {
            if (OUT_RE.test(msg.mes) && !hasMixedRoleplaySms(msg)) out.push(i);
            continue;
        }
        // Think-блоки не учитываем ни в детекте тегов, ни в «видимом остатке»
        const clean = stripThink(msg.mes);
        if (!ANY_TEL_RE.test(clean) && !SILENT_RE.test(clean)) continue;
        const visible = clean.replace(/<!--[\s\S]*?-->/g, '').trim();
        if (visible.length <= 4) out.push(i);
    }
    return out;
}

// ── Случайный правдоподобный номер для ручного контакта ──
export function randomNumber() {
    const p3 = () => String(Math.floor(Math.random() * 900) + 100);
    const p2 = () => String(Math.floor(Math.random() * 90) + 10);
    return `+7 9${p2()} ${p3()}-${p2()}-${p2()}`;
}
