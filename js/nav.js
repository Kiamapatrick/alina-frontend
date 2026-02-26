// nav.js — Premium Navbar: auth, wallet, avatar, scroll, active links
// Mobile: two-row inline layout (NO hamburger/overlay)
(function () {
  'use strict';

  /* ─── Config ─────────────────────────────────────────── */
  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://alina906vibes-backend.onrender.com';

  /* ─── JWT helpers ────────────────────────────────────── */
  function decodeJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch { return null; }
  }

  function isTokenValid(token) {
    const payload = decodeJwt(token);
    if (!payload) return false;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem('userToken');
      return false;
    }
    return true;
  }

  function getUserInitials(token) {
    const payload = decodeJwt(token);
    if (!payload) return '?';
    const name = payload.name || payload.userName || payload.email || '';
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
  }

  function getUserFirstName(token) {
    const payload = decodeJwt(token);
    if (!payload) return null;
    const name = payload.name || payload.userName || '';
    if (!name) return null;
    return name.trim().split(/\s+/)[0]; // first word only
  }

  function getUserFullName(token) {
    const payload = decodeJwt(token);
    if (!payload) return 'User';
    return payload.name || payload.userName || payload.email || 'User';
  }

  function getUserId(token) {
    const payload = decodeJwt(token);
    return payload ? (payload.id || payload._id || payload.userId || null) : null;
  }

  /* ─── Auth-link visibility ──────────────────────────── */
  function updateAuthLinks() {
    const token = localStorage.getItem('userToken');
    const loggedIn = token && isTokenValid(token);

    const loginBtn = document.getElementById('loginLink');
    const signupBtn = document.getElementById('signupLink');
    const avatarDropdown = document.getElementById('avatarDropdown');
    const avatarInitials = document.getElementById('avatarInitials');
    const avatarName = document.getElementById('avatarName');
    const navWelcome = document.getElementById('navWelcome');

    if (loggedIn) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (signupBtn) signupBtn.style.display = 'none';
      if (avatarDropdown) avatarDropdown.style.display = '';
      if (avatarInitials) avatarInitials.textContent = getUserInitials(token);
      if (avatarName) avatarName.textContent = getUserFullName(token);

      // Show "Welcome, Name" on mobile row 2
      if (navWelcome) {
        const firstName = getUserFirstName(token);
        navWelcome.textContent = firstName ? `Hi, ${firstName}` : 'Welcome';
        navWelcome.style.display = ''; // keeping this for backwards compatibility, but might be redundant now
      }

      fetchKycStatus(token);
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (signupBtn) signupBtn.style.display = '';
      if (avatarDropdown) avatarDropdown.style.display = 'none';
      if (navWelcome) navWelcome.style.display = 'none';
    }
  }

  /* ─── KYC Status Badge ─────────────────────────────── */
  async function fetchKycStatus(token) {
    const badge = document.getElementById('kycBadge');
    if (!badge) return;

    const userId = getUserId(token);
    if (!userId) { badge.textContent = '—'; return; }

    try {
      const res = await fetch(`${API_BASE}/api/auth/kyc-status/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const status = (data.kycStatus || 'none').toLowerCase();

      badge.className = 'kyc-badge';
      if (status === 'approved' || status === 'verified') {
        badge.textContent = 'Verified'; badge.classList.add('kyc-approved');
      } else if (status === 'pending' || status === 'processing') {
        badge.textContent = 'Pending'; badge.classList.add('kyc-pending');
      } else if (['rejected', 'declined', 'failed'].includes(status)) {
        badge.textContent = 'Rejected'; badge.classList.add('kyc-rejected');
      } else {
        badge.textContent = 'Not Started'; badge.classList.add('kyc-none');
      }
    } catch {
      badge.textContent = '—';
      badge.className = 'kyc-badge kyc-none';
    }
  }

  /* ─── Avatar dropdown toggle ───────────────────────── */
  function initAvatarDropdown() {
    const toggle = document.getElementById('avatarToggle');
    const menu = document.getElementById('avatarMenu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !toggle.contains(e.target)) {
        menu.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') menu.classList.remove('open');
    });
  }

  /* ─── Wallet UI ─────────────────────────────────────── */
  function updateWalletUI() {
    const wallet = localStorage.getItem('walletAddress');
    const connectBtn = document.getElementById('connectWallet');
    const walletInfo = document.getElementById('walletInfoRow');
    const walletAddrEl = document.getElementById('walletAddress');

    if (connectBtn) connectBtn.style.display = wallet ? 'none' : '';
    if (walletInfo) walletInfo.style.display = wallet ? 'flex' : 'none';
    if (walletAddrEl && wallet) {
      // Show shortened address: 0x1234…abcd
      walletAddrEl.textContent = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
    }
  }

  /* ─── Connect Wallet ────────────────────────────────── */
  async function connectWallet() {
    const connectBtn = document.getElementById('connectWallet');

    if (typeof window.ethereum === 'undefined') {
      // Mobile without MetaMask → open MetaMask deep link
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        const deepLink = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`;
        window.location.href = deepLink;
        return;
      }
      alert('MetaMask is not installed. Please install MetaMask to connect your wallet.');
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    try {
      if (connectBtn) { connectBtn.disabled = true; connectBtn.textContent = '🦊 Connecting…'; }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        localStorage.setItem('walletAddress', accounts[0]);
        updateWalletUI();
      }
    } catch (err) {
      console.error('Wallet connect error:', err);
      if (err.code === 4001) {
        alert('Connection rejected. Please approve the MetaMask request.');
      } else {
        alert('Failed to connect wallet: ' + (err.message || 'Unknown error'));
      }
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

  /* ─── Logout ───────────────────────────────────────── */
  function handleLogout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('walletAddress');
    window.location.href = 'login.html';
  }

  /* ─── Scroll: shrink + hide/reveal ─────────────────── */
  function initStickyNav() {
    const navbar = document.getElementById('mainNavbar');
    if (!navbar) return;

    let lastScroll = 0;
    let ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const y = window.scrollY;

        navbar.classList.toggle('navbar-scrolled', y > 60);

        // Hide on scroll-down / reveal on scroll-up
        if (y > lastScroll && y > 200) {
          navbar.classList.add('navbar-hidden');
        } else {
          navbar.classList.remove('navbar-hidden');
        }

        lastScroll = y <= 0 ? 0 : y;
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ─── Active page detection ────────────────────────── */
  function setActiveLinks() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const page = path.replace('.html', '') || 'index';

    document.querySelectorAll('.navbar-links a[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });
  }

  /* ─── MetaMask account/chain listeners ─────────────── */
  function initAccountChangeListener() {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        localStorage.setItem('walletAddress', accounts[0]);
        updateWalletUI();
      }
    });
  }

  /* ─── Boot ─────────────────────────────────────────── */
  function init() {
    updateAuthLinks();
    updateWalletUI();
    initStickyNav();
    initAvatarDropdown();
    setActiveLinks();
    initAccountChangeListener();

    // Wire up buttons
    const connectBtn = document.getElementById('connectWallet');
    const disconnectBtn = document.getElementById('disconnectWallet');
    const logoutBtn = document.getElementById('logoutBtn');

    if (connectBtn) connectBtn.addEventListener('click', connectWallet);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  }

  document.addEventListener('DOMContentLoaded', init);

  // Re-run if localStorage changes in another tab
  window.addEventListener('storage', () => {
    updateAuthLinks();
    updateWalletUI();
  });

  // Expose for external use
  window.updateNav = () => { updateAuthLinks(); updateWalletUI(); };
  window.connectWallet = connectWallet;
  window.disconnectWallet = disconnectWallet;
})();