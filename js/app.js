// ===============================
// app.js — Web3 & Two-Phase Payment Integration
// Desktop  → MetaMask extension (window.ethereum)
// Mobile (in-app browser) → window.ethereum (MetaMask / Trust Wallet)
// Mobile (regular browser) → WalletConnect v2  (universal bridge)
// ===============================

import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.7.0/+esm';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from './config.js';

// ===============================
// WalletConnect v2 — loaded lazily only when needed
// Project ID: free tier from https://cloud.walletconnect.com
// ===============================
const WC_PROJECT_ID = 'b56e18d47f5a2e4d7a92ce4d3b359c1a'; // replace with your own if needed
const WC_METADATA = {
  name: 'Alina906Vibes',
  description: 'Premium serviced apartments — crypto booking',
  url: window.location.origin,
  icons: [`${window.location.origin}/img/logo.png`],
};

// ===============================
// STATE
// ===============================
let provider = null;
let signer = null;
let contract = null;
let walletAddress = null;
let wcProvider = null;   // WalletConnect EthereumProvider instance

const POLYGON_AMOY = {
  chainId: '0x13882',       // 80002
  chainName: 'Polygon Amoy Testnet',
  nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  rpcUrls: ['https://rpc-amoy.polygon.technology/'],
  blockExplorerUrls: ['https://amoy.polygonscan.com/'],
};

const SUPPORTED_NETWORKS = {
  POLYGON_AMOY,
  POLYGON_MAINNET: {
    chainId: '0x89',
    chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com/'],
    blockExplorerUrls: ['https://polygonscan.com/'],
  },
};

// ===============================
// DEVICE / WALLET DETECTION
// ===============================

export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function hasInjectedWallet() {
  return typeof window.ethereum !== 'undefined';
}

// ===============================
// INTERNAL: connect once we have an EIP-1193 provider
// ===============================
async function _connectFromProvider(eip1193) {
  const accounts = await eip1193.request({ method: 'eth_requestAccounts' });
  walletAddress = accounts[0];
  provider = new ethers.BrowserProvider(eip1193);
  signer = await provider.getSigner();
  contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  eip1193.on('accountsChanged', handleAccountsChanged);
  eip1193.on('chainChanged', handleChainChanged);

  console.log('✅ Wallet connected:', walletAddress);
  await checkContractDeployment();
  return walletAddress;
}

// ===============================
// WALLETCONNECT v2 — lazy loader
// ===============================
async function loadWalletConnect() {
  if (wcProvider) return wcProvider;   // already created

  // Load the ESM bundle from CDN (no npm build step required)
  const { EthereumProvider } = await import(
    'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.17.0/+esm'
  );

  wcProvider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    metadata: WC_METADATA,
    showQrModal: true,               // shows the built-in Web3Modal QR
    chains: [80002],                 // Polygon Amoy
    optionalChains: [137],           // Polygon Mainnet optional
    rpcMap: {
      80002: 'https://rpc-amoy.polygon.technology/',
      137: 'https://polygon-rpc.com/',
    },
  });

  return wcProvider;
}

// ===============================
// WALLETCONNECT: show modal & connect
// ===============================
async function connectViaWalletConnect() {
  try {
    console.log('📡 Launching WalletConnect…');
    const wc = await loadWalletConnect();

    // If previously connected session exists, reuse it
    if (wc.session) {
      console.log('🔄 Reusing existing WalletConnect session');
      return await _connectFromProvider(wc);
    }

    // Open QR / deep-link modal
    await wc.connect();
    return await _connectFromProvider(wc);

  } catch (err) {
    if (err.message?.includes('User rejected') || err.message?.includes('Modal closed')) {
      console.warn('WalletConnect cancelled by user');
      return null;
    }
    console.error('WalletConnect failed:', err);
    throw err;
  }
}

