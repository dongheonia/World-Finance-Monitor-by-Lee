
// Redefined (2026-09-22, explicit request) from "every country's 10Y" to a fixed set of
// six specific instruments spanning the US curve plus two international 10Ys — each
// row's own label now carries its tenor, since the set is no longer uniform (the old
// shared "(10년물)/(10Y)" section-title suffix was removed along with this, see
// index.html/ui.js/translations.js). UK/France/Korea/China dropped entirely: UK and
// Korea's only sources (BoE, FRED) are both currently blocked/unreachable through the
// free CORS proxy this app has to use, France's replacement (Eurostat, genuinely
// CORS-native) and China's curated approxSeries stand-in are no longer needed since
// those rows are gone — see fetchBondYields in market-data.js for what actually powers
// the six rows below.
// `current`/`change` prefer a live-fetched value when one lands (Treasury.gov direct for
// the three US rows, Yahoo for the ETF, Bundesbank/MOF for Germany/Japan — see
// fetchBondYields/fetchAllYahoo in market-data.js) and only fall back to these figures
// otherwise. `prevYield` is a last-resort static checkpoint for the fallback path ONLY
// (i.e. before a first live fetch has ever landed) — every live source computes a real
// previous-period change itself, which is what actually gets shown once live data
// exists. `unit` defaults to '%' in render.js when absent (every row here except the ETF
// is a yield); the ETF is a $ price, so it's set to '' instead, matching how
// COMMODITIES/INDICES rows already display their prices with no unit suffix.
const BOND10Y = [
    { symbol: 'US02Y=RR', ko: '미국 2년', en: 'US 2Y', fallback: { current: 4.71 }, prevYield: 4.76 },
    { symbol: 'US10Y=RR', ko: '미국 10년', en: 'US 10Y', fallback: { current: 4.96 }, prevYield: 4.96 },
    { symbol: 'US30Y=RR', ko: '미국 30년', en: 'US 30Y', fallback: { current: 5.29 }, prevYield: 5.29 },
    // Yahoo-sourced like COMMODITIES/INDICES (see allYahooSymbols in market-data.js) —
    // a $ price, not a yield, so this carries change/change_percent directly in its
    // fallback (COMMODITIES-style) rather than a separate prevYield checkpoint.
    { symbol: 'TLT', ko: 'iShares 20Y+ ETF', en: 'iShares 20Y+ ETF', unit: '',
      fallback: { current: 81.75, change: 1.04, change_percent: 1.29 } },
    { symbol: 'DE10Y=RR', ko: '독일 10년', en: 'Germany 10Y', fallback: { current: 3.16 }, prevYield: 2.86 },
    { symbol: 'JP10Y=RR', ko: '일본 10년', en: 'Japan 10Y', fallback: { current: 2.79 }, prevYield: 2.70 }
];

// Dubai crude had no free/live/CORS-open ticker anywhere (checked Yahoo — no valid
// symbol resolves to it — and FRED — POILDUBUSDM exists but is monthly-resolution IMF
// data with no way to get a meaningful intraday reading) and was dropped rather than
// staying stuck on a permanently-fixed value.
// WTI Crude dropped (2026-09-22, explicit request) — Brent is the one kept of the two,
// as the more internationally-referenced global benchmark (most of the world's crude is
// priced off Brent, not WTI, which is more US-domestic-focused) for a page tracking
// world markets broadly rather than US markets specifically.
const COMMODITIES = [
    { symbol: 'BZ=F', ko: '브렌트유', en: 'Brent Crude', fallback: { current: 88.68, change: -8.10, change_percent: -8.36 } },
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
