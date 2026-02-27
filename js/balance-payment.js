// ============================================================
//  balance-payment.js
//  Self-contained balance payment handler for my_booking.html
//
//  Extracted from booking.js so my_booking.html can run the
//  full payment flow without loading the entire booking page.
//
//  Supports: M-Pesa · Paystack (Card) · Crypto (MetaMask)
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const BP_API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://alina906vibes-backend.onrender.com';

// M-Pesa hits the same base URL in booking.js (MPESA_BASE)
const BP_MPESA_BASE = BP_API_BASE;

const BP_TOKEN_KEY = 'userToken';
const BP_FIXED_DEPOSIT = 5; // USD — must match booking.js & backend

// ── TRANSACTION COOLDOWN (crypto) ───────────────────────────
let bp_lastTxTime = 0;
const BP_TX_COOLDOWN = 10_000; // 10 s

// ── WALLET STATE (lazy-loaded from app.js exports) ──────────
// We import dynamically so the module works even if MetaMask is absent.
let _walletModule = null;
async function getWalletModule() {
    if (_walletModule) return _walletModule;
    try {
        _walletModule = await import('./app.js');
    } catch (e) {
        console.warn('bp: app.js not available – crypto disabled', e);
        _walletModule = {};
    }
    return _walletModule;
}

// ── STATUS HELPER ────────────────────────────────────────────
function bp_showStatus(msg, type = 'info') {
    // Delegate to the host page's showStatus if available
    if (typeof window.showStatus === 'function') {
        window.showStatus(msg, type);
        return;
    }
    // Fallback: look for #pageStatus (my_booking.html)
    const el = document.getElementById('pageStatus');
    if (!el) { console.log(`[bp] ${type}: ${msg}`); return; }

    el.classList.remove('show', 'text-danger', 'text-success', 'text-muted');
    el.textContent = msg;
    void el.offsetHeight;
    el.classList.add(type === 'error' ? 'text-danger' : type === 'success' ? 'text-success' : 'text-muted');
    el.classList.add('show');
    if (window._bpStatusT) clearTimeout(window._bpStatusT);
    window._bpStatusT = setTimeout(() => el.classList.remove('show'), type === 'success' ? 5000 : 7000);
}

function bp_getToken() {
    return localStorage.getItem(BP_TOKEN_KEY);
}

function bp_normalizePhone(phone) {
    phone = (phone || '').trim();
    if (!phone.startsWith('+')) {
        if (phone.startsWith('254')) phone = '+' + phone;
        else if (phone.startsWith('0')) phone = '+254' + phone.slice(1);
        else phone = '+254' + phone;
    }
    return phone;
}


// ── MODAL ──────────────────────────────────────────────────────
// Creates a lightweight popup so the user can choose payment method
// and enter phone / email without leaving my_booking.html.

