#!/usr/bin/env node
// Extends js/data/calendar-config.js's CALENDAR_EVENTS with newly-published upcoming
// rate-decision dates, with no developer step in between — run monthly by
// .github/workflows/refresh-calendar.yml (see that file for the schedule).
//
// Scope is deliberately schedule-only: date + which decision is due, never a time-of-day
// or an announced value (see the comment above CALENDAR_EVENTS in calendar-config.js for
// why — this mirrors what the calendar UI itself shows now). That also happens to be
// exactly what CAN be automated reliably for free: each institution publishes its
// meeting SCHEDULE up to a year or more in advance on its own official site, but the
// actual decision/figure only exists after the meeting happens and needs a human to
// read the release.
//
// Covers 4 of the 6 countries on the calendar:
//   - US (Federal Reserve / FOMC) — fetched from federalreserve.gov's own calendar page.
//   - EU (ECB) — fetched from ecb.europa.eu's own Governing Council schedule page.
//   - JP (Bank of Japan) — fetched from boj.or.jp's own MPM schedule page.
//   - CN (PBOC) — NOT fetched. The Loan Prime Rate is released on a long-published fixed
//     rule (20th of the month, or the next business day if that's a weekend), not
//     something that needs a live source — see pbocLprDate() below.
// UK (Bank of England) and KR (Bank of Korea) are intentionally NOT covered:
//   - BOE's calendar page (bankofengland.co.uk/monetary-policy/upcoming-mpc-dates)
//     returns HTTP 403 to a plain fetch (bot-protected) — not worth working around.
//   - BOK's English-language schedule page has, as of this writing, never been observed
//     to list more than the CURRENT year's dates (no forward-looking data to parse).
// Both stay exactly as whatever's already hand-curated in the file until a reliable
// free source turns up for them.
//
// This only ever ADDS new entries (deduped against everything already in the file,
// including previously auto-added ones) — it never edits or removes an existing line,
// so hand-curated detail/commentary on past events is always safe.

import fs from 'node:fs/promises';

const CONFIG_PATH = new URL('../js/data/calendar-config.js', import.meta.url);
const MONTHS_AHEAD = 6; // the calendar UI itself only ever navigates ±2 months from today — this is a comfortable buffer beyond that

const MONTH_NAME_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

async function fetchText(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WorldFinanceMonitorCalendarBot/1.0; +https://github.com/dongheonia/World-Finance-Monitor-by-Lee)' } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.text();
}

// ---- Federal Reserve (US) ----
// The page lists each year's meetings under its own <h4> header, month name in a
// <strong>, and the day-range (e.g. "15-16*") in a sibling div — this covers FUTURE
// meetings too (unlike the per-meeting PDF links, which only exist once a meeting has
// actually happened). Decision is announced on the SECOND day of each 2-day meeting,
// matching the convention every existing hand-curated US 'rate' entry already uses.
async function fetchFedDates() {
    const html = await fetchText('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm');
    const monthMap = Object.fromEntries(MONTH_NAME_EN.map((n, i) => [n, i + 1]));
    const yearHeaders = [...html.matchAll(/<h4><a id="\d+">(\d{4}) FOMC Meetings<\/a><\/h4>/g)]
        .map(m => ({ index: m.index, year: m[1] }));
    const dates = [];
    yearHeaders.forEach((h, i) => {
        const end = i + 1 < yearHeaders.length ? yearHeaders[i + 1].index : html.length;
        const section = html.slice(h.index, end);
        for (const m of section.matchAll(/<strong>(\w+)<\/strong><\/div>\s*<div class="fomc-meeting__date[^"]*">\s*\d+-(\d+)\*?\s*<\/div>/g)) {
            const month = monthMap[m[1]];
            if (month) dates.push(isoDate(h.year, month, +m[2]));
        }
    });
    return dates;
}

// ---- ECB (Eurozone) ----
// A plain <dt>date</dt><dd>description</dd> list mixing several event types (monetary
// policy meetings, non-monetary meetings, General Council meetings). Only the "Day 2"
// entry of each monetary policy meeting is a rate decision (Day 2 is followed by the
// press conference) — matches the existing hand-curated convention.
async function fetchEcbDates() {
    const html = await fetchText('https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html');
    const dates = [];
    for (const m of html.matchAll(/<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>\s*([^<]*)/g)) {
        const [, dd, mm, yyyy, desc] = m;
        if (desc.includes('monetary policy meeting') && desc.includes('Day 2')) {
            dates.push(isoDate(yyyy, +mm, +dd));
        }
    }
    return dates;
}

