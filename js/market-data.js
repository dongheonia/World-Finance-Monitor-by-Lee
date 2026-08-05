// ============================ LIVE DATA FETCHING ============================
// Three independent live sources, each refreshed every 1 minute:
//  - Stock indices / commodities / bond yields: Yahoo Finance's unofficial chart API,
//    which has no CORS headers of its own, so it's fetched through a CHAIN of public
//    CORS proxies (tried in order until one works — a single proxy going down or
//    rate-limiting no longer means stale numbers).
//  - FX: the Frankfurter API (ECB reference rates) — CORS-native, no proxy or key
//    needed, so it never fails the way the proxied Yahoo calls can. It publishes once
//    per business day rather than tick-by-tick, but it is always the accurate latest
//    official rate, which is what was actually wrong before.
//  - Crypto: the CoinGecko public API — also CORS-native, true real-time pricing.

// Verified against Yahoo's chart endpoint and several RSS feeds directly (curl,
// checking both HTTP status and actual Access-Control-Allow-Origin headers) on
// 2026-08-01:
//  - corsproxy.io now requires a paid plan (403 on any server-side-style request) — dead.
//  - api.codetabs.com is returning Cloudflare 522s (origin unreachable) — dead.
//  - api.allorigins.win, the long-time second proxy, is now HARD down (connection
//    timeouts on every attempt, not just "flaky") — this was silently cutting the news
//    pool (and file:// users' news pool entirely — see CORS_PROXIES below) whenever
//    corsfix had even one bad request, since there was no working fallback left.
//    Replaced with proxy.cors.sh, verified working with real CORS headers.
//  - proxy.corsfix.com works when it sees a browser-style Origin header (which a real
//    fetch() always sends), giving a second independent path.
// Both remaining proxies are still free/anonymous services that can go down or change
// terms at any time — see the note above fetchYahooQuote for the real fix.
// Order matters: tried in sequence, first success wins. corsfix is the more reliable of
// the two under normal load, so it goes first; cors.sh (no API key) rate-limits faster
// under heavy burst but is otherwise solid, so it's the fallback. Re-test both if this
// stops working well — their relative reliability drifts over time, it's not fixed.
const ALL_CORS_PROXIES = [
    target => `https://proxy.corsfix.com/?${target}`,
    target => `https://proxy.cors.sh/${target}`
];
// corsfix rejects any request with no real Origin header (confirmed via its own
// response: x-corsfix-status: invalid_origin) — and a page opened as a local file
// (file://, e.g. double-clicked instead of served over http) sends exactly that, so
// every corsfix attempt from a file:// page is a guaranteed, wasted failure. Skip it
// entirely in that case rather than eating its timeout on every single request.
// (The real fix is serving this over http — see the README/instructions — but this
// keeps file:// usage from being strictly worse than it has to be.)
const CORS_PROXIES = window.location.protocol === 'file:'
    ? ALL_CORS_PROXIES.slice(1)
    : ALL_CORS_PROXIES;

