// Казино: слоты и рулетка на деньги банка. Вся математика локальная и честно
// казиношная (дом всегда в плюсе на дистанции) — никакого LLM.

import { getMeta, saveMeta } from './state.js';
import { getBank, addTransaction } from './bank.js';

function getCasino() {
    const m = getMeta();
    if (!m.casino || typeof m.casino !== 'object') m.casino = {};
    const c = m.casino;
    if (!Number.isFinite(c.spins)) c.spins = 0;
    if (!Number.isFinite(c.won)) c.won = 0;
    if (!Number.isFinite(c.lost)) c.lost = 0;
    if (!Number.isFinite(c.bestWin)) c.bestWin = 0;
    if (!Number.isFinite(c.wagered)) c.wagered = c.lost || 0;
    return c;
}
export function casinoStats() { return getCasino(); }

function settle(bet, win, label) {
    const c = getCasino();
    c.spins++;
    addTransaction({ amount: -bet, label, category: 'казино', silent: true });
    if (win > 0) {
        addTransaction({ amount: win, label: `Выигрыш: ${label}`, category: 'казино', silent: true });
        c.won += win;
        if (win > c.bestWin) c.bestWin = win;
    }
    c.wagered = (c.wagered || 0) + bet;   // всего поставлено (не «проиграно»)
    c.lost = c.wagered;                    // старое имя оставлено для прежних чатов
    saveMeta();
}

export function canBet(bet) {
    const b = getBank();
    return Number.isFinite(bet) && bet > 0 && b.balance >= bet;
}

// ── Слоты: 3 барабана, взвешенные символы ──
// Отдача 89%: дом в плюсе, но джекпоты случаются. Считается как
// Σ p(комбинация) × множитель — выплаты подобраны под эту сумму, менять их
// на глаз нельзя: пара лимонов выпадает в каждом пятом спине, и любая
// выплата за неё уводила автомат в минус (было 115% — казино дарило деньги).
const SLOT_SYMBOLS = [
    { icon: 'fa-lemon', w: 30, three: 4, two: 0 },
    { icon: 'fa-heart', w: 25, three: 6, two: 1 },
    { icon: 'fa-star', w: 20, three: 10, two: 2 },
    { icon: 'fa-bolt', w: 14, three: 20, two: 2 },
    { icon: 'fa-gem', w: 8, three: 50, two: 4 },
    { icon: 'fa-crown', w: 3, three: 200, two: 8 },
];
const SLOT_TOTAL_W = SLOT_SYMBOLS.reduce((s, x) => s + x.w, 0);
function slotSymbol() {
    let r = Math.random() * SLOT_TOTAL_W;
    for (const s of SLOT_SYMBOLS) { r -= s.w; if (r <= 0) return s; }
    return SLOT_SYMBOLS[0];
}

export function spinSlots(bet) {
    bet = Math.round(bet);
    if (!canBet(bet)) return null;
    const reels = [slotSymbol(), slotSymbol(), slotSymbol()];
    let mult = 0;
    if (reels[0].icon === reels[1].icon && reels[1].icon === reels[2].icon) mult = reels[0].three;
    else if (reels[0].icon === reels[1].icon || reels[1].icon === reels[2].icon || reels[0].icon === reels[2].icon) {
        const dup = reels[0].icon === reels[1].icon || reels[0].icon === reels[2].icon ? reels[0] : reels[1];
        mult = dup.two;
    }
    const win = Math.round(bet * mult);
    settle(bet, win, 'Слоты');
    return { reels: reels.map(r => r.icon), mult, win, bet };
}

// ── Рулетка: красное/чёрное (×2, зеро — дом) или число 0-36 (×36) ──
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function spinRoulette(bet, betType, betNumber = null) {
    bet = Math.round(bet);
    if (!canBet(bet)) return null;
    const result = Math.floor(Math.random() * 37); // 0-36
    const color = result === 0 ? 'green' : (RED_NUMBERS.has(result) ? 'red' : 'black');
    let win = 0;
    if (betType === 'red' && color === 'red') win = bet * 2;
    else if (betType === 'black' && color === 'black') win = bet * 2;
    else if (betType === 'num' && Number(betNumber) === result) win = bet * 36;
    settle(bet, win, 'Рулетка');
    return { result, color, win, bet };
}
