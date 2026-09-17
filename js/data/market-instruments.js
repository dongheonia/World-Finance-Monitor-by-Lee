const INDICES = [
    { symbol: '^GSPC', ko: 'S&P500 지수', en: 'S&P 500', fallback: { current: 7400.58, change: -11.40, change_percent: -0.15 }, hours: { tz: 'America/New_York', sessions: ['09:30-16:00'] } },
    { symbol: '^IXIC', ko: '나스닥 종합지수', en: 'Nasdaq Composite', fallback: { current: 24872.80, change: -103.03, change_percent: -0.41 }, hours: { tz: 'America/New_York', sessions: ['09:30-16:00'] } },
    { symbol: '^DJI', ko: '다우존스산업평균', en: 'Dow Jones Industrial', fallback: { current: 52097.85, change: 150.60, change_percent: 0.29 }, hours: { tz: 'America/New_York', sessions: ['09:30-16:00'] } },
    { symbol: '^FTSE', ko: 'FTSE 100', en: 'FTSE 100', fallback: { current: 10802.25, change: 66.02, change_percent: 0.61 }, hours: { tz: 'Europe/London', sessions: ['08:00-16:30'] } },
    { symbol: '^STOXX50E', ko: '유로스톡스50', en: 'Euro Stoxx 50', fallback: { current: 6304.71, change: 23.77, change_percent: 0.38 }, hours: { tz: 'Europe/Paris', sessions: ['09:00-17:30'] } },
    { symbol: '^HSI', ko: '항셍지수', en: 'Hang Seng', fallback: { current: 25207.18, change: 243.94, change_percent: 0.98 }, hours: { tz: 'Asia/Hong_Kong', sessions: ['09:30-12:00', '13:00-16:00'] } },
    { symbol: '000001.SS', ko: '상하이종합지수', en: 'Shanghai Composite', fallback: { current: 3020.15, change: 5.60, change_percent: 0.19 }, hours: { tz: 'Asia/Shanghai', sessions: ['09:30-11:30', '13:00-15:00'] } },
    { symbol: '^N225', ko: '닛케이225', en: 'Nikkei 225', fallback: { current: 64931.19, change: 320.04, change_percent: 0.50 }, hours: { tz: 'Asia/Tokyo', sessions: ['09:00-11:30', '12:30-15:00'] } },
    { symbol: '^KS11', ko: '코스피', en: 'KOSPI', fallback: { current: 2750.20, change: 15.30, change_percent: 0.56 }, hours: { tz: 'Asia/Seoul', sessions: ['09:00-15:30'] } }
];

// Pinned to the top of the Stock Exchange list regardless of language (see renderAll) —
// VIX trades on the same CBOE/US session as the other US indices above.
const PINNED_MARKET = [
    { symbol: '^VIX', ko: 'VIX 지수', en: 'VIX Index', fallback: { current: 20.66, change: 0.00, change_percent: 0.00 }, hours: { tz: 'America/New_York', sessions: ['09:30-16:00'] } }
];

// FX/rate fallback figures seeded from current market data (as of 2026-07-27) so the page
// never shows stale/wrong numbers before the first live fetch completes or if it fails.
// Korean mode is always KRW-based (order: USD, EUR, JPY, GBP, CNY). English mode's
// base currency is user-selectable (see forexBase/setForexBase) between these two lists.
const FOREX_KO = [
    { symbol: 'USDKRW=X', ko: '원 / 달러', fallback: { current: 1471.55, change: 0.00, change_percent: 0.00 } },
    { symbol: 'EURKRW=X', ko: '원 / 유로', fallback: { current: 1706.85, change: 0.00, change_percent: 0.00 } },
    { symbol: 'JPYKRW=X', ko: '원 / 엔 (100엔)', fallback: { current: 918.70, change: 0.00, change_percent: 0.00 } },
    { symbol: 'GBPKRW=X', ko: '원 / 파운드', fallback: { current: 2003.00, change: 0.00, change_percent: 0.00 } },
    { symbol: 'CNYKRW=X', ko: '원 / 위안', fallback: { current: 220.90, change: 0.00, change_percent: 0.00 } }
];

const FOREX_EN_USD = [
    { symbol: 'USDEUR=X', en: 'USD / EUR', fallback: { current: 0.6259, change: 0.0000, change_percent: 0.00 } },
    { symbol: 'USDJPY=X', en: 'USD / JPY', fallback: { current: 160.17, change: 0.00, change_percent: 0.00 } },
    { symbol: 'USDGBP=X', en: 'USD / GBP', fallback: { current: 0.7346, change: 0.0000, change_percent: 0.00 } },
    { symbol: 'USDCNY=X', en: 'USD / CNY', fallback: { current: 6.6631, change: 0.0000, change_percent: 0.00 } },
    { symbol: 'USDKRW=X', en: 'USD / KRW', fallback: { current: 1471.55, change: 0.00, change_percent: 0.00 } }
];

