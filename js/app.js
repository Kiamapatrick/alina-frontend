// ===============================
// app.js — Web3 & Two-Phase Payment Integration + MOBILE SUPPORT
// ===============================

import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@6.7.0/+esm';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "./config.js";

// ===============================
// STATE MANAGEMENT
// ===============================
let provider = null;
let signer = null;
let contract = null;
let walletAddress = null;

// Network configurations
const SUPPORTED_NETWORKS = {
  POLYGON_AMOY: {
    chainId: '0x13882', // 80002 in hex
    chainName: 'Polygon Amoy Testnet',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    rpcUrls: ['https://rpc-amoy.polygon.technology/'],
    blockExplorerUrls: ['https://amoy.polygonscan.com/']
  },
  POLYGON_MAINNET: {
    chainId: '0x89', // 137 in hex
    chainName: 'Polygon Mainnet',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    rpcUrls: ['https://polygon-rpc.com/'],
    blockExplorerUrls: ['https://polygonscan.com/']
  }
};

// ===============================
// MOBILE DETECTION
// ===============================

/**
 * Detect if user is on mobile device
 */
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Detect if user is in MetaMask mobile browser
 */
function isMetaMaskMobileBrowser() {
  return window.ethereum && window.ethereum.isMetaMask && isMobileDevice();
}

/**
 * Detect if user is in Trust Wallet browser
 */
function isTrustWalletBrowser() {
  return window.ethereum && window.ethereum.isTrust;
}

// ===============================
// WALLET CONNECTION & MANAGEMENT
// ===============================

export async function connectWallet() {
  const isMobile = isMobileDevice();
  
  console.log('📱 Device type:', isMobile ? 'Mobile' : 'Desktop');
  console.log('🔍 Checking for wallet...');

  // ===== DESKTOP: Standard MetaMask Extension =====
  if (!isMobile) {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask browser extension to use crypto payments');
      window.open('https://metamask.io/download/', '_blank');
      return null;
    }

    try {
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      walletAddress = accounts[0];
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Setup event listeners
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      
      console.log(' Desktop wallet connected:', walletAddress);
      
      const isDeployed = await checkContractDeployment();
      if (!isDeployed) {
        console.warn('⚠️ Contract not found at address:', CONTRACT_ADDRESS);
      }
      
      return walletAddress;
      
    } catch (err) {
      console.error('❌ Desktop wallet connection failed:', err);
      
      if (err.code === 4001) {
        alert('Please approve the connection request');
      } else {
        alert('Failed to connect wallet. Please try again.');
      }
      
      return null;
    }
  }

  // ===== MOBILE: MetaMask or Trust Wallet =====
  
  // Check if already in wallet browser (MetaMask/Trust Wallet in-app browser)
  if (window.ethereum) {
    console.log(' Wallet detected in mobile browser');
    
    try {
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      walletAddress = accounts[0];
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Setup event listeners
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      
      console.log('✅ Mobile wallet connected:', walletAddress);
      
      return walletAddress;
      
    } catch (err) {
      console.error('❌ Mobile wallet connection failed:', err);
      
      if (err.code === 4001) {
        alert('Please approve the connection request');
      } else {
        alert('Failed to connect wallet. Please try again.');
      }
      
      return null;
    }
  }
  
  // Not in wallet browser - need to open wallet app
  console.log('⚠️ Not in wallet browser - showing mobile options');
  showMobileWalletOptions();
  return null;
}

/**
 * Show mobile wallet connection options
 */
