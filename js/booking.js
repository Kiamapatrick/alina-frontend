// ===============================
// booking.js — Two-Phase Payment System
// ===============================

import {
  connectWallet,
  isWalletConnected,
  getWalletAddress,
  payDeposit,
  payBalance,
  disconnectWallet,
  getRemainingRefundable,
  getPayment,
  getMaticPerUSD,
  getNetworkInfo,
  verifyCorrectNetwork,  // ADD THIS
  switchNetwork          // ADD THIS
} from './app.js';

// ===============================
// CONFIG
// ===============================
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://alina906vibes-backend.onrender.com';

const TOKEN_KEY = 'userToken';
const FIXED_DEPOSIT = 5;
const PRICING = {
  perNight: 8
};

// Two-phase payment state
let paymentState = {
  fullAmount: 0,
  depositAmount: FIXED_DEPOSIT,
  balanceAmount: 0,
  paymentType: 'DEPOSIT', // 'FULL' or 'DEPOSIT' - default to DEPOSIT
  amountToPayNow: 0,
  nights: 0
};

const MPESA_BASE = "https://alina906vibes-backend.onrender.com";
const PAYSTACK_PUBLIC_KEY = 'pk_test_a5bc7124026172186b9b17687145910613f32fe0'; // Get from .env or config

// STATE
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let unitId = null;
let lastTransactionTime = 0;
const TRANSACTION_COOLDOWN = 10000; // 10 seconds between transactions

// ===============================
// UTILITY FUNCTIONS
// ===============================
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function showStatus(msg, type = 'info') {
  // Always use the centered #bookingStatus element directly
  const statusEl = document.getElementById('bookingStatus');
  if (!statusEl) {
    window.showStatus?.(msg, type);
    return;
  }

  if (window._statusTimeout) {
    clearTimeout(window._statusTimeout);
    window._statusTimeout = null;
  }

  statusEl.classList.remove('show', 'text-danger', 'text-success', 'text-muted');
  statusEl.textContent = msg;
  void statusEl.offsetHeight; // force reflow

  if (type === 'error') statusEl.classList.add('text-danger');
  else if (type === 'success') statusEl.classList.add('text-success');
  else statusEl.classList.add('text-muted');

  statusEl.classList.add('show');

  window._statusTimeout = setTimeout(() => {
    statusEl.classList.remove('show');
    window._statusTimeout = null;
  }, type === 'success' ? 5000 : 7000);
}

function showLoading(show = true) {
  if (window.showLoading) {
    window.showLoading(show);
  } else {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.toggle('active', show);
    }
  }
}

function calculateNights(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return (e - s) / (1000 * 60 * 60 * 24);
}


// ===============================
// PAYMENT STATE MANAGEMENT
// ===============================
function calculatePaymentAmounts(nights) {
  const fullAmount = nights * PRICING.perNight;
  const depositAmount = FIXED_DEPOSIT;
  const balanceAmount = fullAmount - depositAmount;

  paymentState.nights = nights;
  paymentState.fullAmount = fullAmount;
  paymentState.depositAmount = depositAmount;
  paymentState.balanceAmount = balanceAmount > 0 ? balanceAmount : 0;

  updatePaymentAmount();
}

function updatePaymentAmount() {
  if (paymentState.paymentType === 'FULL') {
    paymentState.amountToPayNow = paymentState.fullAmount;
    paymentState.balanceAmount = 0;
  } else {
    paymentState.amountToPayNow = paymentState.depositAmount;
    paymentState.balanceAmount = Math.max(
      paymentState.fullAmount - paymentState.depositAmount,
      0
    );
  }

  updatePaymentUI();
}

function updatePaymentUI() {
  const nightsEl = document.getElementById('totalNights');
  if (nightsEl) {
    nightsEl.textContent = paymentState.nights;
  }

  const fullAmountEl = document.getElementById('fullAmount');
  if (fullAmountEl) {
    fullAmountEl.textContent = `KES ${paymentState.fullAmount.toFixed(2)}`;
  }

  const depositAmountEl = document.getElementById('depositAmount');
  if (depositAmountEl) {
    depositAmountEl.textContent = `KES ${paymentState.depositAmount.toFixed(2)}`;
  }

  const balanceAmountEl = document.getElementById('balanceAmount');
  if (balanceAmountEl) {
    balanceAmountEl.textContent = `KES ${paymentState.balanceAmount.toFixed(2)}`;
  }

  const fullAmountLabelEl = document.getElementById('fullAmountLabel');
  if (fullAmountLabelEl) {
    fullAmountLabelEl.textContent = `Pay Full Amount (KES ${paymentState.fullAmount.toFixed(2)})`;
  }

  const bookBtn = document.getElementById('bookBtn');
  if (bookBtn) {
    // Preserve inner span structure if it exists
    const btnSpan = document.getElementById('btnPayAmount');
    if (btnSpan) {
      btnSpan.textContent = `KES ${paymentState.amountToPayNow.toFixed(2)}`;
    } else {
      bookBtn.textContent = `Pay KES ${paymentState.amountToPayNow.toFixed(2)}`;
    }
  }

  // Sync mobile bottom bar price
  const mobilePrice = document.getElementById('mobilePrice');
  const mobilePriceDetail = document.getElementById('mobilePriceDetail');
  if (mobilePrice && paymentState.nights > 0) {
    mobilePrice.textContent = `KES ${paymentState.amountToPayNow.toFixed(0)}`;
    if (mobilePriceDetail) {
      mobilePriceDetail.textContent = `${paymentState.nights} night${paymentState.nights > 1 ? 's' : ''}`;
    }
  }
}

function setupPaymentTypeListeners() {
  const paymentTypeRadios = document.querySelectorAll('input[name="paymentType"]');

  paymentTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      paymentState.paymentType = e.target.value;
      updatePaymentAmount();
    });
  });
}

function setupDateChangeListeners() {
  const startDateEl = document.getElementById('startDate');
  const endDateEl = document.getElementById('endDate');

  const handleDateChange = () => {
    const startDate = startDateEl?.value;
    const endDate = endDateEl?.value;

    if (startDate && endDate) {
      const nights = calculateNights(startDate, endDate);
      if (nights > 0) {
        calculatePaymentAmounts(nights);
      }
    }
  };

  if (startDateEl) {
    startDateEl.addEventListener('change', handleDateChange);
  }

  if (endDateEl) {
    endDateEl.addEventListener('change', handleDateChange);
  }
}

// ===============================
// CALENDAR FUNCTIONS
// ===============================

/**
 * Format a Date object as 'YYYY-MM-DD' in LOCAL time.
 * NEVER use toISOString().split('T')[0] — that converts to UTC
 * and produces off-by-one errors in positive-offset timezones (e.g. UTC+3).
 */
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Build a Set of 'YYYY-MM-DD' strings for all BOOKED NIGHTS.
 * Uses the exclusive end-date model:
 *   - Marks check-in date through last night (endDate - 1 day)
 *   - The checkout date (endDate) itself is NOT marked → available for next guest
 */
