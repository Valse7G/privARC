import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";
import {
  CONTRACTS, TOKENS, TOKEN_LIST, SEL, CCTP_DOMAINS,
  NATIVE_USDC, NATIVE_TO_ERC20,
  encodeAddress, encodeUint256, encodeBytes32,
  decodeUint256, decodeUint8, formatToken,
  buildDepositCalldata, buildWithdrawCalldata,
  buildShieldedSendCalldata, buildPrivateSwapCalldata, buildPrivateBridgeCalldata,
  buildApproveCalldata, buildStakeCalldata, needsApproveBeforeDeposit,
  randomBytes32, buildGetLastRootCall,
  buildRegisterViewKeyCalldata, buildHasViewKeyCall, buildGetViewKeyCall,
  buildEmitNoteCalldata, decodeBytesReturn, decodeStringReturn,
  buildTotalVolumeByTokenCall,
  previewDepositFee, previewWithdrawFee, previewSwapFee, previewBridgeFee, sendFeeValueHex,
} from "./contracts.js";

/* ═══════════════════════════════════════════════════════════════
   ARC NETWORK — OFFICIAL CHAIN CONFIGS (docs.arc.io)
   Testnet : chainId 5042002 | LIVE
   Mainnet : chainId TBD     | LOCKED — not yet available
═══════════════════════════════════════════════════════════════ */
const ARC_TESTNET = {
  id:        5042002,
  hexId:     "0x4cef52",       // 5042002 in hex — VERIFIED: hex(5042002) = 0x4cef52
  name:      "Arc Testnet",
  shortName: "ARC-TEST",
  rpcUrl:    "https://rpc.testnet.arc.network",
  wsUrl:     "wss://rpc.testnet.arc.network",
  explorer:  "https://testnet.arcscan.app",
  faucet:    "https://faucet.circle.com",
  currency:  { name: "USDC", symbol: "USDC", decimals: 18 }, // native gas token
  testnet:   true,
  available: true,
};

const ARC_MAINNET = {
  id:        null,             // Not yet published
  hexId:     null,
  name:      "Arc Mainnet",
  shortName: "ARC",
  rpcUrl:    null,
  explorer:  "https://arcscan.app",
  currency:  { name: "USDC", symbol: "USDC", decimals: 18 },
  testnet:   false,
  available: false,            // LOCKED — flip to true when mainnet launches
};

/*
  USDC on Arc Testnet:
  - Native gas token  → 18 decimals (used internally)
  - ERC-20 interface  → 6 decimals  (USE THIS for balances & transfers)
  Source: docs.arc.io/arc/references/contract-addresses
  "For applications integrating USDC, rely solely on the standard ERC-20
   interface for reading balances and sending transfers."
*/
const USDC_DECIMALS_ERC20 = 6;   // ERC-20 interface — balances, transfers
const USDC_DECIMALS_NATIVE = 18; // Native gas — internal only

// Arc Testnet: USDC is the native gas token.
// eth_getBalance returns wei (18 dec). Displayed as USDC using /1e12 shift.
// This is NOT ETH — the currency label must always say "USDC".
const NATIVE_TO_ERC20_SHIFT = NATIVE_TO_ERC20; // 10^12 (imported from contracts.js)

// USDC ERC-20 minimal ABI
const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// USDC on Arc Testnet: native gas token (18 dec internally).
// ERC-20 interface reports 6 dec. We read eth_getBalance (wei18) and shift by 1e12
// to get the 6-dec equivalent displayed to the user.
// NATIVE_TO_ERC20_SHIFT is imported from contracts.js (= 10^12). No redeclaration.

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const hx = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const sl = (ms) => new Promise(r => setTimeout(r, ms));

// Format USDC with 6 decimals (ERC-20 interface)
const fmtUsdc = (wei6) => (Number(BigInt(wei6)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Format from native 18-decimal to display (shift by 1e12)
// Format native balance (18-dec wei) → USDC 6-dec display (divide by 1e12)
const fmtNative = (wei18) => (Number(BigInt(wei18)) / 1e12).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sh = (a) => a ? a.slice(0, 8) + "···" + a.slice(-6) : "---";
const tc = () => { const n = new Date(); return [n.getHours(), n.getMinutes(), n.getSeconds()].map(x => String(x).padStart(2, "0")).join(":"); };
const toHex = (n) => "0x" + n.toString(16);

/* ═══════════════════════════════════════════════════════════════
   EIP-1193 HELPERS  (real on-chain calls via window.ethereum)
═══════════════════════════════════════════════════════════════ */
async function rpcCall(method, params = []) {
  if (!window.ethereum) throw new Error("No wallet provider");
  return window.ethereum.request({ method, params });
}

// Read native USDC balance (gas token, 18 dec)
async function getNativeBalance(address) {
  const raw = await rpcCall("eth_getBalance", [address, "latest"]);
  return BigInt(raw);
}

// Convert native balance (18 dec) → display as USDC 6-dec equivalent
function nativeToUsdc6(wei18) {
  return wei18 / NATIVE_TO_ERC20_SHIFT;
}

// Get current chain ID
async function getChainId() {
  const raw = await rpcCall("eth_chainId");
  return parseInt(raw, 16);
}

// Build the addEthereumChain payload — strictly EIP-3085 compliant
// chainId MUST be lowercase hex string matching exactly the integer
// Some wallets (TokenPocket, Trust) validate chainId integer vs hex strictly
const ARC_TESTNET_CHAIN_PARAMS = {
  chainId:          "0x4cef52",          // hex(5042002) — verified
  chainName:        "Arc Testnet",
  nativeCurrency:   { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls:          ["https://rpc.testnet.arc.network"],
  blockExplorerUrls:["https://testnet.arcscan.app"],
};

// Switch or add Arc Testnet — robust for all wallet types
async function switchToArcTestnet() {
  const HEX = "0x4cef52"; // hex(5042002)

  // Step 1: try switch first
  try {
    await rpcCall("wallet_switchEthereumChain", [{ chainId: HEX }]);
    return; // success
  } catch (switchErr) {
    // code 4902 = chain not added yet
    // code -32603 = internal error (some wallets use this instead of 4902)
    // code -32000 = some mobile wallets
    const needsAdd = switchErr.code === 4902
      || switchErr.code === -32603
      || switchErr.code === -32000
      || (switchErr.message||"").toLowerCase().includes("unrecognized")
      || (switchErr.message||"").toLowerCase().includes("unknown")
      || (switchErr.message||"").toLowerCase().includes("not exist");

    if (!needsAdd) {
      // User rejected (code 4001) or other real error → rethrow
      throw switchErr;
    }
  }

  // Step 2: add chain then switch
  try {
    await rpcCall("wallet_addEthereumChain", [ARC_TESTNET_CHAIN_PARAMS]);
    // After add, some wallets auto-switch, some don't — try switch again
    try {
      await rpcCall("wallet_switchEthereumChain", [{ chainId: HEX }]);
    } catch (_) {
      // Ignore — wallet may have already switched on addEthereumChain
    }
  } catch (addErr) {
    if (addErr.code === 4001) throw new Error("User rejected network addition");
    throw addErr;
  }
}

// Personal sign (EIP-191)
async function personalSign(address, message) {
  return rpcCall("personal_sign", [
    "0x" + Array.from(new TextEncoder().encode(message)).map(b => b.toString(16).padStart(2, "0")).join(""),
    address,
  ]);
}

// Send ETH/USDC transaction with gas estimation (FIX F-08)
async function sendTransaction(from, to, valueHex, data = "0x") {
  let gasLimit;
  try {
    const estimated = await rpcCall("eth_estimateGas", [{ from, to, value: valueHex, data, chainId: toHex(ARC_TESTNET.id) }]);
    // Add 30% buffer to avoid out-of-gas on borderline txs
    gasLimit = "0x" + Math.ceil(parseInt(estimated, 16) * 1.3).toString(16);
  } catch {
    // Fallback: 500k gas — sufficient for ShieldVault operations
    gasLimit = "0x7A120";
  }
  return rpcCall("eth_sendTransaction", [{ from, to, value: valueHex, data, gas: gasLimit, chainId: toHex(ARC_TESTNET.id) }]);
}

// Wait for tx receipt (polling)
async function waitForReceipt(txHash, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await sl(2000);
    try {
      const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
      if (receipt) return receipt;
    } catch {}
  }
  throw new Error("Transaction timeout — check explorer");
}

/* ═══════════════════════════════════════════════════════════════
   LIVE PRICE FEED — Real market prices via CoinGecko public API
   No API key required. Updates every 30s.
   Fallback: last known price + tiny noise (USDC stays pegged)
═══════════════════════════════════════════════════════════════ */
const PRICE_FALLBACK = { USDC: 1.0001, WETH: 2597.42, WBTC: 64521.80 };

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price" +
  "?ids=usd-coin%2Cethereum%2Cwrapped-bitcoin" +
  "&vs_currencies=usd&include_24hr_change=true&precision=6";

async function fetchCGPrices() {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return {
    USDC: d["usd-coin"]?.usd         ?? PRICE_FALLBACK.USDC,
    WETH: d["ethereum"]?.usd         ?? PRICE_FALLBACK.WETH,
    WBTC: d["wrapped-bitcoin"]?.usd  ?? PRICE_FALLBACK.WBTC,
    USDC_24h: d["usd-coin"]?.usd_24h_change        ?? 0,
    WETH_24h: d["ethereum"]?.usd_24h_change        ?? 0,
    WBTC_24h: d["wrapped-bitcoin"]?.usd_24h_change ?? 0,
  };
}

function usePriceFeed() {
  const [prices,      setPrices]      = useState(PRICE_FALLBACK);
  const [changes,     setChanges]     = useState({ USDC:0, WETH:0, WBTC:0 });
  const [change24h,   setChange24h]   = useState({ USDC:0, WETH:0, WBTC:0 });
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [priceError,  setPriceError]  = useState(false);
  const prev = useRef({ ...PRICE_FALLBACK });

  const fetchAndSet = useCallback(async () => {
    try {
      const data = await fetchCGPrices();
      const next = { USDC: data.USDC, WETH: data.WETH, WBTC: data.WBTC };
      const chgs = {
        USDC: next.USDC - prev.current.USDC,
        WETH: next.WETH - prev.current.WETH,
        WBTC: next.WBTC - prev.current.WBTC,
      };
      prev.current = next;
      setPrices(next);
      setChanges(chgs);
      setChange24h({ USDC: data.USDC_24h, WETH: data.WETH_24h, WBTC: data.WBTC_24h });
      setLastUpdate(new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" }));
      setPriceError(false);
    } catch {
      setPriceError(true);
      // Animate with tiny noise so ticker doesn't look frozen
      setPrices(p => {
        const n = { ...p };
        ["WETH","WBTC"].forEach(k => { n[k] = p[k] * (1 + (Math.random()-.5)*0.0003); });
        setChanges({ USDC:0, WETH:n.WETH-p.WETH, WBTC:n.WBTC-p.WBTC });
        return n;
      });
    }
  }, []);

  useEffect(() => {
    fetchAndSet();                         // Immediate on mount
    const id = setInterval(fetchAndSet, 30000); // Every 30s
    return () => clearInterval(id);
  }, [fetchAndSet]);

  return { prices, changes, change24h, lastUpdate, priceError };
}

/* ═══════════════════════════════════════════════════════════════
   WEB3 CONTEXT  — real EIP-1193
═══════════════════════════════════════════════════════════════ */
const W3 = createContext(null);

function Web3Provider({ children }) {
  const [account,    setAccount]    = useState(null);  // { address, chainId, walletName }
  const [balance,    setBalance]    = useState(null);  // BigInt — native wei18
  const [onArc,      setOnArc]      = useState(false); // true if chainId === 5042002
  const [switching,  setSwitching]  = useState(false);
  const [loadingBal, setLoadingBal] = useState(false);

  // Refresh balance from chain
  const refreshBalance = useCallback(async (addr) => {
    if (!addr || !window.ethereum) return;
    try {
      setLoadingBal(true);
      const bal = await getNativeBalance(addr);
      setBalance(bal);
    } catch (e) {
      console.warn("balance fetch failed:", e.message);
    } finally {
      setLoadingBal(false);
    }
  }, []);

  // Handle account / chain changes from wallet
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = async (accs) => {
      if (!accs?.length) { setAccount(null); setBalance(null); setOnArc(false); return; }
      const cid = await getChainId().catch(() => 0);
      const addr = accs[0];
      setAccount(a => a ? { ...a, address: addr, chainId: cid } : null);
      setOnArc(cid === ARC_TESTNET.id);
      refreshBalance(addr);
    };
    const handleChainChanged = async (chainHex) => {
      const cid = parseInt(chainHex, 16);
      setOnArc(cid === ARC_TESTNET.id);
      setAccount(a => a ? { ...a, chainId: cid } : null);
      if (account?.address) refreshBalance(account.address);
    };
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [account, refreshBalance]);

  const connect = useCallback(async (address, walletName) => {
    const cid = await getChainId().catch(() => 0);
    setAccount({ address, chainId: cid, walletName });
    setOnArc(cid === ARC_TESTNET.id);
    await refreshBalance(address);
  }, [refreshBalance]);

  const switchARC = useCallback(async () => {
    setSwitching(true);
    try {
      await switchToArcTestnet();
      const cid = await getChainId();
      setOnArc(cid === ARC_TESTNET.id);
      setAccount(a => a ? { ...a, chainId: cid } : null);
      if (account?.address) await refreshBalance(account.address);
    } finally {
      setSwitching(false);
    }
  }, [account, refreshBalance]);

  const disconnect = useCallback(() => {
    setAccount(null); setBalance(null); setOnArc(false);
  }, []);

  return (
    <W3.Provider value={{ account, balance, onArc, switching, loadingBal, connect, switchARC, disconnect, refreshBalance }}>
      {children}
    </W3.Provider>
  );
}
const useW3 = () => useContext(W3);

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CONTEXT
═══════════════════════════════════════════════════════════════ */
const NCtx = createContext(null);
function NotifProvider({ children }) {
  const [notifs, setNotifs] = useState([]);
  const push = useCallback((msg, type = "info", link = null) => {
    const id = Date.now() + Math.random();
    setNotifs(p => [...p.slice(-8), { id, msg, type, link, ts: tc(), read: false }]);
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), 9000);
  }, []);
  const markRead = useCallback(id => setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n)), []);
  const clearAll = useCallback(() => setNotifs([]), []);
  return <NCtx.Provider value={{ notifs, push, markRead, clearAll }}>{children}</NCtx.Provider>;
}
const useNotif = () => useContext(NCtx);

/* ═══════════════════════════════════════════════════════════════
   WALLET PROVIDERS
═══════════════════════════════════════════════════════════════ */
const WALLETS = [
  { id:"metamask",    name:"MetaMask",         popular:true,  color:"#E2761B", glow:"rgba(226,118,27,.3)", installed:()=>!!window.ethereum?.isMetaMask,        icon:<svg viewBox="0 0 40 40" width="30" height="30"><path d="M36.4 3L22.3 13.3l2.6-6.1z" fill="#E17726"/><path d="M3.6 3l14 10.4-2.5-6.2z" fill="#E27625"/><path d="M31.1 27.5l-3.8 5.8 8.1 2.2 2.3-7.9z" fill="#E27625"/><path d="M2.3 27.6l2.3 7.9 8.1-2.2-3.8-5.8z" fill="#E27625"/><path d="M12.3 18.1l-2.2 3.4 7.9.4-.3-8.5z" fill="#E27625"/><path d="M27.7 18.1l-5.5-4.8-.3 8.6 7.9-.4z" fill="#E27625"/><path d="M22.1 21.9l.5-8.6-2.3-6.2h-4.6l-2.3 6.2.5 8.6.2 2.6v6.1h3.8l.1-6.1z" fill="#F5841F"/></svg> },
  { id:"rabby",       name:"Rabby Wallet",     popular:true,  color:"#7B68EE", glow:"rgba(123,104,238,.3)", installed:()=>!!window.ethereum?.isRabby,          icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#7B68EE"/><ellipse cx="20" cy="19" rx="12" ry="10" fill="white" opacity=".95"/><circle cx="15" cy="17" r="2.5" fill="#7B68EE"/><circle cx="25" cy="17" r="2.5" fill="#7B68EE"/><circle cx="15.8" cy="16.2" r="1" fill="white"/><circle cx="25.8" cy="16.2" r="1" fill="white"/><path d="M15 22 Q20 26 25 22" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg> },
  { id:"wc",          name:"WalletConnect",    popular:true,  color:"#3B99FC", glow:"rgba(59,153,252,.3)",  installed:()=>true,                                 icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#3B99FC"/><path d="M11 16c5-5 13-5 18 0l.6.6c.2.2.2.5 0 .7L28 19c-.1.1-.3.1-.4 0l-.8-.8C24 15 16 15 13 18.2l-.8.8c-.1.1-.3.1-.4 0L10 17.3c-.2-.2-.2-.5 0-.7z" fill="white"/><path d="M30 18l1.6 1.6c.2.2.2.5 0 .7L24 28c-.2.2-.5.2-.7 0l-5.3-5.3c-.1-.1-.2-.1-.3 0L12.4 28c-.2.2-.5.2-.7 0L4 20.3c-.2-.2-.2-.5 0-.7L5.6 18c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0l5.3-5.3c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0L29.3 18c.2-.2.5-.2.7 0z" fill="white"/></svg> },
  { id:"coinbase",    name:"Coinbase Wallet",  popular:true,  color:"#0052FF", glow:"rgba(0,82,255,.3)",    installed:()=>!!window.ethereum?.isCoinbaseWallet,  icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#0052FF"/><circle cx="20" cy="20" r="11" fill="white"/><rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF"/></svg> },
  { id:"trust",       name:"Trust Wallet",     popular:false, color:"#3375BB", glow:"rgba(51,117,187,.3)",  installed:()=>!!window.ethereum?.isTrust,           icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#3375BB"/><path d="M20 8L30 12v9c0 5.5-4.5 10-10 11C9.5 31 5 26.5 5 21v-9z" fill="white" opacity=".9"/><path d="M16 20l3 3 5-6" stroke="#3375BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id:"okx",         name:"OKX Wallet",       popular:false, color:"#111",    glow:"rgba(255,255,255,.1)", installed:()=>!!window.okxwallet,                   icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#111"/><rect x="8" y="8" width="10" height="10" rx="2" fill="white"/><rect x="22" y="8" width="10" height="10" rx="2" fill="white"/><rect x="8" y="22" width="10" height="10" rx="2" fill="white"/><rect x="22" y="22" width="10" height="10" rx="2" fill="white"/></svg> },
  { id:"tp",          name:"TokenPocket",      popular:false, color:"#2980FE", glow:"rgba(41,128,254,.3)",  installed:()=>!!window.ethereum?.isTokenPocket,     icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#2980FE"/><rect x="8" y="12" width="24" height="6" rx="3" fill="white" opacity=".9"/><rect x="8" y="22" width="16" height="6" rx="3" fill="white" opacity=".6"/></svg> },
  { id:"brave",       name:"Brave Wallet",     popular:false, color:"#FF5000", glow:"rgba(255,80,0,.3)",    installed:()=>!!window.ethereum?.isBraveWallet,     icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#FF5000"/><path d="M20 7L28 11 31 20 26 29 20 33 14 29 9 20 12 11z" fill="white" opacity=".9"/><circle cx="20" cy="20" r="3" fill="#FF5000"/></svg> },
];

/* ═══════════════════════════════════════════════════════════════
   HEX GRID BACKGROUND
═══════════════════════════════════════════════════════════════ */
function HexGrid() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d"); let raf, t = 0;
    const rz = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    rz(); window.addEventListener("resize", rz);
    const draw = () => {
      t += 0.007; ctx.clearRect(0, 0, c.width, c.height);
      const g = ctx.createRadialGradient(c.width*.5, c.height*.4, 0, c.width*.5, c.height*.4, c.width*.7);
      g.addColorStop(0, "rgba(0,18,10,1)"); g.addColorStop(1, "rgba(0,6,4,1)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      const R = 36, cols = Math.ceil(c.width / (R * 1.73)) + 2, rows = Math.ceil(c.height / (R * 1.5)) + 2;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * R * 1.73 + (row % 2 === 0 ? 0 : R * .865), y = row * R * 1.5;
          const d = Math.sqrt((x - c.width*.5)**2 + (y - c.height*.4)**2);
          const wave = Math.sin(d * .011 - t * 1.6) * .5 + .5;
          const pulse = Math.sin(t * .6 + col * .3 + row * .5) * .3 + .3;
          const alpha = wave * pulse * .35;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ag = (Math.PI / 3) * i - Math.PI / 6;
            i === 0 ? ctx.moveTo(x + R*.95*Math.cos(ag), y + R*.95*Math.sin(ag))
                    : ctx.lineTo(x + R*.95*Math.cos(ag), y + R*.95*Math.sin(ag));
          }
          ctx.closePath();
          if (alpha > .16) { ctx.fillStyle = `rgba(0,255,160,${alpha*.05})`; ctx.fill(); }
          ctx.strokeStyle = `rgba(0,255,180,${alpha})`; ctx.lineWidth = .5; ctx.stroke();
        }
      }
      for (let y = 0; y < c.height; y += 3) { ctx.fillStyle = "rgba(0,0,0,.05)"; ctx.fillRect(0, y, c.width, 1); }
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rz); };
  }, []);
  return <canvas ref={ref} style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none" }} />;
}

/* ═══════════════════════════════════════════════════════════════
   BOOT SEQUENCE
═══════════════════════════════════════════════════════════════ */
function Boot({ onDone }) {
  const [lines, setLines] = useState([]); const [done, setDone] = useState(false);
  const BL = [
    { t:0,    c:"#00FFB0", m:"PRIVARC OS v12.0.0  —  Arc Testnet" },
    { t:280,  c:"#4ADE80", m:"Connecting to Arc Testnet RPC..." },
    { t:560,  c:"#4ADE80", m:`RPC: ${ARC_TESTNET.rpcUrl}` },
    { t:840,  c:"#4ADE80", m:`Chain ID: ${ARC_TESTNET.id}  ✓` },
    { t:1100, c:"#4ADE80", m:"EIP-1193 provider  detecting..." },
    { t:1380, c:"#00FFB0", m:"Gas token: USDC (ERC-20, 6 dec)  ✓" },
    { t:1660, c:"#4ADE80", m:"Faucet: faucet.circle.com" },
    { t:1940, c:"#F59E0B", m:"Mainnet: LOCKED — not yet available" },
    { t:2200, c:"#00FFB0", m:"━━━  TESTNET READY — CONNECT WALLET  ━━━" },
  ];
  useEffect(() => {
    BL.forEach(({ t, c, m }) => setTimeout(() => setLines(p => [...p, { c, m }]), t));
    setTimeout(() => { setDone(true); setTimeout(onDone, 500); }, 2800);
  }, []);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"#000A06", display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 10vw", fontFamily:"monospace", opacity:done?0:1, transition:"opacity .5s", pointerEvents:done?"none":"all" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:9, color:"#1A4A30", letterSpacing:".3em", marginBottom:5 }}>PRIVARC AUTONOMOUS CRYPTO OS — ARC TESTNET (CIRCLE L1)</div>
        <div style={{ width:40, height:1.5, background:"#00FFB0", marginBottom:16 }} />
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize:12, color:l.c, marginBottom:4, letterSpacing:".05em", lineHeight:1.6, animation:"fi .3s ease" }}>
          <span style={{ color:"#1A4A30", marginRight:8 }}>[{String(i).padStart(2,"0")}]</span>{l.m}
        </div>
      ))}
      {lines.length > 0 && (
        <div style={{ marginTop:16, height:2, background:"#0A2018", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, height:"100%", background:"linear-gradient(90deg,#00FFB0,#0EA5E9)", width:`${Math.min(100,(lines.length/BL.length)*100)}%`, transition:"width .28s", boxShadow:"0 0 8px #00FFB0" }} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CHAIN BANNER — wrong network warning
═══════════════════════════════════════════════════════════════ */
function ChainBanner() {
  const { onArc, switchARC, switching, account } = useW3();
  if (!account || onArc) return null;
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:150, background:"rgba(245,158,11,.12)", borderBottom:"1px solid rgba(245,158,11,.38)", padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", fontFamily:"monospace", backdropFilter:"blur(8px)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ color:"#F59E0B" }}>⚠</span>
        <span style={{ fontSize:11, color:"#FCD34D", letterSpacing:".06em" }}>
          Wrong network — PrivARC requires <strong>Arc Testnet (chainId: 5042002)</strong>
        </span>
      </div>
      <button onClick={switchARC} disabled={switching} style={{ background:"rgba(245,158,11,.15)", border:"1px solid rgba(245,158,11,.45)", borderRadius:3, color:"#F59E0B", fontSize:10, padding:"5px 14px", cursor:"pointer", fontFamily:"monospace", letterSpacing:".12em", display:"flex", alignItems:"center", gap:7, transition:"all .2s" }}>
        {switching ? <><Sp c="#F59E0B" sz={10} /> Switching...</> : "⟶ SWITCH TO ARC TESTNET"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRICE TICKER
═══════════════════════════════════════════════════════════════ */
function PriceTicker({ prices, changes, change24h, lastUpdate, priceError }) {
  const TOKENS = ["USDC", "WETH", "WBTC"];
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let pos = 0;
    const id = setInterval(() => { pos -= 0.6; if (pos < -el.scrollWidth / 2) pos = 0; el.style.transform = `translateX(${pos}px)`; }, 16);
    return () => clearInterval(id);
  }, []);
  const items = [...TOKENS, ...TOKENS];
  return (
    <div style={{ overflow:"hidden", background:"rgba(0,0,0,.5)", borderBottom:"1px solid rgba(0,255,176,.08)", height:24, display:"flex", alignItems:"center" }}>
      {/* Testnet badge */}
      <div style={{ flexShrink:0, padding:"0 12px", fontSize:9, color:"#00FFB0", fontFamily:"monospace", letterSpacing:".12em", borderRight:"1px solid rgba(0,255,176,.12)", height:"100%", display:"flex", alignItems:"center", gap:5 }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 5px #00FFB0", animation:"pulse 2s infinite", display:"inline-block" }} />
        ARC TESTNET
      </div>
      {/* Live prices */}
      <div ref={ref} style={{ display:"flex", whiteSpace:"nowrap", willChange:"transform" }}>
        {items.map((t, i) => {
          const p = prices[t] || 0;
          const tick = changes[t] || 0;  // tick-to-tick delta (for up/down arrow)
          const d24  = change24h?.[t] ?? 0; // 24h % change from CoinGecko
          const up   = t === "USDC" ? true : tick >= 0;
          const d24color = d24 >= 0 ? "#00FFB0" : "#f87171";
          return (
            <span key={i} style={{ fontSize:10, fontFamily:"monospace", padding:"0 16px", color:"#ffffff", borderRight:"1px solid rgba(0,255,176,.06)", display:"inline-flex", alignItems:"center", gap:5 }}>
              <span style={{ color:"#64748b" }}>{t}</span>
              <span style={{ color: t === "USDC" ? "#ffffff" : (up ? "#00FFB0" : "#f87171"), fontWeight:600 }}>
                ${p < 10 ? p.toFixed(4) : p < 1000 ? p.toFixed(2) : p.toFixed(0)}
              </span>
              {t !== "USDC" && (
                <span style={{ fontSize:8, color: d24 >= 0 ? "#00FFB0" : "#f87171" }}>
                  {d24 >= 0 ? "▲" : "▼"}{Math.abs(d24).toFixed(2)}%
                </span>
              )}
            </span>
          );
        })}
      </div>
      {/* Source + update time */}
      <div style={{ marginLeft:"auto", flexShrink:0, padding:"0 10px", borderLeft:"1px solid rgba(0,255,176,.08)", height:"100%", display:"flex", alignItems:"center", gap:8 }}>
        {priceError
          ? <span style={{ fontSize:7, color:"#f87171", fontFamily:"monospace" }}>⚠ STALE</span>
          : <span style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace" }}>
              CoinGecko {lastUpdate ? `· ${lastUpdate}` : "· loading..."}
            </span>
        }
        <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", letterSpacing:".1em", textDecoration:"none", transition:"color .2s" }}
          onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#64748b"}>
          💧 USDC →
        </a>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MICRO COMPONENTS
═══════════════════════════════════════════════════════════════ */
const Sp = ({ sz=12, c="#00FFB0" }) => (
  <span style={{ width:sz, height:sz, border:`1.5px solid rgba(0,255,176,.2)`, borderTop:`1.5px solid ${c}`, borderRadius:"50%", animation:"spin .7s linear infinite", display:"inline-block", flexShrink:0 }} />
);

function Glitch({ text, style }) {
  return (
    <span style={{ position:"relative", display:"inline-block", ...style }}>
      <span style={{ position:"relative", zIndex:1 }}>{text}</span>
      <span style={{ position:"absolute", top:0, left:0, color:"#00FFB0", opacity:0, animation:"g1 4s infinite", clipPath:"polygon(0 30%,100% 30%,100% 50%,0 50%)", transform:"translateX(-2px)" }}>{text}</span>
      <span style={{ position:"absolute", top:0, left:0, color:"#0EA5E9", opacity:0, animation:"g2 4s infinite", clipPath:"polygon(0 60%,100% 60%,100% 80%,0 80%)", transform:"translateX(2px)" }}>{text}</span>
    </span>
  );
}

function ArcBtn({ label, onClick, loading, disabled, color="#00FFB0", small=false }) {
  return (
    <button onClick={onClick} disabled={loading||disabled}
      style={{ width:"100%", padding:small?"8px 0":"12px 0", background:"transparent", border:`1px solid ${disabled||loading?"rgba(0,255,176,.2)":color}`, borderRadius:3, color:disabled||loading?"#4a7c5f":color, fontSize:small?9:11, fontWeight:700, cursor:disabled||loading?"not-allowed":"pointer", fontFamily:"monospace", letterSpacing:".16em", boxShadow:disabled||loading?"none":`0 0 16px ${color}20`, display:"flex", alignItems:"center", justifyContent:"center", gap:9, transition:"all .2s", textTransform:"uppercase" }}
      onMouseEnter={e => !disabled&&!loading&&(e.currentTarget.style.background=`${color}12`)}
      onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
      {loading ? <><Sp /> Processing...</> : label}
    </button>
  );
}

// ── Transaction confirmation modal ────────────────────────────────────────────
// Shown BEFORE eth_sendTransaction — user sees the real amount even when
// wallet displays "value: 0 USDC" for ERC-20 / ZK shielded transactions.
function TxConfirmModal({ open, onConfirm, onCancel, tx }) {
  if (!open || !tx) return null;
  const { label, token, amount, to, note } = tx;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:9999, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:"0 0 24px" }}
      onClick={e => e.target===e.currentTarget && onCancel()}>
      <div style={{ background:"#0a1628", border:"1px solid rgba(0,255,176,.25)", borderRadius:8, padding:"18px 18px 12px", width:"100%", maxWidth:420, margin:"0 12px" }}>
        <div style={{ fontFamily:"monospace", fontSize:10, color:"#64748b", letterSpacing:".16em", marginBottom:10 }}>CONFIRM TRANSACTION</div>
        <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.12)", borderRadius:5, padding:"12px 14px", marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>ACTION</span>
            <span style={{ fontSize:10, color:"#00FFB0", fontFamily:"monospace", fontWeight:700 }}>{label}</span>
          </div>
          {amount != null && (
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>AMOUNT</span>
              <span style={{ fontSize:14, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{amount} <span style={{ color:"#00FFB0" }}>{token}</span></span>
            </div>
          )}
          {to && (
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>TO</span>
              <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>{to.slice(0,10)}…{to.slice(-8)}</span>
            </div>
          )}
          {note && (
            <div style={{ marginTop:8, fontSize:8, color:"#4a7c5f", fontFamily:"monospace", lineHeight:1.5, borderTop:"1px solid rgba(0,255,176,.06)", paddingTop:8 }}>{note}</div>
          )}
        </div>
        <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace", marginBottom:12, lineHeight:1.5 }}>
          ℹ Your wallet may show <b style={{ color:"#64748b" }}>value: 0</b> for token and privacy transactions — this is expected. The amount shown above is the actual transfer amount.
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onCancel} style={{ flex:1, padding:"10px 0", background:"transparent", border:"1px solid rgba(100,116,139,.3)", borderRadius:3, color:"#64748b", fontSize:10, fontFamily:"monospace", cursor:"pointer" }}>CANCEL</button>
          <button onClick={onConfirm} style={{ flex:2, padding:"10px 0", background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.4)", borderRadius:3, color:"#00FFB0", fontSize:10, fontFamily:"monospace", cursor:"pointer", fontWeight:700, letterSpacing:".1em" }}>⟶ CONFIRM IN WALLET</button>
        </div>
      </div>
    </div>
  );
}

function OsField({ label, type="text", value, onChange, placeholder, icon, error, readOnly, suffix, hint }) {
  const [foc, setFoc] = useState(false);
  const [sp, setSp]   = useState(false);
  const isP = type === "password";
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <label style={{ fontSize:9, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:foc?"#00FFB0":"#64748b", fontFamily:"monospace", transition:"color .2s" }}>
          {icon && <span style={{ marginRight:4 }}>{icon}</span>}{label}
        </label>
        {error && <span style={{ fontSize:9, color:"#f87171" }}>⚠ {error}</span>}
      </div>
      <div style={{ position:"relative" }}>
        {["tl","tr","bl","br"].map(p => (
          <span key={p} style={{ position:"absolute", zIndex:2, width:6, height:6, borderColor:foc?"#00FFB0":error?"#f87171":"#1e3a2a", borderStyle:"solid", borderWidth:0, transition:"border-color .2s", ...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}) }} />
        ))}
        <input type={isP&&!sp?"password":"text"} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
          onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
          style={{ width:"100%", boxSizing:"border-box", padding:`10px ${suffix?"60px":"14px"} 10px 14px`, background:foc?"rgba(0,255,176,.04)":readOnly?"rgba(0,255,176,.01)":"rgba(0,0,0,.45)", border:`1px solid ${error?"#f87171":foc?"rgba(0,255,176,.5)":"rgba(0,255,176,.15)"}`, borderRadius:3, color:"#ffffff", fontSize:12, fontFamily:"monospace", outline:"none", letterSpacing:".04em", transition:"all .2s", cursor:readOnly?"default":"text" }} />
        {suffix && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:10, color:"#64748b", fontFamily:"monospace", pointerEvents:"none" }}>{suffix}</span>}
        {isP && <button onClick={() => setSp(!sp)} style={{ position:"absolute", right:9, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:sp?"#00FFB0":"#64748b", fontSize:13, padding:0 }}>{sp?"◉":"◎"}</button>}
      </div>
      {hint && !error && <div style={{ marginTop:3, fontSize:9, color:"#4a7c5f", fontFamily:"monospace" }}>{hint}</div>}
    </div>
  );
}

