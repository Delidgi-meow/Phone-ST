import { getMeta, saveMeta } from './state.js';
import { getSocial } from './social.js';
import { getBank, setUserBalance, harvestBankTags } from './bank.js';
import { normalizeCurrency } from './currencies.js';

export function userValueSnapshot() {
    const root = getMeta(), social = getSocial(), bank = getBank();
    return {
        currency:normalizeCurrency(bank.currency), channelId:root.channels?.mine?.id || null,
        balance:bank.balance, twitter:social.socialProfiles.twitter.followers,
        instagram:social.socialProfiles.instagram.followers, onlyfans:social.ofSubs,
        telegram:root.channels?.mine ? root.channels.mine.subs : null,
    };
}

export function parseUserValue(value, key) {
    if (typeof value !== 'number' && typeof value !== 'string') throw new RangeError('Укажи число.');
    const text=String(value).trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new RangeError('Укажи число без букв; разделитель дробной части — точка или запятая.');
    const number=Number(text);
    if (!Number.isFinite(number) || Math.abs(number)>1e12 || key!=='balance'&&(!Number.isInteger(number)||number<0)) throw new RangeError('Подписчики — целое число от 0 до 1 000 000 000 000. Для баланса допускается минус.');
    return number;
}

export function applyUserValues(values, baseline, owner) {
    if (owner!==getMeta()) throw new Error('Чат изменился. Открой настройки заново.');
    const updates={};
    for (const key of ['balance','twitter','instagram','onlyfans','telegram']) {
        if (!Object.hasOwn(values,key) || values[key]===null) continue;
        const number=parseUserValue(values[key],key);
        if (number!==baseline[key]) updates[key]=number;
    }
    if (Object.hasOwn(updates,'balance')) harvestBankTags();
    const current=userValueSnapshot();
    for (const key of Object.keys(updates)) {
        if (current[key]!==baseline[key] || key==='balance'&&current.currency!==baseline.currency
            || key==='telegram'&&(!current.channelId||current.channelId!==baseline.channelId)) throw new Error('Данные уже изменились. Открой настройки заново, чтобы не затереть обновление.');
    }
    const social=getSocial();
    if (Object.hasOwn(updates,'balance')) setUserBalance(updates.balance);
    if (Object.hasOwn(updates,'twitter')) social.socialProfiles.twitter.followers=updates.twitter;
    if (Object.hasOwn(updates,'instagram')) social.socialProfiles.instagram.followers=updates.instagram;
    if (Object.hasOwn(updates,'onlyfans')) social.ofSubs=updates.onlyfans;
    if (Object.hasOwn(updates,'telegram')) { owner.channels.mine.subs=updates.telegram; owner.channels.mine.subsDelta=0; }
    if (Object.keys(updates).length) saveMeta();
    return updates;
}
