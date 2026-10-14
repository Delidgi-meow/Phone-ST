// ISO 4217, SIX List One, published 2026-09-17.
// https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
// XTS (test) and XXX (no currency) are excluded. No exchange-rate data.
export const CURRENCY_SOURCE_DATE = '2026-09-17';
const SPECIAL_CODES = new Set('BOV CHE CHW CLF COU MXV USN UYI UYW XAD XAG XAU XBA XBB XBC XBD XDR XPD XPT XSU XUA'.split(' '));
const LEGACY = { '₽':'RUB', 'р':'RUB', 'руб':'RUB', '$':'USD', '€':'EUR', '£':'GBP', '¥':'JPY', '￥':'JPY', 'yen':'JPY', '₩':'KRW', '元':'CNY', 'юань':'CNY', 'иена':'JPY', 'вона':'KRW' };
const RU_NAMES = { JPY:'Японская иена', CNY:'Китайский юань', KRW:'Южнокорейская вона', KPW:'Северокорейская вона', XCG:'Карибский гульден', ZWG:'Зимбабвийское золото', XAD:'Арабский расчётный динар', VED:'Венесуэльский боливар (цифровой)', VES:'Венесуэльский боливар' };
const SYMBOLS = { RUB:'₽', USD:'$', EUR:'€', GBP:'£', JPY:'¥', CNY:'CN¥', KRW:'₩', KPW:'KPW', INR:'₹', TRY:'₺', UAH:'₴', KZT:'₸', VND:'₫', THB:'฿', PHP:'₱', ILS:'₪', TWD:'NT$', HKD:'HK$', SGD:'S$', CAD:'CA$', AUD:'A$', NZD:'NZ$', BRL:'R$', MXN:'MX$', ZAR:'R' };

export function normalizeCurrency(value) {
    const text = String(value ?? '').trim().replace(/[\u0000-\u001f<>]/g, '').slice(0, 12);
    return LEGACY[text.toLowerCase()] || (/^[a-z]{3}$/i.test(text) ? text.toUpperCase() : text) || 'RUB';
}

let catalog;
export function getCurrencies() {
    if (catalog) return catalog;
    let names;
    try { names = new Intl.DisplayNames(['ru'], { type:'currency' }); } catch { /* English fallback below. */ }
    catalog = ISO_CURRENCIES.map(([code, minor, englishName]) => {
        let localized;
        try { localized = names?.of(code); } catch { /* Unknown code in an older browser. */ }
        const name = RU_NAMES[code] || (localized && localized !== code ? localized : englishName);
        return { code, minor, name:name.charAt(0).toUpperCase() + name.slice(1), englishName, symbol:SYMBOLS[code] || code, special:SPECIAL_CODES.has(code) };
    }).sort((a,b) => Number(a.special) - Number(b.special) || a.name.localeCompare(b.name, 'ru'));
    return catalog;
}

export function currencyInfo(value) {
    const code = normalizeCurrency(value);
    return getCurrencies().find(item => item.code === code) || { code, name:code, symbol:code, minor:0, special:false };
}

export function currencyStep(value) {
    return 10 ** -(currencyInfo(value).minor ?? 2);
}

export function roundCurrency(value, currency) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    const scale = 10 ** (currencyInfo(currency).minor ?? 2);
    return Math.round((amount + Math.sign(amount) * Number.EPSILON) * scale) / scale;
}