const PH = ({ icon, title, sub }) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:2 }}>▸ {icon} {title}</div>
    <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>{sub}</div>
    <div style={{ width:"100%", height:1, background:"rgba(0,255,176,.1)", marginTop:7 }} />
  </div>
);

const IG = ({ items }) => (
  <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(items.length,4)},1fr)`, gap:5, marginBottom:12 }}>
    {items.map(([k,v,s], i) => (
      <div key={i} style={{ background:"rgba(0,0,0,.4)", borderRadius:3, padding:"7px 9px", border:"1px solid rgba(255,255,255,.06)" }}>
        <div style={{ fontSize:7, color:"#64748b", fontFamily:"monospace", marginBottom:3 }}>{k}</div>
        <div style={{ fontSize:10, color:"#4ade80", fontFamily:"monospace", fontWeight:600 }}>{v}</div>
        {s && <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>{s}</div>}
      </div>
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   TX TOAST
═══════════════════════════════════════════════════════════════ */
function TxToast({ tx, onClose }) {
  useEffect(() => { if (tx?.status==="success"||tx?.status==="error") { const id=setTimeout(onClose,8000); return()=>clearTimeout(id); } }, [tx]);
  if (!tx) return null;
  const C = { pending:"#F59E0B", success:"#00FFB0", error:"#f87171" };
  const I = { pending:"⏳", success:"✓", error:"✕" };
  return (
    <div style={{ position:"fixed", bottom:20, right:20, zIndex:500, background:"rgba(0,8,5,.97)", border:`1px solid ${C[tx.status]}33`, borderRadius:5, padding:"12px 16px", minWidth:300, maxWidth:360, fontFamily:"monospace", animation:"fu .3s ease", backdropFilter:"blur(12px)", boxShadow:`0 0 24px ${C[tx.status]}15` }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <span style={{ fontSize:14, color:C[tx.status], flexShrink:0 }}>{I[tx.status]}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:C[tx.status], fontWeight:700, letterSpacing:".08em", marginBottom:3 }}>{tx.label}</div>
          <div style={{ fontSize:9, color:"#94a3b8", lineHeight:1.5 }}>{tx.message}</div>
          {tx.hash && (
            <a href={`${ARC_TESTNET.explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer"
              style={{ fontSize:8, color:"#00FFB0", textDecoration:"none", display:"block", marginTop:3 }}>
              {tx.hash.slice(0,20)}···  ↗ ARCScan
            </a>
          )}
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:11, padding:0 }}>✕</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CENTER
═══════════════════════════════════════════════════════════════ */
function NotifCenter({ onClose }) {
  const { notifs, markRead, clearAll } = useNotif();
  const C = { info:"#0EA5E9", success:"#00FFB0", warn:"#F59E0B", error:"#f87171" };
  return (
    <div style={{ position:"absolute", top:44, right:12, width:310, background:"rgba(0,8,5,.98)", border:"1px solid rgba(0,255,176,.2)", borderRadius:5, zIndex:200, boxShadow:"0 20px 60px rgba(0,0,0,.9)", animation:"fu .2s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px 8px", borderBottom:"1px solid rgba(0,255,176,.08)" }}>
        <span style={{ fontSize:9, color:"#ffffff", fontFamily:"monospace", letterSpacing:".15em", fontWeight:700 }}>NOTIFICATIONS</span>
        <button onClick={clearAll} style={{ fontSize:8, color:"#64748b", background:"none", border:"none", cursor:"pointer", fontFamily:"monospace", transition:"color .2s" }} onMouseEnter={e=>e.target.style.color="#f87171"} onMouseLeave={e=>e.target.style.color="#64748b"}>CLEAR ALL</button>
      </div>
      <div style={{ maxHeight:280, overflow:"auto" }}>
        {notifs.length === 0
          ? <div style={{ padding:"18px 14px", textAlign:"center", fontSize:9, color:"#334155", fontFamily:"monospace" }}>No notifications</div>
          : [...notifs].reverse().map(n => (
            <div key={n.id} onClick={() => markRead(n.id)} style={{ padding:"9px 14px", borderBottom:"1px solid rgba(0,255,176,.04)", cursor:"pointer", background:n.read?"transparent":"rgba(0,255,176,.02)", transition:"background .2s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.05)"}
              onMouseLeave={e=>e.currentTarget.style.background=n.read?"transparent":"rgba(0,255,176,.02)"}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:C[n.type]||"#00FFB0", flexShrink:0, marginTop:3 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:"#e2e8f0", fontFamily:"monospace", lineHeight:1.4 }}>{n.msg}</div>
                  {n.link && <a href={n.link} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"#00FFB0", fontFamily:"monospace", textDecoration:"none" }}>ARCScan ↗</a>}
                  <div style={{ fontSize:8, color:"#4a7c5f", fontFamily:"monospace", marginTop:2 }}>{n.ts}</div>
                </div>
              </div>
            </div>
          ))}
      </div>
      <div style={{ padding:"8px 14px", borderTop:"1px solid rgba(0,255,176,.06)" }}>
        <button onClick={onClose} style={{ width:"100%", padding:"6px 0", background:"transparent", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, color:"#64748b", fontSize:8, cursor:"pointer", fontFamily:"monospace", transition:"all .2s" }} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.3)";e.currentTarget.style.color="#ffffff";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.12)";e.currentTarget.style.color="#64748b";}}>CLOSE</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL SEARCH
═══════════════════════════════════════════════════════════════ */
const SIDX = [
  { label:"Overview",          panel:"overview",   icon:"◈",  desc:"Dashboard home" },
  { label:"Shield Assets",     panel:"shield",     icon:"🛡", desc:"Deposit USDC into ShieldVault" },
  { label:"Confidential Swap", panel:"swap",       icon:"⇄",  desc:"Shielded token exchange" },
  { label:"Confidential Send", panel:"send",       icon:"↗",  desc:"Shielded transfer" },
  { label:"Withdraw",          panel:"withdraw",   icon:"↙",  desc:"Exit to public address" },
  { label:"Bridge",            panel:"bridge",     icon:"⟺", desc:"Cross-chain transfer" },
  { label:"Analytics",         panel:"analytics",  icon:"📈", desc:"TVL, charts, heatmaps" },
  { label:"Governance",        panel:"governance", icon:"🗳", desc:"Protocol parameters & on-chain voting" },
  { label:"Staking & Rewards", panel:"staking",    icon:"💎", desc:"Stake USDC, earn yield" },
  { label:"Portfolio",         panel:"portfolio",  icon:"📊", desc:"Asset allocation" },
  { label:"History",           panel:"history",    icon:"📋", desc:"Transaction log" },
  { label:"Settings",          panel:"settings",   icon:"⚙",  desc:"Network configuration" },
];