function getBookedDays(bookings) {
  const booked = new Set();

  bookings.forEach(b => {
    const isReserved = b.depositPaid || b.balancePaid ||
      b.paymentStatus === 'confirmed' ||
      b.status === 'confirmed';

    if (!isReserved) return;

    const start = new Date(b.startDate);
    const end = new Date(b.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // Mark each night: check-in up to (but NOT including) check-out
    const current = new Date(start);
    while (current < end) {
      booked.add(toLocalDateStr(current));
      current.setDate(current.getDate() + 1);
    }
    // checkout day is NOT added → stays available
  });

  return booked;
}

// ── Calendar selection state ──
let calendarSelection = {
  startDate: null,   // 'YYYY-MM-DD' or null  (check-in)
  endDate: null,     // 'YYYY-MM-DD' or null  (exclusive checkout)
  bookedSet: null    // Set of booked date strings
};

/**
 * Check if every night from `from` up to (but NOT including) `to` is free.
 * Both `from` and `to` are 'YYYY-MM-DD' strings.
 */
function isRangeFree(from, to, bookedSet) {
  const cur = new Date(from + 'T12:00:00'); // noon to avoid DST edge cases
  const end = new Date(to + 'T12:00:00');
  while (cur < end) {
    if (bookedSet.has(toLocalDateStr(cur))) return false;
    cur.setDate(cur.getDate() + 1);
  }
  return true;
}

/**
 * Return the calendar day after `dateStr` as 'YYYY-MM-DD'.
 */
function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids any DST issues
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}

/** Is the given 'YYYY-MM-DD' before today? */
function isInPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

/**
 * Apply visual selection styling to calendar day cells.
 * Highlights BOOKED NIGHTS only: check-in ≤ date < checkout.
 * The checkout day cell is NOT highlighted.
 */
function applySelectionVisuals() {
  const cells = document.querySelectorAll('#calendar .calendar-day[data-date]');
  cells.forEach(cell => {
    cell.classList.remove('cal-selected', 'cal-range', 'cal-start', 'cal-end');
  });

  if (!calendarSelection.startDate) return;

  const checkoutStr = calendarSelection.endDate || nextDay(calendarSelection.startDate);

  cells.forEach(cell => {
    const ds = cell.dataset.date;
    // Highlight if: check-in ≤ ds < checkout
    if (ds >= calendarSelection.startDate && ds < checkoutStr) {
      cell.classList.add('cal-selected');

      if (ds === calendarSelection.startDate) cell.classList.add('cal-start');

      // Last booked night = day before checkout
      const lastNightStr = prevDay(checkoutStr);
      if (ds === lastNightStr) cell.classList.add('cal-end');

      // Middle cells
      if (ds > calendarSelection.startDate && ds < lastNightStr) cell.classList.add('cal-range');
    }
  });
}

/** Return the calendar day before `dateStr` as 'YYYY-MM-DD'. */
function prevDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
}

/**
 * Push the current selection into the #startDate and #endDate inputs
 * and trigger payment recalculation.
 */
function syncSelectionToInputs() {
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  if (!startEl || !endEl) return;

  if (calendarSelection.startDate) {
    const checkin = calendarSelection.startDate;
    const checkout = calendarSelection.endDate || nextDay(calendarSelection.startDate);

    startEl.value = checkin;
    endEl.value = checkout;

    // nights = number of selected dates = checkout − checkin in days
    const nights = calculateNights(checkin, checkout);
    if (nights > 0) calculatePaymentAmounts(nights);
  } else {
    startEl.value = '';
    endEl.value = '';
  }
}

/**
 * Handle a click on an available calendar day cell.
 *
 * Exclusive end-date model:
 *   - Selected dates = booked nights (guest sleeps there).
 *   - Checkout = day AFTER last selected night.
 *   - Select 5th only     → checkin=5, checkout=6, 1 night.  Mark: [5].
 *   - Select 5th then 8th → checkin=5, checkout=9, 4 nights. Mark: [5,6,7,8].
 *   - Checkout day (6 or 9) is NEVER marked booked.
 */
function handleCalendarDayClick(dateStr) {
  const bookedSet = calendarSelection.bookedSet;

  if (isInPast(dateStr)) {
    showStatus('Cannot select dates in the past', 'error');
    return;
  }

  // ── First click: check-in, checkout = next day ──
  if (!calendarSelection.startDate) {
    calendarSelection.startDate = dateStr;
    calendarSelection.endDate = nextDay(dateStr);
    applySelectionVisuals();
    syncSelectionToInputs();
    return;
  }

  // ── Click same start → reset ──
  if (dateStr === calendarSelection.startDate) {
    calendarSelection.startDate = null;
    calendarSelection.endDate = null;
    applySelectionVisuals();
    syncSelectionToInputs();
    return;
  }

  // ── Click BEFORE current start → move start earlier ──
  if (dateStr < calendarSelection.startDate) {
    const existingEnd = calendarSelection.endDate;
    if (!isRangeFree(dateStr, existingEnd, bookedSet)) {
      showStatus('Cannot select a range that includes booked dates', 'error');
      return;
    }
    calendarSelection.startDate = dateStr;
    applySelectionVisuals();
    syncSelectionToInputs();
    return;
  }

  // ── Click AFTER current start → last selected night ──
  // checkout = clicked + 1 day (exclusive)
  const newCheckout = nextDay(dateStr);
  if (!isRangeFree(calendarSelection.startDate, newCheckout, bookedSet)) {
    showStatus('Cannot select a range that includes booked dates', 'error');
    return;
  }

  calendarSelection.endDate = newCheckout;
  applySelectionVisuals();
  syncSelectionToInputs();
}

/**
 * Show a hover preview of the potential range.
 */
function handleCalendarDayHover(dateStr) {
  if (!calendarSelection.startDate) return;

  const cells = document.querySelectorAll('#calendar .calendar-day[data-date]');
  cells.forEach(c => c.classList.remove('cal-hover'));

  if (dateStr <= calendarSelection.startDate) return;

  const potentialEnd = nextDay(dateStr);
  if (!isRangeFree(calendarSelection.startDate, potentialEnd, calendarSelection.bookedSet)) return;

  cells.forEach(cell => {
    const ds = cell.dataset.date;
    if (ds >= calendarSelection.startDate && ds <= dateStr && !cell.classList.contains('booked')) {
      cell.classList.add('cal-hover');
    }
  });
}

function renderCalendar(bookings) {
  const calendar = document.getElementById('calendar');
  const monthYear = document.getElementById('monthYear');

  if (!calendar || !monthYear) return;

  calendar.innerHTML = '';

  const bookedDays = getBookedDays(bookings);
  calendarSelection.bookedSet = bookedDays;

  const firstDay = new Date(currentYear, currentMonth, 1);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  monthYear.textContent = firstDay.toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  });

  let startDay = firstDay.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;

  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day other-month';
    calendar.appendChild(empty);
  }

  const todayStr = toLocalDateStr(new Date());

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    cell.textContent = d;
    cell.dataset.date = dateStr;

    if (bookedDays.has(dateStr)) {
      cell.classList.add('booked');
      cell.title = 'Booked';
    } else if (dateStr < todayStr) {
      cell.classList.add('past');
      cell.title = 'Past date';
    } else {
      cell.classList.add('available');
      cell.title = 'Available — click to select';
      cell.addEventListener('click', () => handleCalendarDayClick(dateStr));
      cell.addEventListener('mouseenter', () => handleCalendarDayHover(dateStr));
    }

    calendar.appendChild(cell);
  }

  calendar.addEventListener('mouseleave', () => {
    document.querySelectorAll('#calendar .cal-hover').forEach(c => c.classList.remove('cal-hover'));
  });

  applySelectionVisuals();
}

async function loadCalendar() {
  if (!unitId) return;
  try {
    const res = await fetch(`${API_BASE}/api/calendar/${unitId}`);
    const data = await res.json();

    console.log('📅 Calendar data:', data);
    console.log('📅 Number of bookings:', data.bookings?.length || 0);

    renderCalendar(data.bookings || []);
  } catch (err) {
    console.error('Calendar fetch error:', err);
  }
}

