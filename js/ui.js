// ============================ COLUMN BOTTOM ALIGNMENT ============================
// The middle/right columns (rates / markets) hold a different number of cards with
// variable-length live text, so their natural heights drift. They're only actually
// side by side at the lg breakpoint and up — below that #main-grid stacks everything
// into one column (see the grid-template-areas in styles.css). Comparing top positions
// (not a hardcoded breakpoint width) tells the two apart directly from the real
// layout, however it got there. Both alignColumnBottoms() and fitNewsCardHeight() need
// this: applied while stacked, "match the tallest column's bottom/height" is nonsense
// — the columns aren't next to each other, so it was forcing huge bogus
// margins/heights that read as the bottom alignment "coming undone" when the window
// narrowed enough to stack.
function isMainGridSideBySide(columns) {
    if (columns.length < 2) return false;
    return Math.abs(columns[0].getBoundingClientRect().top - columns[1].getBoundingClientRect().top) < 5;
}

// This nudges the bottom margin of the middle/right columns' LAST card so both
// columns' bottom edges land on the exact same line, without visibly stretching any
// card. The news column doesn't need this — it spans the calendar row + data row
// combined, and its height is set directly by fitNewsCardHeight() rather than nudged
// via margin, so there's no "last card" margin trick to apply there.
let aligningColumns = false;
function alignColumnBottoms() {
    if (aligningColumns) return; // don't re-enter while our own DOM writes are settling
    const midColumn = document.getElementById('mid-column');
    const rightColumn = document.getElementById('right-column');
    if (!midColumn || !rightColumn) return;
    const columns = [midColumn, rightColumn];
    aligningColumns = true;
    // Clear both columns' compensating bottom margin BEFORE measuring anything —
    // fitNewsCardHeight() reads their rendered height to size the news card, and if a
    // PREVIOUS cycle's leftover margin were still on their last card, that measurement
    // would come back inflated, making the news card grow to match, which then makes
    // the next cycle's margin even bigger — a runaway feedback loop across repeated
    // calls (every data refresh, resize, tab switch...) that's what actually produced
    // the several-hundred-px gap under the shorter column.
    columns.forEach(col => {
        const lastCard = col.lastElementChild;
        if (lastCard) lastCard.style.marginBottom = '0px';
    });
    fitNewsCardHeight(); // now measures the calendar + middle/right columns' true natural height
    requestAnimationFrame(() => {
        if (!isMainGridSideBySide(columns)) {
            // Stacked layout — margins are already cleared above, nothing more to do.
            aligningColumns = false;
            return;
        }
        const bottoms = columns.map(col => col.getBoundingClientRect().bottom);
        const maxBottom = Math.max(...bottoms);
        columns.forEach((col, i) => {
            const diff = maxBottom - bottoms[i];
            const lastCard = col.lastElementChild;
            if (lastCard && diff > 0.5) lastCard.style.marginBottom = `${diff}px`;
        });
        setTimeout(() => { aligningColumns = false; }, 80);
    });
}

// Safety net: live data lands asynchronously and at different times (news fetch,
// market data fetch, translation, tab switches, window resize...). Rather than trying
// to thread an alignColumnBottoms() call through every one of those call sites
// correctly, watch all 4 grid areas directly and realign whenever any of them actually
// changes size, for any reason.
let columnResizeObserver = null;
let columnResizeDebounce = null;
function watchColumnResize() {
    const grid = document.getElementById('main-grid');
    if (!grid || !window.ResizeObserver) return;
    if (columnResizeObserver) columnResizeObserver.disconnect();
    columnResizeObserver = new ResizeObserver(() => {
        if (aligningColumns) return;
        clearTimeout(columnResizeDebounce);
        columnResizeDebounce = setTimeout(alignColumnBottoms, 120);
    });
    Array.from(grid.children).forEach(col => columnResizeObserver.observe(col));
}

function toggleTheme() {
    currentTheme = (currentTheme === 'dark') ? 'light' : 'dark';
    document.body.classList.toggle('light-mode', currentTheme === 'light');
    updateThemeButtonText();
    if (mapInstance) {
        applyThemeColors();
        applyThemeStyle();
    }
}