const FOREX_EN_GBP = [
    { symbol: 'GBPUSD=X', en: 'GBP / USD', fallback: { current: 1.3612, change: 0.0000, change_percent: 0.00 } },
    { symbol: 'GBPEUR=X', en: 'GBP / EUR', fallback: { current: 0.8520, change: 0.0000, change_percent: 0.00 } },
    { symbol: 'GBPJPY=X', en: 'GBP / JPY', fallback: { current: 218.05, change: 0.00, change_percent: 0.00 } },
    { symbol: 'GBPCNY=X', en: 'GBP / CNY', fallback: { current: 9.0700, change: 0.0000, change_percent: 0.00 } },
    { symbol: 'GBPKRW=X', en: 'GBP / KRW', fallback: { current: 2003.00, change: 0.00, change_percent: 0.00 } }
];

// Pinned to the top of the FX Rates list regardless of language or USD/GBP base
// selection (see renderAll) — the Dollar Index isn't a currency pair, so it doesn't
// belong to any of the base-dependent lists above.
const PINNED_FX = [
    { symbol: 'DX-Y.NYB', ko: '달러인덱스', en: 'Dollar Index', fallback: { current: 100.91, change: 0.00, change_percent: 0.00 } }
];

// Policy rates only change on central-bank decision days (roughly 8x/year), so these
// are curated reference values, refreshed (2026-09-17) against each bank's actual
// September-meeting outcome. Both `rate` and `prevRate` are always the levels set at
// the two most recent MEETINGS — i.e. prevRate still updates on a hold (matches
// current), not just on an actual change. This matters: an earlier version of this
// data instead used "level before the last ACTUAL change" for prevRate, which produces
// a different (and, per the two rows below, wrong-looking) number whenever a bank has
// held for multiple consecutive meetings.
// - Fed: hiked 25bp to 3.75–4.00% (4.00% upper bound) on 2026-09-16, its first hike
//   since 2023 (12-0 vote); prior meeting 2026-07-29 held at 3.50-3.75% (3.75% upper
//   bound).
// - BOE: held at 3.75% on 2026-09-17 (6-3 vote); also 3.75% at the prior 2026-06-18
//   meeting → held.
// - Eurozone/ECB: one shared rate across the whole currency union (France and Germany
//   don't set separate rates — they were previously listed as if they did, showing
//   identical numbers, which is what looked "off" the first time this was flagged).
//   ECB actually publishes three rates (deposit facility / main refinancing / marginal
//   lending) that move together but differ in level — 2.65% here is the MAIN
//   REFINANCING rate, since that's the figure the user's source table tracks (an
//   earlier pass here used the deposit facility rate instead — a real, sourced number,
//   just the wrong one of the three for matching that table). Hiked 25bp on 2026-09-10
//   (effective 2026-09-16); prior meeting 2026-07-23 held at 2.40%.
// - Korea: BOK hiked to 3.00% from 2.75% on 2026-08-27 (6-1 vote), its second
//   consecutive hike, prior meeting 2026-07-16.
// - China: PBOC 1Y LPR held at 3.00% on 2026-08-20; also 3.00% at the prior 2026-07-20
//   meeting → held (frozen since May 2025).
// - Japan: BOJ hiked to 1.00% from 0.75% on 2026-06-16 (prior meeting 2026-04-28); next
//   decision due 2026-09-18, not yet announced.
const POLICY_RATES_UPDATED_AT = '2026-09-17';
const POLICY_RATES = [
    { ko: '미국 (연준)', en: 'United States (Fed)', rate: 4.00, prevRate: 3.75 },
    { ko: '영국 (영국은행)', en: 'United Kingdom (BOE)', rate: 3.75, prevRate: 3.75 },
    { ko: '유로존 (유럽중앙은행)', en: 'Eurozone (ECB)', rate: 2.65, prevRate: 2.40, liveSymbol: 'ECB_MRR' },
    { ko: '중국 (중국인민은행)', en: 'China (PBOC)', rate: 3.00, prevRate: 3.00 },
    { ko: '일본 (일본은행)', en: 'Japan (BOJ)', rate: 1.00, prevRate: 0.75 },
    { ko: '한국 (한국은행)', en: 'Korea (BOK)', rate: 3.00, prevRate: 2.75 }
];
