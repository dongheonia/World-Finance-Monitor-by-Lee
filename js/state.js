let currentLang = 'ko';
let currentTheme = 'light';
let forexBase = 'USD'; // English-mode FX base currency toggle (USD/GBP); Korean mode is always KRW-based
let cachedData = {};
let symbolUpdatedAt = {}; // symbol -> Date.now() of its last successful live update

// Every place a fetch writes a live value into cachedData should go through this, so
// the "최근 업데이트" timestamp shown under each section title reflects real data
// landing, not just "we attempted a fetch" (which could've failed and changed nothing).
function setQuote(symbol, quote) {
    cachedData[symbol] = quote;
    symbolUpdatedAt[symbol] = Date.now();
}

// Mini sparkline series shown in the FX/Market/Commodities/Crypto rows — kept separate
// from cachedData since it's supplementary (a row with no series just renders without a
// chart, never a fabricated one) and comes from different endpoints per section: see
// fetchAllFX (real multi-day FX history already being fetched), fetchCryptoSparklines
// (CoinGecko's 7d sparkline field), and fetchSparklineSeries (Yahoo's intraday chart
// series, for indices/commodities — including the FMP-covered ones, since FMP's
// quote-short endpoint has no series of its own).
let seriesCache = {};
function setSeries(symbol, values) {
    if (Array.isArray(values) && values.length >= 2) seriesCache[symbol] = values;
}
function getSeries(symbol) {
    return seriesCache[symbol];
}
// Used where a cheap/sparse series (Frankfurter's ~5-point daily FX history) should
// only ever serve as a first-paint placeholder, never clobber the richer intraday
// series fetchProxiedSparklines fetches for the same symbol once that lands.
function setSeriesIfMissing(symbol, values) {
    if (!getSeries(symbol)) setSeries(symbol, values);
}

// Charts sourced through the free CORS proxies (Market/Commodities' FMP-covered
// symbols, and the non-FMP ones riding along with fetchYahooQuote) can randomly fail on
// any given page load — the proxies are flaky independent of anything this app
// controls, so a symbol that worked on the last reload can just as easily fail on the
// next one. That's what "새로고침 할때마다 랜덤으로 차트가 안 보여" was about.
// Persisting the last successfully-fetched series in localStorage — same fix, same
// reasoning as NEWS_CACHE_KEY below — means a reload paints a real (if up to a day
// stale) chart INSTANTLY instead of leaving that row blank until a live fetch happens
// to land. FX/crypto rarely fail (direct fetch, no proxy) but are cached too for
// consistency and an instant first paint.
const SERIES_CACHE_KEY = 'financeMonitor.seriesCache.v1';
const SERIES_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function saveSeriesCache() {
    try {
        localStorage.setItem(SERIES_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), series: seriesCache }));
    } catch (e) {
        // Private browsing / storage disabled / quota exceeded — fine, just skip caching.
    }
}

function loadSeriesCache() {
    try {
        const raw = localStorage.getItem(SERIES_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.series !== 'object' || parsed.series === null) return;
        if (Date.now() - parsed.savedAt > SERIES_CACHE_MAX_AGE_MS) return;
        seriesCache = parsed.series;
    } catch (e) {
        // ignore — just starts with an empty cache
    }
}

let masterNews = []; // deduped, classified, importance-sorted news pool shared by news box + ticker

// A hard refresh used to always start from the tiny ~20-item FALLBACK_NEWS list and
// wait several seconds (however long the CORS-proxy chain takes across 9 feeds) before
// real news appeared — that wait is what "새로고침 시 뉴스가 바로바로 안 나와" was
// about. Caching the last successfully-fetched pool in localStorage means a reload can
// paint the full, real news list INSTANTLY from cache while fetchAllNews() quietly
// refreshes it in the background, instead of visibly regressing to the sparse fallback
// every single time.
const NEWS_CACHE_KEY = 'financeMonitor.newsCache.v1';
const NEWS_CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // stale news isn't worth showing as if it were fresh