async function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { cache: 'no-store', signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Both CORS_PROXIES are free, independently-flaky services (see the note above
// ALL_CORS_PROXIES). Trying them one after another means a slow/down proxy eats its
// full timeout before the other one even gets a turn, and the request only fails if
// THAT ONE proxy fails. Racing them with Promise.any instead answers as fast as
// whichever proxy responds first, and only fails if BOTH do — this is a meaningful
// chunk of what made charts "새로고침 할때마다 랜덤으로" go missing: proxy A having a
// bad moment while proxy B was perfectly fine to serve the request.
async function fetchViaProxies(target, timeoutMs) {
    const attempts = CORS_PROXIES.map(async buildProxyUrl => {
        const res = await fetchWithTimeout(buildProxyUrl(target), timeoutMs);
        if (!res.ok) throw new Error('http ' + res.status);
        return res;
    });
    try {
        return await Promise.any(attempts);
    } catch (aggregateErr) {
        throw (aggregateErr.errors && aggregateErr.errors[0]) || aggregateErr;
    }
}

// Downsamples an array to at most maxPoints, evenly spaced — used to keep sparkline
// SVGs light regardless of how many raw bars the source series had. Consecutive
// duplicate values are collapsed first: thinly-traded pairs (e.g. the KRW crosses)
// only get a fresh quote every few minutes from Yahoo and repeat the same value in
// between, so a plain even-index sample can land disproportionately on those flat
// stretches and under-represent the real moves elsewhere in the series. This doesn't
// invent anything — it just avoids wasting sample points on redundant repeats of data
// that's already real.
function downsample(arr, maxPoints) {
    const deduped = arr.filter((v, i) => i === 0 || v !== arr[i - 1]);
    const source = deduped.length >= 2 ? deduped : arr;
    if (source.length <= maxPoints) return source;
    const step = source.length / maxPoints;
    const out = [];
    for (let i = 0; i < maxPoints; i++) out.push(source[Math.floor(i * step)]);
    return out;
}

async function fetchYahooQuote(symbol) {
    // range=1mo&interval=1d gives ~22 daily closes (a trading month) instead of a single
    // intraday day — this only changes the SPARKLINE source; the live price/change below
    // still comes from `meta` (regularMarketPrice/previousClose), which Yahoo populates
    // the same way regardless of what range/interval the chart itself was requested at,
    // so switching this doesn't make the quote itself any less current.
    const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&_=${Date.now()}`;
    const res = await fetchViaProxies(target, 5000);
    const data = await res.json();
    const result = data.chart && data.chart.result && data.chart.result[0];
    if (!result) throw new Error('no result');
    const meta = result.meta;
    const current = meta.regularMarketPrice;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose;
    if (current == null || prevClose == null) throw new Error('missing price');
    const change = +(current - prevClose).toFixed(4);
    const changePercent = +(((current - prevClose) / prevClose) * 100).toFixed(2);
    // The chart endpoint already returns a full month-long close-price series
    // alongside the current quote — grabbing it here for the row's sparkline
    // costs nothing extra (same single request), unlike FX, which needs a
    // dedicated fetch since its price comes from a different source (see
    // fetchChartSeriesOnly).
    const closes = result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
    const series = Array.isArray(closes) ? downsample(closes.filter(v => v != null), 40) : null;
    return { current: +current.toFixed(4), change, change_percent: changePercent, series };
}

// Synthetic bond-yield identifiers this file made up (Yahoo has no real ticker for any
// of these, so attempting them via the Yahoo proxy would just fail every single cycle)
// — covered instead by fetchFredBondYields() below (all but China — see there).
const NO_YAHOO_SOURCE_SYMBOLS = ['GB10Y=RR', 'FR10Y=RR', 'DE10Y=RR', 'CN10Y=RR', 'JP10Y=RR', 'KR10Y=RR'];

function allYahooSymbols() {
    const set = new Set();
    [...INDICES, ...PINNED_MARKET, ...COMMODITIES, ...BOND10Y, ...PINNED_FX].forEach(i => set.add(i.symbol));
    NO_YAHOO_SOURCE_SYMBOLS.forEach(s => set.delete(s));
    return [...set];
}

function seedFallbackCache() {
    [...INDICES, ...PINNED_MARKET, ...FOREX_KO, ...FOREX_EN_USD, ...FOREX_EN_GBP, ...PINNED_FX, ...COMMODITIES, ...CRYPTO, ...BOND10Y].forEach(i => {
        if (!cachedData[i.symbol]) cachedData[i.symbol] = i.fallback;
    });
}

async function fetchOneYahooSymbol(symbol) {
    try {
        const quote = await fetchYahooQuote(symbol);
        setQuote(symbol, quote);
        if (quote.series) setSeries(symbol, quote.series);
    } catch (e) {
        console.warn('Yahoo fetch failed for', symbol, e.message);
    }
}

// ~20 symbols fired at once at a free/anonymous proxy tends to trip its own rate
// limiting (observed 429s while testing), which just adds a self-inflicted failure
// mode on top of the proxy's own flakiness. Batching a few at a time is friendlier to
// it and empirically raises the overall success rate.
let yahooFetchInProgress = false;
async function fetchAllYahoo() {
    if (yahooFetchInProgress) return; // don't stack a new cycle on top of a slow one
    yahooFetchInProgress = true;
    try {
        const symbols = allYahooSymbols();
        const batchSize = 6;
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            await Promise.allSettled(batch.map(fetchOneYahooSymbol));
            renderAll(); // render progressively as each batch lands instead of waiting for all ~20
        }
        saveSeriesCache();
    } finally {
        yahooFetchInProgress = false;
    }
}

// Every index/commodity/US bond yield now gets its PRICE from the 1-minute Yahoo path
// above (fetchOneYahooSymbol), which already includes the chart series in the same
// call — no separate sparkline fetch needed for those. FX is the one thing still
// missing a chart: its price comes from Frankfurter (only one point per day, too
// sparse for a good-looking chart; see fetchAllFX), so it gets a sparkline-ONLY fetch
// through this same Yahoo-chart-via-CORS-proxy path instead. Yahoo's FX tickers use
// exactly the same "USDKRW=X"-style symbols already used throughout this file, and
// carry real intraday data for FX pairs (spot FX trades ~24/5, unlike exchange hours),
// giving these charts the same resolution as the Market/Commodities ones instead of
// Frankfurter's ~5-point weekly line. Decoupled from price so a failed chart fetch
// never touches the number shown; runs on its own slow cadence (see the setInterval
// near window.onload) — a 5-40min-old sparkline is fine, unlike price.
const ALL_FX_SYMBOLS = [...new Set([...FOREX_KO, ...FOREX_EN_USD, ...FOREX_EN_GBP].map(f => f.symbol))];
// Dollar Index and VIX only otherwise get ONE combined price+chart fetch per 60s cycle
// (via fetchOneYahooSymbol, 5000ms timeout, no retry) — same as every other pinned/index
// symbol. Since they have no other data source to fall back on, they're added here too
// so they ALSO get this dedicated, longer-timeout chart fetch plus the 45s retry pass
// below — belt-and-suspenders so a single flaky proxy attempt doesn't leave the pinned
// rows chartless for a full minute+.
const CHART_ONLY_SYMBOLS = [...ALL_FX_SYMBOLS, ...PINNED_FX.map(f => f.symbol), ...PINNED_MARKET.map(i => i.symbol)];

async function fetchChartSeriesOnly(symbol) {
    // Same 1-month/daily window as fetchYahooQuote — see the comment there. This
    // function only ever supplies the sparkline (never the price), so there's no
    // "current quote" concern to weigh here at all.
    const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&_=${Date.now()}`;
    // Unlike fetchYahooQuote's 5000ms (tuned to fit a 1-minute price cycle), this runs
    // on its own slower 5-minute cadence with no such budget — a longer timeout here
    // just means more of the inherently flaky free proxies' slow responses actually get
    // to finish instead of being cut off early.
    const res = await fetchViaProxies(target, 9000);
    const data = await res.json();
    const result = data.chart && data.chart.result && data.chart.result[0];
    const closes = result && result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close;
    if (!Array.isArray(closes)) throw new Error('no series');
    const clean = closes.filter(v => v != null);
    if (clean.length < 2) throw new Error('series too short');
    return downsample(clean, 40);
}

let sparklineFetchInProgress = false;
async function fetchProxiedSparklines(symbols) {
    if (sparklineFetchInProgress) return;
    sparklineFetchInProgress = true;
    try {
        const list = symbols || CHART_ONLY_SYMBOLS;
        const batchSize = 6;
        for (let i = 0; i < list.length; i += batchSize) {
            const batch = list.slice(i, i + batchSize);
            await Promise.allSettled(batch.map(async symbol => {
                try {
                    setSeries(symbol, await fetchChartSeriesOnly(symbol));
                } catch (e) {
                    console.warn('Sparkline fetch failed for', symbol, e.message);
                }
            }));
            renderAll();
        }
        saveSeriesCache();
    } finally {
        sparklineFetchInProgress = false;
    }
}

// The free CORS proxies routinely drop a handful of requests in any given burst (see
// the note above ALL_CORS_PROXIES) — rather than leaving a symbol chartless for the
// full 5-minute cycle after a bad first attempt, this makes one extra pass shortly
// after load at just the symbols still missing, which is usually enough to catch
// whatever failed transiently the first time.
function retryMissingSparklines() {
    const missing = CHART_ONLY_SYMBOLS.filter(s => !getSeries(s));
    if (missing.length) fetchProxiedSparklines(missing);
}

// Frankfurter returns a { rates: { 'YYYY-MM-DD': { CUR: rate, ... }, ... } } series;
// fetching a short trailing window lets us compute today-vs-previous-publish change
// without keeping any history beyond that single prior reading.
async function fetchFrankfurterSeries(base, quotes) {
    // 30 days to match the 1-month window every chart on the page now uses (see
    // fetchYahooQuote) — this is only ever an initial-paint bridge until the richer
    // Yahoo-sourced monthly series lands (setSeriesIfMissing never overwrites it), but
    // no reason for the bridge itself to be a different length.
    const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const url = `https://api.frankfurter.dev/v1/${from}..?from=${base}&to=${quotes.join(',')}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    const dates = Object.keys(data.rates || {}).sort();
    if (dates.length === 0) throw new Error('no rates');
    const latestDate = dates[dates.length - 1];
    const prevDate = dates.length > 1 ? dates[dates.length - 2] : latestDate;
    // dates/rates kept (not just latest/prev) so callers can also build a sparkline —
    // this is real multi-day history already being fetched, not an extra request.
    return { latest: data.rates[latestDate], prev: data.rates[prevDate], dates, rates: data.rates };
}

async function fetchAllFX() {
    try {
        const krwBases = ['USD', 'EUR', 'JPY', 'GBP', 'CNY'];
        const [krwResults, usdSeries, gbpSeries] = await Promise.all([
            Promise.all(krwBases.map(async cur => [cur, await fetchFrankfurterSeries(cur, ['KRW'])])),
            fetchFrankfurterSeries('USD', ['EUR', 'JPY', 'GBP', 'CNY']),
            fetchFrankfurterSeries('GBP', ['USD', 'EUR', 'JPY', 'CNY'])
        ]);
        krwResults.forEach(([cur, series]) => {
            const mult = cur === 'JPY' ? 100 : 1; // displayed as "원 / 엔 (100엔)"
            const current = series.latest.KRW * mult;
            const prevVal = series.prev.KRW * mult;
            const change = +(current - prevVal).toFixed(2);
            const changePercent = prevVal ? +((change / prevVal) * 100).toFixed(2) : 0;
            setQuote(`${cur}KRW=X`, { current: +current.toFixed(2), change, change_percent: changePercent });
            // fetchProxiedSparklines fetches a much denser real intraday series for
            // every FX symbol via Yahoo — this daily-resolution one only fills the gap
            // until that lands (or as a fallback if it never does), never overwrites it.
            setSeriesIfMissing(`${cur}KRW=X`, series.dates.map(d => series.rates[d].KRW * mult));
        });
        const setCrossSeries = (base, series, quotes) => {
            quotes.forEach(cur => {
                const current = series.latest[cur];
                const prevVal = series.prev[cur];
                if (current == null || prevVal == null) return;
                const change = +(current - prevVal).toFixed(4);
                const changePercent = prevVal ? +((change / prevVal) * 100).toFixed(2) : 0;
                setQuote(`${base}${cur}=X`, { current: +current.toFixed(4), change, change_percent: changePercent });
                setSeriesIfMissing(`${base}${cur}=X`, series.dates.map(d => series.rates[d][cur]).filter(v => v != null));
            });
        };
        setCrossSeries('USD', usdSeries, ['EUR', 'JPY', 'GBP', 'CNY']);
        setCrossSeries('GBP', gbpSeries, ['USD', 'EUR', 'JPY', 'CNY']);
        saveSeriesCache();
    } catch (e) {
        console.warn('Frankfurter FX fetch failed:', e.message);
    }
    renderAll();
}

// The ECB Data Portal's REST API is public, keyless, and genuinely CORS-enabled
// (access-control-allow-origin: *, verified directly against the endpoint) — unlike
// Yahoo/every other source in this file, it needs no proxy. FM.D.U2.EUR.4F.KR.MRR_FR.LEV
// is the daily main-refinancing-rate series (the rate POLICY_RATES' Eurozone row tracks;
// see the comment above POLICY_RATES for why that one of ECB's three published rates was
// chosen). The other five central banks here (Fed, BOE, BOJ, BOK, PBOC) do NOT have an
// equivalent free+keyless+CORS-open API (checked directly): FRED and BOK's ECOS both
// gate their real API behind a free-registration key this app has no way to hold, and
// BOE/BOJ/PBOC's own data pages send no CORS header at all, meaning it'd need a CORS
// proxy — the same flaky, rate-limited pattern already visible in the news fetching
// below, which is a worse failure mode for a number people might act on financially.
// So only this one row can safely self-correct; the rest stay on the curated figures
// above, with the "as of" date next to the section title making that staleness visible
// instead of silently implying they're as fresh as this one.
async function fetchECBPolicyRate() {
    try {
        const url = `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.MRR_FR.LEV?format=jsondata&lastNObservations=140&_=${Date.now()}`;
        const res = await fetchWithTimeout(url, 8000);
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        const series = data.dataSets[0].series['0:0:0:0:0:0:0'];
        const dates = data.structure.dimensions.observation[0].values.map(v => v.id);
        const points = Object.keys(series.observations)
            .map(k => ({ date: dates[+k], value: series.observations[k][0] }))
            .sort((a, b) => a.date.localeCompare(b.date));
        if (!points.length) throw new Error('no ECB observations returned');

        const latest = points[points.length - 1];
        // ECB's Governing Council meets roughly every 6 weeks (~42 days) — walking back
        // that far and taking the level in effect at that point approximates "the rate
        // set at the previous meeting" (matching a held rate when nothing changed,
        // exactly like POLICY_RATES' other rows), without needing the exact meeting
        // calendar.
        const cutoff = new Date(latest.date);
        cutoff.setDate(cutoff.getDate() - 42);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        let prevPoint = points[0];
        for (const p of points) {
            if (p.date <= cutoffStr) prevPoint = p; else break;
        }

        const current = latest.value;
        const prevRate = prevPoint.value;
        const change = +(current - prevRate).toFixed(2);
        const changePercent = prevRate ? +((change / prevRate) * 100).toFixed(2) : 0;
        setQuote('ECB_MRR', { current, change, change_percent: changePercent, prevRate });
        renderAll();
    } catch (e) {
        console.warn('ECB policy-rate fetch failed:', e.message);
    }
}

async function fetchAllCrypto() {
    try {
        const ids = CRYPTO.map(c => c.symbol).join(',');
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&_=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        CRYPTO.forEach(c => {
            const d = data[c.symbol];
            if (!d || d.usd == null) return;
            const current = d.usd;
            const changePercent = +(d.usd_24h_change ?? 0).toFixed(2);
            const change = +((current * changePercent) / 100).toFixed(current < 10 ? 4 : 2);
            setQuote(c.symbol, { current, change, change_percent: changePercent });
        });
    } catch (e) {
        console.warn('CoinGecko crypto fetch failed:', e.message);
    }
    renderAll();
}

// CoinGecko's /coins/{id}/market_chart endpoint (still keyless/free-tier) returns a
// real price history for whatever day range you ask for — days=30 matches the 1-month
// window every other chart on the page now shows (see fetchChartSeriesOnly/
// fetchYahooQuote). Unlike /coins/markets?sparkline=true (the old source here), which
// only ever returns a fixed 7-day series with no way to ask for more, this needs one
// request PER coin — fine at just 2 coins. Kept separate from fetchAllCrypto/price
// (which stays on the lighter /simple/price endpoint used every minute) and run on the
// slower sparkline cadence instead, since a monthly chart doesn't need per-minute
// refreshing.
async function fetchCryptoSparklines() {
    try {
        await Promise.all(CRYPTO.map(async c => {
            try {
                const url = `https://api.coingecko.com/api/v3/coins/${c.symbol}/market_chart?vs_currency=usd&days=30&_=${Date.now()}`;
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error('http ' + res.status);
                const data = await res.json();
                const prices = Array.isArray(data.prices) ? data.prices.map(p => p[1]) : null;
                if (prices && prices.length >= 2) setSeries(c.symbol, downsample(prices, 40));
            } catch (e) {
                console.warn('CoinGecko market_chart fetch failed for', c.symbol, e.message);
            }
        }));
        saveSeriesCache();
    } catch (e) {
        console.warn('CoinGecko sparkline fetch failed:', e.message);
    }
    renderAll();
}

