// ════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://alina906vibes-backend.onrender.com';

const TOKEN_KEY = 'userToken';
const FIXED_DEPOSIT = 5; // USD — must match booking.js & backend

// ════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════
let allBookings = [];
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'date-desc';

// ════════════════════════════════════════════
//  STATUS TOAST (also used by balance-payment.js via window.showStatus)
// ════════════════════════════════════════════
let _statusT = null;
window.showStatus = function showStatus(msg, type = 'info') {
    const el = document.getElementById('pageStatus');
    if (!el) return;
    if (_statusT) { clearTimeout(_statusT); _statusT = null; }
    el.classList.remove('show', 'text-danger', 'text-success', 'text-muted');
    el.textContent = msg;
    void el.offsetHeight;
    el.classList.add(type === 'error' ? 'text-danger' : type === 'success' ? 'text-success' : 'text-muted');
    el.classList.add('show');
    _statusT = setTimeout(() => { el.classList.remove('show'); _statusT = null; },
        type === 'success' ? 5000 : 7000);
};

// ════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════
function getToken() { return localStorage.getItem(TOKEN_KEY); }

function isLoggedIn() {
    const token = getToken();
    if (!token) return false;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) { localStorage.removeItem(TOKEN_KEY); return false; }
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            localStorage.removeItem(TOKEN_KEY); return false;
        }
        return true;
    } catch {
        localStorage.removeItem(TOKEN_KEY); return false;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calcNights(start, end) {
    const s = new Date(start), e = new Date(end);
    s.setHours(0, 0, 0, 0); e.setHours(0, 0, 0, 0);
    return Math.round((e - s) / 86400000);
}

function getBookingStatus(b) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(b.startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(b.endDate); end.setHours(0, 0, 0, 0);
    if (b.paymentStatus === 'cancelled' || b.status === 'cancelled') return 'cancelled';
    if (today >= start && today < end) return 'active';
    if (end <= today) return 'completed';
    return 'upcoming';
}

function getPaymentStatus(b) {
    if (b.paymentStatus === 'cancelled' || b.status === 'cancelled') return 'cancelled';
    if (b.depositPaid && b.balancePaid) return 'paid-full';
    if (b.depositPaid) return 'deposit';
    return 'pending';
}

function paymentStatusBadge(ps) {
    const map = {
        'paid-full': { cls: 'badge-paid-full', label: 'Fully Paid' },
        'deposit': { cls: 'badge-deposit', label: 'Deposit Paid' },
        'pending': { cls: 'badge-pending', label: 'Pending' },
        'cancelled': { cls: 'badge-cancelled', label: 'Cancelled' },
    };
    const d = map[ps] || map.pending;
    return `<span class="status-badge ${d.cls}"><span class="dot"></span>${d.label}</span>`;
}

function bookingStatusBadge(bs) {
    const map = {
        'upcoming': { cls: 'badge-upcoming', label: 'Upcoming' },
        'active': { cls: 'badge-active', label: 'Active Stay' },
        'completed': { cls: 'badge-completed', label: 'Completed' },
        'cancelled': { cls: 'badge-cancelled', label: 'Cancelled' },
    };
    const d = map[bs] || map.upcoming;
    return `<span class="status-badge ${d.cls}"><span class="dot"></span>${d.label}</span>`;
}

function methodLabel(method) {
    if (!method) return 'N/A';
    const map = { mpesa: '📱 M-Pesa', visa: '💳 Card', paystack: '💳 Paystack', crypto: '🔗 Crypto' };
    return map[method.toLowerCase()] || method;
}

function unitImageSrc(unit) {
    if (!unit) return null;
    const img = unit.image;
    if (!img) return null;
    const raw = typeof img === 'string' && img.includes(',') ? img.split(',')[0].trim() : img;
    if (raw.startsWith('http') || raw.startsWith('/')) return raw;
    return raw.startsWith('img/') ? `/${raw}` : `/img/${raw}`;
}

// ════════════════════════════════════════════
//  FETCH
// ════════════════════════════════════════════
async function fetchBookings() {
    const res = await fetch(`${API_BASE}/api/book/my`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.bookings || [];
}

// ════════════════════════════════════════════
//  FILTER & SORT
// ════════════════════════════════════════════
function applyFilterSort(bookings) {
    let list = [...bookings];
    if (currentFilter !== 'all') list = list.filter(b => getBookingStatus(b) === currentFilter);
    if (currentSearch) {
        const q = currentSearch.toLowerCase();
        list = list.filter(b =>
            (b.unitId?.name || '').toLowerCase().includes(q) ||
            (b.unitId?.location || '').toLowerCase().includes(q)
        );
    }
    list.sort((a, b) => {
        switch (currentSort) {
            case 'date-asc': return new Date(a.createdAt) - new Date(b.createdAt);
            case 'date-desc': return new Date(b.createdAt) - new Date(a.createdAt);
            case 'checkin': return new Date(a.startDate) - new Date(b.startDate);
            case 'price-desc': return (b.fullAmount || b.totalPrice || 0) - (a.fullAmount || a.totalPrice || 0);
            case 'price-asc': return (a.fullAmount || a.totalPrice || 0) - (b.fullAmount || b.totalPrice || 0);
            default: return 0;
        }
    });
    return list;
}

// ════════════════════════════════════════════
//  STATS
// ════════════════════════════════════════════
function updateStats(bookings) {
    document.getElementById('statTotal').textContent = bookings.length;
    document.getElementById('statUpcoming').textContent = bookings.filter(b => getBookingStatus(b) === 'upcoming').length;
    document.getElementById('statCompleted').textContent = bookings.filter(b => getBookingStatus(b) === 'completed').length;
}

// ════════════════════════════════════════════
//  RENDER CARDS
// ════════════════════════════════════════════
function renderBookings(bookings) {
    const grid = document.getElementById('bookingsGrid');
    const empty = document.getElementById('emptyState');
    const emptyMsg = document.getElementById('emptyMsg');
    const heading = document.getElementById('sectionHeading');
    const count = document.getElementById('resultCount');
    const title = document.getElementById('sectionTitle');
    grid.innerHTML = '';

    if (bookings.length === 0) {
        grid.style.display = 'none'; heading.style.display = 'none'; empty.style.display = 'block';
        emptyMsg.textContent = (currentFilter !== 'all' || currentSearch)
            ? 'No bookings match your current filters.'
            : "You haven't made any reservations yet. Start exploring our units!";
        return;
    }

    grid.style.display = 'grid'; empty.style.display = 'none'; heading.style.display = 'flex';
    const tabLabels = { all: 'All Bookings', upcoming: 'Upcoming', active: 'Active', completed: 'Completed', cancelled: 'Cancelled' };
    title.textContent = tabLabels[currentFilter] || 'All Bookings';
    count.textContent = `${bookings.length} result${bookings.length !== 1 ? 's' : ''}`;
    bookings.forEach((b, idx) => grid.appendChild(createCard(b, idx)));
}

function createCard(b, idx) {
    const unit = b.unitId || {};
    const nights = b.nights || calcNights(b.startDate, b.endDate);
    const total = b.fullAmount || b.totalPrice || 0;
    const bStatus = getBookingStatus(b);
    const pStatus = getPaymentStatus(b);
    const imgSrc = unitImageSrc(unit);
    const isCancelled = bStatus === 'cancelled';

    // ── Balance eligibility ──
    // Show "Pay Balance" if deposit paid, balance NOT yet paid, not cancelled
    const hasBalance = b.depositPaid && !b.balancePaid && !isCancelled;

    const card = document.createElement('div');
    card.className = 'booking-card';
    card.style.animationDelay = `${idx * 0.05}s`;

    card.innerHTML = `
        <div class="card-img-wrap${imgSrc ? '' : ' no-img'}">
            ${imgSrc
            ? `<img src="${imgSrc}" alt="${unit.name || 'Property'}"
                   onerror="this.parentElement.classList.add('no-img');this.remove();this.parentElement.innerHTML+='<span>🏠</span>';" />`
            : '<span>🏠</span>'}
            <div class="card-ribbon">${bookingStatusBadge(bStatus)}</div>
        </div>

        <div class="card-body-wrap">
            <div class="card-property-name">${unit.name || 'Rental Unit'}</div>
            <div class="card-location">📍 ${unit.location || 'Location N/A'}</div>

            <div class="card-dates">
                <div class="date-block">
                    <div class="date-lbl">Check-in</div>
                    <div class="date-val">${formatDate(b.startDate)}</div>
                </div>
                <div class="date-block">
                    <div class="date-lbl">Check-out</div>
                    <div class="date-val">${formatDate(b.endDate)}</div>
                </div>
                <div class="nights-badge">
                    <span class="n-num">${nights}</span>
                    <span class="n-lbl">Night${nights !== 1 ? 's' : ''}</span>
                </div>
            </div>

            <div class="card-price-row">
                <div class="price-info">
                    <div class="price-lbl">Total</div>
                    <div class="price-val">KES ${total.toFixed(2)}</div>
                    <div class="price-method">${methodLabel(b.paymentMethod)}</div>
                </div>
                <div class="badge-row">${paymentStatusBadge(pStatus)}</div>
            </div>

            <div class="card-actions">
                <button class="btn-view" data-id="${b._id}">View Details ↗</button>
                ${hasBalance
                ? `<button class="btn-pay-balance" data-id="${b._id}">💳 Pay Balance</button>`
                : ''}
                ${!isCancelled && bStatus !== 'completed' && bStatus !== 'active'
                ? `<button class="btn-cancel" data-id="${b._id}">✕</button>`
                : ''}
            </div>
        </div>`;

    // ── View details ──
    card.querySelector('.btn-view').addEventListener('click', () => openModal(b));

    // ── Pay Balance — opens inline modal via balance-payment.js ──
    const payBtn = card.querySelector('.btn-pay-balance');
    if (payBtn) {
        payBtn.addEventListener('click', () => {
            if (typeof window._openBalancePayment === 'function') {
                window._openBalancePayment(b);
            } else {
                // Module not yet loaded — fallback to booking page
                const unitId = unit._id || unit.id;
                window.location.href = `booking.html?id=${unitId}&bookingId=${b.bookingId || b._id}`;
            }
        });
    }

    // ── Cancel ──
    const cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => cancelBooking(b._id));

    return card;
}

// ════════════════════════════════════════════
//  DETAIL MODAL
// ════════════════════════════════════════════
function openModal(b) {
    const unit = b.unitId || {};
    const nights = b.nights || calcNights(b.startDate, b.endDate);
    const total = b.fullAmount || b.totalPrice || 0;
    const bStatus = getBookingStatus(b);
    const pStatus = getPaymentStatus(b);
    const imgSrc = unitImageSrc(unit);
    const hasBalance = b.depositPaid && !b.balancePaid && bStatus !== 'cancelled';
    const canCancel = bStatus !== 'cancelled' && bStatus !== 'completed' && bStatus !== 'active';
    const balanceDue = Math.max(total - FIXED_DEPOSIT, 0);
    const unitHref = unit._id || unit.id;

    document.getElementById('modalImgWrap').innerHTML = imgSrc
        ? `<img class="modal-img" src="${imgSrc}" alt="${unit.name || 'Property'}"
                onerror="this.outerHTML='<div class=modal-img-placeholder>🏠</div>'"/>`
        : `<div class="modal-img-placeholder">🏠</div>`;

    document.getElementById('modalTitle').textContent = unit.name || 'Rental Unit';

    document.getElementById('modalBadgeRow').innerHTML =
        bookingStatusBadge(bStatus) + paymentStatusBadge(pStatus);

    document.getElementById('modalDetailsGrid').innerHTML = `
        <div class="detail-item"><div class="d-lbl">Check-in</div><div class="d-val">${formatDate(b.startDate)}</div></div>
        <div class="detail-item"><div class="d-lbl">Check-out</div><div class="d-val">${formatDate(b.endDate)}</div></div>
        <div class="detail-item"><div class="d-lbl">Nights</div><div class="d-val">${nights}</div></div>
        <div class="detail-item"><div class="d-lbl">Property</div><div class="d-val">${unit.name || '—'}</div></div>
        <div class="detail-item"><div class="d-lbl">Total Amount</div><div class="d-val">KES ${total.toFixed(2)}</div></div>
        <div class="detail-item"><div class="d-lbl">Payment Method</div><div class="d-val">${methodLabel(b.paymentMethod)}</div></div>
        <div class="detail-item"><div class="d-lbl">Deposit Paid</div><div class="d-val">${b.depositPaid ? '✅ Yes' : '❌ No'}</div></div>
        <div class="detail-item"><div class="d-lbl">Balance Paid</div><div class="d-val">${b.balancePaid ? '✅ Yes' : `❌ KES ${balanceDue > 0 ? balanceDue.toFixed(2) : '—'}`}</div></div>
        ${b.guestPhone ? `<div class="detail-item" style="grid-column:1/-1"><div class="d-lbl">Phone</div><div class="d-val">${b.guestPhone}</div></div>` : ''}
        ${unit.location ? `<div class="detail-item" style="grid-column:1/-1"><div class="d-lbl">Location</div><div class="d-val">📍 ${unit.location}</div></div>` : ''}`;

    // Actions
    const actionsEl = document.getElementById('modalActions');
    actionsEl.innerHTML = `
        ${unitHref ? `<a class="modal-btn-primary" href="booking.html?id=${unitHref}">🏠 View Property</a>` : ''}
        ${canCancel ? `<button class="modal-btn-secondary" id="modalCancelBtn" data-id="${b._id}">Cancel Booking</button>` : ''}
        ${hasBalance
            ? `<button class="modal-btn-primary"
                   style="background:linear-gradient(135deg,#3b82f6,#2563eb);box-shadow:0 3px 10px rgba(59,130,246,.4);"
                   id="modalPayBalanceBtn">💳 Pay Balance</button>`
            : ''}`;

    // Cancel from modal
    document.getElementById('modalCancelBtn')?.addEventListener('click', async () => {
        document.getElementById('detailModalOverlay').classList.remove('open');
        await cancelBooking(b._id);
    });

    // Pay balance from modal — same handler, just closes modal first
    document.getElementById('modalPayBalanceBtn')?.addEventListener('click', () => {
        document.getElementById('detailModalOverlay').classList.remove('open');
        if (typeof window._openBalancePayment === 'function') {
            window._openBalancePayment(b);
        } else {
            window.location.href = `booking.html?id=${unitHref}&bookingId=${b.bookingId || b._id}`;
        }
    });

    document.getElementById('detailModalOverlay').classList.add('open');
}

document.getElementById('modalClose').addEventListener('click', () =>
    document.getElementById('detailModalOverlay').classList.remove('open'));
document.getElementById('detailModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detailModalOverlay'))
        document.getElementById('detailModalOverlay').classList.remove('open');
});