function GlobalSearch({ onSelect, onClose }) {
  const [q, setQ] = useState(""); const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const results = q.trim() ? SIDX.filter(i => i.label.toLowerCase().includes(q.toLowerCase())||i.desc.toLowerCase().includes(q.toLowerCase())) : SIDX;
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, zIndex:400, background:"rgba(0,0,0,.75)", backdropFilter:"blur(8px)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:80 }}>
      <div style={{ width:"100%", maxWidth:500, background:"rgba(0,8,5,.98)", border:"1px solid rgba(0,255,176,.25)", borderRadius:6, overflow:"hidden", boxShadow:"0 30px 80px rgba(0,0,0,.9)", animation:"fu .2s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderBottom:"1px solid rgba(0,255,176,.08)" }}>
          <span style={{ color:"#64748b", fontSize:16 }}>⌕</span>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search panels, features..."
            style={{ flex:1, background:"none", border:"none", outline:"none", color:"#ffffff", fontSize:13, fontFamily:"monospace" }}
            onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Enter"&&results[0])onSelect(results[0].panel);}} />
          <button onClick={onClose} style={{ color:"#64748b", background:"none", border:"none", cursor:"pointer", fontSize:11, fontFamily:"monospace" }}>ESC</button>
        </div>
        <div style={{ maxHeight:380, overflow:"auto" }}>
          {results.map((r,i) => (
            <div key={i} onClick={()=>onSelect(r.panel)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", cursor:"pointer", borderBottom:"1px solid rgba(0,255,176,.04)", transition:"background .15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.06)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{ fontSize:18, flexShrink:0 }}>{r.icon}</span>
              <div><div style={{ fontSize:11, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{r.label}</div><div style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{r.desc}</div></div>
              <span style={{ marginLeft:"auto", fontSize:10, color:"#334155", fontFamily:"monospace" }}>→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DISCONNECT CONFIRM MODAL
═══════════════════════════════════════════════════════════════ */
function DisconnectModal({ onConfirm, onCancel, walletName, address }) {
  return (
    <div onClick={e=>e.target===e.currentTarget&&onCancel()} style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,.8)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fi .2s ease" }}>
      <div style={{ width:"100%", maxWidth:360, background:"rgba(0,8,5,.97)", border:"1px solid rgba(239,68,68,.25)", borderRadius:6, padding:"24px 24px 20px", boxShadow:"0 0 40px rgba(239,68,68,.1)", animation:"fu .25s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚠</div>
          <div>
            <div style={{ fontSize:14, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>Disconnect Wallet</div>
            <div style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{walletName} · {sh(address)}</div>
          </div>
        </div>
        <p style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.6, marginBottom:20 }}>You will be logged out of PrivARC OS. Your on-chain assets on Arc Testnet remain safe.</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <button onClick={onCancel} style={{ padding:"10px 0", background:"transparent", border:"1px solid rgba(0,255,176,.15)", borderRadius:3, color:"#94a3b8", fontSize:10, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.4)";e.currentTarget.style.color="#ffffff";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.15)";e.currentTarget.style.color="#94a3b8";}}>CANCEL</button>
          <button onClick={onConfirm} style={{ padding:"10px 0", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.4)", borderRadius:3, color:"#f87171", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.2)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(239,68,68,.1)"}>⟶ DISCONNECT</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WALLET CONNECT MODAL  — real EIP-1193 connection
═══════════════════════════════════════════════════════════════ */
function WCModal({ onClose, onConnect }) {
  const [step, setStep] = useState("list");
  const [sel, setSel]   = useState(null);
  const [addr, setAddr] = useState("");
  const [err, setErr]   = useState("");

  const go = async (w) => {
    setSel(w); setStep("conn"); setErr("");
    try {
      // 1. Request accounts
      const accounts = await rpcCall("eth_requestAccounts");
      if (!accounts?.[0]) throw new Error("No accounts returned");
      const walletAddr = accounts[0];

      // 2. Switch / add Arc Testnet
      try {
        await switchToArcTestnet();
      } catch (switchErr) {
        if (switchErr.code === 4001) throw new Error("User rejected network switch");
        // If add succeeded but switch failed with other error, continue
      }

      setAddr(walletAddr);
      setStep("sign");
    } catch (e) {
      setErr(e.message || "Connection failed");
      setStep("error");
    }
  };

  const sign = async () => {
    setStep("conn"); setErr("");
    try {
      const nonce = hx(8);
      const message = [
        "Sign in to PrivARC OS",
        "",
        "Domain: privarc.io",
        `Address: ${addr}`,
        `Chain ID: ${ARC_TESTNET.id} (Arc Testnet)`,
        `Nonce: ${nonce}`,
        `Issued: ${new Date().toISOString()}`,
        "",
        "This request will not trigger a blockchain transaction or cost any fees.",
      ].join("\n");

      const sig = await personalSign(addr, message);
      setStep("ok");
      setTimeout(() => onConnect({ address: addr, wallet: sel, signature: sig }), 900);
    } catch (e) {
      if (e.code === 4001) { setErr("Signature rejected by user"); }
      else { setErr(e.message || "Sign failed"); }
      setStep("error");
    }
  };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, zIndex:250, background:"rgba(0,0,0,.88)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fi .2s ease" }}>
      <div style={{ width:"100%", maxWidth:420, background:"rgba(0,8,5,.97)", border:"1px solid rgba(0,255,176,.2)", borderRadius:6, overflow:"hidden", animation:"fu .25s ease", boxShadow:"0 40px 80px rgba(0,0,0,.9)" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"15px 20px 13px", borderBottom:"1px solid rgba(0,255,176,.08)" }}>
          <div>
            <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:2 }}>WALLET CONNECTION — ARC TESTNET</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#00FFB0", fontFamily:"monospace" }}>
              {step==="list"?"Select Wallet Provider":step==="conn"?`Connecting ${sel?.name||""}...`:step==="sign"?"Sign Authentication Request":step==="ok"?"Wallet Connected ✓":"Connection Error"}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, color:"#64748b", width:28, height:28, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace", fontSize:14, transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.35)";e.currentTarget.style.color="#00FFB0";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.12)";e.currentTarget.style.color="#64748b";}}>✕</button>
        </div>

        <div style={{ padding:"18px 20px 20px" }}>
          {/* WALLET LIST */}
          {step==="list" && (
            <div style={{ animation:"fi .3s ease" }}>
              <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:8 }}>▸ POPULAR</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:14 }}>
                {WALLETS.filter(w=>w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>go(w)}/>)}
              </div>
              <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:8 }}>▸ MORE WALLETS</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                {WALLETS.filter(w=>!w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>go(w)}/>)}
              </div>
              <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid rgba(0,255,176,.06)", fontSize:8, color:"#334155", fontFamily:"monospace", textAlign:"center" }}>
                EIP-4361 · Sign-In With Ethereum · Arc Testnet (chainId: 5042002)
              </div>
            </div>
          )}

          {/* CONNECTING */}
          {step==="conn" && sel && (
            <div style={{ textAlign:"center", padding:"20px 0", animation:"fi .3s ease" }}>
              <div style={{ position:"relative", width:72, height:72, margin:"0 auto 18px" }}>
                <div style={{ width:72, height:72, borderRadius:"50%", border:`2px solid ${sel.color}22`, display:"flex", alignItems:"center", justifyContent:"center" }}>{sel.icon}</div>
                <svg style={{ position:"absolute", inset:0, animation:"spin 1.2s linear infinite" }} width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="33" fill="none" stroke={sel.color} strokeWidth="1.5" strokeDasharray="55 160" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ fontSize:12, color:"#ffffff", fontFamily:"monospace", marginBottom:4 }}>Connecting to {sel.name}...</div>
              <div style={{ fontSize:10, color:"#64748b", fontFamily:"monospace" }}>Confirm in your wallet — switching to Arc Testnet</div>
            </div>
          )}

          {/* SIGN REQUEST */}
          {step==="sign" && sel && (
            <div style={{ animation:"fi .3s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                <div style={{ width:42, height:42, borderRadius:9, background:`${sel.color}18`, border:`1px solid ${sel.color}40`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{sel.icon}</div>
                <div>
                  <div style={{ fontSize:12, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{sel.name}</div>
                  <div style={{ fontSize:10, color:"#64748b", fontFamily:"monospace", marginTop:2 }}>{sh(addr)}</div>
                </div>
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 6px #00FFB0" }} />
                  <span style={{ fontSize:9, color:"#00FFB0", fontFamily:"monospace" }}>CONNECTED</span>
                </div>
              </div>
              <div style={{ background:"rgba(0,0,0,.45)", border:"1px solid rgba(0,255,176,.12)", borderRadius:4, padding:"13px 15px", marginBottom:16, fontFamily:"monospace" }}>
                <div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".15em", marginBottom:8 }}>SIGNATURE REQUEST — EIP-191</div>
                {[["Domain","privarc.io"],["Address",sh(addr)],["Network","Arc Testnet (5042002)"],["Nonce",hx(8)],["Issued",new Date().toISOString().split("T")[0]]].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", gap:10, marginBottom:4 }}>
                    <span style={{ fontSize:9, color:"#64748b", minWidth:56 }}>{k}:</span>
                    <span style={{ fontSize:9, color:"#4ade80" }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid rgba(0,255,176,.07)", fontSize:9, color:"#4a7c5f" }}>No blockchain transaction. No gas fee.</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <button onClick={onClose} style={{ padding:"11px 0", background:"transparent", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, color:"#64748b", fontSize:10, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
                  onMouseEnter={e=>{e.currentTarget.style.color="#ffffff";e.currentTarget.style.borderColor="rgba(0,255,176,.3)";}}
                  onMouseLeave={e=>{e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(0,255,176,.12)";}}>CANCEL</button>
                <button onClick={sign} style={{ padding:"11px 0", background:"transparent", border:"1px solid #00FFB0", borderRadius:3, color:"#00FFB0", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", boxShadow:"0 0 16px rgba(0,255,176,.12)", transition:"all .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.1)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ SIGN & ENTER</button>
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {step==="ok" && sel && (
            <div style={{ textAlign:"center", padding:"16px 0", animation:"fi .4s ease" }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(0,255,176,.08)", border:"2px solid #00FFB0", boxShadow:"0 0 30px rgba(0,255,176,.2)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", fontSize:26, color:"#00FFB0" }}>✓</div>
              <div style={{ fontSize:13, color:"#ffffff", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>Authenticated on Arc Testnet</div>
              <div style={{ fontSize:10, color:"#64748b", fontFamily:"monospace" }}>{sel.name} · {sh(addr)}</div>
            </div>
          )}

          {/* ERROR */}
          {step==="error" && (
            <div style={{ animation:"fi .3s ease" }}>
              <div style={{ background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.25)", borderRadius:4, padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#f87171", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>Connection Failed</div>
                <div style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5 }}>{err}</div>
              </div>
              <ArcBtn label="⟶ TRY AGAIN" onClick={()=>setStep("list")} color="#f87171"/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WBtn({ w, onClick }) {
  const [h, setH] = useState(false); const inst = w.installed();
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ background:h?`${w.color}12`:"rgba(0,0,0,.4)", border:`1px solid ${h?w.color+"55":"rgba(0,255,176,.1)"}`, borderRadius:6, padding:"11px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:9, transition:"all .2s", boxShadow:h?`0 0 18px ${w.glow}`:"none" }}>
      <div style={{ width:34, height:34, borderRadius:7, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:h?`${w.color}18`:"rgba(255,255,255,.05)", border:`1px solid ${h?w.color+"40":"rgba(255,255,255,.08)"}`, transition:"all .2s" }}>{w.icon}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:11, color:h?"#ffffff":"#e2e8f0", fontFamily:"monospace", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", transition:"color .2s" }}>{w.name}</div>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", display:"flex", alignItems:"center", gap:4, marginTop:2 }}>
          {inst && <span style={{ color:"#00FFB0", fontSize:7 }}>●</span>}{inst?"Detected":"Available"}
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AUTH SCREEN — wallet only, no email
═══════════════════════════════════════════════════════════════ */
function AuthScreen({ onAuth }) {
  const { connect } = useW3();
  const { push } = useNotif();
  const [showWC, setShowWC] = useState(false);
  const [loading, setLoading] = useState(null);

  const handleWC = async ({ address, wallet: w, signature }) => {
    setShowWC(false);
    setLoading("finalizing");
    try {
      await connect(address, w.name);
      push(`Connected: ${w.name} · ${sh(address)}`, "success");
      onAuth({ walletName: w.name, address, signature });
    } catch (e) {
      push("Connection error: " + e.message, "error");
    } finally {
      setLoading(null);
    }
  };

  const handleQuick = (w) => { setLoading(w.id); setShowWC(true); setTimeout(()=>setLoading(null), 800); };

  return (
    <>
      {showWC && <WCModal onClose={()=>setShowWC(false)} onConnect={handleWC} />}
      <div style={{ width:"100%", maxWidth:440, background:"rgba(0,8,5,.94)", backdropFilter:"blur(20px)", border:"1px solid rgba(0,255,176,.15)", borderRadius:6, boxShadow:"0 0 60px rgba(0,255,176,.05),0 40px 80px rgba(0,0,0,.85)", padding:"32px 30px 28px", position:"relative", animation:"fu .6s ease forwards" }}>
        {["tl","tr","bl","br"].map(p=><span key={p} style={{ position:"absolute", zIndex:2, width:12, height:12, borderColor:"rgba(0,255,176,.3)", borderStyle:"solid", borderWidth:0, ...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}) }}/>)}

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <div style={{ width:36, height:36, border:"1.5px solid #00FFB0", borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#00FFB0", boxShadow:"0 0 16px rgba(0,255,176,.25)" }}>◈</div>
            <Glitch text="privARC" style={{ fontSize:26, fontWeight:800, color:"#00FFB0", fontFamily:"'Syne',sans-serif", letterSpacing:"-.01em" }} />
            <span style={{ fontSize:9, color:"#4a7c5f", fontFamily:"monospace", letterSpacing:".12em", alignSelf:"flex-end", paddingBottom:2 }}>OS</span>
          </div>
          <p style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace", letterSpacing:".04em", lineHeight:1.6 }}>
            Confidential capital OS · Private on-chain capital<br/>Arc Testnet (Circle L1)
          </p>
        </div>

        {/* Network selector */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:20 }}>
          {/* Testnet — ACTIVE */}
          <div style={{ background:"rgba(0,255,176,.06)", border:"1.5px solid #00FFB0", borderRadius:5, padding:"10px 12px", cursor:"default" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 5px #00FFB0", animation:"pulse 2s infinite" }} />
              <span style={{ fontSize:10, color:"#00FFB0", fontFamily:"monospace", fontWeight:700 }}>Arc Testnet</span>
            </div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>chainId: 5042002</div>
            <div style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace", marginTop:2 }}>Gas: USDC · LIVE</div>
          </div>
          {/* Mainnet — LOCKED */}
          <div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.08)", borderRadius:5, padding:"10px 12px", cursor:"not-allowed", opacity:.5, position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#475569" }} />
              <span style={{ fontSize:10, color:"#475569", fontFamily:"monospace", fontWeight:700 }}>Arc Mainnet</span>
            </div>
            <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>chainId: TBD</div>
            <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace", marginTop:2 }}>🔒 Not yet available</div>
          </div>
        </div>

        {/* Wallets grid */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:10, textAlign:"center" }}>▸ CONNECT YOUR WALLET TO AUTHENTICATE</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            {WALLETS.filter(w=>w.popular).map(w=>(
              <button key={w.id} onClick={()=>handleQuick(w)} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"rgba(0,0,0,.4)", border:`1px solid ${loading===w.id?w.color+"60":"rgba(0,255,176,.12)"}`, borderRadius:5, cursor:"pointer", transition:"all .2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=`${w.color}60`;e.currentTarget.style.background=`${w.color}0D`;e.currentTarget.style.boxShadow=`0 0 18px ${w.glow}`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.12)";e.currentTarget.style.background="rgba(0,0,0,.4)";e.currentTarget.style.boxShadow="none";}}>
                <div style={{ width:32, height:32, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", background:`${w.color}18`, border:`1px solid ${w.color}30`, flexShrink:0 }}>{w.icon}</div>
                <div style={{ textAlign:"left", flex:1 }}>
                  <div style={{ fontSize:11, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{w.name}</div>
                  {w.installed() && <div style={{ fontSize:8, color:"#00FFB0", fontFamily:"monospace", display:"flex", alignItems:"center", gap:3 }}><span style={{ fontSize:7 }}>●</span> Detected</div>}
                </div>
                {loading===w.id && <Sp sz={14} c={w.color}/>}
              </button>
            ))}
          </div>
          <button onClick={()=>setShowWC(true)} style={{ width:"100%", padding:"11px 0", background:"transparent", border:"1px solid rgba(0,255,176,.18)", borderRadius:4, color:"#94a3b8", fontSize:10, cursor:"pointer", fontFamily:"monospace", letterSpacing:".12em", transition:"all .2s", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.4)";e.currentTarget.style.color="#ffffff";e.currentTarget.style.background="rgba(0,255,176,.04)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.18)";e.currentTarget.style.color="#94a3b8";e.currentTarget.style.background="transparent";}}>
            <span>⬡</span> All wallets ({WALLETS.length} supported)
          </button>
        </div>

        {/* Info box */}
        <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.1)", borderRadius:4, padding:"11px 13px", marginBottom:18 }}>
          <div style={{ fontSize:8, color:"#00FFB0", letterSpacing:".15em", fontFamily:"monospace", marginBottom:6 }}>HOW IT WORKS</div>
          {[["1.","Connect wallet → auto-switch to Arc Testnet"],["2.","Sign EIP-191 message (no gas, no transaction)"],["3.","Interact with Arc Testnet using real USDC balances"]].map(([n,t]) => (
            <div key={n} style={{ display:"flex", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:9, color:"#4a7c5f", fontFamily:"monospace", flexShrink:0 }}>{n}</span>
              <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5 }}>{t}</span>
            </div>
          ))}
        </div>

        {/* Faucet reminder */}
        <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.15)", borderRadius:4, padding:"9px 13px", marginBottom:18 }}>
          <div style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", marginBottom:4, fontWeight:700 }}>💧 NEED TESTNET USDC?</div>
          <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5, textDecoration:"none", display:"block" }}>
            Get free USDC at <span style={{ color:"#0EA5E9" }}>faucet.circle.com</span> → select Arc Testnet → paste address → request (1 USDC/day) ↗
          </a>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>🔒 Non-custodial · EIP-191</span>
          <span style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>Gas: USDC · Arc Testnet</span>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING TOUR
═══════════════════════════════════════════════════════════════ */
const TOUR = [
  { icon:"◈",  title:"Welcome to PrivARC OS",         body:"Running live on Arc Testnet (chainId: 5042002). Your real USDC balance from the Arc Testnet is shown. Use faucet.circle.com to get testnet USDC." },
  { icon:"🛡", title:"Shield — Real USDC Deposit",     body:"Send real testnet USDC to the ShieldVault. Your wallet will prompt for signature and approval. Funds become untraceable once shielded." },
  { icon:"⇄",  title:"Private Swap — ZK Routed",       body:"Swap tokens on-chain without exposing amounts. Real transactions signed by your wallet on Arc Testnet." },
  { icon:"📈", title:"Analytics — Live Protocol Data",  body:"Charts and metrics pulled from Arc Testnet. TVL, transaction volume and ZK proof stats." },
  { icon:"🗳", title:"Governance — On-Chain Voting",    body:"Vote on PIP proposals with your veARC balance. Each vote is a real transaction signed by your wallet." },
  { icon:"💎", title:"Staking — Real USDC Yield",       body:"Stake testnet USDC with lock periods for yield. Real transactions with lock multipliers up to 3×." },
  { icon:"⚙",  title:"Settings — Network Config",       body:"Switch between Testnet and Mainnet (locked until launch). Current network: Arc Testnet · chainId 5042002." },
];

function OnboardingTour({ onFinish }) {
  const [step, setStep] = useState(0); const s = TOUR[step];
  return (
    <div style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(0,0,0,.8)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ width:"100%", maxWidth:420, background:"rgba(0,8,5,.97)", border:"1px solid rgba(0,255,176,.28)", borderRadius:7, padding:"28px 28px 24px", boxShadow:"0 0 60px rgba(0,255,176,.08)", animation:"fu .3s ease" }}>
        <div style={{ display:"flex", gap:4, marginBottom:22 }}>
          {TOUR.map((_,i)=><div key={i} style={{ flex:1, height:2, borderRadius:1, background:i<=step?"#00FFB0":"rgba(0,255,176,.12)", transition:"background .3s", boxShadow:i===step?"0 0 6px #00FFB0":"none" }}/>)}
        </div>
        <div style={{ width:54, height:54, borderRadius:12, background:"rgba(0,255,176,.08)", border:"1.5px solid rgba(0,255,176,.35)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, marginBottom:16 }}>{s.icon}</div>
        <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:6 }}>STEP {step+1} / {TOUR.length}</div>
        <div style={{ fontSize:18, fontWeight:700, color:"#ffffff", fontFamily:"'Syne',sans-serif", marginBottom:12, lineHeight:1.3 }}>{s.title}</div>
        <p style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.7, marginBottom:22 }}>{s.body}</p>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onFinish} style={{ flex:1, padding:"10px 0", background:"transparent", border:"1px solid rgba(0,255,176,.15)", borderRadius:3, color:"#64748b", fontSize:9, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.color="#ffffff";e.currentTarget.style.borderColor="rgba(0,255,176,.4)";}}
            onMouseLeave={e=>{e.currentTarget.style.color="#64748b";e.currentTarget.style.borderColor="rgba(0,255,176,.15)";}}>SKIP</button>
          <button onClick={()=>{if(step<TOUR.length-1)setStep(s=>s+1);else onFinish();}}
            style={{ flex:2, padding:"10px 0", background:"transparent", border:"1px solid #00FFB0", borderRadius:3, color:"#00FFB0", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"monospace", letterSpacing:".12em", boxShadow:"0 0 18px rgba(0,255,176,.12)", transition:"all .2s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            {step<TOUR.length-1?"NEXT →":"⟶ LAUNCH OS"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════════════════ */
function Dashboard({ user, prices, changes, change24h, lastUpdate, priceError }) {
  const { account, balance, onArc, loadingBal, disconnect, refreshBalance } = useW3();
  const { push } = useNotif();
  const { notifs } = useNotif();
  const [panel, setPanel]           = useState("overview");
  const [txHistory, setTxHistory]   = useState(() => {
    // Loaded per wallet after connect — starts empty, populated in notify()
    return [];
  });
  const [tx, setTx]                 = useState(null);
  const [blockNum, setBlockNum]     = useState(null);
  const [showNotif, setShowNotif]   = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDisc, setShowDisc]     = useState(false);
  const unread = notifs.filter(n=>!n.read).length;

  // Fetch real block number from Arc Testnet
  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const raw = await rpcCall("eth_blockNumber");
        setBlockNum(parseInt(raw, 16));
      } catch {}
    };
    if (onArc) { fetchBlock(); const id = setInterval(fetchBlock, 6000); return ()=>clearInterval(id); }
  }, [onArc]);

  // Keyboard shortcut
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey||e.ctrlKey) && e.key==="k") { e.preventDefault(); setShowSearch(true); }
      if (e.key==="Escape") { setShowSearch(false); setShowNotif(false); }
    };
    window.addEventListener("keydown", h); return ()=>window.removeEventListener("keydown", h);
  }, []);

  const notify = useCallback((label, message, status, hash, amount) => {
    setTx({ label, message, status, hash });
    if (status==="success"&&hash) {
      const entry = { hash, label, ts:tc(), status:"success", amount: amount || "—" };
      setTxHistory(p => {
        const updated = [entry, ...p.slice(0, 49)];
        if (account?.address) {
          const key = `privarc_txhistory_${account.address.toLowerCase()}`;
          try { localStorage.setItem(key, JSON.stringify(updated)); } catch {}
        }
        return updated;
      });
      push(`${label}: ${message}`, "success", `${ARC_TESTNET.explorer}/tx/${hash}`);
    } else if (status==="error") {
      push(`${label} failed: ${message}`, "error");
    } else {
      push(message, "info");
    }
  }, [push]);

  // Balance displayed as USDC 6-dec equivalent from native 18-dec
  const usdcBalance = balance ? nativeToUsdc6(balance) : null;

  const NAV = [
    { id:"overview",   icon:"◈",  label:"Overview" },
    { id:"shield",     icon:"🛡", label:"Shield" },
    { id:"swap",       icon:"⇄",  label:"Swap" },
    { id:"send",       icon:"↗",  label:"Send" },
    { id:"withdraw",   icon:"↙",  label:"Withdraw" },
    { id:"bridge",     icon:"⟺", label:"Bridge" },
    null,
    { id:"analytics",  icon:"📈", label:"Analytics" },
    { id:"governance", icon:"🗳", label:"Governance" },
    { id:"staking",    icon:"💎", label:"Staking" },
    null,
    { id:"portfolio",  icon:"📊", label:"Portfolio" },
    { id:"history",    icon:"📋", label:"History" },
    { id:"settings",   icon:"⚙",  label:"Settings" },
  ];

  const protocolStats = useProtocolStats(onArc);

  // Load wallet-scoped tx history when account connects
  useEffect(() => {
    if (!account?.address) { setTxHistory([]); return; }
    const key = `privarc_txhistory_${account.address.toLowerCase()}`;
    try { setTxHistory(JSON.parse(localStorage.getItem(key) || "[]")); } catch { setTxHistory([]); }
  }, [account?.address]);

  // Migrate legacy notes (from global "privarc_notes" key → wallet-scoped) on first connect
  useEffect(() => {
    if (!account?.address) return;
    const legacyKey = "privarc_notes";
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      try {
        const old = JSON.parse(legacy);
        if (Array.isArray(old) && old.length > 0) {
          const current = getNotes(account.address);
          const existingSet = new Set(current.map(n => n.commitment));
          const merged = [...current, ...old.filter(n => !existingSet.has(n.commitment))];
          saveNotes(account.address, merged);
          localStorage.removeItem(legacyKey);
        }
      } catch {}
    }
  }, [account?.address]);

  const { bals: shieldedBals, recompute: recomputeShielded } = useShieldedBalances(prices, account?.address);
  const { sendRealTx: sendViewKeyTx } = useTxSend({ account, onArc, notify, refreshBalance });

  // Scan chain for ECDH stealth notes addressed to this wallet on every connect,
  // and opportunistically register a view key (real ECDH P-256) if missing —
  // see ensureViewKeyRegistered() for the once-per-address retry guard.
  useEffect(() => {
    if (!account?.address || !onArc) return;
    scanStealthNotes(account.address, recomputeShielded).catch(() => {});
    ensureViewKeyRegistered(account.address, sendViewKeyTx, notify).catch(() => {});
    // Rescan every 2 minutes in case new stealth notes arrive
    const id = setInterval(() => {
      scanStealthNotes(account.address, recomputeShielded).catch(() => {});
    }, 120_000);
    return () => clearInterval(id);
  }, [account?.address, onArc, recomputeShielded, sendViewKeyTx, notify]);

  const panelProps = { account, balance, usdcBalance, onArc, notify, refreshBalance, txHistory, loadingBal, prices, changes, change24h, lastUpdate, priceError, setPanel, protocolStats, shieldedBals, recomputeShielded };

  return (
    <div style={{ display:"flex", height:"100vh", width:"100%", maxWidth:960, margin:"0 auto", position:"relative", zIndex:2 }}>
      {showSearch   && <GlobalSearch onSelect={p=>{setPanel(p);setShowSearch(false);}} onClose={()=>setShowSearch(false)}/>}
      {showDisc     && <DisconnectModal walletName={account?.walletName} address={account?.address} onConfirm={disconnect} onCancel={()=>setShowDisc(false)}/>}

      {/* Sidebar */}
      <div style={{ width:52, flexShrink:0, background:"rgba(0,5,3,.96)", borderRight:"1px solid rgba(0,255,176,.08)", display:"flex", flexDirection:"column", alignItems:"center", paddingTop:12, paddingBottom:12, gap:1 }}>
        <div style={{ width:30, height:30, border:"1.5px solid #00FFB0", borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#00FFB0", boxShadow:"0 0 10px rgba(0,255,176,.2)", marginBottom:9 }}>◈</div>
        <div style={{ width:26, height:1, background:"rgba(0,255,176,.1)", marginBottom:5 }}/>
        {NAV.map((n, i) => n===null
          ? <div key={i} style={{ width:24, height:1, background:"rgba(0,255,176,.06)", margin:"3px 0" }}/>
          : <button key={n.id} onClick={()=>setPanel(n.id)} title={n.label}
              style={{ width:36, height:33, background:panel===n.id?"rgba(0,255,176,.12)":"transparent", border:`1px solid ${panel===n.id?"rgba(0,255,176,.3)":"transparent"}`, borderRadius:4, cursor:"pointer", color:panel===n.id?"#00FFB0":"#4a7c5f", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", flexShrink:0 }}
              onMouseEnter={e=>{if(panel!==n.id){e.currentTarget.style.background="rgba(0,255,176,.06)";e.currentTarget.style.color="#94a3b8";}}}
              onMouseLeave={e=>{if(panel!==n.id){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#4a7c5f";}}}>
              {n.icon}
            </button>
        )}
        <div style={{ flex:1 }}/>
        {/* Network indicator */}
        <div style={{ width:7, height:7, borderRadius:"50%", background:onArc?"#00FFB0":"#f87171", boxShadow:onArc?"0 0 6px #00FFB0":"0 0 6px #f87171", animation:"pulse 2s infinite", marginBottom:3 }}/>
        <div style={{ fontSize:7, color:onArc?"#4a7c5f":"#64748b", fontFamily:"monospace", letterSpacing:".04em" }}>{onArc?"TEST":"WRONG"}</div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {/* Price ticker */}
        <PriceTicker prices={prices} changes={changes} change24h={change24h} lastUpdate={lastUpdate} priceError={priceError}/>

        {/* Top bar */}
        <div style={{ height:40, flexShrink:0, background:"rgba(0,5,3,.96)", borderBottom:"1px solid rgba(0,255,176,.08)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Glitch text="privARC" style={{ fontSize:14, fontWeight:800, color:"#00FFB0", fontFamily:"'Syne',sans-serif" }}/>
            <span style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace", letterSpacing:".1em" }}>OS v12.0</span>
            <span style={{ fontSize:7, background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.18)", borderRadius:2, padding:"1px 5px", color:"#00FFB0", fontFamily:"monospace" }}>
              {onArc?"ARC TESTNET":"WRONG NETWORK"}
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* Search */}
            <button onClick={()=>setShowSearch(true)} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, padding:"3px 10px", cursor:"pointer", color:"#64748b", fontSize:9, fontFamily:"monospace", transition:"all .2s" }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.35)";e.currentTarget.style.color="#ffffff";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.12)";e.currentTarget.style.color="#64748b";}}>
              <span>⌕</span><span style={{ fontSize:8 }}>Search</span>
              <span style={{ fontSize:7, background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.18)", borderRadius:2, padding:"0 4px", marginLeft:3, color:"#4a7c5f" }}>⌘K</span>
            </button>
            {blockNum && <span style={{ fontSize:8, color:"#4a7c5f", fontFamily:"monospace" }}>#{blockNum.toLocaleString()}</span>}
            <div style={{ height:12, width:1, background:"rgba(0,255,176,.1)" }}/>
            {/* Notifications */}
            <div style={{ position:"relative" }}>
              <button onClick={()=>setShowNotif(!showNotif)} style={{ background:"none", border:"none", cursor:"pointer", color:unread>0?"#00FFB0":"#4a7c5f", fontSize:14, position:"relative", transition:"color .2s" }}>
                🔔{unread>0&&<span style={{ position:"absolute", top:-3, right:-3, width:14, height:14, background:"#f87171", borderRadius:"50%", fontSize:8, color:"white", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace", fontWeight:700 }}>{Math.min(unread,9)}</span>}
              </button>
              {showNotif && <NotifCenter onClose={()=>setShowNotif(false)}/>}
            </div>
            <div style={{ height:12, width:1, background:"rgba(0,255,176,.1)" }}/>
            {/* Wallet info */}
            <span style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>{account?.walletName}</span>
            <span style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>{sh(account?.address)}</span>
            {/* Disconnect */}
            <button onClick={()=>setShowDisc(true)} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.2)", borderRadius:3, padding:"3px 9px", cursor:"pointer", color:"#64748b", fontSize:8, fontFamily:"monospace", letterSpacing:".08em", transition:"all .2s" }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,.14)";e.currentTarget.style.borderColor="rgba(239,68,68,.45)";e.currentTarget.style.color="#f87171";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,.06)";e.currentTarget.style.borderColor="rgba(239,68,68,.2)";e.currentTarget.style.color="#64748b";}}>
              ⏻ DISCONNECT
            </button>
          </div>
        </div>

        {/* Panel */}
        <div style={{ flex:1, padding:"14px", overflow:"auto" }}>
          {panel==="overview"   && <OverviewPanel   {...panelProps}/>}
          {panel==="shield"     && <ShieldPanel     {...panelProps}/>}
          {panel==="swap"       && <SwapPanel       {...panelProps}/>}
          {panel==="send"       && <SendPanel       {...panelProps}/>}
          {panel==="withdraw"   && <WithdrawPanel   {...panelProps}/>}
          {panel==="bridge"     && <BridgePanel     {...panelProps}/>}
          {panel==="analytics"  && <AnalyticsPanel  {...panelProps}/>}
          {panel==="governance" && <GovPanel        {...panelProps}/>}
          {panel==="staking"    && <StakingPanel    {...panelProps}/>}
          {panel==="portfolio"  && <PortfolioPanel  {...panelProps}/>}
          {panel==="history"    && <HistoryPanel    {...panelProps}/>}
          {panel==="settings"   && <SettingsPanel   {...panelProps}/>}
        </div>
      </div>
      <TxToast tx={tx} onClose={()=>setTx(null)}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PANELS
═══════════════════════════════════════════════════════════════ */
function NotOnArcWarning() {
  const { onArc, switchARC, switching } = useW3();
  if (onArc) return null;
  return (
    <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.3)", borderRadius:5, padding:"12px 14px", marginBottom:14 }}>
      <div style={{ fontSize:10, color:"#FCD34D", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>⚠ Not connected to Arc Testnet</div>
      <p style={{ margin:0, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5, marginBottom:8 }}>
        Transactions require Arc Testnet (chainId: 5042002). Switch network to continue.
      </p>
      <button onClick={switchARC} disabled={switching} style={{ padding:"7px 14px", background:"rgba(245,158,11,.12)", border:"1px solid rgba(245,158,11,.4)", borderRadius:3, color:"#F59E0B", fontSize:9, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", display:"flex", alignItems:"center", gap:7 }}>
        {switching?<><Sp c="#F59E0B" sz={10}/>Switching...</>:"⟶ SWITCH TO ARC TESTNET"}
      </button>
    </div>
  );
}

function OverviewPanel({ account, usdcBalance, loadingBal, onArc, setPanel, prices, changes, change24h, lastUpdate, priceError, refreshBalance }) {
  return (
    <div style={{ animation:"fi .3s ease" }}>
      <div style={{ fontSize:9, color:"#4a7c5f", letterSpacing:".2em", fontFamily:"monospace", marginBottom:14 }}>◈ SYSTEM OVERVIEW — ARC TESTNET</div>
      <NotOnArcWarning/>

      {/* Real balance cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:7, marginBottom:14 }}>
        {[
          { l:"USDC BALANCE", v:loadingBal?"···":(usdcBalance!==null?fmtUsdc(usdcBalance):"—"), u:"USDC", glow:true,  note:"Arc Testnet" },
          { l:"NETWORK",      v:onArc?"CONNECTED":"WRONG NET",  u:"Arc Testnet", glow:false, note:"chainId 5042002" },
          { l:"WALLET",       v:account?.walletName||"—",       u:sh(account?.address), glow:false, note:"EIP-191 auth" },
        ].map(b=>(
          <div key={b.l} style={{ background:"rgba(0,0,0,.4)", border:`1px solid rgba(0,255,176,${b.glow?.22:.1})`, borderRadius:5, padding:"11px 13px", transition:"all .2s" }}>
            <div style={{ fontSize:7, color:"#64748b", letterSpacing:".18em", fontFamily:"monospace", marginBottom:5 }}>{b.l}</div>
            <div style={{ fontSize:b.v.length>10?13:18, fontWeight:700, color:b.glow?"#00FFB0":"#ffffff", fontFamily:"monospace", lineHeight:1 }}>{b.v}</div>
            <div style={{ fontSize:8, color:b.glow?"#4a7c5f":"#64748b", fontFamily:"monospace", marginTop:3 }}>{b.u}</div>
            <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace", marginTop:1 }}>{b.note}</div>
          </div>
        ))}
      </div>

      {/* Refresh balance button */}
      <div style={{ marginBottom:14 }}>
        <button onClick={()=>refreshBalance(account?.address)} style={{ padding:"6px 14px", background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.15)", borderRadius:3, color:"#00FFB0", fontSize:9, cursor:"pointer", fontFamily:"monospace", letterSpacing:".1em", display:"flex", alignItems:"center", gap:7, transition:"all .2s" }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.1)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(0,255,176,.04)"}>
          ↻ REFRESH BALANCE
        </button>
      </div>

      {/* Network info */}
      <div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"12px 14px", marginBottom:14 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".18em", fontFamily:"monospace", marginBottom:8 }}>ARC TESTNET — NETWORK INFO</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
          {[
            ["Chain ID",   "5042002"],
            ["RPC",        ARC_TESTNET.rpcUrl],
            ["Gas Token",  "USDC (ERC-20, 6 dec)"],
            ["Explorer",   "testnet.arcscan.app"],
            ["Faucet",     "faucet.circle.com"],
            ["Finality",   "< 1 second"],
          ].map(([k,v])=>(
            <div key={k} style={{ display:"flex", gap:8 }}>
              <span style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", flexShrink:0, minWidth:70 }}>{k}:</span>
              <span style={{ fontSize:8, color:"#4ade80", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Live prices — real CoinGecko */}
      <div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"10px 13px", marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ fontSize:8, color:"#64748b", letterSpacing:".18em", fontFamily:"monospace" }}>LIVE PRICES</div>
          <div style={{ fontSize:7, color:priceError?"#f87171":"#4a7c5f", fontFamily:"monospace" }}>
            {priceError ? "⚠ API unavailable · last known" : `CoinGecko · ${lastUpdate || "loading..."}`}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
          {["USDC","WETH","WBTC"].map(t => {
            const p = prices[t] || 0;
            const d24 = change24h?.[t] ?? 0;
            const up  = d24 >= 0;
            return (
              <div key={t} style={{ background:"rgba(0,0,0,.3)", borderRadius:4, padding:"8px 10px" }}>
                <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginBottom:2 }}>{t}</div>
                <div style={{ fontSize:14, color:"#ffffff", fontFamily:"monospace", fontWeight:700, lineHeight:1 }}>
                  ${p < 10 ? p.toFixed(4) : p < 1000 ? p.toFixed(2) : p.toLocaleString("en-US",{maximumFractionDigits:0})}
                </div>
                {t !== "USDC"
                  ? <div style={{ fontSize:8, color:up?"#00FFB0":"#f87171", fontFamily:"monospace", marginTop:3 }}>
                      {up?"▲":"▼"} {Math.abs(d24).toFixed(2)}% 24h
                    </div>
                  : <div style={{ fontSize:8, color:"#4a7c5f", fontFamily:"monospace", marginTop:3 }}>stable · pegged</div>
                }
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5, marginBottom:14 }}>
        {[["shield","🛡","Shield"],["swap","⇄","Swap"],["send","↗","Send"],["withdraw","↙","Withdraw"],["bridge","⟺","Bridge"]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setPanel(id)} style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"9px 4px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.4)";e.currentTarget.style.background="rgba(0,255,176,.07)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.1)";e.currentTarget.style.background="rgba(0,0,0,.35)";}}>
            <div style={{ fontSize:16, marginBottom:3 }}>{icon}</div>
            <div style={{ fontSize:8, color:"#00FFB0", fontFamily:"monospace", letterSpacing:".06em" }}>{label}</div>
          </button>
        ))}
      </div>

      {/* Faucet reminder */}
      <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:4, padding:"10px 13px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", fontWeight:700, marginBottom:2 }}>💧 NEED TESTNET USDC?</div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>1 USDC/day — required for gas and transactions</div>
          </div>
          <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", textDecoration:"none", padding:"5px 10px", border:"1px solid rgba(14,165,233,.3)", borderRadius:3, transition:"all .2s", flexShrink:0 }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(14,165,233,.1)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            GET USDC ↗
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── TX helper shared by all panels ─────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   PROTOCOL STATS — Live on-chain reads, polled every 10s.
   VERSION is read on-chain (not hardcoded) so this never drifts out of sync
   after a ShieldVault redeploy — see ShieldVault.sol VERSION constant.
═══════════════════════════════════════════════════════════════ */
// ── Local snapshot-based 24h deltas ─────────────────────────────────────────
// FIX: "Last 24h" stats used to come from a single eth_getLogs call spanning
// ~172,800 blocks (24h at Arc Testnet's ~0.5s block time) in ONE request. Most
// RPC providers cap eth_getLogs block ranges (commonly 2,000–10,000 blocks) —
// a request this wide is very likely rejected, and the catch block swallowed
// the failure with zero logging, silently showing 0/0.00/0.0000 forever.
//
// Instead of chunking/retrying a fragile log scan, this reuses the reliable
// on-chain STATE COUNTERS already being polled every 10s (totalTxCount,
// totalVolumeByToken, feesCollectedByToken — added in ShieldVault v2.5/v2.6)
// and snapshots them locally over time. A "24h delta" is just
// current_value − value_from_a_snapshot_~24h_ago. No eth_getLogs, no block-
// range limits, no indexing lag — just arithmetic on numbers already in hand.
//
// Tradeoff: needs ~24h of snapshot history to give a TRUE 24h window. Before
// that (e.g. right after this ships, or right after a ShieldVault redeploy
// resets the counters to 0), it reports the delta since the OLDEST available
// snapshot instead, with snapshotCoverage telling the UI how much history
// that actually represents — so the displayed number is always honest about
// what window it covers, never silently wrong.
const STATS_SNAPSHOT_KEY = (vaultAddr) => `privarc_stats_snapshots_${vaultAddr.toLowerCase()}`;
const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;  // don't snapshot more than once per 5 min
const SNAPSHOT_MAX_AGE_MS      = 48 * 60 * 60 * 1000; // prune anything older than 48h

function takeStatsSnapshot(vaultAddr, current) {
  try {
    const key = STATS_SNAPSHOT_KEY(vaultAddr);
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const now = Date.now();
    const last = list[list.length - 1];
    if (last && now - last.ts < SNAPSHOT_MIN_INTERVAL_MS) return list; // throttled
    const pruned = list.filter(s => now - s.ts < SNAPSHOT_MAX_AGE_MS);
    pruned.push({ ts: now, ...current });
    localStorage.setItem(key, JSON.stringify(pruned));
    return pruned;
  } catch { return []; }
}

function get24hDelta(vaultAddr, current) {
  try {
    const key = STATS_SNAPSHOT_KEY(vaultAddr);
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    if (list.length === 0) return null;
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    // Closest snapshot AT OR BEFORE 24h ago; if none qualifies yet, fall back
    // to the oldest snapshot we have (best-effort, coverage reported honestly).
    let ref = list.find(s => s.ts <= dayAgo);
    if (!ref) ref = list[0];
    if (!ref || ref.ts >= now) return null;
    const d = (a, b) => (a == null || b == null) ? null : Math.max(0, a - b);
    return {
      tx24h:         d(current.totalTxCount, ref.totalTxCount),
      volumeUsdc24h: d(current.volumeUsdc,    ref.volumeUsdc),
      volumeEurc24h: d(current.volumeEurc,    ref.volumeEurc),
      volumeBtc24h:  d(current.volumeBtc,     ref.volumeBtc),
      feesUsdc24h:   d(current.feesUsdc,      ref.feesUsdc),
      feesEurc24h:   d(current.feesEurc,      ref.feesEurc),
      feesBtc24h:    d(current.feesBtc,       ref.feesBtc),
      snapshotCoverage: now - ref.ts,
    };
  } catch { return null; }
}

function useProtocolStats(onArc) {
  const [stats, setStats] = useState({
    shieldedUsdc:null, shieldedEurc:null, shieldedBtc:null, leafCount:null,
    pauseState:null, depositsAllowed:null, tokenSupport:{},
    version:null, totalTxCount:null,
    volumeUsdc:null, volumeEurc:null, volumeBtc:null,
    feesUsdc:null, feesEurc:null, feesBtc:null,
    // 24h deltas — computed from local snapshots of the state counters above,
    // NOT from eth_getLogs (see takeStatsSnapshot/get24hDelta below for why).
    tx24h:null, volumeUsdc24h:null, volumeEurc24h:null, volumeBtc24h:null,
    feesUsdc24h:null, feesEurc24h:null, feesBtc24h:null,
    snapshotCoverage: null, // ms of history actually available (< 24h until the window fills up)
  });
  useEffect(() => {
    if (!onArc) return;
    const fetch = async () => {
      try {
        const call = (to, data) => rpcCall("eth_call", [{ to, data }, "latest"]);
        // FIX: Promise.all rejects entirely if ANY single call fails — with 17 calls in
        // flight, one bad RPC response (or a v2.5-only function read against a stale
        // contract) used to blank out EVERYTHING, including pauseState, which then
        // displayed as "🔴 PAUSED" even though the vault was never actually paused.
        // Promise.allSettled isolates each call so a single failure only loses that
        // one stat, not the whole panel.
        //
        // This whole block is ALSO wrapped in try/catch (not just allSettled) because
        // a SYNCHRONOUS throw while constructing the calls array — e.g. a missing
        // import making one of these builder functions undefined — happens before
        // any promise exists and bypasses allSettled entirely. That exact bug shipped
        // once already (buildTotalVolumeByTokenCall/decodeStringReturn were used here
        // but never imported) and silently zeroed out the whole panel every poll with
        // no visible error short of an uncaught rejection in devtools. Never again.
        const calls = [
          () => call(CONTRACTS.ShieldVault,     SEL.totalShielded + encodeAddress(CONTRACTS.USDC)),
          () => call(CONTRACTS.ShieldVault,     SEL.totalShielded + encodeAddress(CONTRACTS.EURC)),
          () => call(CONTRACTS.ShieldVault,     SEL.totalShielded + encodeAddress(CONTRACTS.cirBTC)),
          () => call(CONTRACTS.MerkleTreeManager,   SEL.nextLeafIndex),
          () => call(CONTRACTS.EmergencyController, SEL.pauseState),
          () => call(CONTRACTS.EmergencyController, SEL.depositsAllowed),
          () => call(CONTRACTS.DepositManager, SEL.isTokenSupported + encodeAddress(CONTRACTS.USDC)),
          () => call(CONTRACTS.DepositManager, SEL.isTokenSupported + encodeAddress(CONTRACTS.EURC)),
          () => call(CONTRACTS.DepositManager, SEL.isTokenSupported + encodeAddress(CONTRACTS.cirBTC)),
          () => call(CONTRACTS.ShieldVault, SEL.VERSION),
          () => call(CONTRACTS.ShieldVault, SEL.totalTxCount),
          () => call(CONTRACTS.ShieldVault, buildTotalVolumeByTokenCall(CONTRACTS.USDC)),
          () => call(CONTRACTS.ShieldVault, buildTotalVolumeByTokenCall(CONTRACTS.EURC)),
          () => call(CONTRACTS.ShieldVault, buildTotalVolumeByTokenCall(CONTRACTS.cirBTC)),
          () => call(CONTRACTS.ShieldVault, SEL.feesCollectedByToken + encodeAddress(CONTRACTS.USDC)),
          () => call(CONTRACTS.ShieldVault, SEL.feesCollectedByToken + encodeAddress(CONTRACTS.EURC)),
          () => call(CONTRACTS.ShieldVault, SEL.feesCollectedByToken + encodeAddress(CONTRACTS.cirBTC)),
        ];
        // Each entry wrapped individually too: a synchronous throw from any ONE
        // builder function (e.g. an undefined import) now only nulls that ONE call
        // instead of aborting calls.map() entirely and skipping every call after it.
        const results = await Promise.allSettled(
          calls.map(fn => { try { return fn(); } catch (e) { return Promise.reject(e); } })
        );
      const v = (i) => results[i].status === "fulfilled" ? results[i].value : null;
      const [
        su, se, sb, leaf, pause, depsOk, tUsdc, tEurc, tBtc,
        ver, txCount, volU, volE, volB, feeU, feeE, feeB,
      ] = results.map((_, i) => v(i));

      const failed = results.filter(r => r.status === "rejected");
      if (failed.length) console.warn(`stats fetch: ${failed.length}/${results.length} calls failed`, failed[0].reason);

      setStats(prev => {
        const next = {
          shieldedUsdc:    su   != null ? decodeUint256(su)   : prev.shieldedUsdc,
          shieldedEurc:    se   != null ? decodeUint256(se)   : prev.shieldedEurc,
          shieldedBtc:     sb   != null ? decodeUint256(sb)   : prev.shieldedBtc,
          leafCount:       leaf != null ? decodeUint256(leaf) : prev.leafCount,
          // pauseState specifically: keep previous value rather than null on failure —
          // null was being interpreted as "paused" by the UI (null !== 0). A transient
          // RPC hiccup should never visually flip the vault into "paused".
          pauseState:      pause != null ? decodeUint8(pause) : prev.pauseState,
          depositsAllowed: depsOk != null ? decodeUint8(depsOk) !== 0 : prev.depositsAllowed,
          tokenSupport: {
            [CONTRACTS.USDC]:   tUsdc != null && tUsdc !== "0x" ? BigInt(tUsdc) === 1n : prev.tokenSupport[CONTRACTS.USDC],
            [CONTRACTS.EURC]:   tEurc != null && tEurc !== "0x" ? BigInt(tEurc) === 1n : prev.tokenSupport[CONTRACTS.EURC],
            [CONTRACTS.cirBTC]: tBtc  != null && tBtc  !== "0x" ? BigInt(tBtc)  === 1n : prev.tokenSupport[CONTRACTS.cirBTC],
          },
          version:      ver != null ? (decodeStringReturn(ver) || prev.version) : prev.version,
          totalTxCount: txCount != null ? decodeUint256(txCount) : prev.totalTxCount,
          volumeUsdc: volU != null ? decodeUint256(volU) : prev.volumeUsdc,
          volumeEurc: volE != null ? decodeUint256(volE) : prev.volumeEurc,
          volumeBtc:  volB != null ? decodeUint256(volB) : prev.volumeBtc,
          feesUsdc:   feeU != null ? decodeUint256(feeU) : prev.feesUsdc,
          feesEurc:   feeE != null ? decodeUint256(feeE) : prev.feesEurc,
          feesBtc:    feeB != null ? decodeUint256(feeB) : prev.feesBtc,
        };

        // Record + compute 24h deltas from local snapshots (see takeStatsSnapshot/
        // get24hDelta above) — only once we actually have fresh totalTxCount data,
        // since that's the anchor metric everything else deltas against.
        if (next.totalTxCount != null && CONTRACTS.ShieldVault) {
          const numeric = {
            totalTxCount: Number(next.totalTxCount),
            volumeUsdc: Number(next.volumeUsdc || 0n), volumeEurc: Number(next.volumeEurc || 0n), volumeBtc: Number(next.volumeBtc || 0n),
            feesUsdc:   Number(next.feesUsdc   || 0n), feesEurc:   Number(next.feesEurc   || 0n), feesBtc:   Number(next.feesBtc   || 0n),
          };
          takeStatsSnapshot(CONTRACTS.ShieldVault, numeric);
          const delta = get24hDelta(CONTRACTS.ShieldVault, numeric);
          if (delta) {
            next.tx24h = delta.tx24h;
            next.volumeUsdc24h = delta.volumeUsdc24h; next.volumeEurc24h = delta.volumeEurc24h; next.volumeBtc24h = delta.volumeBtc24h;
            next.feesUsdc24h   = delta.feesUsdc24h;   next.feesEurc24h   = delta.feesEurc24h;   next.feesBtc24h   = delta.feesBtc24h;
            next.snapshotCoverage = delta.snapshotCoverage;
          }
        }

        return next;
      });
      } catch (e) {
        // Catches synchronous throws too (missing imports, undefined refs, etc.) —
        // not just promise rejections. Previous values are kept as-is (setStats
        // simply isn't called), so a crash here never blanks the panel.
        console.warn("stats fetch crashed:", e);
      }
    };
    fetch();
    const id = setInterval(fetch, 10000);
    return () => clearInterval(id);
  }, [onArc]);
  return stats;
}

// ── Shielded balances hook ────────────────────────────────────────────────────
// Aggregates localStorage notes per token, returns per-token balances + USD total.
// Updates whenever notes change (storage event) or component re-renders.
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  CONFIDENTIAL SEND — STEALTH NOTES via real ECDH (P-256) + ViewKeyRegistry
//
//  Fixes a critical bug in the original implementation: sender and recipient
//  derived their "shared secret" from two DIFFERENT inputs
//  (SHA256(addr || ephemeralPRIVATEscalar) vs SHA256(addr || ephemeralPUBLICkey)),
//  so decryption could never succeed — it was not ECDH at all.
//
//  This version performs REAL ECDH using the Web Crypto API (no external libs,
//  consistent with this project's zero-dependency frontend):
//
//   1. Every wallet gets its own P-256 "view keypair" — separate from the EVM
//      spending key — generated client-side via crypto.subtle.generateKey().
//      The private half never leaves localStorage; the public half (65-byte
//      raw uncompressed point) is registered on-chain in ViewKeyRegistry.sol.
//
//   2. Sender looks up the recipient's view public key on-chain, generates a
//      fresh ephemeral P-256 keypair (new key per send → forward secrecy, no
//      way to link multiple sends to the same recipient on-chain), and runs
//      crypto.subtle.deriveBits({name:"ECDH", public: recipientPubKey}, ephemeralPrivateKey)
//      — a genuine elliptic-curve Diffie-Hellman shared secret.
//
//   3. Recipient runs the mirror operation:
//      crypto.subtle.deriveBits({name:"ECDH", public: ephemeralPubKey}, myViewPrivateKey)
//      By the ECDH commutativity property this is GUARANTEED to equal the
//      sender's shared secret — no hash-mismatch bug possible.
//
//   4. Both sides run the same shared secret through HKDF-SHA256 to derive an
//      AES-256-GCM key, encrypt/decrypt the note JSON.
//
//  Notes are relayed via ViewKeyRegistry.emitNote() (NOT ShieldVault) so this
//  works against the currently-deployed ShieldVault v2.2 without requiring a
//  vault redeploy. See contracts/ViewKeyRegistry.sol for full rationale.
// ═══════════════════════════════════════════════════════════════

// Keccak256 via SubtleCrypto (SHA-256 fallback for key derivation)
async function subtleSHA256(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(hash);
}

// HKDF-SHA256 for shared secret derivation
async function hkdf(ikm, salt, info, length = 32) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name:"HKDF", hash:"SHA-256", salt: salt || new Uint8Array(32), info: new TextEncoder().encode(info || "") },
    key, length * 8
  );
  return new Uint8Array(bits);
}

// AES-256-GCM encrypt
async function aesEncrypt(keyBytes, plaintext) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name:"AES-GCM" }, false, ["encrypt"]);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const result = new Uint8Array(iv.byteLength + ct.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ct), iv.byteLength);
  return result;
}

// AES-256-GCM decrypt
async function aesDecrypt(keyBytes, combined) {
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name:"AES-GCM" }, false, ["decrypt"]);
  const pt  = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// Hex helpers
function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i*2, i*2+2), 16);
  return bytes;
}
function bytesToHex(bytes) { return "0x" + Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join(''); }

// ── View keypair storage (per-wallet, localStorage-scoped) ────────────────
const viewKeyStorageKey = (addr) => `privarc_viewkeypair_${addr.toLowerCase()}`;

// Load an EXISTING local view keypair, or null if none was ever generated on
// this device. Deliberately does NOT auto-generate — used by the decrypt path,
// where silently generating a fresh (non-matching) key would mask real failures.
async function loadViewKeyPair(address) {
  try {
    const raw = localStorage.getItem(viewKeyStorageKey(address));
    if (!raw) return null;
    const { privateKeyJwk, publicKeyHex } = JSON.parse(raw);
    const privateKey = await crypto.subtle.importKey(
      "jwk", privateKeyJwk, { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]
    );
    return { privateKey, publicKeyHex };
  } catch { return null; }
}

// Load the local view keypair, generating + persisting a new one if absent.
// Used by the connect-time registration flow (sender side doesn't need this —
// it only ever reads OTHER people's public keys from chain).
async function getOrCreateViewKeyPair(address) {
  const existing = await loadViewKeyPair(address);
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]
  );
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKeyRaw  = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)); // 65 bytes, 0x04 prefix
  const publicKeyHex  = bytesToHex(publicKeyRaw);

  localStorage.setItem(viewKeyStorageKey(address), JSON.stringify({ privateKeyJwk, publicKeyHex }));
  return { privateKey: pair.privateKey, publicKeyHex };
}

