// Birthday dates are stored once; occurrences are calculated for the RP year.
// This module is pure so calendar views and lock-screen notices use the same dates.
const pad = n => String(n).padStart(2, '0');
const leap = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const lastDay = (y, m) => m === 2 ? (leap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;

export function parseBirthdayDate(value) {
    let day, month, year;
    if (value && typeof value === 'object') {
        if (value.date && value.day == null && value.month == null) return parseBirthdayDate(value.date);
        ({day, month, year} = value);
    } else {
        const text = String(value || '').trim();
        const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        const local = text.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{4}))?$/);
        if (iso) [, year, month, day] = iso;
        else if (local) [, day, month, year] = local;
        else return null;
    }
    const integer = x => typeof x === 'number' && Number.isInteger(x) || typeof x === 'string' && /^\d+$/.test(x.trim());
    if (!integer(day) || !integer(month) || (year != null && year !== '' && !integer(year))) return null;
    day = Number(day); month = Number(month); year = year == null || year === '' ? null : Number(year);
    if (year !== null && (year < 1 || year > 9999)) return null;
    if (month < 1 || month > 12 || day < 1 || day > lastDay(year || 2000, month)) return null;
    return {day, month, year};
}

export function birthdayDateInYear(value, year) {
    const birthday = parseBirthdayDate(value);
    if (!birthday || !Number.isInteger(year) || year < 1 || year > 9999 || birthday.year > year) return '';
    // In non-leap years a February 29 birthday appears on February 28.
    return `${String(year).padStart(4, '0')}-${pad(birthday.month)}-${pad(Math.min(birthday.day, lastDay(year, birthday.month)))}`;
}

export function nextBirthdayDate(value, today) {
    const birthday = parseBirthdayDate(value), year = Number(String(today).slice(0, 4));
    if (!birthday || !year) return '';
    const firstYear = Math.max(year, birthday.year || year);
    const current = birthdayDateInYear(birthday, firstYear);
    return current >= today ? current : birthdayDateInYear(birthday, firstYear + 1);
}

export function formatBirthdayDate(value) {
    const b = parseBirthdayDate(value);
    return b ? `${pad(b.day)}.${pad(b.month)}${b.year ? '.' + String(b.year).padStart(4, '0') : ''}` : '';
}

function event(birthday, date, english) {
    return {id:birthday.id, kind:'birthday', name:birthday.name, date, time:'', who:birthday.who || 'char',
        text:(english ? 'Birthday · ' : 'День рождения · ') + birthday.name, source:birthday.source,
        done:false, status:'open', birthday};
}

export function birthdayCalendarEntries(root, today, english = false) {
    return (Array.isArray(root.birthdays) ? root.birthdays : []).flatMap(b => {
        const date = nextBirthdayDate(b, today);
        return date && b.name && b.id ? [event(b, date, english)] : [];
    }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function birthdaysOnDate(root, date, english = false) {
    const year = Number(String(date).slice(0, 4));
    return (Array.isArray(root.birthdays) ? root.birthdays : []).filter(b => b.id && b.name && birthdayDateInYear(b, year) === date)
        .map(b => event(b, date, english));
}

export function birthdayMemoryLine(root, today) {
    const entries = birthdayCalendarEntries(root, today);
    if (!entries.length) return '';
    // Facts only: the extraction task and its instructions never enter the RP prompt.
    return '[SAVED BIRTHDAYS — annual calendar dates]\n' + entries.map(p => {
        const delta = Math.round((Date.parse(p.date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
        const when = delta === 0 ? ' · TODAY' : delta === 1 ? ' · tomorrow' : delta <= 7 ? ` · in ${delta}d` : '';
        return `- ${JSON.stringify(p.name)}: ${formatBirthdayDate(p.birthday)}${when}`;
    }).join('\n');
}

const MONTH_NAMES = [
    'январь|января|january|jan', 'февраль|февраля|february|feb', 'март|марта|march|mar',
    'апрель|апреля|april|apr', 'май|мая|may', 'июнь|июня|june|jun', 'июль|июля|july|jul',
    'август|августа|august|aug', 'сентябрь|сентября|september|sept|sep',
    'октябрь|октября|october|oct', 'ноябрь|ноября|november|nov', 'декабрь|декабря|december|dec',
];

export function birthdayEvidenceMatches(value, evidence) {
    const expected = parseBirthdayDate(value);
    if (!expected) return false;
    const text = String(evidence || '').toLowerCase();
    const matches = date => date && date.day === expected.day && date.month === expected.month
        && (!expected.year || date.year === expected.year);
    for (const hit of text.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b/g)) if (matches(parseBirthdayDate(hit[0]))) return true;
    for (const hit of text.matchAll(/(?:^|[^\d-])(\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{4})?)(?![\d-])/g))
        if (matches(parseBirthdayDate(hit[1]))) return true;
    for (let month = 1; month <= 12; month++) {
        const names = MONTH_NAMES[month - 1];
        const before = new RegExp('(?:^|[^\\d])(\\d{1,2})(?:st|nd|rd|th|[-–](?:е|го))?\\s+(?:' + names + ')(?![a-zа-я])(?:[,\\s]+(\\d{4})(?!\\d))?', 'gi');
        const after = new RegExp('(?:' + names + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4})(?!\\d))?', 'gi');
        for (const re of [before, after]) for (const hit of text.matchAll(re))
            if (matches(parseBirthdayDate({day:hit[1], month, year:hit[2]}))) return true;
    }
    return false;
}
