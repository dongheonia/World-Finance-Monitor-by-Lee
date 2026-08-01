window.onload = () => {
    seedFallbackCache();
    loadSeriesCache(); // paint real (if slightly stale) charts instantly instead of leaving rows blank until a live fetch lands
    const cachedNews = loadNewsCache();
    if (cachedNews) masterNews = cachedNews; // paint the real news list instantly instead of the sparse fallback while fetchAllNews() refreshes it
    initMap();
    updateStaticLabels();
    renderAll();
    renderTicker();
    renderCalendar();
    requestAnimationFrame(centerCalendarOnToday); // wait a frame so layout/offsetTop are settled
    fetchAllMarketData();
    fetchAllFmp();
    fetchECBPolicyRate();
    fetchAllNews();
    fetchProxiedSparklines();
    fetchCryptoSparklines();
    setTimeout(retryMissingSparklines, 45000);
    // Every section (FX, rates, markets, commodities, crypto) refreshes every 1 minute,
    // showing only the latest values — no historical values are kept beyond what's
    // needed to compute the change vs. the previous reading. The FMP-covered subset
    // (see the note above FMP_API_KEY) is the one exception — its free-tier daily quota
    // only allows a safe ~75-minute cadence. The ECB policy rate moves at most ~8x/year,
    // so an hourly check is already far more often than it could ever actually change.
    // Sparkline-only fetches (FMP-covered + FX symbols' charts, crypto's 7d chart) are
    // on their own slow 10-minute cadence — a chart is fine running a bit behind the
    // price next to it, and it keeps this from adding load to the already-flaky CORS
    // proxies on top of the 1-minute price cycle.
    setInterval(fetchAllMarketData, 60000);
    setInterval(fetchAllFmp, 75 * 60 * 1000);
    setInterval(fetchECBPolicyRate, 60 * 60 * 1000);
    setInterval(fetchAllNews, 60000);
    setInterval(fetchProxiedSparklines, 10 * 60 * 1000);
    setInterval(fetchCryptoSparklines, 10 * 60 * 1000);
    updateClocks();
    setInterval(updateClocks, 1000);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            alignColumnBottoms();
            alignCalendarDivider();
            if (mapInstance) mapInstance.resize();
        }, 150);
    });
    watchColumnResize();
    setTimeout(alignColumnBottoms, 400);
};