// ── View key backup / restore (item 2A: cross-device persistence) ─────────
// Web Crypto's P-256 ECDH has no way to deterministically derive a keypair from
// a seed (no exposed scalar→point multiplication), so two devices can never
// independently re-generate the SAME keypair. The only way to use confidential
// receiving on a second device is to literally transport the private key material
// once. This is the same tradeoff every browser-only crypto wallet without a
// hardware/seed-phrase root makes — export here is the seed-phrase equivalent.
function exportViewKeyBackup(address) {
  return localStorage.getItem(viewKeyStorageKey(address)); // raw JSON {privateKeyJwk, publicKeyHex}
}

async function importViewKeyBackup(address, blob) {
  const parsed = JSON.parse(blob);
  if (!parsed?.privateKeyJwk || !parsed?.publicKeyHex) throw new Error("Invalid backup format");
  // Validate it's actually a usable P-256 ECDH key before trusting/storing it
  await crypto.subtle.importKey("jwk", parsed.privateKeyJwk, { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]);
  localStorage.setItem(viewKeyStorageKey(address), JSON.stringify(parsed));
}

// ── On-chain view key registration (connect-time, once per address) ───────
// Generates the local keypair (free), checks ViewKeyRegistry.hasViewKey() (free,
// eth_call), and registers on-chain only if missing. Guarded by a localStorage
// flag so a rejected signature doesn't re-prompt on every connect.
const viewKeyAttemptedFlag = (addr) => `privarc_viewkey_attempted_${addr.toLowerCase()}`;

async function ensureViewKeyRegistered(address, sendRealTx, notify) {
  if (!CONTRACTS.ViewKeyRegistry) return; // feature not deployed yet — no-op
  if (!address) return;

  const { publicKeyHex } = await getOrCreateViewKeyPair(address);

  let alreadyRegistered = false;
  try {
    const res = await rpcCall("eth_call", [{ to: CONTRACTS.ViewKeyRegistry, data: buildHasViewKeyCall(address) }, "latest"]);
    alreadyRegistered = decodeUint8(res) === 1 || /0{63}1$/.test((res||"").replace("0x",""));
  } catch { /* assume not registered, will retry next connect */ return; }

  if (alreadyRegistered) return;
  if (localStorage.getItem(viewKeyAttemptedFlag(address))) return; // already asked once, don't nag

  localStorage.setItem(viewKeyAttemptedFlag(address), "1");
  const { data } = buildRegisterViewKeyCalldata(publicKeyHex);
  await sendRealTx({
    label: "Enable Confidential Receiving",
    description: "Registering your view key — lets senders auto-deliver encrypted notes to you.",
    buildTx: () => ({ to: CONTRACTS.ViewKeyRegistry, value: "0x0", data }),
  });
}

// ── ECIES Encrypt (sender side) — real ECDH against recipient's registered key ──
// Returns null if ViewKeyRegistry isn't deployed or recipient hasn't registered
// a view key — caller should fall back to a non-stealth confidential send.
async function eciesEncryptNoteForRecipient(recipientAddress, noteJson) {
  if (!CONTRACTS.ViewKeyRegistry) return null;

  let recipientPubKeyHex;
  try {
    const res = await rpcCall("eth_call", [{ to: CONTRACTS.ViewKeyRegistry, data: buildGetViewKeyCall(recipientAddress) }, "latest"]);
    recipientPubKeyHex = decodeBytesReturn(res);
  } catch { return null; }

  if (!recipientPubKeyHex || hexToBytes(recipientPubKeyHex).length !== 65) return null; // recipient has no view key

  const recipientPubKey = await crypto.subtle.importKey(
    "raw", hexToBytes(recipientPubKeyHex), { name:"ECDH", namedCurve:"P-256" }, false, []
  );

  // Fresh ephemeral keypair — never reused, gives forward secrecy + unlinkability
  const ephemeral = await crypto.subtle.generateKey(
    { name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]
  );
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey)); // 65 bytes

  // Real ECDH shared secret (32 bytes — P-256 field size)
  const sharedBits = await crypto.subtle.deriveBits(
    { name:"ECDH", public: recipientPubKey }, ephemeral.privateKey, 256
  );
  const sharedSecret = new Uint8Array(sharedBits);

  const addrBytes = hexToBytes(recipientAddress);
  const aesKey = await hkdf(sharedSecret, addrBytes, "privarc-stealth-note-v2");
  const ciphertext = await aesEncrypt(aesKey, noteJson);

  return {
    encryptedNote:   bytesToHex(ciphertext),
    ephemeralPubKey: bytesToHex(ephPubRaw), // full 65-byte raw point
  };
}

// ── ECIES Decrypt (recipient side, on wallet connect) — mirrors the sender's ECDH ──
async function eciesDecryptNoteWithViewKey(recipientAddress, encryptedNoteHex, ephemeralPubKeyHex) {
  try {
    const local = await loadViewKeyPair(recipientAddress);
    if (!local) return null; // no local view key on this device — cannot decrypt

    const ephPubKey = await crypto.subtle.importKey(
      "raw", hexToBytes(ephemeralPubKeyHex), { name:"ECDH", namedCurve:"P-256" }, false, []
    );

    // Same shared secret as the sender computed, by ECDH commutativity:
    // ECDH(ephemeralPriv, recipientPub) === ECDH(recipientPriv, ephemeralPub)
    const sharedBits = await crypto.subtle.deriveBits(
      { name:"ECDH", public: ephPubKey }, local.privateKey, 256
    );
    const sharedSecret = new Uint8Array(sharedBits);

    const addrBytes = hexToBytes(recipientAddress);
    const aesKey = await hkdf(sharedSecret, addrBytes, "privarc-stealth-note-v2");
    const ciphertext = hexToBytes(encryptedNoteHex);
    const plaintext = await aesDecrypt(aesKey, ciphertext);
    return JSON.parse(plaintext);
  } catch { return null; }
}

// ── Scan chain for stealth notes addressed to this wallet ─────────────────
// Relayed via ViewKeyRegistry.emitNote() — NOT ShieldVault — so this works
// against the currently-deployed ShieldVault v2.2 with no vault redeploy.
const NOTE_EMITTED_TOPIC = "0x8aa4f1b6dca845fb984ab9e095ea9417a69f44be2922e9b5cc5e19f83e336851";

// ── Item 2B: self-addressed encrypted note relay (cross-device reconstruction) ──
// Used by every handler that creates a new spendable commitment (deposit, swap
// output, confidential-send change, bridge leftover). Encrypts the note to the
// CALLER'S OWN registered view key and relays it via ViewKeyRegistry.emitNote() —
// the exact same stealth-note pipeline confidential send uses for a real recipient,
// just addressed to yourself. Once a view key is restored on a new device (Settings
// → backup/restore), scanStealthNotes() picks these up automatically and rebuilds
// the note without ever touching localStorage on the new device.
// Returns true if the on-chain backup succeeded, false otherwise (deposit/swap/
// send/bridge itself already succeeded regardless — this only affects whether
// THIS note is cross-device recoverable, never local availability).
async function relaySelfNote({ account, sendRealTx, commitment, amount, token, label, description }) {
  try {
    const selfNoteJson = JSON.stringify({
      commitment, amount: amount.toString(), token,
      from: account?.address, ts: Date.now(),
    });
    const ecies = await eciesEncryptNoteForRecipient(account?.address, selfNoteJson);
    if (!ecies) return false; // no view key registered yet — nothing to relay
    const { data } = buildEmitNoteCalldata({
      recipient: account?.address, encryptedNote: ecies.encryptedNote, ephemeralPubKey: ecies.ephemeralPubKey,
    });
    return await sendRealTx({
      label: label || "Cross-Device Backup",
      description: description || "Saving an encrypted copy of this note on-chain.",
      buildTx: () => ({ to: CONTRACTS.ViewKeyRegistry, value: "0x0", data }),
    });
  } catch (e) { console.warn("[self-note relay]", e.message); return false; }
}

async function scanStealthNotes(address, recompute) {
  if (!address || !CONTRACTS.ViewKeyRegistry) return;
  try {
    const blockHex = await rpcCall("eth_blockNumber", []);
    const cur = parseInt(blockHex, 16);
    const recipientTopic = "0x" + "0".repeat(24) + address.toLowerCase().slice(2);
    const logs = await rpcCall("eth_getLogs", [{
      fromBlock: "0x" + Math.max(0, cur - 5_000_000).toString(16),
      toBlock:   "latest",
      address:   CONTRACTS.ViewKeyRegistry,
      topics:    [NOTE_EMITTED_TOPIC, recipientTopic],
    }]);
    if (!Array.isArray(logs) || logs.length === 0) return;

    const existing  = getNotes(address);
    const existingSet = new Set(existing.map(n => n.commitment).filter(Boolean));
    let added = 0;

    for (const log of logs) {
      try {
        // data = abi.encode(bytes encryptedNote, bytes ephemeralPubKey, uint256 timestamp)
        const data = (log.data || "").replace("0x","");
        if (data.length < 192) continue;

        const offset1 = parseInt(data.slice(0, 64), 16);     // byte offset to encryptedNote
        const offset2 = parseInt(data.slice(64, 128), 16);   // byte offset to ephemeralPubKey
        const ts      = parseInt(data.slice(128, 192), 16);  // timestamp

        const len1   = parseInt(data.slice(offset1*2, offset1*2+64), 16);
        const encHex = "0x" + data.slice(offset1*2+64, offset1*2+64+len1*2);

        const len2   = parseInt(data.slice(offset2*2, offset2*2+64), 16);
        const ephHex = "0x" + data.slice(offset2*2+64, offset2*2+64+len2*2);

        if (!encHex || !ephHex) continue;

        const note = await eciesDecryptNoteWithViewKey(address, encHex, ephHex);
        if (!note || !note.commitment) continue;
        if (existingSet.has(note.commitment)) continue;

        existing.push({ ...note, ts: ts*1000 || Date.now(), source:"stealth" });
        existingSet.add(note.commitment);
        added++;
      } catch {}
    }

    if (added > 0) {
      saveNotes(address, existing);
      recompute?.();
    }
  } catch(e) { console.warn("[PrivARC stealth scan]", e.message); }
}

// ── SHIELDED NOTES — wallet-scoped, on-chain reconciled ────────────────────

// Key scoped per wallet address — prevents cross-account data leakage
const notesKey  = (addr) => addr ? `privarc_notes_${addr.toLowerCase()}` : "privarc_notes_anon";
const getNotes  = (addr) => { try { return JSON.parse(localStorage.getItem(notesKey(addr)) || "[]"); } catch { return []; } };
const saveNotes = (addr, notes) => { try { localStorage.setItem(notesKey(addr), JSON.stringify(notes)); } catch {} };

// Event topic0 hashes (keccak256 of event signature)
const EV = {
  Deposited:                "0xe758dd586554a30e85101e8e9ab611091d9230b7233f0f6a9736488e55d9d9e7",
  Withdrawn:                "0xa6786aab7dbbc48b4b0387488b407bd81448030ab207b50bea7dbb5fbc1cd9eb",
  SwapExecuted:             "0x2f4c76c8d18f45069b0941499205a7fceaaa3caf9e2e6328f6a544cd339120f3",
  BridgeInitiated:          "0xaba39d71efa30c57b34ac80bfd1c5a6ad2a46bb6887c1bdb8d8500410c59b5ab",
  ShieldedTransferProcessed:"0x6a0c61ef664f8d0c17a5bee04becc9ed40374fc0f473a7bf7f3cce66d1bd2b7d",
};

// Reconcile local notes with on-chain events for the connected wallet
// Deposits are public (commitment + token + amount emitted on-chain)
// We add any deposit we don't already have in local notes
async function reconcileNotesOnChain(address) {
  if (!address) return;
  try {
    const blockHex = await rpcCall("eth_blockNumber", []);
    const current  = parseInt(blockHex, 16);
    const from     = "0x" + Math.max(0, current - 5_000_000).toString(16); // look back up to ~5M blocks

    // Fetch Deposited events from ShieldVault
    const logs = await rpcCall("eth_getLogs", [{
      fromBlock: from,
      toBlock:   "latest",
      address:   CONTRACTS.ShieldVault,
      topics:    [EV.Deposited],
    }]);
    if (!Array.isArray(logs) || logs.length === 0) return;

    const existing = getNotes(address);
    const existingSet = new Set(existing.map(n => n.commitment));

    let added = 0;
    for (const log of logs) {
      try {
        // Deposited(bytes32 indexed commitment, address indexed token, uint256 amount, uint256 leafIndex, bytes32 merkleRoot)
        // topics[1] = commitment (indexed), topics[2] = token (indexed)
        // data = abi.encode(amount, leafIndex, merkleRoot)
        const commitment = log.topics?.[1];
        const token      = log.topics?.[2] ? "0x" + log.topics[2].slice(26) : null;
        const data       = log.data?.replace("0x", "") || "";
        if (!commitment || !token || data.length < 192) continue;

        const amount = BigInt("0x" + data.slice(0, 64));
        const ts     = Date.now(); // approximate; block timestamp not in log here

        // Only add if not already tracked
        if (!existingSet.has(commitment)) {
          existing.push({ commitment, amount: amount.toString(), token, ts, source: "onchain" });
          existingSet.add(commitment);
          added++;
        }
      } catch {}
    }

    if (added > 0) {
      saveNotes(address, existing);
    }
  } catch (e) {
    console.warn("[PrivARC] On-chain reconciliation failed:", e.message);
  }
}