function bp_openModal(booking) {
    // Remove stale modal if any
    document.getElementById('bp-modal-overlay')?.remove();

    const unit = booking.unitId || {};
    const total = booking.fullAmount || booking.totalPrice || 0;
    const balanceDue = Math.max(total - BP_FIXED_DEPOSIT, 0);
    const method = (booking.paymentMethod || 'mpesa').toLowerCase();

    const isMpesa = method === 'mpesa';
    const isCrypto = method === 'crypto';
    const isPaystack = method === 'visa' || method === 'paystack';

    // Build inner form HTML based on original payment method
    let methodHTML = '';
    if (isMpesa) {
        methodHTML = `
      <div class="bp-field">
        <label>M-Pesa Number</label>
        <input id="bp-phone" type="tel"
               value="${bp_normalizePhone(booking.guestPhone || '')}"
               placeholder="07XXXXXXXX" />
        <small>STK push will be sent to this number.</small>
      </div>`;
    } else if (isPaystack) {
        methodHTML = `
      <div class="bp-field">
        <label>Email for receipt</label>
        <input id="bp-email" type="email" placeholder="you@example.com" />
        <small>You'll be redirected to Paystack checkout.</small>
      </div>`;
    } else if (isCrypto) {
        methodHTML = `
      <div class="bp-crypto-notice">
        <span>🦊</span>
        <p>Connect MetaMask to pay on <strong>Polygon Amoy</strong>.</p>
        <button id="bp-connect-wallet" class="bp-btn-secondary">Connect Wallet</button>
        <div id="bp-wallet-status" style="font-size:0.8rem;color:#6b7280;margin-top:6px;"></div>
      </div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'bp-modal-overlay';
    overlay.innerHTML = `
    <div class="bp-modal" role="dialog" aria-modal="true" aria-label="Pay Balance">
      <div class="bp-modal-header">
        <div>
          <div class="bp-modal-title">Pay Remaining Balance</div>
          <div class="bp-modal-subtitle">${unit.name || 'Rental Unit'}</div>
        </div>
        <button id="bp-modal-close" class="bp-close-btn" aria-label="Close">✕</button>
      </div>

      <div class="bp-amount-row">
        <div class="bp-amount-block">
          <div class="bp-amount-label">Balance Due</div>
          <div class="bp-amount-value">KES ${balanceDue.toFixed(2)}</div>
        </div>
        <div class="bp-method-badge">${bp_methodLabel(method)}</div>
      </div>

      <div id="bp-status-banner" class="bp-status-banner" style="display:none;"></div>

      ${methodHTML}

      <div class="bp-modal-actions">
        <button id="bp-pay-btn" class="bp-btn-primary">
          <span class="bp-btn-label">Pay KES ${balanceDue.toFixed(2)}</span>
          <span class="bp-spinner" style="display:none;">⏳</span>
        </button>
        <button id="bp-cancel-btn" class="bp-btn-secondary">Cancel</button>
      </div>
    </div>
  `;

    // Inject styles once
    if (!document.getElementById('bp-styles')) {
        const style = document.createElement('style');
        style.id = 'bp-styles';
        style.textContent = `
      #bp-modal-overlay {
        position:fixed;inset:0;z-index:3000;
        background:rgba(0,0,0,.55);backdrop-filter:blur(4px);
        display:flex;align-items:center;justify-content:center;padding:20px;
        animation:bpFadeIn .2s ease;
      }
      @keyframes bpFadeIn{from{opacity:0}to{opacity:1}}
      .bp-modal {
        background:#fff;border-radius:20px;max-width:460px;width:100%;
        box-shadow:0 16px 48px rgba(0,0,0,.18);
        animation:bpSlideIn .28s cubic-bezier(.22,1,.36,1);
        overflow:hidden;
      }
      @keyframes bpSlideIn{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
      .bp-modal-header {
        display:flex;align-items:flex-start;justify-content:space-between;
        padding:22px 24px 0;
      }
      .bp-modal-title{font-size:1.15rem;font-weight:800;color:#111827;line-height:1.2;}
      .bp-modal-subtitle{font-size:.82rem;color:#6b7280;margin-top:2px;}
      .bp-close-btn{
        width:34px;height:34px;border-radius:50%;border:none;background:#f3f4f6;
        font-size:.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;
        flex-shrink:0;transition:background .2s;
      }
      .bp-close-btn:hover{background:#e5e7eb;}
      .bp-amount-row{
        display:flex;align-items:center;justify-content:space-between;
        background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;
        margin:18px 24px 0;padding:14px 16px;
      }
      .bp-amount-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;}
      .bp-amount-value{font-size:1.35rem;font-weight:800;color:#065f46;margin-top:2px;}
      .bp-method-badge{
        font-size:.78rem;font-weight:700;padding:6px 14px;
        background:#fff;border:1.5px solid #d1fae5;border-radius:50px;color:#059669;
      }
      .bp-status-banner{
        margin:12px 24px 0;padding:10px 14px;border-radius:10px;
        font-size:.83rem;font-weight:600;
      }
      .bp-status-banner.error{background:#fee2e2;color:#991b1b;}
      .bp-status-banner.success{background:#d1fae5;color:#065f46;}
      .bp-status-banner.info{background:#dbeafe;color:#1e40af;}
      .bp-field{padding:16px 24px 0;}
      .bp-field label{display:block;font-size:.78rem;font-weight:700;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;}
      .bp-field input{
        width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:10px;
        font-size:.9rem;outline:none;transition:border-color .2s,box-shadow .2s;
        font-family:inherit;
      }
      .bp-field input:focus{border-color:#198754;box-shadow:0 0 0 3px rgba(25,135,84,.2);}
      .bp-field small{display:block;margin-top:5px;font-size:.73rem;color:#9ca3af;}
      .bp-crypto-notice{
        margin:16px 24px 0;padding:14px 16px;background:#f9fafb;
        border:1.5px solid #e5e7eb;border-radius:12px;text-align:center;
      }
      .bp-crypto-notice span{font-size:1.8rem;display:block;margin-bottom:6px;}
      .bp-crypto-notice p{font-size:.85rem;color:#374151;margin-bottom:10px;}
      .bp-modal-actions{display:flex;gap:10px;padding:20px 24px 24px;}
      .bp-btn-primary{
        flex:1;padding:13px;background:linear-gradient(135deg,#198754,#157347);
        color:#fff;border:none;border-radius:10px;font-size:.9rem;font-weight:700;
        cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;
        font-family:inherit;
      }
      .bp-btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 18px rgba(25,135,84,.35);}
      .bp-btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none;}
      .bp-btn-secondary{
        padding:13px 18px;background:#f9fafb;border:1.5px solid #e5e7eb;
        border-radius:10px;font-size:.85rem;font-weight:600;color:#6b7280;
        cursor:pointer;transition:all .2s;font-family:inherit;
      }
      .bp-btn-secondary:hover{border-color:#d1d5db;color:#374151;}
    `;
        document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

    // ── Wire up close ──
    const closeModal = () => overlay.remove();
    document.getElementById('bp-modal-close').addEventListener('click', closeModal);
    document.getElementById('bp-cancel-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // ── Wire up wallet connect (crypto only) ──
    if (isCrypto) {
        document.getElementById('bp-connect-wallet')?.addEventListener('click', async () => {
            const mod = await getWalletModule();
            if (!mod.connectWallet) { bp_modalStatus('MetaMask not available', 'error'); return; }
            const addr = await mod.connectWallet();
            if (addr) {
                localStorage.setItem('walletAddress', addr);
                document.getElementById('bp-wallet-status').textContent =
                    `Connected: ${addr.slice(0, 6)}…${addr.slice(-4)}`;
            }
        });

        // Show already-connected address
        const savedAddr = localStorage.getItem('walletAddress');
        if (savedAddr) {
            const ws = document.getElementById('bp-wallet-status');
            if (ws) ws.textContent = `Connected: ${savedAddr.slice(0, 6)}…${savedAddr.slice(-4)}`;
        }
    }

    // ── Wire up Pay button ──
    const payBtn = document.getElementById('bp-pay-btn');
    const bookingId = booking.bookingId || booking._id;
    const unitObj = booking.unitId || {};
    const unitId = unitObj._id || unitObj.id || booking.unitId;

    payBtn.addEventListener('click', async () => {
        bp_setPayBtnState(true);

        let phone = booking.guestPhone || '';
        if (isMpesa) {
            phone = document.getElementById('bp-phone')?.value || phone;
        }

        let email = null;
        if (isPaystack) {
            email = document.getElementById('bp-email')?.value?.trim() || null;
            if (!email) {
                bp_modalStatus('Please enter your email address', 'error');
                bp_setPayBtnState(false);
                return;
            }
        }

        let success = false;
        if (isMpesa) {
            success = await bp_mpesaBalance(bookingId, unitId, balanceDue, phone);
        } else if (isPaystack) {
            success = await bp_paystackBalance(bookingId, unitId, balanceDue, email);
        } else if (isCrypto) {
            success = await bp_cryptoBalance(bookingId, unitId, balanceDue, phone);
        }

        if (success) {
            closeModal();
            // Signal host page to refresh bookings list
            document.dispatchEvent(new CustomEvent('bp:payment-complete'));
        } else {
            bp_setPayBtnState(false);
        }
    });
}

function bp_setPayBtnState(loading) {
    const btn = document.getElementById('bp-pay-btn');
    const label = btn?.querySelector('.bp-btn-label');
    const spinner = btn?.querySelector('.bp-spinner');
    if (!btn) return;
    btn.disabled = loading;
    if (label) label.style.display = loading ? 'none' : '';
    if (spinner) spinner.style.display = loading ? 'inline' : 'none';
}

function bp_modalStatus(msg, type = 'info') {
    const el = document.getElementById('bp-status-banner');
    if (!el) { bp_showStatus(msg, type); return; }
    el.textContent = msg;
    el.className = `bp-status-banner ${type}`;
    el.style.display = 'block';
}

function bp_methodLabel(method) {
    const map = { mpesa: '📱 M-Pesa', visa: '💳 Card', paystack: '💳 Card', crypto: '🔗 Crypto' };
    return map[(method || '').toLowerCase()] || method;
}


// ── M-PESA BALANCE ───────────────────────────────────────────
async function bp_mpesaBalance(bookingId, unitId, balanceDue, guestPhone) {
    if (!guestPhone) {
        bp_modalStatus('Guest phone number is required', 'error');
        return false;
    }
    try {
        bp_modalStatus('Initiating M-Pesa STK push…', 'info');
        const normalizedPhone = bp_normalizePhone(guestPhone);

        const res = await fetch(`${BP_MPESA_BASE}/api/payments/mpesa/balance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bp_getToken()}`
            },
            body: JSON.stringify({ bookingId, guestPhone: normalizedPhone })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to initiate M-Pesa balance payment');

        bp_modalStatus('STK push sent. Approve payment on your phone…', 'info');
        const result = await bp_pollMpesaBalance(bookingId, data.bookingId);

        if (result) {
            bp_showStatus('✅ Balance payment received! Access code sent.', 'success');
            return true;
        }
        return false;
    } catch (err) {
        console.error('bp M-Pesa balance error:', err);
        bp_modalStatus(err.message || 'M-Pesa balance payment failed', 'error');
        return false;
    }
}

async function bp_pollMpesaBalance(originalBookingId, balanceBookingId) {
    const pollId = balanceBookingId || originalBookingId;
    let attempts = 0;
    const max = 40; // ~2 min

    while (attempts < max) {
        await new Promise(r => setTimeout(r, 3000));
        attempts++;
        try {
            const res = await fetch(`${BP_MPESA_BASE}/api/payments/mpesa/status/${pollId}`, {
                headers: { 'Authorization': `Bearer ${bp_getToken()}` }
            });
            const json = await res.json();
            const b = json.booking;

            if (json.success && b && (b.balancePaid === true || b.paymentStatus === 'confirmed')) {
                return { success: true, booking: b };
            }
            if (b?.status === 'cancelled' || b?.status === 'failed') {
                bp_modalStatus(`M-Pesa payment ${b.status}`, 'error');
                return null;
            }
            bp_modalStatus(`Waiting for confirmation… (${attempts}/${max})`, 'info');
        } catch (e) {
            console.warn(`bp poll attempt ${attempts}:`, e);
        }
    }
    bp_modalStatus('Payment not confirmed. Please contact support.', 'error');
    return null;
}


// ── PAYSTACK BALANCE ─────────────────────────────────────────
async function bp_paystackBalance(bookingId, unitId, balanceDue, email) {
    try {
        bp_modalStatus('Initializing Paystack…', 'info');

        // Use provided email or generate a fallback
        const resolvedEmail = email || `user${Date.now()}@alina906vibes.com`;

        const res = await fetch(`${BP_API_BASE}/api/payments/paystack/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bp_getToken()}`
            },
            body: JSON.stringify({
                backendBookingId: bookingId,  // ← existing booking, NOT creating new one
                amount: balanceDue,
                type: 'balance',              // ← tells backend this is a balance payment
                email: resolvedEmail
                // NOTE: unitId / startDate / endDate intentionally omitted —
                // the backend resolves everything from bookingId for type=balance
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to initialize Paystack balance payment');

        // Persist so we can verify after redirect back
        localStorage.setItem('pendingPaystackBalance', JSON.stringify({
            bookingId,
            unitId,
            timestamp: Date.now()
        }));

        bp_modalStatus('Redirecting to Paystack…', 'info');

        // Small delay so user sees the message, then redirect
        setTimeout(() => { window.location.href = data.authorization_url; }, 800);

        return true; // optimistic — page will redirect
    } catch (err) {
        console.error('bp Paystack balance error:', err);
        bp_modalStatus(err.message || 'Paystack balance payment failed', 'error');
        return false;
    }
}


// ── CRYPTO BALANCE ───────────────────────────────────────────
async function bp_cryptoBalance(bookingId, unitId, balanceDue, guestPhone) {
    const mod = await getWalletModule();
    const { isWalletConnected, getWalletAddress, payBalance, verifyCorrectNetwork, switchNetwork } = mod;

    if (!isWalletConnected || !isWalletConnected()) {
        bp_modalStatus('Please connect your MetaMask wallet first', 'error');
        return false;
    }

    const now = Date.now();
    if (now - bp_lastTxTime < BP_TX_COOLDOWN) {
        const wait = Math.ceil((BP_TX_COOLDOWN - (now - bp_lastTxTime)) / 1000);
        bp_modalStatus(`Please wait ${wait}s before next transaction`, 'error');
        return false;
    }

    try {
        bp_modalStatus('Checking network…', 'info');
        const correctNet = await verifyCorrectNetwork(80002);
        if (!correctNet) {
            bp_modalStatus('Please switch to Polygon Amoy (Chain ID 80002)', 'error');
            await switchNetwork?.('POLYGON_AMOY');
            return false;
        }

        bp_modalStatus('Processing crypto balance payment…', 'info');
        // skipOnChainCheck = false — always verify on-chain for balance
        const balanceTxHash = await payBalance(bookingId, balanceDue, false);

        if (!balanceTxHash) {
            bp_modalStatus('Balance payment cancelled', 'error');
            return false;
        }

        bp_lastTxTime = Date.now();
        bp_modalStatus('Transaction confirmed. Finalizing…', 'info');

        const res = await fetch(`${BP_API_BASE}/api/book/confirm-balance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bp_getToken()}`
            },
            body: JSON.stringify({
                bookingId,
                unitId,
                balanceTxHash,
                walletAddress: getWalletAddress(),
                guestPhone: bp_normalizePhone(guestPhone)
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Backend confirmation failed');

        bp_showStatus('✅ Balance paid! Access code sent to your phone.', 'success');
        return true;
    } catch (err) {
        console.error('bp Crypto balance error:', err);
        bp_modalStatus(err.message || 'Crypto balance payment failed', 'error');
        return false;
    }
}


// ── PAYSTACK CALLBACK HANDLER (my_booking.html entry point) ──
// Called on DOMContentLoaded to check if we're returning from Paystack.
export async function bp_checkPaystackCallback() {
    const params = new URLSearchParams(window.location.search);
    const trxref = params.get('trxref') || params.get('reference');
    const returnedId = params.get('bookingId');

    // Also check localStorage for pending balance payment
    let bookingId = returnedId;
    if (!bookingId) {
        try {
            const stored = JSON.parse(localStorage.getItem('pendingPaystackBalance') || 'null');
            if (stored && Date.now() - stored.timestamp < 10 * 60 * 1000) {
                bookingId = stored.bookingId;
            }
        } catch { /* ignore */ }
    }

    // Not a Paystack callback
    if (!bookingId && !trxref) return;

    const token = bp_getToken();
    if (!token) {
        bp_showStatus('Payment received! Please log in to view your booking.', 'success');
        return;
    }

    bp_showStatus('Verifying balance payment…', 'info');

    let confirmed = false;
    const max = 20;
    for (let i = 0; i < max && !confirmed; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
            const res = await fetch(`${BP_API_BASE}/api/book/my`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) break;
            const { bookings = [] } = await res.json();

            // Find our booking — look for balancePaid === true
            const b = bookings.find(b =>
                (b.bookingId === bookingId || b._id === bookingId) && b.balancePaid === true
            );

            if (b) {
                confirmed = true;
                localStorage.removeItem('pendingPaystackBalance');
                // Clean URL — keep only the page itself
                window.history.replaceState({}, '', window.location.pathname);
                bp_showStatus('✅ Balance payment confirmed! Booking fully paid.', 'success');
                // Trigger a refresh of the bookings list
                document.dispatchEvent(new CustomEvent('bp:payment-complete'));
            }
        } catch { /* continue polling */ }
    }

    if (!confirmed) {
        bp_showStatus('Could not verify balance payment. Check your bookings shortly.', 'error');
    }
}


// ── PUBLIC ENTRY POINT ────────────────────────────────────────
/**
 * Call this to open the balance payment modal for a booking object.
 * The booking object must have:
 *   - bookingId (or _id)
 *   - unitId (object or string)
 *   - paymentMethod  ('mpesa' | 'visa' | 'paystack' | 'crypto')
 *   - fullAmount (or totalPrice)
 *   - guestPhone
 *   - depositPaid: true
 *   - balancePaid: false
 */
export function openBalancePayment(booking) {
    if (!booking) { console.error('bp: no booking supplied'); return; }
    if (!booking.depositPaid) { bp_showStatus('Deposit not yet paid for this booking', 'error'); return; }
    if (booking.balancePaid) { bp_showStatus('Balance already paid for this booking', 'info'); return; }
    bp_openModal(booking);
}