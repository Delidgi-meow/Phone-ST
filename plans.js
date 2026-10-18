import { isPhoneAppInstalled } from './state.js';
import { parsePhoneJson } from './phone-text.js';
// Планы и важные даты: календарь телефона. Живёт по ролевому времени —
// «сегодня» это сегодня В ИСТОРИИ, а не по часам компьютера.
// Записи приходят двумя путями: она добавляет их сама или ролевая ставит тег
// <!--tel:plan:{...}--> , когда о чём-то договорились.

import { getMeta, saveMeta, getRpDateTime, stripThink, getPhoneAppText as getPhoneMessageText } from './state.js';
import { logSocialToChat, getUserName } from './social.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function hash32(str) {
    let h = 0; const s = String(str);
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(h);
}

export const PLAN_WHO = { user: 'я', char: 'он/она', both: 'вместе' };

export function getPlans() {
    const m = getMeta();
    if (!Array.isArray(m.plans)) m.plans = [];
    if (!Array.isArray(m.planTags)) m.planTags = [];
    return m.plans;
}

// Ролевое «сегодня» как YYYY-MM-DD — так даты сортируются сами собой
export function rpToday() {
    const d = getRpDateTime();
    if (d && Number.isFinite(d.year)) return iso(d.year, d.month, d.day);
    const n = new Date();
    return iso(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function iso(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Принимаем и «21.04.2014», и «2014-04-21», и «завтра»/«через 3 дня»
export function parsePlanDate(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return rpToday();
    const dmy = s.match(/^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?$/);
    if (dmy) {
        const today = rpToday();
        const year = dmy[3] ? Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : Number(today.slice(0, 4));
        return iso(year, Number(dmy[2]), Number(dmy[1]));
    }
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) return iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (/^(?:сегодня|today)$/.test(s)) return rpToday();
    if (/^(?:завтра|tomorrow)$/.test(s)) return shiftDays(rpToday(), 1);
    if (/^послезавтра$/.test(s)) return shiftDays(rpToday(), 2);
    const inDays = s.match(/^через\s+(\d{1,3})\s*(?:дн|день|дня|дней)/);
    if (inDays) return shiftDays(rpToday(), Number(inDays[1]));
    return rpToday();
}

export function shiftDays(isoDate, days) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function addPlan({ text, date, time = '', who = 'user', source = 'user' }) {
    const t = String(text || '').trim();
    if (!t) return null;
    const plan = {
        id: genId(),
        text: t.slice(0, 200),
        date: parsePlanDate(date),
        time: String(time || '').trim().slice(0, 5),
        who: PLAN_WHO[who] ? who : 'user',
        done: false,
        status:'open',
        source,
        at: Date.now(),
    };
    const plans = getPlans();
    plans.push(plan);
    sortPlans(plans);
    if (plans.length > 200) plans.splice(0, plans.length - 200);
    saveMeta();
    // Своя запись — событие ролевой: она достала телефон и внесла дату.
    // Из тега ролевой не логируем: это её же собственная сцена, дубль не нужен
    if (source === 'user') {
        try {
            logSocialToChat(`${getUserName()} записывает в календарь телефона: ${fmtPlanDate(plan.date)}${plan.time ? `, ${plan.time}` : ''} — ${plan.text}${plan.who === 'both' ? ' (вместе)' : plan.who === 'char' ? ' (не её дело, а его/её)' : ''}`, { priv: true });
        } catch (e) { /* ignore */ }
    }
    return plan;
}

function sortPlans(plans) {
    plans.sort((a, b) => (a.date === b.date
        ? String(a.time || '99:99').localeCompare(String(b.time || '99:99'))
        : a.date.localeCompare(b.date)));
}

export function togglePlan(id) {
    const p = getPlans().find(x => x.id === id);
    if (!p) return false;
    p.done = !p.done;
    p.status=p.done?'done':'open';p.cancelled=false;
    // День отметки нужен инжекту: свежее «сделано» модель должна увидеть,
    // иначе галочка просто убирала пункт, и ролевая считала дело незакрытым
    if (p.done) p.doneDate = rpToday();
    else delete p.doneDate;
    saveMeta();
    if (p.done) {
        try {
            logSocialToChat(`${getUserName()} отмечает в календаре выполненным: ${p.text}`, { priv: true });
        } catch (e) { /* ignore */ }
    }
    return p.done;
}

export function setPlanStatus(id,status) {
    const plan=getPlans().find(p=>p.id===id);
    if(!plan||!['open','done','cancelled'].includes(status))return false;
    const previous=plan.cancelled?'cancelled':plan.done?'done':'open';
    if(previous===status)return false;
    plan.status=status;plan.done=status!=='open';plan.cancelled=status==='cancelled';
    if(plan.done)plan.doneDate=rpToday();else delete plan.doneDate;
    saveMeta();return true;
}

export function deletePlan(id) {
    const m = getMeta();
    m.plans = getPlans().filter(x => x.id !== id);
    saveMeta();
}

// Группы для экрана: просрочено / сегодня / завтра / на неделе / позже / сделано
export function groupedPlans() {
    const today = rpToday();
    const groups = { overdue: [], today: [], tomorrow: [], week: [], later: [], done: [] };
    for (const p of getPlans()) {
        if (p.done) { groups.done.push(p); continue; }
        const diff = daysBetween(today, p.date);
        if (diff < 0) groups.overdue.push(p);
        else if (diff === 0) groups.today.push(p);
        else if (diff === 1) groups.tomorrow.push(p);
        else if (diff <= 7) groups.week.push(p);
        else groups.later.push(p);
    }
    return groups;
}

export function plansBadgeCount() {
    if (!isPhoneAppInstalled('calendar')) return 0;
    const g = groupedPlans();
    return g.overdue.length + g.today.length;
}

export function fmtPlanDate(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}${y !== rpToday().slice(0, 4) ? `.${y}` : ''}`;
}

// ── Календарь ──
export function monthOf(isoDate) { return String(isoDate).slice(0, 7); }

export function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function plansByDate(isoDate) {
    return getPlans().filter(p => p.date === isoDate);
}

// Шесть недель по семь дней, неделя с понедельника: сетка не прыгает по высоте
// при переключении месяцев, а дни соседних месяцев видны бледными.
export function monthGrid(ym) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const shift = (first.getUTCDay() + 6) % 7;   // 0 = понедельник
    const start = new Date(Date.UTC(y, m - 1, 1 - shift));
    const today = rpToday();
    const cells = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(start.getTime() + i * 86400000);
        const isoDate = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        const dayPlans = plansByDate(isoDate);
        cells.push({
            iso: isoDate,
            day: d.getUTCDate(),
            inMonth: d.getUTCMonth() + 1 === m,
            isToday: isoDate === today,
            past: isoDate < today,
            total: dayPlans.length,
            open: dayPlans.filter(x => !x.done).length,
            who: [...new Set(dayPlans.map(x => x.who))],
        });
    }
    return cells;
}

// ── Инжект ──
// Короткий список ближайшего: модель должна помнить, о чём договорились,
// и иметь право напомнить, сорвать или перенести.
export function plansInjectLine() {
    if (!isPhoneAppInstalled('calendar')) return '';
    const g = groupedPlans();
    const today = rpToday();
    const near = [...g.overdue, ...g.today, ...g.tomorrow, ...g.week].slice(0, 8);
    // Дальние даты тоже нужны: день рождения через три недели или отпуск в мае
    // модель иначе не видела вовсе, пока до них не оставалось недели
    const ahead = g.later.slice(0, 3);
    // Недавно закрытое: она отметила галочку — значит дело сделано, и ролевая
    // должна это знать (не напоминать, не тянуть героя туда снова)
    const justDone = g.done
        .filter(p => !p.doneDate || daysBetween(p.doneDate, today) <= 3)
        .slice(-3);
    if (!near.length && !ahead.length && !justDone.length) return '';
    const whoOf = (p) => (p.who === 'char' ? 'their plan' : p.who === 'both' ? 'together' : `{{user}}'s plan`);
    const lines = near.map((p) => {
        const diff = daysBetween(today, p.date);
        const when = diff < 0 ? `overdue by ${-diff}d` : diff === 0 ? 'TODAY' : diff === 1 ? 'tomorrow' : `in ${diff}d`;
        return `- [id:${p.id}] ${fmtPlanDate(p.date)}${p.time ? ` ${p.time}` : ''} (${when}, ${whoOf(p)}): ${p.text}`;
    }).join('\n');
    const doneLines = justDone.map(p => `- [id:${p.id}] ${p.cancelled?'CANCELLED':'DONE'} ${fmtPlanDate(p.date)} (${whoOf(p)}): ${p.text}`).join('\n');
    const aheadLines = ahead.map((p) => {
        const diff = daysBetween(today, p.date);
        return `- [id:${p.id}] ${fmtPlanDate(p.date)}${p.time ? ` ${p.time}` : ''} (in ${diff}d, ${whoOf(p)}): ${p.text}`;
    }).join('\n');
    const body = [lines, aheadLines, doneLines].filter(Boolean).join('\n');
    return `[CALENDAR — confirmed plans; participants remember them. Keep IDs, dates and ownership. Characters may discuss, cancel or attend their own commitments; do not decide {{user}}’s actions. DONE and CANCELLED entries are closed, not upcoming reminders.]\n${body}`;
}

export function plansInjectRule() {
    if (!isPhoneAppInstalled('calendar')) return '';
    const creation='[CALENDAR] Record each new confirmed plan agreed in the latest user message or this reply, even if the calendar is empty: <!--tel:plan:{"date":"DD.MM.YYYY","time":"19:00","text":"specific plan","who":"user|char|both"}-->. "who" selects the owner; time may be "". Resolve dates from the RP clock. Never duplicate listed plans or record suggestions, refusals or hypothetical events.';
    return creation+(getPlans().length ? ' When established events complete or explicitly cancel an existing plan, append <!--tel:plan:{"id":"exact listed ID","status":"done|cancelled"}-->. Mere passage of time is not completion. Never invent user actions. A confirmed reschedule updates the same ID with "status":"open","date":"DD.MM.YYYY","time":"HH:MM"; do not create a second entry. Only an explicit renewed agreement reopens a closed plan.' : '');
}

// ── Теги из чата ──
const PLAN_TAG_RE = /<!--\s*tel:plan:(\{[\s\S]*?\})\s*-->/gi;

function safeJson(raw) {
    try { return parsePhoneJson(raw); } catch (e) { return null; }
}

export function harvestPlanTags() {
    if (!isPhoneAppInstalled('calendar')) return 0;
    const m = getMeta();
    getPlans();
    let chat = [];
    try { chat = SillyTavern.getContext()?.chat || []; } catch (e) { return 0; }
    const seen = new Set(m.planTags);
    let added = 0;
    let consumed = false;
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        const sourceText = getPhoneMessageText(msg, i);
        if (!msg || msg.is_user || !/tel:plan/i.test(sourceText)) continue;
        const text = stripThink(sourceText);
        const occ = {};
        PLAN_TAG_RE.lastIndex = 0;
        let hit;
        while ((hit = PLAN_TAG_RE.exec(text)) !== null) {
            // Ключ как у банка: содержимое + сообщение + номер повтора
            const base = `pl${hash32(hit[1])}:${String(msg.send_date || msg.extra?.gen_id || i)}`;
            const n = occ[base] = (occ[base] || 0) + 1;
            const key = `${base}#${n}`;
            if (seen.has(key)) continue;
            const j = safeJson(hit[1]);
            if (!j) continue;
            const statusAliases={done:'done',completed:'done',cancelled:'cancelled',canceled:'cancelled',open:'open',pending:'open'};
            const status=typeof j.status==='string'&&Object.hasOwn(statusAliases,j.status.toLowerCase())?statusAliases[j.status.toLowerCase()]:null;
            if(j.id||j.status){
                if(!status)continue;
                const normalize=text=>String(text||'').replace(/\s+/g,' ').trim().toLowerCase();
                const candidates=j.id ? m.plans.filter(p=>p.id===j.id) : m.plans.filter(p=>normalize(p.text)===normalize(j.text)&&(!j.date||p.date===parsePlanDate(j.date))&&(!j.who||p.who===j.who));
                if(candidates.length!==1)continue;
                const plan=candidates[0];let changed=setPlanStatus(plan.id,status);
                if(status==='open'){
                    if(j.date){const next=parsePlanDate(j.date);if(next!==plan.date){plan.date=next;changed=true;}}
                    if(typeof j.time==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/.test(j.time)&&j.time!==plan.time){plan.time=j.time;changed=true;}
                }
                seen.add(key);m.planTags.push(key);consumed=true;
                if(changed){added++;sortPlans(m.plans);}
                continue;
            }
            if(typeof j.text!=='string'||!j.text.trim())continue;
            seen.add(key);
            m.planTags.push(key);
            consumed = true;
            const date = parsePlanDate(j.date);
            const time = String(j.time || '').trim().slice(0, 5);
            const who = PLAN_WHO[j.who] ? j.who : 'user';
            if (m.plans.some(plan => plan.date === date && plan.time === time && plan.who === who && plan.text === j.text.trim().slice(0, 200))) continue;
            addPlan({
                text: j.text,
                date: j.date,
                time: j.time,
                who: j.who,
                source: 'rp',
            });
            added++;
        }
    }
    if (m.planTags.length > 300) m.planTags = m.planTags.slice(-300);
    if (added || consumed) saveMeta();
    return added;
}
