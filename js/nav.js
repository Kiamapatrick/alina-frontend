// nav.js — Unified navigation visibility manager

(function () {
  function updateNav() {
    const token  = localStorage.getItem('userToken');
    const wallet = localStorage.getItem('walletAddress');

    // Auth buttons
    const loginBtn  = document.getElementById('loginLink');
    const signupBtn = document.getElementById('signupLink');

    if (token && isTokenValid(token)) {
      if (loginBtn)  loginBtn.style.display  = 'none';
      if (signupBtn) signupBtn.style.display = 'none';
    } else {
      if (loginBtn)  loginBtn.style.display  = '';
      if (signupBtn) signupBtn.style.display = '';
    }

    // Wallet UI (booking page only — safe to run everywhere)
    const connectBtn   = document.getElementById('connectWallet');
    const walletInfo   = document.getElementById('walletInfoRow');
    const walletAddrEl = document.getElementById('walletAddress');
    const disconnectBtn = document.getElementById('disconnectWallet');

    if (connectBtn) {
      connectBtn.style.display = wallet ? 'none' : '';
    }

    if (walletInfo) {
      walletInfo.style.display = wallet ? 'flex' : 'none';
    }

    // Populate address text from localStorage on every page load
    if (walletAddrEl && wallet) {
      walletAddrEl.textContent = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    }

    if (disconnectBtn) {
      disconnectBtn.style.display = wallet ? '' : 'none';
    }
  }

  function isTokenValid(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        localStorage.removeItem('userToken');
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  // Run on load
  document.addEventListener('DOMContentLoaded', updateNav);

  // Re-run if localStorage changes in another tab
  window.addEventListener('storage', updateNav);

  // Expose globally
  window.updateNav = updateNav;
})();