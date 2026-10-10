#!/usr/bin/env node
// Builds auto-data.json — everything on the page that used to need a human reading the
// news, now derived automatically and for free (no paid API, no key). Run every 15
// minutes by .github/workflows/refresh-auto-data.yml, which publishes the result
// (auto-data.json + auto-state.json) to the separate `auto-data` branch (so main's history and the Pages deploy aren't touched
// every run); the page fetches it from raw.githubusercontent.com (js/auto-data.js).
//
// 1. Map events (war / economy / social layers) — rule-based, from the same RSS feeds
//    the news box reads (js/data/news-feeds.js) plus a few targeted Google News
//    searches. Each headline is classified with the page's own classifyNews(), matched
//    against EVENT_RULES below for a specific event type, and placed on the map with
//    scripts/data/gazetteer.mjs. Repeated reports of the same type in the same place
//    merge into one event. Every event type has its own lifetime (EVENT_RULES `days`,
//    stretched up to 2x the more it keeps being reported), counted from the LAST
//    report — an event disappears once nothing has mentioned it for that long.
//    Korean text is a machine translation of the latest headline.
// 2. Economic-calendar values — for every already-released CALENDAR_EVENTS entry with
//    no actual value yet: official statistics APIs where a keyless one exists (policy
//    rates via BIS/ECB/BOK ECOS, US CPI and jobs via BLS, UK CPI via ONS, Korea CPI via
//    ECOS), otherwise the number most headlines about that release agree on (Google
//    News + Bing News RSS, at least two independent headlines required). "Previous" is
//    the value of the prior release in the same series.
//
// Hand-curated entries (js/data/calendar-events.js, calendar-config.js) are never
// edited — auto values only fill gaps, and auto map events are skipped where a curated
// ongoing event of the same layer already covers the spot.

