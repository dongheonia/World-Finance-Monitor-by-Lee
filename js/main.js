window.onload = () => {
    // loadSeriesCache() FIRST — it does a wholesale replacement of the in-memory series
    // cache (seriesCache = parsed.series), not a merge, so any setSeriesIfMissing call
    // elsewhere in the startup sequence only makes sense run AFTER whatever real cached
    // data exists has already been loaded, to fill in the actual gaps rather than being
    // immediately wiped out by it.
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
    // case, Japan's first 1-min cycle this session has less padding than usual and
    // picks up the rest on the next one once the seed has landed.
    seedMofJgbHistory();
    fetchBondYields();
    fetchPolicyRates();
    fetchDisasterEvents();
    fetchAutoData();
    fetchAllNews();
    fetchProxiedSparklines();
    fetchCryptoSparklines();
    setTimeout(retryMissingSparklines, 45000);
    // Every live figure polls every 1 minute (2026-10-10, explicit request: everything
    // on the shortest cadence that can actually be automated). Going below 60s risks
    // tripping the free CORS proxies' own rate limiting (see ALL_CORS_PROXIES), which
    // would make the numbers LESS reliable, not more real-time. How often each number
    // actually CHANGES is up to its source — see the footer (footerRefresh* in
    // translations.js), which states that honestly per section:
    //  - indices/commodities/FX/TLT (Yahoo), bond yields (CNBC), crypto (CoinGecko):
    //    intraday, so a 1-minute poll really does pick up a new value each time;
    //  - bond-yield charts (Treasury/Bundesbank/MOF) and policy rates (ECB/BIS/ECOS):
    //    published once a day at most, so most polls just re-confirm the last reading;
    //  - news-derived map events and calendar values (fetchAutoData): rebuilt every 15
    //    minutes by GitHub Actions (scripts/refresh-auto-data.mjs).
    // The pinned-row sparkline backup (fetchProxiedSparklines) stays at 5 minutes — those
    // rows already get a fresh chart with every 1-minute price fetch, and this only
    // exists to catch a proxy miss without doubling the shared proxy load.
    setInterval(fetchAllMarketData, 60000);
    setInterval(fetchBondYields, 60000);
    setInterval(fetchPolicyRates, 60000);
    setInterval(fetchAllNews, 60000);
    setInterval(fetchDisasterEvents, 60000);
    setInterval(fetchAutoData, 60000);
    setInterval(fetchProxiedSparklines, 5 * 60 * 1000);
    setInterval(fetchCryptoSparklines, 60000);
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
