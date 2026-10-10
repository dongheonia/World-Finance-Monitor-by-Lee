#!/usr/bin/env node
// Extends js/data/calendar-config.js's CALENDAR_EVENTS with newly-published upcoming
// rate-decision dates — and, since 2026-10-10, indicator release dates (US GDP/PCE via
// BEA, retail sales via Census, industrial production via the Fed's G.17 page, euro
// area HICP/GDP/unemployment/PPI/retail/industry via Eurostat, UK CPI/GDP/retail/labour
// market via ONS, BoE decisions, and
// rule-based ISM/Korea trade/NBS PMI; see "Indicator release schedules" below) — with
// no developer step in between — run daily by
// .github/workflows/refresh-calendar.yml (see that file for the schedule).
//
// New entries this script adds are schedule-only: date + which decision is due, never a
// time-of-day or an announced value/previous-value (see the comment above
// CALENDAR_EVENTS in calendar-config.js) — that's exactly what CAN be automated
// reliably for free, since each institution publishes its meeting SCHEDULE up to a year
// or more in advance on its own official site, but the actual decision/figure only
// exists after the meeting happens and needs a human to read the release. Existing
// entries already carrying time/value/prev (hand-curated separately) are preserved
// as-is — see parseEvents()/serializeEvent() below.
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

// ---- Indicator release schedules (2026-10-10) ----
// Without these the calendar ran dry after the last hand-entered month — only rate
// decisions kept getting added. Each source below is the agency's own published
// schedule in a machine-readable or stable form; where an agency publishes none we
// can reach (BLS blocks automated requests; Statistics Japan, Statistics Korea and NBS
// China publish theirs as PDFs/tables), the dates stay hand-entered.

// BEA (US GDP, PCE) — BEA's own machine-readable schedule.
async function fetchBeaEvents() {
    const data = JSON.parse(await fetchText('https://apps.bea.gov/API/signup/release_dates.json'));
    const events = [];
    for (const iso of (data['Gross Domestic Product'] || {}).release_dates || []) {
        const date = iso.slice(0, 10);
        const m = +date.slice(5, 7);
        const step = (m - 1) % 3; // Jan/Apr/Jul/Oct = advance, then second, then third
        const quarter = Math.floor((m - 1) / 3) || 4;
        const kinds = [['속보치', 'Advance Estimate'], ['수정치', 'Second Estimate'], ['확정치', 'Third Estimate']][step];
        events.push({ date, time: '08:30', country: 'US', category: 'gdp',
            titleKo: `미국 ${quarter}분기 GDP (${kinds[0]})`, titleEn: `US Q${quarter} GDP (${kinds[1]})`,
            detailKo: '연율 환산 성장률', detailEn: 'Annualized Growth Rate' });
    }
    for (const iso of (data['Personal Income and Outlays'] || {}).release_dates || []) {
        const date = iso.slice(0, 10);
        const ref = (+date.slice(5, 7) + 10) % 12 + 1; // the previous month
        events.push({ date, time: '08:30', country: 'US', category: 'pce',
            titleKo: `미국 ${ref}월 PCE 물가지수`, titleEn: `US ${MONTH_NAME_EN[ref - 1]} PCE Price Index`,
            detailKo: '헤드라인 PCE (YoY)', detailEn: 'Headline PCE (YoY)' });
    }
    return events;
}

