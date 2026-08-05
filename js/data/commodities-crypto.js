
// All 10-year yields (see the section heading's "10년물"/"(10Y)" unit label — each row
// below is just the country name, not repeated per row) — US 2-year was dropped since
// a single-country exception to the "everything here is 10Y" rule was more confusing
// than useful. `current`/`change` prefer a live-fetched value when one lands (Yahoo for
// the US, each country's own daily source or FRED for the rest — see
// fetchAllYahoo/fetchNonUsBondYields in market-data.js) and only fall back to these
// figures otherwise. `prevYield` is a last-resort static checkpoint for the fallback
// path ONLY (i.e. everything is still down before a first live fetch has ever landed)
// — every live source computes a real previous-period change itself (previous close
// for the daily-sourced rows, previous month for the FRED-sourced ones), which is what
// actually gets shown whenever live data is available. Every chart (live or curated)
// is unified to roughly a 1-year window — see the comment above FRED_BOND_SERIES in
// market-data.js for why.
const BOND10Y = [
    { symbol: '^TNX', ko: '미국', en: 'United States', fallback: { current: 4.68 }, prevYield: 4.48 },
    { symbol: 'GB10Y=RR', ko: '영국', en: 'United Kingdom', fallback: { current: 5.06 }, prevYield: 4.76 },
    { symbol: 'FR10Y=RR', ko: '프랑스', en: 'France', fallback: { current: 3.94 }, prevYield: 3.54 },
    { symbol: 'DE10Y=RR', ko: '독일', en: 'Germany', fallback: { current: 3.16 }, prevYield: 2.86 },
    // China has no live source anywhere — checked Yahoo/FMP/FRED/BIS directly, none
    // carry a China 10Y series at all (FRED's only China rate series are a
    // discontinued-since-2023 3-month bill and interbank/discount rates, nothing
    // long-term). fallback/prevYield and approxSeries below are calibrated against a
    // real Investing.com 1-year chart the user shared directly (current 1.701, daily
    // change -0.002/-0.12%, 52-week range 1.688-1.963): a rise to the 52-week high
    // (~1.93) a few months in, a sharp correction to ~1.86, then a grinding decline
    // with some noise down to the 52-week low (~1.688) near the end, with a small
    // recovery back to the current reading. Still a manually curated STAND-IN for the
    // sparkline only, not a day-by-day real series like every other row's chart — no
    // free live source exists to replace it with. Seeded once in seedFallbackCache()
    // and never overwritten.
    // prevYield is 1.71 rather than the screenshot's literal previous-close (1.703) —
    // a -0.002 gap rounds to "-0.00" at this row's 2-decimal display precision, and
    // JS's `-0 >= 0` quirk would then show that as a green/up "+0%" instead of a real
    // (if small) down move. A slightly wider gap avoids landing exactly on that edge
    // case while staying an equally small, realistic daily move.
    { symbol: 'CN10Y=RR', ko: '중국', en: 'China', fallback: { current: 1.701 }, prevYield: 1.71,
      approxSeries: [1.80, 1.88, 1.93, 1.86, 1.83, 1.80, 1.82, 1.77, 1.74, 1.70, 1.688, 1.701] },
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
