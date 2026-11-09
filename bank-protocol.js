// Compact, explicit payment protocol. A purchase paid by somebody else is
// still a recorded operation, but never a debit from the phone owner's account.
export function paymentPayer(value, userName = '') {
    if (typeof value !== 'string') return 'user';
    const name = value.trim().replace(/[\r\n<>]/g, '').slice(0, 80);
    const normalized = name.toLocaleLowerCase().replace(/ё/g, 'е');
    const user = String(userName).trim().toLocaleLowerCase().replace(/ё/g, 'е');
    if (!name || normalized === user || /^(?:user|\{\{user\}\}|me|myself|you|я|ты|пользователь|мой сч[её]т)$/i.test(name)) return 'user';
    return name;
}

export function bankEvent(data, userName = '') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.status && !/^(?:completed|confirmed|paid|success|settled|оплачено|выполнено)$/i.test(String(data.status))) return null;
    const action = String(data.action || 'balance').toLowerCase();
    const payer = paymentPayer(data.payer, userName);
    const amount = Number(data.amount);
    const label = String(data.label || data.text || '').slice(0, 120);
    if (action === 'loan_payment') {
        const loanId = typeof data.loanId === 'string' ? data.loanId.trim() : '';
        const loanName = typeof data.loanName === 'string' ? data.loanName.trim() : '';
        const mode = String(data.mode || 'early').toLowerCase();
        if ((!loanId && !loanName) || !['full', 'early', 'installment'].includes(mode)) return null;
        // A missing payer must not accidentally charge the owner for a gift.
        if (typeof data.payer !== 'string' || !data.payer.trim()) return null;
        if (mode === 'early' && (!Number.isFinite(amount) || amount <= 0)) return null;
        return { action, loanId, loanName, mode, amount, payer, label };
    }
    if (!['balance', 'purchase'].includes(action) || !Number.isFinite(amount) || !amount) return null;
    const signed = action === 'purchase' ? -Math.abs(amount) : amount;
    return { action, amount:signed, payer, external:signed < 0 && payer !== 'user', label, category:String(data.category || (action === 'purchase' ? 'покупки' : 'ролевая')).slice(0, 24) };
}

export function smsPaymentPayer(data, userName = '') {
    if (typeof data?.payer === 'string' && data.payer.trim()) return paymentPayer(data.payer, userName);
    const text = String(data?.text || '');
    const marked = text.match(/(?:плательщик|payer|paid\s+by|за\s+сч[её]т(?:\s+средств)?)(?:\s*[:—-]\s*|\s+)([^.;\n\d]{1,80})/i);
    const afterVerb = text.match(/(?:[Оо]платил[аи]?|[Зз]аплатил[аи]?|[Пп]огасил[аи]?|[Зз]акрыл[аи]?|[Оо]плачен[аоы]?|[Пп]огашен[аоы]?|[Зз]акрыт[аоы]?)(?:\s+полностью)?\s+(?:за\s+вас\s+)?([A-ZА-ЯЁ][a-zа-яё-]+(?:\s+[A-ZА-ЯЁ][a-zа-яё-]+){0,2})/u);
    const beforeVerb = text.match(/([A-ZА-ЯЁ][a-zа-яё-]+(?:\s+[A-ZА-ЯЁ][a-zа-яё-]+){0,2})\s+(?:оплатил[аи]?|заплатил[аи]?|погасил[аи]?|закрыл[аи]?)/u);
    const value = marked?.[1] || afterVerb?.[1] || beforeVerb?.[1];
    if (value) {
        const name = value.split(/[,;]|\s+(?:за|для|на\s+сумму|сумма|с\s+ваш\S*|без\s+списания|из\s+своих|оплат\S*|погас\S*|закрыл\S*|from|for|using)(?=\s|$|[,;])/i)[0].trim();
        if (/^(?:вас|вами|ваш(?:их|его|ей)\s+(?:средств|денег|сч[её]та|карт)|your\s+(?:money|funds|account|card))$/i.test(name)) return 'user';
        if (/\p{L}/u.test(name) && !/^(?:полностью|успешно|покупк[а-яё]*|плат[её]ж[а-яё]*|кредит[а-яё]*|ипотек[а-яё]*|он|она|они|сам|сама|наличн[а-яё]*|карт[а-яё]*|full|successfully|purchase|payment|loan|mortgage|he|she|they|cash|(?:debit |credit )?card)$/i.test(name)) return paymentPayer(name, userName);
    }
    if (!/без\s+списания|without\s+(?:charging|debiting)/i.test(text)
        && /(?:списан[оы]?|оплачен[аоы]?|плат[её]ж)[\s\S]{0,50}(?:с\s+ваш(?:его|ей)\s+(?:сч[её]та|карт)|from\s+your\s+account)|с\s+ваш(?:его|ей)\s+(?:сч[её]та|карт)[\s\S]{0,50}списан|your\s+(?:account|card)\s+(?:was\s+)?(?:charged|debited)/i.test(text)) return 'user';
    return null;
}