// ===============================
// USER BOOKINGS MANAGEMENT
// ===============================
async function cancelBooking(bookingId) {
  const token = getToken();
  if (!token) return;

  if (!confirm('Cancel this booking? Refund policy applies.')) return;

  showLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/book/cancel/${bookingId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await res.json();

    if (!res.ok) {
      showStatus(`Failed to cancel: ${result.error || 'Unknown error'}`, 'error');
      return;
    }

    showStatus(' Booking canceled successfully!', 'success');
    await loadUserBookings();
    await loadCalendar();
  } catch (err) {
    console.error('Cancel error:', err);
    showStatus('Failed to cancel booking. Please try again.', 'error');
  } finally {
    showLoading(false);
  }
}

// ===============================
// USER BOOKINGS MANAGEMENT (DROPDOWN VERSION)
// ===============================
async function loadUserBookings() {
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/api/book/my`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    const container = document.getElementById('userBookings');
    if (!container) return;

    const bookingsCount = data.bookings?.length || 0;

    // Create dropdown structure with filter bar
    container.innerHTML = `
  <div class="bookings-header" id="bookingsHeaderToggle">
    <h6>
      Your Bookings
      ${bookingsCount > 0 ? `<span class="bookings-count">${bookingsCount}</span>` : ''}
    </h6>
    <div class="bookings-toggle">
      <button id="refreshBookingsBtn" class="btn btn-sm" title="Refresh bookings">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
      </button>
      <span class="bookings-toggle-icon">▼</span>
    </div>
  </div>
  <div class="bookings-content" id="bookingsContent">
    <div class="bookings-filter-bar">
      <input type="text" id="bookingSearch" placeholder="Search by unit name..." class="form-control">
      <select id="statusFilter" class="form-select">
        <option value="all">All bookings</option>
        <option value="deposit-paid">Deposit paid</option>
        <option value="balance-pending">Balance pending</option>
        <option value="fully-paid">Fully paid</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
    <div class="bookings-list" id="bookingsList"></div>
  </div>
`;

    // Get references
    const headerToggle = document.getElementById('bookingsHeaderToggle');
    const bookingsContent = document.getElementById('bookingsContent');
    const toggleIcon = container.querySelector('.bookings-toggle-icon');
    const bookingsList = document.getElementById('bookingsList');

    // Setup toggle functionality
    headerToggle.addEventListener('click', (e) => {
      // Don't toggle if clicking refresh button
      if (e.target.closest('#refreshBookingsBtn')) return;

      bookingsContent.classList.toggle('open');
      toggleIcon.classList.toggle('open');
    });

    // Populate bookings
    if (!data.bookings || data.bookings.length === 0) {
      bookingsList.innerHTML = '<div class="no-bookings-message">No active bookings</div>';
      attachRefreshListener(container);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Populate bookings
    if (!data.bookings || data.bookings.length === 0) {
      bookingsList.innerHTML = '<div class="no-bookings-message">No active bookings</div>';
      attachRefreshListener(container);
      return;
    }

    // Cache bookings for filtering
    window.cachedBookings = data.bookings;

    // Initial render with filtering
    filterAndRenderBookings(data.bookings);

    // Setup filter listeners
    setupFilterListeners();

    // Attach refresh listener (balance listeners are attached in renderFilteredBookings)
    attachRefreshListener(container);

    // Auto-open if there are bookings
    if (bookingsCount > 0) {
      bookingsContent.classList.add('open');
      toggleIcon.classList.add('open');
    }

  } catch (err) {
    console.error("Failed to load bookings:", err);
  }
}
// ===============================
// BOOKING FILTERING & GROUPING
// ===============================
function filterAndRenderBookings(bookings) {
  const searchQuery = document.getElementById('bookingSearch')?.value.toLowerCase() || '';
  const statusFilter = document.getElementById('statusFilter')?.value || 'all';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Split into upcoming and previous
  const upcoming = [];
  const previous = [];

  bookings.forEach(b => {
    const startDate = new Date(b.startDate);
    startDate.setHours(0, 0, 0, 0);

    if (startDate >= today) {
      upcoming.push(b);
    } else {
      previous.push(b);
    }
  });

  // Apply filters to both groups
  const filteredUpcoming = applyFilters(upcoming, searchQuery, statusFilter, today);
  const filteredPrevious = applyFilters(previous, searchQuery, statusFilter, today);

  renderFilteredBookings(filteredUpcoming, filteredPrevious);
}

function applyFilters(bookings, searchQuery, statusFilter, today) {
  return bookings.filter(b => {
    // Search filter
    const unitName = (b.unitId?.name || '').toLowerCase();
    const unitLabel = (b.unitId?.label || '').toLowerCase();
    const matchesSearch = !searchQuery ||
      unitName.includes(searchQuery) ||
      unitLabel.includes(searchQuery);

    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter === 'all') return true;

    const depositPaid = b.depositPaid === true;
    const balancePaid = b.balancePaid === true;
    const isCancelled = b.paymentStatus === 'cancelled' || b.status === 'cancelled';

    const checkInDate = new Date(b.startDate);
    checkInDate.setHours(0, 0, 0, 0);

    switch (statusFilter) {
      case 'deposit-paid':
        return depositPaid && !balancePaid;
      case 'balance-pending':
        return depositPaid && !balancePaid && checkInDate >= today;
      case 'fully-paid':
        return depositPaid && balancePaid;
      case 'cancelled':
        return isCancelled;
      default:
        return true;
    }
  });
}

function renderFilteredBookings(upcomingBookings, previousBookings) {
  const bookingsList = document.getElementById('bookingsList');
  if (!bookingsList) return;

  bookingsList.innerHTML = '';

  const totalResults = upcomingBookings.length + previousBookings.length;

  if (totalResults === 0) {
    bookingsList.innerHTML = '<div class="no-bookings-message">No matching bookings found</div>';
    return;
  }

  // Render upcoming bookings
  if (upcomingBookings.length > 0) {
    const upcomingSection = document.createElement('div');
    upcomingSection.className = 'booking-group';
    upcomingSection.innerHTML = `
      <div class="booking-group-header">
        <h6>Upcoming Bookings</h6>
        <span class="booking-group-count">${upcomingBookings.length}</span>
      </div>
    `;

    upcomingBookings.forEach(b => {
      upcomingSection.appendChild(createBookingCard(b));
    });

    bookingsList.appendChild(upcomingSection);
  }

  // Render previous bookings
  if (previousBookings.length > 0) {
    const previousSection = document.createElement('div');
    previousSection.className = 'booking-group';
    previousSection.innerHTML = `
      <div class="booking-group-header">
        <h6>Previous Bookings</h6>
        <span class="booking-group-count">${previousBookings.length}</span>
      </div>
    `;

    previousBookings.forEach(b => {
      previousSection.appendChild(createBookingCard(b));
    });

    bookingsList.appendChild(previousSection);
  }

  // Reattach event listeners
  attachBalancePaymentListeners(bookingsList.parentElement);
}

function createBookingCard(b) {
  const div = document.createElement('div');
  div.className = 'border rounded p-2 mb-2';

  const start = new Date(b.startDate);
  const end = new Date(b.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const isPast = end < today;
  const checkInDate = new Date(start);
  checkInDate.setHours(0, 0, 0, 0);

  const depositPaid = b.depositPaid === true;
  const balancePaid = b.balancePaid === true;

  let statusLabel = '';
  let actionHTML = '';

  if (b.paymentStatus === 'cancelled') {
    statusLabel = '<span class="badge bg-secondary">Cancelled</span>';
  } else if (isPast) {
    statusLabel = '<span class="badge bg-dark">Completed</span>';
  } else if (!depositPaid) {
    statusLabel = '<span class="badge bg-warning">Payment Pending</span>';
  } else if (depositPaid && !balancePaid) {
    statusLabel = '<span class="badge bg-info">Deposit Paid</span>';

    const balanceAmount = (b.fullAmount || b.totalPrice || 0) - FIXED_DEPOSIT;
    const paymentMethod = b.paymentMethod || 'crypto';
    const paymentMethodLabel = paymentMethod === 'mpesa' ? 'M-Pesa'
      : (paymentMethod === 'visa' || paymentMethod === 'paystack') ? 'Paystack'
        : 'Crypto';

    actionHTML = `
      <button class="btn btn-sm btn-success pay-balance-btn mt-1"
              data-booking-id="${b.bookingId}"
              data-unit-id="${b.unitId?._id || b.unitId}"
              data-balance="${balanceAmount}"
              data-phone="${b.guestPhone || ''}"
              data-payment-method="${paymentMethod}">
        Pay Balance via ${paymentMethodLabel} (KES ${balanceAmount.toFixed(2)})
      </button>
    `;

    const daysUntil = Math.ceil((checkInDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntil > 0) {
      actionHTML += `<small class="text-muted d-block mt-1">Balance due in ${daysUntil} day(s)</small>`;
    } else if (daysUntil === 0) {
      actionHTML += `<small class="text-warning d-block mt-1"><strong>Balance due today</strong></small>`;
    } else {
      actionHTML += `<small class="text-danger d-block mt-1"><strong>Balance overdue by ${Math.abs(daysUntil)} day(s)</strong></small>`;
    }

    actionHTML += `<button class="btn btn-sm btn-outline-danger cancel-btn mt-1 ms-1" data-id="${b._id}">Cancel</button>`;
  } else {
    statusLabel = '<span class="badge bg-success">Fully Paid</span>';
    actionHTML = `<button class="btn btn-sm btn-outline-danger cancel-btn mt-1" data-id="${b._id}">Cancel</button>`;
  }

  div.innerHTML = `
    <strong>${b.unitId?.name || 'Rental'}</strong><br>
    <small>Check-in: ${start.toLocaleDateString()}</small><br>
    <small>Check-out: ${end.toLocaleDateString()}</small><br>
    <small>Nights: ${b.nights || calculateNights(b.startDate, b.endDate)}</small><br>
    <small>Total: KES ${(b.fullAmount || b.totalPrice || 0).toFixed(2)}</small><br>
    <small>Method: ${b.paymentMethod || 'N/A'}</small><br>
    Status: ${statusLabel}<br>${actionHTML}
  `;

  const cancelBtn = div.querySelector('.cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => cancelBooking(b._id));
  }

  return div;
}

function setupFilterListeners() {
  const searchInput = document.getElementById('bookingSearch');
  const statusFilter = document.getElementById('statusFilter');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const allBookings = window.cachedBookings || [];
      filterAndRenderBookings(allBookings);
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      const allBookings = window.cachedBookings || [];
      filterAndRenderBookings(allBookings);
    });
  }
}
function attachRefreshListener(container) {
  const refreshBtn = document.getElementById('refreshBookingsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent toggle when clicking refresh
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
      await loadUserBookings();
      await loadCalendar();
    });
  }
}

function attachBalancePaymentListeners(container) {
  container.querySelectorAll('.pay-balance-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bookingId = btn.dataset.bookingId;
      const unitId = btn.dataset.unitId;
      const balanceAmount = parseFloat(btn.dataset.balance);
      const guestPhone = btn.dataset.phone;
      const paymentMethod = btn.dataset.paymentMethod || 'crypto'; // ✅ Read payment method

      if (!confirm(`Pay balance of KES ${balanceAmount.toFixed(2)} via ${paymentMethod.toUpperCase()}?`)) return;

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Processing...';

      // ✅ Route to correct payment method
      const success = await handleBalancePayment(bookingId, unitId, balanceAmount, guestPhone, paymentMethod);

      if (!success) {
        btn.disabled = false;
        btn.textContent = originalText;
      } else {
        await loadUserBookings();
        await loadCalendar();
      }
    });
  });
}



// ===============================
// BOOKING VALIDATION
// ===============================
function validateBookingDates(start, end, existingBookings = []) {
  const now = new Date();
  const startDate = new Date(start);
  const endDate = new Date(end);

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const minStart = new Date(now);
  minStart.setDate(minStart.getDate() + 1);

  if (startDate < minStart) {
    return { valid: false, error: 'Bookings must start at least 24 hours from now' };
  }

  if (endDate <= startDate) {
    return { valid: false, error: 'End date must be after start date' };
  }

  const nights = calculateNights(start, end);
  if (nights < 1) {
    return { valid: false, error: 'Minimum 1 night required' };
  }

  // Check for conflicts with confirmed bookings
  for (const booked of existingBookings) {
    // Only check bookings that have at least deposit paid
    if (!booked.depositPaid && booked.paymentStatus !== 'confirmed') continue;

    let bookedStart = new Date(booked.startDate);
    let bookedEnd = new Date(booked.endDate);

    bookedStart.setHours(0, 0, 0, 0);
    bookedEnd.setHours(0, 0, 0, 0);

    // ✅ REPLACE WITH CLEAR LOGIC:
    // Check if dates overlap (standard overlap check)
    const hasOverlap = startDate < bookedEnd && endDate > bookedStart;

    // Check if it's a back-to-back booking (checkout = checkin)
    const isBackToBack = startDate.getTime() === bookedEnd.getTime();

    // Only reject if there's an overlap AND it's NOT a back-to-back booking
    if (hasOverlap && !isBackToBack) {
      return { valid: false, error: 'Selected dates conflict with an existing booking' };
    }
  }

  return { valid: true, nights };
}

// ===============================
// TWO-PHASE CRYPTO PAYMENT
// ===============================
async function handleCryptoPayment(bookingData, totalPrice) {
  if (!isWalletConnected()) {
    showStatus('Please connect your wallet first', 'error');
    return null;
  }

  const now = Date.now();
  const timeSinceLastTx = now - lastTransactionTime;

  if (timeSinceLastTx < TRANSACTION_COOLDOWN) {
    const waitTime = Math.ceil((TRANSACTION_COOLDOWN - timeSinceLastTx) / 1000);
    showStatus(`Please wait ${waitTime} seconds before next transaction`, 'error');
    return null;
  }

  try {
    showStatus('Checking network and balance...', 'info');
    const isCorrectNetwork = await verifyCorrectNetwork(80002);
    if (!isCorrectNetwork) {
      showStatus('Please switch to Polygon Amoy Testnet (Chain ID: 80002)', 'error');
      const switched = await switchNetwork('POLYGON_AMOY');
      if (!switched) {
        return null;
      }
      // Reload page after network switch
      window.location.reload();
      return null;
    }

    const networkInfo = await getNetworkInfo();
    console.log('Network:', networkInfo);

    const maticPerUSD = await getMaticPerUSD();
    console.log('MATIC per USD:', maticPerUSD);

    if (!bookingData.bookingId) {
      bookingData.bookingId = 'booking_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    }

    let depositTxHash = null;
    let balanceTxHash = null;

    // ✅ BRANCH BASED ON PAYMENT TYPE
    if (paymentState.paymentType === 'FULL') {
      showStatus('Processing full payment (this may take a moment)...', 'info');

      // 1️⃣ Pay deposit first
      showStatus('Step 1/2: Processing deposit...', 'info');
      depositTxHash = await payDeposit(
        bookingData.bookingId,
        paymentState.depositAmount
      );

      if (!depositTxHash) {
        showStatus('Deposit payment canceled', 'error');
        return null;
      }

      console.log('✅ Deposit TX Hash:', depositTxHash);
      showStatus('Deposit confirmed! Processing balance...', 'success');

      // Wait for deposit to fully confirm and network state to update
      await new Promise(resolve => setTimeout(resolve, 8000));

      // 2️⃣ Pay balance if there is one
      if (paymentState.balanceAmount > 0) {
        showStatus('Step 2/2: Processing balance payment...', 'info');

        balanceTxHash = await payBalance(
          bookingData.bookingId,
          paymentState.balanceAmount,
          false // Do NOT skip on-chain check for crypto payments
        );

        if (!balanceTxHash) {
          showStatus('Balance payment canceled. Deposit was successful.', 'error');
          // Still return success for deposit - user can pay balance later
          lastTransactionTime = Date.now();
          return null;
        }

        console.log('✅ Balance TX Hash:', balanceTxHash);
      }

      lastTransactionTime = Date.now();
      showStatus('Full payment confirmed! Booking complete.', 'success');
    }
    else {
      // ✅ Pay deposit only (two-phase)
      showStatus('Processing deposit payment...', 'info');

      depositTxHash = await payDeposit(bookingData.bookingId, paymentState.depositAmount);

      if (!depositTxHash) {
        showStatus('Deposit payment canceled', 'error');
        return null;
      }

      console.log('Deposit TX Hash:', depositTxHash);
      lastTransactionTime = Date.now();
      showStatus(`Deposit confirmed! Balance of KES ${paymentState.balanceAmount.toFixed(2)} due at check-in.`, 'success');
    }

    // Get and normalize guest phone
    let guestPhone = document.getElementById('guestPhone')?.value;
    if (!guestPhone) {
      throw new Error('Guest phone number is required');
    }

    guestPhone = normalizePhoneNumber(guestPhone);

    // ✅ Confirm with backend
    const res = await fetch(`${API_BASE}/api/book/confirm-crypto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        bookingId: bookingData.bookingId,
        unitId: bookingData.unitId,
        startDate: bookingData.startDate,
        endDate: bookingData.endDate,
        depositTxHash: depositTxHash,
        balanceTxHash: balanceTxHash,
        totalPrice: totalPrice,
        paymentType: paymentState.paymentType,
        depositAmount: paymentState.depositAmount,
        balanceAmount: paymentState.balanceAmount,
        fullAmount: paymentState.fullAmount,
        nights: bookingData.nights || 1,
        walletAddress: getWalletAddress(),
        guestPhone: guestPhone
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Backend confirmation failed');
    }

    const result = await res.json();

    // Verify on-chain
    try {
      const payment = await getPayment(bookingData.bookingId);
      console.log(' On-chain payment verified:', payment);
    } catch (err) {
      console.warn('Could not verify on-chain payment:', err);
    }

    return result;

  } catch (err) {
    console.error('Crypto payment error:', err);
    showStatus(`Payment error: ${err.message}`, 'error');
    return null;
  }
}

