/**
 * calendar-enhanced.js  v2.1
 * ─────────────────────────────────────────────────────────────────
 * Enhances booking.html without replacing booking.js.
 *
 * CHANGELOG v2.1
 * ──────────────
 * FIX:  Mobile touch events — replaced click-only listeners with
 *       unified pointer/touch event handling so real mobile devices
 *       can select multi-day ranges.
 * ADD:  Editable fallback input row (Check-in / Check-out date
 *       inputs + read-only Duration) placed below the calendar.
 *       Inputs sync bidirectionally with the calendar state.
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
 * CLICK / TAP RULES
 * ───────────────────────────────────────────────────────────────
 *
 *  Phase IDLE  (nothing selected)
 *    Tap any available date D
 *      → checkIn = lastNight = D   (1-night stay, immediately complete)
 *        endDate = D + 1
 *        Highlight only [D].
 *        Phase → ANCHORED
 *
 *  Phase ANCHORED
 *    Double-tap checkIn (same date tapped twice)
 *      → clear everything.
 *        Phase → IDLE
 *
 *    Tap date AFTER checkIn
 *      → lastNight = tapped date.
 *        endDate   = tapped + 1.
 *        Highlight [checkIn … tapped].
 *        Phase stays ANCHORED.
 *
 *    Tap date BEFORE checkIn
 *      → reset: checkIn = lastNight = tapped (new 1-night anchor).
 *        Phase stays ANCHORED.
 *
 *  Range must be contiguous and free of booked dates.
 *
 * ─────────────────────────────────────────────────────────────────
 * MOBILE TOUCH FIX
 * ─────────────────────────────────────────────────────────────────
 *  Root causes addressed:
 *    1. On real mobile devices the browser fires touchstart →
 *       touchend → (300ms delay) → click.  If the page scrolls
 *       even slightly between touchstart and touchend the 'click'
 *       is suppressed entirely.  We therefore listen to 'touchend'
 *       in addition to 'click' and deduplicate using a timestamp
 *       guard (TOUCH_DEDUPE_MS).
 *    2. Passive listeners on the scroll container can swallow
 *       touch events before they reach individual cells.  All
 *       calendar touch listeners are registered as {passive:false}
 *       and we call preventDefault() on touchend to stop the
 *       synthesised click from firing a second time.
 *    3. CSS `touch-action: none` is added to day cells so the
 *       browser does not initiate a scroll gesture on the first
 *       tap, which was swallowing the selection taps.
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Deduplicate touch → click ghost events within this window (ms)
    const TOUCH_DEDUPE_MS = 400;
    let _lastTouchTime = 0;

    // ── State ──────────────────────────────────────────────────────
    const S = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),

        bookedSet: new Set(),
        rawBookings: [],

        checkIn: null,     // first night, inclusive  'YYYY-MM-DD'
        lastNight: null,   // last  night, inclusive  'YYYY-MM-DD'
        phase: 'IDLE',     // 'IDLE' | 'ANCHORED'
        hoverDate: null,   // forward-extension preview
    };

    let $calSection, $wrap, $hint, $chips, $cta;
    // References to the fallback input row elements
    let $fbCheckIn, $fbCheckOut, $fbDuration;

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

    function getEndDate() { return S.lastNight ? addDays(S.lastNight, 1) : null; }

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
        });
        return set;
    }

    // ─────────────────────────────────────────────────────────────
    // CSS CLASS BUILDER
    // ─────────────────────────────────────────────────────────────

    function buildDayClasses(dateStr, today) {
        const cls = ['calendar-day'];

        if (S.bookedSet.has(dateStr)) { cls.push('booked'); return cls.join(' '); }
        if (dateStr < today) { cls.push('past'); return cls.join(' '); }

        cls.push('available');
        if (dateStr === today) cls.push('today');

        const ci = S.checkIn;
        const ln = S.lastNight;

        if (!ci) return cls.join(' ');

        if (ln && dateStr >= ci && dateStr <= ln) {
            cls.push('cal-selected');
            if (ci === ln) {
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
    // CLICK / TOUCH HANDLER  ← KEY FIX FOR MOBILE
    // ─────────────────────────────────────────────────────────────

    function handleClick(dateStr) {
        const today = todayStr();
        if (dateStr < today || S.bookedSet.has(dateStr)) return;

        if (S.phase === 'IDLE') {
            S.checkIn = dateStr;
            S.lastNight = dateStr;
            S.hoverDate = null;
            S.phase = 'ANCHORED';
            render();
            syncInputs();
            syncFallbackInputs();
            updateCta();
            return;
        }

        // ANCHORED — double-tap checkIn → cancel
        if (dateStr === S.checkIn) {
            S.checkIn = null;
            S.lastNight = null;
            S.hoverDate = null;
            S.phase = 'IDLE';
            render();
            syncInputs();
            syncFallbackInputs();
            updateCta();
            return;
        }

        // Tap BEFORE checkIn → new anchor
        if (dateStr < S.checkIn) {
            S.checkIn = dateStr;
            S.lastNight = dateStr;
            S.hoverDate = null;
            render();
            syncInputs();
            syncFallbackInputs();
            updateCta();
            return;
        }

        // Tap AFTER checkIn → extend range
        const proposedEnd = addDays(dateStr, 1);
        if (!isRangeFree(S.checkIn, proposedEnd)) {
            showStatusMsg('Selected range includes unavailable dates.', 'error');
            return;
        }

        S.lastNight = dateStr;
        S.hoverDate = null;
        render();
        syncInputs();
        syncFallbackInputs();
        updateCta();

        // Pop animation
        const cell = $wrap?.querySelector(`[data-date="${dateStr}"]`);
        if (cell) {
            cell.classList.add('just-popped');
            cell.addEventListener('animationend', () => cell.classList.remove('just-popped'), { once: true });
        }
    }

    /**
     * Attach both 'touchend' (mobile) and 'click' (desktop) to a day cell.
     * touchend fires before the synthetic click, so we call preventDefault()
     * to stop the browser from firing both.  A timestamp guard prevents the
     * rare case where both events slip through (e.g. some older Android WebViews).
     */
    function attachDayInteraction(cell, dateStr) {
        // ── Touch (mobile) ──
        cell.addEventListener('touchend', (e) => {
            // Prevent the browser's synthesised mouse/click event
            e.preventDefault();

            _lastTouchTime = Date.now();
            handleClick(dateStr);
        }, { passive: false });

        // ── Click (desktop / fallback) ──
        cell.addEventListener('click', () => {
            // Skip if a touch event just fired within dedupe window
            if (Date.now() - _lastTouchTime < TOUCH_DEDUPE_MS) return;
            handleClick(dateStr);
        });

        // ── Hover preview (pointer devices only) ──
        cell.addEventListener('mouseenter', () => handleHover(dateStr));

        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('aria-label', buildAriaLabel(dateStr));

        cell.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(dateStr); }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // HOVER HANDLER
    // ─────────────────────────────────────────────────────────────

    function handleHover(dateStr) {
        if (S.phase !== 'ANCHORED' || !S.lastNight) return;
        if (dateStr <= S.lastNight) {
            if (S.hoverDate !== null) { S.hoverDate = null; render(); }
            return;
        }
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

        $start.dispatchEvent(new Event('change', { bubbles: true }));
        $end.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ─────────────────────────────────────────────────────────────
    // SYNC → Fallback date inputs (below calendar)
    // ─────────────────────────────────────────────────────────────

    function syncFallbackInputs() {
        if ($fbCheckIn) $fbCheckIn.value = S.checkIn || '';
        if ($fbCheckOut) $fbCheckOut.value = getEndDate() || '';
        updateFallbackDuration();
    }

    function updateFallbackDuration() {
        if (!$fbDuration) return;
        const n = getNights();
        $fbDuration.value = n > 0 ? `${n} night${n !== 1 ? 's' : ''}` : '';
    }

    /**
     * Apply a date string typed into the fallback inputs back into S.
     * Validates: endDate > startDate, no booked dates in range.
     */
    function applyFallbackDates(checkIn, endDate) {
        const today = todayStr();

        if (!checkIn || !endDate) return;
        if (checkIn < today) { showStatusMsg('Check-in cannot be in the past.', 'error'); return; }
        if (endDate <= checkIn) { showStatusMsg('Check-out must be after check-in.', 'error'); return; }

        if (!isRangeFree(checkIn, endDate)) {
            showStatusMsg('Selected range includes unavailable dates.', 'error');
            return;
        }

        // lastNight = endDate - 1 (convert exclusive endDate to inclusive lastNight)
        const lastNight = addDays(endDate, -1);

        S.checkIn = checkIn;
        S.lastNight = lastNight;
        S.hoverDate = null;
        S.phase = 'ANCHORED';

        render();
        syncInputs();
        updateFallbackDuration();
        updateCta();
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

        // Chips row (replaced by fallback inputs — chips still updated for desktop)
        if (!$chips) buildChips();
        updateChips();

        // Ensure fallback input row exists and is up-to-date
        buildFallbackInputsIfNeeded();
        syncFallbackInputs();
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
                attachDayInteraction(cell, dateStr);
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
        if (dateStr === S.checkIn) return `${h} — tap again to cancel`;
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
            txt.textContent = 'Tap a date to select check-in — 1 night by default, then tap a later date to extend';
            $hint.classList.remove('enh-hint-hidden');
        } else {
            const nights = getNights();
            const end = getEndDate();
            txt.textContent =
                `${humanDate(S.checkIn)} → checkout ${humanDate(end)} · ${nights} night${nights !== 1 ? 's' : ''}` +
                ` — tap a later date to extend, or tap check-in again to reset`;
            $hint.classList.remove('enh-hint-hidden');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CHIPS (summary row above fallback inputs)
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
    // FALLBACK INPUT ROW  (editable date inputs below calendar)
    // ─────────────────────────────────────────────────────────────

    function buildFallbackInputsIfNeeded() {
        if ($calSection.querySelector('.enh-fallback-row')) return; // Already built

        const today = todayStr();

        const row = document.createElement('div');
        row.className = 'enh-fallback-row';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', 'Manual date selection');

        // ── Check-in input ──
        const ciWrap = document.createElement('div');
        ciWrap.className = 'enh-fb-field';
        ciWrap.innerHTML = '<label class="enh-fb-label">Check-in</label>';
        $fbCheckIn = document.createElement('input');
        $fbCheckIn.type = 'date';
        $fbCheckIn.className = 'enh-fb-input';
        $fbCheckIn.setAttribute('aria-label', 'Check-in date');
        $fbCheckIn.min = today;
        ciWrap.appendChild($fbCheckIn);

        // ── Check-out input ──
        const coWrap = document.createElement('div');
        coWrap.className = 'enh-fb-field';
        coWrap.innerHTML = '<label class="enh-fb-label">Check-out</label>';
        $fbCheckOut = document.createElement('input');
        $fbCheckOut.type = 'date';
        $fbCheckOut.className = 'enh-fb-input';
        $fbCheckOut.setAttribute('aria-label', 'Check-out date');
        $fbCheckOut.min = today;
        coWrap.appendChild($fbCheckOut);

        // ── Duration (read-only) ──
        const durWrap = document.createElement('div');
        durWrap.className = 'enh-fb-field enh-fb-duration';
        durWrap.innerHTML = '<label class="enh-fb-label">Duration</label>';
        $fbDuration = document.createElement('input');
        $fbDuration.type = 'text';
        $fbDuration.className = 'enh-fb-input enh-fb-readonly';
        $fbDuration.readOnly = true;
        $fbDuration.setAttribute('aria-label', 'Stay duration');
        $fbDuration.placeholder = '—';
        durWrap.appendChild($fbDuration);

        // ── Error message ──
        const errMsg = document.createElement('div');
        errMsg.className = 'enh-fb-error';
        errMsg.setAttribute('role', 'alert');
        errMsg.setAttribute('aria-live', 'polite');

        row.appendChild(ciWrap);
        row.appendChild(coWrap);
        row.appendChild(durWrap);
        row.appendChild(errMsg);

        $calSection.appendChild(row);

        // ── Event listeners ──

        function showFbError(msg) {
            errMsg.textContent = msg;
            errMsg.style.display = msg ? 'block' : 'none';
            if (msg) setTimeout(() => { errMsg.textContent = ''; errMsg.style.display = 'none'; }, 4000);
        }

        $fbCheckIn.addEventListener('change', () => {
            const ci = $fbCheckIn.value;
            const co = $fbCheckOut.value;
            if (!ci) return;

            // Update checkout minimum
            $fbCheckOut.min = addDays(ci, 1);

            if (co && co <= ci) {
                // Auto-advance checkout to ci + 1
                $fbCheckOut.value = addDays(ci, 1);
            }

            if (ci && $fbCheckOut.value) {
                const problem = validate(ci, $fbCheckOut.value);
                if (problem) { showFbError(problem); return; }
                applyFallbackDates(ci, $fbCheckOut.value);
            } else if (ci) {
                // Only check-in set — partially update state
                const nextD = addDays(ci, 1);
                applyFallbackDates(ci, nextD);
                $fbCheckOut.value = nextD;
            }
        });

        $fbCheckOut.addEventListener('change', () => {
            const ci = $fbCheckIn.value;
            const co = $fbCheckOut.value;
            if (!co) return;
            if (!ci) { showFbError('Please select a check-in date first.'); $fbCheckOut.value = ''; return; }
            const problem = validate(ci, co);
            if (problem) { showFbError(problem); return; }
            applyFallbackDates(ci, co);
        });

        function validate(ci, co) {
            const t = todayStr();
            if (ci < t) return 'Check-in cannot be in the past.';
            if (co <= ci) return 'Check-out must be after check-in.';
            if (!isRangeFree(ci, co)) return 'Selected range includes booked dates. Please choose different dates.';
            return null;
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
            // Update fallback input min dates when booked data arrives
            if ($fbCheckIn) $fbCheckIn.min = todayStr();
            if ($fbCheckOut) $fbCheckOut.min = todayStr();
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
            endDate: getEndDate(),
            nights: getNights(),
            phase: S.phase,
        }),
        forceRender: render,
        updateCta,
    };

})();