function showMobileWalletOptions() {
  const currentUrl = window.location.href;
  const hostname = window.location.host;
  
  // Create modal HTML
  const modalHTML = `
    <div id="mobileWalletModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    ">
      <div style="
        background: white;
        padding: 30px;
        border-radius: 15px;
        max-width: 400px;
        width: 90%;
        text-align: center;
      ">
        <h3 style="margin-bottom: 20px; color: #333;">Connect Your Wallet</h3>
        <p style="color: #666; margin-bottom: 25px;">
          Choose a wallet to connect and make crypto payments
        </p>
        
        <button onclick="openMetaMaskApp()" style="
          width: 100%;
          padding: 15px;
          margin-bottom: 15px;
          background: #f6851b;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
        ">
          🦊 Open in MetaMask
        </button>
        
        <button onclick="openTrustWallet()" style="
          width: 100%;
          padding: 15px;
          margin-bottom: 15px;
          background: #3375bb;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
        ">
          💎 Open in Trust Wallet
        </button>
        
        <button onclick="closeMobileWalletModal()" style="
          width: 100%;
          padding: 15px;
          background: #f0f0f0;
          color: #333;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
        ">
          Cancel
        </button>
        
        <p style="
          margin-top: 20px;
          font-size: 12px;
          color: #999;
        ">
          Don't have a wallet? 
          <a href="https://metamask.io/download/" target="_blank" style="color: #f6851b;">
            Download MetaMask
          </a>
        </p>
      </div>
    </div>
  `;
  
  // Add to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Define global functions for buttons
  window.openMetaMaskApp = function() {
    const metamaskDeepLink = `https://metamask.app.link/dapp/${hostname}${window.location.pathname}${window.location.search}`;
    console.log('🔗 Opening MetaMask:', metamaskDeepLink);
    window.location.href = metamaskDeepLink;
  };
  
  window.openTrustWallet = function() {
    const trustDeepLink = `trust://open_url?url=${encodeURIComponent(currentUrl)}`;
    console.log('🔗 Opening Trust Wallet:', trustDeepLink);
    window.location.href = trustDeepLink;
  };
  
  window.closeMobileWalletModal = function() {
    const modal = document.getElementById('mobileWalletModal');
    if (modal) {
      modal.remove();
    }
  };
}

export function isWalletConnected() {
  return walletAddress !== null && contract !== null;
}

export function getWalletAddress() {
  return walletAddress;
}

export function disconnectWallet() {
  walletAddress = null;
  provider = null;
  signer = null;
  contract = null;
  
  if (window.ethereum) {
    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    window.ethereum.removeListener('chainChanged', handleChainChanged);
  }
  
  console.log('✅ Wallet disconnected');
}

// ===============================
// EVENT HANDLERS
// ===============================

function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    console.log('Please connect to MetaMask');
    disconnectWallet();
    window.location.reload();
  } else if (accounts[0] !== walletAddress) {
    console.log('Account changed:', accounts[0]);
    walletAddress = accounts[0];
    window.location.reload();
  }
}

function handleChainChanged(chainId) {
  console.log('Chain changed:', chainId);
  window.location.reload();
}

// ===============================
// TWO-PHASE PAYMENT: DEPOSIT
// ===============================