// Eurostat (euro area flash HICP, GDP flashes) — Eurostat's own release-calendar ICS.
async function fetchEurostatEvents() {
    const ics = (await fetchText('https://ec.europa.eu/eurostat/o/calendars/eventsIcal?theme=0&category=0')).replace(/\r?\n[ \t]/g, '');
    const events = [];
    for (const block of ics.split('BEGIN:VEVENT').slice(1)) {
        const d = block.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})/);
        const summary = (block.match(/SUMMARY[^:]*:(.*)/) || [])[1] || '';
        if (!d) continue;
        const date = isoDate(d[1], +d[2], +d[3]);
        const m = +d[2];
        if (/^Flash estimate inflation euro area/i.test(summary)) {
            // Usually published right after the reference month ends; an end-of-month
            // release covers that same month.
            const ref = +d[3] >= 25 ? m : (m + 10) % 12 + 1;
            events.push({ date, time: '11:00', country: 'EU', category: 'cpi',
                titleKo: `유로존 ${ref}월 HICP (속보치)`, titleEn: `Eurozone ${MONTH_NAME_EN[ref - 1]} HICP (Flash)`,
                detailKo: '소비자물가 (YoY)', detailEn: 'Consumer Price Index (YoY)' });
        } else if (/^(Unemployment|Industrial producer prices\\?, domestic market|Retail trade|Industrial production)$/i.test(summary.trim())) {
            // Monthly euro-area releases, all two months behind the release month —
            // except an end-of-month unemployment release, which covers the month before.
            const kind = summary.trim().toLowerCase();
            const lag = kind.startsWith('unemployment') && +d[3] >= 25 ? 1 : 2;
            const refDate = new Date(Date.UTC(+d[1], m - 1 - lag, 1));
            const ref = refDate.getUTCMonth() + 1;
            const [category, ko, en, dKo, dEn] = kind.startsWith('unemployment') ? ['employment', '실업률', 'Unemployment Rate', '실업률', 'Unemployment Rate']
                : kind.startsWith('industrial producer') ? ['ppi', '생산자물가(PPI)', 'PPI', '생산자물가 (YoY)', 'Producer Prices (YoY)']
                : kind.startsWith('retail') ? ['retail', '소매판매', 'Retail Sales', '전월 대비', 'Month-on-month']
                : ['industrial', '산업생산', 'Industrial Production', '전월 대비', 'Month-on-month'];
            events.push({ date, time: '11:00', country: 'EU', category,
                titleKo: `유로존 ${ref}월 ${ko}`, titleEn: `Eurozone ${MONTH_NAME_EN[ref - 1]} ${en}`, detailKo: dKo, detailEn: dEn });
        } else if (/^(Preliminary flash estimate GDP|Flash estimate GDP)/i.test(summary) && /euro area/i.test(summary)) {
            const quarter = Math.floor((m - 1) / 3) || 4;
            const preliminary = /^Preliminary/i.test(summary);
            events.push({ date, time: '11:00', country: 'EU', category: 'gdp',
                titleKo: `유로존 ${quarter}분기 GDP (${preliminary ? '예비 속보치' : '속보치'})`,
                titleEn: `Eurozone Q${quarter} GDP (${preliminary ? 'Preliminary Flash' : 'Flash'})`,
                detailKo: '전분기 대비', detailEn: 'Quarter-on-quarter' });
        }
    }
    return events;
}

