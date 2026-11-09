import {
    getBank, fmtMoney, roundMoney, addTransaction, deleteTransaction, incomeExpenseTotals,
    getBankReminders, monthlyObligations, monthlyLoanPayment, spendingByCategory,
    takeLoan, calculateLoan, loanSchedule, loanPaymentAmount, loanPaidThisMonth, payLoanInstallment, deleteLoan,
    addRecurring, payRecurring, delRecurring, billPaid, bankToday,
} from './bank.js';
import { getMeta } from './state.js';
import { currencyInfo, currencyStep } from './currencies.js';
import { openCurrencyPicker } from './currency-picker.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { bankIcon as icon } from './bank-icons.js';
import { trDom, lang } from './i18n.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS = ['еда','транспорт','жильё','подписка','одежда','развлечения','красота','здоровье','подарок','зарплата','перевод','другое'];
const catIcons = {'еда':'Utensils','транспорт':'Car','жильё':'House','ипотека':'House','подписка':'Repeat2','одежда':'ShoppingBag','здоровье':'Heart','подарок':'Gift','зарплата':'BriefcaseBusiness','перевод':'ArrowRightLeft','кредит':'CreditCard'};
const drafts = new WeakMap();
function state() {
    const owner = getMeta();
    if (!drafts.has(owner)) drafts.set(owner, { sign:-1, transfer:false, all:false, tx:{} });
    return drafts.get(owner);
}
const moneyInput = (name, value = '', required = true) => `<input name="${name}" type="number" min="0" step="${currencyStep(getBank().currency)}" inputmode="decimal" value="${esc(value)}" placeholder="0" ${required ? 'required' : ''}>`;
const field = (label, input) => `<label class="gp-wallet-field"><span>${label}</span>${input}</label>`;
const selectCats = selected => `<select name="category">${CATS.map(c => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
const button = (name, label, action, cls = '') => `<button type="button" class="gp-wallet-button ${cls}" data-wallet="${action}">${icon(name)}<span>${label}</span></button>`;
function header(title, back = 'home', action = '') {
    return `<header class="gp-wallet-header"><button type="button" class="gp-wallet-icon-button" data-wallet="${back}" aria-label="Назад">${icon('ChevronLeft')}</button><h2>${title}</h2>${action || '<span></span>'}</header>`;
}
const empty = text => `<div class="gp-wallet-empty">${text}</div>`;
const payerLabel = payer => (lang() === 'en' ? 'Paid by: ' : 'Плательщик: ') + payer;
function amountRow(tx) {
    return `<button type="button" class="gp-wallet-operation ${tx.external ? 'is-external' : ''}" data-wallet-tx="${esc(tx.id)}"><span class="gp-wallet-operation-icon ${tx.amount > 0 ? 'is-income' : ''}">${icon(tx.external ? 'Gift' : catIcons[tx.category] || (tx.amount > 0 ? 'ArrowDownLeft' : 'ReceiptText'))}</span><span class="gp-wallet-operation-copy"><b>${esc(tx.label)}</b><small>${esc(tx.external ? payerLabel(tx.payer) : tx.category)}</small></span><strong class="${tx.amount > 0 ? 'is-income' : ''}">${tx.amount > 0 ? '+' : ''}${esc(fmtMoney(tx.external ? Math.abs(tx.amount) : tx.amount))}</strong></button>`;
}
function mainHtml() {
    const b = getBank(), s = state(), totals = incomeExpenseTotals(), due = getBankReminders();
    const info = currencyInfo(b.currency), monthly = monthlyObligations() + monthlyLoanPayment();
    const personalDebt = b.loans.reduce((sum,l)=>sum+(!l.paidOff && l.kind !== 'mortgage' ? l.remaining : 0),0);
    const homeDebt = b.loans.reduce((sum,l)=>sum+(!l.paidOff && l.kind === 'mortgage' ? l.remaining : 0),0);
    const categories = spendingByCategory(3), max = categories[0]?.sum || 1;
    return `${header('Банк', 'home', `<button type="button" class="gp-wallet-currency" data-wallet="currency" aria-label="Выбрать валюту: ${esc(info.name)}">${esc(info.code)}${icon('ChevronRight')}</button>`)}
        <div class="gp-wallet-scroll">
            <section class="gp-wallet-balance-card">
                <div class="gp-wallet-card-top"><span>${icon('WalletCards')} Личный счёт</span><span class="gp-wallet-card-mark" aria-hidden="true"><i></i><i></i></span></div>
                <span class="gp-wallet-caption">Доступно</span><strong class="gp-wallet-balance ${b.balance < 0 ? 'is-negative' : ''}">${esc(fmtMoney(b.balance))}</strong>
                <div class="gp-wallet-card-foot"><span>${esc(info.name)}</span><span>${esc(info.code)}</span></div>
            </section>
            <nav class="gp-wallet-quick" aria-label="Операции со счётом">
                ${button('Plus','Пополнить','income')}${button('ArrowUpRight','Оплатить','spend')}${button('ArrowRightLeft','Перевести','transfer')}${button('CalendarDays','Платежи','bills')}
            </nav>
            ${due.length ? `<button type="button" class="gp-wallet-due" data-wallet="bills"><span class="gp-wallet-operation-icon">${icon('CalendarDays')}</span><span><b>К оплате · ${due.length}</b><small>${esc(due.slice(0,2).map(r=>r.name).join(', '))}</small></span><strong>${esc(fmtMoney(due.reduce((sum,r)=>sum+r.amount,0)))}</strong>${icon('ChevronRight')}</button>` : ''}
            <div class="gp-wallet-section-title"><h3>Планы и возможности</h3></div>
            <div class="gp-wallet-products">
                <button type="button" data-wallet="loans">${icon('CreditCard')}<b>Кредиты</b><small>${personalDebt > 0 ? esc(fmtMoney(personalDebt)) : 'На то, что важно'}</small>${icon('ChevronRight')}</button>
                <button type="button" data-wallet="mortgage">${icon('House')}<b>Ипотека</b><small>${homeDebt > 0 ? esc(fmtMoney(homeDebt)) : 'Ключи от своего'}</small>${icon('ChevronRight')}</button>
            </div>
            ${monthly > 0 ? `<div class="gp-wallet-monthly"><span>Ежемесячные платежи</span><b>${esc(fmtMoney(monthly))}</b></div>` : ''}
            <section class="gp-wallet-activity"><div><small>Поступления</small><b class="is-income">+${esc(fmtMoney(totals.income))}</b></div><div><small>Расходы</small><b>${esc(fmtMoney(totals.expense))}</b></div></section>
            ${categories.length ? `<section class="gp-wallet-categories">${categories.map(c => `<div><span>${icon(catIcons[c.category] || 'ReceiptText')}${esc(c.category)}</span><b>${esc(fmtMoney(c.sum))}</b><i><em style="width:${Math.round(c.sum/max*100)}%"></em></i></div>`).join('')}</section>` : ''}
            <div class="gp-wallet-section-title"><h3>История</h3>${b.transactions.length > 8 ? `<button type="button" data-wallet="all">${s.all ? 'Свернуть' : 'Все'}</button>` : ''}</div>
            <section class="gp-wallet-operations">${b.transactions.slice(0,s.all ? 200 : 8).map(amountRow).join('') || empty('Здесь появятся покупки и переводы')}${Number.isFinite(b.openingBalance) ? `<div class="gp-wallet-opening"><span>Начальный остаток</span><b>${esc(fmtMoney(b.openingBalance))}</b></div>` : ''}</section>
        </div>`;
}

function txHtml() {
    const s = state(), income = s.sign > 0;
    const title = s.transfer ? 'Перевод' : income ? 'Пополнение' : 'Оплата';
    return `${header(title,'bank')}<div class="gp-wallet-scroll"><form class="gp-wallet-form" data-wallet-form="tx">
        <div class="gp-wallet-amount-entry"><span>Сумма · ${esc(currencyInfo(getBank().currency).code)}</span>${moneyInput('amount',s.tx.amount || '')}</div>
        ${s.transfer ? field('Кому', '<input name="recipient" value="'+esc(s.tx.recipient || '')+'" maxlength="50" placeholder="Имя получателя" required>') : ''}
        ${field(s.transfer ? 'Сообщение к переводу' : 'Описание', '<input name="label" value="'+esc(s.tx.label || '')+'" maxlength="60" placeholder="'+(income ? 'Например, зарплата' : 'Например, кофе')+'">')}
        ${!s.transfer ? field('Категория', selectCats(s.tx.category || (income ? 'зарплата' : 'еда'))) : ''}
        <p class="gp-wallet-error" role="alert" hidden></p><button class="gp-wallet-submit" type="submit">${s.transfer ? 'Перевести' : income ? 'Пополнить счёт' : 'Оплатить'}${icon('ArrowRight')}</button>
    </form></div>`;
}

function loanCard(loan) {
    const closed = loan.paidOff, paid = loanPaidThisMonth(loan), schedule = loanSchedule(loan);
    const progress = loan.principal > 0 ? Math.max(0, Math.min(100, (1-loan.remaining/loan.principal)*100)) : 0;
    return `<article class="gp-wallet-loan ${closed ? 'is-closed' : ''}"><div class="gp-wallet-loan-head"><span class="gp-wallet-operation-icon">${icon(loan.kind === 'mortgage' ? 'House' : 'CreditCard')}</span><span><b>${esc(loan.name)}</b><small>${closed ? 'Погашен' : loan.interestModel === 'annuity' ? 'Основной долг' : 'Осталось выплатить'}</small></span><button type="button" class="gp-wallet-icon-button" data-wallet-loan-menu="${esc(loan.id)}" aria-label="Действия с кредитом">${icon('Ellipsis')}</button></div>
        <strong class="gp-wallet-loan-amount">${esc(fmtMoney(loan.remaining))}</strong><div class="gp-wallet-progress"><i style="width:${progress}%"></i></div>
        <div class="gp-wallet-loan-meta"><span>${Math.round((loan.rate||0)*10000)/100}% годовых</span><span>${closed ? 'Закрыт' : `${schedule.length || '—'} мес. осталось`}</span></div>
        ${loan.lastPayment?.payer && loan.lastPayment.payer !== 'user' ? `<p class="gp-wallet-payment-payer">${esc(payerLabel(loan.lastPayment.payer))}</p>` : ''}
        ${closed ? '' : `<div class="gp-wallet-loan-next"><span>${paid ? 'В этом месяце оплачено' : `Платёж · ${loan.day || 1}-го числа`}</span><b>${esc(fmtMoney(loanPaymentAmount(loan)))}</b></div><div class="gp-wallet-loan-actions"><button type="button" data-wallet-pay-loan="${esc(loan.id)}" ${paid ? 'disabled' : ''}>${paid ? icon('Check')+' Оплачено' : 'Внести платёж'}</button><button type="button" data-wallet-early-loan="${esc(loan.id)}">Досрочно</button></div>`}
    </article>`;
}

function loansHtml(mortgage) {
    const b = getBank(), loans = b.loans.filter(l => mortgage ? l.kind === 'mortgage' : l.kind !== 'mortgage');
    return `${header(mortgage ? 'Ипотека' : 'Кредиты','bank', `<button type="button" class="gp-wallet-icon-button" data-wallet="new-loan" aria-label="Оформить ${mortgage ? 'ипотеку' : 'кредит'}">${icon('Plus')}</button>`)}<div class="gp-wallet-scroll">
        <section class="gp-wallet-product-intro">${icon(mortgage ? 'House' : 'CreditCard')}<h3>${mortgage ? 'Свои квадратные метры' : 'Большие планы ближе'}</h3><p>${mortgage ? 'Стоимость жилья, взнос и удобный срок. Все платежи — в одном месте.' : 'Кредит, рассрочка или автомобиль. Посмотри платёж до оформления.'}</p><button type="button" class="gp-wallet-submit" data-wallet="new-loan">${mortgage ? 'Рассчитать ипотеку' : 'Выбрать условия'}${icon('ArrowRight')}</button></section>
        <div class="gp-wallet-section-title"><h3>${mortgage ? 'Моя ипотека' : 'Мои кредиты'}</h3></div>${loans.map(loanCard).join('') || empty('Пока ничего не оформлено')}
    </div>`;
}

function billCard(bill) {
    const paid = billPaid(bill), once = bill.repeat === 'once';
    return `<article class="gp-wallet-bill"><div class="gp-wallet-loan-head"><span class="gp-wallet-operation-icon">${icon(catIcons[bill.category] || 'ReceiptText')}</span><span><b>${esc(bill.name)}</b><small>${once ? esc(bill.date) : `Каждый месяц · ${bill.day}-го`}</small></span><button type="button" class="gp-wallet-icon-button" data-wallet-del-bill="${esc(bill.id)}" aria-label="Удалить платёж">${icon('Trash2')}</button></div><div class="gp-wallet-bill-bottom"><strong>${esc(fmtMoney(bill.amount))}</strong><button type="button" data-wallet-pay-bill="${esc(bill.id)}" ${paid ? 'disabled' : ''}>${paid ? icon('Check')+' Оплачено' : 'Оплатить'}</button></div></article>`;
}

function billsHtml() {
    const b = getBank(), creditDue = getBankReminders().filter(r=>r.kind === 'loan');
    return `${header('Платежи','bank',`<button type="button" class="gp-wallet-icon-button" data-wallet="new-bill" aria-label="Добавить платёж">${icon('Plus')}</button>`)}<div class="gp-wallet-scroll">
        <div class="gp-wallet-bill-templates">${[['House','ЖКХ','жильё'],['Smartphone','Связь','подписка'],['Repeat2','Подписки','подписка'],['ReceiptText','Другое','другое']].map(([i,label,cat])=>`<button type="button" data-wallet-template="${cat}" data-wallet-template-name="${label}">${icon(i)}<span>${label}</span></button>`).join('')}</div>
        ${creditDue.length ? `<div class="gp-wallet-section-title"><h3>Пора внести</h3></div>${creditDue.map(r=>`<button type="button" class="gp-wallet-due" data-wallet-pay-loan="${esc(r.id)}"><span class="gp-wallet-operation-icon">${icon('CreditCard')}</span><span><b>${esc(r.name)}</b><small>${r.overdue ? 'Платёж просрочен' : 'Платёж сегодня'}</small></span><strong>${esc(fmtMoney(r.amount))}</strong>${icon('ChevronRight')}</button>`).join('')}` : ''}
        <div class="gp-wallet-section-title"><h3>Мои платежи</h3></div>${b.recurring.map(billCard).join('') || empty('Добавь коммунальные услуги, подписки или свой платёж')}
    </div>`;
}

function sheet(host, api, title, body) {
    const shade = openPhoneSheet(host,title,body,api.view);
    shade.classList.add('gp-wallet-sheet');
    shade.querySelector('[data-sheet-close]').innerHTML = icon('X');
    trDom(shade);
    return shade;
}

function showError(form, text) {
    const error = form.querySelector('.gp-wallet-error'); error.textContent = text; error.hidden = false;
}

function openLoanForm(host, api) {
    const mortgage = api.view === 'bankmortgage', owner = getMeta();
    const shade = sheet(host,api,mortgage ? 'Новая ипотека' : 'Новый кредит',`<form class="gp-wallet-form" data-loan-form>
        ${!mortgage ? field('Продукт', '<select name="kind"><option value="personal">Кредит наличными</option><option value="auto">Автокредит</option><option value="installment">Рассрочка</option></select>') : ''}
        ${field(mortgage ? 'Жильё' : 'Название', '<input name="name" maxlength="40" placeholder="'+(mortgage ? 'Квартира у парка' : 'На мои планы')+'">')}
        ${field(mortgage ? 'Стоимость жилья' : 'Сумма', moneyInput('amount'))}
        ${mortgage ? field('Первоначальный взнос', moneyInput('down',0,false)) : ''}
        <div class="gp-wallet-form-grid">${field('Срок, месяцев','<input name="months" type="number" min="1" max="480" step="1" value="'+(mortgage ? 240 : 12)+'" required>')}${field('Ставка, % годовых','<input name="rate" type="number" min="0" max="200" step="0.01" value="'+(mortgage ? 8 : 18)+'" required>')}</div>
        ${field('День ежемесячного платежа','<input name="day" type="number" min="1" max="31" step="1" value="10" required>')}
        <div class="gp-wallet-calculation" aria-live="polite"><span>Ежемесячный платёж</span><strong data-loan-monthly>—</strong><small data-loan-total>Укажи сумму и условия</small></div>
        ${mortgage ? '<p class="gp-wallet-hint">Кредит оплачивает жильё. Со счёта спишется первоначальный взнос; сумма ипотеки на карту не зачисляется.</p>' : ''}
        <p class="gp-wallet-error" role="alert" hidden></p><button class="gp-wallet-submit" type="submit">Оформить${icon('ArrowRight')}</button></form>`);
    const form = shade.querySelector('form'), f = form.elements;
    const read = () => ({ name:f.name.value.trim(), amount:roundMoney(f.amount.value), months:Number(f.months.value), rate:Number(f.rate.value)/100, day:Number(f.day.value), kind:mortgage ? 'mortgage' : f.kind.value, propertyPrice:mortgage ? roundMoney(f.amount.value) : 0, downPayment:mortgage ? roundMoney(f.down.value) : 0 });
    function preview() {
        const data = read(), amount = mortgage ? data.propertyPrice-data.downPayment : data.amount;
        const result = calculateLoan({...data,amount});
        form.querySelector('[data-loan-monthly]').textContent = amount > 0 ? fmtMoney(result.monthly) : '—';
        form.querySelector('[data-loan-total]').textContent = amount > 0 ? `Кредит ${fmtMoney(result.principal)} · всего около ${fmtMoney(result.total)}` : 'Укажи сумму и условия';
    }
    form.oninput = preview;
    if (!mortgage) f.kind.onchange = () => { f.rate.value = f.kind.value === 'installment' ? 0 : f.kind.value === 'auto' ? 12 : 18; preview(); };
    form.onsubmit = event => {
        event.preventDefault(); if (owner !== getMeta()) { closePhoneSheet(shade); return; }
        const data = read();
        if (data.amount <= 0 || (mortgage && (data.downPayment < 0 || data.downPayment >= data.propertyPrice))) { showError(form,'Проверь стоимость и первоначальный взнос'); return; }
        const loan = takeLoan(data); if (!loan) { showError(form,'Укажи сумму больше нуля'); return; }
        closePhoneSheet(shade); api.updateInjection(); api.render(); api.toast(mortgage ? 'Ипотека оформлена' : 'Кредит оформлен','fa-check');
    };
}

function openBillForm(host, api, category = 'другое', name = '') {
    const owner = getMeta();
    const shade = sheet(host,api,'Новый платёж',`<form class="gp-wallet-form">
        ${field('Название','<input name="name" maxlength="40" value="'+esc(name === 'Другое' ? '' : name)+'" placeholder="За что платим" required>')}
        ${field('Сумма',moneyInput('amount'))}${field('Повторение','<select name="repeat"><option value="monthly">Каждый месяц</option><option value="once">Один раз</option></select>')}
        <div data-bill-day>${field('Число месяца','<input name="day" type="number" min="1" max="31" step="1" value="1" required>')}</div>
        <div data-bill-date hidden>${field('Дата','<input name="date" type="date" value="'+bankToday()+'">')}</div>
        ${field('Категория',selectCats(category))}<p class="gp-wallet-hint">Оплата по нажатию. В нужный день телефон напомнит о платеже.</p><p class="gp-wallet-error" role="alert" hidden></p><button type="submit" class="gp-wallet-submit">Добавить платёж${icon('Plus')}</button></form>`);
    const form = shade.querySelector('form'), f = form.elements;
    f.repeat.onchange = () => { const once = f.repeat.value === 'once'; form.querySelector('[data-bill-day]').hidden=once; form.querySelector('[data-bill-date]').hidden=!once; f.date.required=once; f.day.required=!once; };
    form.onsubmit = event => {
        event.preventDefault(); if (owner !== getMeta()) { closePhoneSheet(shade); return; }
        const result = addRecurring({ name:f.name.value.trim(), amount:f.amount.value, repeat:f.repeat.value, date:f.date.value, day:f.day.value, category:f.category.value });
        if (!result) { showError(form,'Проверь сумму и дату'); return; }
        closePhoneSheet(shade); api.updateInjection(); api.render(); api.toast('Платёж добавлен','fa-check');
    };
}

function openLoanMenu(host, api, loan) {
    const shade = sheet(host,api,loan.name,`<div class="gp-wallet-menu">${button('CalendarDays','График платежей','schedule')}${!loan.paidOff ? button('ArrowDownLeft','Досрочное погашение','early') : ''}${button('Trash2','Удалить из списка','delete','is-destructive')}</div>`);
    shade.querySelector('[data-wallet=schedule]').onclick = () => {
        const rows = loanSchedule(loan);
        const schedule = sheet(host,api,'График платежей',`<div class="gp-wallet-schedule"><div><span>Платёж</span><span>Сумма</span><span>Остаток</span></div>${rows.map(r=>`<div><span>Месяц ${r.month}</span><b>${esc(fmtMoney(r.payment))}</b><span>${esc(fmtMoney(r.remaining))}</span></div>`).join('') || empty('Кредит погашен')}</div>`);
        schedule.querySelector('.gp-wallet-schedule').setAttribute('aria-label','Прогноз графика при регулярной оплате');
    };
    shade.querySelector('[data-wallet=early]')?.addEventListener('click',()=>openEarly(host,api,loan));
    shade.querySelector('[data-wallet=delete]').onclick = () => {
        confirmSheet(host,api,'Удалить кредит?', 'Запись исчезнет. Уже проведённые операции и баланс сохранятся.', ()=>{deleteLoan(loan.id);api.updateInjection();api.render();});
    };
}

function confirmSheet(host, api, title, text, done) {
    const owner = getMeta();
    const shade = sheet(host,api,title,`<div class="gp-wallet-form"><p class="gp-wallet-hint">${esc(text)}</p><button type="button" class="gp-wallet-submit is-destructive" data-wallet-confirm>Удалить</button></div>`);
    shade.querySelector('[data-wallet-confirm]').onclick = () => { if (owner !== getMeta()) { closePhoneSheet(shade); return; } closePhoneSheet(shade);done(); };
}

function openEarly(host, api, loan) {
    const owner = getMeta();
    const shade = sheet(host,api,'Досрочное погашение',`<form class="gp-wallet-form"><p class="gp-wallet-hint">Остаток: ${esc(fmtMoney(loan.remaining))}. Взнос уменьшит долг и срок; очередной ежемесячный платёж остаётся по графику.</p>${field('Сумма',moneyInput('amount',loan.remaining))}<p class="gp-wallet-error" role="alert" hidden></p><button class="gp-wallet-submit" type="submit">Внести${icon('ArrowRight')}</button></form>`);
    const form = shade.querySelector('form');
    form.onsubmit = event => {
        event.preventDefault(); if (owner !== getMeta()) { closePhoneSheet(shade); return; }
        const amount = roundMoney(form.elements.amount.value);
        if (!(amount > 0)) { showError(form,'Укажи сумму больше нуля');return; }
        payLoanInstallment(loan.id,amount); closePhoneSheet(shade);api.updateInjection();api.render();api.toast('Платёж внесён','fa-check');
    };
}

export function renderBankApp(host, api) {
    const top = host.querySelector('.gp-wallet-scroll')?.scrollTop || 0;
    const focusedForm = host.querySelector('[data-wallet-form]');
    if (api.view === 'banktx' && focusedForm?.contains(document.activeElement) && focusedForm.ownerRoot === getMeta()) return;
    host.innerHTML = `<div class="gp-wallet">${api.view === 'banktx' ? txHtml() : api.view === 'bankrec' ? billsHtml() : api.view === 'bankloan' || api.view === 'bankmortgage' ? loansHtml(api.view === 'bankmortgage') : mainHtml()}</div>`;
    const scroll = host.querySelector('.gp-wallet-scroll'); if (scroll) scroll.scrollTop = top;
    const s = state(), b = getBank();
    const navigate = view => api.navigate(view);
    host.querySelector('.gp-wallet').onclick = event => {
        const action = event.target.closest('[data-wallet]')?.dataset.wallet;
        if (action === 'home') navigate('home');
        if (action === 'bank') navigate('bank');
        if (action === 'currency') openCurrencyPicker(host, ()=>{api.updateInjection();api.render();});
        if (['income','spend','transfer'].includes(action)) { s.sign=action==='income'?1:-1;s.transfer=action==='transfer';s.tx={};navigate('banktx'); }
        if (action === 'bills') navigate('bankrec');
        if (action === 'loans') navigate('bankloan');
        if (action === 'mortgage') navigate('bankmortgage');
        if (action === 'all') { s.all=!s.all;api.render(); }
        if (action === 'new-loan') openLoanForm(host,api);
        if (action === 'new-bill') openBillForm(host,api);
        const template = event.target.closest('[data-wallet-template]');
        if (template) openBillForm(host,api,template.dataset.walletTemplate,template.dataset.walletTemplateName);
        const tx = event.target.closest('[data-wallet-tx]');
        if (tx) { const item=b.transactions.find(t=>t.id===tx.dataset.walletTx);if(item)confirmSheet(host,api,'Удалить операцию?',`${item.label} · ${fmtMoney(item.external ? Math.abs(item.amount) : item.amount)}. ${item.external ? payerLabel(item.payer) + '. ' : ''}Баланс будет пересчитан, если операция меняла его.${item.loanPayment ? ' Погашенная часть долга восстановится.' : ''}`,()=>{deleteTransaction(item.id);api.updateInjection();api.render();}); }
        const menu = event.target.closest('[data-wallet-loan-menu]');
        if (menu) { const loan=b.loans.find(l=>l.id===menu.dataset.walletLoanMenu);if(loan)openLoanMenu(host,api,loan); }
        const early = event.target.closest('[data-wallet-early-loan]');
        if (early) { const loan=b.loans.find(l=>l.id===early.dataset.walletEarlyLoan);if(loan)openEarly(host,api,loan); }
        const payLoan = event.target.closest('[data-wallet-pay-loan]');
        if (payLoan && payLoanInstallment(payLoan.dataset.walletPayLoan)) {api.updateInjection();api.render();api.toast('Платёж внесён','fa-check');}
        const payBill = event.target.closest('[data-wallet-pay-bill]');
        if (payBill && payRecurring(payBill.dataset.walletPayBill)) {api.updateInjection();api.render();api.toast('Платёж оплачен','fa-check');}
        const delBill = event.target.closest('[data-wallet-del-bill]');
        if (delBill) confirmSheet(host,api,'Удалить платёж?','Проведённые оплаты останутся в истории.',()=>{delRecurring(delBill.dataset.walletDelBill);api.updateInjection();api.render();});
    };
    const form = host.querySelector('[data-wallet-form=tx]');
    if (form) {
        form.ownerRoot = getMeta();
        form.oninput = () => { const f=form.elements;s.tx={amount:f.amount.value,label:f.label.value,recipient:f.recipient?.value,category:f.category?.value}; };
        form.onsubmit = event => {
            event.preventDefault(); if (form.ownerRoot !== getMeta()) return;
            const f=form.elements, amount=roundMoney(f.amount.value);
            if (!(amount>0)) {showError(form,'Укажи сумму больше нуля');return;}
            const label=s.transfer ? `Перевод · ${f.recipient.value.trim()}${f.label.value.trim() ? ' · '+f.label.value.trim() : ''}` : f.label.value.trim();
            addTransaction({amount:s.sign*amount,label,category:s.transfer?'перевод':f.category.value});
            s.tx={};
            api.updateInjection();navigate('bank');api.toast('Готово','fa-check');
        };
    }
}