export async function payDeposit(bookingId, depositAmountUSD) {
  if (!isWalletConnected()) {
    throw new Error('Wallet not connected');
  }

  try {
    console.log('🔍 === DEPOSIT PAYMENT START ===');
    console.log('📝 Booking ID:', bookingId);
    console.log('💵 Deposit Amount (USD):', depositAmountUSD);
    
    // Hash the booking ID for smart contract
    const backendBookingId = ethers.id(bookingId);
    console.log('🔐 Hashed Booking ID:', backendBookingId);
    
    // ✅ ALWAYS check if deposit already paid (even for "new" bookings)
    try {
      const payment = await contract.getPayment(backendBookingId);
      const depositPaid = payment[7]; // depositPaid boolean at index 7
      
      if (depositPaid) {
        console.error('❌ Deposit already exists on-chain');
        throw new Error('This booking already has a deposit payment on-chain. Please use a different booking ID or contact support.');
      }
      
      console.log('⚠️ Warning: Booking exists but deposit not paid. This might be a failed previous attempt.');
    } catch (err) {
      // Expected error for truly new bookings
      if (err.message && err.message.includes('Booking does not exist')) {
        console.log('✅ New booking - proceeding with deposit payment');
      } else if (err.message && err.message.includes('already has a deposit')) {
        // Re-throw our custom error
        throw err;
      } else {
        // Unexpected error - log but continue
        console.warn('⚠️ Could not verify on-chain status:', err.message);
        console.log('Proceeding with caution...');
      }
    }
    
    // Get MATIC amount for USD
    const weiAmount = await contract.getMaticAmountForUsd(depositAmountUSD);
    console.log('💰 Deposit amount:', ethers.formatEther(weiAmount), 'MATIC');
    
    // Check wallet balance (include gas estimation)
    const balance = await provider.getBalance(walletAddress);
    console.log('👛 Current balance:', ethers.formatEther(balance), 'MATIC');
    
    // Estimate gas first
    let estimatedGas;
    try {
      estimatedGas = await contract.payDeposit.estimateGas(backendBookingId, {
        value: weiAmount
      });
      console.log('⛽ Estimated gas:', estimatedGas.toString());
    } catch (gasErr) {
      console.error('❌ Gas estimation failed:', gasErr);
      throw new Error('Transaction would fail. Please check: 1) You have enough MATIC, 2) Booking ID is not already used, 3) Contract is not paused');
    }
    
    // Check if balance covers value + gas (rough estimate: gas * 2 Gwei)
    const gasBuffer = estimatedGas * BigInt(2000000000); // 2 Gwei per gas
    const totalNeeded = weiAmount + gasBuffer;
    
    if (balance < totalNeeded) {
      throw new Error(`Insufficient balance. Need ${ethers.formatEther(totalNeeded)} MATIC (including gas), have ${ethers.formatEther(balance)} MATIC`);
    }
    
    // Send deposit transaction
    console.log('📤 Sending deposit transaction...');
    const tx = await contract.payDeposit(backendBookingId, {
      value: weiAmount,
      gasLimit: estimatedGas + BigInt(50000) // Add 50k buffer to estimate
    });
    
    console.log('📤 Transaction sent:', tx.hash);
    console.log('⏳ Waiting for confirmation...');
    
    // Wait for 2 confirmations
    const receipt = await tx.wait(2);
    
    console.log('✅ Deposit confirmed!');
    console.log('📋 Receipt:', receipt);
    console.log('🔍 === DEPOSIT PAYMENT END ===');
    
    return receipt.hash;
    
  } catch (err) {
    console.error('❌ Deposit payment failed:', err);
    
    // User-friendly error messages
    let userMessage = 'Deposit payment failed: ';
    
    if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
      userMessage = 'Transaction was rejected by user';
    } else if (err.message?.includes('already has a deposit')) {
      userMessage = err.message;
    } else if (err.message?.includes('already been paid')) {
      userMessage = 'Deposit has already been paid for this booking';
    } else if (err.message?.includes('Insufficient balance')) {
      userMessage = err.message;
    } else if (err.message?.includes('Transaction would fail')) {
      userMessage = err.message;
    } else if (err.code === 'INSUFFICIENT_FUNDS') {
      userMessage = 'Insufficient MATIC balance for transaction + gas fees';
    } else if (err.code === 'NETWORK_ERROR') {
      userMessage = 'Network error. Please check your connection and try again';
    } else if (err.message?.includes('execution reverted')) {
      userMessage = 'Smart contract rejected the transaction. This booking ID may already exist on-chain.';
    } else {
      userMessage += err.shortMessage || err.message || 'Unknown error';
    }
    
    alert(userMessage);
    return null;
  }
}

// ===============================
// TWO-PHASE PAYMENT: BALANCE
// ===============================