function saveNewsCache() {
    try {
        localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: masterNews }));
    } catch (e) {
        // Private browsing / storage disabled / quota exceeded — fine, just skip caching.
    }
}

function loadNewsCache() {
    try {
        const raw = localStorage.getItem(NEWS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
        if (Date.now() - parsed.savedAt > NEWS_CACHE_MAX_AGE_MS) return null;
        parsed.items.forEach(n => {
            n.pubDate = new Date(n.pubDate);
            // Re-run cleanTitle() too, not just re-classify — a cached title was cleaned
            // ONCE, at fetch time, with whatever cleanTitle() logic existed then. A fix
            // to that function (e.g. stripping "Title/Source" with no surrounding
            // spaces) otherwise has no effect on already-cached items until the RSS feed
            // happens to rotate them out, which reads as "the fix didn't work" — same
            // story as the classification staleness below. Re-cleaning an
            // already-cleaned title is safe/idempotent (no match on a clean title just
            // returns it unchanged). If this actually changes anything, the existing
            // Korean translation (of the OLD, un-stripped title) is now stale too, so
            // it's cleared to force a fresh one instead of showing a mismatched
            // translation that still has the outlet name baked in.
            const recleaned = cleanTitle(n.title);
            if (recleaned !== n.title) {
                n.title = recleaned;
                delete n.titleKo;
            }
            // Re-classify from the CURRENT classifyNews() logic rather than trusting the
            // topic/group baked in when this was cached — otherwise a classifier fix
            // (e.g. teaching it to recognize sports-figure obituaries) has no visible
            // effect until the cache happens to expire (up to NEWS_CACHE_MAX_AGE_MS
            // later), which reads as "the fix didn't work" even though it did.
            const reclassified = classifyNews(n.title);
            n.topic = reclassified.topic;
            n.group = reclassified.group;
        });
        return parsed.items;
    } catch (e) {
        return null;
    }
}
let mapInstance = null;
let currentMapStyle = 'map'; // 'map' | 'satellite'
let newsTab = 'world'; // which tab is active in the combined news box
// world/economic show the same count. The news card spans the calendar row + data row
// combined (see #main-grid in styles.css), so there's plenty of scrollable room for
// more than a screen's worth. Matches the pool cap in applyNewsPool() (see the comment
// there) — no point rendering more than the pool ever actually holds.
const NEWS_ITEMS_PER_TAB = 150;

// ---------------------------------------------------------------
// LIVE DATA NOTES:
// - Yahoo Finance has no official public/CORS API, so this page calls
//   its unofficial chart endpoint through a public CORS proxy
//   (allorigins.win) with a cache-busting param and a 15s poll — close
//   to the practical ceiling for a pure client-side page.
// - Central bank POLICY rates are not a market instrument anywhere
//   (Yahoo included) — central banks only change them ~8x/year, so
//   these are manually curated reference values (shown as the change
//   vs. the previous announced level, not a daily change), not a
//   live tick. Please double check against each central bank's site.
// - International 10Y government bond yields beyond the US (^TNX)
//   aren't reliably available on free Yahoo endpoints; success can
//   vary tick to tick.
// - News headlines are pulled live from BBC/CNN RSS plus Google News
//   searches scoped to reuters.com / bloomberg.com (their own public
//   RSS is discontinued), via the rss2json.com proxy. Korean titles
//   are machine-translated client-side.
// - Risk-map circles/dots are a manually curated, best-effort snapshot of
//   active conflict areas, major natural disasters, and structural economic risk —
//   this changes with events on the ground and should be treated as illustrative,
//   not authoritative.
// ---------------------------------------------------------------

// Manually curated, best-effort snapshot of active armed conflict (not whole national
// territories) — shown as red-bordered/light-red circles on the map. `radius` is the
// approximate real-world affected radius in km (a circle can't capture an irregular
// front line or multi-region conflict precisely, but this keeps the size grounded in
// the real extent of each conflict rather than an arbitrary constant).
// `reasonKo`/`reasonEn` explain WHY the zone is marked — shown in the click popup.
