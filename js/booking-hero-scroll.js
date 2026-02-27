/**
 * booking-hero-scroll.js
 * ────────────────────────────────────────────────────────────────
 * Luxury layered-scroll effect for booking.html
 *
 * What it does:
 *  1. Watches scroll position and toggles CSS classes that drive
 *     the hero dim/scale and content elevation transitions.
 *  2. Injects the decorative scroll-hint line into the hero.
 *  3. Drives the staggered highlight-item entrance via IntersectionObserver.
 *
 * What it does NOT do:
 *  - Touch any booking logic, payment state, calendar, or JS IDs
 *    used by booking.js / calendar-enhanced.js.
 *  - Modify DOM structure needed by existing scripts.
 *
 * Load this script as a plain <script src="..."> AFTER booking.html
 * body loads (defer or at end of body).
 * ────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    /* ── 1. Detect elements ── */
    const hero = document.querySelector('.booking-hero');
    const content = document.querySelector('.booking-content');

    if (!hero || !content) return;  // guard: run only on booking page

    /* ── 2. Inject decorative scroll hint ── */
    if (!document.querySelector('.hero-scroll-hint')) {
        const hint = document.createElement('div');
        hint.className = 'hero-scroll-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = 'Scroll';
        hero.appendChild(hint);
    }

    /* ── 3. Scroll class toggling (rAF-throttled) ── */
    let ticking = false;

    // On mobile the hero is shorter (~55–62svh vs 100svh on desktop),
    // so the content card overlaps the hero sooner. Lower thresholds
    // ensure the dim and elevation effects trigger at the right visual moment.
    function getThresholds() {
        const mobile = window.innerWidth < 768;
        return {
            dim: mobile ? 28 : 60,   // px scrolled before hero dims
            elevate: mobile ? 56 : 120,  // px scrolled before deeper shadow
        };
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(() => {
            const scrollY = window.scrollY;
            const { dim, elevate } = getThresholds();

            /* Hero: add .hero-covered to dim gallery */
            if (scrollY > dim) {
                hero.classList.add('hero-covered');
            } else {
                hero.classList.remove('hero-covered');
            }

            /* Content: deepen shadow as user scrolls further */
            if (scrollY > elevate) {
                content.classList.add('content-elevated');
            } else {
                content.classList.remove('content-elevated');
            }

            /* Hide scroll hint once user has scrolled */
            const hint = document.querySelector('.hero-scroll-hint');
            if (hint) {
                hint.style.opacity = scrollY > 30 ? '0' : '';
                hint.style.pointerEvents = 'none';
            }

            ticking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on load

    /* ── 4. Highlight pills staggered entrance ── */
    // The .reveal class + IntersectionObserver in booking.html already
    // handles .visible for the row wrapper. We enhance the pills inside
    // with a fresh observer that's lighter — just opacity + translateY.
    const highlightRow = document.querySelector('.highlights-row');

    if (highlightRow) {
        const pillObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // Add .visible to the row; CSS stagger delays handle each pill
                        entry.target.classList.add('visible');
                        pillObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2, rootMargin: '0px 0px -24px 0px' }
        );

        pillObserver.observe(highlightRow);
    }

    /* ── 5. Re-run thresholds on resize / orientation change ── */
    // Ensures classes are correct if the user rotates the device.
    window.addEventListener('resize', onScroll, { passive: true });

})();