export async function payBalance(bookingId, balanceAmountUSD, skipOnChainCheck = false) {
  if (!isWalletConnected()) {
    throw new Error('Wallet not connected');
  }

  try {
    console.log('🔍 === BALANCE PAYMENT START ===');
    console.log('📝 Booking ID:', bookingId);
    console.log('💵 Balance Amount (USD):', balanceAmountUSD);
    console.log('🔧 Skip on-chain check:', skipOnChainCheck);
    
    // Hash the booking ID
    const backendBookingId = ethers.id(bookingId);
    console.log('🔐 Hashed Booking ID:', backendBookingId);
    
    // Only verify on-chain if this is a crypto booking
    if (!skipOnChainCheck) {
      try {
        const payment = await contract.getPayment(backendBookingId);
        const depositPaid = payment[7];
        const balancePaid = payment[8];
        
        console.log('📊 On-chain payment status:', { depositPaid, balancePaid });
        
        if (!depositPaid) {
          throw new Error('Deposit must be paid before balance payment');
        }
        if (balancePaid) {
          throw new Error('Balance has already been paid for this booking');
        }
        
        console.log('✅ On-chain deposit verified - proceeding with balance payment');
        
      } catch (err) {
        if (err.message.includes('Booking does not exist')) {
          // This might be an M-Pesa booking - allow it to proceed
          console.warn('⚠️ No on-chain record found. Assuming M-Pesa booking.');
          console.log('✅ Skipping on-chain verification for M-Pesa booking');
        } else {
          throw err;
        }
      }
    } else {
      console.log('✅ On-chain check skipped (M-Pesa/backend-only booking)');
    }
    
    // Get MATIC amount for USD
    const weiAmount = await contract.getMaticAmountForUsd(balanceAmountUSD);
    console.log('💰 Balance amount:', ethers.formatEther(weiAmount), 'MATIC');
    
    // Check wallet balance
    const balance = await provider.getBalance(walletAddress);
    console.log('👛 Current balance:', ethers.formatEther(balance), 'MATIC');
    
    if (balance < weiAmount) {
      throw new Error(`Insufficient balance. Need ${ethers.formatEther(weiAmount)} MATIC, have ${ethers.formatEther(balance)} MATIC`);
    }
    
    // Send balance transaction
    console.log('📤 Sending balance transaction...');
    const tx = await contract.payBalance(backendBookingId, {
      value: weiAmount,
      gasLimit: 500000
    });
    
    console.log('📤 Transaction sent:', tx.hash);
    console.log('⏳ Waiting for confirmation...');
    
    // Wait for 2 confirmations
    const receipt = await tx.wait(2);
    
    console.log('✅ Balance confirmed!');
    console.log('📋 Receipt:', receipt);
    console.log('🔍 === BALANCE PAYMENT END ===');
    
    return receipt.hash;
    
  } catch (err) {
    console.error('❌ Balance payment failed:', err);
    
    // User-friendly error messages
    let userMessage = 'Balance payment failed: ';
    
    if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
      userMessage = 'Transaction was rejected by user';
    } else if (err.message?.includes('already been paid')) {
      userMessage = 'Balance has already been paid for this booking';
    } else if (err.message?.includes('Deposit must be paid')) {
      userMessage = err.message;
    } else if (err.message?.includes('Booking not found')) {
      userMessage = err.message;
    } else if (err.message?.includes('Insufficient balance')) {
      userMessage = err.message;
    } else if (err.code === 'INSUFFICIENT_FUNDS') {
      userMessage = 'Insufficient MATIC balance for transaction + gas fees';
    } else if (err.code === 'NETWORK_ERROR') {
      userMessage = 'Network error. Please check your connection and try again';
    } else {
      userMessage += err.shortMessage || err.message || 'Unknown error';
    }
    
    alert(userMessage);
    return null;
  }
}

// ===============================
// CONTRACT READ FUNCTIONS
// ===============================

export async function getPayment(bookingId) {
  if (!isWalletConnected()) {
    throw new Error('Wallet not connected');
  }

  try {
    const backendBookingId = ethers.id(bookingId);
    const payment = await contract.getPayment(backendBookingId);
    
    return {
      renter: payment[0],
      depositAmount: ethers.formatEther(payment[1]),
      balanceAmount: ethers.formatEther(payment[2]),
      refundedAmount: ethers.formatEther(payment[3]),
      depositPaidAt: new Date(Number(payment[4]) * 1000),
      balancePaidAt: Number(payment[5]) > 0 ? new Date(Number(payment[5]) * 1000) : null,
      lastRefundAt: Number(payment[6]) > 0 ? new Date(Number(payment[6]) * 1000) : null,
      depositPaid: payment[7],
      balancePaid: payment[8],
      remainingRefundable: ethers.formatEther(payment[9])
    };
    
  } catch (err) {
    console.error('Failed to get payment:', err);
    throw err;
  }
}

export async function getRemainingRefundable(bookingId) {
  if (!isWalletConnected()) {
    throw new Error('Wallet not connected');
  }

  try {
    const backendBookingId = ethers.id(bookingId);
    const remaining = await contract.getRemainingRefundable(backendBookingId);
    return ethers.formatEther(remaining);
  } catch (err) {
    console.error('Failed to get refundable amount:', err);
    return '0';
  }
}

export async function getMaticPerUSD() {
  if (!isWalletConnected()) {
    throw new Error('Wallet not connected');
  }

  try {
    const rate = await contract.maticPerUSD();
    return ethers.formatEther(rate);
  } catch (err) {
    console.error('Failed to get MATIC/USD rate:', err);
    return '0';
  }
}

export async function getNetworkInfo() {
  if (!provider) {
    throw new Error('Provider not initialized');
  }

  try {
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(walletAddress);
    
    return {
      chainId: Number(network.chainId),
      chainIdHex: '0x' + network.chainId.toString(16),
      name: network.name,
      balance: ethers.formatEther(balance),
      address: walletAddress
    };
  } catch (err) {
    console.error('Failed to get network info:', err);
    throw err;
  }
}

// ===============================
// NETWORK MANAGEMENT
// ===============================

