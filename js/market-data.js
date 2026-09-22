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

// Verified against Yahoo's chart endpoint and several RSS feeds directly (real browser
// fetch(), checking both HTTP status and actual response bodies) on 2026-09-17 — this
// site's news box had gone completely empty (falling back to the tiny static list) and
// every live number (stocks/FX/bonds) had silently gone stale, because BOTH proxies below
// had died since the last check:
//  - proxy.cors.sh no longer resolves at all (DNS failure on every request) — dead.
//  - proxy.corsfix.com now requires the calling site's domain to be registered on its
//    dashboard (free tier, just gated differently than before): every request came back
//    `{"corsfix_error":"domain_not_registered", ...}` for dongheonia.github.io. corsfix
//    itself is otherwise healthy — registering the domain there
//    (https://corsfix.com — free signup, add the domain, done) would make it work again
//    and is worth doing for redundancy, but isn't done as of this fix.
//  - cors-get-proxy.sirjosh.workers.dev (a Cloudflare Worker) verified working with real
//    response bodies from BBC/Yahoo/Guardian/Al Jazeera, no rate-limiting across a 5x
//    burst — added as the one functioning proxy. One known gap: its shared Worker IP
//    gets Google's "unusual traffic" bot page instead of RSS for news.google.com/rss
//    queries specifically (roughly a third of NEWS_FEEDS) — those feeds fail cleanly
//    (caught by Promise.allSettled in fetchAllNews) rather than breaking anything else.
// Free/anonymous proxies rot on this kind of timeline — re-verify with a real fetch()
// (not just curl; corsfix in particular only responds to browser-style requests) if this
// stops working again, rather than assuming the last-known-good list still holds.
const CORSFIX_PROXY = target => `https://proxy.corsfix.com/?${target}`;
const ALL_CORS_PROXIES = [
    target => `https://cors-get-proxy.sirjosh.workers.dev/?url=${encodeURIComponent(target)}`,
    CORSFIX_PROXY
];
// corsfix rejects any request with no real Origin header (confirmed via its own
// response: x-corsfix-status: invalid_origin) — and a page opened as a local file
// (file://, e.g. double-clicked instead of served over http) sends exactly that, so
// every corsfix attempt from a file:// page is a guaranteed, wasted failure. Skip it
// entirely in that case rather than eating its timeout on every single request.
// (The real fix is serving this over http — see the README/instructions — but this
// keeps file:// usage from being strictly worse than it has to be.) Filtered by
// reference rather than by position, since ALL_CORS_PROXIES' order isn't fixed.
const CORS_PROXIES = window.location.protocol === 'file:'
    ? ALL_CORS_PROXIES.filter(proxy => proxy !== CORSFIX_PROXY)
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

