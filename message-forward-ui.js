import { getMeta } from './state.js';
import { bankIcon } from './bank-icons.js';
import { lang } from './i18n.js';
import { messageForward } from './message-forward.js';
const L = (ru, en) => lang() === 'en' ? en : ru;
const selections = new WeakMap();

export function bindMessageForwarding(host, { view, header, composer, rows, messages, key, snapshot, sourceApp, peer, forward }) {
    if (!header || !composer || !messages.length) return;
    const owner = getMeta();
    if (!selections.has(owner)) selections.set(owner, new Map());
    const views = selections.get(owner);
    if (!views.has(view)) views.set(view, { active: false, selected: new Set() });
    const state = views.get(view), available = new Map(messages.map((message, index) => [String(key(message, index)), message]));
    for (const id of state.selected) if (!available.has(id)) state.selected.delete(id);
    const start = document.createElement('button');
    start.type = 'button'; start.className = 'gp-iconbtn gp-forward-start';
    start.title = L('Выбрать сообщения для пересылки', 'Select messages to forward');
    start.setAttribute('aria-label', start.title); start.innerHTML = bankIcon('Send'); header.appendChild(start);
    const bar = document.createElement('div'); bar.className = 'gp-forward-toolbar';
    bar.innerHTML = '<button type="button" data-forward-cancel>' + L('Отмена', 'Cancel') + '</button><b data-forward-count></b><button type="button" data-forward-send>' + bankIcon('Send') + L('Переслать', 'Forward') + '</button>';
    composer.before(bar);
    const elements = [...rows];
    const update = () => {
        composer.hidden = state.active; bar.hidden = !state.active;
        start.setAttribute('aria-pressed', String(state.active));
        bar.querySelector('[data-forward-count]').textContent = String(state.selected.size);
        bar.querySelector('[data-forward-send]').disabled = !state.selected.size;
        elements.forEach((element, index) => {
            const selected = state.selected.has(String(key(messages[index], index)));
            element.classList.toggle('gp-forward-selectable', state.active);
            element.classList.toggle('gp-forward-selected', selected);
            const dot = element.querySelector('.gp-forward-dot');
            dot.hidden = !state.active; dot.setAttribute('aria-checked', String(selected));
        });
    };
    const stop = () => { state.active = false; state.selected.clear(); update(); };
    start.onclick = () => { if (state.active) stop(); else { state.active = true; update(); } };
    bar.querySelector('[data-forward-cancel]').onclick = stop;
    elements.forEach((element, index) => {
        const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'gp-forward-dot';
        dot.setAttribute('role', 'checkbox'); dot.setAttribute('aria-label', L('Выбрать сообщение', 'Select message')); element.appendChild(dot);
        element.addEventListener('click', event => {
            if (!state.active) return;
            event.preventDefault(); event.stopImmediatePropagation();
            const id = String(key(messages[index], index));
            if (state.selected.has(id)) state.selected.delete(id);
            else if (state.selected.size < 30) state.selected.add(id);
            update();
        }, true);
    });
    bar.querySelector('[data-forward-send]').onclick = () => {
        if (getMeta() !== owner || !state.selected.size) return;
        const selected = messages.filter((message, index) => state.selected.has(String(key(message, index)))).map(snapshot);
        const card = messageForward({ app: 'msg', sourceApp, author: peer, messages: selected });
        if (!card) return;
        stop(); forward(card);
    };
    update();
}