// ---- Bank of Japan ----
// One <table> per year (captioned "Table : YYYY"), each row's first <td> is the
// meeting's date range — a link once the decision has happened, plain text before
// that, so the text is extracted after stripping tags either way. Decision is the
// SECOND day, same convention as Fed/ECB above.
async function fetchBojDates() {
    const html = await fetchText('https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm');
    const monthMap = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, June: 6, Jun: 6, July: 7, Jul: 7, Aug: 8, Sept: 9, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const dates = [];
    for (const t of html.matchAll(/<caption class="non-caption">Table\s*:\s*(\d{4})<\/caption>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)) {
        const [, year, tbody] = t;
        for (const row of tbody.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>/g)) {
            const text = row[1].replace(/<[^>]+>/g, '');
            const m = text.match(/([A-Za-z]+)\.?\s+\d+\s*\([^)]*\),\s*(\d+)\s*\(/);
            if (m && monthMap[m[1]]) dates.push(isoDate(year, monthMap[m[1]], +m[2]));
        }
    }
    return dates;
}

// ---- PBOC (China) ----
// No live source needed: the Loan Prime Rate is released at a fixed, long-published
// time — the 20th of every month, or the next business day when the 20th falls on a
// weekend. This is the exact rule the existing hand-curated PBOC entries already
// follow (2026-06-22 for a June 20th that fell on a Saturday, 2026-09-21 for a
// September 20th that fell on a Sunday) — not a guess, just the same rule computed.
function pbocLprDate(year, month) {
    const d = new Date(Date.UTC(year, month - 1, 20));
    const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
    else if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function pbocDatesForWindow(monthsAhead) {
    const dates = [];
    const now = new Date();
    for (let i = 0; i <= monthsAhead; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        dates.push(pbocLprDate(d.getFullYear(), d.getMonth() + 1));
    }
    return dates;
}

function futureDatesInWindow(dates, monthsAhead) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today.getFullYear(), today.getMonth() + monthsAhead + 1, 0); // last day of the last covered month
    return dates.filter(ds => {
        const d = new Date(ds + 'T00:00:00');
        return d >= today && d <= cutoff;
    });
}

// ---- Event builders — match the existing hand-curated title/detail style exactly,
// but with no outcome commentary (unlike a hand-written past entry, there's nothing to
// report yet) ----
function fedEvent(date) {
    const month = +date.slice(5, 7);
    return { date, country: 'US', category: 'rate',
        titleKo: `${month}월 FOMC 기준금리 결정`, titleEn: `${MONTH_NAME_EN[month - 1]} FOMC Rate Decision`,
        detailKo: '정책금리 목표범위', detailEn: 'Target Range' };
}
function ecbEvent(date) {
    const month = +date.slice(5, 7);
    return { date, country: 'EU', category: 'rate',
        titleKo: `ECB ${month}월 통화정책회의`, titleEn: `ECB ${MONTH_NAME_EN[month - 1]} Policy Meeting`,
        detailKo: '주요 재융자금리', detailEn: 'Main Refinancing Rate' };
}
function bojEvent(date) {
    const month = +date.slice(5, 7);
    return { date, country: 'JP', category: 'rate',
        titleKo: `일본은행 ${month}월 금융정책결정회의`, titleEn: `Bank of Japan ${MONTH_NAME_EN[month - 1]} Decision`,
        detailKo: '정책금리', detailEn: 'Policy Rate' };
}
function pbocEvent(date) {
    const month = +date.slice(5, 7);
    return { date, country: 'CN', category: 'rate',
        titleKo: `중국 대출우대금리(LPR) ${month}월`, titleEn: `PBOC LPR ${MONTH_NAME_EN[month - 1]}`,
        detailKo: '1년 LPR / 5년+ LPR (날짜 추정)', detailEn: '1Y LPR / 5Y+ LPR (date approximate)' };
}