// ════════════════════════════════════════════
//  CANCEL
// ════════════════════════════════════════════
async function cancelBooking(id) {
    if (!confirm('Cancel this booking? Refund policy applies.')) return;
    window.showStatus('Cancelling booking…', 'info');
    try {
        const res = await fetch(`${API_BASE}/api/book/cancel/${id}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) { window.showStatus(data.error || 'Failed to cancel', 'error'); return; }
        window.showStatus('Booking cancelled successfully', 'success');
        await init();
    } catch (err) {
        window.showStatus('Failed to cancel. Please try again.', 'error');
    }
}

// ════════════════════════════════════════════
//  REFRESH
// ════════════════════════════════════════════
function refreshView() {
    renderBookings(applyFilterSort(allBookings));
}

// ════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════
async function init() {
    const skeleton = document.getElementById('skeletonLoader');
    const grid = document.getElementById('bookingsGrid');
    const empty = document.getElementById('emptyState');
    const loginP = document.getElementById('loginPrompt');

    skeleton.style.display = 'grid';
    grid.style.display = 'none';
    empty.style.display = 'none';
    loginP.style.display = 'none';

    if (!isLoggedIn()) {
        skeleton.style.display = 'none';
        loginP.style.display = 'block';
        ['statTotal', 'statUpcoming', 'statCompleted'].forEach(id =>
            document.getElementById(id).textContent = '0');
        return;
    }

    try {
        allBookings = await fetchBookings();
        updateStats(allBookings);
        skeleton.style.display = 'none';
        refreshView();
    } catch (err) {
        console.error('Failed to load bookings:', err);
        skeleton.style.display = 'none';
        window.showStatus('Failed to load bookings. Please try again.', 'error');
        empty.style.display = 'block';
        document.getElementById('emptyMsg').textContent = 'Something went wrong. Please refresh the page.';
    }
}

// ════════════════════════════════════════════
//  EVENT LISTENERS
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    init();

    // Filter tabs
    document.getElementById('filterTabs').addEventListener('click', e => {
        const btn = e.target.closest('.filter-tab');
        if (!btn) return;
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        refreshView();
    });

    // Search (debounced)
    let searchDebounce;
    document.getElementById('bookingSearch').addEventListener('input', e => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            currentSearch = e.target.value.trim();
            refreshView();
        }, 300);
    });

    // Sort
    document.getElementById('sortSelect').addEventListener('change', e => {
        currentSort = e.target.value;
        refreshView();
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Log out?')) {
            localStorage.removeItem('userToken');
            localStorage.removeItem('loggedInUser');
            window.location.href = 'login.html';
        }
    });

    // Re-init when balance payment module fires completion event
    document.addEventListener('bp:payment-complete', () => init());
});

