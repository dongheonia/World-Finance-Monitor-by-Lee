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
    // Cadences match how the project is described (2026-10-10, explicit request): the
    // 36 market indicators (FX, rates, equities, commodities, crypto) refresh every
    // hour; map events are rebuilt daily (GitHub Actions, see
    // .github/workflows/refresh-auto-data.yml) and GDACS disaster alerts are re-read on
    // the same daily cadence; the news box and ticker stay live at 1 minute. Every
    // fetch also runs once on page load (above), so a fresh visit always starts current.
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    setInterval(fetchAllMarketData, HOUR);
    setInterval(fetchBondYields, HOUR);
    setInterval(fetchPolicyRates, HOUR);
    setInterval(fetchProxiedSparklines, HOUR);
    setInterval(fetchCryptoSparklines, HOUR);
    setInterval(fetchAllNews, 60000);
    setInterval(fetchDisasterEvents, DAY);
    setInterval(fetchAutoData, DAY);
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
