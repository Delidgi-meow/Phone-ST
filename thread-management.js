import { getMeta, getThread, getThreadList, resolveContactKey, updateGroupMembers, delGroup, hideContact } from './state.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { getUserName, logSocialToChat } from './social.js';
import { lang } from './i18n.js';

const L = (ru, en) => lang() === 'en' ? en : ru;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function openGroupMembers(screen, thread, api, remove = false) {
    const owner = getMeta(), t = getThread(thread.key);
    if (!t?.isGroup) return;
    const members = t.members || [], keys = new Set(members.map(resolveContactKey));
    // Store canonical names; saved nicknames are only display labels.
    const contacts = remove ? members.map(name => ({name, originalName:name}))
        : getThreadList().filter(c => !c.isGroup && !keys.has(resolveContactKey(c.originalName || c.name)));
    if (!contacts.length) { api.toast(remove ? L('В чате никого нет','No members in this chat') : L('Все контакты уже в чате','All contacts are already in this chat')); return; }
    const shade = openPhoneSheet(screen, remove ? L('Убрать участников','Remove members') : L('Добавить участников','Add members'),
        '<div class="gp-group-composer"><div class="gp-group-existing">' + contacts.map(c =>
            '<label><input type="checkbox" data-member value="' + esc(c.originalName || c.name) + '"><span>' + esc(c.name) + '</span></label>').join('') +
        '</div><button type="button" class="gp-web-primary" data-members-apply>' + (remove ? L('Убрать','Remove') : L('Добавить','Add')) + '</button></div>', 'thread:' + t.key);
    shade.querySelector('[data-members-apply]').onclick = () => {
        if (getMeta() !== owner || !shade.isConnected) return;
        const selected = [...shade.querySelectorAll('[data-member]:checked')].map(input => input.value);
        if (!selected.length) { api.toast(L('Выбери хотя бы одного участника','Select at least one member')); return; }
        const latest = getThread(t.key);
        if (!latest?.isGroup) { closePhoneSheet(shade); return; }
        const selectedKeys = new Set(selected.map(resolveContactKey));
        const next = remove ? latest.members.filter(name => !selectedKeys.has(resolveContactKey(name)))
            : [...new Map([...latest.members, ...selected].map(name => [resolveContactKey(name), name])).values()];
        if (!updateGroupMembers(t.key, next)) { api.toast(L('Не удалось изменить участников','Could not update members')); return; }
        closePhoneSheet(shade); api.changed(); api.render();
        api.toast((remove ? L('Убрали: ','Removed: ') : L('Добавлено: ','Added: ')) + selected.join(', '));
        if (remove) Promise.resolve(logSocialToChat(`${getUserName()} убирает из группового чата «${t.name}»: ${selected.join(', ')}`)).catch(() => {});
    };
}

export function confirmThreadDeletion(screen, thread, api) {
    const owner = getMeta(), t = getThread(thread.key);
    if (!t) return;
    const title = t.isGroup ? L('Удалить групповой чат?','Delete group chat?') : L('Удалить контакт?','Delete contact?');
    const shade = openPhoneSheet(screen, title, '<div class="gp-group-composer"><p>' + esc(t.name) + '</p><p>' +
        L('Убрать из телефона? Сообщения в ролевом чате останутся.','Remove from the phone? Messages in the roleplay chat will remain.') +
        '</p><button type="button" class="gp-web-primary gp-danger" data-delete-confirm>' + L('Удалить','Delete') + '</button>' +
        '<button type="button" class="gp-web-textbutton" data-delete-cancel>' + L('Отмена','Cancel') + '</button></div>', 'thread:' + t.key);
    shade.querySelector('[data-delete-cancel]').onclick = () => closePhoneSheet(shade);
    shade.querySelector('[data-delete-confirm]').onclick = () => {
        if (getMeta() !== owner || !shade.isConnected) return;
        if (t.isGroup) delGroup(t.key); else hideContact(t.key);
        closePhoneSheet(shade); api.changed(); api.deleted();
    };
}
