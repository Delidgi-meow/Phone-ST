import { cleanContactName, contactNameKey, resolveIdentity } from './contact-identity.js';

const handleKey = value => contactNameKey(value).replace(/^@+/, '');
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fields = value => {
    const input = typeof value === 'string' ? {name:value} : value || {};
    const name = cleanContactName(input.originalName || input.author || input.name || (String(input.id || '').startsWith('account:') ? input.id.slice(8) : '')).slice(0, 100);
    return {input, name, handle:handleKey(input.handle || (name.startsWith('@') ? name : ''))};
};
const add = (index, name, key) => {
    if (!name || !key) return;
    if (!index.has(name)) index.set(name, new Set());
    index.get(name).add(key);
};
const unique = values => values?.size === 1 ? [...values][0] : '';

export function redirectedIgThreadId(data, value) {
    let id = String(value || '');
    const seen = new Set();
    while (Object.hasOwn(data.threadRedirects || {}, id) && !seen.has(id)) {
        seen.add(id); id = data.threadRedirects[id];
    }
    return id;
}

export function canonicalIgSource(source, data) {
    let result = String(source || '');
    // Old story reactions included the account/thread ID in their dedupe key.
    if (result.startsWith('story:')) for (const old of Object.keys(data.threadRedirects || {})) {
        const target = redirectedIgThreadId(data, old);
        if (old !== target) result = result.replace(':' + old + ':', ':' + target + ':');
    }
    return result;
}

export function instagramIdentitySignature(meta, contacts, data) {
    const identity = item => [item.id, item.key, item.contactKey, item.author, item.originalName, item.name, item.ak, item.handle];
    return JSON.stringify([meta.contactIdentities, meta.contactKeyRedirects, meta.handles, meta.names,
        contacts.map(identity), data.threads.map(identity), data.threadRedirects,
        (meta.social?.igPosts || []).map(identity), (meta.social?.stories || []).map(identity),
        [...new Set(data.activity.filter(item=>String(item.ak||'').startsWith('contact:')).map(item=>JSON.stringify([item.author,item.ak,item.handle])))].sort()]);
}

export function instagramIdentity(meta, contacts, data) {
    const records = new Map(), originals = new Map(), aliases = new Map(), handles = new Map();
    const nameHandles = new Map(), handleNames = new Map();
    const evidence = [...data.threads, ...(meta.social?.igPosts || []), ...(meta.social?.stories || []), ...data.activity.filter(item=>String(item.ak||'').startsWith('contact:'))];
    const contactByKey = new Map(contacts.map(item => [resolveIdentity(meta, item.key), item]));
    const record = value => {
        const key = resolveIdentity(meta, value);
        if (!key || key.startsWith('group:') || ['user','__user__','random'].includes(key)) return null;
        if (!records.has(key)) {
            const saved = meta.contactIdentities?.[key], contact = contactByKey.get(key);
            records.set(key, {key, author:cleanContactName(saved?.originalName || contact?.originalName || key), named:!!(saved?.originalName || contact?.originalName), handles:new Set(), primaryHandle:handleKey(meta.handles?.[key])});
        }
        return records.get(key);
    };
    const explicit = input => {
        const id = redirectedIgThreadId(data, input.id);
        return input.contactKey || (String(input.ak || '').startsWith('contact:') ? input.ak.slice(8) : '')
            || (id.startsWith('contact:') ? id.slice(8) : '') || input.key || '';
    };
    for (const key of new Set([...contactByKey.keys(), ...Object.keys(meta.contactIdentities || {}), ...Object.keys(meta.handles || {})])) record(key);
    for (const item of evidence) {
        const {input,name,handle} = fields(item), key = explicit(input);
        const person = key ? record(key) : null;
        if (person && name && !name.startsWith('@') && (!person.named || person.author === person.key && contactNameKey(name) === person.key)) { person.author = name; person.named = true; }
        if (person && handle) person.handles.add(handle);
        if (person && name && !name.startsWith('@')) add(aliases, contactNameKey(name), person.key);
        if (name && !name.startsWith('@') && handle && input.ak !== 'user') {
            add(nameHandles, contactNameKey(name), handle); add(handleNames, handle, name);
        }
    }
    for (const person of records.values()) {
        const saved = meta.contactIdentities?.[person.key], contact = contactByKey.get(person.key);
        for (const name of [person.key, person.author]) add(originals, contactNameKey(name), person.key);
        for (const name of [meta.names?.[person.key], contact?.name, ...(Array.isArray(saved?.aliases) ? saved.aliases : [])]) {
            if (!name) continue;
            add(aliases, contactNameKey(name), person.key);
            if (String(name).startsWith('@')) person.handles.add(handleKey(name));
        }
        if (person.primaryHandle) person.handles.add(person.primaryHandle);
        for (const handle of person.handles) add(handles, handle, person.key);
    }
    const contactParty = (person, handle) => {
        const chosen = person.primaryHandle || handle || unique(person.handles);
        return {id:'contact:' + person.key, contactKey:person.key, author:person.author, ak:'contact:' + person.key, handle:chosen ? '@' + chosen : ''};
    };
    return value => {
        const {input,name,handle} = fields(value), linked = explicit(input);
        let person = linked ? record(linked) : null;
        if (person && !person.named && name && !name.startsWith('@')) { person.author = name; person.named = true; }
        if (!person && handle) person = records.get(unique(handles.get(handle)));
        if (!person && name && !name.startsWith('@')) {
            const matches = originals.get(contactNameKey(name));
            const key = matches?.size ? unique(matches) : unique(aliases.get(contactNameKey(name)));
            const candidate = records.get(key);
            const conflicting = handle && candidate && (candidate.handles.size
                ? !candidate.handles.has(handle) : (nameHandles.get(contactNameKey(name))?.size || 0) > 1);
            if (!conflicting) person = candidate;
        }
        if (person) return contactParty(person, handle);
        const chosen = handle || unique(nameHandles.get(contactNameKey(name)));
        const author = name && !name.startsWith('@') ? name : unique(handleNames.get(chosen)) || name || (chosen ? '@' + chosen : '');
        const originalId = 'account:' + (chosen || contactNameKey(author)), id = redirectedIgThreadId(data, originalId);
        if (id.startsWith('contact:')) {
            const linkedPerson = record(id.slice(8));
            if (linkedPerson) return contactParty(linkedPerson, handle);
        }
        const previous = id !== originalId && data.threads.find(thread => thread.id === id);
        return {id, author:previous?.author || author, ak:'random', handle:previous?.handle || (chosen ? '@' + chosen : '')};
    };
}

