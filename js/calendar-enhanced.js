/**
 * calendar-enhanced.js
 * ─────────────────────────────────────────────────────────────────
 * Enhances booking.html without replacing booking.js.
 *
 * ═══════════════════════════════════════════════════════════════
 * SELECTION MODEL  (exclusive end-date, always intact)
 * ═══════════════════════════════════════════════════════════════
 *
 *  Internal state:
 *    S.checkIn   — 'YYYY-MM-DD' | null   first night (inclusive)
 *    S.lastNight — 'YYYY-MM-DD' | null   last  night (inclusive)
 *
 *  Derived (never stored):
 *    endDate = addDays(lastNight, 1)      exclusive checkout
 *
 *  What booking.js / backend always sees:
 *    #startDate = checkIn
 *    #endDate   = endDate  (exclusive)
 *
 * ───────────────────────────────────────────────────────────────
 * CLICK RULES
 * ───────────────────────────────────────────────────────────────
 *
 *  Phase IDLE  (nothing selected)
 *    Click any available date D
 *      → checkIn = lastNight = D   (1-night stay, immediately complete)
 *        endDate = D + 1
 *        Highlight only [D].       (D+1 = checkout, never highlighted)
 *        Phase → ANCHORED
 *
 *  Phase ANCHORED
 *    Double-click checkIn (same date clicked twice)
 *      → clear everything.
 *        Phase → IDLE
 *
 *    Click date AFTER checkIn  (including extending past lastNight, or
 *                               shrinking by clicking between ci and ln)
 *      → lastNight = clicked date.
 *        endDate   = clicked + 1.
 *        Highlight [checkIn … clicked].
 *        Checkout (endDate) NOT highlighted.
 *        Phase stays ANCHORED.
 *
 *    Click date BEFORE checkIn
 *      → reset: checkIn = lastNight = clicked (new 1-night anchor).
 *        Phase stays ANCHORED.
 *
 *  Range must be contiguous and free of booked dates.
 *  If a booked date is in the proposed range, show an error, leave state unchanged.
 *
 * ───────────────────────────────────────────────────────────────
 * HOVER PREVIEW  (ANCHORED only, forward extension only)
 * ───────────────────────────────────────────────────────────────
 *  While ANCHORED, hovering a date > lastNight previews
 *  the extension band (lastNight, hoverDate] in a lighter colour.
 *  The committed selection is not re-coloured during hover.
 *
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // ── State ──────────────────────────────────────────────────────
    const S = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),

        bookedSet: new Set(),
        rawBookings: [],

        checkIn: null,   // first night, inclusive
        lastNight: null,   // last  night, inclusive
        phase: 'IDLE', // 'IDLE' | 'ANCHORED'
        hoverDate: null,   // forward-extension preview
    };

    let $calSection, $wrap, $hint, $chips, $cta;

    // ─────────────────────────────────────────────────────────────
    // DATE UTILITIES
    // ─────────────────────────────────────────────────────────────

    function toLocalStr(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function addDays(str, n) {
        const d = new Date(str + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return toLocalStr(d);
    }

    function diffDays(a, b) {
        return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
    }

    function todayStr() { return toLocalStr(new Date()); }

    function humanDate(str) {
        return new Date(str + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    /** True iff every date in [fromInclusive, toExclusive) is free. */
    function isRangeFree(fromInclusive, toExclusive) {
        const cur = new Date(fromInclusive + 'T12:00:00');
        const end = new Date(toExclusive + 'T12:00:00');
        while (cur < end) {
            if (S.bookedSet.has(toLocalStr(cur))) return false;
            cur.setDate(cur.getDate() + 1);
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    // DERIVED
    // ─────────────────────────────────────────────────────────────

    /** Exclusive checkout date, or null. */
    function getEndDate() { return S.lastNight ? addDays(S.lastNight, 1) : null; }

    /** Number of booked nights (0 if IDLE or incomplete). */
    function getNights() {
        return (S.checkIn && S.lastNight) ? diffDays(S.checkIn, getEndDate()) : 0;
    }

    // ─────────────────────────────────────────────────────────────
    // BOOKED SET
    // ─────────────────────────────────────────────────────────────

    function buildBookedSet(bookings) {
        const set = new Set();
        (bookings || []).forEach(b => {
            const reserved = b.depositPaid || b.balancePaid ||
                b.paymentStatus === 'confirmed' || b.status === 'confirmed';
            if (!reserved) return;
            const start = new Date(b.startDate); start.setHours(0, 0, 0, 0);
            const end = new Date(b.endDate); end.setHours(0, 0, 0, 0);
            const cur = new Date(start);
            while (cur < end) {
                set.add(toLocalStr(cur));
                cur.setDate(cur.getDate() + 1);
            }
            // endDate itself stays free (exclusive model)
        });
        return set;
    }

    // ─────────────────────────────────────────────────────────────
    // CSS CLASS BUILDER
    // ─────────────────────────────────────────────────────────────

    /**
     * Highlighted band: [checkIn … lastNight] inclusive.
     * endDate (lastNight+1) gets NO selection class — it is the checkout day.
     *
     * Hover band (ANCHORED, forward only): (lastNight, hoverDate] exclusive-start.
     */
    function buildDayClasses(dateStr, today) {
        const cls = ['calendar-day'];

        if (S.bookedSet.has(dateStr)) { cls.push('booked'); return cls.join(' '); }
        if (dateStr < today) { cls.push('past'); return cls.join(' '); }

        cls.push('available');
        if (dateStr === today) cls.push('today');

        const ci = S.checkIn;
        const ln = S.lastNight;

        if (!ci) return cls.join(' ');   // IDLE — nothing to mark

        // ── Committed selection ──
        if (ln && dateStr >= ci && dateStr <= ln) {
            cls.push('cal-selected');
            if (ci === ln) {
                // Single night — fully rounded
                cls.push('cal-start', 'cal-end');
            } else if (dateStr === ci) {
                cls.push('cal-start');
            } else if (dateStr === ln) {
                cls.push('cal-end');
            } else {
                cls.push('cal-range');
            }
            return cls.join(' ');
        }
        // dateStr === endDate → intentionally no class (checkout day)

        // ── Hover extension preview (only forward of lastNight) ──
        if (
            S.phase === 'ANCHORED' &&
            S.hoverDate &&
            ln &&
            dateStr > ln &&
            dateStr <= S.hoverDate &&
            !S.bookedSet.has(dateStr)
        ) {
            cls.push('cal-hover');
            if (dateStr === S.hoverDate) cls.push('cal-hover-end');
        }

        return cls.join(' ');
    }

    // ─────────────────────────────────────────────────────────────
    // CLICK HANDLER
    // ─────────────────────────────────────────────────────────────

    function handleClick(dateStr) {
        const today = todayStr();
        if (dateStr < today || S.bookedSet.has(dateStr)) return;

        // ── IDLE: first click → 1-night selection, immediately complete ──
        if (S.phase === 'IDLE') {
            S.checkIn = dateStr;
            S.lastNight = dateStr;
            S.hoverDate = null;
            S.phase = 'ANCHORED';
            render();
            syncInputs();
            updateCta();
            return;
        }

        // ── ANCHORED ──
        // Double-click checkIn → cancel everything
        if (dateStr === S.checkIn) {
            S.checkIn = null;
            S.lastNight = null;
            S.hoverDate = null;
            S.phase = 'IDLE';
            render();
            syncInputs();
            updateCta();
            return;
        }

        // Click BEFORE checkIn → new 1-night anchor
        if (dateStr < S.checkIn) {
            S.checkIn = dateStr;
            S.lastNight = dateStr;
            S.hoverDate = null;
            render();
            syncInputs();
            updateCta();
            return;
        }

        // Click AFTER checkIn (extend forward, or shrink by clicking within range):
        // Validate [checkIn, clicked] is entirely free.
        const proposedEnd = addDays(dateStr, 1);   // exclusive
        if (!isRangeFree(S.checkIn, proposedEnd)) {
            showStatusMsg('Selected range includes unavailable dates.', 'error');
            return;
        }

        S.lastNight = dateStr;
        S.hoverDate = null;
        render();
        syncInputs();
        updateCta();

        // Pop animation
        const cell = $wrap?.querySelector(`[data-date="${dateStr}"]`);
        if (cell) {
            cell.classList.add('just-popped');
            cell.addEventListener('animationend', () => cell.classList.remove('just-popped'), { once: true });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // HOVER HANDLER  (forward extension preview only)
    // ─────────────────────────────────────────────────────────────

    function handleHover(dateStr) {
        if (S.phase !== 'ANCHORED' || !S.lastNight) return;

        // Only preview strictly beyond lastNight
        if (dateStr <= S.lastNight) {
            if (S.hoverDate !== null) { S.hoverDate = null; render(); }
            return;
        }

        // Stop preview if extending would cross a booked night
        const proposedEnd = addDays(dateStr, 1);
        if (!isRangeFree(S.checkIn, proposedEnd)) {
            if (S.hoverDate !== null) { S.hoverDate = null; render(); }
            return;
        }

        if (S.hoverDate === dateStr) return;
        S.hoverDate = dateStr;
        render();
    }

    function handleLeave() {
        if (S.hoverDate === null) return;
        S.hoverDate = null;
        render();
    }

    // ─────────────────────────────────────────────────────────────
    // SYNC → booking.js inputs
    // ─────────────────────────────────────────────────────────────

    function syncInputs() {
        const $start = document.getElementById('startDate');
        const $end = document.getElementById('endDate');
        if (!$start || !$end) return;

        $start.value = S.checkIn || '';
        $end.value = getEndDate() || '';

        // booking.js listens to these change events to recalculate price
        $start.dispatchEvent(new Event('change', { bubbles: true }));
        $end.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    function render() {
        if (!$calSection) return;

        // Hide legacy booking.js calendar elements
        const legacyHeader = document.getElementById('calendar-header');
        const legacyGrid = document.getElementById('calendar');
        const legacyMonthY = document.getElementById('monthYear');
        if (legacyHeader) legacyHeader.classList.add('enh-hidden');
        if (legacyMonthY) legacyMonthY.classList.add('enh-hidden');
        if (legacyGrid) legacyGrid.style.display = 'none';

        // Hint
        if (!$hint) {
            $hint = document.createElement('div');
            $hint.className = 'enh-hint';
            $hint.innerHTML =
                '<span class="enh-hint-dot"></span>' +
                '<span class="enh-hint-txt">Select your check-in date</span>';
            $calSection.insertBefore($hint, $calSection.firstChild);
        }
        updateHint();

        // Panels
        if ($wrap) $wrap.remove();
        $wrap = document.createElement('div');
        $wrap.className = 'enh-cal-wrap';

        const isMobile = window.innerWidth < 768;
        $wrap.appendChild(buildPanel(S.year, S.month, 0, isMobile));

        if (!isMobile) {
            let ny = S.year, nm = S.month + 1;
            if (nm > 11) { nm = 0; ny++; }
            const sep = document.createElement('div');
            sep.className = 'enh-cal-sep';
            $wrap.appendChild(sep);
            $wrap.appendChild(buildPanel(ny, nm, 1, false));
        }

        $calSection.insertBefore($wrap, $hint.nextSibling);

        if (!$chips) buildChips();
        updateChips();
    }

    // ─────────────────────────────────────────────────────────────
    // PANEL BUILDER
    // ─────────────────────────────────────────────────────────────

    function buildPanel(year, month, panelIdx, isMobile) {
        const firstDay = new Date(year, month, 1);
        const lastDate = new Date(year, month + 1, 0).getDate();
        const label = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });
        const today = todayStr();

        let startDow = firstDay.getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;

        const panel = document.createElement('div');
        panel.className = 'enh-cal-panel' + (panelIdx === 1 ? ' enh-panel-next' : '');

        // Header
        const header = document.createElement('div');
        header.className = 'enh-month-header';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'enh-nav-btn'; prevBtn.type = 'button';
        prevBtn.setAttribute('aria-label', 'Previous month');
        prevBtn.textContent = '‹';
        prevBtn.style.visibility = panelIdx === 0 ? 'visible' : 'hidden';
        prevBtn.addEventListener('click', () => stepMonth(-1));

        const labelEl = document.createElement('span');
        labelEl.className = 'enh-month-label';
        labelEl.textContent = label;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'enh-nav-btn'; nextBtn.type = 'button';
        nextBtn.setAttribute('aria-label', 'Next month');
        nextBtn.textContent = '›';
        nextBtn.style.visibility = (panelIdx === 1 || isMobile) ? 'visible' : 'hidden';
        nextBtn.addEventListener('click', () => stepMonth(1));

        header.appendChild(prevBtn); header.appendChild(labelEl); header.appendChild(nextBtn);

        // Weekdays
        const wdRow = document.createElement('div');
        wdRow.className = 'enh-weekdays';
        WEEKDAYS.forEach(d => {
            const wd = document.createElement('div');
            wd.className = 'enh-wd'; wd.textContent = d;
            wdRow.appendChild(wd);
        });

        // Days grid
        const daysGrid = document.createElement('div');
        daysGrid.className = 'enh-days';

        for (let i = 0; i < startDow; i++) {
            const e = document.createElement('div');
            e.className = 'calendar-day other-month';
            daysGrid.appendChild(e);
        }

        for (let d = 1; d <= lastDate; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const cell = document.createElement('div');
            cell.className = buildDayClasses(dateStr, today);
            cell.textContent = d;
            cell.dataset.date = dateStr;

            if (cell.classList.contains('available')) {
                cell.addEventListener('click', () => handleClick(dateStr));
                cell.addEventListener('mouseenter', () => handleHover(dateStr));
                cell.setAttribute('role', 'button');
                cell.setAttribute('tabindex', '0');
                cell.setAttribute('aria-label', buildAriaLabel(dateStr));
                cell.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(dateStr); }
                });
            }

            daysGrid.appendChild(cell);
        }

        daysGrid.addEventListener('mouseleave', handleLeave);

        panel.appendChild(header); panel.appendChild(wdRow); panel.appendChild(daysGrid);
        return panel;
    }

    function buildAriaLabel(dateStr) {
        const h = humanDate(dateStr);
        if (S.phase === 'IDLE') return `Select ${h} as check-in`;
        if (dateStr === S.checkIn) return `${h} — double-click to cancel`;
        if (dateStr > (S.lastNight || '')) return `Extend stay to ${h}`;
        if (dateStr > S.checkIn) return `Shorten stay, last night ${h}`;
        return h;
    }

    // ─────────────────────────────────────────────────────────────
    // HINT
    // ─────────────────────────────────────────────────────────────

    function updateHint() {
        if (!$hint) return;
        const txt = $hint.querySelector('.enh-hint-txt');
        if (S.phase === 'IDLE') {
            txt.textContent = 'Click a date to select check-in — 1 night by default, then extend by clicking a later date';
            $hint.classList.remove('enh-hint-hidden');
        } else {
            const nights = getNights();
            const end = getEndDate();
            txt.textContent =
                `${humanDate(S.checkIn)} → checkout ${humanDate(end)} · ${nights} night${nights !== 1 ? 's' : ''}` +
                ` — click a later date to extend, or double-click check-in to reset`;
            $hint.classList.remove('enh-hint-hidden');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CHIPS
    // ─────────────────────────────────────────────────────────────

    function buildChips() {
        let summaryEl = $calSection.querySelector('.enh-summary');
        if (summaryEl) summaryEl.remove();
        summaryEl = document.createElement('div');
        summaryEl.className = 'enh-summary';

        $chips = {};
        [['checkin', 'Check-in'], ['checkout', 'Check-out'], ['nights', 'Duration']].forEach(([key, label]) => {
            const chip = document.createElement('div');
            chip.className = 'enh-chip';
            chip.innerHTML = `<div class="enh-chip-lbl">${label}</div><div class="enh-chip-val enh-chip-${key}"><span class="enh-chip-empty">—</span></div>`;
            $chips[key] = chip.querySelector('.enh-chip-val');
            summaryEl.appendChild(chip);
        });

        $calSection.appendChild(summaryEl);
    }

    function updateChips() {
        if (!$chips) return;
        const endDate = getEndDate();
        const nights = getNights();

        if ($chips.checkin) {
            const chip = $chips.checkin.closest('.enh-chip');
            $chips.checkin.innerHTML = S.checkIn ? humanDate(S.checkIn) : '<span class="enh-chip-empty">Add date</span>';
            chip?.classList.toggle('active', !!S.checkIn);
        }
        if ($chips.checkout) {
            const chip = $chips.checkout.closest('.enh-chip');
            // Show the actual checkout date (endDate) — guests plan their departure by this
            $chips.checkout.innerHTML = endDate ? humanDate(endDate) : '<span class="enh-chip-empty">Add date</span>';
            chip?.classList.toggle('active', !!endDate);
        }
        if ($chips.nights) {
            const chip = $chips.nights.closest('.enh-chip');
            $chips.nights.innerHTML = nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : '<span class="enh-chip-empty">—</span>';
            chip?.classList.toggle('active', nights > 0);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // NAVIGATION
    // ─────────────────────────────────────────────────────────────

    function stepMonth(delta) {
        S.month += delta;
        if (S.month > 11) { S.month = 0; S.year++; }
        if (S.month < 0) { S.month = 11; S.year--; }

        if (S.rawBookings.length > 0) {
            S.bookedSet = buildBookedSet(S.rawBookings);
        } else if (window._calendarBookings?.length > 0) {
            S.rawBookings = window._calendarBookings;
            S.bookedSet = buildBookedSet(S.rawBookings);
        }
        render();
    }

    // ─────────────────────────────────────────────────────────────
    // FLOATING CTA
    // ─────────────────────────────────────────────────────────────

    function buildCta() {
        $cta = document.createElement('div');
        $cta.className = 'enh-floating-cta';
        $cta.setAttribute('role', 'complementary');
        $cta.setAttribute('aria-live', 'polite');
        $cta.innerHTML = `
            <div class="enh-cta-info">
                <span class="enh-cta-nights">0 nights</span>
                <span class="enh-cta-price">KES 0</span>
            </div>
            <div class="enh-cta-divider"></div>
            <button class="enh-cta-btn" type="button" aria-label="Go to payment form">
                Reserve
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            </button>`;

        $cta.querySelector('.enh-cta-btn').addEventListener('click', () => {
            const target = document.getElementById('bookingCard') ||
                document.querySelector('.booking-card') ||
                document.getElementById('bookingForm');
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target.style.transition = 'box-shadow 0.3s ease';
                target.style.boxShadow = '0 0 0 3px rgba(25,135,84,0.35)';
                setTimeout(() => { target.style.boxShadow = ''; }, 1100);
            }
        });

        document.body.appendChild($cta);
    }

    function updateCta() {
        if (!$cta) return;
        const nights = getNights();

        if (nights < 1) {
            $cta.classList.remove('enh-cta-visible');
            document.body.classList.remove('enh-cta-open');
            return;
        }

        const totalEl = document.getElementById('fullAmount');
        const priceText = totalEl?.textContent?.trim() || `KES ${nights * 8}`;
        $cta.querySelector('.enh-cta-nights').textContent = `${nights} night${nights !== 1 ? 's' : ''}`;
        $cta.querySelector('.enh-cta-price').textContent = priceText;
        $cta.classList.add('enh-cta-visible');
        document.body.classList.add('enh-cta-open');
    }

    function watchPrice() {
        const totalEl = document.getElementById('fullAmount');
        if (!totalEl) return;
        const obs = new MutationObserver(() => { if (getNights() > 0) updateCta(); });
        obs.observe(totalEl, { childList: true, subtree: true, characterData: true });
    }

    // ─────────────────────────────────────────────────────────────
    // STATUS
    // ─────────────────────────────────────────────────────────────

    function showStatusMsg(msg, type) {
        if (typeof window.showStatus === 'function') window.showStatus(msg, type);
    }

    // ─────────────────────────────────────────────────────────────
    // PATCH window.renderCalendar (called by booking.js loadCalendar)
    // ─────────────────────────────────────────────────────────────

    function patchRenderCalendar() {
        window.renderCalendar = function (bookings) {
            S.rawBookings = bookings || [];
            S.bookedSet = buildBookedSet(S.rawBookings);
            render();
        };
    }

    // ─────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────

    function init() {
        $calSection = document.getElementById('calendarContainer');
        if (!$calSection) return;

        patchRenderCalendar();
        buildCta();
        watchPrice();

        if (window._calendarBookings?.length > 0) {
            S.rawBookings = window._calendarBookings;
            S.bookedSet = buildBookedSet(S.rawBookings);
        }

        render();

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(render, 160);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────

    window.calEnhanced = {
        getState: () => ({
            checkIn: S.checkIn,
            lastNight: S.lastNight,
            endDate: getEndDate(),   // exclusive — what booking.js / backend sees
            nights: getNights(),
            phase: S.phase,
        }),
        forceRender: render,
        updateCta,
    };

})();