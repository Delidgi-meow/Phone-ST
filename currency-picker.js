import { getMeta } from './state.js';
import { getBank, convertCurrency } from './bank.js';
import { getCurrencies, currencyInfo, normalizeCurrency } from './currencies.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { bankIcon } from './bank-icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const searchKey = value => String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е');
const SEARCH_ALIASES = { JPY:'япония японские иены йены йена йен', CNY:'китай китайские юани юаней', KRW:'корея кореи южная воны вон south korea', KPW:'корея кореи северная воны вон north korea', USD:'сша доллары долларов', EUR:'европа евро', RUB:'россия рубли рублей', GBP:'британия фунты фунтов' };

export function openCurrencyPicker(host, onSave) {
    const from = currencyInfo(getBank().currency);
    let selected = from.code;
    const shade = openPhoneSheet(host, 'Валюта банка', `
        <div class="gp-currency-body">
            <label class="gp-currency-search">${bankIcon('Search')}<input type="search" placeholder="Название, код или символ" aria-label="Найти валюту" autocomplete="off" data-currency-search></label>
            <div class="gp-currency-list" aria-label="Валюты" data-currency-list></div>
            <p class="gp-currency-empty" data-currency-empty hidden>Ничего не найдено</p>
            <details class="gp-currency-custom"><summary>Своя валюта</summary><label>Название или символ<input type="text" maxlength="12" placeholder="Например, кредиты" data-currency-custom></label></details>
        </div>
        <form class="gp-currency-footer" data-currency-form>
            <b data-currency-choice></b>
            <label class="gp-currency-convert"><input type="checkbox" data-currency-convert> Пересчитать суммы по курсу</label>
            <label class="gp-currency-rate" data-currency-rate-row hidden><span data-currency-rate-label></span><input type="number" inputmode="decimal" min="0" step="any" placeholder="Курс" data-currency-rate></label>
            <p data-currency-hint>Числа останутся прежними. Для пересчёта укажи свой курс.</p>
            <p class="gp-currency-error" role="alert" data-currency-error hidden></p>
            <button type="submit" class="gp-primary">Применить</button>
        </form>`, 'bank');
    shade.classList.add('gp-currency-shade');
    shade.querySelector('[data-sheet-close]').innerHTML = bankIcon('X');
    const list = shade.querySelector('[data-currency-list]');
    const rows = [];
    let specialHeading;
    for (const item of getCurrencies()) {
        if (item.special && !specialHeading) {
            specialHeading = document.createElement('div');
            specialHeading.className = 'gp-currency-group'; specialHeading.textContent = 'Металлы и расчётные единицы';
            list.append(specialHeading);
        }
        const row = document.createElement('button');
        row.type = 'button'; row.className = 'gp-currency-row';
        row.dataset.code = item.code;
        row.innerHTML = `<span class="gp-currency-symbol">${esc(item.symbol)}</span><span><b>${esc(item.name)}</b><small>${esc(item.code)}</small></span>${bankIcon('Check')}`;
        const search = searchKey(`${item.code} ${item.name} ${item.englishName} ${item.symbol} ${SEARCH_ALIASES[item.code] || ''}`);
        rows.push({ row, search, special:item.special }); list.append(row);
    }
    const custom = shade.querySelector('[data-currency-custom]');
    const convert = shade.querySelector('[data-currency-convert]');
    const rate = shade.querySelector('[data-currency-rate]');
    const error = shade.querySelector('[data-currency-error]');
    function selection() {
        error.hidden = true;
        const info = currencyInfo(selected);
        shade.querySelector('[data-currency-choice]').textContent = `${info.code} · ${info.name}`;
        shade.querySelector('[data-currency-rate-label]').textContent = `1 ${from.code} = … ${info.code}`;
        const changing = selected !== from.code;
        convert.disabled = !changing;
        shade.querySelector('[data-currency-rate-row]').hidden = !changing || !convert.checked;
        rate.required = changing && convert.checked;
        shade.querySelector('[data-currency-hint]').textContent = changing && convert.checked
            ? 'Пересчитаются баланс, операции, кредиты, платежи и цены магазина.'
            : 'Числа останутся прежними. Для пересчёта укажи свой курс.';
        for (const { row } of rows) row.setAttribute('aria-pressed', String(row.dataset.code === selected));
    }
    list.onclick = event => {
        const row = event.target.closest('[data-code]'); if (!row) return;
        selected = row.dataset.code; custom.value = ''; rate.value = ''; selection();
    };
    custom.oninput = () => { selected = normalizeCurrency(custom.value || from.code); rate.value = ''; selection(); };
    convert.onchange = selection;
    shade.querySelector('[data-currency-search]').oninput = event => {
        const query = searchKey(event.target.value.trim()); let count = 0, specials = 0;
        for (const item of rows) {
            item.row.hidden = !!query && !item.search.includes(query);
            if (!item.row.hidden) { count++; if (item.special) specials++; }
        }
        if (specialHeading) specialHeading.hidden = !specials;
        shade.querySelector('[data-currency-empty]').hidden = count > 0;
    };
    shade.querySelector('[data-currency-form]').onsubmit = event => {
        event.preventDefault();
        if (shade.ownerRoot !== getMeta()) { closePhoneSheet(shade); return; }
        const factor = convert.checked && !convert.disabled ? Number(rate.value) : null;
        if (factor !== null && (!Number.isFinite(factor) || factor <= 0)) {
            error.textContent = 'Укажи курс больше нуля'; error.hidden = false; rate.focus(); return;
        }
        let result;
        try { result = convertCurrency(selected, { factor }); } catch {
            error.textContent = 'Этот курс даёт слишком большую сумму. Уменьши его.'; error.hidden = false;
            return;
        }
        closePhoneSheet(shade); onSave?.(result);
    };
    selection();
}