// Optional local backend (main.py) — reliably covers the 7 symbols that are gated on
// every free cloud API's paid tier but that Yahoo itself has fine: Germany DAX,
// Shanghai Composite, KOSPI, WTI Crude, Natural Gas, Copper, Wheat. Running it is
// opt-in (`uvicorn main:app --port 8000`); if it's not running, this just fails
// silently and those 7 symbols fall back to the existing (flakier) Yahoo-proxy attempt
// in fetchAllYahoo — no regression either way, this only ever makes things better.
const LOCAL_BACKEND_URL = 'http://localhost:8000';
const LOCAL_BACKEND_SYMBOLS = ['000001.SS', '^KS11', 'CL=F', 'NG=F', 'HG=F', 'ZW=F'];
let localBackendAvailable = null; // null = unknown yet, avoids a console error spray every cycle once we know it's down

async function fetchLocalBackend() {
    try {
        const url = `${LOCAL_BACKEND_URL}/api/quotes?symbols=${LOCAL_BACKEND_SYMBOLS.join(',')}`;
        const res = await fetchWithTimeout(url, 4000);
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        let anySucceeded = false;
        LOCAL_BACKEND_SYMBOLS.forEach(symbol => {
            const q = data[symbol];
            if (q && q.current != null) {
                setQuote(symbol, { current: q.current, change: q.change, change_percent: q.change_percent });
                anySucceeded = true;
            }
        });
        if (anySucceeded) {
            if (localBackendAvailable !== true) console.info('Local backend (main.py) detected — using it for DAX/Shanghai/KOSPI/WTI/NatGas/Copper/Wheat.');
            localBackendAvailable = true;
            renderAll();
        }
    } catch (e) {
        if (localBackendAvailable !== false) console.info('Local backend not running (this is fine — falling back to the Yahoo proxy for those 7 symbols). Run `uvicorn main:app --port 8000` to enable it.');
        localBackendAvailable = false;
    }
}