// ===============================
// PUBLIC: connectWallet
// ===============================
export async function connectWallet() {
  console.log('📱 Device:', isMobileDevice() ? 'Mobile' : 'Desktop');
  console.log('🔍 Injected wallet:', hasInjectedWallet() ? 'yes' : 'no');

  // ── Path 1: injected wallet present (MetaMask extension on desktop,
  //            or MetaMask/Trust in-app browser on mobile) ──
  if (hasInjectedWallet()) {
    try {
      return await _connectFromProvider(window.ethereum);
    } catch (err) {
      console.error('Injected wallet connection failed:', err);
      if (err.code === 4001) {
        alert('Connection rejected — please approve the request in your wallet.');
      } else {
        alert('Failed to connect. Please try again.');
      }
      return null;
    }
  }

  // ── Path 2: mobile browser with no injected wallet → WalletConnect ──
  if (isMobileDevice()) {
    try {
      return await connectViaWalletConnect();
    } catch (err) {
      console.error('WalletConnect failed:', err);
      alert('Could not connect wallet. Please open this page inside your MetaMask or Trust Wallet app, or try the QR method again.');
      return null;
    }
  }

  // ── Path 3: desktop with no MetaMask extension ──
  alert('MetaMask is not installed. Please install the MetaMask browser extension.');
  window.open('https://metamask.io/download/', '_blank');
  return null;
}

// ===============================
// PUBLIC ACCESSORS
// ===============================
export function isWalletConnected() {
  return walletAddress !== null && contract !== null;
}

export function getWalletAddress() {
  return walletAddress;
}

export function disconnectWallet() {
  // Disconnect WalletConnect session if active
  if (wcProvider?.session) {
    wcProvider.disconnect().catch(() => { });
  }

  const eip1193 = wcProvider ?? window.ethereum;
  if (eip1193) {
    try { eip1193.removeListener('accountsChanged', handleAccountsChanged); } catch (_) { }
    try { eip1193.removeListener('chainChanged', handleChainChanged); } catch (_) { }
  }

  walletAddress = null;
  provider = null;
  signer = null;
  contract = null;
  console.log('✅ Wallet disconnected');
}

// ===============================
// EVENT HANDLERS
// ===============================
function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    disconnectWallet();
    window.location.reload();
  } else if (accounts[0] !== walletAddress) {
    walletAddress = accounts[0];
    window.location.reload();
  }
}

function handleChainChanged() {
  window.location.reload();
}

// ===============================
// TWO-PHASE PAYMENT: DEPOSIT
// ===============================
export async function payDeposit(bookingId, depositAmountUSD) {
  if (!isWalletConnected()) throw new Error('Wallet not connected');

  try {
    console.log('🔍 === DEPOSIT PAYMENT START ===');
    console.log('📝 Booking ID:', bookingId, '💵 USD:', depositAmountUSD);

    const backendBookingId = ethers.id(bookingId);

    // Guard against double-payment
    try {
      const payment = await contract.getPayment(backendBookingId);
      if (payment[7]) throw new Error('This booking already has a deposit on-chain. Contact support.');
    } catch (err) {
      if (err.message?.includes('already has a deposit')) throw err;
      if (!err.message?.includes('Booking does not exist')) {
        console.warn('⚠️ Could not verify on-chain status:', err.message);
      }
    }

    const weiAmount = await contract.getMaticAmountForUsd(depositAmountUSD);
    console.log('💰 Deposit:', ethers.formatEther(weiAmount), 'MATIC');

    const balance = await provider.getBalance(walletAddress);
    console.log('👛 Balance:', ethers.formatEther(balance), 'MATIC');

    let estimatedGas;
    try {
      estimatedGas = await contract.payDeposit.estimateGas(backendBookingId, { value: weiAmount });
    } catch {
      throw new Error('Transaction would fail — check MATIC balance, booking ID, and contract status.');
    }

    const totalNeeded = weiAmount + estimatedGas * BigInt(2_000_000_000);
    if (balance < totalNeeded) {
      throw new Error(`Insufficient balance. Need ${ethers.formatEther(totalNeeded)} MATIC, have ${ethers.formatEther(balance)} MATIC`);
    }

    console.log('📤 Sending deposit…');
    const tx = await contract.payDeposit(backendBookingId, {
      value: weiAmount,
      gasLimit: estimatedGas + BigInt(50_000),
    });
    console.log('📤 Tx sent:', tx.hash);
    const receipt = await tx.wait(2);
    console.log('✅ Deposit confirmed:', receipt.hash);
    return receipt.hash;

  } catch (err) {
    console.error('❌ Deposit failed:', err);
    const msg = _friendlyError(err, 'Deposit payment failed');
    alert(msg);
    return null;
  }
}

