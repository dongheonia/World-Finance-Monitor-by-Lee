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
    // FX, stock indices, and commodities all refresh every 1 minute now — the
    // FMP-covered subset (7 major indices, Brent/Gold/Silver) moved onto the same free
    // Yahoo-proxy path everything else uses (see the note above fetchAllFmp in
    // market-data.js), since testing confirmed Yahoo serves real live data for all of
    // them. This is already effectively real-time for a free/unofficial data source
    // (Yahoo's unofficial chart API has no faster official cadence to chase, and going
    // below 60s risks tripping the free CORS proxies' own rate limiting — see
    // ALL_CORS_PROXIES — which would make the numbers LESS reliable, not more real-time).
    // Both US Treasury yields (10Y/2Y) stay on FMP at 10 minutes — 10Y could run at
    // 1-minute like everything else (Yahoo has a real '^TNX' ticker), but 2Y has no
    // free ticker anywhere and has to stay on FMP regardless, so both are kept on the
    // same cadence by request rather than showing mismatched refresh rates side by
    // side. FMP's quota easily supports this: one treasury-rates call returns both
    // readings together, so 10-minute cadence is only ~144 of its 250-calls/day cap.
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
    setInterval(fetchAllFmp, 10 * 60 * 1000);
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
            alignCalendarDivider();
            if (mapInstance) mapInstance.resize();
        }, 150);
    });
    watchColumnResize();
    setTimeout(alignColumnBottoms, 400);
};