// Non-US 10Y government bond yields have no CORS-enabled API anywhere (Yahoo/FMP/
// Twelve Data all checked — see the comment above NO_YAHOO_SOURCE_SYMBOLS). FRED (St.
// Louis Fed) republishes OECD's "long-term interest rate" series for most of them,
// monthly, and its CSV endpoint needs no API key — but has no CORS header of its own,
// so it's routed through the same free CORS-proxy chain fetchYahooQuote already uses
// (fetchViaProxies) rather than needing anything new. China isn't in this OECD
// dataset (not an OECD member) and has no free source anywhere — stays on its curated
// fallback value, same as before.
const FRED_BOND_SERIES = {
    'GB10Y=RR': 'IRLTLT01GBM156N',
    'FR10Y=RR': 'IRLTLT01FRM156N',
    'DE10Y=RR': 'IRLTLT01DEM156N',
    'JP10Y=RR': 'IRLTLT01JPM156N',
    'KR10Y=RR': 'IRLTLT01KRM156N'
};

function parseFredCsv(text) {
    return text.trim().split('\n').slice(1) // drop the "observation_date,<series>" header row
        .map(line => line.split(','))
        .filter(cols => cols.length === 2 && cols[1] !== '' && cols[1] !== '.') // '.' is FRED's own "no observation" marker
        .map(([date, value]) => ({ date, value: +value }));
}