const formatters = new Map();
export function formatCurrency(value, currency) {
    const info = currencyInfo(currency), amount = roundCurrency(value, info.code);
    const digits = info.minor ?? 2;
    if (!formatters.has(digits)) formatters.set(digits, new Intl.NumberFormat('ru-RU', { maximumFractionDigits:digits }));
    const number = formatters.get(digits).format(Math.abs(amount));
    return `${amount < 0 ? '−' : ''}${number} ${info.symbol}`;
}
const ISO_CURRENCIES = [
  [
    "AED",
    2,
    "UAE Dirham"
  ],
  [
    "AFN",
    2,
    "Afghani"
  ],
  [
    "ALL",
    2,
    "Lek"
  ],
  [
    "AMD",
    2,
    "Armenian Dram"
  ],
  [
    "AOA",
    2,
    "Kwanza"
  ],
  [
    "ARS",
    2,
    "Argentine Peso"
  ],
  [
    "AUD",
    2,
    "Australian Dollar"
  ],
  [
    "AWG",
    2,
    "Aruban Florin"
  ],
  [
    "AZN",
    2,
    "Azerbaijan Manat"
  ],
  [
    "BAM",
    2,
    "Convertible Mark"
  ],
  [
    "BBD",
    2,
    "Barbados Dollar"
  ],
  [
    "BDT",
    2,
    "Taka"
  ],
  [
    "BHD",
    3,
    "Bahraini Dinar"
  ],
  [
    "BIF",
    0,
    "Burundi Franc"
  ],
  [
    "BMD",
    2,
    "Bermudian Dollar"
  ],
  [
    "BND",
    2,
    "Brunei Dollar"
  ],
  [
    "BOB",
    2,
    "Boliviano"
  ],
  [
    "BOV",
    2,
    "Mvdol"
  ],
  [
    "BRL",
    2,
    "Brazilian Real"
  ],
  [
    "BSD",
    2,
    "Bahamian Dollar"
  ],
  [
    "BTN",
    2,
    "Ngultrum"
  ],
  [
    "BWP",
    2,
    "Pula"
  ],
  [
    "BYN",
    2,
    "Belarusian Ruble"
  ],
  [
    "BZD",
    2,
    "Belize Dollar"
  ],
  [
    "CAD",
    2,
    "Canadian Dollar"
  ],
  [
    "CDF",
    2,
    "Congolese Franc"
  ],
  [
    "CHE",
    2,
    "WIR Euro"
  ],
  [
    "CHF",
    2,
    "Swiss Franc"
  ],
  [
    "CHW",
    2,
    "WIR Franc"
  ],
  [
    "CLF",
    4,
    "Unidad de Fomento"
  ],
  [
    "CLP",
    0,
    "Chilean Peso"
  ],
  [
    "CNY",
    2,
    "Yuan Renminbi"
  ],
  [
    "COP",
    2,
    "Colombian Peso"
  ],
  [
    "COU",
    2,
    "Unidad de Valor Real"
  ],
  [
    "CRC",
    2,
    "Costa Rican Colon"
  ],
  [
    "CUP",
    2,
    "Cuban Peso"
  ],
  [
    "CVE",
    2,
    "Cabo Verde Escudo"
  ],
  [
    "CZK",
    2,
    "Czech Koruna"
  ],
  [
    "DJF",
    0,
    "Djibouti Franc"
  ],
  [
    "DKK",
    2,
    "Danish Krone"
  ],
  [
    "DOP",
    2,
    "Dominican Peso"
  ],
  [
    "DZD",
    2,
    "Algerian Dinar"
  ],
  [
    "EGP",
    2,
    "Egyptian Pound"
  ],
  [
    "ERN",
    2,
    "Nakfa"
  ],
  [
    "ETB",
    2,
    "Ethiopian Birr"
  ],
  [
    "EUR",
    2,
    "Euro"
  ],
  [
    "FJD",
    2,
    "Fiji Dollar"
  ],
  [
    "FKP",
    2,
    "Falkland Islands Pound"
  ],
  [
    "GBP",
    2,
    "Pound Sterling"
  ],
  [
    "GEL",
    2,
    "Lari"
  ],
  [
    "GHS",
    2,
    "Ghana Cedi"
  ],
  [
    "GIP",
    2,
    "Gibraltar Pound"
  ],
  [
    "GMD",
    2,
    "Dalasi"
  ],
  [
    "GNF",
    0,
    "Guinean Franc"
  ],
  [
    "GTQ",
    2,
    "Quetzal"
  ],
  [
    "GYD",
    2,
    "Guyana Dollar"
  ],
  [
    "HKD",
    2,
    "Hong Kong Dollar"
  ],
  [
    "HNL",
    2,
    "Lempira"
  ],
  [
    "HTG",
    2,
    "Gourde"
  ],
  [
    "HUF",
    2,
    "Forint"
  ],
  [
    "IDR",
    2,
    "Rupiah"
  ],
  [
    "ILS",
    2,
    "New Israeli Sheqel"
  ],
  [
    "INR",
    2,
    "Indian Rupee"
  ],
  [
    "IQD",
    3,
    "Iraqi Dinar"
  ],
  [
    "IRR",
    2,
    "Iranian Rial"
  ],
  [
    "ISK",
    0,
    "Iceland Krona"
  ],
  [
    "JMD",
    2,
    "Jamaican Dollar"
  ],
  [
    "JOD",
    3,
    "Jordanian Dinar"
  ],
  [
    "JPY",
    0,
    "Yen"
  ],
  [
    "KES",
    2,
    "Kenyan Shilling"
  ],
  [
    "KGS",
    2,
    "Som"
  ],
  [
    "KHR",
    2,
    "Riel"
  ],
  [
    "KMF",
    0,
    "Comorian Franc"
  ],
  [
    "KPW",
    2,
    "North Korean Won"
  ],
  [
    "KRW",
    0,
    "Won"
  ],
  [
    "KWD",
    3,
    "Kuwaiti Dinar"
  ],
  [
    "KYD",
    2,
    "Cayman Islands Dollar"
  ],
  [
    "KZT",
    2,
    "Tenge"
  ],
  [
    "LAK",
    2,
    "Lao Kip"
  ],
  [
    "LBP",
    2,
    "Lebanese Pound"
  ],
  [
    "LKR",
    2,
    "Sri Lanka Rupee"
  ],
  [
    "LRD",
    2,
    "Liberian Dollar"
  ],
  [
    "LSL",
    2,
    "Loti"
  ],
  [
    "LYD",
    3,
    "Libyan Dinar"
  ],
  [
    "MAD",
    2,
    "Moroccan Dirham"
  ],
  [
    "MDL",
    2,
    "Moldovan Leu"
  ],
  [
    "MGA",
    2,
    "Malagasy Ariary"
  ],
  [
    "MKD",
    2,
    "Denar"
  ],
  [
    "MMK",
    2,
    "Kyat"
  ],
  [
    "MNT",
    2,
    "Tugrik"
  ],
  [
    "MOP",
    2,
    "Pataca"
  ],
  [
    "MRU",
    2,
    "Ouguiya"
  ],
  [
    "MUR",
    2,
    "Mauritius Rupee"
  ],
  [
    "MVR",
    2,
    "Rufiyaa"
  ],
  [
    "MWK",
    2,
    "Malawi Kwacha"
  ],
  [
    "MXN",
    2,
    "Mexican Peso"
  ],
  [
    "MXV",
    2,
    "Mexican Unidad de Inversion (UDI)"
  ],
  [
    "MYR",
    2,
    "Malaysian Ringgit"
  ],
  [
    "MZN",
    2,
    "Mozambique Metical"
  ],
  [
    "NAD",
    2,
    "Namibia Dollar"
  ],
  [
    "NGN",
    2,
    "Naira"
  ],
  [
    "NIO",
    2,
    "Cordoba Oro"
  ],
  [
    "NOK",
    2,
    "Norwegian Krone"
  ],
  [
    "NPR",
    2,
    "Nepalese Rupee"
  ],
  [
    "NZD",
    2,
    "New Zealand Dollar"
  ],
  [
    "OMR",
    3,
    "Rial Omani"
  ],
  [
    "PAB",
    2,
    "Balboa"
  ],
  [
    "PEN",
    2,
    "Sol"
  ],
  [
    "PGK",
    2,
    "Kina"
  ],
  [
    "PHP",
    2,
    "Philippine Peso"
  ],
  [
    "PKR",
    2,
    "Pakistan Rupee"
  ],
  [
    "PLN",
    2,
    "Zloty"
  ],
  [
    "PYG",
    0,
    "Guarani"
  ],
  [
    "QAR",
    2,
    "Qatari Rial"
  ],
  [
    "RON",
    2,
    "Romanian Leu"
  ],
  [
    "RSD",
    2,
    "Serbian Dinar"
  ],
  [
    "RUB",
    2,
    "Russian Ruble"
  ],
  [
    "RWF",
    0,
    "Rwanda Franc"
  ],
  [
    "SAR",
    2,
    "Saudi Riyal"
  ],
  [
    "SBD",
    2,
    "Solomon Islands Dollar"
  ],
  [
    "SCR",
    2,
    "Seychelles Rupee"
  ],
  [
    "SDG",
    2,
    "Sudanese Pound"
  ],
  [
    "SEK",
    2,
    "Swedish Krona"
  ],
  [
    "SGD",
    2,
    "Singapore Dollar"
  ],
  [
    "SHP",
    2,
    "Saint Helena Pound"
  ],
  [
    "SLE",
    2,
    "Leone"
  ],
  [
    "SOS",
    2,
    "Somali Shilling"
  ],
  [
    "SRD",
    2,
    "Surinam Dollar"
  ],
  [
    "SSP",
    2,
    "South Sudanese Pound"
  ],
  [
    "STN",
    2,
    "Dobra"
  ],
  [
    "SVC",
    2,
    "El Salvador Colon"
  ],
  [
    "SYP",
    2,
    "Syrian Pound"
  ],
  [
    "SZL",
    2,
    "Lilangeni"
  ],
  [
    "THB",
    2,
    "Baht"
  ],
  [
    "TJS",
    2,
    "Somoni"
  ],
  [
    "TMT",
    2,
    "Turkmenistan New Manat"
  ],
  [
    "TND",
    3,
    "Tunisian Dinar"
  ],
  [
    "TOP",
    2,
    "Pa’anga"
  ],
  [
    "TRY",
    2,
    "Turkish Lira"
  ],
  [
    "TTD",
    2,
    "Trinidad and Tobago Dollar"
  ],
  [
    "TWD",
    2,
    "New Taiwan Dollar"
  ],
  [
    "TZS",
    2,
    "Tanzanian Shilling"
  ],
  [
    "UAH",
    2,
    "Hryvnia"
  ],
  [
    "UGX",
    0,
    "Uganda Shilling"
  ],
  [
    "USD",
    2,
    "US Dollar"
  ],
  [
    "USN",
    2,
    "US Dollar (Next day)"
  ],
  [
    "UYI",
    0,
    "Uruguay Peso en Unidades Indexadas (UI)"
  ],
  [
    "UYU",
    2,
    "Peso Uruguayo"
  ],
  [
    "UYW",
    4,
    "Unidad Previsional"
  ],
  [
    "UZS",
    2,
    "Uzbekistan Sum"
  ],
  [
    "VED",
    2,
    "Bolívar Soberano"
  ],
  [
    "VES",
    2,
    "Bolívar Soberano"
  ],
  [
    "VND",
    0,
    "Dong"
  ],
  [
    "VUV",
    0,
    "Vatu"
  ],
  [
    "WST",
    2,
    "Tala"
  ],
  [
    "XAD",
    2,
    "Arab Accounting Dinar"
  ],
  [
    "XAF",
    0,
    "CFA Franc BEAC"
  ],
  [
    "XAG",
    null,
    "Silver"
  ],
  [
    "XAU",
    null,
    "Gold"
  ],
  [
    "XBA",
    null,
    "Bond Markets Unit European Composite Unit (EURCO)"
  ],
  [
    "XBB",
    null,
    "Bond Markets Unit European Monetary Unit (E.M.U.-6)"
  ],
  [
    "XBC",
    null,
    "Bond Markets Unit European Unit of Account 9 (E.U.A.-9)"
  ],
  [
    "XBD",
    null,
    "Bond Markets Unit European Unit of Account 17 (E.U.A.-17)"
  ],
  [
    "XCD",
    2,
    "East Caribbean Dollar"
  ],
  [
    "XCG",
    2,
    "Caribbean Guilder"
  ],
  [
    "XDR",
    null,
    "SDR (Special Drawing Right)"
  ],
  [
    "XOF",
    0,
    "CFA Franc BCEAO"
  ],
  [
    "XPD",
    null,
    "Palladium"
  ],
  [
    "XPF",
    0,
    "CFP Franc"
  ],
  [
    "XPT",
    null,
    "Platinum"
  ],
  [
    "XSU",
    null,
    "Sucre"
  ],
  [
    "XUA",
    null,
    "ADB Unit of Account"
  ],
  [
    "YER",
    2,
    "Yemeni Rial"
  ],
  [
    "ZAR",
    2,
    "Rand"
  ],
  [
    "ZMW",
    2,
    "Zambian Kwacha"
  ],
  [
    "ZWG",
    2,
    "Zimbabwe Gold"
  ]
];
