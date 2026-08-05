// Every displayed figure is rounded (not truncated) to at most 2 decimal places,
// regardless of how many decimals the source data/computation produced.
function fmt2(n) {
    // Round first (not just cap display digits) so a tiny negative value that rounds
    // to zero (e.g. Tether's change) prints "0", not a stray "-0".
    const rounded = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    return (rounded === 0 ? 0 : rounded).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Minimal inline SVG sparkline — no charting library, matching this file's
// no-external-deps style. Renders nothing but an em-dash placeholder when there's no
// series (never a fabricated line) so the 3-column layout stays aligned either way.
function sparklineSvg(series, isUp) {
    if (!series || series.length < 2) return '<span class="spark-empty">—</span>';
    const w = 76, h = 26, pad = 2;
    const min = Math.min(...series), max = Math.max(...series);
    const range = (max - min) || 1;
    const points = series.map((v, i) => {
        const x = pad + (i / (series.length - 1)) * (w - pad * 2);
        const y = pad + (1 - (v - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const color = isUp ? '#22c55e' : '#ef4444';
    return `<svg viewBox="0 0 ${w} ${h}" class="spark-svg" preserveAspectRatio="none">` +
        `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// pinned=true is for rows that stay at the top of their section regardless of language
// or base-currency selection (Dollar Index, VIX) — dark-gray box + white label, per the
// user's request, but the sparkline keeps the normal green/red up/down coloring.
function renderItem(label, item, unit, series, pinned = false) {
    if (!item) return `<div class="text-red-500 text-sm">${label} : N/A</div>`;
    const isUp = item.change >= 0;
    const colorClass = isUp ? 'text-green-500' : 'text-red-500';
    const sign = isUp ? '+' : '';
    const u = unit || '';
    const rowClass = pinned
        ? 'grid grid-cols-[1fr_80px_1fr] items-center gap-2 text-sm border-b border-gray-950 h-[45px] bg-gray-800 rounded px-2 -mx-2'
        : 'grid grid-cols-[1fr_80px_1fr] items-center gap-2 text-sm border-b border-gray-950 pb-2 h-[45px]';
    const labelClass = pinned ? 'pinned-white font-bold text-left truncate' : 'text-gray-400 font-bold text-left truncate';
    const valueClass = pinned ? 'pinned-white font-mono' : 'text-white font-mono';
    return `
        <div class="${rowClass}">
            <span class="${labelClass}">${label}</span>
            <div class="flex justify-center">${sparklineSvg(series, isUp)}</div>
            <div class="text-right">
                <div class="${valueClass}">${fmt2(item.current)}${u}</div>
                <div class="${colorClass} text-xs font-mono">${sign}${fmt2(item.change)}${u} (${sign}${fmt2(item.change_percent)}%)</div>
            </div>
        </div>
    `;
}

// Shared by Policy Rate and Bond Yield — neither is a live tick-by-tick change like
// everything else renderItem() handles (policy rates only move on decision days; bond
// yields here are compared against a fixed "as of" checkpoint, not yesterday's close),
// so the sub-line names the reference level explicitly ("Prev 3.63% (+3.31%p)") instead
// of showing a raw relative-% change.
// withChart/series are only passed by Bond Yield (Policy Rate has no live chart source
// — only 8 discrete decisions/year — so it stays on the plain 2-column layout below).
function renderRateItem(label, prevRate, item, withChart, series, pctSuffix = '%p') {
    if (!item) return `<div class="text-red-500 text-sm">${label} : N/A</div>`;
    const isHeld = item.change === 0;
    const isUp = item.change >= 0;
    const colorClass = isHeld ? 'text-gray-400' : (isUp ? 'text-green-500' : 'text-red-500');
    const sign = isUp ? '+' : '';
    const t = translations[currentLang];
    // A relative % change (e.g. 2.50→2.75 as "+10%") reads as a much bigger move than
    // a rate decision actually is — central-bank moves are conventionally sized in
    // percentage POINTS (here, "+0.25%p"), so that's what's shown by default, not
    // change_percent. Bond Yield overrides this to plain "%" per explicit request; the
    // underlying number is unchanged either way (still the point difference), only the
    // suffix differs.
    const changeText = isHeld ? `(${t.heldLabel})` : `(${sign}${fmt2(item.change)}${pctSuffix})`;
    if (withChart) {
        return `
            <div class="grid grid-cols-[1fr_80px_1fr] items-center gap-2 text-sm border-b border-gray-950 pb-2 h-[45px]">
                <span class="text-gray-400 font-bold text-left truncate">${label}</span>
                <div class="flex justify-center">${sparklineSvg(series, isUp)}</div>
                <div class="text-right">
                    <div class="text-white font-mono">${fmt2(item.current)}%</div>
                    <div class="${colorClass} text-xs font-mono">${t.prevLabel} ${fmt2(prevRate)}% ${changeText}</div>
                </div>
            </div>
        `;
    }
    return `
        <div class="flex justify-between items-center text-sm border-b border-gray-950 pb-2">
            <span class="text-gray-400 font-bold">${label}</span>
            <div class="text-right">
                <div class="text-white font-mono">${fmt2(item.current)}%</div>
                <div class="${colorClass} text-xs font-mono">${t.prevLabel} ${fmt2(prevRate)}% ${changeText}</div>
            </div>
        </div>
    `;
}

// Regular-session open/closed check in the exchange's own timezone (weekends always
// closed; holidays aren't accounted for — see the INDICES comment above).
function isMarketOpen(hours) {
    if (!hours) return false;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: hours.tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type).value;
    const weekday = get('weekday');
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const nowMin = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
    return hours.sessions.some(session => {
        const [start, end] = session.split('-');
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
    });
}

// Same as renderItem(), plus an open/closed dot in front of the exchange name — a
// pulsing green dot while its regular session is live, a static red dot otherwise.
function renderMarketItem(label, item, open, series, pinned = false, alertTier = null) {
    if (!item) return `<div class="text-red-500 text-sm">${label} : N/A</div>`;
    const isUp = item.change >= 0;
    const colorClass = isUp ? 'text-green-500' : 'text-red-500';
    const sign = isUp ? '+' : '';
    const dot = `<span class="market-dot ${open ? 'open' : 'closed'}"></span>`;
    const alertClass = alertTier === 'emergency-down' ? ' market-alert-emergency-down'
        : alertTier === 'emergency-up' ? ' market-alert-emergency-up'
        : alertTier === 'warning' ? ' market-alert-warning' : '';
    const rowClass = pinned
        ? 'grid grid-cols-[1fr_80px_1fr] items-center gap-2 text-sm border-b border-gray-950 h-[45px] bg-gray-800 rounded px-2 -mx-2'
        : `grid grid-cols-[1fr_80px_1fr] items-center gap-2 text-sm border-b border-gray-950 pb-2 h-[45px]${alertClass}`;
    const labelClass = pinned ? 'pinned-white font-bold text-left truncate' : 'text-gray-400 font-bold text-left truncate';
    const valueClass = pinned ? 'pinned-white font-mono' : 'text-white font-mono';
    return `
        <div class="${rowClass}">
            <span class="${labelClass}">${dot}${label}</span>
            <div class="flex justify-center">${sparklineSvg(series, isUp)}</div>
            <div class="text-right">
                <div class="${valueClass}">${fmt2(item.current)}</div>
                <div class="${colorClass} text-xs font-mono">${sign}${fmt2(item.change)} (${sign}${fmt2(item.change_percent)}%)</div>
            </div>
        </div>
    `;
}

function getData(symbol, fallback) {
    return cachedData[symbol] || fallback;
}

function setForexBase(base) {
    forexBase = base;
    document.querySelectorAll('.fx-base-btn').forEach(btn => btn.classList.remove('map-style-active'));
    document.getElementById(`btn-fx-${base.toLowerCase()}`).classList.add('map-style-active');
    renderAll();
}

// Stock Exchange volatility alerts — off by default on every load/refresh. Applies to
// INDICES only (the regular exchange rows); VIX is a separate PINNED_MARKET row and is
// never passed through computeMarketAlertTier, so it's untouched by design either way.
let marketAlertsEnabled = false;
const MARKET_ALERT_WARNING = { daily: 1.2, weekly: 3.5, monthly: 7.5 };
const MARKET_ALERT_EMERGENCY = { daily: 3.0, weekly: 7.0, monthly: 15.0 };

function toggleMarketAlerts() {
    marketAlertsEnabled = !marketAlertsEnabled;
    updateMarketAlertsButton();
    renderAll();
}

// State is shown by color alone (map-style-active fills it green when on), same as
// the map style / FX base toggle buttons elsewhere on the page — no "켜짐/꺼짐"(ON/OFF)
// text needed once the fill does that job.
function updateMarketAlertsButton() {
    const btn = document.getElementById('market-alerts-btn');
    if (!btn) return;
    btn.innerText = currentLang === 'ko' ? '알림' : 'Alerts';
    btn.classList.toggle('map-style-active', marketAlertsEnabled);
}

// Daily change comes straight from the live quote (current vs previous close — the most
// accurate "today" figure available). Weekly/monthly are approximated from the same
// ~1-month daily-close series already fetched for the sparkline (see fetchYahooQuote) —
// weekly = latest vs ~5 trading days back, monthly = latest vs the oldest point in that
// series — rather than fetching yet another data source just for this. Emergency wins
// over warning if a symbol clears both.
// Emergency tier is direction-aware (red for a decline, green for a rise) since at that
// severity the direction is the actual headline; warning stays plain yellow either way.
function computeMarketAlertTier(item, series) {
    const dailyPct = item ? Math.abs(item.change_percent) : 0;
    let weeklyPct = 0, monthlyPct = 0;
    if (Array.isArray(series) && series.length >= 2) {
        const last = series[series.length - 1];
        const first = series[0];
        if (first) monthlyPct = Math.abs((last - first) / first * 100);
        const weekVal = series[Math.max(0, series.length - 6)];
        if (weekVal) weeklyPct = Math.abs((last - weekVal) / weekVal * 100);
    }
    if (dailyPct >= MARKET_ALERT_EMERGENCY.daily || weeklyPct >= MARKET_ALERT_EMERGENCY.weekly || monthlyPct >= MARKET_ALERT_EMERGENCY.monthly) {
        return (item && item.change_percent >= 0) ? 'emergency-up' : 'emergency-down';
    }
    if (dailyPct >= MARKET_ALERT_WARNING.daily || weeklyPct >= MARKET_ALERT_WARNING.weekly || monthlyPct >= MARKET_ALERT_WARNING.monthly) {
        return 'warning';
    }
    return null;
}

function renderAll() {
    const forexList = currentLang === 'ko' ? FOREX_KO : (forexBase === 'USD' ? FOREX_EN_USD : FOREX_EN_GBP);
    document.getElementById('unit-forex').innerText = currentLang === 'ko' ? '(원)' : `(${forexBase})`;
    document.getElementById('forex-base-toggle').classList.toggle('hidden', currentLang === 'ko');
    document.getElementById('forex-container').innerHTML =
        PINNED_FX.map(f => renderItem(currentLang === 'ko' ? f.ko : f.en, getData(f.symbol, f.fallback), '', getSeries(f.symbol), true)).join('') +
        forexList.map(f => renderItem(currentLang === 'ko' ? f.ko : f.en, getData(f.symbol, f.fallback), '', getSeries(f.symbol))).join('');

    document.getElementById('policy-rate-container').innerHTML = POLICY_RATES.map(p => {
        // ECB is the one central bank here with a public, CORS-enabled data API (see
        // fetchECBPolicyRate) — when that live fetch has landed, it overrides the
        // curated fallback; the other five have no equivalent free/keyless/CORS-open
        // source, so they stay on curated figures (see POLICY_RATES_UPDATED_AT above).
        const live = p.liveSymbol && cachedData[p.liveSymbol];
        const rate = live ? live.current : p.rate;
        const prevRate = live ? live.prevRate : p.prevRate;
        const change = +(rate - prevRate).toFixed(2);
        return renderRateItem(currentLang === 'ko' ? p.ko : p.en, prevRate, { current: rate, change });
    }).join('');
    document.getElementById('bond-yield-container').innerHTML = BOND10Y.map(b => {
        const data = getData(b.symbol, b.fallback);
        const current = data.current;
        // '^TNX' always carries a real day-over-day change (Yahoo's own previousClose);
        // the FRED-sourced 5 (UK/France/Germany/Japan/Korea) carry a real
        // month-over-month change once fetchFredBondYields lands — China has no live
        // source at all. Prefer that real previous-period comparison whenever it
        // exists; only fall back to the fixed curated checkpoint (b.prevYield) when
        // nothing live has landed yet (e.g. right after page load, or China always).
        const hasLiveChange = data.change != null;
        const change = hasLiveChange ? +data.change.toFixed(2) : +(current - b.prevYield).toFixed(2);
        const prevForDisplay = hasLiveChange ? +(current - change).toFixed(2) : b.prevYield;
        // Same plain +/- (change / relative %) format as FX/Market/Commodities/Crypto —
        // no "Prev X%" wording — per explicit request, rather than the Policy Rate style
        // renderRateItem() normally shows.
        const changePercent = prevForDisplay ? +((change / prevForDisplay) * 100).toFixed(2) : 0;
        return renderItem(currentLang === 'ko' ? b.ko : b.en, { current, change, change_percent: changePercent }, '%', getSeries(b.symbol));
    }).join('');

    document.getElementById('market-container').innerHTML =
        PINNED_MARKET.map(idx => renderMarketItem(currentLang === 'ko' ? idx.ko : idx.en, getData(idx.symbol, idx.fallback), isMarketOpen(idx.hours), getSeries(idx.symbol), true)).join('') +
        INDICES.map(idx => {
            const data = getData(idx.symbol, idx.fallback);
            const series = getSeries(idx.symbol);
            const alertTier = marketAlertsEnabled ? computeMarketAlertTier(data, series) : null;
            return renderMarketItem(currentLang === 'ko' ? idx.ko : idx.en, data, isMarketOpen(idx.hours), series, false, alertTier);
        }).join('');

    document.getElementById('commodities-container').innerHTML = COMMODITIES.map(c =>
        renderItem(currentLang === 'ko' ? c.ko : c.en, getData(c.symbol, c.fallback), '', getSeries(c.symbol))
    ).join('');

    document.getElementById('crypto-container').innerHTML = CRYPTO.map(c =>
        renderItem(currentLang === 'ko' ? c.ko : c.en, getData(c.symbol, c.fallback), '', getSeries(c.symbol))
    ).join('');

    renderNewsLists();
    alignColumnBottoms();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