// ===============================
// BALANCE PAYMENT (at check-in)
// ===============================
async function handleBalancePayment(bookingId, unitId, balanceAmount, guestPhone, paymentMethod) {
  if (balanceAmount <= 0) {
    showStatus("Balance already paid", "info");
    return false;
  }

  // ✅ ROUTE BASED ON PAYMENT METHOD
  if (paymentMethod === 'crypto') {
    return await handleCryptoBalancePayment(bookingId, unitId, balanceAmount, guestPhone);
  } else if (paymentMethod === 'mpesa') {
    return await handleMpesaBalancePayment(bookingId, unitId, balanceAmount, guestPhone);
  } else if (paymentMethod === 'visa' || paymentMethod === 'paystack') { // ADD THIS
    return await handlePaystackBalancePayment(bookingId, unitId, balanceAmount, guestPhone);
  } else {
    showStatus(`Unsupported payment method: ${paymentMethod}`, "error");
    return false;
  }
}
async function handleCryptoBalancePayment(bookingId, unitId, balanceAmount, guestPhone) {
  if (!isWalletConnected()) {
    showStatus("Please connect your wallet first", "error");
    return false;
  }

  const now = Date.now();
  if (now - lastTransactionTime < TRANSACTION_COOLDOWN) {
    const wait = Math.ceil((TRANSACTION_COOLDOWN - (now - lastTransactionTime)) / 1000);
    showStatus(`Please wait ${wait} seconds before transaction`, "error");
    return false;
  }

  try {
    showStatus("Processing crypto balance payment...", "info");

    // ✅ Pay balance on-chain (WITH on-chain verification)
    const balanceTxHash = await payBalance(bookingId, balanceAmount, false); // skipOnChainCheck = false

    if (!balanceTxHash) {
      showStatus("Balance payment cancelled", "error");
      return false;
    }

    lastTransactionTime = Date.now();
    showStatus("Balance payment confirmed on-chain. Finalizing booking...", "success");

    // ✅ Notify backend
    const res = await fetch(`${API_BASE}/api/book/confirm-balance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        bookingId,
        unitId,
        balanceTxHash,
        walletAddress: getWalletAddress(),
        guestPhone
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Backend confirmation failed");
    }

    showStatus(" Payment complete! Access code sent to your phone.", "success");
    return true;

  } catch (err) {
    console.error("Crypto balance payment error:", err);
    showStatus(err.message || "Balance payment failed", "error");
    return false;
  }
}
async function handleMpesaBalancePayment(bookingId, unitId, balanceAmount, guestPhone) {
  if (!guestPhone) {
    showStatus("Guest phone number is required", "error");
    return false;
  }

  try {
    showStatus("Initiating M-Pesa balance payment...", "info");

    const normalizedPhone = normalizePhoneNumber(guestPhone);

    console.log("📤 Sending balance payment request:", {
      bookingId,
      guestPhone: normalizedPhone,
      balanceAmount
    });

    // ✅ FIXED: Use correct endpoint that matches your route
    const res = await fetch(`${MPESA_BASE}/api/payments/mpesa/balance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        bookingId,
        guestPhone: normalizedPhone
      })
    });

    const data = await res.json();

    console.log("📥 Balance payment response:", data);

    if (!res.ok) {
      throw new Error(data.error || "Failed to initiate M-Pesa balance payment");
    }

    showStatus("STK Push sent. Please approve balance payment on your phone.", "success");

    // ✅ Poll for balance payment confirmation
    const balanceBookingId = data.bookingId;
    const result = await pollMpesaBalancePaymentStatus(bookingId, balanceBookingId);

    return result;

  } catch (err) {
    console.error("❌ M-Pesa balance payment error:", err);
    showStatus(err.message || "M-Pesa balance payment failed", "error");
    return false;
  }
}
async function handlePaystackBalancePayment(bookingId, unitId, balanceAmount, guestPhone) {
  try {
    showStatus("Initializing Paystack balance payment...", "info");

    const email = document.getElementById("guestEmail")?.value ||
      `user${Date.now()}@alina906vibes.com`;

    const res = await fetch(`${API_BASE}/api/payments/paystack/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        backendBookingId: bookingId,
        amount: balanceAmount,
        type: 'balance',
        email: email
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to initialize balance payment");
    }

    showStatus("Redirecting to Paystack for balance payment...", "success");

    // Redirect to Paystack
    window.location.href = data.authorization_url;

    return true;

  } catch (err) {
    console.error("❌ Paystack balance payment error:", err);
    showStatus(err.message || "Paystack balance payment failed", "error");
    return false;
  }
}

// ✅ FIXED: Polling function for balance payment
async function pollMpesaBalancePaymentStatus(originalBookingId, balanceBookingId) {
  let attempts = 0;
  const maxAttempts = 40; // 2 minutes max

  console.log("🔄 Starting balance payment polling:", {
    originalBookingId,
    balanceBookingId
  });

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 3000));
    attempts++;

    try {
      const statusRes = await fetch(
        `${MPESA_BASE}/api/payments/mpesa/status/${balanceBookingId}`,
        {
          headers: {
            "Authorization": `Bearer ${getToken()}`,
          }
        }
      );

      const statusJson = await statusRes.json();

      console.log(`🔍 Poll attempt ${attempts}:`, statusJson);

      // ✅ Check for confirmed balance payment
      if (statusJson.success && statusJson.booking) {
        const booking = statusJson.booking;

        // Balance payment confirmed
        if (booking.balancePaid === true || booking.paymentStatus === "confirmed") {
          console.log(" Balance payment confirmed!");
          showStatus(" Balance payment received! Access code sent to your phone.", "success");
          return { success: true, booking };
        }
      }

      // Check for failure states
      const pendingBooking = statusJson.booking;

      if (pendingBooking?.status === "cancelled") {
        showStatus("M-Pesa balance payment cancelled", "error");
        return null;
      }

      if (pendingBooking?.status === "failed") {
        showStatus("M-Pesa balance payment failed", "error");
        return null;
      }

    } catch (pollErr) {
      console.warn(`⚠️ Polling attempt ${attempts} failed:`, pollErr);
      // Continue polling on error
    }
  }

  console.error("❌ Balance payment polling timeout");
  showStatus("Balance payment not confirmed. Please contact support.", "error");
  return null;
}


// ===============================
// M-PESA PAYMENT
// ===============================
async function handleMpesaPayment(bookingData) {
  try {
    showStatus("Initiating M-Pesa payment...", "info");

    const phone = document.getElementById("mpesaPhone")?.value;
    if (!phone) {
      showStatus("Please enter a valid phone number", "error");
      return null;
    }

    const normalizedPhone = normalizePhoneNumber(phone);

    const res = await fetch(`${MPESA_BASE}/api/payments/mpesa/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        unitId: bookingData.unitId,
        startDate: bookingData.startDate,
        endDate: bookingData.endDate,
        totalPrice: paymentState.amountToPayNow,
        paymentType: paymentState.paymentType,
        depositAmount: paymentState.depositAmount,
        balanceAmount: paymentState.balanceAmount,
        fullAmount: paymentState.fullAmount,
        guestPhone: normalizedPhone
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showStatus(data.error || "Failed to initiate M-Pesa payment", "error");
      return null;
    }

    showStatus("STK Push sent. Please approve payment on your phone.", "success");

    // ✅ Poll for payment confirmation
    const bookingId = data.bookingId;
    const result = await pollMpesaPaymentStatus(bookingId);

    return result;

  } catch (err) {
    console.error("M-Pesa error:", err);
    showStatus("M-Pesa payment error", "error");
    return null;
  }
}