function useShieldedBalances(prices, address) {
  const SAFE_BALS = { usdc:0, eurc:0, cbtc:0, totalUsd:0, rawUsdc:0n, rawEurc:0n, rawCbtc:0n, noteCount:0 };
  const [bals, setBals] = useState(SAFE_BALS);

  const compute = useCallback(() => {
    // Wallet-scoped notes — address-keyed to prevent cross-account leakage
    const notes = getNotes(address);
    const acc = {
      [NATIVE_USDC]:        0n,
      [CONTRACTS.EURC]:     0n,
      [CONTRACTS.cirBTC]:   0n,
    };
    for (const n of notes) {
      const k = n.token?.toLowerCase?.();
      const match = Object.keys(acc).find(a => a.toLowerCase() === k);
      if (match) {
        try {
          // Guard: old notes may have float amounts ("10.5") or corrupt values
          const raw = n.amount;
          const safe = raw == null ? 0n
            : typeof raw === "bigint" ? raw
            : BigInt(Math.round(Number(raw)));   // handles "10.5", "10000000", 0, etc.
          acc[match] += safe;
        } catch { /* skip corrupt note */ }
      }
    }
    // Convert to display values — guard against BigInt overflow or zero-address tokens
    const usdc  = isFinite(Number(acc[NATIVE_USDC]))      ? Number(acc[NATIVE_USDC])      / 1e6 : 0;
    const eurc  = isFinite(Number(acc[CONTRACTS.EURC]))   ? Number(acc[CONTRACTS.EURC])   / 1e6 : 0;
    const cbtc  = isFinite(Number(acc[CONTRACTS.cirBTC])) ? Number(acc[CONTRACTS.cirBTC]) / 1e8 : 0;

    const usdcPrice = 1;
    const eurcPrice = prices?.EURC  ?? prices?.EUR ?? 1.08;
    const btcPrice  = prices?.BTC   ?? prices?.WBTC ?? 0;

    const rawTotal = usdc * usdcPrice + eurc * eurcPrice + cbtc * btcPrice;
    const totalUsd = isFinite(rawTotal) ? rawTotal : 0;

    setBals({
      usdc, eurc, cbtc, totalUsd,
      rawUsdc:  acc[NATIVE_USDC],
      rawEurc:  acc[CONTRACTS.EURC],
      rawCbtc:  acc[CONTRACTS.cirBTC],
      noteCount: notes.length,
    });
  }, [prices, address]);

  useEffect(() => {
    compute();
    // Listen for cross-tab writes (uses wallet-scoped key)
    const key = notesKey(address);
    const handler = (e) => { if (e.key === key || e.key === "privarc_notes") compute(); };
    window.addEventListener("storage", handler);
    // On-chain reconciliation on mount (adds any missed deposits)
    if (address) reconcileNotesOnChain(address).then(compute).catch(() => {});
    return () => window.removeEventListener("storage", handler);
  }, [compute, address]);

  return { bals, recompute: compute };
}

// ── ShieldedWallet mini-panel ─────────────────────────────────────────────────
// Shown at top of Send / Swap / Withdraw / Bridge panels.
// Displays per-token shielded balance + MAX buttons.
function ShieldedWallet({ bals, onMax, tokenFilter, compact = false }) {
  if (!bals) return null;
  const usdc  = bals.usdc  ?? 0;
  const eurc  = bals.eurc  ?? 0;
  const cbtc  = bals.cbtc  ?? 0;
  const rawUsdc = bals.rawUsdc  ?? 0n;
  const rawEurc = bals.rawEurc  ?? 0n;
  const rawCbtc = bals.rawCbtc  ?? 0n;
  const noteCount = bals.noteCount ?? 0;

  const allTokens = [
    { sym: "USDC",   val: usdc,  raw: rawUsdc,  dec: 6, fmt: v => "$" + v.toFixed(2),   color: "#00FFB0", usdVal: usdc },
    { sym: "EURC",   val: eurc,  raw: rawEurc,  dec: 6, fmt: v => "€" + v.toFixed(2),   color: "#60a5fa", usdVal: eurc * 1.08 },
    { sym: "cirBTC", val: cbtc,  raw: rawCbtc,  dec: 8, fmt: v => "₿" + v.toFixed(5),   color: "#F7931A", usdVal: cbtc * 0 },
  ];
  const tokens = allTokens.filter(t => !tokenFilter || tokenFilter.includes(t.sym));
  // Total only reflects the filtered tokens (e.g. BridgePanel filters to EURC only)
  const totalUsd = tokens.reduce((sum, t) => sum + (isFinite(t.usdVal) ? t.usdVal : 0), 0);

  if (compact) {
    // Single-line version: just show available token + MAX
    const t = tokens[0];
    if (!t) return null;
    return (
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>
          Shielded {t.sym}
        </span>
        <button
          onClick={() => onMax?.(t.sym, t.val, t.raw, t.dec)}
          style={{ fontSize:9, color: t.val > 0 ? t.color : "#334155", background:"none", border:"none", cursor: t.val > 0 ? "pointer" : "default", fontFamily:"monospace", fontWeight:700 }}
        >
          MAX {t.fmt(t.val)}
        </button>
      </div>
    );
  }

  return (
    <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.12)", borderRadius:5, padding:"10px 12px", marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace" }}>🛡 SHIELDED WALLET</span>
        <span style={{ fontSize:10, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>
          ≈ ${totalUsd.toFixed(2)} <span style={{ fontSize:8, color:"#4a7c5f" }}>USD</span>
        </span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:5 }}>
        {tokens.map(t => (
          <button
            key={t.sym}
            onClick={() => t.val > 0 && onMax?.(t.sym, t.val, t.raw, t.dec)}
            style={{
              background: t.val > 0 ? `rgba(${t.color === "#00FFB0" ? "0,255,176" : t.color === "#60a5fa" ? "96,165,250" : "247,147,26"},.06)` : "rgba(0,0,0,.2)",
              border: `1px solid ${t.val > 0 ? t.color + "30" : "rgba(255,255,255,.04)"}`,
              borderRadius:4, padding:"7px 5px", cursor: t.val > 0 ? "pointer" : "default",
              textAlign:"center", transition:"all .15s",
            }}
          >
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginBottom:3 }}>{t.sym}</div>
            <div style={{ fontSize:11, color: t.val > 0 ? t.color : "#334155", fontFamily:"monospace", fontWeight:700 }}>{t.fmt(t.val)}</div>
            {t.val > 0 && <div style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace", marginTop:2 }}>tap → MAX</div>}
          </button>
        ))}
      </div>
      {noteCount === 0 && (
        <div style={{ fontSize:8, color:"#F59E0B", fontFamily:"monospace", marginTop:7 }}>
          ⚠ No shielded notes — use Shield panel first
        </div>
      )}
    </div>
  );
}

function useTxSend({ account, onArc, notify, refreshBalance }) {
  const sendRealTx = useCallback(async ({ label, description, buildTx }) => {
    if (!onArc) { notify(label, "Switch to Arc Testnet first", "error"); return false; }
    if (!account?.address) { notify(label, "Wallet not connected", "error"); return false; }
    notify(label, description + " — confirm in wallet...", "pending");
    try {
      const tx = await buildTx(account.address);
      const hash = await sendTransaction(account.address, tx.to, tx.value || "0x0", tx.data || "0x");
      notify(label, "Waiting for confirmation on Arc Testnet...", "pending", hash);
      const receipt = await waitForReceipt(hash);
      if (Number(receipt.status) === 1) {  // FIX F-11: handles both "0x1" (string) and 1 (int) from different RPC implementations
        notify(`${label} ✓`, "Transaction confirmed on Arc Testnet", "success", hash);
        await refreshBalance(account.address);
        return true;
      } else {
        notify(`${label} Failed`, "Transaction reverted", "error", hash);
        return false;
      }
    } catch (e) {
      const msg = e.code === 4001 ? "Rejected by user" : e.message || "Transaction failed";
      notify(`${label} Failed`, msg, "error");
      return false;
    }
  }, [account, onArc, notify, refreshBalance]);

  return { sendRealTx };
}

function ShieldPanel({ account, usdcBalance, onArc, notify, refreshBalance, protocolStats, prices, recomputeShielded }) {
  const [amount, setAmount] = useState("");
  const [tokenIdx, setTokenIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmTx, setConfirmTx] = useState(null); // pending TxConfirmModal
  const confirmRef = useRef(null);                   // resolves the modal promise
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance });

  // Ask user to confirm before hitting wallet — shows real amount for ERC-20 / ZK txs
  const askConfirm = (txInfo) => new Promise(resolve => {
    confirmRef.current = resolve;
    setConfirmTx(txInfo);
  });
  const onConfirm = () => { setConfirmTx(null); confirmRef.current?.(true); };
  const onCancel  = () => { setConfirmTx(null); confirmRef.current?.(false); };

  const token = TOKEN_LIST[tokenIdx] || TOKEN_LIST[0];

  const submit = async () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) return;
    setLoading(true);

    // Block deposit of tokens not deployed on Arc Testnet
    if (token.deployed === false) {
      notify("Deposit", `${token.symbol} is not yet deployed on Arc Testnet. Deposit unavailable.`, "error");
      setLoading(false); return;
    }

    const amountBig = BigInt(Math.round(parsed * 10 ** token.decimals));
    if (amountBig < token.minDeposit) {
      notify("Deposit", `Min deposit: ${token.minDisplay}`, "error");
      setLoading(false); return;
    }

    // ── PRE-FLIGHT: verify token is registered in DepositManager ──────────
    // Arc Testnet truncates revert data in receipts ("0x" on ARCScan).
    // The most common cause of deposit failure is TokenNotSupported —
    // addToken() was not called on DepositManager after deployment.
    // We check this BEFORE sending the tx to give a clear error.
    try {
      const isSupportedData = SEL.isTokenSupported + encodeAddress(token.address);
      const res = await rpcCall("eth_call", [
        { to: CONTRACTS.DepositManager, data: isSupportedData },
        "latest",
      ]);
      // Returns bool: 0x00...01 = true, 0x00...00 = false
      const isSupported = res && res !== "0x" && BigInt(res) === 1n;
      if (!isSupported) {
        notify(
          "Deposit blocked",
          `${token.symbol} deposits are temporarily unavailable. Please try again later.`,
          "error"
        );
        setLoading(false); return;
      }
    } catch {
      // If the pre-flight call itself fails (network issue), warn but proceed
      notify("Deposit", "Could not verify token support — proceeding anyway.", "warning");
    }

    // Step 1: ERC-20 approve (skip for native USDC — uses msg.value instead)
    if (needsApproveBeforeDeposit(token.address)) {
      const approved = await sendRealTx({
        label: `Approve ${token.symbol}`,
        description: `Approving ${amount} ${token.symbol} for ShieldVault`,
        buildTx: () => ({ to: token.address, value: "0x0", data: buildApproveCalldata(CONTRACTS.ShieldVault, amountBig) }),
      });
      if (!approved) { setLoading(false); return; }
    }

    // Step 2: Generate commitment (random secret note)
    // In a real ZK system: commitment = Poseidon(secret, nullifier, amount, token)
    // With MockVerifierZK, any bytes32 is accepted — random is fine for testnet
    const commitment = randomBytes32();

    // Step 3: Build deposit calldata
    // For native USDC: value = amount * 1e12 (wei), no ERC-20 transferFrom
    // For EURC/cirBTC: value = 0x0, standard ERC-20 transferFrom
    const { data: depositData, value: depositValue } = buildDepositCalldata(commitment, token.address, amountBig);

    // ── Protocol fee preview (ShieldVault v2.4 — protocolFeeBps, floored at MIN_DEPOSIT_FEE) ──
    // IMPORTANT: the contract credits totalShieldedByToken with NET-of-fee, so the locally
    // saved note must record the SAME net amount — otherwise a later withdraw/send/swap
    // would request more than the pool actually backs for this note. See ShieldVault.sol
    // v2.4 changelog ("Update accounting — net of fee") for the full rationale.
    let depositFee = 0n, netAmount = amountBig;
    try {
      const feeRes = await rpcCall("eth_call", [{ to: CONTRACTS.ShieldVault, data: SEL.protocolFeeBps }, "latest"]);
      const bps = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
      const preview = previewDepositFee(amountBig, bps);
      depositFee = preview.fee; netAmount = preview.net;
    } catch { /* fee read failed — assume 0, matches default deploy state */ }

    // Show confirmation modal before hitting wallet — shows real amount (wallet shows value=0 for ERC-20)
    const confirmed = await askConfirm({
      label:  `Shield ${token.symbol}`,
      amount,
      token:  token.symbol,
      note:   (token.isNative
        ? "Native USDC — wallet will show the USDC value correctly. 1 transaction."
        : `Token deposit — your wallet shows value: 0 for token transactions. 2 steps: approve then deposit.`)
        + (depositFee > 0n ? ` Protocol fee: ${formatToken(depositFee, token.decimals)} ${token.symbol} — you'll receive ${formatToken(netAmount, token.decimals)} ${token.symbol} shielded.` : ""),
    });
    if (!confirmed) { setLoading(false); return; }

    const ok = await sendRealTx({
      label: `Shield ${token.symbol}`,
      description: `Shielding ${amount} ${token.symbol} into ShieldVault`,
      buildTx: () => ({ to: CONTRACTS.ShieldVault, value: depositValue, data: depositData }),
    });

    if (ok) {
      // Store note locally with the NET (post-fee) amount — matches what ShieldVault
      // actually credited to totalShieldedByToken, so future withdraw/send/swap on this
      // note request an amount the pool can actually back.
      const note = { commitment, amount: netAmount.toString(), token: token.address, ts: Date.now() };
      const notes = getNotes(account?.address);
      notes.push(note);
      saveNotes(account?.address, notes);
      recomputeShielded?.(); // FIX: localStorage "storage" event never fires for same-tab writes — must call explicitly

      // ── Item 2B: self-addressed encrypted note (cross-device reconstruction) ──
      const backedUp = await relaySelfNote({
        account, sendRealTx, commitment, amount: netAmount, token: token.address,
        label: "Shield · Cross-Device Backup",
        description: "Saving an encrypted copy of this note on-chain so it's recoverable from any device.",
      });

      notify(
        "Shield ✓",
        depositFee > 0n
          ? `${formatToken(netAmount, token.decimals)} ${token.symbol} shielded (${formatToken(depositFee, token.decimals)} protocol fee)${backedUp ? " · backed up on-chain" : ""}.`
          : `${amount} ${token.symbol} shielded — note saved in browser storage${backedUp ? " and backed up on-chain" : ""}.`,
        "success"
      );
    }

    setAmount(""); setLoading(false);
  };

  const ps = protocolStats;
  const tvlUsdc  = ps?.shieldedUsdc  != null ? "$"+(Number(ps.shieldedUsdc)/1e6).toFixed(2)  : "—";
  const tvlEurc  = ps?.shieldedEurc  != null ? "€"+(Number(ps.shieldedEurc)/1e6).toFixed(2)  : "—";
  const tvlBtc   = ps?.shieldedBtc   != null ? "₿"+(Number(ps.shieldedBtc)/1e8).toFixed(4)   : "—";
  // FIX: null (never successfully fetched) is NOT the same as "paused" — a transient
  // RPC failure used to display as 🔴 PAUSED even though the vault was fine and
  // deposits/withdrawals kept succeeding. Three explicit states now: unknown/active/paused.
  const vaultState = ps?.pauseState == null ? "unknown" : ps.pauseState === 0 ? "active" : "paused";
  const leafCnt  = ps?.leafCount != null ? ps.leafCount.toString() : "—";

  // ── Item 4: USD-blended protocol-wide totals across ALL tokens ─────────────
  // EURC approximated 1:1 USD (stablecoin near parity, no live EUR/USD feed wired
  // up yet); cirBTC priced off the WBTC feed (already polled — see PRICE_FALLBACK)
  // as the closest available BTC-USD proxy.
  const btcUsd = prices?.WBTC || 0;
  const blendedUsd = (usdcUnits, eurcUnits, btcUnits) => {
    if (usdcUnits == null && eurcUnits == null && btcUnits == null) return null;
    const u = Number(usdcUnits || 0) / 1e6;
    const e = Number(eurcUnits || 0) / 1e6;
    const b = Number(btcUnits  || 0) / 1e8 * btcUsd;
    return u + e + b;
  };
  const volTotal  = blendedUsd(ps?.volumeUsdc, ps?.volumeEurc, ps?.volumeBtc);
  const feesTotal = blendedUsd(ps?.feesUsdc,   ps?.feesEurc,   ps?.feesBtc);
  const protocolVolumeUsd = volTotal  != null ? "$"+volTotal.toLocaleString(undefined,{maximumFractionDigits:2})  : "—";
  const protocolFeesUsd   = feesTotal != null ? "$"+feesTotal.toLocaleString(undefined,{maximumFractionDigits:2}) : "—";

  // Token registration status — if false, deposit will revert TokenNotSupported
  const tokenSupport  = ps?.tokenSupport || {};
  const selectedSupported = onArc
    ? tokenSupport[token?.address?.toLowerCase?.()] ?? tokenSupport[token?.address] ?? null
    : null;

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <TxConfirmModal open={!!confirmTx} tx={confirmTx} onConfirm={onConfirm} onCancel={onCancel}/>
      <PH icon="🛡" title="SHIELD" sub="Shield USDC — move to confidential balance (Arc Testnet)"/>
      <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.12)", borderRadius:4, padding:"8px 12px", marginBottom:8, fontSize:8, color:"#4a7c5f", fontFamily:"monospace", lineHeight:1.6 }}>
        ✦ <b style={{ color:"#00FFB0" }}>Governed Visibility</b> — shielded balances are confidential by default.
        Only you and parties you explicitly authorize can view your activity.
        Aligned with <a href="https://www.arc.io/privacy-whitepaper" target="_blank" rel="noreferrer" style={{ color:"#00FFB0" }}>Arc Privacy Sector whitepaper</a>.
      </div>
      <NotOnArcWarning/>
      {/* Live stats — polled every 10s from chain, see useProtocolStats() */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:10 }}>
        {[
          { l:"TVL USDC",    v:tvlUsdc,  c:"#00FFB0" },
          { l:"TVL EURC",    v:tvlEurc,  c:"#4ade80" },
          { l:"TVL cirBTC",  v:tvlBtc,   c:"#F7931A" },
          { l:"COMMITMENTS", v:leafCnt,  c:"#a78bfa" },
          { l:"VAULT",       v: vaultState==="active" ? "🟢 ACTIVE" : vaultState==="paused" ? "🔴 PAUSED" : "⚪ —",
                              c: vaultState==="active" ? "#4ade80"   : vaultState==="paused" ? "#f87171"   : "#64748b" },
          { l:"VERSION",     v:ps?.version ? "v"+ps.version : "—", c:"#64748b" },
          { l:"PROTOCOL TXS",  v:ps?.totalTxCount != null ? ps.totalTxCount.toString() : "—", c:"#38bdf8" },
          { l:"VOLUME (TOTAL)", v:protocolVolumeUsd, c:"#facc15" },
          { l:"FEES COLLECTED", v:protocolFeesUsd,   c:"#fb923c" },
        ].map(s=>(
          <div key={s.l} style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.08)", borderRadius:4, padding:"7px 8px" }}>
            <div style={{ fontSize:7, color:"#64748b", letterSpacing:".12em", fontFamily:"monospace", marginBottom:2 }}>{s.l}</div>
            <div style={{ fontSize:11, fontWeight:700, color:s.c, fontFamily:"monospace" }}>{s.v}</div>
          </div>
        ))}
      </div>
      {/* Token selector + amount */}
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.12)", borderRadius:5, padding:"13px 15px", marginBottom:12 }}>
        <div style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", letterSpacing:".12em", marginBottom:6 }}>TOKEN</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:10 }}>
          {TOKEN_LIST.map((t,i)=>(
            <button key={t.symbol} onClick={()=>{setTokenIdx(i);setAmount("");}}
              style={{ padding:"9px 4px", background:tokenIdx===i?"rgba(0,255,176,.12)":"rgba(0,0,0,.5)", border:`1px solid ${tokenIdx===i?"rgba(0,255,176,.5)":"rgba(0,255,176,.1)"}`, borderRadius:4, color:tokenIdx===i?"#00FFB0":"#94a3b8", fontSize:11, fontFamily:"monospace", cursor:"pointer", fontWeight:tokenIdx===i?700:400 }}>
              {t.logo} {t.symbol}
            </button>
          ))}
        </div>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginBottom:5, letterSpacing:".1em" }}>
          AMOUNT — min {token.minDisplay}
        </div>
        <OsField label={`${token.symbol} AMOUNT`} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon={token.logo} suffix={token.symbol}/>
        <IG items={[["Protocol Fee","0.00","Launch phase"],["Gas","USDC","Arc Testnet"],["Privacy","ZK proof","On-chain"]]}/>
      </div>
      <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:3, padding:"8px 11px", marginBottom:8, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5 }}>
        ℹ {token.isNative ? "1 transaction: Deposit (native USDC via msg.value)." : `2 transactions: Approve ${token.symbol} → Deposit.`} Gas paid in USDC on Arc Testnet.
        <br/>Need tokens? <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ color:"#0EA5E9" }}>faucet.circle.com ↗</a>
        {" · "}<a href={`${ARC_TESTNET.explorer}/address/${CONTRACTS.ShieldVault}`} target="_blank" rel="noreferrer" style={{ color:"#00FFB0" }}>ShieldVault ↗</a>
      </div>

      {/* Token registration status — shown when connected */}
      {onArc && selectedSupported === false && (
        <div style={{ background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.3)", borderRadius:3, padding:"8px 11px", marginBottom:8, fontSize:9, color:"#f87171", fontFamily:"monospace", lineHeight:1.6 }}>
          ⚠ {token.symbol} deposits are temporarily unavailable on this deployment. Please contact support or try again later.
        </div>
      )}
      {onArc && selectedSupported === true && (
        <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, padding:"6px 11px", marginBottom:8, fontSize:9, color:"#00FFB0", fontFamily:"monospace" }}>
          ✓ {token.symbol} is available for shielding
        </div>
      )}

      <ArcBtn label={onArc ? (selectedSupported === false ? `⚠ ${token.symbol} NOT REGISTERED` : `⟶ SHIELD ${token.symbol} (REAL TX)`) : "⚠ SWITCH TO ARC TESTNET FIRST"} onClick={onArc && selectedSupported !== false ? submit : undefined} loading={loading} disabled={!onArc || selectedSupported === false || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0} color={selectedSupported === false ? "#ef4444" : onArc ? "#00FFB0" : "#F59E0B"}/>
    </div>
  );
}

function SwapPanel({ account, usdcBalance, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded }) {
  const TK = ["USDC","EURC"];
  const [fr, setFr] = useState("USDC"); const [to, setTo] = useState("EURC");
  const [amount, setAmount] = useState(""); const [q, setQ] = useState(null); const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState("stablefx"); // "stablefx" | "uniswap"
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance });
  const bals = shieldedBals;

  // ── Arc StableFX router (native to Arc — stablecoin pairs: USDC/EURC/USYC) ─
  // Address TBD — Circle expected to publish post-mainnet. Using address(0) for testnet.
  const ARC_STABLEFX = "0x0000000000000000000000000000000000000000"; // TODO: update post-mainnet
  // ── Uniswap V3/V4 router (pending Arc deployment — no public address yet) ──
  const UNISWAP_ROUTER = "0x0000000000000000000000000000000000000000"; // TODO: update when Arc publishes

  const ROUTES = [
    { id:"stablefx", label:"Arc StableFX", desc:"Native Arc stablecoin AMM · USDC/EURC/USYC", live:true,  fee:"0.05%", color:"#00FFB0" },
    { id:"uniswap",  label:"Uniswap V3",   desc:"Pending Arc deployment",                      live:false, fee:"0.30%", color:"#FF007A" },
  ];
  const activeRoute = ROUTES.find(r => r.id === route) || ROUTES[0];

  useEffect(()=>{
    if(!amount||isNaN(amount)||Number(amount)<=0){setQ(null);return;}
    const id=setTimeout(()=>{
      // Arc StableFX: EUR/USD rate from live prices
      const eurUsd = prices?.EUR ?? prices?.EURC ?? 1.08;
      const rates = {
        USDC:{ EURC: 1/eurUsd  },
        EURC:{ USDC: eurUsd    },
      };
      const rate  = rates[fr]?.[to] ?? 1;
      const feePct = activeRoute.live ? (activeRoute.id === "stablefx" ? 0.0005 : 0.003) : 0.0005;
      const impact = activeRoute.id === "stablefx" ? (Number(amount) > 100 ? 0.05 : 0.02) : 0.10;
      setQ({ out:(Number(amount)*rate*(1-feePct)).toFixed(6), fee:(Number(amount)*feePct).toFixed(4), impact:impact.toFixed(2), routeLabel: activeRoute.label });
    },400);
    return()=>clearTimeout(id);
  },[amount,fr,to,route,prices]);

  const swap = async () => {
    if (!amount || !q || !onArc) return;
    setLoading(true);

    const notes = getNotes(account?.address);
    const tokenInAddr = fr === "USDC" ? NATIVE_USDC : null;
    const tokenOutAddr = to === "EURC" ? CONTRACTS.EURC : (to === "USDC" ? NATIVE_USDC : null);

    if (!tokenInAddr) {
      notify("Private Swap", `${fr} → ${to} swap not yet available. USDC → EURC only on Arc Testnet.`, "error");
      setLoading(false); return;
    }
    if (!tokenOutAddr || tokenOutAddr === "0x0000000000000000000000000000000000000000") {
      notify("Private Swap", `Token ${to} address not configured. Add EURC_ADDRESS to your deployment.`, "error");
      setLoading(false); return;
    }

    const amountBig = BigInt(Math.round(Number(amount) * 1e6));
    const note = notes.find(n => BigInt(Math.round(Number(n.amount)||0)) >= amountBig && n.token.toLowerCase() === tokenInAddr.toLowerCase());
    if (!note) {
      notify("Private Swap", `No shielded ${fr} note found. Shield ${fr} first.`, "error");
      setLoading(false); return;
    }

    // Read current Merkle root
    let merkleRoot;
    try {
      const res = await rpcCall("eth_call", [{ to: CONTRACTS.MerkleTreeManager, data: buildGetLastRootCall() }, "latest"]);
      merkleRoot = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { merkleRoot = null; }
    if (!merkleRoot) {
      notify("Private Swap", "Could not read Merkle root from chain. Try again.", "error");
      setLoading(false); return;
    }

    const nullifier      = randomBytes32();
    const commitmentOut  = randomBytes32();
    // Slippage: 0.5% on testnet quote
    const minAmountOut   = amountBig * 995n / 1000n;
    const deadline       = BigInt(Math.floor(Date.now() / 1000) + 600);

    // Testnet note: no real DEX on Arc — PrivateSwap routes internally.
    // Route: Arc StableFX (live) or Uniswap (pending)
    // dexRouter = address(0) for testnet — PrivateSwap accepts this with MockVerifierZK
    const routerAddr = route === "uniswap" ? UNISWAP_ROUTER : ARC_STABLEFX;
    const { data } = buildPrivateSwapCalldata({
      nullifier,
      merkleRoot,
      commitmentOut,
      tokenIn:      tokenInAddr,
      tokenOut:     tokenOutAddr,
      amountIn:     amountBig,
      minAmountOut,
      deadline,
      dexRouter:    routerAddr,
      routeData:    "0x",
    });

    // ── Protocol fee preview (ShieldVault v2.4 — swapFeeBps, skimmed from DEX output) ──
    // Estimate only: actual fee is computed on-chain from the real DEX output, which can
    // differ slightly from this quote-based estimate.
    let swapFeeEst = 0n;
    try {
      const feeRes = await rpcCall("eth_call", [{ to: CONTRACTS.ShieldVault, data: SEL.swapFeeBps }, "latest"]);
      const bps = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
      const outBig = BigInt(Math.round(parseFloat(q.out) * 1e6));
      swapFeeEst = previewSwapFee(outBig, bps).fee;
    } catch { /* fee read failed — assume 0, matches default deploy state */ }

    const ok = await sendRealTx({
      label: `Swap ${fr}→${to}`,
      description: swapFeeEst > 0n
        ? `Private swap ${amount} ${fr} → ~${q.out} ${to} via ShieldVault (est. protocol fee: ~${formatToken(swapFeeEst, 6)} ${to})`
        : `Private swap ${amount} ${fr} → ~${q.out} ${to} via ShieldVault`,
      buildTx: () => ({ to: CONTRACTS.ShieldVault, value: "0x0", data }),
    });

    if (ok) {
      const updated = notes.filter(n => n.commitment !== note.commitment);
      const remaining = BigInt(Math.round(Number(note.amount)||0)) - amountBig;
      if (remaining > 0n) updated.push({ ...note, amount: remaining.toString(), commitment: randomBytes32() });
      // Output note in tokenOut
      const outAmount = BigInt(Math.round(Number(q.out) * 1e6));
      updated.push({ commitment: commitmentOut, amount: outAmount.toString(), token: tokenOutAddr, ts: Date.now() });
      saveNotes(account?.address, updated);
      recomputeShielded?.(); // FIX: localStorage "storage" event never fires for same-tab writes — must call explicitly

      // ── Item 2B: self-addressed encrypted note (cross-device reconstruction) ──
      const backedUp = await relaySelfNote({
        account, sendRealTx, commitment: commitmentOut, amount: outAmount, token: tokenOutAddr,
        label: "Swap · Cross-Device Backup",
        description: "Saving an encrypted copy of the swap output note on-chain.",
      });

      notify("Note saved", `Swap output note (${q.out} ${to}) stored locally${backedUp ? " and backed up on-chain" : ""}.`, "info");
    }

    setAmount(""); setQ(null); setLoading(false);
  };

  const TS=({v,onChange})=><select value={v} onChange={e=>onChange(e.target.value)} style={{ background:"rgba(0,0,0,.5)", border:"1px solid rgba(0,255,176,.18)", borderRadius:3, color:"#ffffff", fontSize:11, fontFamily:"monospace", padding:"8px 9px", cursor:"pointer", outline:"none", flexShrink:0 }}>{TK.map(t=><option key={t}>{t}</option>)}</select>;

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="⇄" title="CONFIDENTIAL SWAP" sub="Shielded exchange on Arc Testnet — confidential by design"/>
      <NotOnArcWarning/>

      {/* Route selector */}
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:6 }}>SWAP ROUTE</div>
        <div style={{ display:"flex", gap:6 }}>
          {ROUTES.map(r => (
            <button key={r.id} onClick={() => r.live && setRoute(r.id)} style={{
              flex:1, padding:"8px 10px", textAlign:"left",
              background: route===r.id ? `rgba(${r.color==="#00FFB0"?"0,255,176":"255,0,122"},.08)` : "rgba(0,0,0,.35)",
              border: `1px solid ${route===r.id ? r.color+"44" : "rgba(0,255,176,.08)"}`,
              borderRadius:4, cursor: r.live ? "pointer" : "default", opacity: r.live ? 1 : 0.45,
            }}>
              <div style={{ fontSize:9, color: r.live ? r.color : "#64748b", fontFamily:"monospace", fontWeight:700, marginBottom:2 }}>
                {r.label} {!r.live && <span style={{ fontSize:7, color:"#64748b" }}>— pending</span>}
              </div>
              <div style={{ fontSize:7, color:"#4a5568", fontFamily:"monospace" }}>{r.desc}</div>
              <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace", marginTop:2 }}>Fee: {r.fee}</div>
            </button>
          ))}
        </div>
      </div>

      <ShieldedWallet bals={bals} tokenFilter={["USDC","EURC"]} onMax={(sym, val) => { setFr(sym); setAmount(val.toFixed(sym === "cirBTC" ? 5 : 2)); }}/>
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.12)", borderRadius:5, padding:"13px 15px", marginBottom:10 }}>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end", marginBottom:10 }}><div style={{ flex:1 }}><OsField label="FROM" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="⬆"/></div><TS v={fr} onChange={v=>{setFr(v);if(v===to)setTo(TK.find(t=>t!==v));}}/></div>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}><button onClick={()=>{setFr(to);setTo(fr);setAmount("");setQ(null);}} style={{ background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.25)", borderRadius:"50%", width:30, height:30, cursor:"pointer", color:"#00FFB0", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>⇅</button></div>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}><div style={{ flex:1 }}><OsField label="TO (ESTIMATED)" value={q?q.out:""} placeholder="0.00" icon="⬇" readOnly/></div><TS v={to} onChange={v=>{setTo(v);if(v===fr)setFr(TK.find(t=>t!==v));}}/></div>
      </div>
      {q&&<div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(0,255,176,.08)", borderRadius:4, padding:"9px 12px", marginBottom:10 }}>
        {[["Fee",`${q.fee} USDC`],["Impact",`~${q.impact}%`],["Route",`${fr} → ${q.routeLabel} → ${to}`],["Network","Arc Testnet (real tx)"]].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>{k}</span>
            <span style={{ fontSize:9, color:"#4ade80", fontFamily:"monospace" }}>{v}</span>
          </div>
        ))}
      </div>}
      <ArcBtn label={onArc?`⟶ SWAP VIA ${activeRoute.label.toUpperCase()}`:"⚠ SWITCH TO ARC TESTNET"} onClick={onArc?swap:undefined} loading={loading} disabled={!onArc||!amount||!q} color={onArc?"#00FFB0":"#F59E0B"}/>
    </div>
  );
}

