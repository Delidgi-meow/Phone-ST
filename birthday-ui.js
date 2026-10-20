import { getMeta, getSettings, isPhoneAppInstalled, saveMeta } from './state.js';
import { getBirthdays, saveBirthday, deletePlan, rpToday } from './plans.js';
import { formatBirthdayDate, nextBirthdayDate, parseBirthdayDate } from './birthday-dates.js';
import { generateCalendarBirthdays } from './social.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { lang } from './i18n.js';

const views = new WeakMap();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L = (ru, en) => lang() === 'en' ? en : ru;
const icon = name => `<i class="fa-solid ${name}" aria-hidden="true"></i>`;

export function openBirthdayBook(host, api) {
    const owner = getMeta();
    if (!views.has(owner)) views.set(owner, {running:false, name:'', date:'', edit:'', message:'', error:false});
    const view = views.get(owner);
    const shade = openPhoneSheet(host, L('Дни рождения', 'Birthdays'), '<div class="gp-birthday-book"></div>', 'calendar');
    shade.classList.add('gp-birthday-shade');
    const body = shade.querySelector('.gp-birthday-book');
    const current = () => getMeta() === owner && isPhoneAppInstalled('calendar') && getSettings().isEnabled !== false;
    shade.cleanup = () => {
        if (view.repaint === paint) view.repaint = null;
        queueMicrotask(() => { if (getMeta() === owner) api.changed?.(); });
    };
    view.repaint = paint;

    function paint() {
        if (!shade.isConnected || !current()) return;
        const scroll = body.scrollTop, active = body.querySelector(':focus'), focusName = active?.name;
        const list = getBirthdays().slice().sort((a, b) => nextBirthdayDate(a, rpToday()).localeCompare(nextBirthdayDate(b, rpToday())) || a.name.localeCompare(b.name));
        body.innerHTML = `<p class="gp-birthday-intro">${L('Один раз сохрани дату — она повторится в календаре каждый год.', 'Save a date once — it repeats in the calendar every year.')}</p>
            <button type="button" class="gp-birthday-import" data-birthday-import ${view.running ? 'disabled' : ''}>
                ${icon(view.running ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles')}
                ${view.running ? L('Собираю даты…', 'Collecting dates…') : owner.birthdayImportAt ? L('Обновить из контекста', 'Update from context') : L('Запомнить из контекста', 'Remember from context')}
            </button>
            <small class="gp-birthday-help">${L('Из контекста: год по возрасту и дате сюжета; неизвестные данные будут придуманы и сохранены. Разовый запрос по нажатию.', 'From context: birth year from age and story date; unknown details are invented and saved. One request on tap.')}</small>
            <p class="gp-birthday-message${view.error ? ' is-error' : ''}" role="status" ${view.message ? '' : 'hidden'}>${esc(view.message)}</p>
            <div class="gp-birthday-list">${list.length ? list.map(b => `<div class="gp-birthday-person">
                <span class="gp-birthday-symbol">${icon('fa-cake-candles')}</span>
                <button type="button" class="gp-birthday-date-link" data-birthday-go="${esc(b.id)}"><b>${esc(b.name)}</b><small>${esc(formatBirthdayDate(b))} · ${L('Каждый год', 'Every year')}</small></button>
                <button type="button" class="gp-iconbtn" data-birthday-edit="${esc(b.id)}" aria-label="${L('Изменить дату', 'Edit date')}">${icon('fa-pen')}</button>
                <button type="button" class="gp-iconbtn" data-birthday-delete="${esc(b.id)}" aria-label="${L('Удалить день рождения', 'Delete birthday')}">${icon('fa-xmark')}</button>
                </div>`).join('') : `<p class="gp-cal-empty">${L('Сохранённых дней рождения пока нет.', 'No birthdays saved yet.')}</p>`}</div>
            <form class="gp-birthday-form" data-birthday-form>
                <b>${view.edit ? L('Изменить день рождения', 'Edit birthday') : L('Добавить вручную', 'Add manually')}</b>
                <label>${L('Имя', 'Name')}<input name="birthday-name" maxlength="100" autocomplete="off" required value="${esc(view.name)}" placeholder="${L('Кого поздравляем?', 'Whose birthday?')}"></label>
                <label>${L('Дата рождения', 'Date of birth')}<input name="birthday-date" maxlength="10" autocomplete="off" inputmode="numeric" required value="${esc(view.date)}" placeholder="${L('ДД.ММ или ДД.ММ.ГГГГ', 'DD.MM or DD.MM.YYYY')}"></label>
                <small>${L('Год можно не указывать — «Запомнить / Обновить из контекста» рассчитает или придумает его. Для 29 февраля напоминание в обычный год будет 28 февраля.', 'Year is optional — Remember / Update from context will calculate or invent it. February 29 birthdays appear on February 28 in non-leap years.')}</small>
                <div class="gp-birthday-form-actions"><button type="submit" class="gp-primary">${L('Сохранить', 'Save')}</button>${view.edit ? `<button type="button" class="gp-secondary" data-birthday-cancel>${L('Отмена', 'Cancel')}</button>` : ''}</div>
            </form>`;
        body.scrollTop = scroll;
        for (const [name, key] of [['birthday-name','name'], ['birthday-date','date']]) body.querySelector(`[name="${name}"]`).oninput = e => { view[key] = e.target.value; };
        body.querySelector('[data-birthday-form]').onsubmit = e => {
            e.preventDefault();
            if (!current()) return;
            if (!parseBirthdayDate(view.date)) { view.error = true; view.message = L('Проверь дату: например, 21.04 или 21.04.1995.', 'Check the date: for example, 21.04 or 21.04.1995.'); paint(); return; }
            const saved = saveBirthday({id:view.edit, name:view.name, date:view.date});
            if (!saved) { view.error = true; view.message = L('Проверь имя: для этого человека уже может быть сохранена дата.', 'Check the name: this person may already have a saved date.'); paint(); return; }
            view.name = ''; view.date = ''; view.edit = ''; view.error = false;
            view.message = L('День рождения сохранён.', 'Birthday saved.');
            api.changed?.(); paint();
        };
        body.querySelector('[data-birthday-cancel]')?.addEventListener('click', () => { view.name = ''; view.date = ''; view.edit = ''; paint(); });
        body.querySelectorAll('[data-birthday-edit]').forEach(button => button.onclick = () => {
            const b = getBirthdays().find(b => b.id === button.dataset.birthdayEdit); if (!b) return;
            view.edit = b.id; view.name = b.name; view.date = formatBirthdayDate(b); view.message = ''; paint();
            body.querySelector('[name="birthday-name"]').focus();
        });
        body.querySelectorAll('[data-birthday-delete]').forEach(button => button.onclick = () => {
            if (!current()) return;
            deletePlan(button.dataset.birthdayDelete);
            if (view.edit === button.dataset.birthdayDelete) { view.edit = ''; view.name = ''; view.date = ''; }
            view.message = ''; api.changed?.(); paint();
        });
        body.querySelectorAll('[data-birthday-go]').forEach(button => button.onclick = () => {
            const b = getBirthdays().find(b => b.id === button.dataset.birthdayGo); if (!b) return;
            const date = nextBirthdayDate(b, rpToday()); closePhoneSheet(shade); api.openDate?.(date);
        });
        body.querySelector('[data-birthday-import]').onclick = collect;
        if (focusName) body.querySelector(`[name="${focusName}"]`)?.focus({preventScroll:true});
    }

    async function collect() {
        if (view.running || !current()) return;
        const version = getSettings().phoneActivityVersion;
        view.running = true; view.message = ''; view.error = false; paint();
        try {
            const result = await generateCalendarBirthdays(getBirthdays().map(b => ({...b})));
            if (!current() || getSettings().phoneActivityVersion !== version) return;
            let count = 0, conflicts = 0;
            for (const entry of result.birthdays) {
                const saved = saveBirthday({...entry, source:'context'});
                if (saved?.changed) count++;
                if (saved?.conflict) conflicts++;
            }
            owner.birthdayImportAt = Date.now(); saveMeta(); api.changed?.();
            view.message = count ? L(`Сохранено дат: ${count}.`, `Dates saved: ${count}.`) : L('Нет новых дат для сохранения.', 'No new dates to save.');
            if (result.skipped || conflicts) view.message += ' ' + L('Некорректные и противоречащие сохранённым даты пропущены.', 'Invalid dates and conflicts with saved dates were skipped.');
        } catch (error) {
            if (current()) { view.error = true; view.message = String(error?.message || error); }
        } finally { view.running = false; view.repaint?.(); }
    }
    paint();
    return shade;
}