async function fetchYahooQuote(symbol, range = '1mo') {
    // range=1mo&interval=1d gives ~22 daily closes (a trading month) instead of a single
    // intraday day — this only changes the SPARKLINE source; the live price/change below
    // still comes from `meta` (regularMarketPrice/previousClose), which Yahoo populates
    // the same way regardless of what range/interval the chart itself was requested at,
    // so switching this doesn't make the quote itself any less current.
    const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&_=${Date.now()}`;
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
// of these — it doesn't even publish a 2Y yield index at all, see the comment above
// fetchUsTreasuryYields — so attempting them via the Yahoo proxy would just fail every
// single cycle) — covered instead by fetchBondYields() below. TLT (the ETF row) is
// deliberately NOT in this list — it's a real Yahoo ticker and goes through the normal
// fetchAllYahoo path like any INDICES/COMMODITIES symbol.
const NO_YAHOO_SOURCE_SYMBOLS = ['US02Y=RR', 'US10Y=RR', 'US30Y=RR', 'DE10Y=RR', 'JP10Y=RR'];

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

// Optional local backend (main.py) — reliably covers the symbols that are gated on
// every free cloud API's paid tier but that Yahoo itself has fine: Germany DAX,
// Shanghai Composite, KOSPI, Natural Gas, Copper, Wheat (WTI dropped along with the row
// itself, 2026-09-22 — see the comment above COMMODITIES). Running it is opt-in
// (`uvicorn main:app --port 8000`); if it's not running, this just fails silently and
// these symbols fall back to the existing (flakier) Yahoo-proxy attempt in
// fetchAllYahoo — no regression either way, this only ever makes things better.
const LOCAL_BACKEND_URL = 'http://localhost:8000';
const LOCAL_BACKEND_SYMBOLS = ['000001.SS', '^KS11', 'NG=F', 'HG=F', 'ZW=F'];
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
            if (localBackendAvailable !== true) console.info('Local backend (main.py) detected — using it for DAX/Shanghai/KOSPI/NatGas/Copper/Wheat.');
            localBackendAvailable = true;
            renderAll();
        }
    } catch (e) {
        if (localBackendAvailable !== false) console.info('Local backend not running (this is fine — falling back to the Yahoo proxy for those symbols). Run `uvicorn main:app --port 8000` to enable it.');
        localBackendAvailable = false;
    }
}

// The six BOND10Y rows (2026-09-22, see the comment above that array in
// commodities-crypto.js) span three sources:
//   - US 2Y/10Y/30Y: the U.S. Treasury Department's OWN daily par yield curve — the
//     primary source, and genuinely CORS-enabled (verified directly: a real fetch()
//     from this site's own origin gets response.type 'cors', not 'opaque' — no proxy
//     needed at all). One request per year returns EVERY published tenor (1mo through
//     30yr), which is why fetchUsTreasuryYields() fetches once and reads three columns
//     out of it rather than three separate requests. This also fixes a real gap: Yahoo
//     doesn't publish a 2Y yield index at all (checked directly — ^IRX/^FVX/^TNX/^TYX
//     are the only US yield tickers it has: 13-week/5Y/10Y/30Y, no 2Y), so there was no
//     way to get 2Y from Yahoo even before this switch.
//   - Germany: Bundesbank's own statistics API, series BBSIS...R10XX... (Svensson-method
//     term structure, 10-year residual maturity) — daily, from the Bundesbank itself,
//     via the CORS proxy chain (fetchViaProxies) since it has no CORS header of its own.
//   - Japan: Ministry of Finance's own published JGB yield table — daily, straight from
//     the issuer, via the same CORS proxy chain. The small "current month" file (resets
//     each month) supplies the freshest point every 30-min cycle; a one-time seed from
//     the 1.2MB full-history file (too big to re-fetch every cycle) supplies the rest of
//     the 1-year window — see seedMofJgbHistory.
// Every chart is unified to roughly a 1-year window, per earlier explicit request — a
// bond yield moves gradually on macro drivers, so a short window mostly shows noise; 1
// year is long enough to actually see a hiking/cutting cycle. current/change still
// always come from the two most-recent real observations regardless of the chart's
// span (see setQuoteAndSeriesFromValues) — the window only affects what the sparkline
// draws.
//
// A blocked/bot-checked source (BoE and Bundesbank have both been observed doing this
// at one point or another — see the comment above assertPlausibleYields) still
// answers with HTTP 200, just with an HTML "Sorry" page or a Cloudflare "error code: 520"
// stub instead of real CSV. The naive comma-split parsers below have no way to tell that
// apart from real data on their own — a handful of HTML/CSS lines happen to split into
// exactly two comma-separated fields, and stray numeric-looking fragments in there
// (things like inline "margin: 0 0 10px") parse to a plausible-looking 0 via `+value`.
// That's exactly what corrupted the UK row to a flat "0%, 0% change, no chart" instead
// of leaving it on its last good value (2026-09-22). This is a minimal sanity gate, not
// real CSV validation — every real 10Y government yield on Earth right now is well
// within [-3, 25], so anything outside that (or too few points to be the real daily/
// monthly series) is far more likely to be a parsing accident than a real data point.
//
// The range/count check ALONE turned out not to be enough (still 2026-09-22, same UK
// row, back when this app still had a UK row sourced from BoE): a big HTML "Sorry" page
// has plenty more than 30 lines that happen to comma-split into a stray "0" — clearing
// both the count and range bars, just with the SAME repeated value, which rendered as a
// suspiciously perfect flat line instead of "—". A real daily bond-yield series over a
// year is never actually flat — requireVariance (opt-in, since MOF's single-point
// current-month update can legitimately be genuinely flat/near-flat over a short real
// window) rejects a result with too few distinct readings or too narrow a spread to be
// believable as real day-by-day market data.
function assertPlausibleYields(values, minPoints, label, requireVariance = false) {
    if (values.length < minPoints) throw new Error(`${label}: only ${values.length} point(s), expected at least ${minPoints}`);
    if (values.some(v => !Number.isFinite(v) || v < -3 || v > 25)) {
        throw new Error(`${label}: a parsed value is outside the plausible yield range`);
    }
    if (requireVariance) {
        const distinctCount = new Set(values.map(v => v.toFixed(3))).size;
        const spread = Math.max(...values) - Math.min(...values);
        if (distinctCount < 5 || spread < 0.01) {
            throw new Error(`${label}: values look suspiciously flat/repetitive (${distinctCount} distinct, spread ${spread.toFixed(4)})`);
        }
    }
}

// `seriesValues` (defaults to `values` itself) lets a caller show a DOWNSAMPLED chart
// while still computing current/change from the true last two RAW observations —
// downsampling first would risk losing the actual most-recent point.
function setQuoteAndSeriesFromValues(symbol, values, seriesValues = values) {
    if (values.length < 2) throw new Error('not enough data points');
    const current = values[values.length - 1];
    const prev = values[values.length - 2];
    const change = +(current - prev).toFixed(3);
    const changePercent = prev ? +((change / prev) * 100).toFixed(2) : 0;
    setQuote(symbol, { current, change, change_percent: changePercent });
    setSeries(symbol, seriesValues);
}

// U.S. Treasury Department's own daily par yield curve — genuinely CORS-enabled
// (verified directly, 2026-09-22: a real browser fetch() from this site's own origin
// gets response.type 'cors', not 'opaque' — no proxy needed at all, unlike every other
// proxied source in this file). One CSV per year covers every published tenor (1 Mo
// through 30 Yr) for that whole year, so fetchUsTreasuryYields() fetches the current AND
// previous year once each (covering the turn-of-year case where "this year" alone isn't
// a full trailing year yet) and reads three columns out of the combined result, rather
// than three separate requests. Column labels are matched by NAME (via the header row),
// not position, so a future reordering on Treasury's end wouldn't silently read the
// wrong tenor.
const TREASURY_TENOR_COLUMNS = { 'US02Y=RR': '2 Yr', 'US10Y=RR': '10 Yr', 'US30Y=RR': '30 Yr' };

function parseTreasuryYieldCsv(text, columnLabel) {
    const lines = text.trim().split('\n');
    const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const idx = header.indexOf(columnLabel);
    if (idx < 0) throw new Error(`column "${columnLabel}" not found`);
    // Treasury's file lists newest date first; reverse to oldest-first, matching every
    // other series in this app (setQuoteAndSeriesFromValues expects current/prev as the
    // LAST two entries).
    return lines.slice(1)
        .map(line => line.split(','))
        .filter(cols => cols.length > idx && cols[idx] !== '')
        .map(cols => +cols[idx])
        .reverse();
}

async function fetchTreasuryYearCsv(year) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
    const res = await fetchWithTimeout(url, 9000);
    if (!res.ok) throw new Error('http ' + res.status);
    return res.text();
}

async function fetchUsTreasuryYields() {
    let curText, prevText;
    try {
        const thisYear = new Date().getFullYear();
        [curText, prevText] = await Promise.all([fetchTreasuryYearCsv(thisYear), fetchTreasuryYearCsv(thisYear - 1)]);
    } catch (e) {
        console.warn('U.S. Treasury yield curve fetch failed:', e.message);
        return;
    }
    for (const [symbol, columnLabel] of Object.entries(TREASURY_TENOR_COLUMNS)) {
        try {
            const combined = [...parseTreasuryYieldCsv(prevText, columnLabel), ...parseTreasuryYieldCsv(curText, columnLabel)].slice(-260); // ~1 trading year
            assertPlausibleYields(combined, 30, `Treasury ${symbol}`, true);
            setQuoteAndSeriesFromValues(symbol, combined, downsample(combined, 40));
        } catch (e) {
            console.warn('Treasury yield parse failed for', symbol, e.message);
        }
    }
}

async function fetchBundesbankBondYield() {
    try {
        const from = new Date();
        from.setDate(from.getDate() - 380); // 1 year + extra buffer since some days publish no value (holidays)
        const startPeriod = from.toISOString().slice(0, 10);
        const target = `https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A?format=csv&lang=en&startPeriod=${startPeriod}`;
        const res = await fetchViaProxies(target, 9000);
        const values = (await res.text()).split('\n')
            .filter(line => /^\d{4}-\d{2}-\d{2},/.test(line)) // skips the metadata header rows entirely, however many there are
            .map(line => line.split(','))
            .filter(cols => cols[1] && cols[1] !== '.')
            .map(cols => +cols[1]);
        // The leading-date-pattern filter above already makes a garbage/HTML response
        // unlikely to produce anything — this is just the same defense-in-depth range
        // check used for the other proxied bond-yield sources (see the comment above
        // assertPlausibleYields).
        assertPlausibleYields(values, 30, 'Bundesbank DE10Y', true);
        setQuoteAndSeriesFromValues('DE10Y=RR', values, downsample(values, 40));
    } catch (e) {
        console.warn('Bundesbank bond yield fetch failed:', e.message);
    }
}

function mofExtract10y(csvText) {
    const lines = csvText.trim().split('\n');
    const header = lines[1].split(','); // "Date,1Y,2Y,...,10Y,15Y,..."
    const idx10y = header.indexOf('10Y');
    if (idx10y < 0) throw new Error('10Y column not found');
    return lines.slice(2)
        .map(line => line.split(','))
        .filter(cols => cols.length > idx10y && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cols[0]) && cols[idx10y] !== '-' && cols[idx10y] !== '')
        .map(cols => +cols[idx10y]);
}

// MOF's small "current month" file (used below, every 30-min cycle) resets on the 1st
// of every month, so on its own it can't cover a 1-year window. mofJgbBaseline holds
// the last ~260 RAW (pre-downsample) trading days from MOF's full historical file
// (1.2MB — too big to re-fetch every cycle, so this only runs ONCE per page load,
// skipped entirely if a decent series is already cached). Every cycle,
// fetchMofJgbYield() appends the current month's fresh values onto whatever part of
// this baseline they don't yet cover, then downsamples the combined ~1-year window to
// a clean 40-point chart. Seeded into the real series cache via setSeriesIfMissing so
// a fresh page load doesn't show "—" while waiting for this to land.
let mofJgbBaseline = null;
const MOF_JGB_WINDOW = 260; // ~1 trading year
async function seedMofJgbHistory() {
    if (mofJgbBaseline && mofJgbBaseline.length >= 200) return;
    try {
        const res = await fetchViaProxies('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv', 15000);
        const values = mofExtract10y(await res.text());
        // mofExtract10y's own header/date-pattern requirements already make a garbage
        // response unlikely to parse into anything — this range check is just the same
        // defense-in-depth used for the other proxied bond-yield sources (see the
        // comment above assertPlausibleYields).
        assertPlausibleYields(values, 2, 'MOF JGB history seed');
        mofJgbBaseline = values.slice(-MOF_JGB_WINDOW);
        setSeriesIfMissing('JP10Y=RR', downsample(mofJgbBaseline, 40));
    } catch (e) {
        console.warn('MOF Japan JGB history seed failed:', e.message);
    }
}

async function fetchMofJgbYield() {
    try {
        const res = await fetchViaProxies('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv', 9000);
        const values = mofExtract10y(await res.text());
        assertPlausibleYields(values, 1, 'MOF JGB current month');
        const older = mofJgbBaseline ? mofJgbBaseline.slice(0, Math.max(0, MOF_JGB_WINDOW - values.length)) : [];
        const combined = [...older, ...values];
        setQuoteAndSeriesFromValues('JP10Y=RR', combined, downsample(combined, 40));
    } catch (e) {
        console.warn('MOF Japan JGB yield fetch failed:', e.message);
    }
}

// None of these sources actually publish more than once a day, so most 1-minute cycles
// just re-confirm the same reading rather than finding a new one — but per earlier
// explicit request, every bond yield row shares the same 1-minute cadence as the rest
// of the page (see the setInterval near window.onload) instead of a slower one.
// Covers the five non-Yahoo rows (US 2Y/10Y/30Y, Germany, Japan) — the ETF row (TLT)
// goes through the normal fetchAllYahoo path instead, since it's a real Yahoo ticker.
async function fetchBondYields() {
    await Promise.allSettled([fetchUsTreasuryYields(), fetchBundesbankBondYield(), fetchMofJgbYield()]);
    renderAll();
    saveSeriesCache(); // persists Japan's expensive one-time-seeded baseline too, so a reload within the 24h cache TTL never re-downloads MOF's 1.2MB history file
}

function fetchAllMarketData() {
    fetchAllYahoo();
    fetchAllFX();
    fetchAllCrypto();
    fetchLocalBackend();
}