// ONS (UK CPI, monthly GDP) — every upcoming release has its own page at a predictable
// address naming the reference month, carrying "Release date: 18 November 2026 7:00am".
async function fetchOnsEvents() {
    const events = [];
    const now = new Date();
    const monthIndex = Object.fromEntries(MONTH_NAME_EN.map((n, i) => [n, i + 1]));
    for (let i = -2; i <= MONTHS_AHEAD; i++) {
        const ref = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
        const refMonth = ref.getUTCMonth() + 1;
        const slug = `${MONTH_NAME_EN[refMonth - 1].toLowerCase()}${ref.getUTCFullYear()}`;
        for (const [page, build] of [
            [`consumerpriceinflationuk${slug}`, date => ({ date, time: '07:00', country: 'GB', category: 'cpi',
                titleKo: `영국 ${refMonth}월 CPI`, titleEn: `UK ${MONTH_NAME_EN[refMonth - 1]} CPI`,
                detailKo: '소비자물가 (YoY)', detailEn: 'Consumer Price Index (YoY)' })],
            [`gdpmonthlyestimateuk${slug}`, date => ({ date, time: '07:00', country: 'GB', category: 'gdp',
                titleKo: `영국 ${refMonth}월 월간 GDP`, titleEn: `UK ${MONTH_NAME_EN[refMonth - 1]} Monthly GDP`,
                detailKo: '전월 대비', detailEn: 'Month-on-month' })],
            [`retailsalesgreatbritain${slug}`, date => ({ date, time: '07:00', country: 'GB', category: 'retail',
                titleKo: `영국 ${refMonth}월 소매판매`, titleEn: `UK ${MONTH_NAME_EN[refMonth - 1]} Retail Sales`,
                detailKo: '전월 대비', detailEn: 'Month-on-month' })],
            // The labour market release is named after its PUBLICATION month.
            [`uklabourmarket${slug}`, date => ({ date, time: '07:00', country: 'GB', category: 'employment',
                titleKo: `영국 ${refMonth}월 노동시장 보고서`, titleEn: `UK ${MONTH_NAME_EN[refMonth - 1]} Labour Market Report`,
                detailKo: '실업률 (ILO, 3개월)', detailEn: 'Unemployment Rate (ILO, 3-month)' })]
        ]) {
            try {
                const text = (await fetchText(`https://www.ons.gov.uk/releases/${page}`)).replace(/<[^>]+>/g, ' ');
                const m = text.match(/Release date:\s*(\d{1,2}) ([A-Z][a-z]+) (\d{4})/);
                if (m && monthIndex[m[2]]) events.push(build(isoDate(m[3], monthIndex[m[2]], +m[1])));
            } catch (e) { /* not announced yet */ }
        }
    }
    return events;
}