async function fetchOneFredSeries(symbol, seriesId) {
    try {
        const res = await fetchViaProxies(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`, 9000);
        const rows = parseFredCsv(await res.text());
        if (rows.length < 2) throw new Error('not enough data points');
        const latest = rows[rows.length - 1];
        const prev = rows[rows.length - 2];
        // "Change" here is real month-over-month, not a stale multi-month checkpoint —
        // the most standard comparison basis for a series that only ever prints once a
        // month in the first place (see the BOND10Y comment for why this replaced the
        // old fixed-checkpoint comparison).
        const change = +(latest.value - prev.value).toFixed(3);
        const changePercent = prev.value ? +((change / prev.value) * 100).toFixed(2) : 0;
        setQuote(symbol, { current: latest.value, change, change_percent: changePercent });
        // Real (if coarse, monthly-resolution) trend data beats the "—" no-chart state
        // these rows used to be stuck with — 24 points is 2 years of history.
        setSeries(symbol, rows.slice(-24).map(r => r.value));
    } catch (e) {
        console.warn('FRED fetch failed for', symbol, e.message);
    }
}

// FRED only publishes monthly, so there's no reason to poll this on the 1-minute
// market cycle — 30 minutes is already far more often than the data can actually
// change; it's just here to pick up a revision shortly after FRED publishes one.
async function fetchFredBondYields() {
    await Promise.allSettled(Object.entries(FRED_BOND_SERIES).map(([symbol, seriesId]) => fetchOneFredSeries(symbol, seriesId)));
    renderAll();
}

function fetchAllMarketData() {
    fetchAllYahoo();
    fetchAllFX();
    fetchAllCrypto();
    fetchLocalBackend();
}