function mergeMessage(previous, incoming) {
    let changed = false;
    const put = (key, value) => { if (previous[key] !== value) { previous[key] = value; changed = true; } };
    if (incoming.read) put('read', true);
    if (incoming.replyState === 'complete' || !previous.replyState && incoming.replyState) put('replyState', incoming.replyState);
    if (!previous.text && incoming.text) put('text', incoming.text);
    if (!previous.share && incoming.share) put('share', incoming.share);
    else if (previous.share && incoming.share) for (const key of Object.keys(incoming.share)) {
        if (!previous.share[key] && incoming.share[key]) { previous.share[key] = incoming.share[key]; changed = true; }
    }
    if (incoming.at > 0 && (!previous.at || incoming.at < previous.at)) put('at', incoming.at);
    return changed;
}

export function repairInstagramIdentity(data, partyFor) {
    if (!plain(data.threadRedirects)) data.threadRedirects = {};
    const groups = new Map(), messageAliases = new Map();
    let changed = false;
    const set = (object, key, value) => { if (object[key] !== value) { object[key] = value; changed = true; } };
    for (const thread of data.threads) {
        const party = partyFor(thread);
        if (!party.author || party.id === 'account:') continue;
        if (!groups.has(party.id)) groups.set(party.id, {party, threads:[]});
        groups.get(party.id).threads.push(thread);
        if (thread.id && thread.id !== party.id) set(data.threadRedirects, thread.id, party.id);
    }
    for (const old of Object.keys(data.threadRedirects)) set(data.threadRedirects, old, redirectedIgThreadId(data, old));
    const threads = [];
    for (const {party,threads:family} of groups.values()) {
        const target = family.find(item => item.id === party.id) || family[0];
        const byId = new Map(), bySource = new Map(), messages = [];
        // Prefer the canonical object so pending replies and open views survive.
        for (const item of [target,...family.filter(item => item !== target)]) for (const message of Array.isArray(item.messages) ? item.messages : []) {
            const source = canonicalIgSource(message.source, data);
            const previous = message.id && byId.get(message.id) || source && bySource.get(source);
            if (previous) {
                changed = mergeMessage(previous, message) || changed;
                if (message.id) { byId.set(message.id, previous); messageAliases.set(message.id, previous.id); }
                if (source) bySource.set(source, previous);
            } else {
                messages.push(message);
                if (message.id) byId.set(message.id, message);
                if (source) bySource.set(source, message);
            }
        }
        messages.sort((a,b) => (Number(a.at) || 0) - (Number(b.at) || 0));
        for (const [key,value] of Object.entries(party)) set(target, key, value);
        if (!party.contactKey && target.contactKey) { delete target.contactKey; changed = true; }
        if (!Array.isArray(target.messages) || target.messages.length !== messages.length || target.messages.some((item,index) => item !== messages[index])) set(target, 'messages', messages);
        // Preserve an already stored combined history larger than the old cap.
        if (messages.length > 200) set(target, 'historyLimit', Math.max(messages.length, Number(target.historyLimit) || 200));
        threads.push(target);
        if (family.length > 1) changed = true;
    }
    if (threads.length !== data.threads.length || threads.some((item,index) => item !== data.threads[index])) set(data, 'threads', threads);
    const byThread = new Map(threads.map(item => [item.id,item])), activity = [], events = new Map();
    for (const event of data.activity) {
        if (event.target === 'dm') {
            set(event, 'targetId', redirectedIgThreadId(data, event.targetId));
            const thread = byThread.get(event.targetId);
            if (thread) { set(event, 'author', thread.author); set(event, 'ak', thread.ak); }
            if (event.dedupe?.startsWith('dm:')) {
                const old = event.dedupe.slice(3);
                if (messageAliases.has(old)) set(event, 'dedupe', 'dm:' + messageAliases.get(old));
            }
        } else if (event.kind !== 'likes') {
            const person = partyFor(event);
            if (person.contactKey) { set(event, 'author', person.author); set(event, 'ak', person.ak); }
        }
        const dedupe = event.dedupe && event.kind + ':' + canonicalIgSource(event.dedupe, data);
        const previous = dedupe && events.get(dedupe);
        if (previous) {
            if (event.read) set(previous, 'read', true);
            if (event.journaled) set(previous, 'journaled', true);
            changed = true;
        } else { activity.push(event); if (dedupe) events.set(dedupe, event); }
    }
    if (activity.length !== data.activity.length) set(data, 'activity', activity);
    return changed;
}
