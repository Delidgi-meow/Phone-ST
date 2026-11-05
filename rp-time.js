// Story dates are local calendar values, not UTC instants or elapsed wall time.
export function storyDate(parts, previous = null) {
    if (!parts) return null;
    const day = parts.timeOnly ? previous : new Date(parts.year, parts.month - 1, parts.day);
    if (!day) return null;
    const date = new Date(day);
    date.setHours(parts.hours ?? previous?.getHours() ?? 0, parts.minutes ?? previous?.getMinutes() ?? 0, 0, 0);
    return Number.isFinite(date.getTime()) ? date : null;
}

export function storyTimeline(chat, { current, tag, prose, text = message => message?.mes || '' }) {
    let previous = null;
    const dates = chat.map(message => {
        const source = text(message);
        const saved = Number(message?.extra?.phoneRpTime);
        const explicit = tag(source);
        // A proposed meeting time inside a phone message is not a clock update.
        const narrative = storyClockText(message, source);
        previous = storyDate(explicit, previous)
            || (Number.isFinite(saved) && saved > 0 ? new Date(saved) : null)
            || (narrative ? storyDate(prose(narrative), previous) : null)
            || previous;
        return previous;
    });
    const first = dates.find(Boolean) || current;
    return dates.map(date => date || first);
}

export function storyClockText(message, source = message?.mes || '') {
    if (message?.is_system || /<!--\s*tel:(?:priv|log)\s*-->/i.test(source)) return '';
    const visible = source.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (/^\s*\[(?:SMS|СМС|Voice|Голосовое)\s*(?:→|в\s+чат|to\s+chat)/i.test(visible)) return '';
    return visible;
}

export function storyTimestamp(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