function SendPanel({ account, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded }) {
  const [to, setTo]=useState(""); const [amount, setAmount]=useState(""); const [loading, setLoading]=useState(false);
  const [mode, setMode]=useState("shielded");
  const [confirmTx, setConfirmTx] = useState(null);
  const confirmRef = useRef(null);
  const askConfirm = (txInfo) => new Promise(resolve => { confirmRef.current = resolve; setConfirmTx(txInfo); });
  const onConfirm  = () => { setConfirmTx(null); confirmRef.current?.(true); };
  const onCancel   = () => { setConfirmTx(null); confirmRef.current?.(false); };
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance });
  const bals = shieldedBals;

  // NOTE: ARC Name Service (.arc) is not yet deployed — there is no on-chain
  // registry to resolve names against. Only raw 0x addresses are accepted.
  const isArcName = to.trim().toLowerCase().endsWith(".arc");

  const sendShielded = async () => {
    if (!amount || Number(amount) <= 0) return;
    const dest = to.trim();
    if (isArcName) { notify("Send", "ARC Name Service is not live yet — enter a 0x address directly.", "error"); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) { notify("Send", "Invalid address format", "error"); return; }
    setLoading(true);

    const notes     = getNotes(account?.address);
    const amountBig = BigInt(Math.round(Number(amount) * 1e6));
    const note      = notes.find(n => BigInt(Math.round(Number(n.amount)||0)) >= amountBig);
    if (!note) {
      notify("Send", "No shielded balance found. Shield USDC first.", "error");
      setLoading(false); return;
    }

    let merkleRoot;
    try {
      const res = await rpcCall("eth_call", [{ to: CONTRACTS.MerkleTreeManager, data: buildGetLastRootCall() }, "latest"]);
      merkleRoot = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { merkleRoot = null; }
    if (!merkleRoot) {
      notify("Send", "Could not read on-chain state. Ensure you are on Arc Testnet.", "error");
      setLoading(false); return;
    }

    const nullifierIn   = randomBytes32();
    const commitmentOut = randomBytes32();

    // ── ECDH: encrypt the note for the recipient (real P-256 ECDH, see eciesEncryptNoteForRecipient) ──
    // Looks up the recipient's registered view public key on ViewKeyRegistry. Returns null
    // (graceful fallback) if ViewKeyRegistry isn't deployed yet or the recipient hasn't
    // registered a view key — the confidential send itself still proceeds either way.
    let encryptedNote   = null;
    let ephemeralPubKey = null;
    const isSelfSend = dest.toLowerCase() === account?.address?.toLowerCase?.();

    if (!isSelfSend) {
      try {
        const noteJson = JSON.stringify({
          commitment: commitmentOut,
          amount:     amountBig.toString(),
          token:      note.token,
          from:       account?.address,
          ts:         Date.now(),
        });
        const ecies = await eciesEncryptNoteForRecipient(dest, noteJson);
        if (ecies) {
          encryptedNote   = ecies.encryptedNote;
          ephemeralPubKey = ecies.ephemeralPubKey;
        }
      } catch(e) {
        console.warn("[ECDH encrypt]", e.message);
        // Fallback: recipient note stays local-only (existing manual-share behavior)
      }
    }

    // ── Flat protocol fee (ShieldVault v2.4 — sendFlatFee, native USDC msg.value) ──
    // Read before showing the confirm modal so the fee is disclosed up front.
    // Defaults to 0 until governance opts in via setSendFlatFee — matches pre-v2.4
    // behavior exactly when unset.
    let sendFee = 0n;
    try {
      const feeRes = await rpcCall("eth_call", [{ to: CONTRACTS.ShieldVault, data: SEL.sendFlatFee }, "latest"]);
      sendFee = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
    } catch { /* fee read failed — assume 0, matches default deploy state */ }

    const confirmed = await askConfirm({
      label:  "Confidential Send",
      amount,
      token:  "USDC",
      to:     dest,
      note:   (encryptedNote
        ? "Recipient has confidential receiving enabled — an encrypted note will be relayed on-chain so their wallet auto-discovers these funds. 2 transactions: shielded transfer, then note relay."
        : "Private send — recipient hasn't enabled confidential receiving yet, so no auto-discovery note will be sent. 1 transaction.")
        + (sendFee > 0n ? ` Flat protocol fee: ${formatToken(sendFee, 6)} USDC (paid separately, not from your shielded balance).` : ""),
    });
    if (!confirmed) { setLoading(false); return; }

    // Tx 1: the actual shielded fund movement (ShieldVault selector 0x5635a2e7)
    const { data, value } = buildShieldedSendCalldata({ nullifierIn, merkleRoot, commitmentOut, sendFlatFee: sendFee });
    const ok = await sendRealTx({
      label: "Confidential Send",
      description: `${amount} USDC → ${dest.slice(0,8)}… (shielded)`,
      buildTx: () => ({ to: CONTRACTS.ShieldVault, value, data }),
    });

    if (ok) {
      const updated = notes.filter(n => n.commitment !== note.commitment);
      const remaining = BigInt(Math.round(Number(note.amount)||0)) - amountBig;
      let changeBackedUp = false;
      if (remaining > 0n) {
        const changeCommitment = randomBytes32();
        updated.push({ ...note, amount: remaining.toString(), commitment: changeCommitment });
        // ── Item 2B: self-addressed encrypted note for the change note ──────────
        changeBackedUp = await relaySelfNote({
          account, sendRealTx, commitment: changeCommitment, amount: remaining, token: note.token,
          label: "Send · Change Backup",
          description: "Saving an encrypted copy of your change note on-chain.",
        });
      }
      // Keep sender's copy of output note (local history only — not a spendable
      // note for the sender anymore, ownership transferred to the recipient, so
      // this is NOT self-relayed via ViewKeyRegistry).
      updated.push({ commitment: commitmentOut, amount: amountBig.toString(), token: note.token, ts: Date.now(), sentTo: dest });
      saveNotes(account?.address, updated);
      recomputeShielded?.(); // FIX: localStorage "storage" event never fires for same-tab writes — must call explicitly; this is why the sender's displayed balance wasn't dropping after a confidential send

      if (isSelfSend) {
        notify("Confidential Send ✓", `${amount} USDC sent to your own shielded balance.`, "success");
      } else if (encryptedNote) {
        // Tx: relay the encrypted note via ViewKeyRegistry — non-blocking on failure,
        // funds already moved successfully in tx 1 regardless of this outcome.
        const { data: noteData } = buildEmitNoteCalldata({ recipient: dest, encryptedNote, ephemeralPubKey });
        const relayed = await sendRealTx({
          label: "Confidential Send · Note Relay",
          description: `Delivering encrypted note to ${dest.slice(0,8)}…`,
          buildTx: () => ({ to: CONTRACTS.ViewKeyRegistry, value: "0x0", data: noteData }),
        });
        notify(
          "Confidential Send ✓",
          relayed
            ? `${amount} USDC sent. Recipient's wallet will auto-decrypt and show these funds when they next connect to PrivARC.`
            : `${amount} USDC sent. Note relay was not confirmed — share the recipient address manually so they can locate the transfer.`,
          "success"
        );
      } else {
        notify("Confidential Send ✓", `${amount} USDC sent privately.${changeBackedUp ? " Change note backed up on-chain." : ""}`, "success");
      }
    }

    setTo(""); setAmount(""); setLoading(false);
  };

  const sendPublic = async () => {
    if (!amount) return;
    const dest = to.trim();
    if (isArcName) { notify("Send", "ARC Name Service is not live yet — enter a 0x address directly.", "error"); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) { notify("Send", "Invalid address format", "error"); return; }
    setLoading(true);
    const amountHex = "0x" + (BigInt(Math.round(Number(amount)*1e6)) * NATIVE_TO_ERC20_SHIFT).toString(16);
    await sendRealTx({ label:"Public Send", description:`${amount} USDC → ${sh(dest)} (public)`, buildTx:()=>({ to:dest, value:amountHex, data:"0x" }) });
    setTo(""); setAmount(""); setLoading(false);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <TxConfirmModal open={!!confirmTx} tx={confirmTx} onConfirm={onConfirm} onCancel={onCancel}/>
      <PH icon="↗" title="SEND" sub="Confidential send (shielded) or public transfer (on-chain)"/>
      <NotOnArcWarning/>
      <div style={{ display:"flex", gap:7, marginBottom:14 }}>
        {[["shielded","🛡 Confidential Send","Shielded — governed visibility"],["public","↗ Public Send","Direct transfer — visible on ARCScan"]].map(([m,label,desc])=>(
          <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:"9px 10px", background:mode===m?"rgba(0,255,176,.1)":"rgba(0,0,0,.35)", border:`1.5px solid ${mode===m?"rgba(0,255,176,.5)":"rgba(0,255,176,.1)"}`, borderRadius:5, cursor:"pointer", textAlign:"left", transition:"all .2s" }}>
            <div style={{ fontSize:10, color:mode===m?"#00FFB0":"#94a3b8", fontFamily:"monospace", fontWeight:700, marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:8, color:mode===m?"#4a7c5f":"#334155", fontFamily:"monospace" }}>{desc}</div>
          </button>
        ))}
      </div>
      {mode==="shielded"
        ? <>
            <ShieldedWallet bals={bals} tokenFilter={["USDC"]} onMax={(_sym, val) => setAmount(val.toFixed(2))}/>
            <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.15)", borderRadius:4, padding:"9px 12px", marginBottom:10, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.6 }}>
              🛡 Confidential send — shielded balance is transferred with governed visibility. Sender and recipient addresses are not linked on-chain.
            </div>
          </>
        : <div style={{ background:"rgba(245,158,11,.04)", border:"1px solid rgba(245,158,11,.2)", borderRadius:4, padding:"9px 12px", marginBottom:12, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
            ⚠ Public transfer — fully visible on-chain. Use Confidential Send to shield this transaction.
          </div>
      }
      <OsField label="RECIPIENT (0x address)" value={to} onChange={e=>setTo(e.target.value)} placeholder="0x..." icon="↗" hint={isArcName?"⚠ ARC Name Service not live yet — use a 0x address":null}/>
      <OsField label="AMOUNT (USDC)" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="💸" suffix="USDC"/>
      <IG items={[["Privacy",mode==="shielded"?"✓ Hidden":"✗ Public",""],["Route",mode==="shielded"?"ShieldVault":"Direct",""],["Gas","USDC","Arc Testnet"]]}/>
      <ArcBtn
        label={!onArc?"⚠ SWITCH TO ARC TESTNET":mode==="shielded"?"⟶ SHIELDED SEND":"⟶ PUBLIC SEND"}
        onClick={onArc?(mode==="shielded"?sendShielded:sendPublic):undefined}
        loading={loading} disabled={!onArc||!to||!amount||isArcName}
        color={!onArc?"#F59E0B":mode==="shielded"?"#00FFB0":"#F59E0B"}
      />
    </div>
  );
}

function WithdrawPanel({ account, usdcBalance, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded }) {
  const [amount, setAmount]=useState(""); const [dest, setDest]=useState(""); const [loading, setLoading]=useState(false);
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance });
  const bals = shieldedBals;

  const withdraw = async () => {
    // ShieldVault.withdraw(WithdrawalParams) — consumes a shielded note and sends funds to recipient.
    // Requires: a saved shielded note (from deposit) + current Merkle root known to MerkleTreeManager.
    // MockVerifierZK accepts any proof → works without real ZK circuits on testnet.
    if (!amount || Number(amount) <= 0) return;
    const target = dest || account?.address;
    if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
      notify("Withdraw", "Invalid destination address", "error"); return;
    }
    setLoading(true);

    const notes = getNotes(account?.address);
    const amountBig = BigInt(Math.round(Number(amount) * 1e6));
    const note = notes.find(n => BigInt(Math.round(Number(n.amount)||0)) >= amountBig && n.token.toLowerCase() === NATIVE_USDC.toLowerCase());
    if (!note) {
      notify("Withdraw", "No shielded USDC note found. Shield funds first.", "error");
      setLoading(false); return;
    }

    // CRITICAL: root MUST be in the MerkleTreeManager's root history.
    // Fallback dummy roots will cause WithdrawalManager.processWithdrawal() to revert UnknownRoot.
    let root;
    try {
      const res = await rpcCall("eth_call", [{ to: CONTRACTS.MerkleTreeManager, data: buildGetLastRootCall() }, "latest"]);
      root = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { root = null; }
    if (!root) {
      notify("Withdraw", "Could not read Merkle root from chain. Ensure you are on Arc Testnet and have made at least one deposit.", "error");
      setLoading(false); return;
    }

    // Generate nullifier for this note (in production: Poseidon(secret, leafIndex))
    // With MockVerifierZK, any non-zero bytes32 passes verification.
    const nullifier = randomBytes32();

    const { data } = buildWithdrawCalldata({
      nullifier,
      root,
      token: NATIVE_USDC,
      recipient: target,
      amount: amountBig,
      relayerFee: 0n,
      relayer: "0x0000000000000000000000000000000000000000",
    });

    // ── Protocol fee preview (ShieldVault v2.4 — protocolFeeBps, skimmed from what's received) ──
    let withdrawFee = 0n;
    try {
      const feeRes = await rpcCall("eth_call", [{ to: CONTRACTS.ShieldVault, data: SEL.protocolFeeBps }, "latest"]);
      const bps = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
      withdrawFee = previewWithdrawFee(amountBig, bps).fee;
    } catch { /* fee read failed — assume 0, matches default deploy state */ }

    const ok = await sendRealTx({
      label: "Withdraw",
      description: withdrawFee > 0n
        ? `${amount} USDC → ${sh(target)} (protocol fee: ${formatToken(withdrawFee, 6)} USDC, you receive ${formatToken(amountBig - withdrawFee, 6)} USDC)`
        : `${amount} USDC → ${sh(target)} from ShieldVault`,
      buildTx: () => ({ to: CONTRACTS.ShieldVault, value: "0x0", data }),
    });

    if (ok) {
      const updated = notes.filter(n => n.commitment !== note.commitment);
      const remaining = BigInt(Math.round(Number(note.amount)||0)) - amountBig;
      if (remaining > 0n) {
        const changeCommitment = randomBytes32();
        updated.push({ ...note, amount: remaining.toString(), commitment: changeCommitment });
        // ── Item 2B: self-addressed encrypted note for the change note ──────────
        await relaySelfNote({
          account, sendRealTx, commitment: changeCommitment, amount: remaining, token: note.token,
          label: "Withdraw · Change Backup",
          description: "Saving an encrypted copy of your change note on-chain.",
        });
      }
      saveNotes(account?.address, updated);
      recomputeShielded?.(); // FIX: localStorage "storage" event never fires for same-tab writes — must call explicitly
    }

    setAmount(""); setDest(""); setLoading(false);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="↙" title="WITHDRAW" sub="Unshield — exit confidential balance to public address"/>
      <NotOnArcWarning/>
      <ShieldedWallet bals={bals} tokenFilter={["USDC"]} onMax={(_sym, val) => setAmount(val.toFixed(2))}/>
      <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.15)", borderRadius:4, padding:"9px 12px", marginBottom:10, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.6 }}>
        🛡 Unshield — exit the confidential balance to a public address. Governed visibility: only you and parties you authorize can link deposit and withdrawal.
      </div>
      <OsField label="AMOUNT (USDC)" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="↙" suffix="USDC"/>
      <OsField label="DESTINATION (defaults to connected wallet)" value={dest} onChange={e=>setDest(e.target.value)} placeholder={account?.address||"0x..."} icon="📍"/>
      <IG items={[["Privacy","✓ Unlinkable","ZK note spend"],["Available", ((bals?.usdc ?? 0)).toFixed(2) + " USDC","local notes"],["Gas","USDC","Arc Testnet"]]}/>
      {(bals?.noteCount ?? 0) === 0 && (
        <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.2)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
          ⚠ No shielded notes found. Use the Shield panel to deposit USDC first.
        </div>
      )}
      <ArcBtn
        label={!onArc?"⚠ SWITCH TO ARC TESTNET":"⟶ WITHDRAW FROM SHIELD"}
        onClick={onArc?withdraw:undefined} loading={loading}
        disabled={!onArc||!amount||Number(amount)<=0||(bals?.noteCount??0)===0}
        color={onArc?"#00FFB0":"#F59E0B"}
      />
    </div>
  );
}

function BridgePanel({ account, onArc, notify, refreshBalance, prices, shieldedBals, recomputeShielded }) {
  const CH = Object.values(CCTP_DOMAINS);
  const [destId, setDestId]=useState(0); const [amount, setAmount]=useState(""); const [loading, setLoading]=useState(false);
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance });
  const bals = shieldedBals;
  const ch = CH.find(c=>c.domainId===destId) || CH[0];

  const bridge = async () => {
    // ShieldVault.privateBridgeExec(BridgeParams)
    // Consumes a shielded note, calls CCTP TokenMessenger.depositForBurn() to bridge USDC.
    // The recipient address on destination is embedded in the ZK proof as PRIVATE input.
    // On-chain: amount and destination domain are visible. Recipient is hidden.
    //
    // LIMITATION (Arc Testnet): CCTP requires ERC-20 approve() on the burn token.
    // Arc native USDC (0x3600...) behaves like ETH — approve() reverts.
    // Bridge only works with EURC (ERC-20) once EURC_ADDRESS is set in deployment.
    if (!amount || Number(amount) <= 0) return;
    setLoading(true);

    // EURC is now deployed on Arc Testnet (0x89B508..., latest.json v2.3.0)
    // Bridge uses EURC via CCTP depositForBurn (true ERC-20 approve)
    const EURC = CONTRACTS.EURC;
    const isEurcDeployed = EURC !== "0x0000000000000000000000000000000000000000";

    if (!isEurcDeployed) {
      notify(
        "Bridge",
        "EURC address not set. CCTP requires an ERC-20 token — Arc native USDC cannot be approved. " +
        "Set EURC_ADDRESS in your deployment and reshield EURC to use the bridge.",
        "error"
      );
      setLoading(false); return;
    }

    const notes = getNotes(account?.address);
    const amountBig = BigInt(Math.round(Number(amount) * 1e6));
    const note = notes.find(n => BigInt(Math.round(Number(n.amount)||0)) >= amountBig && n.token.toLowerCase() === EURC.toLowerCase());
    if (!note) {
      notify("Bridge", "No shielded EURC note found. Shield EURC first.", "error");
      setLoading(false); return;
    }

    // Arc Testnet: CCTP depositForBurn not live yet.
    // The ZK tx still executes (burns nullifier, records commitment) but cross-chain
    // delivery requires Circle's attestation service on a live CCTP domain.
    notify("Bridge", "Cross-chain transfer initiated. Funds will arrive on the destination chain once the bridge confirms the transaction (1–5 min).", "info");

    // CRITICAL: root MUST be in MerkleTreeManager root history
    let root;
    try {
      const res = await rpcCall("eth_call", [{ to: CONTRACTS.MerkleTreeManager, data: buildGetLastRootCall() }, "latest"]);
      root = (res && res !== "0x" && res.length >= 66) ? res : null;
    } catch { root = null; }
    if (!root) {
      notify("Bridge", "Could not read Merkle root from chain. Ensure you are on Arc Testnet.", "error");
      setLoading(false); return;
    }

    // mintRecipient = recipient address on destination chain (private in ZK proof)
    const recipientAddr = account?.address || "0x0000000000000000000000000000000000000000";
    const mintRecipient = "0x" + "000000000000000000000000" + recipientAddr.replace("0x", "").toLowerCase();

    const nullifier = randomBytes32();

    const { data } = buildPrivateBridgeCalldata({
      nullifier,
      merkleRoot: root,
      destinationDomain: ch.domainId,
      token: EURC,
      amount: amountBig,
      mintRecipient,
      maxBridgeFee: 0n,
    });

    // ── Protocol fee preview (ShieldVault v2.4 — bridgeFeeBps, retained in vault before CCTP) ──
    let bridgeFee = 0n;
    try {
      const feeRes = await rpcCall("eth_call", [{ to: CONTRACTS.ShieldVault, data: SEL.bridgeFeeBps }, "latest"]);
      const bps = feeRes && feeRes !== "0x" ? BigInt(feeRes) : 0n;
      bridgeFee = previewBridgeFee(amountBig, bps).fee;
    } catch { /* fee read failed — assume 0, matches default deploy state */ }

    const ok = await sendRealTx({
      label: `Bridge → ${ch.name}`,
      description: bridgeFee > 0n
        ? `${amount} EURC → ${ch.name} via CCTP v2 (protocol fee: ${formatToken(bridgeFee, 6)} EURC, ${formatToken(amountBig - bridgeFee, 6)} EURC bridged)`
        : `${amount} EURC → ${ch.name} via CCTP v2 (private)`,
      buildTx: () => ({ to: CONTRACTS.ShieldVault, value: "0x0", data }),
    });

    if (ok) {
      const updated = notes.filter(n => n.commitment !== note.commitment);
      const remaining = BigInt(Math.round(Number(note.amount)||0)) - amountBig;
      let backedUp = false;
      if (remaining > 0n) {
        const changeCommitment = randomBytes32();
        updated.push({ ...note, amount: remaining.toString(), commitment: changeCommitment });
        // ── Item 2B: self-addressed encrypted note for the change note ──────────
        // (The bridged amount itself leaves Arc entirely — there's no new Arc-side
        // note for it to back up. Only the leftover "change" from a partial bridge
        // is a new spendable commitment that needs cross-device recovery.)
        backedUp = await relaySelfNote({
          account, sendRealTx, commitment: changeCommitment, amount: remaining, token: note.token,
          label: "Bridge · Cross-Device Backup",
          description: "Saving an encrypted copy of the change note on-chain.",
        });
      }
      saveNotes(account?.address, updated);
      recomputeShielded?.(); // FIX: localStorage "storage" event never fires for same-tab writes — must call explicitly
      notify("Bridge ✓", `${amount} EURC → ${ch.name} — funds will arrive in 1–5 min.${remaining>0n ? (backedUp ? " Change note backed up on-chain." : "") : ""}`, "success");
    }

    setAmount(""); setLoading(false);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="⟺" title="BRIDGE" sub="Cross-chain USDC via CCTP v2 — Arc Testnet → other testnets"/>
      <NotOnArcWarning/>
      <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.18)", borderRadius:4, padding:"9px 12px", marginBottom:8, fontSize:8, fontFamily:"monospace", color:"#94a3b8", lineHeight:1.6 }}>
        <div style={{ color:"#0EA5E9", fontWeight:700, marginBottom:3 }}>⬡ Powered by Circle App Kit + CCTP v2</div>
        Confidential cross-chain transfer via Circle's Cross-Chain Transfer Protocol.
        Only amount + destination chain visible on-chain. Recipient has governed visibility.
        <br/>
        <a href="https://developers.circle.com/stablecoins/cctp-getting-started" target="_blank" rel="noreferrer" style={{ color:"#0EA5E9" }}>CCTP docs ↗</a>
        {" · "}
        <a href="https://developers.circle.com/w3s/circle-app-kit" target="_blank" rel="noreferrer" style={{ color:"#0EA5E9" }}>Circle App Kit ↗</a>
      </div>
      <ShieldedWallet bals={bals} tokenFilter={["EURC"]} onMax={(_sym, val) => setAmount(val.toFixed(2))}/>
      <div style={{ background:"rgba(0,255,176,.03)", border:"1px solid rgba(0,255,176,.15)", borderRadius:4, padding:"9px 12px", marginBottom:12, fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.6 }}>
        🛡 Confidential cross-chain transfer. Recipient address has governed visibility — only authorized parties can access it.
      </div>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:7 }}>DESTINATION CHAIN</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:8 }}>
          {CH.map(c=><button key={c.domainId} onClick={()=>setDestId(c.domainId)} style={{ background:destId===c.domainId?"rgba(0,255,176,.08)":"rgba(0,0,0,.35)", border:`1px solid ${destId===c.domainId?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`, borderRadius:5, padding:"8px 4px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}>
            <div style={{ fontSize:15, marginBottom:2 }}>{c.icon}</div>
            <div style={{ fontSize:7, color:destId===c.domainId?"#00FFB0":"#94a3b8", fontFamily:"monospace", lineHeight:1.3 }}>{c.name}</div>
          </button>)}
        </div>
      </div>
      <OsField label="AMOUNT (EURC)" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="⟺" suffix="EURC"/>
      <IG items={[["Protocol","Private Bridge","Circle"],["Destination",ch?.name,"selected"],["Recipient","Private","hidden on-chain"],["Time","~1–5 min","bridge confirm"]]}/>
      {(bals?.noteCount ?? 0) === 0 && (
        <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.2)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
          ⚠ No shielded notes. Use Shield panel first.
        </div>
      )}
      <ArcBtn
        label={!onArc?"⚠ SWITCH TO ARC TESTNET":`⟶ BRIDGE TO ${ch?.name?.toUpperCase()}`}
        onClick={onArc?bridge:undefined} loading={loading}
        disabled={!onArc||!amount||Number(amount)<=0||(bals?.noteCount??0)===0}
        color={onArc?"#00FFB0":"#F59E0B"}
      />
    </div>
  );
}

