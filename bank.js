import { isPhoneAppInstalled } from './state.js';
import { parsePhoneJson } from './phone-text.js';

import { getMeta, saveMeta, getRpDateTime, stripThink, getPhoneAppText as getPhoneMessageText } from './state.js';
import { normalizeCurrency, currencyInfo, roundCurrency, formatCurrency, currencyStep } from './currencies.js';
import { bankEvent, paymentPayer, smsPaymentPayer } from './bank-protocol.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function hash32(str) {
    let h = 0; const s = String(str);
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(h);
}

function safeJson(raw) {
    try { return parsePhoneJson(raw); } catch (e) {
        try { return parsePhoneJson(String(raw).replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')); } catch (e2) { return null; }
    }
}

// ── Хранилище ──
export function getBank() {
    const m = getMeta();
    const fresh = !m.bank || typeof m.bank !== 'object' || Array.isArray(m.bank);
    if (fresh) {
        const opening = (20 + Math.floor(Math.random() * 181)) * 500;
        m.bank = { balance:opening, currency:'RUB', openingBalance:opening, openingAt:Date.now() };
    }
    const b = m.bank;
    if (typeof b.balance !== 'number') b.balance = 0;
    if (typeof b.currency !== 'string') b.currency = '₽';
    if (!Array.isArray(b.transactions)) b.transactions = [];
    if (!Array.isArray(b.loans)) b.loans = [];
    if (!Array.isArray(b.recurring)) b.recurring = [];
    if (!Array.isArray(b.seenTags)) b.seenTags = [];
    if (!Array.isArray(b.seenRpBalances)) b.seenRpBalances = [];
    // Операции, проведённые самим телефоном и ещё не подтверждённые ролевой:
    // [{amount, at}], at — длина чата на момент операции. Модель узнаёт о них
    // из журнала и повторяет — инфоблоком или тегом tel:bank. Без зачёта одна
    // покупка списывалась бы дважды.
    if (!Array.isArray(b.syncQueue)) b.syncQueue = [];
    // Какой тег какую операцию породил: [{key, src, txId, amount, synced}].
    // Нужно, чтобы отменить списание, когда вариант ответа ушёл свайпом.
    if (!Array.isArray(b.txKeys)) b.txKeys = [];
    if (fresh) saveMeta();
    return b;
}

// «Активен» ли банк — используется, чтобы не инжектить его правила зря
export function bankActive() {
    if (!isPhoneAppInstalled('bank')) return false;
    const b = getBank();
    return b.balance !== 0 || b.transactions.length > 0 || b.loans.length > 0 || b.recurring.length > 0;
}

export function setCurrency(sym) {
    return convertCurrency(sym);
}

// Курс задаёт пользователь для своего мира; отсутствие курса сохраняет числа.
// Сначала готовим весь пересчёт, чтобы ошибка не оставила половину банка в старой валюте.
export function convertCurrency(newSymRaw, { factor = null } = {}) {
    const b = getBank();
    const from = normalizeCurrency(b.currency);
    const to = normalizeCurrency(newSymRaw);
    if (from === to) { b.currency = to; saveMeta(); return { converted: false, from, to }; }
    if (factor === null) { b.currency = to; markCurrencyHistory(b); saveMeta(); return { converted: false, from, to }; }
    if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('Invalid currency factor');
    const updates = [];
    const scale = 10 ** (currencyInfo(to).minor ?? 2);
    function prepare(object, key) {
        const value = (Number(object[key]) || 0) * factor;
        if (!Number.isFinite(value) || Math.abs(value) * scale > Number.MAX_SAFE_INTEGER) throw new RangeError('Currency amount overflow');
        updates.push([object, key, roundCurrency(value, to)]);
    }
    prepare(b, 'balance');
    if (Number.isFinite(b.openingBalance)) prepare(b, 'openingBalance');
    if (Number.isFinite(b.lastRpBalance)) prepare(b, 'lastRpBalance');
    function preparePayment(payment) {
        if (!payment) return;
        if (Number.isFinite(payment.principal)) prepare(payment, 'principal');
    }
    for (const t of b.transactions) { prepare(t, 'amount'); preparePayment(t.loanPayment); }
    for (const l of b.loans) for (const key of ['principal', 'remaining', 'monthly', 'propertyPrice', 'downPayment']) {
        if (Number.isFinite(l[key])) prepare(l, key);
    }
    for (const loan of b.loans) if (Number.isFinite(loan.lastPayment?.amount)) prepare(loan.lastPayment, 'amount');
    for (const r of b.recurring) prepare(r, 'amount');
    for (const r of b.syncQueue) prepare(r, 'amount');
    for (const r of b.txKeys) { prepare(r, 'amount'); preparePayment(r.loanPayment); }
    const shop = getMeta().shop;
    if (shop) {
        for (const cat of Object.values(shop.cats || {})) {
            for (const store of (cat.stores || [])) for (const item of (store.items || [])) prepare(item, 'price');
        }
        for (const order of (shop.orders || [])) prepare(order, 'price');
    }
    for (const [object, key, value] of updates) object[key] = value;
    b.currency = to;
    markCurrencyHistory(b);
    saveMeta();
    return { converted: true, from, to };
}

// ── Форматирование денег ──
export function roundMoney(n) { return roundCurrency(n, getBank().currency); }
export function fmtMoney(n) {
    return formatCurrency(n, getBank().currency);
}

// ── Транзакции (amount: + доход / − трата) ──
// historyOnly — записать операцию, НЕ трогая баланс. Нужно, когда сумму уже
// учёл инфоблок ролевой: иначе одна покупка списывалась дважды — сначала
// дельтой инфоблока, потом ещё раз транзакцией из тега.
export function addTransaction({ amount, label, category = 'другое', silent = false, historyOnly = false, payer = 'user', loanId = '', appPurchase = false }) {
    const b = getBank();
    const amt = roundMoney(amount);
    if (!Number.isFinite(amt) || !amt) return null;
    const external = amt < 0 && payer !== 'user';
    const tx = {
        id: genId(), amount: amt,
        label: String(label || '').slice(0, 60) || (amt > 0 ? 'Поступление' : 'Списание'),
        category: String(category || 'другое').slice(0, 24), time: Date.now(),
    };
    if (external) { tx.external = true; tx.payer = String(payer).slice(0, 80); }
    if (loanId) tx.loanId = loanId;
    if (historyOnly) tx.synced = true;   // при удалении баланс не откатываем
    b.transactions.unshift(tx);
    if (!historyOnly) {
        if (!external) b.balance = roundMoney(b.balance + amt);
        // Ждём, что ролевая повторит эту же операцию своими средствами
        b.syncQueue.push({ amount: amt, at: chatLen(), txId:tx.id, ...(external ? {external:true, payer:tx.payer, label:tx.label, reconcilePurchase:appPurchase} : {}), ...(loanId ? {loanId} : {}) });
        if (b.syncQueue.length > 20) b.syncQueue = b.syncQueue.slice(-20);
    }
    if (b.transactions.length > 200) b.transactions = b.transactions.slice(0, 200);
    if (!silent) saveMeta();
    return tx;
}

export function deleteTransaction(id) {
    const b = getBank();
    const tx = b.transactions.find(t => t.id === id);
    if (!tx) return;
    undoBankTransaction(b, tx);
    b.transactions = b.transactions.filter(t => t.id !== id);
    b.txKeys = b.txKeys.filter(record => record.txId !== id);
    saveMeta();
}

// ── Кредиты (аннуитет) ──
export function calculateLoan({ amount, months, rate = 0.18 }) {
    const principal = roundMoney(amount);
    const term = Math.max(1, Math.min(480, parseInt(months) || 12));
    const annual = Math.max(0, Math.min(2, Number(rate) || 0));
    const mr = annual / 12;
    const monthly = principal > 0 ? Math.max(roundMoney(principal * mr) + currencyStep(getBank().currency), roundMoney(mr > 0
        ? principal * mr / -Math.expm1(-term * Math.log1p(mr))
        : principal / term)) : 0;
    const projected = loanSchedule({remaining:principal, monthly, rate:annual, months:term, interestModel:'annuity'});
    return { principal, months:term, rate:annual, monthly, total:roundMoney(projected.reduce((sum,row)=>sum+row.payment,0)) };
}

export function takeLoan({ name, amount, months, rate = 0.18, day = 1, kind = 'personal', propertyPrice = 0, downPayment = 0 }) {
    const b = getBank();
    const mortgage = kind === 'mortgage';
    const price = Math.max(0, roundMoney(propertyPrice));
    const down = Math.max(0, roundMoney(downPayment));
    if (mortgage && (!price || down >= price)) return null;
    const { principal, months:m, rate:r, monthly } = calculateLoan({amount:mortgage ? price-down : amount, months, rate});
    if (principal <= 0) return null;
    const loan = {
        id: genId(), name: String(name || (mortgage ? 'Ипотека' : 'Кредит')).slice(0, 40),
        principal, remaining:principal, monthly, months:m, rate:r,
        kind:['personal','auto','installment','mortgage'].includes(kind) ? kind : 'personal',
        interestModel:'annuity', paymentsMade:0,
        ...(mortgage ? {propertyPrice:price, downPayment:down} : {}),
        day: Math.max(1, Math.min(31, parseInt(day) || 1)),
        opened: Date.now(), paidOff: false, lastPaidMonth: null,
    };
    b.loans.unshift(loan);
    if (mortgage) {
        if (down) addTransaction({ amount:-down, label:`Взнос за жильё «${loan.name}»`, category:'жильё', silent:true });
    } else {
        addTransaction({ amount:principal, label:`Кредит «${loan.name}»`, category:'кредит', silent:true });
    }
    saveMeta();
    return loan;
}

export function loanPaymentAmount(loan) {
    if (!loan || loan.paidOff) return 0;
    const interest = loan.interestModel === 'annuity' ? roundMoney(loan.remaining * loan.rate / 12) : 0;
    const final = loan.interestModel === 'annuity' && (loan.paymentsMade || 0) >= loan.months - 1;
    return final ? roundMoney(loan.remaining + interest) : Math.min(roundMoney(loan.remaining + interest), loan.monthly);
}

export function loanSchedule(loan) {
    const rows = [];
    let remaining = loan.remaining;
    const cap = Math.max(1, Math.min(480, (loan.months || 480) - (loan.paymentsMade || 0)));
    for (let month = 1; remaining > 0 && month <= cap; month++) {
        const interest = loan.interestModel === 'annuity' ? roundMoney(remaining * loan.rate / 12) : 0;
        const payment = month === cap ? roundMoney(remaining + interest) : Math.min(roundMoney(remaining + interest), loan.monthly);
        const principal = roundMoney(payment - interest);
        if (principal <= 0) break;
        remaining = roundMoney(Math.max(0, remaining - principal));
        rows.push({ month, payment, interest, principal, remaining });
    }
    return rows;
}

export function payLoanInstallment(id, customAmount = null) {
    const tx = recordLoanPayment({ loanId:id, mode:customAmount === null ? 'installment' : 'early', amount:Number(customAmount), payer:'user' });
    if (!tx) return false;
    saveMeta();
    return true;
}

function findLoan(event, bank = getBank()) {
    if (event.loanId) return bank.loans.find(loan => loan.id === event.loanId) || null;
    const name = String(event.loanName || '').trim().toLocaleLowerCase();
    const matching = bank.loans.filter(loan => String(loan.name).trim().toLocaleLowerCase() === name);
    return name && matching.length === 1 ? matching[0] : null;
}

function debtPaymentAmount(event, loan) {
    if (!loan || loan.paidOff) return 0;
    if (event.mode === 'full') return roundMoney(loan.remaining);
    if (event.mode === 'installment') return loanPaymentAmount(loan);
    return Math.min(loan.remaining, roundMoney(event.amount));
}

function recordLoanPayment(event) {
    const b = getBank();
    const loan = findLoan(event, b);
    if (!loan || loan.paidOff) return;
    const early = event.mode !== 'installment';
    if (!early && loan.lastPaidMonth === currentYearMonth()) return false;
    const pay = debtPaymentAmount(event, loan);
    if (!Number.isFinite(pay) || pay <= 0) return;
    const interest = !early && loan.interestModel === 'annuity' ? roundMoney(loan.remaining * loan.rate / 12) : 0;
    const principal = Math.min(loan.remaining, Math.max(0, roundMoney(pay - interest)));
    const tx = addTransaction({ amount:-pay, label:`${event.mode === 'full' ? 'Полное погашение' : early ? 'Досрочное погашение' : 'Платёж'} · ${loan.name}`, category:loan.kind === 'mortgage' ? 'ипотека' : 'кредит', payer:event.payer, loanId:loan.id, silent:true });
    if (!tx) return;
    tx.loanPayment = { id:loan.id, principal, installment:!early, month:currentYearMonth(), previousMonth:loan.lastPaidMonth };
    loan.remaining = roundMoney(Math.max(0, loan.remaining - principal));
    if (!early) { loan.lastPaidMonth = currentYearMonth(); loan.paymentsMade = (loan.paymentsMade || 0) + 1; }
    if (loan.remaining <= 0) { loan.remaining = 0; loan.paidOff = true; }
    loan.lastPayment = { txId:tx.id, amount:pay, payer:event.payer, time:tx.time };
    return tx;
}

function undoBankTransaction(bank, tx) {
    if (!tx.synced && !tx.external) bank.balance = roundMoney(bank.balance - tx.amount);
    bank.syncQueue = bank.syncQueue.filter(item => item.txId !== tx.id);
    const effect = tx.loanPayment;
    const loan = effect && bank.loans.find(item => item.id === effect.id);
    if (!loan) return;
    loan.remaining = roundMoney(Math.min(loan.principal, loan.remaining + effect.principal));
    loan.paidOff = loan.remaining <= 0;
    if (effect.installment) {
        loan.paymentsMade = Math.max(0, (loan.paymentsMade || 0) - 1);
        if (loan.lastPaidMonth === effect.month) {
            const other = bank.transactions.find(item => item.id !== tx.id && item.loanPayment?.id === loan.id && item.loanPayment.installment && item.loanPayment.month === effect.month);
            if (!other) loan.lastPaidMonth = effect.previousMonth;
        }
    }
    if (loan.lastPayment?.txId === tx.id) {
        const previous = bank.transactions.find(item => item.id !== tx.id && item.loanPayment?.id === loan.id);
        loan.lastPayment = previous ? {txId:previous.id, amount:Math.abs(previous.amount), payer:previous.payer || 'user', time:previous.time} : null;
    }
}

export function deleteLoan(id) {
    const b = getBank();
    b.loans = b.loans.filter(l => l.id !== id);
    saveMeta();
}

export function totalDebt() {
    return getBank().loans.reduce((s, l) => s + (l.remaining || 0), 0);
}
export function monthlyLoanPayment() {
    return getBank().loans.reduce((s, l) => s + loanPaymentAmount(l), 0);
}

// ── Обязательные (регулярные) платежи ──
export function addRecurring({ name, amount, day, category = 'подписка', repeat = 'monthly', date = '' }) {
    const b = getBank();
    const sum = Math.abs(roundMoney(amount));
    if (!sum) return null;
    if (repeat === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const rec = {
        id: genId(), name: String(name || '').slice(0, 40) || 'Платёж',
        amount:sum, repeat:repeat === 'once' ? 'once' : 'monthly', date,
        day: Math.max(1, Math.min(31, parseInt(day) || 1)),
        category: String(category || 'подписка').slice(0, 24), lastPaidMonth: null,
    };
    b.recurring.push(rec);
    saveMeta();
    return rec;
}

export function delRecurring(id) {
    const b = getBank();
    b.recurring = b.recurring.filter(r => r.id !== id);
    saveMeta();
}

function currentYearMonth() {
    const rp = getRpDateTime();
    if (rp) return `${rp.year}-${String(rp.month).padStart(2, '0')}`;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function currentDay() {
    const rp = getRpDateTime();
    return rp ? rp.day : new Date().getDate();
}

function dueDay(day) {
    const [year,month] = currentYearMonth().split('-').map(Number);
    return Math.min(Math.max(1, Number(day) || 1), new Date(year,month,0).getDate());
}

export function bankToday() {
    return `${currentYearMonth()}-${String(currentDay()).padStart(2,'0')}`;
}

export function billPaid(bill) {
    return bill.repeat === 'once' ? !!bill.paidAt : bill.lastPaidMonth === currentYearMonth();
}

export function loanPaidThisMonth(loan) { return loan.lastPaidMonth === currentYearMonth(); }

export function payRecurring(id) {
    const b = getBank();
    const rec = b.recurring.find(r => r.id === id);
    if (!rec || billPaid(rec)) return false;
    addTransaction({ amount: -rec.amount, label: rec.name, category: rec.category, silent: true });
    rec.lastPaidMonth = currentYearMonth();
    if (rec.repeat === 'once') rec.paidAt = Date.now();
    saveMeta();
    return true;
}

export function monthlyObligations() {
    return getBank().recurring.reduce((s, r) => s + (r.repeat === 'once' ? 0 : r.amount), 0);
}

// Напоминания: обязательные платежи И кредиты, срок которых в этом RP-месяце
// наступил и ещё не оплачены. Нормализованный вид:
// { kind:'bill'|'loan', id, name, amount, day, overdue }
export function getBankReminders() {
    if (!isPhoneAppInstalled('bank')) return [];
    const b = getBank();
    const day = currentDay();
    const ym = currentYearMonth();
    const due = [];
    for (const r of b.recurring) {
        if (billPaid(r)) continue;
        if (r.repeat === 'once') {
            if (r.date && r.date <= bankToday()) due.push({ kind:'bill', id:r.id, name:r.name, amount:r.amount, day:Number(r.date.slice(-2)), date:r.date, overdue:r.date < bankToday() });
            continue;
        }
        const dueDate = dueDay(r.day);
        if (day >= dueDate) due.push({ kind: 'bill', id: r.id, name: r.name, amount: r.amount, day:dueDate, overdue:day > dueDate });
    }
    for (const l of b.loans) {
        if (l.paidOff || !l.day) continue;
        if (l.lastPaidMonth === ym) continue;
        const dueDate = dueDay(l.day);
        if (day >= dueDate) due.push({ kind: 'loan', id: l.id, name: l.name, amount:loanPaymentAmount(l), day:dueDate, overdue:day > dueDate });
    }
    return due;
}

// ── Траты по категориям (для сводки) ──
export function spendingByCategory(limit = 6) {
    const b = getBank();
    const map = new Map();
    for (const t of b.transactions) {
        if (t.external) continue;
        if (t.amount >= 0) continue; // только расходы
        map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount));
    }
    return [...map.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, limit).map(([category, sum]) => ({ category, sum }));
}

export function incomeExpenseTotals() {
    const b = getBank();
    let income = 0, expense = 0;
    for (const t of b.transactions) {
        if (t.external) continue;
        if (t.amount >= 0) income += t.amount; else expense += -t.amount;
    }
    return { income, expense };
}

// ── Сводка для инжекции в ролевую (короткая строка, только если банк активен) ──
export function getBankSummaryLine() {
    if (!bankActive()) return '';
    const b = getBank();
    const parts = [`bank balance ${fmtMoney(b.balance)}`];
    const debt = totalDebt();
    if (debt > 0) parts.push(`loan debt ${fmtMoney(debt)} (monthly ${fmtMoney(monthlyLoanPayment())})`);
    const loans = b.loans.filter(loan => !loan.paidOff && loan.remaining > 0);
    if (loans.length) parts.push('active debts ' + JSON.stringify(loans.map(loan => ({id:loan.id, name:loan.name, kind:loan.kind, remaining:loan.remaining, installment:loanPaymentAmount(loan)}))));
    const sponsored = b.transactions.filter(tx => tx.external).slice(0, 3);
    if (sponsored.length) parts.push('already recorded third-party payments (do not replay) ' + JSON.stringify(sponsored.map(tx => ({label:tx.label, amount:Math.abs(tx.amount), payer:tx.payer}))));
    const oblig = monthlyObligations();
    if (oblig > 0) parts.push(`fixed monthly bills ${fmtMoney(oblig)}`);
    if (b.balance < 0) parts.push('they are in overdraft / broke');
    return `- Their bank/finances: ${parts.join(', ')}. The SOURCE and details are private — characters only sense whether they can afford things. If you maintain a money/balance tracker in an infoblock, do NOT copy this number into it — change your tracker ONLY by story events (the app reconciles the two by itself; this number already includes phone-app income the story hasn't shown).`;
}

// ── Одна компактная строка-правило для директивы (инжектится только если банк активен) ──
export function bankInjectRule() {
    if (!bankActive()) return '';
    const debts = getBank().loans.some(loan => !loan.paidOff && loan.remaining > 0);
    return `[BANK] Currency: ${normalizeCurrency(getBank().currency)}; numbers without thousands separators. Only completed NEW operations, once each; never promises or app-recorded payments. Money actually received by {{user}}: <!--tel:bank:{"amount":500,"label":"transfer"}-->. Purchases: <!--tel:bank:{"action":"purchase","amount":500,"payer":"user","label":"coffee"}-->. payer="user" ONLY for {{user}}’s own money; if another character pays the seller directly, payer is their canonical name and {{user}}’s account stays unchanged. Do not also emit a debit or credit for that gift, and do not deduct it from {{user}}’s money tracker. A bank SMS and its tag describe ONE operation.${debts ? ' Direct debt payment: <!--tel:bank:{"action":"loan_payment","loanId":"exact active debt id","mode":"full","payer":"CharacterName"}-->. full closes that debt; early + positive amount reduces principal; installment pays its scheduled monthly amount. Use payer="user" only if the owner pays. Another character paying the lender directly changes debt, NOT the owner’s balance: no extra bank balance tag. Use only the listed debt id; knowledge of these private details must come from the story.' : ''}`;
}

// Calls and Direct use JSON responses rather than hidden chat tags. Only the
// speaking character can spend their own money through these private replies.
export function privateBankPrompt(actor) {
    if (!bankActive()) return '';
    const b = getBank(), debts = b.loans.filter(loan => !loan.paidOff && loan.remaining > 0);
    return `PAYMENTS: Optional JSON field "bank":[], only for NEW payments actually completed by ${JSON.stringify(actor)} in this reply using their own money. Promises/willingness are not completed payments. Empty/absent if none; never replay a prior payment or an app-recorded order. Direct purchase for the user: {"action":"purchase","amount":500,"label":"coffee"}; transfer received on the user's card: {"amount":500,"label":"transfer"}. The speaker's direct purchases do NOT reduce the user's money or create a transfer. Currency ${normalizeCurrency(b.currency)}, numeric amounts without separators.${debts.length ? ' Direct lender payment: {"action":"loan_payment","loanId":"exact id","mode":"full"}; full closes, early plus amount reduces principal, installment pays the monthly amount. Private app debt state (NOT automatic character knowledge): ' + JSON.stringify(debts.map(loan => ({id:loan.id,name:loan.name,kind:loan.kind,remaining:loan.remaining}))) + '. Only act on debt the speaker knows about from the conversation/story.' : ''}`;
}

export function applyPrivateBankEvents(values, source, actor) {
    if (!isPhoneAppInstalled('bank')) return 0;
    if (!Array.isArray(values) || !source) return 0;
    let userName = '';
    try { userName = SillyTavern.getContext()?.name1 || ''; } catch { /* Optional context. */ }
    const payer = paymentPayer(actor, userName);
    if (!payer || payer === 'user') return 0;
    const b = getBank(), seen = new Set(b.seenTags);
    let added = 0, changed = false;
    for (const [index, value] of values.slice(0, 5).entries()) {
        const key = 'bp:' + source + ':' + index;
        if (seen.has(key) || !value || typeof value !== 'object') continue;
        const event = bankEvent({...value, payer}, userName);
        if (!event) continue;
        seen.add(key); b.seenTags.push(key); changed = true;
        const tx = applyBankEvent(event, chatLen());
        if (tx) { rememberTx(b, key, 'private:' + source, tx); added++; }
    }
    if (changed) saveMeta();
    return added;
}

// ── Харвест тегов tel:bank + банковских СМС из чата ──
const BANK_TAG_RE = /<!--\s*tel:bank:(\{[\s\S]*?\})\s*-->/gi;
const SMS_TAG_RE = /<!--\s*tel:sms:(\{[\s\S]*?\})\s*-->/gi;

// «Банковская» смс: отправитель похож на банк, текст содержит сумму и слово-направление.
// Страховка на случай, когда модель написала смс от банка, но забыла tel:bank тег
// («смс о списании пришла, а в банке пусто»).
// ДВУЯЗЫЧНЫЕ (RU/EN): банковские смс в английских ролевых тоже двигают баланс
const BANK_SENDER_RE = /банк|bank|сбер|тинькофф|tinkoff|альфа|втб|райффайзен|газпром|озон|уралсиб|росбанк|совкомбанк|мтс[\s-]?банк|900|chase|wells\s?fargo|citibank|barclays|hsbc|revolut|monzo|n26|paypal/i;
const SPEND_RE = /списан|списание|покупк|оплат|платил|платеж|платёж|перевод\s+(отправлен|выполнен)|снятие|снят[оы]|аренда|штраф|комисси|debit(?:ed)?|charged|purchase|payment\s+(?:of|to|sent)|withdraw(?:al|n)?|spent|sent\s+to|\bfee\b/i;
const INCOME_RE = /пополнен|пополнение|зачислен|поступлени|входящий\s+перевод|перевод\s+от(?![а-яё])|получен\s+перевод|возврат|зарплат|начислен|кэшбэк|cashback|credit(?:ed)?|deposit(?:ed)?|received|refund(?:ed)?|salary|payout|incoming\s+transfer|transfer\s+from|paid\s+(?:to\s+you|in)\b/i;
const PENDING_BANK_RE=/ожидается|ожидает\s+(?:подтверждения|зачисления|обработки)|в\s+обработке|запланирован|будет\s+(?:полностью\s+)?(?:зачислен|перевед[её]н|списан|погашен|закрыт|оплачен)|не\s+(?:полностью\s+)?(?:получен|выполнен|прош[её]л|зачислен|погашен|закрыт|оплачен)|отмен[её]н|отклон[её]н|недостаточно\s+средств|pending|scheduled|processing|declined|cancelled|canceled|failed|not\s+(?:yet\s+)?(?:paid|repaid|closed)|will\s+(?:be\s+)?(?:paid|repaid|closed)/i;
// Сумма: «1 500 ₽ / 500 руб / 12.50$» ИЛИ валюта-префикс «$500 / €1,200.50»
const AMOUNT_NUMBER = "\\d+(?:[ \\u00a0\\u202f,.'’]\\d{3})*(?:[.,]\\d{1,4})?";
function bankAmountRegex() {
    const info = currencyInfo(getBank().currency);
    const aliases = { RUB:['₽','руб','рублей','рубля','rubles','ruble'], USD:['$','dollars','dollar'], EUR:['€','евро','euros','euro'], GBP:['£','pounds','pound'], JPY:['¥','￥','иен','иены','иена','yen'], CNY:['¥','元','юаней','юаня','юань','yuan','renminbi'], KRW:['₩','вон','воны','вона','won'], KPW:['₩','вон','воны','вона','won'] };
    const tokens = [...new Set([info.code, info.symbol, ...(aliases[info.code] || [])])].sort((a,b) => b.length-a.length).map(reEscape).join('|');
    return new RegExp(`(${AMOUNT_NUMBER})\\s*(?:${tokens})(?![a-zа-яё])|(?:${tokens})\\s*(${AMOUNT_NUMBER})`, 'i');
}

function parseMoneyNumber(raw) {
    let text = String(raw).replace(/[\s'’]/g, '');
    const last = Math.max(text.lastIndexOf(','), text.lastIndexOf('.'));
    if (last >= 0) {
        const tail = text.length - last - 1;
        const minor = currencyInfo(getBank().currency).minor ?? 2;
        const decimal = tail !== 3 || minor === 3 || (text.includes(',') && text.includes('.'));
        text = decimal ? text.slice(0,last).replace(/[.,]/g,'') + '.' + text.slice(last+1) : text.replace(/[.,]/g,'');
    }
    return roundMoney(Number(text));
}

function reEscape(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Некоторые RP-пресеты держат актуальные деньги персонажей не в tel:bank,
// а в служебном инфоблоке внутри <think><!--sims ... -->. Это не операция,
// поэтому значение синхронизируется как абсолютный баланс и применяется
// только один раз для конкретного сообщения/значения.
function parseRpBalance(raw, userName) {
    const name = String(userName || '').trim();
    if (!name || !raw) return null;
    const text = String(raw).replace(/&nbsp;/gi, ' ').replace(/[\u00a0\u202f]/g, ' ');
    const n = reEscape(name);
    const amount = `([+-]?${AMOUNT_NUMBER})`;
    // Слово-маркер денег двуязычное: деньги / money / balance / cash
    const moneyWord = '(?:деньги|money|balance|cash)';
    const patterns = [
        new RegExp(`(?:💰|💵|${moneyWord}\\s*[:—-]?)\\s*${n}\\s*:\\s*${amount}`, 'i'),
        new RegExp(`${n}\\s*:\\s*(?:💰|💵|${moneyWord}\\s*[:—-]?)\\s*${amount}`, 'i'),
        // (?:^|не-буква) вместо lookbehind — старые Safari кидают SyntaxError на (?<!)
        new RegExp(`${n}[\\s\\S]{0,320}?(?:^|[^а-яёa-z])${moneyWord}\\s*[:—-]?\\s*${amount}`, 'i'),
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const value = parseMoneyNumber(match[1]);
        if (Number.isFinite(value)) return { value, index: match.index || 0 };
    }
    return null;
}

function chatLen() {
    try { return SillyTavern.getContext()?.chat?.length || 0; } catch (e) { return 0; }
}

function currencyMessageKey(msg, index) {
    return String(msg?.send_date || msg?.extra?.gen_id || `index:${index}`);
}

function bankMessageTime(msg) {
    return typeof msg?.send_date === 'number' ? msg.send_date : Date.parse(msg?.send_date) || 0;
}

function markCurrencyHistory(bank) {
    try {
        const chat = SillyTavern.getContext()?.chat || [];
        bank.currencyHistory = [...new Set(chat.map(currencyMessageKey))];
    } catch { bank.currencyHistory = []; }
}

// Ищет в очереди телефонную операцию ровно на ту же сумму неподалёку.
// Нашли — операция уже проведена, ролевая лишь описывает её: транзакция
// пишется без повторного списания.
// Запись НЕ удаляем, а помечаем: ту же трату следом покажет и инфоблок,
// и его дельту тоже нужно чем-то гасить. Из очереди всё уйдёт на сверке.
function takeSynced(b, amount, msgIndex, loanId = '') {
    const amt = roundMoney(amount);
    if (!amt || !Array.isArray(b.syncQueue) || !b.syncQueue.length) return false;
    // Окно по ходам: старые покупки не должны глотать законные траты ролевой.
    // x.at <= msgIndex обязательно: записи «из будущего» — те же теги,
    // что обработаны этим же проходом (их at = chatLen() > msgIndex), и два
    // одинаковых перевода в одном сообщении съедали друг друга
    const hit = b.syncQueue.find(x => !x.confirmed
        && !x.external
        && (!loanId || x.loanId === loanId)
        && roundMoney(x.amount) === amt
        && (Number(x.at) || 0) <= msgIndex
        && (msgIndex - (Number(x.at) || 0)) <= 10);
    if (!hit) return false;
    hit.confirmed = true;
    return true;
}

function takeSponsoredPurchase(bank, event, msgIndex) {
    if (event.amount >= 0) return false;
    const normalize = value => String(value || '').toLocaleLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const label = normalize(event.label);
    if (label.length < 4) return false;
    const item = bank.syncQueue.find(record => record.external && record.reconcilePurchase && !record.loanId && !record.confirmed
        && roundMoney(record.amount) === roundMoney(event.amount)
        && (!event.external || event.payer === record.payer)
        && record.at <= msgIndex && msgIndex - record.at <= 10
        && normalize(record.label).length >= 4
        && (label.includes(normalize(record.label)) || normalize(record.label).includes(label)));
    if (!item) return false;
    item.confirmed = true;
    return true;
}

// Свайп: у каждого варианта ответа свой send_date, поэтому его теги телефон
// считает новыми операциями, а списание прошлого варианта остаётся на балансе.
// Отличить свайп от сдвига индексов (юзер удалила сообщение) можно надёжно:
// send_date всех вариантов ЭТОГО ответа лежат в его swipe_info. Откатываем
// только то, что породил другой вариант того же сообщения.
function revertSwipedAway(b, msg, currentSrc) {
    const info = Array.isArray(msg?.swipe_info) ? msg.swipe_info : null;
    if (!info || info.length < 2 || !b.txKeys.length) return 0;
    const others = new Set(
        info.map(x => String(x?.send_date ?? '')).filter(x => x && x !== currentSrc),
    );
    if (!others.size) return 0;
    let reverted = 0;
    const keep = b.txKeys.filter(rec => !others.has(rec.src));
    // Reverse payment order so two instalments/early payments restore correctly.
    for (const rec of [...b.txKeys].reverse()) {
        if (!others.has(rec.src)) continue;
        const tx = b.transactions.find(t => t.id === rec.txId);
        if (tx) {
            undoBankTransaction(b, tx);
            b.transactions = b.transactions.filter(t => t.id !== tx.id);
        } else if (rec.loanPayment) {
            undoBankTransaction(b, {id:rec.txId, amount:rec.amount, synced:rec.synced, external:rec.external, loanPayment:rec.loanPayment});
        }
        // Ключ забываем: вернётся этот свайп — операция посчитается заново
        b.seenTags = b.seenTags.filter(k => k !== rec.key);
        reverted++;
    }
    b.txKeys = keep;
    return reverted;
}

function rememberTx(b, key, src, tx) {
    if (!tx) return;
    b.txKeys.push({ key, src, txId: tx.id, amount: tx.amount, synced: !!tx.synced, ...(tx.external ? {external:true} : {}), ...(tx.loanPayment ? {loanPayment:tx.loanPayment} : {}) });
    if (b.txKeys.length > 300) b.txKeys = b.txKeys.slice(-300);
}

function parseBankSms(smsJson, userName = '', sentAt = 0) {
    const from = String(smsJson.from || '');
    const text = String(smsJson.text || '');
    if (!BANK_SENDER_RE.test(from) && !BANK_SENDER_RE.test(text.slice(0, 40))) return null;
    if (typeof smsJson.to === 'string' && smsJson.to.trim() && !/^[+\d\s()-]+$/.test(smsJson.to)
        && paymentPayer(smsJson.to, userName) !== 'user') return null;
    if(PENDING_BANK_RE.test(text))return null;
    const amountRe = bankAmountRegex();
    const am = text.match(amountRe);
    // Banks often omit the currency: «Перевод 500.000 от Веры».
    // A bare number is eligible only directly after an operation label.
    const bare = text.match(new RegExp(`(?:перевод|зачисление|пополнение|поступление|списание|transfer|deposit|credit|debit)(?:\\s+(?:на\\s+сумму|of))?\\s*[:+−-]?\\s*(${AMOUNT_NUMBER})(?![\\d.,])`, 'i'));
    // am[1] — суффиксная валюта (1 500 ₽), am[2] — префиксная ($500).
    const bareStart=bare?bare.index+bare[0].lastIndexOf(bare[1]):-1;
    // Prefer the operation amount over a later «available balance» amount.
    const selected=am&&(!bare||am.index<=bareStart&&am.index+am[0].length>=bareStart+bare[1].length)?am:null;
    const amountText=selected?(selected[1]||selected[2]):bare?.[1];
    const amount = parseMoneyNumber(amountText || '');
    const payer = smsPaymentPayer(smsJson, userName);
    // A lender's notice of a third-party repayment is not an account debit.
    // Only resolve an unambiguous existing debt; never guess among two loans.
    if (/кредит|ипотек|рассрочк|\bloan\b|mortgage/i.test(text)
        && /погаш|закрыт|плат[её]ж|repaid|paid\s+off|payment/i.test(text)) {
        if (/обещ|планиру|намерен|собира[её]|предлага|предлож|заявк|\bwill\b|going\s+to|promis|plans?\s+to/i.test(text)) return null;
        if (/(?:свой|свою|своего|своей|его|е[её]|их|his|her|their)(?:\s+own)?\s+(?:автокредит|кредит|ипотек|рассрочк|loan|mortgage)/i.test(text)
            && !/ваш|your|за\s+вас/i.test(text)) return null;
        const b = getBank();
        let loan = smsJson.loanId || smsJson.loanName ? findLoan(smsJson, b) : null;
        if (!smsJson.loanId && !smsJson.loanName) {
            const type = /ипотек|mortgage/i.test(text) ? 'mortgage' : /автокредит|auto\s+loan/i.test(text) ? 'auto' : /рассрочк/i.test(text) ? 'installment' : 'credit';
            const candidates = b.loans.filter(item => type === 'credit' ? item.kind !== 'mortgage' : item.kind === type);
            const quoted = text.match(/(?:автокредит|кредит|ипотек[а-яё]*|рассрочк[а-яё]*|loan|mortgage)\s*[«"]([^»"]+)[»"]/i);
            if (quoted && !candidates.some(item => String(item.name).toLocaleLowerCase() === quoted[1].toLocaleLowerCase())) return null;
            const named = candidates.filter(item => String(item.name || '').length >= 3 && text.toLocaleLowerCase().includes(String(item.name).toLocaleLowerCase()));
            if (named.length === 1) loan = named[0];
            else if (!named.length && candidates.length === 1) loan = candidates[0];
        }
        if (!loan || !payer || sentAt && loan.opened && sentAt + 1000 < loan.opened) return null;
        const full = /закрыт(?:а|о|ы)?(?=$|[^a-zа-яё])|полностью\s+погашен(?:а|о|ы)?(?=$|[^a-zа-яё])|погашен(?:а|о|ы)?\s+полностью|fully\s+(?:repaid|paid|settled)|paid\s+off/i.test(text);
        const paid = text.match(new RegExp(`(?:плат[её]ж|погашени[ея]|внесено|вн[её]с|внесла|оплачено|payment|paid)[^\\d.;!?\\n]{0,45}(${AMOUNT_NUMBER})`, 'i'));
        const paidAmount = paid ? parseMoneyNumber(paid[1]) : amount;
        if (!full && !paid && /остаток|осталось|доступно|balance|remaining/i.test(text.slice(Math.max(0, (selected?.index || 0) - 35), selected?.index || 0))) return null;
        const monthly = /ежемесяч|очередн|monthly|instalment|installment/i.test(text);
        if (!full && monthly && paidAmount !== loanPaymentAmount(loan)) return null;
        return bankEvent({ action:'loan_payment', loanId:loan.id, mode:full ? 'full' : monthly ? 'installment' : 'early', amount:paidAmount, payer }, userName);
    }
    if (!amount) return null;
    // Сначала ДОХОД: «Salary paid» / «Payment received» — это приход,
    // хотя слова paid/payment есть и в расходном списке
    let sign = 0;
    // Removing only the amount joins direction words separated by the sum:
    // «Перевод 500.000 от ...» → «Перевод от ...».
    const directionText=text.replace(selected?selected[0]:amountText,' ').replace(/\s+/g,' ').trim();
    if (INCOME_RE.test(text)||INCOME_RE.test(directionText)) sign = 1;
    else if (SPEND_RE.test(text)||SPEND_RE.test(directionText)) sign = -1;
    if (!sign) return null;
    // Метка: кусок текста без суммы, коротко
    const label = directionText.slice(0, 50) || (sign < 0 ? 'Списание (смс банка)' : 'Пополнение (смс банка)');
    return bankEvent({ amount:sign * amount, label, category:'смс банка', payer:payer || 'user' }, userName);
}

function applyBankEvent(event, msgIndex) {
    const b = getBank();
    if (event.action === 'loan_payment') {
        const loan = findLoan(event, b), amount = debtPaymentAmount(event, loan);
        if (!loan || !amount) return null;
        // The user may already have paid through the bank app.
        if (event.payer === 'user' && takeSynced(b, -amount, msgIndex, loan.id)) return null;
        return recordLoanPayment(event);
    }
    if (takeSponsoredPurchase(b, event, msgIndex)) return null;
    return addTransaction({ ...event, label:event.label || 'Из ролевой', silent:true,
        historyOnly:!event.external && takeSynced(b, event.amount, msgIndex) });
}

export function harvestBankTags() {
    if (!isPhoneAppInstalled('bank')) return 0;
    const b = getBank();
    let chat = [];
    let userName = '';
    try {
        const ctx = SillyTavern.getContext();
        chat = ctx?.chat || [];
        userName = ctx?.name1 || '';
    } catch (e) { return 0; }
    let added = 0;
    let balanceSynced = 0;
    const seen = new Set(b.seenTags);
    const previousSeen = new Set(b.seenTags);
    const currencyHistory = new Set(b.currencyHistory || []);
    const seenRpBalances = new Set(b.seenRpBalances);
    let migratedLegacyKeys = false;
    // База для дельта-синка инфоблока: последнее известное значение
    let rpBaseline = Number.isFinite(b.lastRpBalance) ? b.lastRpBalance : null;

    // Пре-скан: суммы всех tel:bank тегов по индексам сообщений. Модель часто
    // оформляет ОДИН перевод дважды — тегом в RP-сообщении и банковской смс в
    // соседнем (призрак-ответ). Смс-эвристика пропускает сумму, если рядом
    // (±8 сообщений) уже есть tel:bank с той же суммой — иначе дубль операции.
    const bankAmts = [];
    for (let i = 0; i < chat.length; i++) {
        const mm = chat[i];
        const sourceText = getPhoneMessageText(mm, i);
        if (!mm || !/tel:bank/i.test(sourceText)) continue;
        const tt = stripThink(sourceText);
        BANK_TAG_RE.lastIndex = 0;
        let bm;
        while ((bm = BANK_TAG_RE.exec(tt)) !== null) {
            const event = bankEvent(safeJson(bm[1]), userName);
            if (!event) continue;
            const loan = event.action === 'loan_payment' ? findLoan(event, b) : null;
            const a = loan ? -debtPaymentAmount(event, loan) : roundMoney(event.amount);
            if (a || loan) bankAmts.push({ i, a, loanId:loan?.id, mode:event.mode });
        }
    }
    const nearBankEvent = (i, event) => {
        const loan = event.action === 'loan_payment' ? findLoan(event, b) : null;
        const amount = loan ? -debtPaymentAmount(event, loan) : roundMoney(event.amount);
        return bankAmts.some(item => Math.abs(item.i - i) <= 8 && (loan
            ? item.loanId === loan.id && (event.mode === 'full' && item.mode === 'full' || amount && item.a === amount)
            : amount && item.a === amount));
    };

    for (let msgIndex = 0; msgIndex < chat.length; msgIndex++) {
        // История до смены единицы уже учтена; её числа нельзя прочесть в новой валюте.
        if (currencyHistory.has(currencyMessageKey(chat[msgIndex], msgIndex))) continue;
        const msg = chat[msgIndex];
        const sourceText = getPhoneMessageText(msg, msgIndex);
        if (!msg || !sourceText) continue;
        // is_system пропускаем, НО наши смс-призраки (is_system на 1.5с) содержат
        // tel:sms банка — их тоже сканируем
        if (msg.is_system && !/tel:(bank|sms)/i.test(sourceText)) continue;
        const text = stripThink(sourceText);
        const containsBankTag = /<!--\s*tel:bank:/i.test(text);
        const msgSrc = String(msg.send_date || msg.extra?.gen_id || msgIndex);
        // Сначала снимаем то, что принёс прошлый вариант этого же ответа
        if (revertSwipedAway(b, msg, msgSrc)) {
            seen.clear();
            for (const k of b.seenTags) seen.add(k);
            balanceSynced++;
        }
        const smsEvents = !containsBankTag ? [...text.matchAll(/<!--\s*tel:sms:(\{[\s\S]*?\})\s*-->/gi)].map(match => {
            const data = safeJson(match[1]); return data ? parseBankSms(data, userName, bankMessageTime(msg)) : null;
        }).filter(Boolean) : [];
        const authoritative = containsBankTag || smsEvents.length > 0;

        // RP-инфоблок намеренно читаем из исходного сообщения: stripThink
        // правильно скрывает reasoning от тегов телефона, но именно там sims-
        // пресеты публикуют текущий баланс пользователя.
        // ВАЖНО: применяем ДЕЛЬТУ инфоблока, а не абсолют. Инфоблок пресета не
        // знает о телефонных операциях (казино/магазин) — абсолютная сверка
        // ЗАТИРАЛА выигрыши. Дельта = деньги, изменившиеся В РОЛЕВОЙ; телефонные
        // операции живут поверх. Первая встреченная величина — инициализация.
        if (!msg.is_user) {
            const rpBalance = parseRpBalance(msg.mes, userName);
            if (rpBalance) {
                const source = String(msg.send_date || msg.extra?.gen_id || msgIndex);
                const brBase = `br${hash32(`${userName}:${rpBalance.value}`)}:${source}`;
                // КЛЮЧ БЕЗ позиции: rpBalance.index съезжал при любой правке
                // текста (реакции/фото в теги) → СТАРОЕ значение инфоблока
                // переприменялось как свежая дельта и баланс улетал
                const h = `${brBase}#1`;
                // Миграция с позиционных ключей: то же значение в том же
                // сообщении уже обрабатывалось — только переключаем ключ
                if (!seenRpBalances.has(h) && b.seenRpBalances.some(k => k.startsWith(brBase + ':'))) {
                    seenRpBalances.add(h);
                    b.seenRpBalances.push(h);
                    rpBaseline = rpBalance.value;
                }
                if (!seenRpBalances.has(h)) {
                    seenRpBalances.add(h);
                    b.seenRpBalances.push(h);
                    if (authoritative) {
                        // Explicit payments own this reply's accounting. Still
                        // advance the tracker baseline, so a sponsored gift is
                        // not charged later via the next infoblock's delta.
                    } else if (rpBaseline === null) {
                        // самый первый инфоблок за всю историю — абсолютная инициализация
                        b.balance = rpBalance.value;
                        b.syncQueue = [];
                    } else {
                        let delta = roundMoney(rpBalance.value - rpBaseline);
                        // Зачёт телефонных операций: покупку в магазине телефон уже
                        // списал, а модель, прочитав журнал, вычла её и у себя —
                        // применять дельту целиком значит списать дважды.
                        // Гасим только совпадающую по знаку часть: если модель трату
                        // не заметила (дельта нулевая или обратная), баланс не трогаем.
                        const pending = b.syncQueue.reduce((sum, x) => sum + (x.external ? 0 : Number(x.amount) || 0), 0);
                        if (delta && pending && Math.sign(delta) === Math.sign(pending)) {
                            const comp = Math.sign(delta) * Math.min(Math.abs(delta), Math.abs(pending));
                            delta -= comp;
                        }
                        if (delta) b.balance = roundMoney(b.balance + delta);
                        b.syncQueue = [];   // инфоблок — точка сверки, копить дальше нечего
                    }
                    balanceSynced++;
                }
                // База — ПОСЛЕДНЕЕ виденное значение инфоблока (и для уже
                // обработанных: миграция со старой абсолютной схемы)
                rpBaseline = rpBalance.value;
            }
        }

        // 1) Явные теги tel:bank (протокол)
        // КЛЮЧ: контент + сообщение + ПОРЯДКОВЫЙ номер одинаковых тегов в сообщении.
        // НЕ позиция m.index: позиция съезжает при любой правке текста (реакции,
        // фото в теги, чужие расширения) — и та же операция дублировалась.
        const occ = {};
        const loanEvents = [...text.matchAll(/<!--\s*tel:bank:(\{[\s\S]*?\})\s*-->/gi)]
            .map(match => bankEvent(safeJson(match[1]), userName)).filter(event => event?.action === 'loan_payment')
            .map(event => ({...event, debit:roundMoney(-debtPaymentAmount(event, findLoan(event, b)))}));
        const appliedLoans = new Set();
        let hasBankTag = false;
        BANK_TAG_RE.lastIndex = 0;
        let m;
        while ((m = BANK_TAG_RE.exec(text)) !== null) {
            hasBankTag = true;
            const legacyH = 'bk' + hash32(m[1]);
            const base = `${legacyH}:${msgSrc}`;
            const n = occ[base] = (occ[base] || 0) + 1;
            const h = `${base}#${n}`;
            const event = bankEvent(safeJson(m[1]), userName);
            let repeatedLoan = false;
            if (event?.action === 'loan_payment') {
                const signature = JSON.stringify([event.loanId, event.loanName, event.mode, event.mode === 'early' ? event.amount : '', event.payer]);
                repeatedLoan = appliedLoans.has(signature);
                appliedLoans.add(signature);
            }
            if (seen.has(h)) continue;
            // Миграция с позиционных ключей (base:<позиция>): первый экземпляр
            // контента в этом сообщении считаем уже обработанным
            if (n === 1 && b.seenTags.some(k => k.startsWith(base + ':'))) {
                seen.add(h); b.seenTags.push(h);
                continue;
            }
            // v1.13 and older keyed only by JSON content. Convert those keys in
            // place without replaying the current history; future identical
            // transactions then remain valid independent events.
            if (seen.has(legacyH)) {
                seen.add(h); b.seenTags.push(h); migratedLegacyKeys = true;
                continue;
            }
            seen.add(h); b.seenTags.push(h);
            if (!event || repeatedLoan) continue;
            if (event.action === 'balance' && /кредит|ипотек|погаш|loan|mortgage/i.test(event.label)
                && loanEvents.some(payment => Math.abs(payment.debit) === Math.abs(roundMoney(event.amount)))) {
                continue; // A separate debit must not repeat a direct loan payment.
            }
            const tx = applyBankEvent(event, msgIndex);
            if (!tx) continue;
            rememberTx(b, h, msgSrc, tx);
            added++;
        }

        // 2) Смс от банка без тега (страховка). Если в сообщении УЖЕ был tel:bank —
        // не парсим смс того же сообщения (иначе одна операция задвоится).
        if (!hasBankTag) {
            SMS_TAG_RE.lastIndex = 0;
            while ((m = SMS_TAG_RE.exec(text)) !== null) {
                const legacyH = 'bs' + hash32(m[1]);
                const base = `${legacyH}:${msgSrc}`;
                const n = occ[base] = (occ[base] || 0) + 1;
                const h = `${base}#${n}`;
                if (seen.has(h)) continue;
                if (n === 1 && b.seenTags.some(k => k.startsWith(base + ':'))) {
                    seen.add(h); b.seenTags.push(h);
                    continue;
                }
                if (seen.has(legacyH)) {
                    seen.add(h); b.seenTags.push(h); migratedLegacyKeys = true;
                    continue;
                }
                const j = safeJson(m[1]);
                if (!j) continue;
                const event = parseBankSms(j, userName, bankMessageTime(msg));
                if (!event) continue;
                // Кросс-сообщенческий анти-дубль: та же сумма уже оформлена
                // тегом tel:bank поблизости → смс лишь уведомление, помечаем
                // обработанной и НЕ добавляем операцию
                if (nearBankEvent(msgIndex, event)) {
                    seen.add(h); b.seenTags.push(h);
                    continue;
                }
                seen.add(h); b.seenTags.push(h);
                const smsTx = applyBankEvent(event, msgIndex);
                if (!smsTx) continue;
                rememberTx(b, h, msgSrc, smsTx);
                added++;
            }
        }
    }
    if (migratedLegacyKeys) {
        b.seenTags = b.seenTags.filter(k => !/^(?:bk|bs)-?\d+$/.test(k));
    }
    if (b.seenTags.length > 400) {
        b.seenTags = b.seenTags.slice(-400);
        // Ключи и записи живут парой: без чистки txKeys раздувался бы вечно
        const alive = new Set(b.seenTags);
        b.txKeys = b.txKeys.filter(r => alive.has(r.key));
    }
    if (b.seenRpBalances.length > 120) b.seenRpBalances = b.seenRpBalances.slice(-120);
    // Персистим базу дельта-синка (в т.ч. миграция со старой абсолютной схемы:
    // уже-обработанные значения инфоблока становятся базой без применения)
    if (rpBaseline !== null && b.lastRpBalance !== rpBaseline) {
        b.lastRpBalance = rpBaseline;
        balanceSynced++;
    }
    if (added || balanceSynced || migratedLegacyKeys || b.seenTags.some(key => !previousSeen.has(key))) saveMeta();
    // Наружу — только НАСТОЯЩИЕ операции (тост «N операций из ролевой»);
    // тихая сверка баланса из инфоблока уведомление не дёргает.
    return added;
}

// Кол-во напоминаний (для бейджа приложения)
export function bankBadgeCount() {
    if (!isPhoneAppInstalled('bank')) return 0;
    return getBankReminders().length;
}
