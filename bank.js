
import { getMeta, saveMeta, getRpDateTime, stripThink, getPhoneMessageText } from './state.js';
import { normalizeCurrency, currencyInfo, roundCurrency, formatCurrency, currencyStep } from './currencies.js';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function hash32(str) {
    let h = 0; const s = String(str);
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(h);
}

function safeJson(raw) {
    try { return JSON.parse(raw); } catch (e) {
        try { return JSON.parse(String(raw).replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')); } catch (e2) { return null; }
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
    for (const t of b.transactions) prepare(t, 'amount');
    for (const l of b.loans) for (const key of ['principal', 'remaining', 'monthly', 'propertyPrice', 'downPayment']) {
        if (Number.isFinite(l[key])) prepare(l, key);
    }
    for (const r of b.recurring) prepare(r, 'amount');
    for (const r of b.syncQueue) prepare(r, 'amount');
    for (const r of b.txKeys) prepare(r, 'amount');
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
export function addTransaction({ amount, label, category = 'другое', silent = false, historyOnly = false }) {
    const b = getBank();
    const amt = roundMoney(amount);
    if (!amt) return null;
    const tx = {
        id: genId(), amount: amt,
        label: String(label || '').slice(0, 60) || (amt > 0 ? 'Поступление' : 'Списание'),
        category: String(category || 'другое').slice(0, 24), time: Date.now(),
    };
    if (historyOnly) tx.synced = true;   // при удалении баланс не откатываем
    b.transactions.unshift(tx);
    if (!historyOnly) {
        b.balance = roundMoney(b.balance + amt);
        // Ждём, что ролевая повторит эту же операцию своими средствами
        b.syncQueue.push({ amount: amt, at: chatLen() });
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
    if (!tx.synced) b.balance = roundMoney(b.balance - tx.amount); // откат баланса (кроме записей из инфоблока)
    b.transactions = b.transactions.filter(t => t.id !== id);
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
    const b = getBank();
    const loan = b.loans.find(l => l.id === id);
    if (!loan || loan.paidOff) return;
    const early = customAmount !== null;
    if (!early && loan.lastPaidMonth === currentYearMonth()) return false;
    const pay = early ? Math.min(loan.remaining, roundMoney(customAmount)) : loanPaymentAmount(loan);
    if (pay <= 0) return;
    const interest = !early && loan.interestModel === 'annuity' ? roundMoney(loan.remaining * loan.rate / 12) : 0;
    addTransaction({ amount:-pay, label:`${early ? 'Досрочное погашение' : 'Платёж'} · ${loan.name}`, category:loan.kind === 'mortgage' ? 'ипотека' : 'кредит', silent:true });
    loan.remaining = roundMoney(loan.remaining - Math.max(0, pay - interest));
    if (!early) { loan.lastPaidMonth = currentYearMonth(); loan.paymentsMade = (loan.paymentsMade || 0) + 1; }
    if (loan.remaining <= 0) { loan.remaining = 0; loan.paidOff = true; }
    saveMeta();
    return true;
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
        if (t.amount >= 0) continue; // только расходы
        map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount));
    }
    return [...map.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, limit).map(([category, sum]) => ({ category, sum }));
}

export function incomeExpenseTotals() {
    const b = getBank();
    let income = 0, expense = 0;
    for (const t of b.transactions) {
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
    const homes = b.loans.filter(l=>l.kind === 'mortgage' && !l.paidOff);
    if (homes.length) parts.push(`mortgaged homes: ${homes.map(l=>l.name).join(', ').slice(0,120)}`);
    const oblig = monthlyObligations();
    if (oblig > 0) parts.push(`fixed monthly bills ${fmtMoney(oblig)}`);
    if (b.balance < 0) parts.push('they are in overdraft / broke');
    return `- Their bank/finances: ${parts.join(', ')}. The SOURCE and details are private — characters only sense whether they can afford things. If you maintain a money/balance tracker in an infoblock, do NOT copy this number into it — change your tracker ONLY by story events (the app reconciles the two by itself; this number already includes phone-app income the story hasn't shown).`;
}

// ── Одна компактная строка-правило для директивы (инжектится только если банк активен) ──
export function bankInjectRule() {
    if (!bankActive()) return '';
    return `[BANK] Account currency: ${normalizeCurrency(getBank().currency)}. Each actual change to {{user}}’s money in this reply: <!--tel:bank:{"amount":-500,"label":"purchase"}-->. Numeric amount in the account currency: negative spent, positive received; one tag per new transaction. A bank notification SMS about a real debit/credit needs the matching bank tag too. Exclude hypothetical transactions, other people’s money and operations already recorded by the app.`;
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
const INCOME_RE = /пополнен|пополнение|зачислен|поступлени|перевод\s+от(?![а-яё])|получен\s+перевод|возврат|зарплат|начислен|кэшбэк|cashback|credit(?:ed)?|deposit(?:ed)?|received|refund(?:ed)?|salary|payout|incoming\s+transfer|transfer\s+from|paid\s+(?:to\s+you|in)\b/i;
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
function takeSynced(b, amount, msgIndex) {
    const amt = roundMoney(amount);
    if (!amt || !Array.isArray(b.syncQueue) || !b.syncQueue.length) return false;
    // Окно по ходам: старые покупки не должны глотать законные траты ролевой.
    // x.at <= msgIndex обязательно: записи «из будущего» — те же теги,
    // что обработаны этим же проходом (их at = chatLen() > msgIndex), и два
    // одинаковых перевода в одном сообщении съедали друг друга
    const hit = b.syncQueue.find(x => !x.confirmed
        && roundMoney(x.amount) === amt
        && (Number(x.at) || 0) <= msgIndex
        && (msgIndex - (Number(x.at) || 0)) <= 10);
    if (!hit) return false;
    hit.confirmed = true;
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
    const keep = [];
    for (const rec of b.txKeys) {
        if (!others.has(rec.src)) { keep.push(rec); continue; }
        const tx = b.transactions.find(t => t.id === rec.txId);
        if (tx) {
            if (!tx.synced) b.balance = roundMoney(b.balance - tx.amount);
            b.transactions = b.transactions.filter(t => t.id !== tx.id);
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
    b.txKeys.push({ key, src, txId: tx.id, amount: tx.amount, synced: !!tx.synced });
    if (b.txKeys.length > 300) b.txKeys = b.txKeys.slice(-300);
}

function parseBankSms(smsJson) {
    const from = String(smsJson.from || '');
    const text = String(smsJson.text || '');
    if (!BANK_SENDER_RE.test(from) && !BANK_SENDER_RE.test(text.slice(0, 40))) return null;
    const amountRe = bankAmountRegex();
    const am = text.match(amountRe);
    if (!am) return null;
    // am[1] — суффиксная валюта (1 500 ₽), am[2] — префиксная ($500).
    const amount = parseMoneyNumber(am[1] || am[2] || '');
    if (!amount) return null;
    // Сначала ДОХОД: «Salary paid» / «Payment received» — это приход,
    // хотя слова paid/payment есть и в расходном списке
    let sign = 0;
    if (INCOME_RE.test(text)) sign = 1;
    else if (SPEND_RE.test(text)) sign = -1;
    if (!sign) return null;
    // Метка: кусок текста без суммы, коротко
    const label = text.replace(amountRe, '').replace(/\s+/g, ' ').trim().slice(0, 50) || (sign < 0 ? 'Списание (смс банка)' : 'Пополнение (смс банка)');
    return { amount: sign * amount, label, category: 'смс банка' };
}

export function harvestBankTags() {
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
        const sourceText = getPhoneMessageText(mm);
        if (!mm || !/tel:bank/i.test(sourceText)) continue;
        const tt = stripThink(sourceText);
        BANK_TAG_RE.lastIndex = 0;
        let bm;
        while ((bm = BANK_TAG_RE.exec(tt)) !== null) {
            const j = safeJson(bm[1]);
            const a = Math.abs(roundMoney(j?.amount));
            if (a) bankAmts.push({ i, a });
        }
    }
    const nearBankAmt = (i, a) => bankAmts.some(x => x.a === a && Math.abs(x.i - i) <= 8);

    for (let msgIndex = 0; msgIndex < chat.length; msgIndex++) {
        // История до смены единицы уже учтена; её числа нельзя прочесть в новой валюте.
        if (currencyHistory.has(currencyMessageKey(chat[msgIndex], msgIndex))) continue;
        const msg = chat[msgIndex];
        const sourceText = getPhoneMessageText(msg);
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

        // RP-инфоблок намеренно читаем из исходного сообщения: stripThink
        // правильно скрывает reasoning от тегов телефона, но именно там sims-
        // пресеты публикуют текущий баланс пользователя.
        // ВАЖНО: применяем ДЕЛЬТУ инфоблока, а не абсолют. Инфоблок пресета не
        // знает о телефонных операциях (казино/магазин) — абсолютная сверка
        // ЗАТИРАЛА выигрыши. Дельта = деньги, изменившиеся В РОЛЕВОЙ; телефонные
        // операции живут поверх. Первая встреченная величина — инициализация.
        if (!msg.is_user && !containsBankTag) {
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
                    if (rpBaseline === null) {
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
                        const pending = b.syncQueue.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
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
        let hasBankTag = false;
        BANK_TAG_RE.lastIndex = 0;
        let m;
        while ((m = BANK_TAG_RE.exec(text)) !== null) {
            hasBankTag = true;
            const legacyH = 'bk' + hash32(m[1]);
            const base = `${legacyH}:${msgSrc}`;
            const n = occ[base] = (occ[base] || 0) + 1;
            const h = `${base}#${n}`;
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
            const j = safeJson(m[1]);
            if (!j || typeof j.amount === 'undefined' || !Number(j.amount)) continue;
            const tx = addTransaction({
                amount: Number(j.amount) || 0,
                label: j.label || j.text || 'Из ролевой',
                category: j.category || 'ролевая',
                silent: true,
                // Ту же сумму телефон мог списать сам (заказ в магазине,
                // ставка в казино), а модель повторила её тегом — тогда это
                // не новая операция, а её описание
                historyOnly: takeSynced(b, Number(j.amount) || 0, msgIndex),
            });
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
                const tx = parseBankSms(j);
                if (!tx) continue;
                // Кросс-сообщенческий анти-дубль: та же сумма уже оформлена
                // тегом tel:bank поблизости → смс лишь уведомление, помечаем
                // обработанной и НЕ добавляем операцию
                if (nearBankAmt(msgIndex, Math.abs(tx.amount))) {
                    seen.add(h); b.seenTags.push(h);
                    continue;
                }
                seen.add(h); b.seenTags.push(h);
                const smsTx = addTransaction({ ...tx, silent: true, historyOnly: takeSynced(b, tx.amount, msgIndex) });
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
    if (added || balanceSynced || migratedLegacyKeys) saveMeta();
    // Наружу — только НАСТОЯЩИЕ операции (тост «N операций из ролевой»);
    // тихая сверка баланса из инфоблока уведомление не дёргает.
    return added;
}

// Кол-во напоминаний (для бейджа приложения)
export function bankBadgeCount() {
    return getBankReminders().length;
}