import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { COUNTRIES, PLACES } from './data/gazetteer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// auto-data.json is what the page fetches (small: shown events + calendar values);
// auto-state.json carries every tracked event with its reports between runs.
const OUT_DIR = process.env.AUTO_DATA_DIR || path.join(ROOT, 'auto-data');
const OUT_PATH = path.join(OUT_DIR, 'auto-data.json');
const STATE_PATH = path.join(OUT_DIR, 'auto-state.json');
const NOW = Date.now();
const DAY = 24 * 3600 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const isoDay = t => new Date(t).toISOString().slice(0, 10);
const TODAY = isoDay(NOW);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Reuse the page's own data files and pure helpers (classifyNews, cleanTitle, ...).
// They're plain browser scripts declaring top-level consts, so they're evaluated in a
// shared vm context rather than imported.
const ctx = vm.createContext({ console });
for (const f of ['js/data/korean-names.js', 'js/data/news-feeds.js', 'js/news.js', 'js/translate.js', 'js/data/calendar-events.js', 'js/data/calendar-config.js']) {
    vm.runInContext(await fs.readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const page = expr => vm.runInContext(expr, ctx);
const classifyNews = page('classifyNews');
const cleanTitle = page('cleanTitle');
const isJunkHeadline = page('isJunkHeadline');
const applyKoreanNameMap = page('applyKoreanNameMap');
const NEWS_FEEDS = page('NEWS_FEEDS');
const CALENDAR_EVENTS = page('CALENDAR_EVENTS');
const CURATED = { war: page('WAR_EVENTS'), economy: page('ECONOMY_EVENTS'), social: page('SOCIAL_EVENTS') };

async function fetchText(url, { timeout = 15000, headers = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: controller.signal });
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}
const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

// ---------------------------------------------------------------------------
// RSS

function decodeEntities(s) {
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')
        .replace(/<[^>]+>/g, '').trim();
}

function parseRss(xml) {
    return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].map(m => {
        const tag = t => { const x = m[0].match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`)); return x ? decodeEntities(x[1]) : ''; };
        const pub = Date.parse(tag('pubDate'));
        let title = cleanTitle(tag('title'));
        // Google News always appends " - <Source>"; cleanTitle only strips it when the
        // source looks like a capitalised name, missing URLs and non-Latin outlet names.
        if (/news\.google\.com/.test(tag('link'))) title = title.replace(/\s+[-–—]\s+[^-–—]{1,60}$/, '');
        return { title: title.trim(), link: tag('link'), time: Number.isFinite(pub) ? pub : NOW };
    }).filter(i => i.title && !isJunkHeadline(i.title));
}

const googleNews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const bingNews = q => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`;

async function fetchFeeds(urls) {
    const results = await Promise.allSettled(urls.map(u => fetchText(u).then(parseRss)));
    results.forEach((r, i) => { if (r.status === 'rejected') console.warn('feed failed:', urls[i], r.reason.message); });
    return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}

// ---------------------------------------------------------------------------
// Translation (free endpoints, best first). clients5 is the Chrome dictionary
// extension's endpoint — the plain gtx one used by the page answers "unusual traffic"
// to most server IPs. MyMemory is last: it handles headline idioms worst (it turned
// "Israeli strikes" into labour strikes in testing).

async function translateKo(text) {
    const attempts = [
        async () => (await fetchJson(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ko&q=${encodeURIComponent(text)}`))[0],
        async () => (await fetchJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`))[0].map(c => c[0]).join(''),
        async () => (await fetchJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`)).responseData.translatedText
    ];
    for (const attempt of attempts) {
        try {
            const out = await attempt();
            if (typeof out === 'string' && /[가-힣]/.test(out)) return applyKoreanNameMap(out);
        } catch (e) { /* next provider */ }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Gazetteer

const koRegion = new Intl.DisplayNames(['ko'], { type: 'region' });
const enRegion = new Intl.DisplayNames(['en'], { type: 'region' });
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PLACE_INDEX = [];
for (const [iso2, lat, lng, ...aliases] of COUNTRIES) {
    const en = enRegion.of(iso2);
    const entry = { id: iso2, iso2, ko: koRegion.of(iso2), en, coords: [lng, lat], level: 'country' };
    [en, ...aliases].forEach(name => PLACE_INDEX.push({ name, entry }));
}
for (const [ko, names, iso2, lat, lng] of PLACES) {
    const entry = { id: `${iso2}-${names[0]}`, iso2, ko, en: names[0], coords: [lng, lat], level: 'place' };
    names.forEach(name => PLACE_INDEX.push({ name, entry }));
}
PLACE_INDEX.sort((a, b) => b.name.length - a.name.length);
PLACE_INDEX.forEach(p => {
    // Case-sensitive: place names are proper nouns, and lower-case matching would turn
    // "us" (the pronoun) into the United States or "chad" into Chad.
    p.re = new RegExp(`(^|[^A-Za-z])${escapeRe(p.name)}(?=$|[^A-Za-z])`);
});

// Picks the most likely location: a city/region over a whole country, then a place
// that follows a locative preposition ("strikes ON Kyiv", "protests IN Paris"), then
// one that isn't the US (usually the actor, not the location, in world news), then —
// for war headlines — the LAST place named, since attacker-verb-target is the usual
// order ("Russian strikes kill 15 ... Ukraine", "Ukraine hits Russian refinery").
function locate(title, { preferLast = false } = {}) {
    const taken = [];
    const hits = [];
    for (const p of PLACE_INDEX) {
        const m = p.re.exec(title);
        if (!m) continue;
        const start = m.index + m[1].length;
        const end = start + p.name.length;
        if (taken.some(([s, e]) => start < e && end > s)) continue; // a longer name already covers this text
        taken.push([start, end]);
        if (/^-flagged/i.test(title.slice(end))) continue; // "Panama-flagged tanker" says nothing about where it was
        hits.push({ ...p.entry, start, afterPreposition: /\b(in|on|into|near|across|at|over|against|targeting|inside|outside|off)\s+(the\s+)?$/i.test(title.slice(0, start)) });
    }
    if (!hits.length) return null;
    hits.sort((a, b) =>
        (a.level === 'place' ? 0 : 1) - (b.level === 'place' ? 0 : 1) ||
        (a.afterPreposition ? 0 : 1) - (b.afterPreposition ? 0 : 1) ||
        (a.iso2 === 'US' ? 1 : 0) - (b.iso2 === 'US' ? 1 : 0) ||
        (preferLast ? b.start - a.start : a.start - b.start));
    return hits[0];
}

function distanceKm([lng1, lat1], [lng2, lat2]) {
    const rad = d => d * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// Map events

// First match wins, so the more specific rules come first within each layer.
// `topics` gates a rule on the page's own classifyNews() topic key (or group for
// 'economy'), which already filters figurative uses ("price war", "strikes a deal");
// null means the pattern is specific enough to apply whatever the topic (classifyNews
// files "Russian strike kills 12 ... after Trump eases sanctions" under economy).
// `days` is how long the event stays on the map after its LAST report; `minReports`
// is how many distinct headlines it takes before the event is shown at all (reports
// accumulate across runs, so a story that keeps being covered crosses it quickly).
// The patterns are deliberately narrow — tested against a full day of real feed
// headlines, loose single words ("offensive", "tariffs", "blackout") mostly matched
// sports reports, election debates and operation names rather than real events.
const EVENT_RULES = [
    { layer: 'war', key: 'strikes', ko: '공습', en: 'Strikes', days: 7, minReports: 1, topics: null,
      re: /\b(air ?strikes?|missile (strike|attack)s?|missiles? (hit|kill|struck)|drone (strike|attack)s?|(military|israeli|russian|ukrainian|us|u\.s\.) strikes?|strikes? (kill|hit|pound|target)|shelling|shelled|bombard\w*|rocket (fire|attack)s?|glide bomb)\b/i },
    { layer: 'war', key: 'fighting', ko: '교전', en: 'Fighting', days: 14, minReports: 1, topics: null,
      re: /\b(fighting|heavy clashes|armed clashes|military offensive|counter-?offensive|launch(es|ed)? (an |a |new )?offensive|offensive (on|against)|battle for|troops (advance|capture|seize|enter)|militants? (attack|kill|seize)|insurgents?|rebels? (attack|seize|capture|advance)|front ?line|siege of|besieged)\b/i },
    { layer: 'war', key: 'war', ko: '전쟁·무력 충돌', en: 'Armed conflict', days: 21, minReports: 2, topics: ['war'],
      re: /\b(war|invasion|invade[sd]?|ceasefire|truce)\b/i },
    { layer: 'social', key: 'attack', ko: '테러·총격', en: 'Attack', days: 7, minReports: 1, topics: ['terrorism', 'crime', 'publicsafety'],
      re: /\b(terror(ist)? attack|suicide (bomb\w*|attack)|car bomb|bombing kills|bomb blast|explosion kills|mass shooting|massacre|hostages?|car-ramming|ramming attack|gunm[ae]n (kill|storm|attack)\w*)\b/i },
    { layer: 'social', key: 'coup', ko: '쿠데타·정정 불안', en: 'Coup / political unrest', days: 21, minReports: 1, topics: ['politics', 'security', 'publicsafety'],
      re: /\b(coup( attempt)?|junta seizes|martial law|state of emergency)\b/i },
    { layer: 'social', key: 'protest', ko: '시위·소요', en: 'Protests / unrest', days: 5, minReports: 2, topics: ['publicsafety', 'politics', 'labor', 'humanrights', 'war'],
      re: /\b(protests? (erupt|spread|turn|over|against|in)|protesters?|mass protests?|demonstrators?|riots?|rioters|unrest|tear gas|curfew|uprising|clashes with police)\b/i },
    { layer: 'social', key: 'labor', ko: '파업', en: 'Strike action', days: 7, minReports: 1, topics: ['labor', 'war', 'publicsafety', 'logistics'],
      re: /\b(general strike|strike action|national strike|workers (strike|walk out)|walkout|work stoppage|(dock|port|rail|airport|teachers?|doctors?|nurses?|union) strikes?)\b/i },
    { layer: 'social', key: 'displacement', ko: '난민·대규모 이주', en: 'Displacement / migration', days: 21, minReports: 2, topics: ['refugees', 'migration', 'humanrights', 'war'],
      re: /\b(refugees? (flee|arrive|crisis|camp)|thousands (flee|displaced)|displaced|exodus|migrant (boat|crisis|surge)|boat capsizes|mass deportations?)\b/i },
    { layer: 'economy', key: 'debt', ko: '채무·재정 위기', en: 'Debt / fiscal crisis', days: 30, minReports: 2, topics: ['economy', 'politics'],
      re: /\b(defaults? on|debt default|sovereign default|debt crisis|bailout|imf (loan|deal|bailout|programme|program|rescue)|credit rating (cut|downgrade)|downgrades? .{0,20}(rating|credit))\b/i },
    { layer: 'economy', key: 'currency', ko: '통화 불안', en: 'Currency turmoil', days: 14, minReports: 2, topics: ['economy'],
      re: /\b(currency (crash|crisis|plunge|slump|collapse)|(plunges?|slumps?|tumbles?|crash(es)?|falls?|sinks?) to (a |an )?(record|all-time) low|record-low|devalu\w*|capital controls)\b/i },
    { layer: 'economy', key: 'banking', ko: '금융 불안', en: 'Financial stress', days: 14, minReports: 2, topics: ['economy'],
      re: /\b(bank run|bank collapse|banking crisis|bank failure|market crash|stocks? (crash|plunge|rout|tumble)|market (rout|turmoil|meltdown)|meltdown)\b/i },
    { layer: 'economy', key: 'trade', ko: '제재·관세·무역 갈등', en: 'Sanctions / tariffs', days: 21, minReports: 2, topics: ['economy', 'diplomacy', 'war'],
      re: /\b((impose[sd]?|imposing|slaps?|raise[sd]?|hikes?|new|retaliatory|threatens?|announce[sd]?|extend(s|ed)?|tighten(s|ed)?|lifts?|lifted|eases?|eased|suspend(s|ed)?) (\w+ ){0,2}(tariffs?|sanctions?)|(tariffs?|sanctions?) (on|against)|export (ban|controls?|curbs?)|import ban|embargo|trade war)\b/i },
    { layer: 'economy', key: 'recession', ko: '경기 침체', en: 'Economic slowdown', days: 30, minReports: 2, topics: ['economy'],
      re: /\b(recession|economy (shrinks|shrank|contracts|contracted)|stagflation)\b/i },
    { layer: 'economy', key: 'supply', ko: '공급 차질', en: 'Supply disruption', days: 10, minReports: 1, topics: ['economy', 'energy', 'shipping', 'logistics', 'food', 'disaster'],
      re: /\b((fuel|food|power|electricity|gas|water|medicine|bread) (shortages?|crisis|rationing)|shortages? of (fuel|food|medicine|water|power|electricity)|power (cuts?|outages?)|(nationwide|massive|widespread|rolling) blackouts?|blackouts? (hit|leave|plunge|across)|supply (shock|disruption|crunch)|famine)\b/i }
];

// Sports reports, history pieces and other headlines that borrow conflict vocabulary.
const NOISE_RE = /\b(\d+-\d+ (win|loss|victory|defeat)|(win|loss|victory|defeat) (over|to)|quarterback|touchdown|playoffs?|friendly|season opener|coach(es|ing)?|defen[cs]ive|offensive (line|coordinator|staff|struggles|efficiency|performance|twist|play)|highlights|World War (I|II|1|2|One|Two)|War Streets|civil war era|war memorial|veterans day|anniversary|movie|film|documentary|novel|game review|video game|esports)\b/i;
// A headline about a protest/strike that happens to mention "clashes"/"strike on"
// belongs to the social layer, never the war layer.
const NOT_WAR_RE = /\b(protest\w*|police|general strike|strike action|workers|union|walkout)\b/i;
const MAX_EVENTS_PER_LAYER = 30;
const MAX_AGE_OF_NEW_REPORT = 3 * DAY; // ignore old items a feed still carries
const CURATED_OVERLAP_KM = 300;

// Extra searches so the map isn't limited to whatever the general feeds happen to
// carry this hour.
const EVENT_SEARCHES = [
    'airstrike OR shelling OR "drone attack" when:2d', 'clashes OR offensive OR "armed groups" when:2d',
    'protest OR riot OR "tear gas" when:2d', '"terror attack" OR bombing OR gunman when:2d',
    'strike workers walkout when:2d', 'refugees OR displaced OR "migrant boat" when:2d',
    '"debt crisis" OR default OR "IMF bailout" when:3d', 'currency "record low" OR devaluation when:3d',
    'sanctions OR tariffs OR "export ban" when:2d', 'shortage OR blackout OR "fuel crisis" when:3d'
];

function matchRule(title) {
    if (NOISE_RE.test(title)) return null;
    const { group, topic } = classifyNews(title);
    const tags = new Set([topic.key, group]);
    const notWar = NOT_WAR_RE.test(title);
    return EVENT_RULES.find(r => !(notWar && r.layer === 'war') && (!r.topics || r.topics.some(t => tags.has(t))) && r.re.test(title)) || null;
}

function lifetimeMs(rule, count) {
    return rule.days * DAY * Math.min(2, 1 + (count - 1) * 0.25);
}

function coveredByCurated(layer, coords) {
    return CURATED[layer].some(e => e.ongoing && distanceKm(e.coords, coords) < CURATED_OVERLAP_KM);
}

async function refreshMapEvents(previous) {
    const items = await fetchFeeds([...NEWS_FEEDS.map(f => f.url), ...EVENT_SEARCHES.map(googleNews)]);
    const byId = new Map((previous || []).map(e => [e.id, e]));
    const seenTitles = new Set();
    for (const item of items) {
        if (NOW - item.time > MAX_AGE_OF_NEW_REPORT || seenTitles.has(item.title.toLowerCase())) continue;
        seenTitles.add(item.title.toLowerCase());
        if (/^(opinion|analysis|editorial|explainer|commentary|live)\s*[:|]/i.test(item.title)) continue;
        const rule = matchRule(item.title);
        if (!rule) continue;
        const place = locate(item.title, { preferLast: rule.layer === 'war' });
        if (!place) continue;
        const id = `${rule.layer}:${rule.key}:${place.id}`;
        let ev = byId.get(id);
        if (!ev) {
            ev = { id, layer: rule.layer, rule: rule.key, place, firstSeen: item.time, lastSeen: 0, count: 0, reports: [] };
            byId.set(id, ev);
        }
        if (ev.reports.some(r => r.title === item.title)) continue;
        ev.count += 1;
        ev.firstSeen = Math.min(ev.firstSeen, item.time);
        ev.lastSeen = Math.max(ev.lastSeen, item.time);
        ev.reports.push({ title: item.title, link: item.link, time: item.time });
        ev.reports.sort((a, b) => b.time - a.time);
        ev.reports = ev.reports.slice(0, 5);
    }

    const rules = Object.fromEntries(EVENT_RULES.map(r => [r.key, r]));
    // Everything still within its lifetime is kept as state (so reports keep counting
    // across runs); only what has enough reports and isn't already curated is shown.
    const alive = [...byId.values()]
        .filter(ev => rules[ev.rule] && NOW < ev.lastSeen + lifetimeMs(rules[ev.rule], ev.count))
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 400);
    // A country-level event is redundant next to a city-level one of the same type in
    // the same country ("India: protests" vs "Delhi: protests") — its reports count
    // toward the city event instead.
    const cityLevel = alive.filter(ev => ev.place.level === 'place');
    const shownCount = new Map(alive.map(ev => [ev.id, ev.count]));
    const folded = new Set();
    for (const ev of alive) {
        if (ev.place.level !== 'country') continue;
        const city = cityLevel.find(c => c.rule === ev.rule && c.place.iso2 === ev.place.iso2);
        if (city) { shownCount.set(city.id, shownCount.get(city.id) + ev.count); folded.add(ev.id); }
    }
    let events = alive.filter(ev => !folded.has(ev.id) && shownCount.get(ev.id) >= rules[ev.rule].minReports && !coveredByCurated(ev.layer, ev.place.coords));
    events = ['war', 'economy', 'social'].flatMap(layer =>
        events.filter(e => e.layer === layer).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, MAX_EVENTS_PER_LAYER));

    for (const ev of events) {
        const rule = rules[ev.rule];
        const latest = ev.reports[0];
        const count = shownCount.get(ev.id);
        ev.expires = ev.lastSeen + lifetimeMs(rule, count);
        ev.ko = `${ev.place.ko} ${rule.ko}`;
        ev.en = `${ev.place.en}: ${rule.en.toLowerCase()}`;
        ev.coords = ev.place.coords;
        ev.radius = ev.place.level === 'place' ? 40 : 150;
        ev.date = isoDay(ev.firstSeen);
        ev.ongoing = true;
        ev.link = latest.link;
        if (ev.reasonSource !== latest.title || !ev.headlineKo) {
            ev.headlineKo = (await translateKo(latest.title)) || ev.headlineKo || null;
            ev.reasonSource = latest.title;
            await sleep(150);
        }
        const more = count > 1 ? ` 외 관련 보도 ${count - 1}건` : '';
        const moreEn = count > 1 ? ` (+${count - 1} related report${count > 2 ? 's' : ''})` : '';
        const until = isoDay(ev.expires);
        const sentence = t => t.trim().replace(/[.。]+$/, '');
        ev.reasonKo = `${sentence(ev.headlineKo || latest.title)}${more}. (뉴스 자동 수집 · ${until}까지 표시)`;
        ev.reasonEn = `${sentence(latest.title)}${moreEn}. (Auto-collected from news · shown until ${until})`;
    }
    return { events, state: alive };
}

// ---------------------------------------------------------------------------
// Calendar values

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SKIP_CATEGORIES = new Set(['speech', 'minutes']);
const LOOKBACK_DAYS = 75;
const calendarKey = ev => `${ev.date}|${ev.country}|${ev.category}|${ev.titleEn}`;
const fmt2 = v => v.toFixed(2);
const signed = (v, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;

// Reference month an indicator release is about: the month named in its title, in the
// release year — or the year before for a January release about December.
function referenceMonth(ev) {
    const m = MONTHS.findIndex(name => ev.titleEn.includes(name));
    if (m < 0) return null;
    const releaseYear = +ev.date.slice(0, 4);
    const releaseMonth = +ev.date.slice(5, 7) - 1;
    return { year: m > releaseMonth ? releaseYear - 1 : releaseYear, month: m + 1 };
}
const ym = ({ year, month }, offset = 0) => {
    const d = new Date(Date.UTC(year, month - 1 + offset, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

// --- policy rates (same sources as the page's live policy-rate rows) ---
const rateSeriesCache = {};
async function rateSeries(country) {
    if (rateSeriesCache[country]) return rateSeriesCache[country];
    let points;
    if (country === 'EU') {
        const data = await fetchJson('https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.MRR_FR.LEV?format=jsondata&lastNObservations=200');
        const series = data.dataSets[0].series['0:0:0:0:0:0:0'];
        const dates = data.structure.dimensions.observation[0].values.map(v => v.id);
        points = Object.keys(series.observations).map(k => ({ date: dates[+k], value: series.observations[k][0] }));
    } else {
        const csv = await fetchText(`https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.${country}?lastNObservations=300&format=csv&detail=dataonly`);
        const lines = csv.trim().split('\n');
        const header = lines[0].split(',');
        const [d, v] = ['TIME_PERIOD', 'OBS_VALUE'].map(h => header.indexOf(h));
        points = lines.slice(1).map(l => l.split(',')).filter(c => c[v] !== '').map(c => ({ date: c[d], value: +c[v] }));
    }
    points = points.filter(p => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
    rateSeriesCache[country] = points;
    return points;
}

function valueOn(points, date) {
    let found = null;
    for (const p of points) { if (p.date <= date) found = p; else break; }
    return found;
}

// ECOS's keyless "sample" key returns at most 10 rows, so Korea is read as two
// 10-day daily windows around the decision instead of one long series.
async function ecosDailyRate(fromMs, toMs) {
    const d = t => isoDay(t).replace(/-/g, '');
    const data = await fetchJson(`https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/722Y001/D/${d(fromMs)}/${d(toMs)}/0101000`);
    return ((data.StatisticSearch && data.StatisticSearch.row) || [])
        .map(r => ({ date: `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}-${r.TIME.slice(6, 8)}`, value: +r.DATA_VALUE }));
}

async function rateValue(ev) {
    const t = Date.parse(ev.date);
    const points = ev.country === 'KR'
        ? [...await ecosDailyRate(t - 10 * DAY, t - DAY), ...await ecosDailyRate(t + DAY, t + 10 * DAY)].sort((a, b) => a.date.localeCompare(b.date))
        : await rateSeries(ev.country);
    // Most banks' decisions take effect the next business day; the BOJ's can lag about
    // a week. Wait until a week of data exists past the decision, then read it.
    const settle = isoDay(Date.parse(ev.date) + 7 * DAY);
    if (!points.length || points[points.length - 1].date < settle) return null;
    const after = valueOn(points, settle);
    const before = valueOn(points, isoDay(Date.parse(ev.date) - DAY));
    if (!after || !before) return null;
    const fmtRate = v => (ev.country === 'US' ? `${fmt2(v - 0.125)}–${fmt2(v + 0.125)}%` : `${fmt2(v)}%`);
    const suffixKo = ev.country === 'CN' ? ' (1년 LPR)' : '';
    const suffixEn = ev.country === 'CN' ? ' (1Y LPR)' : '';
    return {
        valueKo: fmtRate(after.value) + suffixKo, valueEn: fmtRate(after.value) + suffixEn,
        prevKo: `이전 ${fmtRate(before.value)}`, prevEn: `Prev ${fmtRate(before.value)}`, source: 'official'
    };
}

// --- BLS (US CPI, jobs) — keyless v1 API ---
let blsCache = null;
async function bls() {
    if (blsCache) return blsCache;
    const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ seriesid: ['CUUR0000SA0', 'CES0000000001', 'LNS14000000', 'WPUFD4'] })
    });
    const data = await res.json();
    if (data.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS: ' + (data.message || []).join(' '));
    blsCache = {};
    for (const s of data.Results.series) {
        blsCache[s.seriesID] = {};
        for (const d of s.data) if (/^M\d\d$/.test(d.period) && d.period !== 'M13') blsCache[s.seriesID][`${d.year}-${d.period.slice(1)}`] = +d.value;
    }
    return blsCache;
}
const ymKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

async function usCpiValue(ev) {
    const ref = referenceMonth(ev);
    if (!ref) return null;
    const cpi = (await bls()).CUUR0000SA0;
    const yoy = r => { const a = cpi[ymKey(r)], b = cpi[ymKey(ym(r, -12))]; return a && b ? (a / b - 1) * 100 : null; };
    const cur = yoy(ref), prev = yoy(ym(ref, -1));
    if (cur == null) return null;
    return { valueKo: `${cur.toFixed(1)}%`, valueEn: `${cur.toFixed(1)}%`,
        ...(prev != null ? { prevKo: `이전 ${prev.toFixed(1)}%`, prevEn: `Prev ${prev.toFixed(1)}%` } : {}), source: 'official' };
}

// Final-demand PPI (WPUFD4, not seasonally adjusted) — year-on-year, the headline rate.
async function usPpiValue(ev) {
    const ref = referenceMonth(ev);
    if (!ref) return null;
    const ppi = (await bls()).WPUFD4;
    const yoy = r => { const a = ppi[ymKey(r)], b = ppi[ymKey(ym(r, -12))]; return a && b ? (a / b - 1) * 100 : null; };
    const cur = yoy(ref), prev = yoy(ym(ref, -1));
    if (cur == null) return null;
    return { valueKo: `${cur.toFixed(1)}%`, valueEn: `${cur.toFixed(1)}%`,
        ...(prev != null ? { prevKo: `이전 ${prev.toFixed(1)}%`, prevEn: `Prev ${prev.toFixed(1)}%` } : {}), source: 'official' };
}

async function usJobsValue(ev) {
    const ref = referenceMonth(ev);
    if (!ref) return null;
    const data = await bls();
    const payroll = data.CES0000000001, unemp = data.LNS14000000;
    const change = r => { const a = payroll[ymKey(r)], b = payroll[ymKey(ym(r, -1))]; return a != null && b != null ? a - b : null; };
    const cur = change(ref), prev = change(ym(ref, -1));
    const u = unemp[ymKey(ref)], uPrev = unemp[ymKey(ym(ref, -1))];
    if (cur == null || u == null) return null;
    const ko = c => `${c > 0 ? '+' : ''}${(c / 10).toFixed(1)}만 명`;
    const en = c => `${c > 0 ? '+' : ''}${Math.round(c)}K`;
    return {
        valueKo: `${ko(cur)}, ${u.toFixed(1)}%`, valueEn: `${en(cur)}, ${u.toFixed(1)}%`,
        ...(prev != null && uPrev != null ? { prevKo: `이전 ${ko(prev)}, ${uPrev.toFixed(1)}%`, prevEn: `Prev ${en(prev)}, ${uPrev.toFixed(1)}%` } : {}),
        source: 'official'
    };
}

// --- ONS (UK CPI annual rate, series D7G7) ---
async function ukCpiValue(ev) {
    const ref = referenceMonth(ev);
    if (!ref) return null;
    const data = await fetchJson('https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data');
    const label = r => `${r.year} ${MONTHS[r.month - 1].slice(0, 3).toUpperCase()}`;
    const find = r => { const row = (data.months || []).find(m => m.date === label(r)); return row ? +row.value : null; };
    const cur = find(ref), prev = find(ym(ref, -1));
    if (cur == null) return null;
    return { valueKo: `${cur.toFixed(1)}%`, valueEn: `${cur.toFixed(1)}%`,
        ...(prev != null ? { prevKo: `이전 ${prev.toFixed(1)}%`, prevEn: `Prev ${prev.toFixed(1)}%` } : {}), source: 'official' };
}

// --- ECOS (Korea CPI index 901Y009 → YoY) ---
async function krCpiValue(ev) {
    const ref = referenceMonth(ev);
    if (!ref) return null;
    const key = r => `${r.year}${String(r.month).padStart(2, '0')}`;
    const rows = {};
    for (const [a, b] of [[ym(ref, -13), ym(ref, -12)], [ym(ref, -1), ref]]) {
        const data = await fetchJson(`https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/901Y009/M/${key(a)}/${key(b)}/0`);
        ((data.StatisticSearch && data.StatisticSearch.row) || []).forEach(r => { rows[r.TIME] = +r.DATA_VALUE; });
    }
    const yoy = r => { const a = rows[key(r)], b = rows[key(ym(r, -12))]; return a && b ? (a / b - 1) * 100 : null; };
    const cur = yoy(ref), prev = yoy(ym(ref, -1));
    if (cur == null) return null;
    return { valueKo: `${cur.toFixed(1)}%`, valueEn: `${cur.toFixed(1)}%`,
        ...(prev != null ? { prevKo: `이전 ${prev.toFixed(1)}%`, prevEn: `Prev ${prev.toFixed(1)}%` } : {}), source: 'official' };
}

const OFFICIAL = {
    rate: rateValue,
    'US:cpi': usCpiValue,
    'US:employment': usJobsValue,
    'US:ppi': usPpiValue,
    'GB:cpi': ukCpiValue,
    'KR:cpi': krCpiValue
};

// --- news fallback ---
const COUNTRY_WORDS = {
    US: /\b(U\.?S\.?|USA|America|American|Fed)\b/,
    GB: /\b(UK|U\.K\.|Britain|British|England|ONS)\b/,
    EU: /\b(euro ?zone|euro area|Eurozone|EU|Eurostat)\b/i,
    KR: /\b(South Korea|Korea|Korean)\b/i,
    CN: /\b(China|Chinese)\b/i,
    JP: /\b(Japan|Japanese)\b/i
};
const PCT = /(-?\d{1,2}(?:\.\d{1,2})?)\s?(?:%|percent|per cent)/gi;

// `monthly`: the calendar row is a month-on-month figure (retail sales, industrial
// production, UK monthly GDP), so year-on-year numbers are the ones to skip instead.
function percentsIn(title, { skipCore = true, monthly = false } = {}) {
    const out = [];
    for (const m of title.matchAll(PCT)) {
        const before = title.slice(Math.max(0, m.index - 18), m.index).toLowerCase();
        const after = title.slice(m.index + m[0].length, m.index + m[0].length + 18).toLowerCase();
        if (monthly) {
            if (/year|y\/y|yoy\b|annual/.test(after) || /annual|year-on-year/.test(before)) continue;
        } else if (/month|m\/m|mom\b|quarter-on|q\/q/.test(after) || /monthly|month-on-month/.test(before)) continue;
        // "core" anywhere before the number means it's the ex-food-and-energy figure
        // ("US core inflation by PCE index reached 3.0%"), not the headline one.
        if (skipCore && /\bcore\b/i.test(title.slice(0, m.index))) continue;
        out.push({ value: +m[1], index: m.index, before, after });
    }
    return out;
}

const isMonthly = ev => /month-on-month/i.test((ev && ev.detailEn) || '');

const EXTRACTORS = {
    cpi(title, ev) {
        if (!/inflation|\bCPI\b|consumer prices?|HICP/i.test(title)) return null;
        // Japan's calendar row tracks core CPI (ex fresh food), so there "core" is
        // required instead of excluded.
        const wantsCore = /\bcore\b/i.test((ev && ev.detailEn) || '');
        if (wantsCore && !/\bcore\b/i.test(title)) return null;
        const p = percentsIn(title, { skipCore: !wantsCore })[0];
        return p && p.value > -5 && p.value < 30 ? { ko: `${p.value.toFixed(1)}%`, en: `${p.value.toFixed(1)}%` } : null;
    },
    pce(title, ev) {
        if (!/\bPCE\b|personal consumption/i.test(title)) return null;
        return EXTRACTORS.cpi(title.replace(/\bPCE\b/, 'inflation'), ev);
    },
    gdp(title, ev) {
        if (!/\bGDP\b|economy|growth|grew|expand|contract|shr[ai]nk/i.test(title)) return null;
        const p = percentsIn(title, { skipCore: false, monthly: isMonthly(ev) })[0];
        if (!p || Math.abs(p.value) > 15) return null;
        const negative = p.value < 0 || /contract|shr[ai]nk|declin|fell|falls/i.test(p.before);
        const v = negative ? -Math.abs(p.value) : p.value;
        return { ko: `${signed(v)}%`, en: `${signed(v)}%` };
    },
    pmi(title, ev) {
        if (!/\bPMI\b|purchasing managers|\bISM\b|factory activity|manufacturing activity|services activity/i.test(title)) return null;
        const wantsServices = /services|non-manufacturing/i.test(ev.titleEn);
        if (wantsServices ? !/services|non-manufacturing/i.test(title) : !/manufactur|factory/i.test(title)) return null;
        const wantsCaixin = /caixin|ratingdog/i.test(ev.titleEn);
        if (ev.country === 'CN' && wantsCaixin !== /caixin|ratingdog|s&p global/i.test(title)) return null;
        const m = title.match(/\b([2-7]\d\.\d)\b/);
        return m ? { ko: m[1], en: m[1] } : null;
    },
    ppi(title, ev) {
        if (!/producer prices?|\bPPI\b|factory-gate|wholesale prices/i.test(title)) return null;
        const p = percentsIn(title)[0];
        if (!p || Math.abs(p.value) > 30) return null;
        const v = p.value > 0 && /fall|fell|drop|declin|down|deflation|shr[ai]nk/i.test(p.before) ? -p.value : p.value;
        return { ko: `${v.toFixed(1)}%`, en: `${v.toFixed(1)}%` };
    },
    retail(title, ev) {
        if (!/retail sales|retail spending|consumer spending/i.test(title)) return null;
        const p = percentsIn(title, { skipCore: false, monthly: isMonthly(ev) })[0];
        if (!p || Math.abs(p.value) > 25) return null;
        const v = p.value > 0 && /fall|fell|drop|declin|down|slump|contract|shr[ai]nk/i.test(p.before) ? -p.value : p.value;
        return { ko: `${signed(v)}%`, en: `${signed(v)}%` };
    },
    industrial(title, ev) {
        if (!/industrial (output|production)|factory output|manufacturing output/i.test(title)) return null;
        const p = percentsIn(title, { skipCore: false, monthly: isMonthly(ev) })[0];
        if (!p || Math.abs(p.value) > 30) return null;
        const v = p.value > 0 && /fall|fell|drop|declin|down|slump|contract|shr[ai]nk/i.test(p.before) ? -p.value : p.value;
        return { ko: `${signed(v)}%`, en: `${signed(v)}%` };
    },
    // UK/euro-area labour reports: the unemployment rate. (US jobs use BLS directly.)
    employment(title, ev) {
        if (ev.country === 'US' || !/unemployment|jobless rate/i.test(title)) return null;
        const p = percentsIn(title, { skipCore: false })[0];
        return p && p.value > 1 && p.value < 25 ? { ko: `${p.value.toFixed(1)}%`, en: `${p.value.toFixed(1)}%` } : null;
    },
    // BOJ Tankan: the large-manufacturer diffusion index ("improves to +15").
    survey(title, ev) {
        if (!/tankan|big manufacturers|large manufacturers/i.test(title)) return null;
        const m = title.match(/\b(?:to|at|of)\s+(plus |minus |[+-−])?(\d{1,2})\b(?!\s?%)/i);
        if (!m) return null;
        const v = (/minus|-|−/i.test(m[1] || '') ? -1 : 1) * +m[2];
        return { ko: `${v > 0 ? '+' : ''}${v}`, en: `${v > 0 ? '+' : ''}${v}` };
    },
    trade(title, ev) {
        if (!/exports?/i.test(title)) return null;
        const p = percentsIn(title, { skipCore: false })[0];
        if (!p) return null;
        const negative = /fall|fell|drop|declin|down|decreas|slump|shrink/i.test(p.before);
        const v = negative ? -Math.abs(p.value) : p.value;
        return { ko: `수출 ${signed(v)}%`, en: `Exports ${signed(v)}% YoY` };
    }
};

async function newsValue(ev) {
    const extract = EXTRACTORS[ev.category];
    if (!extract) return null;
    const query = `${ev.titleEn.replace(/[()]/g, ' ')} ${ev.date.slice(0, 4)}`.replace(/\s+/g, ' ');
    const items = await fetchFeeds([googleNews(query), bingNews(query)]);
    const from = Date.parse(ev.date) - DAY;
    const to = Date.parse(ev.date) + 10 * DAY;
    const votes = new Map();
    const seen = new Set();
    for (const item of items) {
        if (item.time < from || item.time > to) continue;
        const t = item.title;
        if (seen.has(t.toLowerCase())) continue;
        seen.add(t.toLowerCase());
        if (!COUNTRY_WORDS[ev.country].test(t)) continue;
        const v = extract(t, ev);
        if (!v) continue;
        const k = v.en;
        votes.set(k, { ...v, n: (votes.get(k)?.n || 0) + 1, sample: t });
    }
    const ranked = [...votes.values()].sort((a, b) => b.n - a.n);
    if (!ranked.length || ranked[0].n < 2 || (ranked[1] && ranked[1].n === ranked[0].n)) return null;
    return { valueKo: ranked[0].ko, valueEn: ranked[0].en, source: 'news', sourceTitle: ranked[0].sample, agreeing: ranked[0].n };
}

const seriesKey = ev => `${ev.country}|${ev.category}|${ev.titleEn
    .replace(new RegExp(MONTHS.join('|'), 'g'), '')
    .replace(/\(.*?\)|\bQ[1-4]\b|\b\d{4}\b/g, '')
    .replace(/\s+/g, ' ').trim()}`;

async function refreshCalendarValues(previous) {
    const values = { ...(previous || {}) };
    const cutoff = isoDay(NOW - LOOKBACK_DAYS * DAY);
    const sorted = [...CALENDAR_EVENTS].sort((a, b) => a.date.localeCompare(b.date));
    for (const ev of sorted) {
        const key = calendarKey(ev);
        if (ev.date > TODAY || ev.date < cutoff || ev.valueKo || SKIP_CATEGORIES.has(ev.category) || values[key]) continue;
        let result = null;
        const official = OFFICIAL[ev.category === 'rate' ? 'rate' : `${ev.country}:${ev.category}`];
        try {
            if (official) result = await official(ev);
        } catch (e) {
            console.warn('official source failed for', ev.titleEn, '-', e.message);
        }
        // Rate decisions wait for the official series rather than guessing from news.
        if (!result && ev.category !== 'rate') {
            try {
                result = await newsValue(ev);
            } catch (e) {
                console.warn('news extraction failed for', ev.titleEn, '-', e.message);
            }
        }
        if (!result) continue;
        if (!result.prevKo) {
            // Previous = the immediately preceding release in the same series — left
            // blank if that one has no value yet, rather than reaching further back and
            // showing an older month as if it were the last one.
            const sk = seriesKey(ev);
            const last = sorted.filter(p => p.date < ev.date && seriesKey(p) === sk).pop();
            const lastAuto = last && values[calendarKey(last)];
            const prior = last && (last.valueKo ? { ko: last.valueKo, en: last.valueEn } : lastAuto && { ko: lastAuto.valueKo, en: lastAuto.valueEn });
            if (prior) Object.assign(result, { prevKo: `이전 ${prior.ko}`, prevEn: `Prev ${prior.en}` });
        }
        values[key] = { ...result, filledAt: new Date(NOW).toISOString() };
        console.log('calendar value:', ev.date, ev.titleEn, '→', result.valueEn, `(${result.source})`);
    }
    // Drop entries for events that no longer exist or have since been hand-filled.
    const live = new Set(CALENDAR_EVENTS.filter(e => !e.valueKo).map(calendarKey));
    for (const k of Object.keys(values)) if (!live.has(k)) delete values[k];
    return values;
}

// ---------------------------------------------------------------------------

async function main() {
    const readJson = async p => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch (e) { return {}; } };
    const previous = { ...(await readJson(OUT_PATH)), ...(await readJson(STATE_PATH)) };
    if (!previous.updatedAt) console.log('no previous auto-data, starting fresh');
    const [{ events: mapEvents, state: eventState }, calendarValues] = await Promise.all([
        refreshMapEvents(previous.eventState).catch(e => {
            console.warn('map events failed:', e.message);
            return { events: previous.mapEvents || [], state: previous.eventState || [] };
        }),
        refreshCalendarValues(previous.calendarValues).catch(e => { console.warn('calendar values failed:', e.message); return previous.calendarValues || {}; })
    ]);
    // Slim the shown events down to what the page needs; the full records (all reports,
    // counts, pending ones) live in eventState for the next run.
    const shown = mapEvents.map(({ id, layer, ko, en, coords, radius, date, ongoing, expires, reasonKo, reasonEn, link }) =>
        ({ id, layer, ko, en, coords, radius, date, ongoing, expires: isoDay(expires), reasonKo, reasonEn, link }));
    const updatedAt = new Date(NOW).toISOString();
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_PATH, JSON.stringify({ updatedAt, mapEvents: shown, calendarValues }, null, 1) + '\n');
    await fs.writeFile(STATE_PATH, JSON.stringify({ updatedAt, eventState }) + '\n');
    const counts = ['war', 'economy', 'social'].map(l => `${l} ${mapEvents.filter(e => e.layer === l).length}`).join(', ');
    console.log(`wrote ${OUT_PATH}: map events (${counts}), calendar values ${Object.keys(calendarValues).length}`);
}

await main();
