// ============================ ECONOMIC CALENDAR ============================
let calendarViewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

// Bounds are computed from the REAL current date every time (not a fixed month), so the
// navigable window automatically slides forward as real time passes — e.g. once August
// 2026 arrives, the window becomes Jul-Sep without any code change. Deliberately
// narrow (last/this/next month only) per explicit request, rather than the wider
// ±2-month window this used to allow.
function calendarMinDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}
function calendarMaxDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function calendarShiftMonth(delta) {
    const next = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
    if (next < calendarMinDate() || next > calendarMaxDate()) return;
    calendarViewDate = next;
    renderCalendar();
}

function calEventsInMonth(year, month) {
    return CALENDAR_EVENTS
        .filter(e => {
            const d = new Date(e.date + 'T00:00:00');
            return d.getFullYear() === year && d.getMonth() === month;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
}

function calEventTagText(ev) {
    return CALENDAR_CATEGORY_LABEL[currentLang][ev.category];
}

function calEventTitle(ev) {
    return currentLang === 'ko' ? ev.titleKo : ev.titleEn;
}

function renderCalendarGrid(year, month) {
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    const weekdays = currentLang === 'ko'
        ? ['일', '월', '화', '수', '목', '금', '토']
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = weekdays.map((w, i) => `<div class="cal-weekday${i === 0 ? ' cal-sun' : ''}${i === 6 ? ' cal-sat' : ''}">${w}</div>`).join('');

    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
        const dayNum = i - startOffset + 1;
        const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
        const dateStr = inMonth ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : null;
        const dayEvents = inMonth ? CALENDAR_EVENTS.filter(e => e.date === dateStr) : [];
        const isToday = dateStr === todayStr;
        const dow = i % 7; // grid always starts on Sunday, so column index === day-of-week
        const weekendClass = inMonth ? (dow === 0 ? ' cal-sun-cell' : dow === 6 ? ' cal-sat-cell' : '') : '';
        html += `<div class="cal-day${inMonth ? '' : ' other-month'}${isToday ? ' today' : ''}${weekendClass}">`;
        if (inMonth) {
            html += `<div class="cal-day-num">${dayNum}</div>`;
            const shown = dayEvents.slice(0, 5);
            shown.forEach(ev => {
                html += `<span class="cal-tag${ev.category === 'rate' ? ' cat-rate' : ''}">${calFlagPrefix(ev.country)} ${calEventTagText(ev)}</span>`;
            });
            if (dayEvents.length > shown.length) {
                html += `<span class="cal-tag-more">+${dayEvents.length - shown.length}</span>`;
            }
        }
        html += `</div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
}

function renderCalendarList(year, month) {
    const events = calEventsInMonth(year, month);
    const todayStr = new Date().toISOString().slice(0, 10);
    document.getElementById('cal-event-list').innerHTML = events.map(ev => {
        const isPast = ev.date < todayStr;
        const isToday = ev.date === todayStr;
        const dateLabel = ev.date.slice(5).replace('-', '.');
        const detail = currentLang === 'ko' ? ev.detailKo : ev.detailEn;
        return `
            <div class="cal-list-item${isPast ? ' cal-past' : ''}${isToday ? ' cal-today' : ''}" data-date="${ev.date}">
                <div class="cal-list-date">${dateLabel}</div>
                <div class="cal-list-body">
                    <div class="cal-list-title">${calFlagPrefix(ev.country)} ${calEventTitle(ev)}</div>
                    <div class="cal-list-detail">${detail || ''}</div>
                </div>
            </div>
        `;
    }).join('') || `<div class="text-gray-600 text-sm">${currentLang === 'ko' ? '이벤트 없음' : 'No events'}</div>`;
}

function renderCalendar() {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    document.getElementById('cal-month-label').innerText = currentLang === 'ko'
        ? `${year}년 ${month + 1}월`
        : calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('cal-list-title').innerText = currentLang === 'ko' ? '이벤트' : 'Events';
    document.getElementById('cal-today-btn').innerText = currentLang === 'ko' ? '오늘' : 'Today';
    const prevBtn = document.getElementById('cal-prev-btn');
    const nextBtn = document.getElementById('cal-next-btn');
    prevBtn.disabled = calendarViewDate <= calendarMinDate();
    nextBtn.disabled = calendarViewDate >= calendarMaxDate();
    renderCalendarGrid(year, month);
    renderCalendarList(year, month);
    syncCalendarListHeight();
}

// The month grid's height varies (5 vs 6 week rows), and grew further once day cells
// were made tall enough for 5 event tags — rather than a fixed max-height that falls out
// of sync whenever either of those changes, this measures the grid's actual rendered
// height each render and matches the event list to it.
function syncCalendarListHeight() {
    const grid = document.getElementById('cal-grid');
    const list = document.getElementById('cal-event-list');
    if (!grid || !list) return;
    list.style.maxHeight = `${grid.getBoundingClientRect().height}px`;
}


// Shared by centerCalendarOnToday/scrollTodayToTop below — falls back to the nearest
// upcoming event if nothing is dated exactly today, and to the last event if today is
// past everything curated for the currently-viewed month.
function findTodayListItem(container) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const items = Array.from(container.querySelectorAll('.cal-list-item'));
    if (!items.length) return null;
    return items.find(el => el.dataset.date === todayStr)
        || items.find(el => el.dataset.date > todayStr)
        || items[items.length - 1];
}

// offsetTop is relative to the nearest POSITIONED ancestor, which isn't necessarily this
// container — getBoundingClientRect() deltas give the true position within it regardless
// of what else sits between them in the DOM.
function listItemTopInContainer(container, target) {
    return target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

// Called once on initial load (not on every renderCalendar — re-centering on every nav
// click/tab switch would be disorienting) so the side list opens already scrolled to
// "now" instead of dumping the reader at the top of the month. The scrollTop clamp below
// naturally handles "too close to an edge to actually center" by just sitting at that
// edge instead.
function centerCalendarOnToday() {
    const container = document.getElementById('cal-event-list');
    if (!container) return;
    const target = findTodayListItem(container);
    if (!target) return;
    const targetCenter = listItemTopInContainer(container, target) + target.clientHeight / 2;
    const desiredScrollTop = targetCenter - container.clientHeight / 2;
    container.scrollTop = Math.max(0, Math.min(desiredScrollTop, container.scrollHeight - container.clientHeight));
}

// Used by the "Today" button — pins today's event to the TOP of the visible list instead
// of centering it, so the reader lands looking forward from today. Same edge-clamping as
// centerCalendarOnToday: if today is near the end of the curated list, there's nowhere
// further to scroll, so it just settles at the bottom showing whatever's left.
function scrollTodayToTop() {
    const container = document.getElementById('cal-event-list');
    if (!container) return;
    const target = findTodayListItem(container);
    if (!target) return;
    const desiredScrollTop = listItemTopInContainer(container, target);
    container.scrollTop = Math.max(0, Math.min(desiredScrollTop, container.scrollHeight - container.clientHeight));
}

// "Today" button — jumps the month grid back to whatever month contains today's real
// date (regardless of how far the reader has navigated) and re-scrolls the event list.
function goToTodayCalendar() {
    const now = new Date();
    calendarViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
    requestAnimationFrame(scrollTodayToTop);
}

