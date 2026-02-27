/**
 * account.js — Alina906Vibes Member Dashboard
 * Handles auth check, profile display, wallet, KYC, bookings summary, controls
 */

(function () {
    'use strict';

    // ─── Config ──────────────────────────────────────────────────
    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://alina906vibes-backend.onrender.com';

    const TOKEN_KEY = 'userToken';

    // ─── State ───────────────────────────────────────────────────
    let _user = null;
    let _bookings = [];
    let _statusTimer = null;

    // ─── Status Toast ────────────────────────────────────────────
    function showStatus(msg, type = 'info') {
        const el = document.getElementById('pageStatus');
        if (!el) return;
        if (_statusTimer) { clearTimeout(_statusTimer); _statusTimer = null; }
        el.className = `page-status ${type}`;
        el.textContent = msg;
        void el.offsetHeight;
        el.classList.add('show');
        _statusTimer = setTimeout(() => el.classList.remove('show'), type === 'success' ? 5000 : 7000);
    }

    // ─── Token Helpers ───────────────────────────────────────────
    function getToken() { return localStorage.getItem(TOKEN_KEY); }

    function decodeToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                localStorage.removeItem(TOKEN_KEY);
                return null;
            }
            return payload;
        } catch { return null; }
    }

    function isLoggedIn() {
        const token = getToken();
        if (!token) return false;
        return !!decodeToken(token);
    }

    // ─── Member ID Generator ─────────────────────────────────────
    function generateMemberId(userId) {
        // Derive a stable human-readable member ID from user ID
        if (!userId) return 'ALN–000000';
        const hash = String(userId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const segment = hash.slice(-6).padStart(6, '0');
        return `ALN–${segment}`;
    }

    // ─── Format Date ─────────────────────────────────────────────
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // ─── Booking Status ──────────────────────────────────────────
    function getBookingStatus(b) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const start = new Date(b.startDate); start.setHours(0, 0, 0, 0);
        const end = new Date(b.endDate); end.setHours(0, 0, 0, 0);
        if (b.paymentStatus === 'cancelled' || b.status === 'cancelled') return 'cancelled';
        if (today >= start && today < end) return 'active';
        if (end <= today) return 'completed';
        return 'upcoming';
    }

    function calcNights(start, end) {
        const s = new Date(start), e = new Date(end);
        s.setHours(0, 0, 0, 0); e.setHours(0, 0, 0, 0);
        return Math.max(0, Math.round((e - s) / 86400000));
    }

    // ─── Identity Section ─────────────────────────────────────────
    function renderIdentity(user) {
        const name = user.name || user.username || 'Member';
        const email = user.email || '—';
        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const kycVerified = user.kycStatus === 'verified' || user.kyc === 'verified';
        const memberId = generateMemberId(user._id || user.id || user.email);

        // Avatar
        document.getElementById('avatarLetters').textContent = initials;
        document.getElementById('identityName').textContent = name;
        document.getElementById('identityEmail').textContent = email;
        document.getElementById('memberId').textContent = memberId;

        // Verified ring
        if (kycVerified) {
            document.getElementById('verifiedRing').style.display = 'block';
        }

        // Badge
        const badge = document.getElementById('identityBadge');
        if (kycVerified) {
            badge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
        </svg>
        Verified Guest`;
            badge.className = 'identity-badge';
        } else {
            badge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Unverified`;
            badge.className = 'identity-badge unverified';
        }
    }

    // ─── Info Card ────────────────────────────────────────────────
    function renderInfoCard(user) {
        const name = user.name || user.username || '—';
        const email = user.email || '—';
        const created = formatDate(user.createdAt || user.created_at);

        document.getElementById('infoName').textContent = name;
        document.getElementById('infoEmail').textContent = email;
        document.getElementById('infoSince').textContent = created;

        const statusEl = document.getElementById('infoStatus');
        statusEl.textContent = 'Active';
        statusEl.style.color = '#198754';
        statusEl.style.fontWeight = '600';
    }

    // ─── KYC Section ─────────────────────────────────────────────
    function renderKyc(user) {
        const kycStatus = user.kycStatus || user.kyc || 'unverified';
        const isVerified = kycStatus === 'verified';
        const isPending = kycStatus === 'pending';

        const badge = document.getElementById('kycStatusBadge');
        const verifiedEl = document.getElementById('kycVerified');
        const unverifiedEl = document.getElementById('kycUnverified');

        if (isVerified) {
            badge.textContent = 'Verified';
            badge.className = 'acc-card-badge verified';
            verifiedEl.style.display = 'block';
            unverifiedEl.style.display = 'none';
        } else if (isPending) {
            badge.textContent = 'Pending Review';
            badge.className = 'acc-card-badge pending';
            verifiedEl.style.display = 'none';
            unverifiedEl.style.display = 'block';
            const kycCta = document.getElementById('startKycBtn');
            if (kycCta) kycCta.textContent = 'Verification In Review';
        } else {
            badge.textContent = 'Not Verified';
            badge.className = 'acc-card-badge unverified';
            verifiedEl.style.display = 'none';
            unverifiedEl.style.display = 'block';
        }
    }

    // ─── Booking Stats ────────────────────────────────────────────
    function renderBookingStats(bookings) {
        const total = bookings.length;
        const active = bookings.filter(b => getBookingStatus(b) === 'active').length;
        const completed = bookings.filter(b => getBookingStatus(b) === 'completed').length;
        const totalNights = bookings.reduce((sum, b) => sum + calcNights(b.startDate, b.endDate), 0);

        // Identity stats
        document.getElementById('statBookings').textContent = total;
        document.getElementById('statActive').textContent = active;
        document.getElementById('statNights').textContent = totalNights;

        // Overview card
        document.getElementById('ovTotal').textContent = total;
        document.getElementById('ovActive').textContent = active;
        document.getElementById('ovCompleted').textContent = completed;
    }

    // ─── Wallet Section ────────────────────────────────────────────
    function renderWallet() {
        const savedAddr = localStorage.getItem('walletAddress');
        const connectedEl = document.getElementById('walletConnected');
        const disconnectedEl = document.getElementById('walletDisconnected');
        const networkPill = document.getElementById('networkPill');

        if (savedAddr) {
            connectedEl.style.display = 'block';
            disconnectedEl.style.display = 'none';
            networkPill.style.display = 'flex';

            // Format address: 0x1234...5678
            const formatted = savedAddr.length > 12
                ? `${savedAddr.slice(0, 6)}···${savedAddr.slice(-6)}`
                : savedAddr;
            document.getElementById('walletAddrDisplay').textContent = formatted;
            document.getElementById('walletAddrDisplay').title = savedAddr;
        } else {
            connectedEl.style.display = 'none';
            disconnectedEl.style.display = 'block';
            networkPill.style.display = 'none';
        }
    }

    // ─── Copy Wallet Address ──────────────────────────────────────
    function setupCopyWallet() {
        const btn = document.getElementById('copyWalletBtn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const addr = localStorage.getItem('walletAddress') || '';
            try {
                await navigator.clipboard.writeText(addr);
                btn.classList.add('copied');
                showStatus('Address copied to clipboard', 'success');
                setTimeout(() => btn.classList.remove('copied'), 2000);
            } catch {
                showStatus('Could not copy address', 'error');
            }
        });
    }

    // ─── Wallet Connect (account page) ────────────────────────────
    function setupWalletConnect() {
        const connectBtn = document.getElementById('connectWalletAccountBtn');
        const disconnectBtn = document.getElementById('disconnectWalletBtn');

        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                connectBtn.disabled = true;
                connectBtn.textContent = 'Connecting…';

                try {
                    // Try to import app.js for MetaMask
                    const mod = await import('./app.js').catch(() => null);
                    if (mod && mod.connectWallet) {
                        const addr = await mod.connectWallet();
                        if (addr) {
                            localStorage.setItem('walletAddress', addr);
                            renderWallet();
                            showStatus('Wallet connected successfully', 'success');
                            return;
                        }
                    }
                    // Fallback: direct MetaMask request
                    if (window.ethereum) {
                        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                        if (accounts[0]) {
                            localStorage.setItem('walletAddress', accounts[0]);
                            renderWallet();
                            showStatus('Wallet connected', 'success');
                            return;
                        }
                    } else {
                        showStatus('MetaMask not detected. Please install MetaMask.', 'error');
                    }
                } catch (err) {
                    console.error('Wallet connect error:', err);
                    showStatus('Failed to connect wallet', 'error');
                } finally {
                    connectBtn.disabled = false;
                    connectBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
              <path d="M16 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" fill="currentColor"/>
            </svg>
            Connect MetaMask`;
                }
            });
        }

        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => {
                if (!confirm('Disconnect your wallet from this account?')) return;
                localStorage.removeItem('walletAddress');
                renderWallet();
                showStatus('Wallet disconnected', 'info');
            });
        }
    }

    // ─── Password Change Modal ────────────────────────────────────
    function setupPasswordModal() {
        const changeBtn = document.getElementById('changePasswordBtn');
        const overlay = document.getElementById('passwordModalOverlay');
        const closeBtn = document.getElementById('closePasswordModal');
        const cancelBtn = document.getElementById('cancelPasswordBtn');
        const saveBtn = document.getElementById('savePasswordBtn');

        const open = () => { overlay.classList.add('open'); };
        const close = () => {
            overlay.classList.remove('open');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        };

        changeBtn?.addEventListener('click', open);
        closeBtn?.addEventListener('click', close);
        cancelBtn?.addEventListener('click', close);
        overlay?.addEventListener('click', e => { if (e.target === overlay) close(); });

        saveBtn?.addEventListener('click', async () => {
            const current = document.getElementById('currentPassword').value;
            const next = document.getElementById('newPassword').value;
            const confirm = document.getElementById('confirmPassword').value;

            if (!current || !next || !confirm) { showStatus('Please fill in all fields', 'error'); return; }
            if (next !== confirm) { showStatus('New passwords do not match', 'error'); return; }
            if (next.length < 8) { showStatus('Password must be at least 8 characters', 'error'); return; }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Updating…';

            try {
                const res = await fetch(`${API_BASE}/api/auth/change-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({ currentPassword: current, newPassword: next })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update password');
                showStatus('Password updated successfully', 'success');
                close();
            } catch (err) {
                showStatus(err.message || 'Could not update password', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Update Password';
            }
        });
    }

    // ─── KYC Button ──────────────────────────────────────────────
    function setupKyc() {
        const btn = document.getElementById('startKycBtn');
        btn?.addEventListener('click', () => {
            // Placeholder: navigate to KYC flow or open external link
            showStatus('KYC verification coming soon. Contact support to get verified.', 'info');
        });
    }

    // ─── Member Controls ─────────────────────────────────────────
    function setupMemberControls() {
        // Logout
        document.getElementById('logoutAccountBtn')?.addEventListener('click', () => {
            if (!confirm('Sign out of your account?')) return;
            logout();
        });

        // Logout from navbar (if nav.js is loaded)
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (!confirm('Log out?')) return;
            logout();
        });

        // Deactivate
        document.getElementById('deactivateBtn')?.addEventListener('click', () => {
            if (!confirm('Deactivate your account? You can reactivate by signing back in.')) return;
            showStatus('Account deactivation is not yet available. Please contact support.', 'info');
        });

        // Delete
        document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
            const confirmed = confirm(
                'PERMANENT ACTION: Delete your account and all data?\n\nThis cannot be undone. Type your email to confirm in the next step.'
            );
            if (!confirmed) return;
            const email = prompt('Enter your email address to confirm deletion:');
            if (!email || email.trim().toLowerCase() !== (_user?.email || '').toLowerCase()) {
                showStatus('Email did not match. Account not deleted.', 'error');
                return;
            }
            showStatus('Account deletion is not yet available. Please contact support.', 'info');
        });

        // Edit Profile
        document.getElementById('editProfileBtn')?.addEventListener('click', () => {
            showStatus('Profile editing coming soon.', 'info');
        });
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    }

    // ─── Fetch Bookings ───────────────────────────────────────────
    async function fetchBookings() {
        try {
            const res = await fetch(`${API_BASE}/api/book/my`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.bookings || [];
        } catch { return []; }
    }

    // ─── Fetch User Profile ────────────────────────────────────────
    async function fetchUserProfile() {
        // Try the profile endpoint
        try {
            const res = await fetch(`${API_BASE}/api/auth/profile`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                return data.user || data;
            }
        } catch { /* fall through */ }

        // Fallback: decode from token
        const token = getToken();
        const payload = decodeToken(token);
        if (payload) {
            return {
                _id: payload.id || payload._id || payload.userId,
                name: payload.name || payload.username,
                email: payload.email,
                kycStatus: payload.kycStatus || payload.kyc,
                createdAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null
            };
        }

        // Fallback: from localStorage
        try {
            const stored = JSON.parse(localStorage.getItem('loggedInUser') || 'null');
            return stored;
        } catch { return null; }
    }

    // ─── INIT ─────────────────────────────────────────────────────
    async function init() {
        const dashboard = document.getElementById('accountDashboard');
        const loginPrompt = document.getElementById('loginPrompt');

        if (!isLoggedIn()) {
            loginPrompt.style.display = 'flex';
            dashboard.style.display = 'none';
            return;
        }

        loginPrompt.style.display = 'none';
        dashboard.style.display = 'block';

        // Load user & bookings in parallel
        const [user, bookings] = await Promise.all([
            fetchUserProfile(),
            fetchBookings()
        ]);

        if (!user) {
            showStatus('Could not load profile. Please sign in again.', 'error');
            setTimeout(logout, 2000);
            return;
        }

        _user = user;
        _bookings = bookings;

        renderIdentity(user);
        renderInfoCard(user);
        renderKyc(user);
        renderBookingStats(bookings);
        renderWallet();

        setupCopyWallet();
        setupWalletConnect();
        setupPasswordModal();
        setupKyc();
        setupMemberControls();
    }

    // ─── DOMContentLoaded ─────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();