// nav.js — Premium Navbar v3
// Mobile-tested: backdrop, guard flag, no focus-steal, solid touch support
(function () {
  'use strict';

  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://alina906vibes-backend.onrender.com';

  /* ─── SVG icons ─────────────────────────────────────── */
  const ICONS = {
    bookings: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    account: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    shield: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z"/></svg>`,
    shieldOk: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z"/><polyline points="9 12 11 14 15 10"/></svg>`,
    logout: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    caret: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    verified: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    clock: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    alert: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    dot: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/></svg>`,
    arrow: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  };

  /* ─── JWT helpers ────────────────────────────────────── */
  function decodeJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch { return null; }
  }

  function isTokenValid(token) {
    const p = decodeJwt(token);
    if (!p) return false;
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem('userToken');
      return false;
    }
    return true;
  }

  function getUserInitials(token) {
    const p = decodeJwt(token);
    if (!p) return '?';
    const name = p.name || p.userName || p.email || '';
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
  }

  function getUserFirstName(token) {
    const p = decodeJwt(token);
    if (!p) return null;
    const name = p.name || p.userName || '';
    if (!name) return null;
    return name.trim().split(/\s+/)[0];
  }

  function getUserFullName(token) {
    const p = decodeJwt(token);
    if (!p) return 'User';
    return p.name || p.userName || p.email || 'User';
  }

  function getUserEmail(token) {
    const p = decodeJwt(token);
    return p ? (p.email || '') : '';
  }

  function getUserId(token) {
    const p = decodeJwt(token);
    return p ? (p.id || p._id || p.userId || null) : null;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  /* ─── KYC helpers ────────────────────────────────────── */
  function normaliseKyc(raw) {
    if (!raw) return 'none';
    const s = raw.toLowerCase();
    if (['approved', 'verified'].includes(s)) return 'approved';
    if (['pending', 'processing'].includes(s)) return 'pending';
    if (['rejected', 'declined', 'failed'].includes(s)) return 'rejected';
    return 'none';
  }

  function buildKycBadge(status) {
    const map = {
      approved: { cls: 'kyc-verified', icon: ICONS.verified, label: 'Verified' },
      pending: { cls: 'kyc-pending-v2', icon: ICONS.clock, label: 'Pending' },
      rejected: { cls: 'kyc-rejected-v2', icon: ICONS.alert, label: 'Rejected' },
      none: { cls: 'kyc-none-v2', icon: ICONS.dot, label: 'Not Verified' },
    };
    const { cls, icon, label } = map[status] || map.none;
    return `<span class="kyc-badge-v2 ${cls}">${icon}${label}</span>`;
  }

  /* ─── Build dropdown HTML ────────────────────────────── */
  function buildDropdownHTML(token, kycStatus) {
    const initials = getUserInitials(token);
    const fullName = getUserFullName(token);
    const email = getUserEmail(token);
    const kyc = normaliseKyc(kycStatus);
    const badge = buildKycBadge(kyc);
    const needsVerify = kyc === 'none' || kyc === 'rejected';

    const verifyItem = needsVerify ? `
      <a href="kyc.html" class="avatar-menu-item kyc-action-item" tabindex="0">
        <span class="avatar-item-icon">${ICONS.shield}</span>
        <span class="avatar-item-label">${kyc === 'rejected' ? 'Re-submit Verification' : 'Verify Identity'}</span>
        ${ICONS.arrow}
      </a>` : '';

    return `
      <div class="avatar-menu-identity">
        <div class="avatar-menu-avatar">${escapeHtml(initials)}</div>
        <div class="avatar-menu-identity-info">
          <div class="avatar-menu-fullname">${escapeHtml(fullName)}</div>
          ${email ? `<div class="avatar-menu-email">${escapeHtml(email)}</div>` : ''}
          <div class="avatar-menu-kyc-row">${badge}</div>
        </div>
      </div>

      <div class="avatar-menu-group">
        <div class="avatar-menu-group-label">My Account</div>
        <a href="my_booking.html" class="avatar-menu-item" tabindex="0">
          <span class="avatar-item-icon">${ICONS.bookings}</span>
          <span class="avatar-item-label">My Bookings</span>
        </a>
        <a href="dashboard.html" class="avatar-menu-item" tabindex="0">
          <span class="avatar-item-icon">${ICONS.account}</span>
          <span class="avatar-item-label">Account Settings</span>
        </a>
      </div>

      <div class="avatar-menu-group">
        <div class="avatar-menu-group-label">Verification</div>
        ${verifyItem}
        <div class="avatar-menu-item" style="cursor:default;" tabindex="-1">
          <span class="avatar-item-icon">${kyc === 'approved' ? ICONS.shieldOk : ICONS.shield}</span>
          <span class="avatar-item-label">KYC Status</span>
          ${badge}
        </div>
      </div>

      <div class="avatar-menu-logout-group">
        <button id="logoutBtn" class="avatar-menu-item logout-item" tabindex="0">
          <span class="avatar-item-icon">${ICONS.logout}</span>
          <span class="avatar-item-label">Log Out</span>
        </button>
      </div>
    `;
  }

  /* ─── Render dropdown & wire logout ─────────────────── */
  function renderDropdown(token, kycStatus) {
    const menu = document.getElementById('avatarMenu');
    if (!menu) return;
    menu.innerHTML = buildDropdownHTML(token, kycStatus);
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  }

  /* ─── Notification dot ───────────────────────────────── */
  function updateNotifDot(kycStatus) {
    const dot = document.querySelector('#avatarDropdown .avatar-notif-dot');
    if (!dot) return;
    dot.classList.toggle('visible', kycStatus === 'none' || kycStatus === 'rejected');
  }

  /* ─── Auth link visibility ───────────────────────────── */
  function updateAuthLinks() {
    const token = localStorage.getItem('userToken');
    const loggedIn = token && isTokenValid(token);

    const loginBtn = document.getElementById('loginLink');
    const signupBtn = document.getElementById('signupLink');
    const avatarArea = document.getElementById('avatarDropdown');
    const welcome = document.getElementById('navWelcome');

    if (loggedIn) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (signupBtn) signupBtn.style.display = 'none';

      if (avatarArea) {
        avatarArea.style.display = '';
        // Populate button text
        const initialsEl = document.getElementById('avatarInitials');
        const nameEl = document.getElementById('avatarName');
        if (initialsEl) initialsEl.textContent = getUserInitials(token);
        if (nameEl) nameEl.textContent = getUserFullName(token);

        // Inject caret once
        const btn = document.getElementById('avatarToggle');
        if (btn && !btn.querySelector('.avatar-caret')) {
          const caret = document.createElement('span');
          caret.className = 'avatar-caret';
          caret.innerHTML = ICONS.caret;
          caret.setAttribute('aria-hidden', 'true');
          btn.appendChild(caret);
        }
        // Inject notif dot once
        if (btn && !btn.querySelector('.avatar-notif-dot')) {
          const dot = document.createElement('span');
          dot.className = 'avatar-notif-dot';
          dot.setAttribute('aria-hidden', 'true');
          btn.appendChild(dot);
        }

        fetchKycStatus(token);
      }

      if (welcome) {
        const first = getUserFirstName(token);
        welcome.textContent = first ? `Hi, ${first}` : 'Welcome';
        welcome.style.display = '';
      }
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (signupBtn) signupBtn.style.display = '';
      if (avatarArea) avatarArea.style.display = 'none';
      if (welcome) welcome.style.display = 'none';
    }
  }

  /* ─── KYC fetch ──────────────────────────────────────── */
  async function fetchKycStatus(token) {
    const userId = getUserId(token);
    if (!userId) { renderDropdown(token, 'none'); return; }

    try {
      const res = await fetch(`${API_BASE}/api/auth/kyc-status/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const status = normaliseKyc(data.kycStatus || 'none');
      renderDropdown(token, status);
      updateNotifDot(status);

      // Legacy #kycBadge support
      const legacyBadge = document.getElementById('kycBadge');
      if (legacyBadge) {
        const labels = { approved: 'Verified', pending: 'Pending', rejected: 'Rejected', none: 'Not Started' };
        const classes = { approved: 'kyc-approved', pending: 'kyc-pending', rejected: 'kyc-rejected', none: 'kyc-none' };
        legacyBadge.textContent = labels[status] || '—';
        legacyBadge.className = `kyc-badge ${classes[status] || 'kyc-none'}`;
      }
    } catch {
      renderDropdown(token, 'none');
    }
  }

  /* ─── Backdrop ───────────────────────────────────────── */
  function ensureBackdrop() {
    if (document.getElementById('avatarBackdrop')) return;
    const bd = document.createElement('div');
    bd.className = 'avatar-backdrop';
    bd.id = 'avatarBackdrop';
    document.body.appendChild(bd);
    // Tap backdrop → close
    bd.addEventListener('click', closeDropdown);
    bd.addEventListener('touchstart', closeDropdown, { passive: true });
  }

  /* ─── Open / close ───────────────────────────────────── */
  // Guard: prevents the document-level click from closing on the same
  // event tick that the button tap just opened it.
  let _justOpened = false;

  function openDropdown() {
    const menu = document.getElementById('avatarMenu');
    const btn = document.getElementById('avatarToggle');
    const bd = document.getElementById('avatarBackdrop');
    if (!menu) return;

    menu.classList.add('open');
    btn && btn.setAttribute('aria-expanded', 'true');
    bd && bd.classList.add('active');

    _justOpened = true;
    setTimeout(() => { _justOpened = false; }, 100);
  }

  function closeDropdown() {
    const menu = document.getElementById('avatarMenu');
    const btn = document.getElementById('avatarToggle');
    const bd = document.getElementById('avatarBackdrop');
    if (!menu) return;

    menu.classList.remove('open');
    btn && btn.setAttribute('aria-expanded', 'false');
    bd && bd.classList.remove('active');
  }

  function toggleDropdown() {
    const menu = document.getElementById('avatarMenu');
    if (!menu) return;
    menu.classList.contains('open') ? closeDropdown() : openDropdown();
  }

  /* ─── Init dropdown interactions ────────────────────── */
  function initAvatarDropdown() {
    const toggle = document.getElementById('avatarToggle');
    const menu = document.getElementById('avatarMenu');
    if (!toggle || !menu) return;

    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');

    // Button tap/click (explicit touch support for some mobile browsers)
    let _touching = false;

    toggle.addEventListener('touchstart', (e) => {
      _touching = true;
      e.stopPropagation();
      e.preventDefault();
      toggleDropdown();
      setTimeout(() => { _touching = false; }, 250);
    }, { passive: false });

    toggle.addEventListener('click', (e) => {
      if (_touching) return; // click fired after touchstart; already handled
      e.stopPropagation();
      e.preventDefault();
      toggleDropdown();
    });

    // Close when clicking outside on desktop
    document.addEventListener('click', (e) => {
      if (_justOpened) return;
      if (menu.classList.contains('open') &&
        !menu.contains(e.target) &&
        !toggle.contains(e.target)) {
        closeDropdown();
      }
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        closeDropdown();
        toggle.focus();
      }
    });

    // Arrow-key navigation (desktop accessibility)
    menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('.avatar-menu-item:not([tabindex="-1"])'));
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      }
    });
  }

  /* ─── Wallet UI ──────────────────────────────────────── */
  function updateWalletUI() {
    const wallet = localStorage.getItem('walletAddress');
    const connectBtn = document.getElementById('connectWallet');
    const walletInfo = document.getElementById('walletInfoRow');
    const walletAddrEl = document.getElementById('walletAddress');

    if (connectBtn) connectBtn.style.display = wallet ? 'none' : '';
    if (walletInfo) walletInfo.style.display = wallet ? 'flex' : 'none';
    if (walletAddrEl && wallet) {
      walletAddrEl.textContent = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
    }
  }

  async function connectWallet() {
    const connectBtn = document.getElementById('connectWallet');
    if (typeof window.ethereum === 'undefined') {
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.href = `https://metamask.app.link/dapp/${location.host}${location.pathname}${location.search}`;
        return;
      }
      alert('MetaMask is not installed.');
      window.open('https://metamask.io/download/', '_blank');
      return;
    }
    try {
      if (connectBtn) { connectBtn.disabled = true; connectBtn.textContent = '🦊 Connecting…'; }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts?.length) { localStorage.setItem('walletAddress', accounts[0]); updateWalletUI(); }
    } catch (err) {
      if (err.code === 4001) alert('Connection rejected.');
      else alert('Wallet error: ' + (err.message || 'Unknown'));
    } finally {
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.innerHTML = '<span class="wallet-icon">🦊</span> Connect Wallet';
      }
    }
  }

  function disconnectWallet() {
    localStorage.removeItem('walletAddress');
    updateWalletUI();
  }

  /* ─── Logout ─────────────────────────────────────────── */
  function handleLogout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('walletAddress');
    window.location.href = 'login.html';
  }

  /* ─── Sticky navbar scroll behaviour ────────────────── */
  function initStickyNav() {
    const navbar = document.getElementById('mainNavbar');
    if (!navbar) return;
    let lastY = 0, ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        navbar.classList.toggle('navbar-scrolled', y > 60);
        if (y > lastY && y > 200) navbar.classList.add('navbar-hidden');
        else navbar.classList.remove('navbar-hidden');
        lastY = y <= 0 ? 0 : y;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ─── Active page links ──────────────────────────────── */
  function setActiveLinks() {
    const page = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
    document.querySelectorAll('.navbar-links a[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
  }

  /* ─── MetaMask account change ────────────────────────── */
  function initWalletListeners() {
    if (!window.ethereum) return;
    window.ethereum.on('accountsChanged', (accounts) => {
      if (!accounts.length) disconnectWallet();
      else { localStorage.setItem('walletAddress', accounts[0]); updateWalletUI(); }
    });
  }

  /* ─── Boot ───────────────────────────────────────────── */
  function init() {
    ensureBackdrop();
    updateAuthLinks();
    updateWalletUI();
    initStickyNav();
    initAvatarDropdown();
    setActiveLinks();
    initWalletListeners();

    const connectBtn = document.getElementById('connectWallet');
    const disconnectBtn = document.getElementById('disconnectWallet');
    if (connectBtn) connectBtn.addEventListener('click', connectWallet);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);
  }

  document.addEventListener('DOMContentLoaded', init);

  window.addEventListener('storage', () => { updateAuthLinks(); updateWalletUI(); });

  // Public API
  window.updateNav = () => { updateAuthLinks(); updateWalletUI(); };
  window.connectWallet = connectWallet;
  window.disconnectWallet = disconnectWallet;

})();