export async function switchNetwork(networkKey = 'POLYGON_AMOY') {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask not installed');
  }

  const network = SUPPORTED_NETWORKS[networkKey];
  if (!network) {
    throw new Error('Unsupported network');
  }

  try {
    // Try to switch to the network
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: network.chainId }],
    });
    
    console.log('✅ Switched to', network.chainName);
    return true;
    
  } catch (switchError) {
    // This error code indicates that the chain has not been added to MetaMask
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [network],
        });
        
        console.log('✅ Added and switched to', network.chainName);
        return true;
        
      } catch (addError) {
        console.error('Failed to add network:', addError);
        throw addError;
      }
    }
    
    console.error('Failed to switch network:', switchError);
    throw switchError;
  }
}

export async function verifyCorrectNetwork(expectedChainId = 80002) {
  if (!provider) {
    return false;
  }

  try {
    const network = await provider.getNetwork();
    const currentChainId = Number(network.chainId);
    
    if (currentChainId !== expectedChainId) {
      console.warn(`⚠️ Wrong network. Expected ${expectedChainId}, got ${currentChainId}`);
      return false;
    }
    
    console.log('✅ Connected to correct network:', currentChainId);
    return true;
    
  } catch (err) {
    console.error('Failed to verify network:', err);
    return false;
  }
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

export async function checkContractDeployment() {
  if (!provider) {
    throw new Error('Provider not initialized');
  }
  
  try {
    const code = await provider.getCode(CONTRACT_ADDRESS);
    
    if (code === '0x' || code === '0x0') {
      console.error('❌ No contract deployed at:', CONTRACT_ADDRESS);
      return false;
    }
    
    console.log('✅ Contract deployed at:', CONTRACT_ADDRESS);
    console.log('📝 Contract code length:', code.length);
    return true;
    
  } catch (err) {
    console.error('Failed to check contract deployment:', err);
    return false;
  }
}

export function formatMaticAmount(weiAmount) {
  try {
    return ethers.formatEther(weiAmount);
  } catch (err) {
    console.error('Failed to format amount:', err);
    return '0';
  }
}

export function parseMaticAmount(etherAmount) {
  try {
    return ethers.parseEther(etherAmount.toString());
  } catch (err) {
    console.error('Failed to parse amount:', err);
    return 0n;
  }
}

export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// ===============================
// AUTO-CONNECT ON LOAD
// ===============================

export async function autoConnect() {
  if (typeof window.ethereum === 'undefined') {
    console.log('MetaMask not installed');
    return false;
  }

  try {
    // Check if already connected
    const accounts = await window.ethereum.request({ 
      method: 'eth_accounts' 
    });
    
    if (accounts.length > 0) {
      console.log('🔄 Auto-connecting wallet...');
      await connectWallet();
      
      // Verify contract is deployed
      const isDeployed = await checkContractDeployment();
      
      if (!isDeployed) {
        console.warn('⚠️ Contract not found. Please check CONTRACT_ADDRESS in config.js');
      }
      
      // Optionally verify network
      await verifyCorrectNetwork();
      
      return true;
    }
    
    console.log('No accounts found. User needs to connect manually.');
    return false;
    
  } catch (err) {
    console.error('Auto-connect failed:', err);
    return false;
  }
}

// ===============================
// TRANSACTION MONITORING
// ===============================

export async function waitForTransaction(txHash, confirmations = 2) {
  if (!provider) {
    throw new Error('Provider not initialized');
  }

  try {
    console.log(`⏳ Waiting for ${confirmations} confirmations for tx:`, txHash);
    const receipt = await provider.waitForTransaction(txHash, confirmations);
    
    if (receipt.status === 0) {
      throw new Error('Transaction failed');
    }
    
    console.log('✅ Transaction confirmed:', receipt);
    return receipt;
    
  } catch (err) {
    console.error('Transaction monitoring failed:', err);
    throw err;
  }
}

export async function getTransactionReceipt(txHash) {
  if (!provider) {
    throw new Error('Provider not initialized');
  }

  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    return receipt;
  } catch (err) {
    console.error('Failed to get transaction receipt:', err);
    throw err;
  }
}

// ===============================
// INITIALIZATION
// ===============================

// Auto-connect on module load
if (typeof window !== 'undefined') {
  window.addEventListener('load', async () => {
    console.log('🚀 Initializing Web3...');
    const connected = await autoConnect();
    
    if (connected) {
      console.log('✅ Web3 initialized and wallet connected');
    } else {
      console.log('ℹ️ Web3 initialized. Wallet not connected yet.');
    }
  });
}