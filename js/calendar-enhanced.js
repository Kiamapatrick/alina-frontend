/**
 * calendar-enhanced.js
 * ─────────────────────────────────────────────────────────────────
 * Enhances booking.html's existing calendar without replacing booking.js.
 *
 * How it works:
 *  1. Waits for booking.js to call window.renderCalendar(bookings).
 *  2. Intercepts that call, rebuilds the calendar UI with dual-month
 *     layout (desktop) / single month (mobile).
 *  3. Uses the same DOM IDs booking.js already writes to (#startDate,
 *     #endDate, #calendar, #monthYear, #prevMonth, #nextMonth).
 *  4. Adds a floating CTA bar that appears after valid selection.
 *
 * Drop in BEFORE booking.js in the HTML. booking.js will still handle
 * all payment logic — we only enhance the calendar UI layer.
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────
    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // ── State ──────────────────────────────────────────────────────
    const S = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),  // 0-indexed
        bookedSet: new Set(),
        checkIn: null,   // 'YYYY-MM-DD'
        checkOut: null,   // 'YYYY-MM-DD' (exclusive — day after last night)
        awaitingCheckout: false,
        hoverDate: null,
    };

    // ── DOM refs ───────────────────────────────────────────────────
    let $calSection;   // .calendar-section
    let $wrap;         // .enh-cal-wrap (injected)
    let $hint;         // .enh-hint
    let $chips;        // { checkin, checkout, nights }
    let $cta;          // .enh-floating-cta

    // ─────────────────────────────────────────────────────────────
    // DATE UTILITIES
    // ─────────────────────────────────────────────────────────────
    function toLocalStr(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function addDays(str, n) {
        const d = new Date(str + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return toLocalStr(d);
    }

    function diffDays(a, b) {
        return Math.round(
            (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
        );
    }

    function todayStr() {
        return toLocalStr(new Date());
    }

    function humanDate(str) {
        return new Date(str + 'T12:00:00').toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short'
        });
    }

    function isRangeFree(from, toExclusive) {
        const cur = new Date(from + 'T12:00:00');
        const end = new Date(toExclusive + 'T12:00:00');
        while (cur < end) {
            if (S.bookedSet.has(toLocalStr(cur))) return false;
            cur.setDate(cur.getDate() + 1);
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    // BOOKED SET FROM BOOKINGS ARRAY
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
        });
        return set;
    }

    // ─────────────────────────────────────────────────────────────
    // BUILD ONE MONTH PANEL
    // ─────────────────────────────────────────────────────────────
    function buildPanel(year, month, panelIdx) {
        const firstDay = new Date(year, month, 1);
        const lastDate = new Date(year, month + 1, 0).getDate();
        const label = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });
        const today = todayStr();

        // Mon-first weekday offset
        let startDow = firstDay.getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;

        const panel = document.createElement('div');
        panel.className = 'enh-cal-panel' + (panelIdx === 1 ? ' enh-panel-next' : '');

        // ── Month header ──
        const header = document.createElement('div');
        header.className = 'enh-month-header';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'enh-nav-btn';
        prevBtn.type = 'button';
        prevBtn.setAttribute('aria-label', 'Previous month');
        prevBtn.textContent = '‹';
        // Only first panel shows prev arrow
        prevBtn.style.visibility = panelIdx === 0 ? 'visible' : 'hidden';
        prevBtn.addEventListener('click', () => stepMonth(-1));

        const labelEl = document.createElement('span');
        labelEl.className = 'enh-month-label';
        labelEl.textContent = label;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'enh-nav-btn';
        nextBtn.type = 'button';
        nextBtn.setAttribute('aria-label', 'Next month');
        nextBtn.textContent = '›';
        // Only second panel (or first on mobile) shows next arrow
        const isMobile = window.innerWidth < 768;
        nextBtn.style.visibility = (panelIdx === 1 || isMobile) ? 'visible' : 'hidden';
        nextBtn.addEventListener('click', () => stepMonth(1));

        header.appendChild(prevBtn);
        header.appendChild(labelEl);
        header.appendChild(nextBtn);

        // ── Weekday row ──
        const wdRow = document.createElement('div');
        wdRow.className = 'enh-weekdays';
        WEEKDAYS.forEach(d => {
            const wd = document.createElement('div');
            wd.className = 'enh-wd';
            wd.textContent = d;
            wdRow.appendChild(wd);
        });

        // ── Day grid ──
        const daysGrid = document.createElement('div');
        daysGrid.className = 'enh-days';

        // Filler cells
        for (let i = 0; i < startDow; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day other-month';
            daysGrid.appendChild(empty);
        }

        for (let d = 1; d <= lastDate; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const cell = document.createElement('div');
            cell.className = buildDayClasses(dateStr, today);
            cell.textContent = d;
            cell.dataset.date = dateStr;

            if (cell.classList.contains('available')) {
                cell.addEventListener('click', () => handleClick(dateStr, cell));
                cell.addEventListener('mouseenter', () => handleHover(dateStr));
                cell.addEventListener('mouseleave', () => handleLeave());
                cell.setAttribute('role', 'button');
                cell.setAttribute('tabindex', '0');
                cell.setAttribute('aria-label', `Select ${humanDate(dateStr)}`);
                cell.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleClick(dateStr, cell);
                    }
                });
            }

            daysGrid.appendChild(cell);
        }

        panel.appendChild(header);
        panel.appendChild(wdRow);
        panel.appendChild(daysGrid);
        return panel;
    }

    // ─────────────────────────────────────────────────────────────
    // CSS CLASS BUILDER FOR A DAY CELL
    // ─────────────────────────────────────────────────────────────
    function buildDayClasses(dateStr, today) {
        const classes = ['calendar-day'];

        if (S.bookedSet.has(dateStr)) {
            classes.push('booked');
            return classes.join(' ');
        }

        if (dateStr < today) {
            classes.push('past');
            return classes.join(' ');
        }

        classes.push('available');
        if (dateStr === today) classes.push('today');

        const ci = S.checkIn;
        const co = S.checkOut; // exclusive

        if (ci) {
            if (co) {
                const lastNight = addDays(co, -1);

                if (dateStr === ci) {
                    classes.push('cal-selected', 'cal-start');
                    if (ci === lastNight) classes.push('cal-end'); // single night
                } else if (dateStr === lastNight && dateStr !== ci) {
                    classes.push('cal-selected', 'cal-end');
                } else if (dateStr > ci && dateStr < lastNight) {
                    classes.push('cal-selected', 'cal-range');
                }
            } else {
                // awaiting check-out: just highlight check-in
                if (dateStr === ci) {
                    classes.push('cal-selected', 'cal-start', 'cal-end');
                }
                // Hover preview
                if (S.hoverDate && dateStr > ci && dateStr <= S.hoverDate) {
                    classes.push('cal-hover');
                }
            }
        }

        return classes.join(' ');
    }

    // ─────────────────────────────────────────────────────────────
    // FULL RENDER — replaces calendar section content
    // ─────────────────────────────────────────────────────────────
    function render() {
        if (!$calSection) return;

        // Hide original header & legacy grid (we replace them)
        const legacyHeader = document.getElementById('calendar-header');
        const legacyGrid = document.getElementById('calendar');
        const legacyMonthY = document.getElementById('monthYear');
        if (legacyHeader) legacyHeader.classList.add('enh-hidden');
        if (legacyMonthY) legacyMonthY.classList.add('enh-hidden');
        // Keep #calendar in DOM so booking.js can still write to it silently
        if (legacyGrid) { legacyGrid.style.display = 'none'; }

        // ── Hint strip ──
        if (!$hint) {
            $hint = document.createElement('div');
            $hint.className = 'enh-hint';
            $hint.innerHTML = '<span class="enh-hint-dot"></span><span class="enh-hint-txt">Select your check-in date</span>';
            $calSection.insertBefore($hint, $calSection.firstChild);
        }
        updateHint();

        // ── Dual-month wrap ──
        if ($wrap) $wrap.remove();
        $wrap = document.createElement('div');
        $wrap.className = 'enh-cal-wrap';

        const panel0 = buildPanel(S.year, S.month, 0);
        $wrap.appendChild(panel0);

        // Second month (desktop only — hidden on mobile via CSS)
        let ny = S.year, nm = S.month + 1;
        if (nm > 11) { nm = 0; ny++; }
        const sep = document.createElement('div');
        sep.className = 'enh-cal-sep';
        const panel1 = buildPanel(ny, nm, 1);
        $wrap.appendChild(sep);
        $wrap.appendChild(panel1);

        // Insert after hint
        $calSection.insertBefore($wrap, $hint.nextSibling);

        // ── Summary chips ──
        if (!$chips) buildChips();
        updateChips();
    }

    function buildChips() {
        let summaryEl = $calSection.querySelector('.enh-summary');
        if (summaryEl) summaryEl.remove();

        summaryEl = document.createElement('div');
        summaryEl.className = 'enh-summary';

        const defs = [
            { key: 'checkin', label: 'Check-in' },
            { key: 'checkout', label: 'Check-out' },
            { key: 'nights', label: 'Duration' },
        ];
        $chips = {};
        defs.forEach(({ key, label }) => {
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

        const nights = S.checkIn && S.checkOut ? diffDays(S.checkIn, S.checkOut) : 0;

        const ciChip = $chips.checkin?.closest('.enh-chip');
        const coChip = $chips.checkout?.closest('.enh-chip');
        const nChip = $chips.nights?.closest('.enh-chip');

        if ($chips.checkin) {
            $chips.checkin.innerHTML = S.checkIn
                ? humanDate(S.checkIn)
                : '<span class="enh-chip-empty">Add date</span>';
            if (ciChip) ciChip.classList.toggle('active', !!S.checkIn);
        }
        if ($chips.checkout) {
            $chips.checkout.innerHTML = S.checkOut
                ? humanDate(S.checkOut)
                : '<span class="enh-chip-empty">Add date</span>';
            if (coChip) coChip.classList.toggle('active', !!S.checkOut);
        }
        if ($chips.nights) {
            $chips.nights.innerHTML = nights > 0
                ? `${nights} night${nights !== 1 ? 's' : ''}`
                : '<span class="enh-chip-empty">—</span>';
            if (nChip) nChip.classList.toggle('active', nights > 0);
        }
    }

    function updateHint() {
        if (!$hint) return;
        const txt = $hint.querySelector('.enh-hint-txt');
        if (!S.checkIn) {
            txt.textContent = 'Select your check-in date';
            $hint.classList.remove('enh-hint-hidden');
        } else if (!S.checkOut) {
            txt.textContent = 'Now select your check-out date';
            $hint.classList.remove('enh-hint-hidden');
        } else {
            $hint.classList.add('enh-hint-hidden');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // NAVIGATION
    // ─────────────────────────────────────────────────────────────
    function stepMonth(delta) {
        S.month += delta;
        if (S.month > 11) { S.month = 0; S.year++; }
        if (S.month < 0) { S.month = 11; S.year--; }

        // Keep booking.js month state in sync
        if (typeof window._enhSyncMonth === 'function') {
            window._enhSyncMonth(S.year, S.month);
        }

        render();
    }

    // ─────────────────────────────────────────────────────────────
    // CLICK / HOVER HANDLERS
    // ─────────────────────────────────────────────────────────────
    function handleClick(dateStr, cell) {
        const today = todayStr();
        if (dateStr < today || S.bookedSet.has(dateStr)) return;

        // If complete selection exists, start fresh
        if (S.checkIn && S.checkOut) {
            S.checkIn = null;
            S.checkOut = null;
            S.awaitingCheckout = false;
        }

        if (!S.checkIn) {
            // First click → check-in
            S.checkIn = dateStr;
            S.awaitingCheckout = true;
            S.hoverDate = null;
            syncInputs();
            render();
            // Pop animation
            const fresh = $wrap?.querySelector(`[data-date="${dateStr}"]`);
            if (fresh) { fresh.classList.add('just-popped'); }
            return;
        }

        // Second click → check-out
        if (S.awaitingCheckout) {
            if (dateStr === S.checkIn) {
                // Clicked same day — reset
                S.checkIn = null;
                S.awaitingCheckout = false;
                syncInputs();
                render();
                return;
            }

            let ci = S.checkIn, co;

            if (dateStr < S.checkIn) {
                // Clicked before check-in — swap
                co = addDays(S.checkIn, 1);
                ci = dateStr;
            } else {
                co = addDays(dateStr, 1); // exclusive: day after last night
            }

            if (!isRangeFree(ci, co)) {
                showStatusMsg('Selected range includes unavailable dates', 'error');
                return;
            }

            S.checkIn = ci;
            S.checkOut = co;
            S.awaitingCheckout = false;
            S.hoverDate = null;
            syncInputs();
            render();

            const fresh = $wrap?.querySelector(`[data-date="${dateStr}"]`);
            if (fresh) { fresh.classList.add('just-popped'); }

            updateCta();
        }
    }

    function handleHover(dateStr) {
        if (!S.awaitingCheckout || !S.checkIn) return;
        if (dateStr <= S.checkIn || S.bookedSet.has(dateStr)) {
            if (S.hoverDate !== null) { S.hoverDate = null; render(); }
            return;
        }
        if (S.hoverDate === dateStr) return;
        S.hoverDate = dateStr;
        render();
    }

    function handleLeave() {
        if (!S.awaitingCheckout) return;
        S.hoverDate = null;
        render();
    }

    // ─────────────────────────────────────────────────────────────
    // SYNC SELECTION → #startDate / #endDate inputs (booking.js reads these)
    // ─────────────────────────────────────────────────────────────
    function syncInputs() {
        const $start = document.getElementById('startDate');
        const $end = document.getElementById('endDate');
        if (!$start || !$end) return;

        $start.value = S.checkIn || '';
        $end.value = S.checkOut || '';

        // Fire change events so booking.js recalculates price
        $start.dispatchEvent(new Event('change', { bubbles: true }));
        $end.dispatchEvent(new Event('change', { bubbles: true }));
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
      </button>
    `;

        $cta.querySelector('.enh-cta-btn').addEventListener('click', () => {
            // Scroll to booking card
            const target = document.getElementById('bookingCard') ||
                document.querySelector('.booking-card') ||
                document.getElementById('bookingForm');
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Brief highlight flash
                target.style.transition = 'box-shadow 0.3s ease';
                target.style.boxShadow = '0 0 0 3px rgba(25,135,84,0.35)';
                setTimeout(() => { target.style.boxShadow = ''; }, 1100);
            }
        });

        document.body.appendChild($cta);
    }

    function updateCta() {
        if (!$cta) return;

        if (!S.checkIn || !S.checkOut) {
            $cta.classList.remove('enh-cta-visible');
            document.body.classList.remove('enh-cta-open');
            return;
        }

        const nights = diffDays(S.checkIn, S.checkOut);
        if (nights < 1) {
            $cta.classList.remove('enh-cta-visible');
            document.body.classList.remove('enh-cta-open');
            return;
        }

        // Pull displayed total from booking.js UI
        const totalEl = document.getElementById('fullAmount');
        const priceText = totalEl?.textContent?.trim() || `KES ${nights * 8}`;

        $cta.querySelector('.enh-cta-nights').textContent =
            `${nights} night${nights !== 1 ? 's' : ''}`;
        $cta.querySelector('.enh-cta-price').textContent = priceText;

        $cta.classList.add('enh-cta-visible');
        document.body.classList.add('enh-cta-open');
    }

    // Keep CTA price in sync when booking.js updates #fullAmount
    function watchPrice() {
        const totalEl = document.getElementById('fullAmount');
        if (!totalEl) return;
        const obs = new MutationObserver(() => {
            if (S.checkIn && S.checkOut) updateCta();
        });
        obs.observe(totalEl, { childList: true, subtree: true, characterData: true });
    }

    // ─────────────────────────────────────────────────────────────
    // STATUS HELPER (reuse booking.html's showStatus)
    // ─────────────────────────────────────────────────────────────
    function showStatusMsg(msg, type) {
        if (typeof window.showStatus === 'function') {
            window.showStatus(msg, type);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // PATCH: intercept booking.js's renderCalendar
    // ─────────────────────────────────────────────────────────────
    function patchRenderCalendar() {
        // booking.js calls renderCalendar(bookings) directly (not on window).
        // We shim window.renderCalendar so any external call goes through us.
        // booking.js also calls loadCalendar → fetch → renderCalendar internally.
        // We patch the booking.js module by overriding after DOMContentLoaded.

        // Primary shim on window
        window.renderCalendar = function (bookings) {
            S.bookedSet = buildBookedSet(bookings);
            render();
        };
    }

    // Patch booking.js month state sync
    function patchMonthNav() {
        // booking.js uses currentMonth / currentYear module-level vars.
        // We expose a sync callback that calendar-enhanced calls when user navigates.
        // booking.js will re-fetch calendar on its own prevMonth/nextMonth clicks —
        // we've already hidden those (enh-hidden), so all nav goes through our buttons.
        // No patch needed — booking.js's loadCalendar is called on init; subsequent
        // month nav in our UI only re-renders visually (booked data doesn't change by month).
    }

    // ─────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────
    function init() {
        $calSection = document.getElementById('calendarContainer');
        if (!$calSection) return;

        patchRenderCalendar();
        patchMonthNav();
        buildCta();
        watchPrice();

        // Initial render with empty booked set (booking.js will call renderCalendar later)
        render();

        // Re-render on resize (dual↔single switch)
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(render, 160);
        });
    }

    // Run after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API (optional external use)
    // ─────────────────────────────────────────────────────────────
    window.calEnhanced = {
        getState: () => ({ ...S }),
        forceRender: render,
        updateCta,
    };

})();