async function pollMpesaPaymentStatus(bookingId) {
  let attempts = 0;
  const maxAttempts = 40; // 2 minutes max

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 3000));
    attempts++;

    try {
      const statusRes = await fetch(
        `${MPESA_BASE}/api/payments/mpesa/status/${bookingId}`,
        {
          headers: {
            "Authorization": `Bearer ${getToken()}`,
          }
        }
      );

      const statusJson = await statusRes.json();
      const booking = statusJson.booking;

      // ✅ Check if deposit is paid
      if (booking?.depositPaid === true) {
        if (paymentState.paymentType === 'FULL' && booking?.balancePaid === true) {
          showStatus(" Full payment received. Booking confirmed!", "success");
        } else {
          showStatus(" Deposit received. Booking reserved!", "success");
        }
        return { success: true, booking };
      }

      if (booking?.paymentStatus === "cancelled") {
        showStatus("M-Pesa payment cancelled", "error");
        return null;
      }

    } catch (pollErr) {
      console.warn("Polling error:", pollErr);
    }
  }

  showStatus("Payment not confirmed. Please contact support.", "error");
  return null;
}
// ===============================
// PAYSTACK PAYMENT
// ===============================
async function handlePaystackPayment(bookingData) {
  try {
    showStatus("Initializing Paystack payment...", "info");

    const email = document.getElementById("guestEmail")?.value ||
      `user${Date.now()}@alina906vibes.com`;

    // ✅ FIXED: Send all required fields for booking creation
    const res = await fetch(`${API_BASE}/api/payments/paystack/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        backendBookingId: bookingData.bookingId,
        amount: paymentState.amountToPayNow,
        type: 'deposit', // Always deposit on first payment
        email: email,

        // ✅ NEW: Include booking details for creation
        unitId: bookingData.unitId,
        startDate: bookingData.startDate,
        endDate: bookingData.endDate,
        totalPrice: paymentState.fullAmount,
        guestPhone: document.getElementById('guestPhone')?.value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to initialize Paystack payment");
    }

    showStatus("Redirecting to Paystack checkout...", "success");

    // ✅ Store bookingId in localStorage before redirect
    localStorage.setItem('pendingPaystackBooking', JSON.stringify({
      bookingId: bookingData.bookingId,
      unitId: bookingData.unitId,
      timestamp: Date.now()
    }));

    console.log('💾 Stored pending booking:', bookingData.bookingId);

    // Redirect to Paystack checkout
    window.location.href = data.authorization_url;

    return { pending: true, reference: data.reference };

  } catch (err) {
    console.error("Paystack error:", err);
    showStatus(err.message || "Paystack payment error", "error");
    return null;
  }
}

// ===============================
// BOOKING CREATION
// ===============================
async function createBooking() {
  const startDate = document.getElementById('startDate')?.value;
  const endDate = document.getElementById('endDate')?.value;
  const paymentMethod = document.getElementById('paymentMethod')?.value;

  if (!startDate || !endDate) {
    showStatus('Please select check-in and check-out dates', 'error');
    return;
  }

  const unitIdFromUrl = new URLSearchParams(window.location.search).get("id");
  if (!unitIdFromUrl) {
    showStatus('Unit ID is missing', 'error');
    return;
  }

  const token = getToken();
  if (!token) {
    showStatus('Please login to make a booking', 'error');
    return;
  }

  // Log payment details for debugging
  console.log('💰 Payment Details:', {
    paymentType: paymentState.paymentType,
    amountToPayNow: paymentState.amountToPayNow,
    fullAmount: paymentState.fullAmount,
    depositAmount: paymentState.depositAmount,
    balanceAmount: paymentState.balanceAmount,
    nights: paymentState.nights
  });
  const guestPhoneInput = document.getElementById('guestPhone')?.value;
  if (!guestPhoneInput) {
    showStatus('Please enter guest phone number', 'error');
    showLoading(false);
    if (bookBtn) {
      bookBtn.disabled = false;
      bookBtn.textContent = `Pay KES ${paymentState.amountToPayNow.toFixed(2)}`;
    }
    return;
  }

  const bookBtn = document.getElementById('bookBtn');
  if (bookBtn) {
    bookBtn.disabled = true;
    bookBtn.textContent = 'Processing...';
  }

  showLoading(true);

  try {
    // Fetch existing bookings to check for conflicts
    const calendarRes = await fetch(`${API_BASE}/api/calendar/${unitIdFromUrl}`);
    const calendarData = await calendarRes.json();
    const existingBookings = calendarData.bookings || [];

    const validation = validateBookingDates(startDate, endDate, existingBookings);
    if (!validation.valid) {
      showStatus(validation.error, 'error');
      return;
    }

    showStatus('Processing booking...', 'info');

    const startDateISO = new Date(startDate).toISOString();
    const endDateISO = new Date(endDate).toISOString();

    const walletAddr = getWalletAddress();
    const walletSuffix = walletAddr ? walletAddr.slice(2, 8) : 'offchain';
    const bookingId = `booking_${Date.now()}_${unitIdFromUrl}_${walletSuffix}_${Math.random().toString(36).slice(2, 10)}`; const bookingData = {
      bookingId,
      unitId: unitIdFromUrl,
      startDate: startDateISO,
      endDate: endDateISO,
      paymentMethod,
      totalPrice: paymentState.amountToPayNow,
      fullAmount: paymentState.fullAmount,
      depositAmount: paymentState.depositAmount,
      balanceAmount: paymentState.balanceAmount,
      paymentType: paymentState.paymentType,
      nights: paymentState.nights
    };

    console.log('📅 Booking data:', bookingData);

    // Around line 1050, in the payment routing section:
    let result;

    // ✅ Route to appropriate payment handler
    if (paymentMethod === 'crypto') {
      result = await handleCryptoPayment(bookingData, paymentState.amountToPayNow);
    } else if (paymentMethod === 'mpesa') {
      result = await handleMpesaPayment(bookingData);
    } else if (paymentMethod === 'visa' || paymentMethod === 'paystack') { // ADD THIS
      result = await handlePaystackPayment(bookingData);
    } else {
      showStatus('Payment method not yet implemented', 'error');
      return;
    }

    // MODIFY the success handling for Paystack redirects:
    if (result && (result.success || result.pending)) {
      if (result.pending || result.authorization_url) {
        showStatus('Redirecting to Paystack...', 'info');

        // ✅ Use the callback URL from backend (already has real reference)
        const callbackUrl = result.callbackUrl ||
          `${window.location.origin}/booking.html?id=${unitIdFromUrl}&bookingId=${bookingData.bookingId}`;

        // ✅ Paystack will add their reference automatically
        const paystackUrl = result.authorization_url;

        console.log("🔗 Redirecting to Paystack");
        console.log("📝 Booking ID for callback:", bookingData.bookingId);

        // ✅ Paystack will handle the redirect back with their reference
        setTimeout(() => {
          window.location.href = paystackUrl;
        }, 1000);

        return;
      }

      showStatus(' Booking confirmed!', 'success');

      // Clear form... (rest of existing code)

      // Clear form
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';

      // Reset payment state
      paymentState = {
        fullAmount: 0,
        depositAmount: FIXED_DEPOSIT,
        balanceAmount: 0,
        paymentType: 'DEPOSIT',
        amountToPayNow: 0,
        nights: 0
      };
      updatePaymentUI();

      // Refresh UI
      await loadCalendar();
      await loadUserBookings();
    } else {
      showStatus('Failed to complete booking', 'error');
    }
  } catch (err) {
    console.error('Booking error:', err);
    showStatus('An unexpected error occurred', 'error');
  } finally {
    showLoading(false);
    if (bookBtn) {
      bookBtn.disabled = false;
      bookBtn.textContent = `Pay KES ${paymentState.amountToPayNow.toFixed(2)}`;
    }
  }
}

// ===============================
// UTILITY FUNCTIONS
// ===============================
function normalizePhoneNumber(phone) {
  phone = phone.trim();

  if (!phone.startsWith('+')) {
    if (phone.startsWith('254')) {
      phone = '+' + phone;
    } else if (phone.startsWith('0')) {
      phone = '+254' + phone.slice(1);
    } else {
      phone = '+254' + phone;
    }
  }

  return phone;
}

// ===============================
// UI SETUP
// ===============================
function setupMonthNavigation() {
  document.getElementById('prevMonth')?.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    loadCalendar();
  });

  document.getElementById('nextMonth')?.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    loadCalendar();
  });
}

// ===============================
// UPDATE: Auth UI Setup
// ===============================
function setupAuthUI() {
  const loginBtn = document.getElementById('loginLink');
  const signupBtn = document.getElementById('signupLink');
  const logoutBtn = document.getElementById('logoutBtn');

  // ✅ Use better token check
  const isLoggedIn = isUserLoggedIn();

  if (isLoggedIn) {
    loginBtn?.style && (loginBtn.style.display = 'none');
    signupBtn?.style && (signupBtn.style.display = 'none');
    logoutBtn?.style && (logoutBtn.style.display = 'inline-block');
  } else {
    logoutBtn?.style && (logoutBtn.style.display = 'none');
  }

  logoutBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('loggedInUser');
      showStatus(' You have been logged out', 'success');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000);
    }
  });
}

async function setupWalletConnection() {
  const connectBtn = document.getElementById('connectWallet');
  const walletStatus = document.getElementById('walletAddress');
  const walletInfoRow = document.getElementById('walletInfoRow');
  const disconnectBtn = document.getElementById('disconnectWallet');

  if (!connectBtn) return;

  // On page load: if wallet was previously connected, restore UI from localStorage
  // (actual Web3 re-connection happens via autoConnect in app.js)
  const savedAddr = localStorage.getItem('walletAddress');
  if (savedAddr) {
    connectBtn.style.display = 'none';
    if (walletInfoRow) walletInfoRow.style.display = 'flex';
    if (walletStatus) walletStatus.textContent = `${savedAddr.slice(0, 6)}...${savedAddr.slice(-4)}`;
  }

  // Connect
  connectBtn.addEventListener('click', async () => {
    connectBtn.disabled = true;
    const btnTextEl = connectBtn.querySelector('.wallet-btn-text');
    if (btnTextEl) btnTextEl.textContent = 'Connecting...';
    else connectBtn.textContent = '🦊 Connecting…';

    const addr = await connectWallet();

    if (addr) {
      localStorage.setItem('walletAddress', addr);

      connectBtn.style.display = 'none';
      if (walletInfoRow) walletInfoRow.style.display = 'flex';
      if (walletStatus) walletStatus.textContent = `${addr.slice(0, 6)}...${addr.slice(-4)}`;

      showStatus('Wallet connected successfully', 'success');
      window.updateNav?.();
    } else {
      // Reset button if connection failed
      connectBtn.disabled = false;
      const resetTextEl = connectBtn.querySelector('.wallet-btn-text');
      if (resetTextEl) resetTextEl.textContent = 'Connect Wallet';
      else connectBtn.innerHTML = '<span>🦊</span> Connect Wallet';
    }
  });

  // Disconnect
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      disconnectWallet();                          // clears app.js state
      localStorage.removeItem('walletAddress');

      connectBtn.style.display = '';
      connectBtn.disabled = false;
      const dcTextEl = connectBtn.querySelector('.wallet-btn-text');
      if (dcTextEl) dcTextEl.textContent = 'Connect Wallet';
      else connectBtn.innerHTML = '<span>🦊</span> Connect Wallet';
      if (walletInfoRow) walletInfoRow.style.display = 'none';
      if (walletStatus) walletStatus.textContent = '—';

      showStatus('Wallet disconnected', 'info');
      window.updateNav?.();
    });
  }
}

async function loadRentalDetails() {
  if (!unitId) return;

  try {
    const res = await fetch(`${API_BASE}/units/${unitId}`);
    const unit = await res.json();

    const titleEl = document.getElementById('rentalTitle');
    const descEl = document.getElementById('rentalDescription');
    const priceEl = document.getElementById('unitPrice');

    if (titleEl) titleEl.textContent = unit.name;
    if (descEl) descEl.textContent = unit.description;
    if (priceEl) priceEl.textContent = `KES ${unit.pricePerNight}/night`;

  } catch (err) {
    console.error('Failed to load rental:', err);
    showStatus('Failed to load rental details', 'error');
  }
}

// ===============================
// INITIALIZATION
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  unitId = urlParams.get('id');

  if (!unitId) {
    console.error('❌ No unit ID in URL');
    showStatus('Invalid booking page URL', 'error');
    return;
  }

  // Setup UI
  setupAuthUI();
  setupMonthNavigation();
  await setupWalletConnection();

  // ✅ Setup two-phase payment listeners
  setupPaymentTypeListeners();
  setupDateChangeListeners();
  updatePaymentUI();

  // Load data
  await loadRentalDetails();
  await loadCalendar();
  await loadUserBookings();

  // Attach booking button
  const bookBtn = document.getElementById('bookBtn');
  if (bookBtn) {
    bookBtn.addEventListener('click', createBooking);
  }
  const savedCallback = localStorage.getItem('paystackCallback');
  if (savedCallback) {
    try {
      const { reference, bookingId } = JSON.parse(savedCallback);
      const unitIdFromUrl = new URLSearchParams(window.location.search).get('id');
      const newUrl = window.location.pathname + `?id=${unitIdFromUrl}&reference=${reference}&bookingId=${bookingId}`;
      window.history.replaceState({}, '', newUrl);
      await checkPaystackCallback();
    } catch (err) {
      console.error('Failed to process saved callback:', err);
      localStorage.removeItem('paystackCallback');
    }
  } else {
    await checkPaystackCallback();
  }
});
async function checkPaystackCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const bookingId = urlParams.get('bookingId');
  const trxref = urlParams.get('trxref'); // ✅ Paystack uses 'trxref' in callback
  const reference = urlParams.get('reference') || trxref; // ✅ Fallback

  // ✅ Only need bookingId to poll - reference is just for logging
  if (!bookingId) {
    const pending = localStorage.getItem('pendingPaystackBooking');
    if (pending) {
      try {
        const data = JSON.parse(pending);
        bookingId = data.bookingId;
        console.log('📦 Retrieved bookingId from localStorage:', bookingId);

        // Clear old pending bookings (>10 minutes)
        if (Date.now() - data.timestamp > 10 * 60 * 1000) {
          localStorage.removeItem('pendingPaystackBooking');
          return;
        }
      } catch (err) {
        console.error('Failed to parse pending booking:', err);
        localStorage.removeItem('pendingPaystackBooking');
        return;
      }
    } else {
      // No bookingId in URL or localStorage - not a Paystack callback
      return;
    }
  }

  console.log('📥 Paystack callback detected:', {
    reference: reference || 'none',
    bookingId: bookingId || 'MISSING',
    fullURL: window.location.href
  });

  // ✅ Check if user is logged in
  const token = getToken();
  if (!token) {
    console.warn('⚠️ User not logged in after Paystack redirect');
    showStatus('Payment received! Please log in to view your booking.', 'success');

    // Save callback params to localStorage for retry after login
    localStorage.setItem('paystackCallback', JSON.stringify({ reference, bookingId }));

    // Clean URL
    const unitIdFromUrl = urlParams.get('id');
    if (unitIdFromUrl) {
      window.history.replaceState({}, '', window.location.pathname + `?id=${unitIdFromUrl}`);
    }

    // Redirect to login after 3 seconds
    setTimeout(() => {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + '?id=' + unitIdFromUrl)}`;
    }, 3000);

    return;
  }

  showStatus('Verifying payment...', 'info');
  showLoading(true);

  try {
    // Poll for payment confirmation
    let attempts = 0;
    const maxAttempts = 20;
    let bookingFound = false;

    while (attempts < maxAttempts && !bookingFound) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;

      try {
        const statusRes = await fetch(`${API_BASE}/api/book/my`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        // ✅ Handle 401 specifically
        if (statusRes.status === 401) {
          console.error('❌ Auth token expired/invalid');
          showStatus('Session expired. Please log in again.', 'error');

          // Save callback for retry
          localStorage.setItem('paystackCallback', JSON.stringify({ reference, bookingId }));

          const unitIdFromUrl = urlParams.get('id');
          setTimeout(() => {
            localStorage.removeItem(TOKEN_KEY);
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + '?id=' + unitIdFromUrl)}`;
          }, 2000);

          break;
        }

        if (!statusRes.ok) {
          console.warn(`⚠️ Poll attempt ${attempts} failed: HTTP ${statusRes.status}`);
          continue;
        }

        const data = await statusRes.json();

        console.log(`📝 Poll attempt ${attempts}:`, {
          searchingFor: bookingId,
          foundBookings: data.bookings?.length || 0,
          bookingIds: data.bookings?.map(b => b.bookingId) || []
        });

        const booking = data.bookings?.find(b => b.bookingId === bookingId);

        if (booking) {
          console.log(` Poll attempt ${attempts}: FOUND booking:`, {
            bookingId: booking.bookingId,
            depositPaid: booking.depositPaid,
            balancePaid: booking.balancePaid,
            paymentStatus: booking.paymentStatus,
            paystackDepositRef: booking.paystackDepositRef || 'none'
          });

          // ✅ Check if deposit is paid (webhook sets this)
          if (booking.depositPaid === true) {
            bookingFound = true;

            if (booking.balancePaid === true) {
              showStatus(' Full payment confirmed! Booking complete.', 'success');
            } else {
              showStatus(' Deposit confirmed! Booking reserved.', 'success');
            }

            // ✅ Refresh UI
            await loadCalendar();
            await loadUserBookings();

            // ✅ Clean URL and remove callback from localStorage
            // ✅ Clean URL and remove callback data from localStorage
            localStorage.removeItem('paystackCallback');
            localStorage.removeItem('pendingPaystackBooking'); // ✅ ADD THIS
            const unitIdFromUrl = urlParams.get('id');
            window.history.replaceState({}, '', window.location.pathname + `?id=${unitIdFromUrl}`);

            break;
          } else {
            console.log(`⏳ Poll attempt ${attempts}: Payment not yet confirmed`);
          }
        } else {
          console.log(`⏳ Poll attempt ${attempts}: Booking not found yet`);
        }

      } catch (fetchErr) {
        console.warn(`⚠️ Poll attempt ${attempts} failed:`, fetchErr.message);
        continue;
      }
    }

    if (!bookingFound) {
      showStatus('Payment verification timeout. Please check your bookings.', 'error');
    }

  } catch (err) {
    console.error('Payment verification error:', err);
    showStatus('Could not verify payment. Please check your bookings.', 'error');
  } finally {
    showLoading(false);
  }
}


function isUserLoggedIn() {
  const token = getToken();
  if (!token) return false;

  try {
    // Basic JWT validation (check if it has 3 parts)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('⚠️ Malformed JWT token');
      localStorage.removeItem(TOKEN_KEY); // Clear bad token
      return false;
    }

    // Decode payload to check expiration
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      console.warn('⚠️ Token expired');
      localStorage.removeItem(TOKEN_KEY);
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ Token validation error:', err);
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
}