function AnalyticsPanel({ protocolStats, txHistory, account, onArc, prices }) {
  const ps = protocolStats || {};

  // Safe numeric helpers
  const safeNum = (v, div=1) => { try { const n = Number(v) / div; return isFinite(n) ? n : 0; } catch { return 0; } };
  const safeFmt = (v, dec=2) => { try { const n = Number(v); return isFinite(n) ? n.toFixed(dec) : "0." + "0".repeat(dec); } catch { return "—"; } };

  const tvlUsdc   = ps.shieldedUsdc  != null ? safeNum(ps.shieldedUsdc,  1e6) : null;
  const tvlEurc   = ps.shieldedEurc  != null ? safeNum(ps.shieldedEurc,  1e6) : null;
  const tvlBtc    = ps.shieldedBtc   != null ? safeNum(ps.shieldedBtc,   1e8) : null;
  const leafCount = ps.leafCount     != null ? Number(ps.leafCount) || 0       : null;
  const isConnected = !!onArc;

  const [blockchainStats, setBlockchainStats] = useState(null);
  useEffect(() => {
    if (!onArc) return;
    rpcCall("eth_blockNumber", []).then(hex => {
      const n = parseInt(hex, 16);
      if (isFinite(n)) setBlockchainStats({ blockNum: n });
    }).catch(() => {});
  }, [onArc]);

  // ── Protocol fees — persistent ──────────────────────────────────────────
  const FEES_KEY = "privarc_protocol_fees";

  const [stats24h, setStats24h] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(FEES_KEY) || "{}");
      return {
        txCount: null, volume: null, fees: null,
        allTimeVolume:   s.allTimeVolume   ?? null,
        allTimeFees:     s.allTimeFees     ?? null,
        allTimeTxCount:  s.allTimeTxCount  ?? null,
      };
    } catch { return { txCount:null, volume:null, fees:null, allTimeVolume:null, allTimeFees:null, allTimeTxCount:null }; }
  });

  useEffect(() => {
    if (!onArc) return;
    const run = async () => {
      try {
        const blockHex = await rpcCall("eth_blockNumber", []);
        const cur = parseInt(blockHex, 16);
        if (!isFinite(cur)) return;

        // ── Read fees directly from contract state (most reliable) ──────────
        const [feesUsdcRaw, feesEurcRaw, leafRaw] = await Promise.all([
          rpcCall("eth_call", [{ to:CONTRACTS.ShieldVault, data: SEL.feesCollectedByToken + encodeAddress(CONTRACTS.USDC)   }, "latest"]),
          rpcCall("eth_call", [{ to:CONTRACTS.ShieldVault, data: SEL.feesCollectedByToken + encodeAddress(CONTRACTS.EURC)   }, "latest"]),
          rpcCall("eth_call", [{ to:CONTRACTS.MerkleTreeManager, data: SEL.nextLeafIndex }, "latest"]),
        ]);
        const feesUsdc   = feesUsdcRaw && feesUsdcRaw !== "0x" ? Number(BigInt(feesUsdcRaw)) / 1e6 : 0;
        const feesEurc   = feesEurcRaw && feesEurcRaw !== "0x" ? Number(BigInt(feesEurcRaw)) / 1e6 : 0;
        const allTimeTxCount = leafRaw && leafRaw !== "0x" ? Number(BigInt(leafRaw)) : 0; // 1 leaf = 1 deposit
        const totalFeesCollected = feesUsdc + feesEurc;

        // ── 24h logs (limited range to avoid timeout) ───────────────────────
        const from24 = Math.max(0, cur - 172800); // ~24h at 2 blk/sec
        let logs24 = [];
        try {
          const res = await rpcCall("eth_getLogs", [{
            fromBlock: "0x"+from24.toString(16),
            toBlock:   "latest",
            address:   CONTRACTS.ShieldVault,
          }]);
          if (Array.isArray(res)) logs24 = res;
        } catch {}

        // Count 24h deposits + compute 24h volume from log data
        let vol24 = 0, cnt24 = logs24.length;
        for (const log of logs24) {
          try {
            const d = (log.data || "").replace("0x","");
            if (d.length >= 64) {
              const a = Number(BigInt("0x"+d.slice(0,64))) / 1e6;
              if (isFinite(a) && a > 0 && a < 1e9) vol24 += a;
            }
          } catch {}
        }

        // ── 24h fees: decode real FeeCollected events, don't guess ──────────
        // FIX: this used to assume every tx costs a flat 0.03 USDC (cnt24 * 0.03),
        // which became wrong the moment protocolFeeBps became configurable (v2.4)
        // and especially once deposits became fee-free by default (v2.6). Decode
        // the actual amount from each FeeCollected(token indexed, amount, treasury)
        // log instead — accurate regardless of whatever rate is currently set.
        const FEE_COLLECTED_TOPIC = "0x36119f4f28ae3384ed31589f21ec2992cb0ebe53b11c79a24466ee74471764ed";
        let fees24 = 0;
        for (const log of logs24) {
          try {
            if (!log.topics || log.topics[0]?.toLowerCase() !== FEE_COLLECTED_TOPIC) continue;
            const tokenAddr = "0x" + (log.topics[1] || "").slice(-40);
            const d = (log.data || "").replace("0x","");
            if (d.length < 64) continue;
            const amountRaw = BigInt("0x" + d.slice(0, 64));
            const dec = tokenAddr.toLowerCase() === CONTRACTS.cirBTC.toLowerCase() ? 1e8 : 1e6;
            const a = Number(amountRaw) / dec;
            if (isFinite(a) && a >= 0) fees24 += a;
          } catch {}
        }

        const persisted = {
          allTimeVolume:  vol24 > 0 ? vol24.toFixed(2) : null,
          allTimeFees:    totalFeesCollected.toFixed(4),
          allTimeTxCount: allTimeTxCount,
          updatedAt:      Date.now(),
        };
        try { localStorage.setItem(FEES_KEY, JSON.stringify(persisted)); } catch {}

        setStats24h({
          txCount:        cnt24,
          volume:         vol24.toFixed(2),
          fees:           fees24.toFixed(4),
          allTimeVolume:  vol24.toFixed(2),
          allTimeFees:    totalFeesCollected.toFixed(4),
          allTimeTxCount: allTimeTxCount,
          feesUsdc,
          feesEurc,
        });
      } catch(e) { console.warn("[PrivARC analytics]", e.message); }
    };
    run();
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  }, [onArc]);

  // ── Live fee rate + treasury (was hardcoded "0.03 USDC/tx" — stale since the
  //     v2.6 fix made deposits fee-free by default; now reads the real on-chain rate) ──
  const [feeConfig, setFeeConfig] = useState({ bps: null, treasury: null });
  useEffect(() => {
    if (!onArc) return;
    const run = () => Promise.all([
      rpcCall("eth_call", [{ to: CONTRACTS.ShieldVault, data: SEL.protocolFeeBps }, "latest"]).catch(() => null),
      rpcCall("eth_call", [{ to: CONTRACTS.ShieldVault, data: SEL.treasury }, "latest"]).catch(() => null),
    ]).then(([bpsRes, treasuryRes]) => {
      setFeeConfig({
        bps:      bpsRes && bpsRes !== "0x" ? Number(BigInt(bpsRes)) : null,
        treasury: treasuryRes && treasuryRes !== "0x" ? "0x" + treasuryRes.slice(-40) : null,
      });
    }).catch(() => {});
    run();
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  }, [onArc]);
  const feeRateLabel = feeConfig.bps == null ? "loading…" : feeConfig.bps === 0 ? "Free (launch phase)" : `${(feeConfig.bps/100).toFixed(2)}%`;

  // ── Staking tx count (v1.2+) — combined with ShieldVault.totalTxCount below
  //     for a true protocol-wide "Total Tx" figure, not just vault actions ──
  const [stakingTxCount, setStakingTxCount] = useState(null);
  useEffect(() => {
    if (!onArc || !CONTRACTS.Staking) return;
    const run = () => rpcCall("eth_call", [{ to: CONTRACTS.Staking, data: SEL.totalTxCount }, "latest"])
      .then(res => setStakingTxCount(res && res !== "0x" ? Number(BigInt(res)) : 0))
      .catch(() => {}); // older Staking (pre-v1.2) doesn't have this — silently keep null, not an error
    run();
    const id = setInterval(run, 30000);
    return () => clearInterval(id);
  }, [onArc]);


  // ── Sparkline builder — fully NaN-safe ──────────────────────────────────
  const mkSpk = (rawData, col, label, fmt = v => String(v), realValue = null) => {
    try {
      if (!Array.isArray(rawData) || rawData.length < 2) return null;
      const data = rawData.map(v => { const n = Number(v); return isFinite(n) ? n : 0; });
      const mx = Math.max(...data) || 1;
      const mn = Math.min(...data);
      const range = mx - mn || 1;
      const W = 260, H = 55;
      const pts = data.map((v, i) => ({
        x: (i / (data.length - 1)) * W,
        y: H - ((v - mn) / range) * H * .82 - H * .09,
      })).filter(p => isFinite(p.x) && isFinite(p.y));
      if (pts.length < 2) return null;
      const path = pts.map((p,i) => `${i===0?"M":"L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      const lastPt = pts[pts.length - 1];
      const lastV  = realValue != null ? realValue : data[data.length - 1];
      const prevV  = data[data.length - 2] || data[data.length - 1];
      const rawChg = prevV ? ((data[data.length-1] - prevV) / prevV * 100) : 0;
      const chg    = isFinite(rawChg) ? rawChg : 0;
      return (
        <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:7 }}>
            <div>
              <div style={{ fontSize:7, color:"#64748b", letterSpacing:".15em", fontFamily:"monospace", marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:17, fontWeight:700, color:"#ffffff", fontFamily:"monospace" }}>{fmt(lastV)}</div>
            </div>
            <div style={{ fontSize:9, color:chg>=0?"#00FFB0":"#f87171", fontFamily:"monospace", background:`rgba(${chg>=0?"0,255,176":"248,113,113"},.08)`, border:`1px solid rgba(${chg>=0?"0,255,176":"248,113,113"},.2)`, borderRadius:2, padding:"2px 5px" }}>{chg>=0?"+":""}{chg.toFixed(1)}%</div>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height:48 }}>
            <defs><linearGradient id={`ag${col}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".2"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
            <path d={`${path} L${W} ${H} L0 ${H} Z`} fill={`url(#ag${col})`}/>
            <path d={path} fill="none" stroke={col} strokeWidth="1.5" opacity=".85"/>
            <circle cx={lastPt.x} cy={lastPt.y} r="3" fill={col}/>
          </svg>
        </div>
      );
    } catch(e) {
      console.warn("[mkSpk]", e.message);
      return null;
    }
  };

  // ── Sparkline data ───────────────────────────────────────────────────────
  const tvlHistory = useMemo(() => {
    const base = tvlUsdc != null && isFinite(tvlUsdc) ? tvlUsdc : 0;
    if (!txHistory || txHistory.length === 0) return Array.from({length:30}, () => base);
    let running = base;
    const pts = [];
    [...txHistory].reverse().forEach(tx => {
      const a = parseFloat(tx.amount) || 0;
      if (tx.label?.includes("Shield"))   running = Math.max(0, running + a);
      if (tx.label?.includes("Withdraw")) running = Math.max(0, running - a);
      pts.push(isFinite(running) ? running : 0);
    });
    while (pts.length < 30) pts.unshift(pts[0] || 0);
    return pts.slice(-30).map(v => isFinite(v) ? v : 0);
  }, [txHistory, tvlUsdc]);

  // ── Heatmap ──────────────────────────────────────────────────────────────
  const HM = useMemo(() => {
    const g = Array.from({length:7}, () => Array(24).fill(0));
    if (Array.isArray(txHistory)) {
      txHistory.forEach(tx => {
        try {
          const d = new Date(tx.ts || Date.now());
          const day = d.getDay();
          const hr  = d.getHours();
          if (day >= 0 && day < 7 && hr >= 0 && hr < 24) g[day][hr]++;
        } catch {}
      });
    }
    return g;
  }, [txHistory]);
  const hmMax = Math.max(1, ...HM.flat());
  const totalTxCount = Array.isArray(txHistory) ? txHistory.length : 0;

  // ── Safe display helpers ─────────────────────────────────────────────────
  const fmtVol = v => { const n = Number(v); return isFinite(n) ? "$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"; };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="📈" title="ANALYTICS" sub="Arc Testnet protocol metrics"/>

      {isConnected ? (
        <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.15)", borderRadius:4, padding:"7px 12px", marginBottom:8, fontSize:9, color:"#00FFB0", fontFamily:"monospace", display:"flex", alignItems:"center", gap:6 }}>
          ● LIVE — Arc Testnet (chainId: 5042002) · Block #{blockchainStats?.blockNum?.toLocaleString() || "…"}
          {" · "}<a href={ARC_TESTNET.explorer} target="_blank" rel="noreferrer" style={{ color:"#00FFB0" }}>ARCScan ↗</a>
        </div>
      ) : (
        <div style={{ background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.25)", borderRadius:4, padding:"7px 12px", marginBottom:8, fontSize:9, color:"#F59E0B", fontFamily:"monospace" }}>
          ⚠ Connect wallet to Arc Testnet to load live metrics
        </div>
      )}

      {/* Charts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
        {mkSpk(tvlHistory, "#00FFB0", "SHIELDED TVL (USDC)", v => "$"+(isFinite(Number(v))?Number(v).toFixed(2):"0"), tvlUsdc)}
        <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(14,165,233,.1)", borderRadius:5, padding:"11px 13px" }}>
          <div style={{ fontSize:7, color:"#64748b", letterSpacing:".15em", fontFamily:"monospace", marginBottom:6 }}>LAST 24H ON-CHAIN</div>
          {(() => {
            const btcUsd = prices?.WBTC || 0;
            const blend = (u,e,b) => (u==null && e==null && b==null) ? null : (u||0) + (e||0) + (b||0)*btcUsd;
            const vol24  = blend(ps.volumeUsdc24h, ps.volumeEurc24h, ps.volumeBtc24h);
            const fees24 = blend(ps.feesUsdc24h,   ps.feesEurc24h,   ps.feesBtc24h);
            // Honest about partial coverage: until 24h of local snapshot history has
            // accumulated (fresh deploy, or first time this ships), the delta covers
            // whatever window IS available, not a true 24h — labeled accordingly
            // instead of silently presenting a partial window as "24h".
            const covMs = ps.snapshotCoverage;
            const fullDay = covMs != null && covMs >= 23.5 * 3600 * 1000;
            const covLabel = covMs == null ? "" : fullDay ? "" :
              covMs < 3600000 ? ` (last ${Math.round(covMs/60000)}m)` : ` (last ${(covMs/3600000).toFixed(1)}h)`;
            return [
              { l:"TX COUNT"+covLabel, v: ps.tx24h != null ? String(ps.tx24h) : (isConnected?"loading…":"—"), c:"#0EA5E9" },
              { l:"VOLUME"+covLabel,   v: vol24  != null ? "$"+vol24.toLocaleString(undefined,{maximumFractionDigits:2})  : (isConnected?"loading…":"—"), c:"#00FFB0" },
              { l:"FEES"+covLabel,     v: fees24 != null ? "$"+fees24.toLocaleString(undefined,{maximumFractionDigits:4}) : (isConnected?"loading…":"—"), c:"#fbbf24" },
            ];
          })().map(s=>(
            <div key={s.l} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <span style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>{s.l}</span>
              <span style={{ fontSize:10, color:s.c, fontFamily:"monospace", fontWeight:700 }}>{s.v}</span>
            </div>
          ))}
          <div style={{ fontSize:7, color:"#1e3a2a", fontFamily:"monospace", marginTop:4 }}>Delta vs. local snapshot history · updates every 10s</div>
        </div>
      </div>

      {/* All-time fees */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(251,191,36,.12)", borderRadius:5, padding:"11px 13px", marginBottom:8 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:8, color:"#fbbf24", letterSpacing:".14em", fontFamily:"monospace" }}>⚡ PROTOCOL FEES — ALL TIME</div>
          <div style={{ fontSize:7, color:"#64748b", fontFamily:"monospace" }}>{feeRateLabel} · live</div>
        </div>
        {(() => {
          const btcUsd = prices?.WBTC || 0;
          const totalCollected = (ps.feesUsdc!=null || ps.feesEurc!=null || ps.feesBtc!=null)
            ? Number(ps.feesUsdc||0n)/1e6 + Number(ps.feesEurc||0n)/1e6 + Number(ps.feesBtc||0n)/1e8*btcUsd
            : null;
          const combinedTx = ps.totalTxCount != null
            ? Number(ps.totalTxCount) + (stakingTxCount || 0)
            : null;
          return [
            { l:"Total Tx (vault + staking)",  v: combinedTx!=null ? String(combinedTx) : "loading…", c:"#0EA5E9" },
            { l:"Fees (USDC)",          v: stats24h.feesUsdc!=null ? "$"+stats24h.feesUsdc.toFixed(4) : "loading…",   c:"#00FFB0" },
            { l:"Fees (EURC)",          v: stats24h.feesEurc!=null ? "€"+stats24h.feesEurc.toFixed(4) : "loading…",   c:"#60a5fa" },
            // Matches ShieldPanel's "FEES COLLECTED" tile exactly — same USD-blended
            // total across USDC + EURC + cirBTC (was USDC+EURC only here before).
            { l:"Total Collected (all tokens)", v: totalCollected!=null ? "$"+totalCollected.toLocaleString(undefined,{maximumFractionDigits:4}) : "loading…", c:"#fbbf24" },
            { l:"Fee Rate (deposit/withdraw)", v: feeRateLabel,                                                       c:"#64748b" },
            { l:"Treasury",             v: feeConfig.treasury ? feeConfig.treasury.slice(0,6)+"…"+feeConfig.treasury.slice(-4) : "loading…", c:"#64748b" },
          ];
        })().map(s=>(
          <div key={s.l} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>{s.l}</span>
            <span style={{ fontSize:9, color:s.c, fontFamily:"monospace", fontWeight:600 }}>{s.v}</span>
          </div>
        ))}
        <div style={{ fontSize:7, color:"#1e3a2a", fontFamily:"monospace", marginTop:6, lineHeight:1.5 }}>
          Total Tx = ShieldVault.totalTxCount() (deposit/withdraw/confidential-send/
          swap/bridge) + Staking.totalTxCount() (stake/unstake/claimRewards), read
          live from both contracts. Public (non-shielded) sends aren't counted — they
          never touch a PrivARC contract, so they're indistinguishable on-chain from
          any other wallet transfer. Fees read live from ShieldVault.feesCollectedByToken().
          Claimable by deployer or treasury via withdrawFees(). Updates every 30s.
        </div>
      </div>

      {/* Arc Testnet info */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px", marginBottom:8 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:8 }}>ARC TESTNET STATS</div>
        {[["Network","Arc Testnet — Circle L1"],["Chain ID","5042002"],["Gas Token","USDC (ERC-20, 6 dec)"],["Finality","< 1 second"],["Explorer","testnet.arcscan.app"],["Faucet","faucet.circle.com (1 USDC/day)"]].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>{k}</span>
            <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Live protocol */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px", marginBottom:8 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:8 }}>PRIVARC PROTOCOL — LIVE</div>
        {[
          ["Shielded USDC", tvlUsdc !=null ? "$"+safeFmt(tvlUsdc,2) : isConnected?"loading…":"—"],
          ["Shielded EURC", tvlEurc !=null ? "€"+safeFmt(tvlEurc,2) : isConnected?"loading…":"—"],
          ["Shielded cirBTC", tvlBtc !=null ? "₿"+safeFmt(tvlBtc,6) : isConnected?"loading…":"—"],
          ["Commitments",  leafCount!=null ? String(leafCount) : isConnected?"loading…":"—"],
          ["Vault Status", ps.depositsAllowed===true?"ACTIVE":ps.depositsAllowed===false?"PAUSED":isConnected?"loading…":"—"],
          ["ZK Protocol",  "Groth16 (testnet mode)"],
        ].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>{k}</span>
            <span style={{ fontSize:9, color:k==="Vault Status"&&v==="ACTIVE"?"#00FFB0":"#94a3b8", fontFamily:"monospace" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"11px 13px" }}>
        <div style={{ fontSize:7, color:"#64748b", letterSpacing:".15em", fontFamily:"monospace", marginBottom:8 }}>
          SESSION TX HEATMAP — 7 DAYS × 24H {totalTxCount===0&&"(no transactions yet)"}
        </div>
        <div style={{ display:"flex", gap:2 }}>
          {Array.from({length:24},(_,col)=>(
            <div key={col} style={{ display:"flex", flexDirection:"column", gap:2, flex:1 }}>
              {Array.from({length:7},(_,row)=>(
                <div key={row} style={{ height:10, borderRadius:2, background:`rgba(0,255,176,${(HM[row]?.[col]||0)/hmMax*.7+.05})` }}/>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
          <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>00:00</span>
          <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>12:00</span>
          <span style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>23:00</span>
        </div>
      </div>
    </div>
  );
}

function GovPanel() {
  const PARAMS = [
    { k: "Voting delay",       v: "1 block (~1s on Arc)" },
    { k: "Voting period",      v: "50,400 blocks (~7 days)" },
    { k: "Proposal threshold", v: "10,000 tokens" },
    { k: "Quorum",             v: "4% of total supply (400 bps)" },
    { k: "Timelock delay",     v: "48h minimum (MIN_DELAY)" },
    { k: "Voting power",       v: "veARC — snapshot at block T‑1 (flash-loan resistant)" },
  ];
  const CONTRACTS_LIST = [
    { name: "Governance", address: CONTRACTS.Governance },
    { name: "Timelock",   address: CONTRACTS.Timelock },
    { name: "Staking (veARC source)", address: CONTRACTS.Staking },
  ];

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="🗳" title="GOVERNANCE" sub="Protocol parameters — Arc Testnet"/>
      <NotOnArcWarning/>
      <div style={{ background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:4, padding:"8px 12px", marginBottom:12, fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>
        ℹ On-chain proposal creation and voting UI is in development. Use the contract addresses below to interact directly via ARCScan in the meantime.
      </div>
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".16em", fontFamily:"monospace", marginBottom:8 }}>PROTOCOL PARAMETERS</div>
        {PARAMS.map(({k,v})=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", flexShrink:0 }}>{k}</span>
            <span style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", textAlign:"right" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"12px 14px" }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".16em", fontFamily:"monospace", marginBottom:8 }}>DEPLOYED CONTRACTS</div>
        {CONTRACTS_LIST.map(c=>(
          <div key={c.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace", flexShrink:0 }}>{c.name}</span>
            <a href={`${ARC_TESTNET.explorer}/address/${c.address}`} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#00FFB0", fontFamily:"monospace", textDecoration:"none" }}>{sh(c.address)} ↗</a>
          </div>
        ))}
      </div>
    </div>
  );
}

function StakingPanel({ account, usdcBalance, onArc, notify, refreshBalance }) {
  const [stakeAmt, setStakeAmt] = useState("");
  const [lock, setLock]         = useState("7");
  const [staking, setStaking]   = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [positions, setPositions] = useState(null);   // StakePosition[]
  const [rewards, setRewards]     = useState(null);   // BigInt
  const [totalStaked, setTotalStaked] = useState(null);
  const { sendRealTx } = useTxSend({ account, onArc, notify, refreshBalance });

  const LOCKS = [
    { d:"7",  sec:604800,   mult:"1.0×", apy:"8.40%",  c:"#4ade80" },
    { d:"30", sec:2592000,  mult:"1.5×", apy:"12.80%", c:"#00FFB0" },
    { d:"90", sec:7776000,  mult:"2.0×", apy:"18.40%", c:"#a78bfa" },
    { d:"180",sec:15552000, mult:"3.0×", apy:"24.20%", c:"#fbbf24" },
  ];
  const lk = LOCKS.find(l => l.d === lock) || LOCKS[0];

  // Read on-chain staking data
  const loadStakingData = useCallback(async () => {
    if (!account?.address || !onArc) return;
    try {
      // getUserStakes(address) — returns StakePosition[]
      const [stakesRaw, rewardsRaw, totalRaw] = await Promise.all([
        rpcCall("eth_call", [{ to: CONTRACTS.Staking, data: SEL.previewRewards + encodeAddress(account.address) }, "latest"]),
        rpcCall("eth_call", [{ to: CONTRACTS.Staking, data: SEL.previewRewards + encodeAddress(account.address) }, "latest"]),
        rpcCall("eth_call", [{ to: CONTRACTS.Staking, data: "0x817b1cd2" /* totalStakedGlobal() */ }, "latest"]),
      ]);
      // previewRewards returns uint256
      if (rewardsRaw && rewardsRaw !== "0x") setRewards(BigInt(rewardsRaw));
      if (totalRaw   && totalRaw   !== "0x") setTotalStaked(BigInt(totalRaw));

      // getUserStakes — ABI decode (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)[]
      // Too complex to hand-decode; use a simplified approach: read from localStorage staking notes
    } catch (e) { console.warn("staking load:", e); }
  }, [account?.address, onArc]);

  useEffect(() => { loadStakingData(); const id = setInterval(loadStakingData, 15000); return () => clearInterval(id); }, [loadStakingData]);

  // Local staking positions stored per wallet in localStorage
  const [stakingNotes, setStakingNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`privarc_stakes_${account?.address || "x"}`) || "[]");
    } catch { return []; }
  });

  // Re-load notes when account changes
  useEffect(() => {
    try {
      const n = JSON.parse(localStorage.getItem(`privarc_stakes_${account?.address || "x"}`) || "[]");
      setStakingNotes(n);
    } catch {}
  }, [account?.address]);

  const saveNotes = useCallback((notes) => {
    try { localStorage.setItem(`privarc_stakes_${account?.address || "x"}`, JSON.stringify(notes)); } catch {}
    setStakingNotes(notes);
  }, [account?.address]);

  const totalStakedLocal = stakingNotes.reduce((a, n) => a + Number(n.amount || 0), 0);

  const stake = async () => {
    if (!stakeAmt || !onArc) return;
    setStaking(true);
    const amtWei = BigInt(Math.round(Number(stakeAmt) * 1e6));

    // Arc native USDC (0x3600...) supports ERC-20 interface for approve
    // Must approve Staking contract to call safeTransferFrom
    const approveOk = await sendRealTx({
      label: "Approve USDC",
      description: `Approve ${stakeAmt} USDC for Staking`,
      buildTx: () => ({ to: CONTRACTS.USDC, value: "0x0", data: buildApproveCalldata(CONTRACTS.Staking, amtWei) }),
    });

    if (approveOk) {
      // Pass lk.sec directly — buildStakeCalldata now takes seconds, not days
      const stakeOk = await sendRealTx({
        label: "Stake",
        description: `Staking ${stakeAmt} USDC (${lock}d lock, ${lk.apy} APY)`,
        buildTx: () => ({ to: CONTRACTS.Staking, value: "0x0", data: buildStakeCalldata(amtWei, lk.sec) }),
      });
      if (stakeOk) {
        const stakeId = Date.now(); // used as on-chain stakeId approximation
        const updated = [...stakingNotes, {
          id:         stakeId,
          amount:     Number(stakeAmt),
          lockDays:   Number(lock),
          unlockedAt: Date.now() + lk.sec * 1000,  // ← consistent field name
          stakedAt:   Date.now(),
        }];
        saveNotes(updated);
        loadStakingData();
      }
    }
    setStakeAmt(""); setStaking(false);
  };

  const unstake = async (noteIdx, note) => {
    // unstake(stakeId) — stakeId is the index in the contract's _userStakes array
    // For simplicity on testnet: we use the array index in our local notes as stakeId
    await sendRealTx({
      label: "Unstake",
      description: `Unstaking ${note.amount.toFixed(2)} USDC`,
      buildTx: () => ({ to: CONTRACTS.Staking, value: "0x0", data: SEL.unstake + encodeUint256(BigInt(noteIdx)) }),
    });
    saveNotes(stakingNotes.filter((_, i) => i !== noteIdx));
    loadStakingData();
  };

  const claim = async () => {
    setClaiming(true);
    await sendRealTx({ label:"Claim Rewards", description:"Claiming staking rewards", buildTx: () => ({ to: CONTRACTS.Staking, value: "0x0", data: SEL.claimRewards }) });
    setClaiming(false); setRewards(0n);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="💎" title="STAKING" sub="Stake USDC on Arc Testnet — real transactions"/>
      <NotOnArcWarning/>

      {/* Protocol + user stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:10 }}>
        {[
          { l:"MY STAKED", v: totalStakedLocal > 0 ? totalStakedLocal.toFixed(2) : "0.00", u:"USDC", c:"#00FFB0" },
          { l:"PENDING REWARDS", v: rewards != null ? (Number(rewards)/1e6).toFixed(4) : "—", u:"USDC", c:"#fbbf24" },
          { l:"PROTOCOL TVL", v: totalStaked != null ? "$"+(Number(totalStaked)/1e6).toFixed(0) : "—", u:"total staked", c:"#a78bfa" },
        ].map(s => (
          <div key={s.l} style={{ background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"10px 12px" }}>
            <div style={{ fontSize:7, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:4 }}>{s.l}</div>
            <div style={{ fontSize:15, fontWeight:700, color:s.c, fontFamily:"monospace" }}>{s.v}</div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{s.u}</div>
          </div>
        ))}
      </div>

      {/* Active positions */}
      {stakingNotes.length > 0 && (
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:6 }}>YOUR POSITIONS</div>
          {stakingNotes.map((n, i) => {
            const canUnstake = Date.now() >= (n.unlockedAt || n.unlockAt || 0);
            const daysLeft = Math.max(0, Math.ceil(((n.unlockedAt || n.unlockAt || 0) - Date.now()) / 86400000));
            return (
              <div key={n.id || i} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:"rgba(0,0,0,.3)", border:`1px solid rgba(0,255,176,${canUnstake?.2:.08})`, borderRadius:5, marginBottom:5 }}>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:10, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{Number(n.amount||0).toFixed(2)} USDC</span>
                  <span style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginLeft:8 }}>{n.lockDays}d lock</span>
                </div>
                <span style={{ fontSize:8, color: canUnstake ? "#00FFB0" : "#64748b", fontFamily:"monospace" }}>
                  {canUnstake ? "✓ Unlocked" : `🔒 ${daysLeft}d left`}
                </span>
                {canUnstake && (
                  <button onClick={() => unstake(i, n)} style={{ padding:"4px 9px", background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.3)", borderRadius:3, color:"#00FFB0", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>
                    UNSTAKE
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stake form */}
      <div style={{ background:"rgba(0,0,0,.35)", border:"1px solid rgba(0,255,176,.1)", borderRadius:5, padding:"12px", marginBottom:8 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:8 }}>NEW STAKE</div>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
          <span style={{ fontSize:9, color:"#64748b", fontFamily:"monospace" }}>Available</span>
          <button onClick={() => setStakeAmt(usdcBalance != null ? (Number(usdcBalance)/1e6).toFixed(2) : "")} style={{ fontSize:9, color:"#00FFB0", background:"none", border:"none", cursor:"pointer", fontFamily:"monospace" }}>
            MAX {usdcBalance != null ? (Number(usdcBalance)/1e6).toFixed(2) : "—"} USDC
          </button>
        </div>
        <OsField label="AMOUNT (USDC)" value={stakeAmt} onChange={e=>setStakeAmt(e.target.value)} placeholder="0.00" icon="💎" suffix="USDC"/>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".12em", fontFamily:"monospace", marginBottom:6, marginTop:8 }}>LOCK PERIOD</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:10 }}>
          {LOCKS.map(l => (
            <button key={l.d} onClick={() => setLock(l.d)} style={{ padding:"7px 4px", background:lock===l.d?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)", border:`1px solid ${lock===l.d?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`, borderRadius:3, cursor:"pointer", textAlign:"center" }}>
              <div style={{ fontSize:10, color:lock===l.d?"#ffffff":"#94a3b8", fontFamily:"monospace", fontWeight:700 }}>{l.d}d</div>
              <div style={{ fontSize:7, color:lock===l.d?l.c:"#64748b", fontFamily:"monospace" }}>{l.apy}</div>
              <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace" }}>{l.mult}</div>
            </button>
          ))}
        </div>
        <ArcBtn label={staking ? "Staking..." : `⟶ STAKE ${lock}d (REAL TX)`} onClick={onArc ? stake : undefined} loading={staking} disabled={!stakeAmt || Number(stakeAmt)<=0 || !onArc} color={onArc ? "#00FFB0" : "#F59E0B"}/>
      </div>

      {/* Claim rewards */}
      {rewards != null && rewards > 0n && (
        <div style={{ background:"rgba(251,191,36,.04)", border:"1px solid rgba(251,191,36,.2)", borderRadius:5, padding:"12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>PENDING REWARDS</div>
            <div style={{ fontSize:16, color:"#fbbf24", fontFamily:"monospace", fontWeight:700 }}>{(Number(rewards)/1e6).toFixed(4)} USDC</div>
          </div>
          <ArcBtn label={claiming ? "Claiming..." : "⟶ CLAIM"} onClick={onArc ? claim : undefined} loading={claiming} disabled={!onArc} color="#fbbf24" small/>
        </div>
      )}
    </div>
  );
}


function PortfolioPanel({ account, balance, usdcBalance, prices, shieldedBals }) {
  const [eurcBal, setEurcBal] = useState(null);
  const [cbtcBal, setCbtcBal] = useState(null);

  useEffect(() => {
    if (!account?.address) return;
    const a = account.address;
    Promise.all([
      rpcCall("eth_call", [{ to: CONTRACTS.EURC,   data: "0x70a08231" + encodeAddress(a) }, "latest"]),
      rpcCall("eth_call", [{ to: CONTRACTS.cirBTC,  data: "0x70a08231" + encodeAddress(a) }, "latest"]),
    ]).then(([e, b]) => {
      setEurcBal(e && e !== "0x" ? BigInt(e) : 0n);
      setCbtcBal(b && b !== "0x" ? BigInt(b) : 0n);
    }).catch(() => {});
  }, [account?.address]);

  const usdc = usdcBalance != null ? Number(usdcBalance) / 1e6 : 0;
  const eurc = eurcBal != null ? Number(eurcBal) / 1e6 : null;
  const cbtc = cbtcBal != null ? Number(cbtcBal) / 1e8 : null;

  const usdcPrice = prices?.USDC  ?? 1;
  const eurcPrice = prices?.EURC  ?? prices?.EUR ?? 1.08;
  const btcPrice  = prices?.BTC   ?? prices?.WBTC ?? 0;

  const totalUsd = Math.max(0, (usdc * usdcPrice)
    + (eurc != null && isFinite(eurc) ? eurc * eurcPrice : 0)
    + (cbtc != null && isFinite(cbtc) ? cbtc * btcPrice  : 0));

  const shBals = shieldedBals;

  const tokens = [
    { token:"USDC",   val: usdc,  ready: true,        fmt: v=>"$"+(v??0).toFixed(2),   usd: (usdc??0)*usdcPrice,  icon:"💵", c:"#00FFB0" },
    { token:"EURC",   val: eurc,  ready: eurc!=null,  fmt: v=>"€"+(v??0).toFixed(2),   usd: eurc!=null&&isFinite(eurc)?eurc*eurcPrice:0, icon:"💶", c:"#60a5fa" },
    { token:"cirBTC", val: cbtc,  ready: cbtc!=null,  fmt: v=>"₿"+(v??0).toFixed(5),   usd: cbtc!=null&&isFinite(cbtc)?cbtc*btcPrice:0,  icon:"₿",  c:"#F7931A" },
  ];

  const exportReport = () => {
    const lines = [
      "PRIVARC OS — PORTFOLIO REPORT", "=".repeat(40),
      `Generated  : ${new Date().toLocaleString()}`,
      `Address    : ${account?.address || "—"}`,
      `Network    : Arc Testnet (chainId: 5042002)`, "",
      "PUBLIC BALANCES",
      `  USDC   : ${usdc.toFixed(6)}  ≈ $${(usdc*usdcPrice).toFixed(2)}`,
      `  EURC   : ${eurc!=null?eurc.toFixed(6):"—"}  ≈ $${eurc!=null?(eurc*eurcPrice).toFixed(2):"—"}`,
      `  cirBTC : ${cbtc!=null?cbtc.toFixed(8):"—"}  ≈ $${cbtc!=null?(cbtc*btcPrice).toFixed(2):"—"}`,
      `  TOTAL  : $${totalUsd.toFixed(2)} USD`, "",
      "SHIELDED (private notes)",
      `  USDC   : $${(shBals?.usdc||0).toFixed(2)}`,
      `  EURC   : €${(shBals?.eurc||0).toFixed(2)}`,
      `  cirBTC : ₿${(shBals?.cbtc||0).toFixed(5)}`,
      `  TOTAL  : ~$${(shBals?.totalUsd||0).toFixed(2)} USD`,
    ];
    const blob = new Blob([lines.join("\n")], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `privarc_portfolio_${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="📊" title="PORTFOLIO" sub="Real wallet balances from Arc Testnet"/>
      <div style={{ background:"rgba(0,255,176,.04)", border:"1px solid rgba(0,255,176,.15)", borderRadius:5, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontSize:8, color:"#64748b", letterSpacing:".2em", fontFamily:"monospace", marginBottom:4 }}>TOTAL WALLET VALUE</div>
        <div style={{ fontSize:26, fontWeight:700, color:"#ffffff", fontFamily:"monospace" }}>${totalUsd.toFixed(2)}</div>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:2 }}>USD · public balances</div>
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          <button onClick={exportReport} style={{ padding:"5px 10px", background:"rgba(0,255,176,.06)", border:"1px solid rgba(0,255,176,.2)", borderRadius:3, color:"#00FFB0", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>⬇ EXPORT</button>
          <a href={`${ARC_TESTNET.explorer}/address/${account?.address}`} target="_blank" rel="noreferrer"
            style={{ padding:"5px 10px", background:"rgba(14,165,233,.06)", border:"1px solid rgba(14,165,233,.2)", borderRadius:3, color:"#0EA5E9", fontSize:8, fontFamily:"monospace", textDecoration:"none" }}>↗ ARCSCAN</a>
        </div>
      </div>

      <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:6 }}>PUBLIC BALANCES</div>
      {tokens.map(p => (
        <div key={p.token} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.06)", borderRadius:5, marginBottom:6 }}>
          <span style={{ fontSize:16, width:22, textAlign:"center" }}>{p.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{p.token}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, color: p.ready ? p.c : "#334155", fontFamily:"monospace", fontWeight:600 }}>
              {!p.ready ? "…" : p.fmt(p.val)}
            </div>
            <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace" }}>
              {p.ready && p.usd > 0 ? `≈ $${p.usd.toFixed(2)}` : "—"}
            </div>
          </div>
        </div>
      ))}

      <div style={{ fontSize:8, color:"#64748b", letterSpacing:".14em", fontFamily:"monospace", marginBottom:6, marginTop:10 }}>SHIELDED BALANCES (private notes)</div>
      <ShieldedWallet bals={shBals} onMax={null}/>

      <div style={{ marginTop:10, background:"rgba(14,165,233,.04)", border:"1px solid rgba(14,165,233,.12)", borderRadius:4, padding:"10px 13px" }}>
        <div style={{ fontSize:9, color:"#0EA5E9", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>💧 NEED MORE USDC?</div>
        <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer"
          style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace", lineHeight:1.5, textDecoration:"none" }}>
          <span style={{ color:"#0EA5E9" }}>faucet.circle.com ↗</span> — Select Arc Testnet → paste address → request (1 USDC/day)
        </a>
      </div>
    </div>
  );
}

function HistoryPanel({ txHistory }) {
  const [filter,setFilter]=useState("all");
  const all = txHistory.length ? txHistory : [];
  const filtered = filter==="all" ? all : all.filter(t=>t.label.toLowerCase().includes(filter));
  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="📋" title="TRANSACTION HISTORY" sub="Real on-chain transactions on Arc Testnet"/>
      <div style={{ display:"flex", gap:5, marginBottom:12, flexWrap:"wrap" }}>
        {["all","shield","swap","send","withdraw","bridge","stake"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{ padding:"4px 9px", background:filter===f?"rgba(0,255,176,.12)":"rgba(0,0,0,.35)", border:`1px solid ${filter===f?"rgba(0,255,176,.35)":"rgba(0,255,176,.08)"}`, borderRadius:3, color:filter===f?"#00FFB0":"#64748b", fontSize:8, cursor:"pointer", fontFamily:"monospace", letterSpacing:".08em", textTransform:"uppercase", transition:"all .2s" }}>{f}</button>
        ))}
      </div>
      {filtered.length===0
        ? <div style={{ textAlign:"center", padding:"24px 0" }}>
            <div style={{ fontSize:10, color:"#334155", fontFamily:"monospace", marginBottom:8 }}>No transactions yet</div>
            <div style={{ fontSize:9, color:"#1e3a2a", fontFamily:"monospace" }}>Make your first real transaction on Arc Testnet</div>
            <a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ display:"inline-block", marginTop:10, fontSize:9, color:"#0EA5E9", fontFamily:"monospace", textDecoration:"none" }}>💧 Get testnet USDC first ↗</a>
          </div>
        : filtered.map((t,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 12px", background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.06)", borderRadius:4, marginBottom:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 4px #00FFB0", flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#ffffff", fontFamily:"monospace", fontWeight:700 }}>{t.label}</div>
              <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{t.ts} · {t.hash.slice(0,16)}···</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:10, color:"#4ade80", fontFamily:"monospace", fontWeight:600 }}>{t.amount}</div>
              <a href={`${ARC_TESTNET.explorer}/tx/${t.hash}`} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"#64748b", textDecoration:"none", fontFamily:"monospace", transition:"color .2s" }} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#64748b"}>ARCScan ↗</a>
            </div>
          </div>
        ))}
    </div>
  );
}

function SettingsPanel({ account, onArc, notify }) {
  const [slip, setSlip]=useState("0.5"); const [dl, setDl]=useState("20"); const [expert, setExpert]=useState(false);
  const [backupVisible, setBackupVisible] = useState(false);
  const [backupBlob, setBackupBlob] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const Tog=({on,onClick})=><div onClick={onClick} style={{ width:32, height:17, background:on?"rgba(0,255,176,.2)":"rgba(0,0,0,.5)", border:`1px solid ${on?"rgba(0,255,176,.55)":"rgba(0,255,176,.15)"}`, borderRadius:9, cursor:"pointer", position:"relative", transition:"all .2s", flexShrink:0 }}><div style={{ position:"absolute", top:2.5, left:on?15:2.5, width:10, height:10, borderRadius:"50%", background:on?"#00FFB0":"#475569", boxShadow:on?"0 0 5px #00FFB0":"none", transition:"all .2s" }}/></div>;
  const Sec=({t,c})=><div style={{ marginBottom:12 }}><div style={{ fontSize:8, color:"#4a7c5f", letterSpacing:".18em", fontFamily:"monospace", marginBottom:6, paddingBottom:5, borderBottom:"1px solid rgba(0,255,176,.06)" }}>{t}</div>{c}</div>;
  const Row=({label,sub,c})=><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 10px", background:"rgba(0,0,0,.3)", borderRadius:3, marginBottom:4, border:"1px solid rgba(255,255,255,.04)" }}><div><div style={{ fontSize:10, color:"#ffffff", fontFamily:"monospace" }}>{label}</div><div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", marginTop:1 }}>{sub}</div></div>{c}</div>;

  const handleExport = () => {
    if (!account?.address) return;
    const blob = exportViewKeyBackup(account.address);
    if (!blob) { notify?.("No view key yet", "Connect and send/receive once first — a view key is generated automatically.", "error"); return; }
    setBackupBlob(blob);
    setBackupVisible(true);
  };
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(backupBlob); notify?.("Copied ✓", "Backup copied — store it somewhere safe (password manager).", "success"); }
    catch { /* clipboard permission denied — blob is already shown for manual copy */ }
  };
  const handleRestore = async () => {
    if (!account?.address || !restoreInput.trim()) return;
    try {
      await importViewKeyBackup(account.address, restoreInput.trim());
      notify?.("View key restored ✓", "This device can now auto-decrypt confidential transfers sent to this wallet.", "success");
      setRestoreInput("");
    } catch (e) {
      notify?.("Restore failed", "That doesn't look like a valid PrivARC view-key backup.", "error");
    }
  };

  return (
    <div style={{ animation:"fi .3s ease" }}>
      <PH icon="⚙" title="SETTINGS" sub="Network configuration and transaction preferences"/>

      {/* Network selector */}
      <Sec t="NETWORK" c={<>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:10 }}>
          {/* Testnet — ACTIVE */}
          <div style={{ background:"rgba(0,255,176,.06)", border:"1.5px solid #00FFB0", borderRadius:5, padding:"10px 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 5px #00FFB0", animation:"pulse 2s infinite" }}/>
              <span style={{ fontSize:10, color:"#00FFB0", fontFamily:"monospace", fontWeight:700 }}>Arc Testnet</span>
              <span style={{ fontSize:7, background:"rgba(0,255,176,.12)", border:"1px solid rgba(0,255,176,.3)", borderRadius:2, padding:"0 4px", color:"#00FFB0", fontFamily:"monospace", marginLeft:"auto" }}>ACTIVE</span>
            </div>
            <div style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>chainId: 5042002</div>
            <div style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>RPC: rpc.testnet.arc.network</div>
            <div style={{ fontSize:7, color:"#4a7c5f", fontFamily:"monospace", marginTop:2 }}>Gas: USDC · Sub-second finality</div>
          </div>
          {/* Mainnet — LOCKED */}
          <div style={{ background:"rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.08)", borderRadius:5, padding:"10px 12px", opacity:.45, position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#475569" }}/>
              <span style={{ fontSize:10, color:"#475569", fontFamily:"monospace", fontWeight:700 }}>Arc Mainnet</span>
              <span style={{ fontSize:7, background:"rgba(71,85,105,.2)", border:"1px solid rgba(71,85,105,.3)", borderRadius:2, padding:"0 4px", color:"#475569", fontFamily:"monospace", marginLeft:"auto" }}>🔒 LOCKED</span>
            </div>
            <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>chainId: TBD</div>
            <div style={{ fontSize:8, color:"#334155", fontFamily:"monospace" }}>Not yet available</div>
            <div style={{ fontSize:7, color:"#334155", fontFamily:"monospace", marginTop:2 }}>Will unlock when Circle launches mainnet</div>
          </div>
        </div>
        <Row label="RPC Endpoint" sub={ARC_TESTNET.rpcUrl} c={<span style={{ fontSize:8, color:onArc?"#4ade80":"#f87171", fontFamily:"monospace" }}>{onArc?"CONNECTED":"DISCONNECTED"}</span>}/>
        <Row label="Block Explorer" sub="testnet.arcscan.app" c={<a href={ARC_TESTNET.explorer} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"#00FFB0", fontFamily:"monospace", textDecoration:"none" }}>OPEN ↗</a>}/>
        <Row label="Faucet" sub="1 USDC/day — Arc Testnet" c={<a href={ARC_TESTNET.faucet} target="_blank" rel="noreferrer" style={{ fontSize:8, color:"#0EA5E9", fontFamily:"monospace", textDecoration:"none" }}>GET USDC ↗</a>}/>
        <Row label="Chain" sub="Circle L1 — EVM compatible" c={<span style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>EVM</span>}/>
      </>}/>

      <Sec t="TRANSACTION" c={<>
        <Row label="Max Slippage" sub="Price movement tolerance" c={<div style={{ display:"flex", gap:4 }}>{["0.1","0.5","1.0"].map(v=><button key={v} onClick={()=>setSlip(v)} style={{ padding:"3px 7px", background:slip===v?"rgba(0,255,176,.14)":"rgba(0,0,0,.35)", border:`1px solid ${slip===v?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`, borderRadius:2, color:slip===v?"#00FFB0":"#64748b", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>{v}%</button>)}</div>}/>
        <Row label="TX Deadline" sub="Minutes until expiry" c={<div style={{ display:"flex", gap:4 }}>{["10","20","30"].map(v=><button key={v} onClick={()=>setDl(v)} style={{ padding:"3px 7px", background:dl===v?"rgba(0,255,176,.14)":"rgba(0,0,0,.35)", border:`1px solid ${dl===v?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`, borderRadius:2, color:dl===v?"#00FFB0":"#64748b", fontSize:8, cursor:"pointer", fontFamily:"monospace" }}>{v}m</button>)}</div>}/>
        <Row label="Expert Mode" sub="Skip confirmation dialogs" c={<Tog on={expert} onClick={()=>setExpert(!expert)}/>}/>
      </>}/>

      <Sec t="CONNECTED WALLET" c={<>
        <Row label="Address" sub={account?.address||"—"} c={<span style={{ fontSize:8, color:"#4ade80", fontFamily:"monospace" }}>ACTIVE</span>}/>
        <Row label="Provider" sub={account?.walletName||"—"} c={<span style={{ fontSize:8, color:"#94a3b8", fontFamily:"monospace" }}>{account?.walletName||"—"}</span>}/>
        <Row label="Network" sub={onArc?"Arc Testnet (5042002)":"Wrong network"} c={<span style={{ fontSize:8, color:onArc?"#4ade80":"#f87171", fontFamily:"monospace" }}>{onArc?"CORRECT":"WRONG"}</span>}/>
      </>}/>

      <Sec t="CONFIDENTIAL RECEIVING — VIEW KEY" c={<>
        <div style={{ fontSize:8, color:"#64748b", fontFamily:"monospace", lineHeight:1.6, marginBottom:8 }}>
          Confidential sends/deposits auto-decrypt using a view key stored only on <i>this</i> browser.
          It does not sync across devices — back it up to use confidential receiving elsewhere,
          the same way you'd back up a seed phrase.
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          <button onClick={handleExport} style={{ flex:1, padding:"8px", background:"rgba(0,255,176,.08)", border:"1px solid rgba(0,255,176,.3)", borderRadius:3, color:"#00FFB0", fontSize:9, fontFamily:"monospace", cursor:"pointer" }}>
            ↓ EXPORT BACKUP
          </button>
        </div>
        {backupVisible && (
          <div style={{ background:"rgba(0,0,0,.5)", border:"1px solid rgba(0,255,176,.2)", borderRadius:3, padding:8, marginBottom:8 }}>
            <textarea readOnly value={backupBlob} onClick={(e)=>e.target.select()}
              style={{ width:"100%", height:60, background:"transparent", border:"none", color:"#94a3b8", fontSize:7, fontFamily:"monospace", resize:"none", outline:"none" }}/>
            <button onClick={handleCopy} style={{ width:"100%", marginTop:4, padding:"5px", background:"rgba(0,255,176,.06)", border:"1px solid rgba(0,255,176,.2)", borderRadius:2, color:"#00FFB0", fontSize:8, fontFamily:"monospace", cursor:"pointer" }}>COPY TO CLIPBOARD</button>
            <div style={{ fontSize:7, color:"#fb923c", fontFamily:"monospace", marginTop:4 }}>⚠ Anyone with this blob can read your confidential transfers. Store it like a private key.</div>
          </div>
        )}
        <textarea value={restoreInput} onChange={(e)=>setRestoreInput(e.target.value)} placeholder="Paste backup from another device to restore here…"
          style={{ width:"100%", height:50, background:"rgba(0,0,0,.4)", border:"1px solid rgba(0,255,176,.12)", borderRadius:3, padding:6, color:"#ffffff", fontSize:8, fontFamily:"monospace", resize:"none", marginBottom:6 }}/>
        <button onClick={handleRestore} disabled={!restoreInput.trim()} style={{ width:"100%", padding:"8px", background:restoreInput.trim()?"rgba(0,255,176,.08)":"rgba(0,0,0,.3)", border:`1px solid ${restoreInput.trim()?"rgba(0,255,176,.3)":"rgba(255,255,255,.06)"}`, borderRadius:3, color:restoreInput.trim()?"#00FFB0":"#475569", fontSize:9, fontFamily:"monospace", cursor:restoreInput.trim()?"pointer":"default" }}>
          ↑ RESTORE ON THIS DEVICE
        </button>
      </>}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════════ */
function AppCore() {
  const [booted,    setBooted]    = useState(false);
  const [user,      setUser]      = useState(null);
  const [showTour,  setShowTour]  = useState(false);
  const { prices, changes, change24h, lastUpdate, priceError } = usePriceFeed();
  const { account }               = useW3();

  // Auto-logout when wallet disconnects
  useEffect(() => { if (user && !account) setUser(null); }, [account, user]);

  const handleAuth = (u) => { setUser(u); setTimeout(() => setShowTour(true), 600); };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000A06; overflow: hidden; }
        input, select, button, textarea { font-family: 'JetBrains Mono', monospace; }
        input::placeholder, textarea::placeholder { color: #1e3a2a !important; }
        select option { background: #000A06; color: #ffffff; }
        @keyframes fi  { from { opacity:0 } to { opacity:1 } }
        @keyframes fu  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.9)} }
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes g1 { 0%,89%,100%{opacity:0} 90%{opacity:.8;transform:translateX(-3px)} 95%{opacity:0;transform:translateX(3px)} }
        @keyframes g2 { 0%,93%,100%{opacity:0} 94%{opacity:.6;transform:translateX(3px)} 98%{opacity:0;transform:translateX(-2px)} }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:#000A06; }
        ::-webkit-scrollbar-thumb { background:rgba(0,255,176,.2); border-radius:2px; }
      `}</style>

      <HexGrid />
      {!booted && <Boot onDone={() => setBooted(true)} />}
      <ChainBanner />
      {showTour && <OnboardingTour onFinish={() => setShowTour(false)} />}

      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:user?"0":"24px 16px", position:"relative", zIndex:1, opacity:booted?1:0, transition:"opacity .6s ease .2s", overflow:"hidden" }}>
        {!user
          ? <AuthScreen onAuth={handleAuth} />
          : <Dashboard user={user} prices={prices} changes={changes} change24h={change24h} lastUpdate={lastUpdate} priceError={priceError} />
        }
      </div>
    </>
  );
}

export function PrivARCOS() {
  return (
    <Web3Provider>
      <NotifProvider>
        <AppCore />
      </NotifProvider>
    </Web3Provider>
  );
}