function updateThemeButtonText() {
    const t = translations[currentLang];
    document.getElementById('theme-btn').innerText = (currentTheme === 'dark') ? t.themeBtnLight : t.themeBtnDark;
}

function toggleLanguage() {
    currentLang = (currentLang === 'ko') ? 'en' : 'ko';
    updateStaticLabels();
    renderAll();
    renderTicker();
    renderCalendar();
    updateClocks();
    localizeMapLabels(currentLang);
    if (currentLang === 'ko') translateNewsIfNeeded();
    setTimeout(alignColumnBottoms, 200);
}

function updateStaticLabels() {
    const t = translations[currentLang];
    document.getElementById('lang-btn').innerText = t.btn;
    document.getElementById('brand-title').innerText = t.brandTitle;
    updateThemeButtonText();
    document.getElementById('lbl-nyc').innerText = t.nyc;
    document.getElementById('lbl-lon').innerText = t.lon;
    document.getElementById('lbl-tyo').innerText = t.tyo;
    document.getElementById('tab-world-news').innerText = t.tabWorldNews;
    document.getElementById('tab-econ-news').innerText = t.tabEconNews;
    updateNewsTabStyles();
    updateMarketAlertsButton();
    document.getElementById('section-forex-title').childNodes[0].nodeValue = t.secForex;
    // unit-forex is set dynamically in renderAll() (it tracks forexBase, which
    // language switching doesn't change), not from a static translated string.
    document.getElementById('section-policy-title').childNodes[0].nodeValue = t.secPolicy;
    document.getElementById('unit-policy').innerText = t.unitPct;
    document.getElementById('section-bond-title').childNodes[0].nodeValue = t.secBond;
    document.getElementById('unit-bond').innerText = t.unitBond10y;
    document.getElementById('section-market-title').childNodes[0].nodeValue = t.secMarket;
    document.getElementById('unit-market').innerText = t.unitMarket;
    document.getElementById('section-commodities-title').childNodes[0].nodeValue = t.secCommodities;
    document.getElementById('unit-commodities').innerText = t.unitUsd;
    document.getElementById('section-crypto-title').childNodes[0].nodeValue = t.secCrypto;
    document.getElementById('unit-crypto').innerText = t.unitUsd;
    document.getElementById('map-instructions').innerText = t.mapInstructions;
    document.getElementById('mapstyle-title').innerText = t.mapStyleTitle;
    document.getElementById('btn-style-map').innerText = t.styleMap;
    document.getElementById('btn-style-satellite').innerText = t.styleSatellite;
    document.getElementById('risk-filter-title').innerText = t.riskFilterTitle;
    document.getElementById('lbl-chk-war').innerText = t.chkWar;
    document.getElementById('lbl-chk-disaster').innerText = t.chkDisaster;
    document.getElementById('lbl-chk-economy').innerText = t.chkEconomy;
    document.getElementById('lbl-chk-social').innerText = t.chkSocial;
    document.getElementById('footer-links-title').innerText = t.footerLinksTitle;
    document.getElementById('footer-refresh-title').innerText = t.footerRefreshTitle;
    for (let i = 1; i <= 10; i++) {
        document.getElementById(`footer-refresh-${i}`).innerText = t[`footerRefresh${i}`];
    }
    document.getElementById('footer-search-input').placeholder = t.footerSearchPlaceholder;
    document.getElementById('footer-search-input-naver').placeholder = t.footerSearchPlaceholderNaver;
}

function updateClocks() {
    const now = new Date();
    const options = { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' };
    document.getElementById('time-nyc').innerText = now.toLocaleTimeString(currentLang === 'ko' ? 'ko-KR' : 'en-US', { ...options, timeZone: 'America/New_York' });
    document.getElementById('time-lon').innerText = now.toLocaleTimeString(currentLang === 'ko' ? 'ko-KR' : 'en-US', { ...options, timeZone: 'Europe/London' });
    document.getElementById('time-tyo').innerText = now.toLocaleTimeString(currentLang === 'ko' ? 'ko-KR' : 'en-US', { ...options, timeZone: 'Asia/Tokyo' });
}

