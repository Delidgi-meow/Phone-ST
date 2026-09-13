// Заметки: личные записи в телефоне. По умолчанию СЕКРЕТНЫ (модель не видит);
// тумблер «видна модели» отправляет заметку в инжект как фоновое знание
// нарратора (персонажи всё равно не знают, пока она не покажет).

import { getMeta, saveMeta } from './state.js';
import { logSocialToChat, removeJournalEntry, getUserName } from './social.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function getNotes() {
    const m = getMeta();
    if (!Array.isArray(m.notes)) m.notes = [];
    return m.notes;
}

export function addNote(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const note = { id: genId(), text: t.slice(0, 2000), time: Date.now(), shared: false };
    getNotes().unshift(note);
    saveMeta();
    return note;
}

export function updateNote(id, text) {
    const n = getNotes().find(x => x.id === id);
    if (!n) return false;
    n.text = String(text || '').trim().slice(0, 2000);
    n.time = Date.now();
    saveMeta();
    // Открытую заметку правим и в истории: старая строка журнала устарела
    if (n.shared) {
        removeJournalEntry(noteMarker(n.id));
        journalNote(n, 'правит');
    }
    return true;
}

export function deleteNote(id) {
    const m = getMeta();
    const gone = getNotes().find(x => x.id === id);
    m.notes = getNotes().filter(x => x.id !== id);
    saveMeta();
    if (gone?.shared) removeJournalEntry(noteMarker(id));
}

// Секретная заметка в чат не попадает вовсе — в этом весь смысл секретности.
// Открытая ложится строкой журнала: инжект живёт один ход, а история остаётся
// и переживает саммари. Спрятала обратно — строку убираем из чата.
function noteMarker(id) { return `note:${id}`; }

function journalNote(n, verb) {
    try {
        logSocialToChat(`${getUserName()} ${verb} заметку в телефоне: «${String(n.text).slice(0, 400)}»`,
            { marker: noteMarker(n.id) });
    } catch (e) { /* ignore */ }
}

export function toggleNoteShared(id) {
    const n = getNotes().find(x => x.id === id);
    if (!n) return false;
    n.shared = !n.shared;
    saveMeta();
    if (n.shared) journalNote(n, 'открывает');
    else removeJournalEntry(noteMarker(n.id));
    return n.shared;
}

export function getSharedNotes() {
    return getNotes().filter(n => n.shared);
}

// Блок для инжекта — только если есть расшаренные заметки (иначе 0 токенов).
// Формулировка важна: прошлая («фоновое знание, персонажи НЕ знают») читалась
// как «не используй», и модель заметки честно игнорировала. Открытую заметку
// она открывает специально — значит хочет, чтобы та работала в сцене.
export function notesInjectBlock() {
    const shared = getSharedNotes();
    if (!shared.length) return '';
    const lines = shared.slice(0, 6).map(n => `- ${n.text.slice(0, 300)}`).join('\n');
    return `[{{user}}'S NOTES — what they wrote in their phone's notes app and deliberately opened to you. Treat it as TRUE and current: their plans, intentions, reminders, things they keep in mind. USE it — let it steer what {{user}} remembers and does, and let the world test it; it is not decoration. Other characters know only what {{user}} has actually told or shown them.]\n${lines}`;
}