// US Census (retail sales) — its release-schedule page lists "<data month> <release date>".
async function fetchCensusRetailEvents() {
    const text = (await fetchText('https://www.census.gov/retail/release_schedule.html')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const monthIndex = Object.fromEntries(MONTH_NAME_EN.map((n, i) => [n, i + 1]));
    const events = [];
    const seen = new Set();
    for (const m of text.matchAll(/([A-Z][a-z]+) (\d{4}) ([A-Z][a-z]+) (\d{1,2}), (\d{4})/g)) {
        const [, refName, , relName, day, year] = m;
        if (!monthIndex[refName] || !monthIndex[relName]) continue;
        const date = isoDate(year, monthIndex[relName], +day);
        if (seen.has(date)) continue;
        seen.add(date);
        const ref = monthIndex[refName];
        events.push({ date, time: '08:30', country: 'US', category: 'retail',
            titleKo: `미국 ${ref}월 소매판매`, titleEn: `US ${refName} Retail Sales`, detailKo: '전월 대비', detailEn: 'Month-on-month' });
    }
    return events;
}

// Federal Reserve G.17 (industrial production) — its own release-dates page.
async function fetchFedIndustrialEvents() {
    const text = (await fetchText('https://www.federalreserve.gov/releases/g17/release_dates.htm')).replace(/<[^>]+>/g, ' ');
    const monthIndex = Object.fromEntries(MONTH_NAME_EN.map((n, i) => [n, i + 1]));
    const events = [];
    for (const m of text.matchAll(/(\d{1,2})-([A-Z][a-z]+)-(\d{4})/g)) {
        const month = monthIndex[m[2]];
        if (!month) continue;
        const ref = month === 1 ? 12 : month - 1;
        events.push({ date: isoDate(m[3], month, +m[1]), time: '09:15', country: 'US', category: 'industrial',
            titleKo: `미국 ${ref}월 산업생산`, titleEn: `US ${MONTH_NAME_EN[ref - 1]} Industrial Production`,
            detailKo: '전월 대비', detailEn: 'Month-on-month' });
    }
    return events;
}

// Bank of England — its "upcoming MPC dates" page (now reachable; it used to 403).
async function fetchBoeEvents() {
    const text = (await fetchText('https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates'))
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const monthIndex = Object.fromEntries(MONTH_NAME_EN.map((n, i) => [n, i + 1]));
    const events = [];
    const sections = [...text.matchAll(/(\d{4}) confirmed dates/g)];
    sections.forEach((sec, i) => {
        const part = text.slice(sec.index, i + 1 < sections.length ? sections[i + 1].index : undefined);
        for (const m of part.matchAll(/Thursday (\d{1,2}) ([A-Z][a-z]+)/g)) {
            if (!monthIndex[m[2]]) continue;
            const month = monthIndex[m[2]];
            events.push({ date: isoDate(sec[1], month, +m[1]), time: '12:00', country: 'GB', category: 'rate',
                titleKo: `영란은행 ${month}월 통화정책회의`, titleEn: `Bank of England ${MONTH_NAME_EN[month - 1]} Decision`,
                detailKo: '기준금리', detailEn: 'Bank Rate' });
        }
    });
    return events;
}

// Fixed-rule releases — each agency's long-standing practice, computed rather than
// fetched (same approach as pbocLprDate above):
//  - ISM Manufacturing: 1st US business day of the month; ISM Services: the 3rd.
//  - Korea trade statistics: the 1st of the month, 09:00, weekends included.
//  - China NBS manufacturing PMI: the last day of the month (NBS's own 2026 calendar
//    follows this, Saturdays included).
function usBusinessDays(year, month) {
    const days = [];
    const laborDay = month === 9 ? (() => { const d = new Date(Date.UTC(year, 8, 1)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return d.getUTCDate(); })() : null;
    for (let day = 1; day <= 10; day++) {
        const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        if (wd === 0 || wd === 6 || (month === 1 && day === 1) || day === laborDay) continue;
        days.push(day);
    }
    return days;
}
function ruleBasedEvents(monthsAhead) {
    const events = [];
    const now = new Date();
    for (let i = 0; i <= monthsAhead; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const year = d.getFullYear(), month = d.getMonth() + 1;
        const ref = month === 1 ? 12 : month - 1;
        const [first, , third] = usBusinessDays(year, month);
        events.push({ date: isoDate(year, month, first), time: '10:00', country: 'US', category: 'pmi',
            titleKo: `미국 ${ref}월 ISM 제조업 PMI`, titleEn: `US ${MONTH_NAME_EN[ref - 1]} ISM Manufacturing PMI`,
            detailKo: 'ISM 제조업 지수', detailEn: 'ISM Manufacturing Index' });
        events.push({ date: isoDate(year, month, third), time: '10:00', country: 'US', category: 'pmi',
            titleKo: `미국 ${ref}월 ISM 비제조업 PMI`, titleEn: `US ${MONTH_NAME_EN[ref - 1]} ISM Services PMI`,
            detailKo: 'ISM 서비스업 지수', detailEn: 'ISM Services Index' });
        events.push({ date: isoDate(year, month, 1), time: '09:00', country: 'KR', category: 'trade',
            titleKo: `한국 ${ref}월 수출입동향`, titleEn: `Korea ${MONTH_NAME_EN[ref - 1]} Trade Statistics`,
            detailKo: '수출 증가율 / 무역수지', detailEn: 'Export Growth / Trade Balance' });
        const lastDay = new Date(year, month, 0).getDate();
        events.push({ date: isoDate(year, month, lastDay), time: '09:30', country: 'CN', category: 'pmi',
            titleKo: `중국 ${month}월 국가통계국 제조업 PMI`, titleEn: `China ${MONTH_NAME_EN[month - 1]} NBS Manufacturing PMI`,
            detailKo: '국가통계국(NBS) 지수', detailEn: 'NBS Index' });
    }
    return events;
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
// time/value/prev are hand-curated (see the comment above CALENDAR_EVENTS) and this
// script never has data to fill them in for the new entries it adds — but existing
// entries DO carry them, so the parser must round-trip whatever's already there
// (any subset, in any order after category) rather than silently dropping it.
const EVENT_RE = /\{\s*date:\s*'([^']*)',\s*(?:time:\s*'([^']*)',\s*)?country:\s*'([^']*)',\s*category:\s*'([^']*)',\s*titleKo:\s*'((?:[^'\\]|\\.)*)',\s*titleEn:\s*'((?:[^'\\]|\\.)*)'(?:,\s*detailKo:\s*'((?:[^'\\]|\\.)*)')?(?:,\s*detailEn:\s*'((?:[^'\\]|\\.)*)')?(?:,\s*valueKo:\s*'((?:[^'\\]|\\.)*)')?(?:,\s*valueEn:\s*'((?:[^'\\]|\\.)*)')?(?:,\s*prevKo:\s*'((?:[^'\\]|\\.)*)')?(?:,\s*prevEn:\s*'((?:[^'\\]|\\.)*)')?\s*\}/g;

function parseEvents(arrayText) {
    return [...arrayText.matchAll(EVENT_RE)].map(m => ({
        date: m[1], time: m[2] ?? '', country: m[3], category: m[4],
        titleKo: m[5], titleEn: m[6],
        detailKo: m[7] ?? '', detailEn: m[8] ?? '',
        valueKo: m[9] ?? '', valueEn: m[10] ?? '',
        prevKo: m[11] ?? '', prevEn: m[12] ?? ''
    }));
}

function serializeEvent(ev) {
    const time = ev.time ? `, time: '${ev.time}'` : '';
    const detail = (ev.detailKo || ev.detailEn) ? `, detailKo: '${ev.detailKo}', detailEn: '${ev.detailEn}'` : '';
    const value = (ev.valueKo || ev.valueEn) ? `, valueKo: '${ev.valueKo}', valueEn: '${ev.valueEn}'` : '';
    const prev = (ev.prevKo || ev.prevEn) ? `, prevKo: '${ev.prevKo}', prevEn: '${ev.prevEn}'` : '';
    return `    { date: '${ev.date}'${time}, country: '${ev.country}', category: '${ev.category}', titleKo: '${ev.titleKo}', titleEn: '${ev.titleEn}'${detail}${value}${prev} }`;
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
    // Indicator schedules. Matched against existing entries by date+country+category+
    // title, so a hand-entered release on the same day as another of its kind (UK
    // monthly and quarterly GDP) doesn't block it, while re-runs never duplicate.
    const existingTitled = new Set(existing.map(e => `${e.date}|${e.country}|${e.category}|${e.titleEn}`));
    const indicatorSources = await Promise.allSettled([
        fetchBeaEvents().then(events => ({ source: 'BEA', events })),
        fetchEurostatEvents().then(events => ({ source: 'Eurostat', events })),
        fetchOnsEvents().then(events => ({ source: 'ONS', events })),
        fetchBoeEvents().then(events => ({ source: 'BoE', events })),
        fetchCensusRetailEvents().then(events => ({ source: 'Census', events })),
        fetchFedIndustrialEvents().then(events => ({ source: 'Fed G.17', events })),
        Promise.resolve({ source: 'rule', events: ruleBasedEvents(MONTHS_AHEAD) })
    ]);
    for (const r of indicatorSources) {
        if (r.status !== 'fulfilled') { console.warn('Fetch failed:', r.reason?.message || r.reason); continue; }
        const { source, events } = r.value;
        for (const ev of events) {
            if (futureDatesInWindow([ev.date], MONTHS_AHEAD).length === 0) continue;
            const key = `${ev.date}|${ev.country}|${ev.category}|${ev.titleEn}`;
            // Same release already hand-entered under a slightly different title (e.g.
            // the "(date approximate)" Caixin entries) — same day, country, category and
            // reference month counts as the same event.
            const sameDay = existing.some(e => e.date === ev.date && e.country === ev.country && e.category === ev.category
                && [...MONTH_NAME_EN, 'Q1', 'Q2', 'Q3', 'Q4'].some(t => e.titleEn.includes(t) && ev.titleEn.includes(t)));
            if (existingTitled.has(key) || sameDay) continue;
            existing.push(ev);
            existingTitled.add(key);
            added.push(`${source} ${ev.date} ${ev.titleEn}`);
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
