
// Compared against a fixed "as of" checkpoint (6월 말 / end of June 2026) rather than
// the previous daily close — matches the comparison table the user sourced directly,
// same reasoning as POLICY_RATES: change is shown in percentage POINTS, not a relative
// %. `prevYield` is that fixed checkpoint; `current` still prefers a live-fetched value
// when one lands (see fetchAllYahoo/fetchAllFmp/fetchLocalBondYields) and only falls
// back to these figures otherwise.
const BOND10Y = [
    { symbol: '^TNX', ko: '미국 10년물', en: 'United States 10Y', fallback: { current: 4.68 }, prevYield: 4.48 },
    { symbol: 'US2Y=RR', ko: '미국 2년물', en: 'United States 2Y', fallback: { current: 4.33 }, prevYield: 4.15 },
    { symbol: 'GB10Y=RR', ko: '영국 10년물', en: 'United Kingdom 10Y', fallback: { current: 5.06 }, prevYield: 4.76 },
    { symbol: 'FR10Y=RR', ko: '프랑스 10년물', en: 'France 10Y', fallback: { current: 3.94 }, prevYield: 3.54 },
    { symbol: 'DE10Y=RR', ko: '독일 10년물', en: 'Germany 10Y', fallback: { current: 3.16 }, prevYield: 2.86 },
    { symbol: 'CN10Y=RR', ko: '중국 10년물', en: 'China 10Y', fallback: { current: 1.72 }, prevYield: 1.73 },
    { symbol: 'JP10Y=RR', ko: '일본 10년물', en: 'Japan 10Y', fallback: { current: 2.79 }, prevYield: 2.70 },
    { symbol: 'KR10Y=RR', ko: '한국 10년물', en: 'Korea 10Y', fallback: { current: 4.28 }, prevYield: 4.16 }
];

// Dubai crude (symbol: DUBAI_CRUDE_MANUAL) has no free/live/CORS-open ticker anywhere —
// checked Yahoo (no valid symbol resolves to it) and FRED (POILDUBUSDM exists but is
// monthly-resolution IMF data, not CORS-enabled for browser fetch). Priced from a
// user-provided real-time figure; excluded from allYahooSymbols() so it never wastes a
// failing fetch attempt, and has no sparkline since no real series data exists for it.
const COMMODITIES = [
    { symbol: 'BZ=F', ko: '브렌트유', en: 'Brent Crude', fallback: { current: 88.68, change: -8.10, change_percent: -8.36 } },
    { symbol: 'CL=F', ko: 'WTI 원유', en: 'WTI Crude', fallback: { current: 81.20, change: 0.95, change_percent: 1.18 } },
    { symbol: 'DUBAI_CRUDE_MANUAL', ko: '두바이유', en: 'Dubai Crude', fallback: { current: 76.29, change: 0.00, change_percent: 0.00 } },
    { symbol: 'NG=F', ko: '천연가스', en: 'Natural Gas', fallback: { current: 2.65, change: -0.04, change_percent: -1.49 } },
    { symbol: 'GC=F', ko: '금', en: 'Gold', fallback: { current: 4078.40, change: 7.60, change_percent: 0.19 } },
    { symbol: 'SI=F', ko: '은', en: 'Silver', fallback: { current: 58.79, change: -0.12, change_percent: -0.21 } },
    { symbol: 'HG=F', ko: '구리', en: 'Copper', fallback: { current: 4.35, change: -0.03, change_percent: -0.68 } },
    { symbol: 'ZW=F', ko: '밀', en: 'Wheat', fallback: { current: 545.20, change: 3.10, change_percent: 0.57 } }
];

// symbol here doubles as the CoinGecko coin id (see fetchAllCrypto) — Yahoo is not used for crypto anymore.
const CRYPTO = [
    { symbol: 'bitcoin', ko: '비트코인', en: 'Bitcoin', fallback: { current: 65141.03, change: 715.00, change_percent: 1.11 } },
    { symbol: 'ethereum', ko: '이더리움', en: 'Ethereum', fallback: { current: 1969.46, change: 81.00, change_percent: 4.30 } }
];
