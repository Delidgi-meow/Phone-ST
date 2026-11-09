import { getMeta, getThreadList } from './state.js';
import { getShopPayer, setShopPayer } from './shop.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { bankIcon as icon } from './bank-icons.js';
import { lang } from './i18n.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L = (ru, en) => lang() === 'en' ? en : ru;

export function shopPayerButton() {
    return `<button type="button" class="gp-shop-payer" data-shop-payer>${icon('Wallet')}<span>${L('Платит','Paid by')}: <b>${esc(getShopPayer().label)}</b></span>${icon('ChevronRight')}</button>`;
}

export function openShopPayerPicker(host, onChange) {
    const owner = getMeta(), selected = getShopPayer();
    const contacts = getThreadList().filter(thread => !thread.isGroup);
    const shade = openPhoneSheet(host, L('Кто оплачивает','Who pays'), `<div class="gp-shop-payer-list">
        <button type="button" data-payer-user><span>${L('Мой счёт','My account')}</span><i class="${selected.payer === 'user' ? 'is-selected' : ''}"></i></button>
        ${contacts.map((contact, index) => `<button type="button" data-payer-contact="${index}"><span>${esc(contact.name)}</span><i class="${selected.key === contact.key ? 'is-selected' : ''}"></i></button>`).join('')}
        </div><form class="gp-shop-payer-form"><label>${L('Другой персонаж','Another character')}<input name="payer" maxlength="80" autocomplete="off" placeholder="${L('Имя персонажа','Character name')}" required></label><p>${L('Для следующих покупок. Если платит персонаж, твой баланс не меняется.','For the next purchases. A character paying does not change your balance.')}</p><button type="submit">${L('Выбрать','Choose')}${icon('ArrowRight')}</button></form>`, 'shopcat');
    function choose(value) {
        if (getMeta() !== owner) { closePhoneSheet(shade); return; }
        setShopPayer(value); closePhoneSheet(shade); onChange();
    }
    shade.querySelector('[data-payer-user]').onclick = () => choose(null);
    shade.querySelectorAll('[data-payer-contact]').forEach(button => button.onclick = () => {
        const contact = contacts[Number(button.dataset.payerContact)];
        if (contact) choose({key:contact.key, name:contact.originalName || contact.name});
    });
    shade.querySelector('form').onsubmit = event => {
        event.preventDefault(); const name = event.currentTarget.elements.payer.value.trim();
        if (name) choose({name});
    };
}
