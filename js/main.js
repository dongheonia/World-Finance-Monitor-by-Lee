window.onload = () => {
    // loadSeriesCache() FIRST — it does a wholesale replacement of the in-memory series
    // cache (seriesCache = parsed.series), not a merge. Calling seedFallbackCache()
    // before it used to seed China's approxSeries (see setSeriesIfMissing below) only
    // for a stale localStorage snapshot saved before that feature existed — one with no
    // 'CN10Y=RR' key at all — to immediately overwrite it and wipe the seed out again,
    // permanently (nothing else will ever fetch a real China series to replace it).
    // seedFallbackCache()'s setSeriesIfMissing calls only make sense run AFTER whatever
    // real cached data exists has already been loaded, to fill in the actual gaps.
    loadSeriesCache(); // paint real (if slightly stale) charts instantly instead of leaving rows blank until a live fetch lands
    seedFallbackCache();
    const cachedNews = loadNewsCache();
    if (cachedNews) masterNews = cachedNews; // paint the real news list instantly instead of the sparse fallback while fetchAllNews() refreshes it
    initMap();
    updateStaticLabels();
    renderAll();
    renderTicker();
    renderCalendar();
    requestAnimationFrame(centerCalendarOnToday); // wait a frame so layout/offsetTop are settled
    fetchAllMarketData();
    // Run concurrently, not sequentially — the one-time Japan history seed (see the
    // comment above seedMofJgbHistory) fetches a 1.2MB file and can take a few seconds,
    // and there's no reason to make every other country's bond yield wait on it. Worst
    // case, Japan's very first 30-min cycle this session has less padding than usual
    // and picks up the rest on the next one once the seed has landed.
    seedMofJgbHistory();
    fetchNonUsBondYields();
    fetchECBPolicyRate();
    fetchAllNews();
    fetchProxiedSparklines();
    fetchCryptoSparklines();
    setTimeout(retryMissingSparklines, 45000);
    // FX, stock indices, commodities, and US 10Y bond yield all refresh every 1 minute
    // now — the indices/commodities that used to be throttled to FMP's 70-minute cycle
    // moved onto the same free Yahoo-proxy path everything else uses (see the note
    // above NO_YAHOO_SOURCE_SYMBOLS in market-data.js), since testing confirmed Yahoo
    // serves real live data for all of them, '^TNX' included. This is already
    // effectively real-time for a free/unofficial data source (Yahoo's unofficial
    // chart API has no faster official cadence to chase, and going below 60s risks
    // tripping the free CORS proxies' own rate limiting — see ALL_CORS_PROXIES — which
    // would make the numbers LESS reliable, not more real-time).
    // The non-US bond yields (UK/Germany/Japan now daily from their own central
    // bank/debt office; France/Korea monthly from FRED) never publish more than once a
    // day — polling that on a 1-minute cycle would just hammer the shared CORS-proxy
    // pool for zero benefit, so it gets its own 30-minute cadence instead (see the
    // comment above fetchNonUsBondYields).
    // The ECB policy rate moves at most ~8x/year and only publishes once a day, so
    // there's no real data to be "more real-time" about — hourly already checks far
    // more often than the underlying series can change; the other 5 central banks have
    // no free live source at all (see the comment above fetchECBPolicyRate) and are
    // updated by hand whenever they actually announce a change.
    // Sparklines are the one place there was genuine slack: the FX-only sparkline fetch
    // shares the same CORS-proxy pool as the price fetch above, so 5 minutes balances
    // freshness against not adding enough extra proxy load to start degrading the price
    // numbers. Crypto's sparkline (CoinGecko's /market_chart, direct/keyless/no-proxy —
    // see fetchCryptoSparklines) has no such shared-proxy downside, so it runs on its
    // own much faster 2-minute cadence.
    setInterval(fetchAllMarketData, 60000);
    setInterval(fetchNonUsBondYields, 30 * 60 * 1000);
    setInterval(fetchECBPolicyRate, 60 * 60 * 1000);
    setInterval(fetchAllNews, 60000);
    setInterval(fetchProxiedSparklines, 5 * 60 * 1000);
    setInterval(fetchCryptoSparklines, 2 * 60 * 1000);
    updateClocks();
    setInterval(updateClocks, 1000);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            alignColumnBottoms();
            if (mapInstance) mapInstance.resize();
        }, 150);
    });
    watchColumnResize();
    setTimeout(alignColumnBottoms, 400);
};
