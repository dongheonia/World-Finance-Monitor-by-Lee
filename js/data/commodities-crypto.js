
// All 10-year yields (see the section heading's "10년물"/"(10Y)" unit label — each row
// below is just the country name, not repeated per row) — US 2-year was dropped since
// a single-country exception to the "everything here is 10Y" rule was more confusing
// than useful. `current`/`change` prefer a live-fetched value when one lands (Yahoo for
// the US, FRED for the rest — see fetchAllYahoo/fetchFredBondYields in market-data.js)
// and only fall back to these figures otherwise. `prevYield` is a last-resort static
// checkpoint for the fallback path ONLY (i.e. everything is still down before a first
// live fetch has ever landed) — every live source computes a real previous-period
// change itself (previous close for the US, previous month for the FRED-sourced ones),
// which is what actually gets shown whenever live data is available.
const BOND10Y = [
    { symbol: '^TNX', ko: '미국', en: 'United States', fallback: { current: 4.68 }, prevYield: 4.48 },
    { symbol: 'GB10Y=RR', ko: '영국', en: 'United Kingdom', fallback: { current: 5.06 }, prevYield: 4.76 },
    { symbol: 'FR10Y=RR', ko: '프랑스', en: 'France', fallback: { current: 3.94 }, prevYield: 3.54 },
    { symbol: 'DE10Y=RR', ko: '독일', en: 'Germany', fallback: { current: 3.16 }, prevYield: 2.86 },
    { symbol: 'CN10Y=RR', ko: '중국', en: 'China', fallback: { current: 1.72 }, prevYield: 1.73 },
    { symbol: 'JP10Y=RR', ko: '일본', en: 'Japan', fallback: { current: 2.79 }, prevYield: 2.70 },
    { symbol: 'KR10Y=RR', ko: '한국', en: 'Korea', fallback: { current: 4.28 }, prevYield: 4.16 }
];

// Dubai crude had no free/live/CORS-open ticker anywhere (checked Yahoo — no valid
// symbol resolves to it — and FRED — POILDUBUSDM exists but is monthly-resolution IMF
// data with no way to get a meaningful intraday reading) and was dropped rather than
// staying stuck on a permanently-fixed value.
const COMMODITIES = [
    { symbol: 'BZ=F', ko: '브렌트유', en: 'Brent Crude', fallback: { current: 88.68, change: -8.10, change_percent: -8.36 } },
    { symbol: 'CL=F', ko: 'WTI 원유', en: 'WTI Crude', fallback: { current: 81.20, change: 0.95, change_percent: 1.18 } },
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
