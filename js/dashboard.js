// dashboard.js — Dynamic dashboard logic
(function () {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://alina906vibes-backend.onrender.com';

    /* ─── JWT Helpers ─── */
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
        if (p.exp && p.exp < Math.floor(Date.now() / 1000)) { localStorage.removeItem('userToken'); return false; }
        return true;
    }

    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name[0].toUpperCase();
    }

    function authHeaders() {
        return { 'Authorization': `Bearer ${localStorage.getItem('userToken')}`, 'Content-Type': 'application/json' };
    }

    /* ─── Auth Guard ─── */
    const token = localStorage.getItem('userToken');
    if (!token || !isTokenValid(token)) {
        window.location.href = 'login.html?redirect=dashboard.html';
        return;
    }

    /* ─── Format Helpers ─── */
    function fmtDate(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    function fmtDateShort(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /* ─── State ─── */
    let currentUser = null;
    let userBookings = [];

    /* ─── Boot ─── */
    document.addEventListener('DOMContentLoaded', async () => {
        await loadUserProfile();
        await loadBookings();
        wireNavigation();
        wireQuickActions();
        wireSidebarToggle();
    });

    /* ─── Load User Profile ─── */
    async function loadUserProfile() {
        try {
            const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
            if (!res.ok) throw new Error('Failed');
            currentUser = await res.json();
            renderUserProfile();
        } catch {
            // fallback: decode from JWT
            const p = decodeJwt(token);
            currentUser = { name: p?.name || p?.email || 'User', email: p?.email || '', kycStatus: 'pending', twoFactorEnabled: false };
            renderUserProfile();
        }
    }

    function renderUserProfile() {
        const u = currentUser;
        const initials = getInitials(u.name);
        const firstName = u.name?.split(' ')[0] || 'there';

        // Sidebar user
        document.getElementById('sidebarAvatar').textContent = initials;
        document.getElementById('sidebarName').textContent = u.name;
        document.getElementById('sidebarEmail').textContent = u.email;

        // Welcome
        document.getElementById('welcomeName').textContent = `Welcome back, ${firstName}.`;

        // Badge
        const badge = document.getElementById('verifiedBadge');
        if (u.kycStatus === 'approved' || u.kycStatus === 'verified') {
            badge.textContent = '✦ Verified Member';
        } else {
            badge.textContent = '✦ Member';
            badge.style.opacity = '0.6';
        }
    }

    /* ─── Load Bookings ─── */
    async function loadBookings() {
        try {
            const res = await fetch(`${API_BASE}/api/book/my`, { headers: authHeaders() });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            userBookings = data.bookings || [];
        } catch { userBookings = []; }
        renderStats();
        renderActiveStay();
        renderBookingHistory();
    }

    function getBookingStatus(b) {
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const start = new Date(b.startDate); start.setHours(0, 0, 0, 0);
        const end = new Date(b.endDate); end.setHours(0, 0, 0, 0);
        if (b.paymentStatus === 'cancelled') return 'cancelled';
        if (now >= start && now < end) return 'active';
        if (now < start) return 'upcoming';
        return 'completed';
    }

    function renderStats() {
        const active = userBookings.filter(b => getBookingStatus(b) === 'active');
        const totalNights = userBookings.reduce((sum, b) => sum + (b.nights || 0), 0);

        document.getElementById('statActiveCount').textContent = active.length;
        document.getElementById('statActiveDetail').textContent = active.length > 0
            ? `${active[0].unitId?.name || 'Unit'} · Until ${fmtDateShort(active[0].endDate)}`
            : 'No active booking';

        document.getElementById('statTotalStays').textContent = userBookings.length;
        const earliest = userBookings.length > 0
            ? new Date(Math.min(...userBookings.map(b => new Date(b.createdAt)))).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : '—';
        document.getElementById('statStaysDetail').textContent = userBookings.length > 0 ? `Since ${earliest}` : 'No stays yet';

        document.getElementById('statNights').textContent = totalNights;
        document.getElementById('statNightsDetail').textContent = totalNights > 0 ? 'Across all stays' : 'No nights yet';
    }

    function renderActiveStay() {
        const container = document.getElementById('activeStayCard');
        const active = userBookings.find(b => getBookingStatus(b) === 'active');

        if (!active) { container.style.display = 'none'; return; }
        container.style.display = '';

        document.getElementById('activeUnitName').textContent = active.unitId?.name || 'Your Unit';
        document.getElementById('activeUnitSub').textContent = `${active.nights || '—'} nights · ${active.paymentMethod || 'Paid'}`;
        document.getElementById('activeCheckin').textContent = fmtDate(active.startDate);
        document.getElementById('activeCheckout').textContent = fmtDate(active.endDate);
        document.getElementById('activeNights').textContent = active.nights || '—';

        const codeEl = document.getElementById('activeCode');
        const codeBtn = document.getElementById('copyCodeBtn');
        if (active.accessCode) {
            codeEl.textContent = active.accessCode;
            codeBtn.onclick = () => { navigator.clipboard.writeText(active.accessCode); codeBtn.textContent = 'Copied!'; setTimeout(() => codeBtn.textContent = 'Copy Code', 2000); };
        } else {
            codeEl.textContent = '— — — —';
            codeBtn.style.display = 'none';
        }

        const statusEl = document.getElementById('activeStatus');
        statusEl.innerHTML = '<span style="color:var(--green-bright)">● Active</span>';
    }

    function renderBookingHistory() {
        const list = document.getElementById('bookingsList');
        list.innerHTML = '';

        if (userBookings.length === 0) {
            list.innerHTML = '<div style="padding:28px;text-align:center;color:var(--text-muted);font-size:14px;">No bookings yet. <a href="index.html" style="color:var(--green-accent)">Browse units</a></div>';
            return;
        }

        const icons = ['🏢', '🌿', '🏙️', '🏠', '✨'];
        userBookings.forEach((b, i) => {
            const status = getBookingStatus(b);
            const statusClass = status === 'active' ? 'status-active' : status === 'upcoming' ? 'status-upcoming' : 'status-past';
            const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

            const item = document.createElement('div');
            item.className = 'booking-item';
            item.innerHTML = `
        <div class="booking-img">${icons[i % icons.length]}</div>
        <div class="booking-info">
          <div class="booking-name">${b.unitId?.name || 'Booking'}</div>
          <div class="booking-dates">${fmtDateShort(b.startDate)} – ${fmtDateShort(b.endDate)}, ${new Date(b.endDate).getFullYear()}</div>
        </div>
        <div class="booking-status ${statusClass}">${statusLabel}</div>`;
            list.appendChild(item);
        });
    }

    /* ─── Sidebar Navigation ─── */
    function wireNavigation() {
        document.querySelectorAll('.nav-item[data-action]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                const action = el.dataset.action;
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                el.classList.add('active');
                if (action === 'dashboard') { closePanels(); showDashboard(); }
                else if (action === 'profile') openModal('profileModal');
                else if (action === 'payments') openModal('passwordModal');
                else if (action === 'security') openModal('securityModal');
                else if (action === 'signout') handleSignOut();
                else if (action === 'settings') openModal('settingsModal');
                else if (action === 'bookings') window.location.href = 'my_booking.html';
                else if (action === 'browse') window.location.href = 'index.html';
                else if (action === 'contact') window.location.href = 'contact.html';
                else if (action === 'notifications') showToast('No new notifications');

                // Close sidebar after navigation on mobile
                if (window.innerWidth <= 900) {
                    document.body.classList.remove('sidebar-open');
                }
            });
        });
    }

    function wireSidebarToggle() {
        const toggle = document.getElementById('sidebarToggle');
        const backdrop = document.getElementById('sidebarBackdrop');

        if (toggle) {
            toggle.addEventListener('click', () => {
                document.body.classList.toggle('sidebar-open');
            });
        }

        if (backdrop) {
            backdrop.addEventListener('click', () => {
                document.body.classList.remove('sidebar-open');
            });
        }
    }

    function closePanels() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); }
    function showDashboard() { /* already visible */ }

    /* ─── Quick Actions ─── */
    function wireQuickActions() {
        document.querySelectorAll('.action-btn[data-action]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                const action = el.dataset.action;
                if (action === 'new-booking') window.location.href = 'index.html';
                else if (action === 'change-password') openModal('passwordModal');
                else if (action === 'contact-host') window.location.href = 'contact.html';
                else if (action === 'leave-review') showToast('Review feature coming soon');
                else if (action === 'view-invoice') showToast('Invoice feature coming soon');
                else if (action === 'documents') showToast('Documents feature coming soon');
            });
        });
    }

    /* ─── Modal System ─── */
    function openModal(id) {
        closePanels();
        const m = document.getElementById(id);
        if (m) { m.classList.add('open'); if (id === 'profileModal') populateProfileForm(); if (id === 'securityModal') populateSecurityPanel(); }
    }

    document.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) closePanels();
        if (e.target.classList.contains('modal-close-btn')) closePanels();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });

    /* ─── Edit Profile ─── */
    function populateProfileForm() {
        if (!currentUser) return;
        document.getElementById('editName').value = currentUser.name || '';
        document.getElementById('editEmail').value = currentUser.email || '';
    }

    window.handleProfileSave = async function () {
        const name = document.getElementById('editName').value.trim();
        const email = document.getElementById('editEmail').value.trim();
        const btn = document.getElementById('profileSaveBtn');
        const msg = document.getElementById('profileMsg');

        if (!name) { msg.textContent = 'Name is required'; msg.className = 'modal-msg error'; return; }

        btn.disabled = true; btn.textContent = 'Saving…';
        try {
            const res = await fetch(`${API_BASE}/api/auth/profile`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ name, email }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            if (data.token) { localStorage.setItem('userToken', data.token); localStorage.setItem('token', data.token); }
            currentUser.name = data.name; currentUser.email = data.email;
            renderUserProfile();
            msg.textContent = 'Profile updated!'; msg.className = 'modal-msg success';
            setTimeout(closePanels, 1200);
        } catch (err) { msg.textContent = err.message; msg.className = 'modal-msg error'; }
        finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
    };

    /* ─── Change Password ─── */
    window.handlePasswordChange = async function () {
        const cur = document.getElementById('currentPw').value;
        const nw = document.getElementById('newPw').value;
        const conf = document.getElementById('confirmPw').value;
        const btn = document.getElementById('pwSaveBtn');
        const msg = document.getElementById('pwMsg');

        if (!cur || !nw) { msg.textContent = 'All fields required'; msg.className = 'modal-msg error'; return; }
        if (nw !== conf) { msg.textContent = 'Passwords do not match'; msg.className = 'modal-msg error'; return; }
        if (nw.length < 6) { msg.textContent = 'Min 6 characters'; msg.className = 'modal-msg error'; return; }

        btn.disabled = true; btn.textContent = 'Saving…';
        try {
            const res = await fetch(`${API_BASE}/api/auth/change-password`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            msg.textContent = 'Password changed!'; msg.className = 'modal-msg success';
            document.getElementById('currentPw').value = ''; document.getElementById('newPw').value = ''; document.getElementById('confirmPw').value = '';
            setTimeout(closePanels, 1200);
        } catch (err) { msg.textContent = err.message; msg.className = 'modal-msg error'; }
        finally { btn.disabled = false; btn.textContent = 'Update Password'; }
    };

    /* ─── 2FA ─── */
    function populateSecurityPanel() {
        const panel = document.getElementById('twoFaContent');
        if (!currentUser) return;
        if (currentUser.twoFactorEnabled) {
            panel.innerHTML = `
        <div class="twofa-status enabled"><span>🛡️</span> Two-factor authentication is <strong>enabled</strong></div>
        <p style="font-size:13px;color:var(--text-muted);margin:12px 0 20px;">Your account is protected with an authenticator app.</p>
        <input type="password" id="disable2faPw" class="modal-input" placeholder="Enter password to disable" />
        <div id="twoFaMsg" class="modal-msg"></div>
        <button class="modal-btn danger" onclick="handleDisable2FA()">Disable 2FA</button>`;
        } else {
            panel.innerHTML = `
        <div class="twofa-status disabled"><span>🔓</span> Two-factor authentication is <strong>not enabled</strong></div>
        <p style="font-size:13px;color:var(--text-muted);margin:12px 0 20px;">Add an extra layer of security using an authenticator app.</p>
        <div id="twoFaMsg" class="modal-msg"></div>
        <button class="modal-btn" id="setup2faBtn" onclick="handleEnable2FA()">Set Up 2FA</button>`;
        }
    }

    window.handleEnable2FA = async function () {
        const msg = document.getElementById('twoFaMsg');
        const btn = document.getElementById('setup2faBtn');
        btn.disabled = true; btn.textContent = 'Generating…';
        try {
            const res = await fetch(`${API_BASE}/api/auth/enable-2fa`, { method: 'POST', headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            const panel = document.getElementById('twoFaContent');
            panel.innerHTML = `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):</p>
        <div style="text-align:center;margin:16px 0;"><img src="${data.qrCode}" style="width:200px;height:200px;border-radius:12px;border:1px solid var(--cream-dark);" /></div>
        <p style="font-size:11px;color:var(--text-muted);text-align:center;margin-bottom:16px;word-break:break-all;">Manual key: <strong>${data.secret}</strong></p>
        <input type="text" id="verify2faCode" class="modal-input" placeholder="Enter 6-digit code" maxlength="6" style="text-align:center;letter-spacing:0.3em;font-size:20px;" />
        <div id="twoFaMsg" class="modal-msg"></div>
        <button class="modal-btn" onclick="handleVerify2FA()">Verify & Enable</button>`;
        } catch (err) { msg.textContent = err.message; msg.className = 'modal-msg error'; btn.disabled = false; btn.textContent = 'Set Up 2FA'; }
    };

    window.handleVerify2FA = async function () {
        const code = document.getElementById('verify2faCode').value.trim();
        const msg = document.getElementById('twoFaMsg');
        if (!code || code.length !== 6) { msg.textContent = 'Enter a 6-digit code'; msg.className = 'modal-msg error'; return; }
        try {
            const res = await fetch(`${API_BASE}/api/auth/verify-2fa`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ token: code }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            currentUser.twoFactorEnabled = true;
            msg.textContent = '2FA enabled!'; msg.className = 'modal-msg success';
            setTimeout(() => populateSecurityPanel(), 1500);
        } catch (err) { msg.textContent = err.message; msg.className = 'modal-msg error'; }
    };

    window.handleDisable2FA = async function () {
        const pw = document.getElementById('disable2faPw').value;
        const msg = document.getElementById('twoFaMsg');
        if (!pw) { msg.textContent = 'Password required'; msg.className = 'modal-msg error'; return; }
        try {
            const res = await fetch(`${API_BASE}/api/auth/disable-2fa`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ password: pw }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            currentUser.twoFactorEnabled = false;
            msg.textContent = '2FA disabled'; msg.className = 'modal-msg success';
            setTimeout(() => populateSecurityPanel(), 1500);
        } catch (err) { msg.textContent = err.message; msg.className = 'modal-msg error'; }
    };

    /* ─── Sign Out ─── */
    function handleSignOut() {
        localStorage.removeItem('userToken');
        localStorage.removeItem('token');
        localStorage.removeItem('walletAddress');
        localStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    }

    /* ─── Deactivate Account ─── */
    window.handleDeactivate = async function () {
        const pw = document.getElementById('deactivatePw').value;
        const msg = document.getElementById('settingsMsg');
        if (!pw) { msg.textContent = 'Password required'; msg.className = 'modal-msg error'; return; }
        try {
            const res = await fetch(`${API_BASE}/api/auth/deactivate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ password: pw }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            msg.textContent = 'Account deactivated. Redirecting…'; msg.className = 'modal-msg success';
            setTimeout(handleSignOut, 1500);
        } catch (err) { msg.textContent = err.message; msg.className = 'modal-msg error'; }
    };

    /* ─── Delete Account ─── */
    window.handleDeleteAccount = async function () {
        const pw = document.getElementById('deletePw').value;
        const conf = document.getElementById('deleteConfirm').value;
        const msg = document.getElementById('deleteMsg');
        if (!pw) { msg.textContent = 'Password required'; msg.className = 'modal-msg error'; return; }
        if (conf !== 'DELETE') { msg.textContent = 'Type DELETE to confirm'; msg.className = 'modal-msg error'; return; }
        try {
            const res = await fetch(`${API_BASE}/api/auth/delete-account`, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ password: pw }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            msg.textContent = 'Account deleted. Redirecting…'; msg.className = 'modal-msg success';
            setTimeout(handleSignOut, 1500);
        } catch (err) { msg.textContent = err.message; msg.className = 'modal-msg error'; }
    };

    /* ─── Toast ─── */
    function showToast(message) {
        let t = document.getElementById('dashToast');
        if (!t) { t = document.createElement('div'); t.id = 'dashToast'; document.body.appendChild(t); }
        t.textContent = message; t.className = 'toast show';
        setTimeout(() => t.className = 'toast', 3000);
    }
})();