// ---- Parse/serialize CALENDAR_EVENTS as text (never eval'd) so a change here can
// never execute anything beyond reading and rewriting this one array literal ----
const COUNTRY_ORDER = ['US', 'GB', 'EU', 'KR', 'CN', 'JP'];
const COUNTRY_HEADER = { US: 'United States', GB: 'United Kingdom', EU: 'Eurozone', KR: 'Korea', CN: 'China', JP: 'Japan' };
const EVENT_RE = /\{\s*date:\s*'([^']*)',\s*country:\s*'([^']*)',\s*category:\s*'([^']*)',\s*titleKo:\s*'((?:[^'\\]|\\.)*)',\s*titleEn:\s*'((?:[^'\\]|\\.)*)'(?:,\s*detailKo:\s*'((?:[^'\\]|\\.)*)')?(?:,\s*detailEn:\s*'((?:[^'\\]|\\.)*)')?\s*\}/g;

function parseEvents(arrayText) {
    return [...arrayText.matchAll(EVENT_RE)].map(m => ({
        date: m[1], country: m[2], category: m[3],
        titleKo: m[4], titleEn: m[5],
        detailKo: m[6] ?? '', detailEn: m[7] ?? ''
    }));
}

function serializeEvent(ev) {
    const detail = (ev.detailKo || ev.detailEn) ? `, detailKo: '${ev.detailKo}', detailEn: '${ev.detailEn}'` : '';
    return `    { date: '${ev.date}', country: '${ev.country}', category: '${ev.category}', titleKo: '${ev.titleKo}', titleEn: '${ev.titleEn}'${detail} }`;
}

function serializeEvents(events) {
    const byCountry = new Map(COUNTRY_ORDER.map(c => [c, []]));
    events.forEach(ev => { if (byCountry.has(ev.country)) byCountry.get(ev.country).push(ev); });
    const blocks = COUNTRY_ORDER.map(c => {
        const list = byCountry.get(c).slice().sort((a, b) => a.date.localeCompare(b.date));
        if (!list.length) return null;
        return `    // ---- ${COUNTRY_HEADER[c]} ----\n` + list.map(serializeEvent).join(',\n');
    }).filter(Boolean);
    return '[\n' + blocks.join(',\n\n') + '\n]';
}

async function main() {
    const original = await fs.readFile(CONFIG_PATH, 'utf-8');
    const arrayMatch = original.match(/const CALENDAR_EVENTS = (\[[\s\S]*?\n\]);/);
    if (!arrayMatch) throw new Error('CALENDAR_EVENTS array not found in calendar-config.js');
    const existing = parseEvents(arrayMatch[1]);
    if (existing.length === 0) throw new Error('Parsed 0 events — refusing to overwrite calendar-config.js (parser likely out of sync with the file format)');
    const existingKeys = new Set(existing.map(e => `${e.date}|${e.country}|${e.category}`));

    const sources = await Promise.allSettled([
        fetchFedDates().then(dates => ({ source: 'Fed', dates, build: fedEvent })),
        fetchEcbDates().then(dates => ({ source: 'ECB', dates, build: ecbEvent })),
        fetchBojDates().then(dates => ({ source: 'BOJ', dates, build: bojEvent }))
    ]);

    const added = [];
    for (const r of sources) {
        if (r.status !== 'fulfilled') { console.warn('Fetch failed:', r.reason?.message || r.reason); continue; }
        const { source, dates, build } = r.value;
        for (const date of futureDatesInWindow(dates, MONTHS_AHEAD)) {
            const ev = build(date);
            const key = `${ev.date}|${ev.country}|${ev.category}`;
            if (!existingKeys.has(key)) { existing.push(ev); existingKeys.add(key); added.push(`${source} ${date}`); }
        }
    }
    // PBOC needs no fetch — pure computed rule, always available even if every network
    // call above failed.
    for (const date of pbocDatesForWindow(MONTHS_AHEAD)) {
        const ev = pbocEvent(date);
        const key = `${ev.date}|${ev.country}|${ev.category}`;
        if (!existingKeys.has(key)) { existing.push(ev); existingKeys.add(key); added.push(`PBOC ${date}`); }
    }

    if (added.length === 0) {
        console.log('No new calendar dates to add.');
        return;
    }

    const newArrayText = serializeEvents(existing);
    const updated = original.slice(0, arrayMatch.index)
        + `const CALENDAR_EVENTS = ${newArrayText};`
        + original.slice(arrayMatch.index + arrayMatch[0].length);
    await fs.writeFile(CONFIG_PATH, updated, 'utf-8');
    console.log(`Added ${added.length} new date(s):\n` + added.join('\n'));
}

main().catch(err => { console.error(err); process.exitCode = 1; });