// ===============================
// TWO-PHASE PAYMENT: BALANCE
// ===============================
export async function payBalance(bookingId, balanceAmountUSD, skipOnChainCheck = false) {
  if (!isWalletConnected()) throw new Error('Wallet not connected');

  try {
    console.log('🔍 === BALANCE PAYMENT START ===');
    const backendBookingId = ethers.id(bookingId);

    if (!skipOnChainCheck) {
      try {
        const payment = await contract.getPayment(backendBookingId);
        if (!payment[7]) throw new Error('Deposit must be paid before balance payment');
        if (payment[8]) throw new Error('Balance has already been paid for this booking');
      } catch (err) {
        if (err.message?.includes('Booking does not exist')) {
          console.warn('No on-chain record — assuming M-Pesa booking, continuing');
        } else {
          throw err;
        }
      }
    }

    const weiAmount = await contract.getMaticAmountForUsd(balanceAmountUSD);
    const balance = await provider.getBalance(walletAddress);
    if (balance < weiAmount) {
      throw new Error(`Insufficient balance. Need ${ethers.formatEther(weiAmount)} MATIC, have ${ethers.formatEther(balance)} MATIC`);
    }

    console.log('📤 Sending balance…');
    const tx = await contract.payBalance(backendBookingId, {
      value: weiAmount,
      gasLimit: 500_000,
    });
    console.log('📤 Tx sent:', tx.hash);
    const receipt = await tx.wait(2);
    console.log('✅ Balance confirmed:', receipt.hash);
    return receipt.hash;

  } catch (err) {
    console.error('❌ Balance failed:', err);
    const msg = _friendlyError(err, 'Balance payment failed');
    alert(msg);
    return null;
  }
}

// ===============================
// CONTRACT READ FUNCTIONS
// ===============================
export async function getPayment(bookingId) {
  if (!isWalletConnected()) throw new Error('Wallet not connected');
  const backendBookingId = ethers.id(bookingId);
  const p = await contract.getPayment(backendBookingId);
  return {
    renter: p[0],
    depositAmount: ethers.formatEther(p[1]),
    balanceAmount: ethers.formatEther(p[2]),
    refundedAmount: ethers.formatEther(p[3]),
    depositPaidAt: new Date(Number(p[4]) * 1000),
    balancePaidAt: Number(p[5]) > 0 ? new Date(Number(p[5]) * 1000) : null,
    lastRefundAt: Number(p[6]) > 0 ? new Date(Number(p[6]) * 1000) : null,
    depositPaid: p[7],
    balancePaid: p[8],
    remainingRefundable: ethers.formatEther(p[9]),
  };
}

export async function getRemainingRefundable(bookingId) {
  if (!isWalletConnected()) throw new Error('Wallet not connected');
  try {
    const remaining = await contract.getRemainingRefundable(ethers.id(bookingId));
    return ethers.formatEther(remaining);
  } catch { return '0'; }
}

export async function getMaticPerUSD() {
  if (!isWalletConnected()) throw new Error('Wallet not connected');
  try {
    return ethers.formatEther(await contract.maticPerUSD());
  } catch { return '0'; }
}

export async function getNetworkInfo() {
  if (!provider) throw new Error('Provider not initialized');
  const network = await provider.getNetwork();
  const balance = await provider.getBalance(walletAddress);
  return {
    chainId: Number(network.chainId),
    chainIdHex: '0x' + network.chainId.toString(16),
    name: network.name,
    balance: ethers.formatEther(balance),
    address: walletAddress,
  };
}

