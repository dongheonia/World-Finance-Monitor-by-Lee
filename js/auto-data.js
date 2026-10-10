// ============================ AUTO-COLLECTED DATA ============================
// Map events (war/economy/social) derived from the news feeds, and actual values for
// already-released calendar events — built daily by
// scripts/refresh-auto-data.mjs (GitHub Actions, free) and published to this repo's
// `auto-data` branch, so it's the same for every viewer and keeps accumulating even
// while nobody has the page open. raw.githubusercontent.com sends
// access-control-allow-origin: *, so no proxy is needed. Hand-curated entries always
// win: auto values only fill calendar gaps, and the script already skips map events
// that a curated ongoing event covers.
const AUTO_DATA_URL = 'https://raw.githubusercontent.com/dongheonia/World-Finance-Monitor-by-Lee/auto-data/auto-data.json';

let autoMapEvents = [];
let autoCalendarValues = {};

function autoCalendarValue(ev) {
    if (ev.valueKo) return null;
    return autoCalendarValues[`${ev.date}|${ev.country}|${ev.category}|${ev.titleEn}`] || null;
}

function autoMapEventsFor(layer) {
    return autoMapEvents.filter(e => e.layer === layer);
}

async function fetchAutoData() {
    try {
        // raw.githubusercontent.com caches for ~5 minutes per URL; a per-minute query
        // string keeps this from serving an older copy than that.
        const res = await fetch(`${AUTO_DATA_URL}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('http ' + res.status);
        const data = await res.json();
        const today = new Date().toISOString().slice(0, 10);
        autoMapEvents = (data.mapEvents || []).filter(e => Array.isArray(e.coords) && (!e.expires || e.expires >= today));
        refreshAutoMapEvents();
        const values = data.calendarValues || {};
        if (JSON.stringify(values) !== JSON.stringify(autoCalendarValues)) {
            autoCalendarValues = values;
            // Re-rendering replaces the event list's contents — keep the reader's place.
            const list = document.getElementById('cal-event-list');
            const scrollTop = list ? list.scrollTop : 0;
            renderCalendar();
            if (list) list.scrollTop = scrollTop;
        }
    } catch (e) {
        console.warn('Auto data fetch failed:', e.message);
    }
}