// ===============================
// NETWORK MANAGEMENT
// ===============================
export async function switchNetwork(networkKey = 'POLYGON_AMOY') {
  const eip1193 = wcProvider ?? window.ethereum;
  if (!eip1193) throw new Error('No wallet connected');

  const network = SUPPORTED_NETWORKS[networkKey];
  if (!network) throw new Error('Unsupported network');

  try {
    await eip1193.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.chainId }] });
    console.log('✅ Switched to', network.chainName);
    return true;
  } catch (err) {
    if (err.code === 4902) {
      await eip1193.request({ method: 'wallet_addEthereumChain', params: [network] });
      return true;
    }
    throw err;
  }
}

export async function verifyCorrectNetwork(expectedChainId = 80002) {
  if (!provider) return false;
  try {
    const network = await provider.getNetwork();
    const ok = Number(network.chainId) === expectedChainId;
    if (!ok) console.warn(`⚠️ Wrong network. Expected ${expectedChainId}, got ${Number(network.chainId)}`);
    return ok;
  } catch { return false; }
}

// ===============================
// UTILITIES
// ===============================
export async function checkContractDeployment() {
  if (!provider) return false;
  try {
    const code = await provider.getCode(CONTRACT_ADDRESS);
    const ok = code !== '0x' && code !== '0x0';
    console.log(ok ? '✅ Contract deployed' : '❌ No contract at address', CONTRACT_ADDRESS);
    return ok;
  } catch { return false; }
}

export function formatMaticAmount(weiAmount) {
  try { return ethers.formatEther(weiAmount); } catch { return '0'; }
}

export function parseMaticAmount(etherAmount) {
  try { return ethers.parseEther(etherAmount.toString()); } catch { return 0n; }
}

export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// ===============================
// AUTO-CONNECT
// ===============================
export async function autoConnect() {
  // Only attempt auto-connect for injected wallets (avoids WC popup on page load)
  if (!hasInjectedWallet()) return false;

  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts.length > 0) {
      console.log('🔄 Auto-connecting…');
      await _connectFromProvider(window.ethereum);
      await verifyCorrectNetwork();
      return true;
    }
  } catch (err) {
    console.error('Auto-connect failed:', err);
  }
  return false;
}

// ===============================
// TRANSACTION HELPERS
// ===============================
export async function waitForTransaction(txHash, confirmations = 2) {
  if (!provider) throw new Error('Provider not initialized');
  const receipt = await provider.waitForTransaction(txHash, confirmations);
  if (receipt.status === 0) throw new Error('Transaction failed on-chain');
  return receipt;
}

export async function getTransactionReceipt(txHash) {
  if (!provider) throw new Error('Provider not initialized');
  return provider.getTransactionReceipt(txHash);
}

// ===============================
// INTERNAL: map errors → readable strings
// ===============================
function _friendlyError(err, prefix = 'Error') {
  if (err.code === 'ACTION_REJECTED' || err.code === 4001)
    return 'Transaction was cancelled.';
  if (err.message?.includes('already has a deposit'))
    return err.message;
  if (err.message?.includes('Deposit must be paid'))
    return err.message;
  if (err.message?.includes('already been paid'))
    return 'This payment was already made.';
  if (err.message?.includes('Insufficient balance'))
    return err.message;
  if (err.message?.includes('Transaction would fail'))
    return err.message;
  if (err.code === 'INSUFFICIENT_FUNDS')
    return 'Insufficient MATIC balance for this transaction (including gas).';
  if (err.code === 'NETWORK_ERROR')
    return 'Network error — check your connection and try again.';
  if (err.message?.includes('execution reverted'))
    return 'Smart contract rejected the transaction. The booking ID may already be used on-chain.';
  return `${prefix}: ${err.shortMessage || err.message || 'Unknown error'}`;
}

// ===============================
// INIT
// ===============================
if (typeof window !== 'undefined') {
  window.addEventListener('load', async () => {
    console.log('🚀 Initialising Web3…');
    const connected = await autoConnect();
    console.log(connected ? '✅ Auto-connected' : 'ℹ️ Wallet not yet connected');
  });
}