import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   CHAIN CONFIG
═══════════════════════════════════════════════════════════════ */
const ARC = {
  id: 7070,
  name: "ARC Network",
  hex: "0x1BA2",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arcnetwork.io"] } },
  blockExplorers: { default: { name: "ARCScan", url: "https://scan.arcnetwork.io" } },
};
const ARC_TEST = { ...ARC, id: 7071, name: "ARC Testnet", hex: "0x1BA3" };

const CONTRACTS = {
  ShieldVault:  "0x7f3A4e9C2b8D1F0a3E5c7b9D2e4F6A8c0B2d4E6f",
  NoteRegistry: "0x3A5c7E9b1D3f5A7c9E1b3D5f7A9c1E3b5D7f9A1c",
  VerifierZK:   "0x9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D1f3A5c7E",
  FeeCollector: "0x1b3D5f7A9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D",
  Staking:      "0xF3aC9b5d7A1c3E5b7D9f1A3c5E7b9D1f3A5c7E9b",
  Governance:   "0xB9d1F3aC5E7b9D1f3A5c7E9b1D3f5A7c9E1b3D5f",
  USDC:         "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const R  = (a, b) => Math.random() * (b - a) + a;
const Ri = (a, b) => Math.floor(R(a, b));
const hx = (n)   => Array.from({ length: n }, () => "0123456789abcdef"[Ri(0, 16)]).join("");
const sl = (ms)  => new Promise(r => setTimeout(r, ms));
const f6 = (v)   => (Number(v) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fE = (v)   => (Number(v) / 1e18).toFixed(4);
const sh = (a)   => a ? a.slice(0, 8) + "···" + a.slice(-6) : "---";
const tc = ()    => { const n = new Date(); return [n.getHours(), n.getMinutes(), n.getSeconds()].map(x => String(x).padStart(2, "0")).join(":"); };

/* ═══════════════════════════════════════════════════════════════
   VIEM-COMPATIBLE SIM CLIENT
═══════════════════════════════════════════════════════════════ */
const mkPub = (chain) => ({
  chain,
  getBalance:    async () => { await sl(400); return BigInt(Math.floor(R(0.1, 4.8) * 1e18)); },
  readContract:  async ({ functionName: fn }) => {
    await sl(250);
    if (fn === "balanceOf")          return BigInt(Math.floor(R(500, 48000) * 1e6));
    if (fn === "getShieldedBalance") return BigInt(Math.floor(R(0, 11500) * 1e6));
    if (fn === "getStaked")          return BigInt(Math.floor(R(0, 5000) * 1e6));
    if (fn === "getPendingRewards")  return BigInt(Math.floor(R(0, 120) * 1e6));
    if (fn === "getTVL")             return BigInt(18_450_000 * 1e6);
    if (fn === "getTotalShielded")   return BigInt(4_230_841 * 1e6);
    if (fn === "getAPY")             return 420n;
    if (fn === "getStakingAPY")      return 1280n;
    if (fn === "getVotingPower")     return BigInt(Math.floor(R(0, 10000) * 1e6));
    return 0n;
  },
  estimateGas:   async () => { await sl(150); return BigInt(Ri(160000, 220000)); },
  getGasPrice:   async () => { await sl(100); return BigInt(Math.floor(R(0.8, 2.5) * 1e9)); },
  waitForTransactionReceipt: async (h) => { await sl(R(1800, 3200)); return { transactionHash: h, status: "success", blockNumber: BigInt(8420141 + Ri(0, 200)) }; },
});

const mkWal = (address) => ({
  account: { address },
  writeContract:   async () => { await sl(R(700, 1400)); return "0x" + hx(64); },
  sendTransaction: async () => { await sl(R(800, 1500)); return "0x" + hx(64); },
  signMessage:     async () => { await sl(300); return "0x" + hx(130); },
  switchChain:     async () => { await sl(500); return true; },
  addChain:        async () => { await sl(600); return true; },
});

/* ─── Try real EIP-1193 connection ───────────────────────────── */
const connectReal = async (chain) => {
  if (!window.ethereum) throw new Error("NO_PROVIDER");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("USER_REJECTED");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.hex }] });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: chain.hex, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [chain.blockExplorers.default.url] }],
      });
    }
  }
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  return { address: accounts[0], chainId };
};

/* ═══════════════════════════════════════════════════════════════
   LIVE PRICE FEED
═══════════════════════════════════════════════════════════════ */
const BASE_PRICES = { USDC: 1.0001, WETH: 2597.42, WBTC: 64521.80, ARCt: 0.2347, ARC: 0.1832, BNB: 412.50 };

function usePriceFeed() {
  const [prices, setPrices] = useState(BASE_PRICES);
  const [changes, setChanges] = useState({});
  useEffect(() => {
    const id = setInterval(() => {
      setPrices(prev => {
        const next = {}, chgs = {};
        Object.entries(prev).forEach(([k, v]) => {
          const d = v * R(-0.0008, 0.0008);
          next[k] = Math.max(0.0001, v + d);
          chgs[k] = d;
        });
        setChanges(chgs);
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);
  return { prices, changes };
}

/* ═══════════════════════════════════════════════════════════════
   WEB3 CONTEXT
═══════════════════════════════════════════════════════════════ */
const W3 = createContext(null);

function Web3Provider({ children }) {
  const [account,   setAccount]   = useState(null);
  const [pub,       setPub]       = useState(null);
  const [wal,       setWal]       = useState(null);
  const [chainOk,   setChainOk]   = useState(false);
  const [switching, setSwitching] = useState(false);
  const [testnet,   setTestnet]   = useState(false);
  const chain = testnet ? ARC_TEST : ARC;

  const connect = useCallback(async (address, walletName, tryReal = false) => {
    let addr = address, cid = chain.id;
    if (tryReal && window.ethereum) {
      try { const r = await connectReal(chain); addr = r.address; cid = parseInt(r.chainId, 16); } catch {}
    }
    setPub(mkPub(chain)); setWal(mkWal(addr));
    setAccount({ address: addr, chainId: cid, walletName });
    setChainOk(cid === chain.id);
  }, [chain]);

  const switchARC = useCallback(async () => {
    if (!wal || !account) return; setSwitching(true);
    try { await wal.switchChain({ id: chain.id }); setAccount(a => ({ ...a, chainId: chain.id })); setChainOk(true); }
    finally { setSwitching(false); }
  }, [wal, account, chain]);

  const disconnect = useCallback(() => {
    setAccount(null); setPub(null); setWal(null); setChainOk(false);
  }, []);

  const toggleTestnet = useCallback(() => setTestnet(t => !t), []);

  return (
    <W3.Provider value={{ account, pub, wal, chainOk, switching, testnet, connect, switchARC, disconnect, toggleTestnet }}>
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
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), 8000);
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
  {
    id: "metamask", name: "MetaMask", popular: true, color: "#E2761B", glow: "rgba(226,118,27,.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isMetaMask,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <path d="M36.4 3L22.3 13.3l2.6-6.1z" fill="#E17726"/>
        <path d="M3.6 3l14 10.4-2.5-6.2z" fill="#E27625"/>
        <path d="M31.1 27.5l-3.8 5.8 8.1 2.2 2.3-7.9z" fill="#E27625"/>
        <path d="M2.3 27.6l2.3 7.9 8.1-2.2-3.8-5.8z" fill="#E27625"/>
        <path d="M12.3 18.1l-2.2 3.4 7.9.4-.3-8.5z" fill="#E27625"/>
        <path d="M27.7 18.1l-5.5-4.8-.3 8.6 7.9-.4z" fill="#E27625"/>
        <path d="M12.7 33.3l4.8-2.3-4.1-3.2z" fill="#E27625"/>
        <path d="M22.5 31l4.8 2.3-.7-5.5z" fill="#E27625"/>
        <path d="M27.3 33.3l-4.8-2.3.4 3.2-.1 1.2z" fill="#D5BFB2"/>
        <path d="M12.7 33.3l4.5 2.1-.1-1.2.4-3.2z" fill="#D5BFB2"/>
        <path d="M22.1 21.9l.5-8.6-2.3-6.2h-4.6l-2.3 6.2.5 8.6.2 2.6v6.1h3.8l.1-6.1z" fill="#F5841F"/>
      </svg>
    ),
  },
  {
    id: "rabby", name: "Rabby Wallet", popular: true, color: "#7B68EE", glow: "rgba(123,104,238,.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isRabby,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect width="40" height="40" rx="10" fill="#7B68EE"/>
        <ellipse cx="20" cy="19" rx="12" ry="10" fill="white" opacity=".95"/>
        <circle cx="15" cy="17" r="2.5" fill="#7B68EE"/><circle cx="25" cy="17" r="2.5" fill="#7B68EE"/>
        <circle cx="15.8" cy="16.2" r="1" fill="white"/><circle cx="25.8" cy="16.2" r="1" fill="white"/>
        <path d="M15 22 Q20 26 25 22" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    ),
  },
  {
    id: "wc", name: "WalletConnect", popular: true, color: "#3B99FC", glow: "rgba(59,153,252,.3)",
    installed: () => true,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect width="40" height="40" rx="10" fill="#3B99FC"/>
        <path d="M11 16c5-5 13-5 18 0l.6.6c.2.2.2.5 0 .7L28 19c-.1.1-.3.1-.4 0l-.8-.8C24 15 16 15 13 18.2l-.8.8c-.1.1-.3.1-.4 0L10 17.3c-.2-.2-.2-.5 0-.7z" fill="white"/>
        <path d="M30 18l1.6 1.6c.2.2.2.5 0 .7L24 28c-.2.2-.5.2-.7 0l-5.3-5.3c-.1-.1-.2-.1-.3 0L12.4 28c-.2.2-.5.2-.7 0L4 20.3c-.2-.2-.2-.5 0-.7L5.6 18c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0l5.3-5.3c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0L29.3 18c.2-.2.5-.2.7 0z" fill="white"/>
      </svg>
    ),
  },
  {
    id: "coinbase", name: "Coinbase Wallet", popular: true, color: "#0052FF", glow: "rgba(0,82,255,.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isCoinbaseWallet,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect width="40" height="40" rx="10" fill="#0052FF"/>
        <circle cx="20" cy="20" r="11" fill="white"/>
        <rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF"/>
      </svg>
    ),
  },
  {
    id: "trust", name: "Trust Wallet", popular: false, color: "#3375BB", glow: "rgba(51,117,187,.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isTrust,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect width="40" height="40" rx="10" fill="#3375BB"/>
        <path d="M20 8L30 12v9c0 5.5-4.5 10-10 11C9.5 31 5 26.5 5 21v-9z" fill="white" opacity=".9"/>
        <path d="M16 20l3 3 5-6" stroke="#3375BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "okx", name: "OKX Wallet", popular: false, color: "#111", glow: "rgba(255,255,255,.1)",
    installed: () => typeof window !== "undefined" && !!window.okxwallet,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect width="40" height="40" rx="10" fill="#111"/>
        <rect x="8" y="8" width="10" height="10" rx="2" fill="white"/>
        <rect x="22" y="8" width="10" height="10" rx="2" fill="white"/>
        <rect x="8" y="22" width="10" height="10" rx="2" fill="white"/>
        <rect x="22" y="22" width="10" height="10" rx="2" fill="white"/>
      </svg>
    ),
  },
  {
    id: "tp", name: "TokenPocket", popular: false, color: "#2980FE", glow: "rgba(41,128,254,.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isTokenPocket,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect width="40" height="40" rx="10" fill="#2980FE"/>
        <rect x="8" y="12" width="24" height="6" rx="3" fill="white" opacity=".9"/>
        <rect x="8" y="22" width="16" height="6" rx="3" fill="white" opacity=".6"/>
        <circle cx="30" cy="25" r="4" fill="white" opacity=".9"/>
      </svg>
    ),
  },
  {
    id: "brave", name: "Brave Wallet", popular: false, color: "#FF5000", glow: "rgba(255,80,0,.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isBraveWallet,
    icon: (
      <svg viewBox="0 0 40 40" width="30" height="30">
        <rect width="40" height="40" rx="10" fill="#FF5000"/>
        <path d="M20 7L28 11 31 20 26 29 20 33 14 29 9 20 12 11z" fill="white" opacity=".9"/>
        <circle cx="20" cy="20" r="3" fill="#FF5000"/>
      </svg>
    ),
  },
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
      const g = ctx.createRadialGradient(c.width * .5, c.height * .4, 0, c.width * .5, c.height * .4, c.width * .7);
      g.addColorStop(0, "rgba(0,18,10,1)"); g.addColorStop(1, "rgba(0,6,4,1)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      const RR = 36, cols = Math.ceil(c.width / (RR * 1.73)) + 2, rows = Math.ceil(c.height / (RR * 1.5)) + 2;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * RR * 1.73 + (row % 2 === 0 ? 0 : RR * .865), y = row * RR * 1.5;
          const d = Math.sqrt((x - c.width * .5) ** 2 + (y - c.height * .4) ** 2);
          const wave = Math.sin(d * .011 - t * 1.6) * .5 + .5;
          const pulse = Math.sin(t * .6 + col * .3 + row * .5) * .3 + .3;
          const alpha = wave * pulse * .35;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ag = (Math.PI / 3) * i - Math.PI / 6;
            i === 0 ? ctx.moveTo(x + RR * .95 * Math.cos(ag), y + RR * .95 * Math.sin(ag))
                    : ctx.lineTo(x + RR * .95 * Math.cos(ag), y + RR * .95 * Math.sin(ag));
          }
          ctx.closePath();
          if (alpha > .16) { ctx.fillStyle = `rgba(0,255,160,${alpha * .05})`; ctx.fill(); }
          ctx.strokeStyle = `rgba(0,255,180,${alpha})`; ctx.lineWidth = .5; ctx.stroke();
        }
      }
      for (let y = 0; y < c.height; y += 3) { ctx.fillStyle = "rgba(0,0,0,0.05)"; ctx.fillRect(0, y, c.width, 1); }
      raf = requestAnimationFrame(draw);
    };
    draw(); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rz); };
  }, []);
  return <canvas ref={ref} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ═══════════════════════════════════════════════════════════════
   BOOT SEQUENCE
═══════════════════════════════════════════════════════════════ */
function Boot({ onDone }) {
  const [lines, setLines] = useState([]); const [done, setDone] = useState(false);
  const BL = [
    { t: 0,    c: "#00FFB0", m: "PRIVARC OS v2.4.1  —  ARC Network" },
    { t: 280,  c: "#4ADE80", m: "Initializing cryptographic subsystems..." },
    { t: 560,  c: "#4ADE80", m: "Loading ZK-proof engine [Groth16]  ✓" },
    { t: 840,  c: "#4ADE80", m: "Connecting to ARC Network RPC...  [OK]" },
    { t: 1100, c: "#4ADE80", m: "ShieldVault contract: 0x7f3a...d9e2  ✓" },
    { t: 1360, c: "#00FFB0", m: "AI Agent cluster: ONLINE (8 agents)" },
    { t: 1620, c: "#4ADE80", m: "USDC fee module: active" },
    { t: 1880, c: "#F59E0B", m: "Privacy layer: ARMED" },
    { t: 2200, c: "#00FFB0", m: "━━━  SYSTEM READY — AUTHENTICATE TO PROCEED  ━━━" },
  ];
  useEffect(() => {
    BL.forEach(({ t, c, m }) => setTimeout(() => setLines(p => [...p, { c, m }]), t));
    setTimeout(() => { setDone(true); setTimeout(onDone, 500); }, 2900);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000A06", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 10vw", fontFamily: "monospace", opacity: done ? 0 : 1, transition: "opacity .5s", pointerEvents: done ? "none" : "all" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: "#1A4A30", letterSpacing: ".3em", marginBottom: 6 }}>PRIVARC AUTONOMOUS CRYPTO OPERATING SYSTEM v2.4.1</div>
        <div style={{ width: 40, height: 1.5, background: "#00FFB0", marginBottom: 18 }} />
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 13, color: l.c, marginBottom: 5, letterSpacing: ".05em", lineHeight: 1.6, animation: "fi .3s ease" }}>
          <span style={{ color: "#1A4A30", marginRight: 10 }}>[{String(i).padStart(2, "0")}]</span>{l.m}
        </div>
      ))}
      {lines.length > 0 && (
        <div style={{ marginTop: 18, height: 2, background: "#0A2018", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", background: "linear-gradient(90deg,#00FFB0,#0EA5E9)", width: `${Math.min(100, (lines.length / BL.length) * 100)}%`, transition: "width .28s", boxShadow: "0 0 8px #00FFB0" }} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CHAIN SWITCH BANNER
═══════════════════════════════════════════════════════════════ */
function ChainBanner() {
  const { chainOk, switchARC, switching, account } = useW3();
  if (!account || chainOk) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 150, background: "rgba(245,158,11,.12)", borderBottom: "1px solid rgba(245,158,11,.35)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "monospace", backdropFilter: "blur(8px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#F59E0B" }}>⚠</span>
        <span style={{ fontSize: 11, color: "#FCD34D", letterSpacing: ".06em" }}>Wrong network — PrivARC requires <strong>ARC Network (7070)</strong></span>
      </div>
      <button onClick={switchARC} disabled={switching} style={{ background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.45)", borderRadius: 3, color: "#F59E0B", fontSize: 10, padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", letterSpacing: ".12em", display: "flex", alignItems: "center", gap: 7, transition: "all .2s" }}>
        {switching ? <><Sp c="#F59E0B" sz={10} /> Switching...</> : "⟶ SWITCH TO ARC"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRICE TICKER
═══════════════════════════════════════════════════════════════ */
function PriceTicker({ prices, changes }) {
  const TOKENS = ["USDC", "WETH", "WBTC", "ARCt", "ARC", "BNB"];
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let pos = 0;
    const id = setInterval(() => {
      pos -= 0.8;
      if (pos < -el.scrollWidth / 2) pos = 0;
      el.style.transform = `translateX(${pos}px)`;
    }, 16);
    return () => clearInterval(id);
  }, []);
  const items = [...TOKENS, ...TOKENS];
  return (
    <div style={{ overflow: "hidden", background: "rgba(0,0,0,.5)", borderBottom: "1px solid rgba(0,255,176,.08)", height: 24, display: "flex", alignItems: "center" }}>
      <div ref={ref} style={{ display: "flex", whiteSpace: "nowrap", willChange: "transform" }}>
        {items.map((t, i) => {
          const p = prices[t] || 0; const c = changes[t] || 0; const up = c >= 0;
          return (
            <span key={i} style={{ fontSize: 10, fontFamily: "monospace", padding: "0 18px", color: "#ffffff", borderRight: "1px solid rgba(0,255,176,.07)" }}>
              <span style={{ color: "#94a3b8", marginRight: 5 }}>{t}</span>
              <span style={{ color: up ? "#00FFB0" : "#f87171", fontWeight: 600 }}>
                ${p < 10 ? p.toFixed(4) : p < 1000 ? p.toFixed(2) : p.toFixed(0)}
              </span>
              <span style={{ color: up ? "#00FFB0" : "#f87171", marginLeft: 4, fontSize: 9 }}>
                {up ? "▲" : "▼"}{Math.abs(c / p * 100).toFixed(3)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MICRO COMPONENTS
═══════════════════════════════════════════════════════════════ */
const Sp = ({ sz = 12, c = "#00FFB0" }) => (
  <span style={{ width: sz, height: sz, border: `1.5px solid rgba(0,255,176,.2)`, borderTop: `1.5px solid ${c}`, borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block", flexShrink: 0 }} />
);

function Glitch({ text, style }) {
  return (
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
      <span style={{ position: "absolute", top: 0, left: 0, color: "#00FFB0", opacity: 0, animation: "g1 4s infinite", clipPath: "polygon(0 30%,100% 30%,100% 50%,0 50%)", transform: "translateX(-2px)" }}>{text}</span>
      <span style={{ position: "absolute", top: 0, left: 0, color: "#0EA5E9", opacity: 0, animation: "g2 4s infinite", clipPath: "polygon(0 60%,100% 60%,100% 80%,0 80%)", transform: "translateX(2px)" }}>{text}</span>
    </span>
  );
}

function ArcBtn({ label, onClick, loading, disabled, color = "#00FFB0", small = false }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      style={{ width: "100%", padding: small ? "8px 0" : "12px 0", background: "transparent", border: `1px solid ${disabled || loading ? "rgba(0,255,176,.2)" : color}`, borderRadius: 3, color: disabled || loading ? "#4a7c5f" : color, fontSize: small ? 9 : 11, fontWeight: 700, cursor: disabled || loading ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: ".16em", boxShadow: disabled || loading ? "none" : `0 0 18px ${color}20`, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, transition: "all .2s", textTransform: "uppercase" }}
      onMouseEnter={e => !disabled && !loading && (e.currentTarget.style.background = `${color}12`)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
      {loading ? <><Sp /> Processing...</> : label}
    </button>
  );
}

function OsField({ label, type = "text", value, onChange, placeholder, icon, error, readOnly, suffix, hint }) {
  const [foc, setFoc] = useState(false); const [sp, setSp] = useState(false); const isP = type === "password";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: foc ? "#00FFB0" : "#64748b", fontFamily: "monospace", transition: "color .2s" }}>
          {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}
        </label>
        {error && <span style={{ fontSize: 9, color: "#f87171" }}>⚠ {error}</span>}
      </div>
      <div style={{ position: "relative" }}>
        {["tl", "tr", "bl", "br"].map(p => (
          <span key={p} style={{ position: "absolute", zIndex: 2, width: 6, height: 6, borderColor: foc ? "#00FFB0" : error ? "#f87171" : "#1e3a2a", borderStyle: "solid", borderWidth: 0, transition: "border-color .2s", ...(p === "tl" ? { top: -1, left: -1, borderTopWidth: 1.5, borderLeftWidth: 1.5 } : p === "tr" ? { top: -1, right: -1, borderTopWidth: 1.5, borderRightWidth: 1.5 } : p === "bl" ? { bottom: -1, left: -1, borderBottomWidth: 1.5, borderLeftWidth: 1.5 } : { bottom: -1, right: -1, borderBottomWidth: 1.5, borderRightWidth: 1.5 }) }} />
        ))}
        <input type={isP && !sp ? "password" : "text"} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
          onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
          style={{ width: "100%", boxSizing: "border-box", padding: `10px ${suffix ? "60px" : "14px"} 10px 14px`, background: foc ? "rgba(0,255,176,.04)" : readOnly ? "rgba(0,255,176,.01)" : "rgba(0,0,0,.45)", border: `1px solid ${error ? "#f87171" : foc ? "rgba(0,255,176,.5)" : "rgba(0,255,176,.15)"}`, borderRadius: 3, color: "#ffffff", fontSize: 12, fontFamily: "monospace", outline: "none", letterSpacing: ".04em", transition: "all .2s", cursor: readOnly ? "default" : "text" }} />
        {suffix && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#64748b", fontFamily: "monospace", pointerEvents: "none" }}>{suffix}</span>}
        {isP && <button onClick={() => setSp(!sp)} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: sp ? "#00FFB0" : "#64748b", fontSize: 13, padding: 0 }}>{sp ? "◉" : "◎"}</button>}
      </div>
      {hint && !error && <div style={{ marginTop: 3, fontSize: 9, color: "#4a7c5f", fontFamily: "monospace" }}>{hint}</div>}
    </div>
  );
}

const PH = ({ icon, title, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".2em", fontFamily: "monospace", marginBottom: 2 }}>▸ {icon} {title}</div>
    <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{sub}</div>
    <div style={{ width: "100%", height: 1, background: "rgba(0,255,176,.1)", marginTop: 7 }} />
  </div>
);

const IG = ({ items }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)`, gap: 5, marginBottom: 12 }}>
    {items.map(([k, v, s], i) => (
      <div key={i} style={{ background: "rgba(0,0,0,.4)", borderRadius: 3, padding: "7px 9px", border: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ fontSize: 7, color: "#64748b", fontFamily: "monospace", marginBottom: 3 }}>{k}</div>
        <div style={{ fontSize: 10, color: "#4ade80", fontFamily: "monospace", fontWeight: 600 }}>{v}</div>
        {s && <div style={{ fontSize: 7, color: "#334155", fontFamily: "monospace" }}>{s}</div>}
      </div>
    ))}
  </div>
);

function TxToast({ tx, onClose }) {
  useEffect(() => { if (tx?.status === "success" || tx?.status === "error") { const id = setTimeout(onClose, 6000); return () => clearTimeout(id); } }, [tx]);
  if (!tx) return null;
  const C = { pending: "#F59E0B", success: "#00FFB0", error: "#f87171" };
  const I = { pending: "⏳", success: "✓", error: "✕" };
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 500, background: "rgba(0,8,5,.97)", border: `1px solid ${C[tx.status]}33`, borderRadius: 5, padding: "12px 16px", minWidth: 280, maxWidth: 340, fontFamily: "monospace", animation: "fu .3s ease", backdropFilter: "blur(12px)", boxShadow: `0 0 24px ${C[tx.status]}15` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 14, color: C[tx.status], flexShrink: 0 }}>{I[tx.status]}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C[tx.status], fontWeight: 700, letterSpacing: ".08em", marginBottom: 3 }}>{tx.label}</div>
          <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.5 }}>{tx.message}</div>
          {tx.hash && <a href={`${ARC.blockExplorers.default.url}/tx/${tx.hash}`} target="_blank" rel="noreferrer" style={{ fontSize: 8, color: "#00FFB0", textDecoration: "none", display: "block", marginTop: 3 }}>{tx.hash.slice(0, 20)}···  ↗ ARCScan</a>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CENTER
═══════════════════════════════════════════════════════════════ */
function NotifCenter({ onClose }) {
  const { notifs, markRead, clearAll } = useNotif();
  const C = { info: "#0EA5E9", success: "#00FFB0", warn: "#F59E0B", error: "#f87171" };
  return (
    <div style={{ position: "absolute", top: 44, right: 12, width: 310, background: "rgba(0,8,5,.98)", border: "1px solid rgba(0,255,176,.2)", borderRadius: 5, zIndex: 200, boxShadow: "0 20px 60px rgba(0,0,0,.9)", animation: "fu .2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px 8px", borderBottom: "1px solid rgba(0,255,176,.08)" }}>
        <span style={{ fontSize: 9, color: "#ffffff", fontFamily: "monospace", letterSpacing: ".15em", fontWeight: 700 }}>NOTIFICATIONS</span>
        <button onClick={clearAll} style={{ fontSize: 8, color: "#64748b", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", transition: "color .2s" }} onMouseEnter={e => e.target.style.color = "#f87171"} onMouseLeave={e => e.target.style.color = "#64748b"}>CLEAR ALL</button>
      </div>
      <div style={{ maxHeight: 280, overflow: "auto" }}>
        {notifs.length === 0
          ? <div style={{ padding: "18px 14px", textAlign: "center", fontSize: 9, color: "#334155", fontFamily: "monospace" }}>No notifications</div>
          : [...notifs].reverse().map(n => (
            <div key={n.id} onClick={() => markRead(n.id)} style={{ padding: "9px 14px", borderBottom: "1px solid rgba(0,255,176,.04)", cursor: "pointer", background: n.read ? "transparent" : "rgba(0,255,176,.02)", transition: "background .2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.05)"}
              onMouseLeave={e => e.currentTarget.style.background = n.read ? "transparent" : "rgba(0,255,176,.02)"}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C[n.type] || "#00FFB0", boxShadow: `0 0 4px ${C[n.type] || "#00FFB0"}`, flexShrink: 0, marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#e2e8f0", fontFamily: "monospace", lineHeight: 1.4 }}>{n.msg}</div>
                  <div style={{ fontSize: 8, color: "#4a7c5f", fontFamily: "monospace", marginTop: 2 }}>{n.ts}</div>
                </div>
              </div>
            </div>
          ))}
      </div>
      <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(0,255,176,.06)" }}>
        <button onClick={onClose} style={{ width: "100%", padding: "6px 0", background: "transparent", border: "1px solid rgba(0,255,176,.12)", borderRadius: 3, color: "#64748b", fontSize: 8, cursor: "pointer", fontFamily: "monospace", transition: "all .2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.3)"; e.currentTarget.style.color = "#ffffff"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.12)"; e.currentTarget.style.color = "#64748b"; }}>CLOSE</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL SEARCH
═══════════════════════════════════════════════════════════════ */
const SEARCH_IDX = [
  { label: "Overview",             panel: "overview",   icon: "◈",  desc: "Dashboard home" },
  { label: "Shield Assets",        panel: "shield",     icon: "🛡", desc: "Deposit into private vault" },
  { label: "Private Swap",         panel: "swap",       icon: "⇄",  desc: "ZK-routed exchange" },
  { label: "Private Send",         panel: "send",       icon: "↗",  desc: "Stealth transfer" },
  { label: "Withdraw Funds",       panel: "withdraw",   icon: "↙",  desc: "Exit to public address" },
  { label: "Bridge Cross-chain",   panel: "bridge",     icon: "⟺", desc: "ETH, BNB, Polygon..." },
  { label: "Analytics",            panel: "analytics",  icon: "📈", desc: "TVL, charts, heatmaps" },
  { label: "ZK Proof Console",     panel: "zk",         icon: "🔐", desc: "Groth16 & PLONK proofs" },
  { label: "Governance",           panel: "governance", icon: "🗳", desc: "Vote on proposals" },
  { label: "Staking & Rewards",    panel: "staking",    icon: "💎", desc: "Earn yield" },
  { label: "Portfolio",            panel: "portfolio",  icon: "📊", desc: "Asset allocation" },
  { label: "AI Agents",            panel: "agents",     icon: "🤖", desc: "8 on-chain agents" },
  { label: "Transaction History",  panel: "history",    icon: "📋", desc: "Activity log" },
  { label: "Settings",             panel: "settings",   icon: "⚙",  desc: "Config" },
];

function GlobalSearch({ onSelect, onClose }) {
  const [q, setQ] = useState(""); const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const results = q.trim() ? SEARCH_IDX.filter(i => i.label.toLowerCase().includes(q.toLowerCase()) || i.desc.toLowerCase().includes(q.toLowerCase())) : SEARCH_IDX;
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}>
      <div style={{ width: "100%", maxWidth: 500, background: "rgba(0,8,5,.98)", border: "1px solid rgba(0,255,176,.25)", borderRadius: 6, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.9)", animation: "fu .2s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(0,255,176,.08)" }}>
          <span style={{ color: "#64748b", fontSize: 16 }}>⌕</span>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Search panels, features, actions..."
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#ffffff", fontSize: 13, fontFamily: "monospace" }}
            onKeyDown={e => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && results[0]) onSelect(results[0].panel); }} />
          <button onClick={onClose} style={{ color: "#64748b", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontFamily: "monospace" }}>ESC</button>
        </div>
        <div style={{ maxHeight: 380, overflow: "auto" }}>
          {results.map((r, i) => (
            <div key={i} onClick={() => onSelect(r.panel)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid rgba(0,255,176,.04)", transition: "background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 11, color: "#ffffff", fontFamily: "monospace", fontWeight: 700 }}>{r.label}</div>
                <div style={{ fontSize: 9, color: "#64748b", fontFamily: "monospace", marginTop: 1 }}>{r.desc}</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#334155", fontFamily: "monospace" }}>→</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(0,255,176,.06)", display: "flex", gap: 14 }}>
          {[["↵", "Select"], ["ESC", "Close"], ["▲▼", "Navigate"]].map(([k, l]) => (
            <span key={k} style={{ fontSize: 8, color: "#334155", fontFamily: "monospace" }}>
              <span style={{ background: "rgba(0,255,176,.08)", border: "1px solid rgba(0,255,176,.15)", borderRadius: 2, padding: "1px 5px", marginRight: 4, color: "#64748b" }}>{k}</span>{l}
            </span>
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
    <div onClick={e => e.target === e.currentTarget && onCancel()} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fi .2s ease" }}>
      <div style={{ width: "100%", maxWidth: 360, background: "rgba(0,8,5,.97)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 6, padding: "24px 24px 20px", boxShadow: "0 0 40px rgba(239,68,68,.1)", animation: "fu .25s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚠</div>
          <div>
            <div style={{ fontSize: 14, color: "#ffffff", fontFamily: "monospace", fontWeight: 700 }}>Disconnect Wallet</div>
            <div style={{ fontSize: 9, color: "#64748b", fontFamily: "monospace", marginTop: 1 }}>{walletName} · {sh(address)}</div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", lineHeight: 1.6, marginBottom: 20 }}>
          You will be logged out of PrivARC OS. Your on-chain assets remain safe — only the session will be terminated.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={onCancel} style={{ padding: "10px 0", background: "transparent", border: "1px solid rgba(0,255,176,.15)", borderRadius: 3, color: "#94a3b8", fontSize: 10, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", transition: "all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.4)"; e.currentTarget.style.color = "#ffffff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.15)"; e.currentTarget.style.color = "#94a3b8"; }}>
            CANCEL
          </button>
          <button onClick={onConfirm} style={{ padding: "10px 0", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.4)", borderRadius: 3, color: "#f87171", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", transition: "all .2s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,.1)"}>
            ⟶ DISCONNECT
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WALLET CONNECT MODAL
═══════════════════════════════════════════════════════════════ */
function WCModal({ onClose, onConnect }) {
  const [step, setStep] = useState("list"); const [sel, setSel] = useState(null); const [addr, setAddr] = useState("");

  const go = async (w) => {
    setSel(w); setStep("conn"); await sl(1000 + Math.random() * 700);
    // Try real connection first
    if (w.installed() && window.ethereum) {
      try {
        const r = await connectReal(ARC);
        setAddr(r.address); setStep("sign"); return;
      } catch {}
    }
    setAddr("0x" + hx(40)); setStep("sign");
  };

  const sign = async () => {
    setStep("conn"); await sl(800); setStep("ok");
    setTimeout(() => onConnect({ address: addr, wallet: sel }), 900);
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,.88)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fi .2s ease" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "rgba(0,8,5,.97)", border: "1px solid rgba(0,255,176,.2)", borderRadius: 6, overflow: "hidden", animation: "fu .25s ease", boxShadow: "0 40px 80px rgba(0,0,0,.9)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px 13px", borderBottom: "1px solid rgba(0,255,176,.08)" }}>
          <div>
            <div style={{ fontSize: 8, color: "#4a7c5f", letterSpacing: ".2em", fontFamily: "monospace", marginBottom: 2 }}>WALLET CONNECTION PROTOCOL</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#00FFB0", fontFamily: "monospace" }}>
              {step === "list" ? "Select Wallet Provider" : step === "conn" ? `Connecting ${sel?.name || ""}...` : step === "sign" ? "Sign Authentication Request" : "Wallet Connected ✓"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(0,255,176,.12)", borderRadius: 3, color: "#64748b", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 14, transition: "all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.35)"; e.currentTarget.style.color = "#00FFB0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.12)"; e.currentTarget.style.color = "#64748b"; }}>✕</button>
        </div>

        <div style={{ padding: "18px 20px 20px" }}>
          {/* WALLET LIST */}
          {step === "list" && (
            <div style={{ animation: "fi .3s ease" }}>
              <div style={{ fontSize: 8, color: "#4a7c5f", letterSpacing: ".18em", fontFamily: "monospace", marginBottom: 8 }}>▸ POPULAR</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
                {WALLETS.filter(w => w.popular).map(w => <WBtn key={w.id} w={w} onClick={() => go(w)} />)}
              </div>
              <div style={{ fontSize: 8, color: "#4a7c5f", letterSpacing: ".18em", fontFamily: "monospace", marginBottom: 8 }}>▸ MORE WALLETS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {WALLETS.filter(w => !w.popular).map(w => <WBtn key={w.id} w={w} onClick={() => go(w)} />)}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(0,255,176,.06)", fontSize: 8, color: "#334155", fontFamily: "monospace", textAlign: "center" }}>
                Secured by EIP-4361 · Sign-In With Ethereum · ARC Network
              </div>
            </div>
          )}

          {/* CONNECTING */}
          {step === "conn" && sel && (
            <div style={{ textAlign: "center", padding: "20px 0", animation: "fi .3s ease" }}>
              <div style={{ position: "relative", width: 72, height: 72, margin: "0 auto 18px" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", border: `2px solid ${sel.color}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>{sel.icon}</div>
                <svg style={{ position: "absolute", inset: 0, animation: "spin 1.2s linear infinite" }} width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="33" fill="none" stroke={sel.color} strokeWidth="1.5" strokeDasharray="55 160" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontSize: 12, color: "#ffffff", fontFamily: "monospace", marginBottom: 4 }}>Opening {sel.name}...</div>
              <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>Confirm connection in your wallet</div>
            </div>
          )}

          {/* SIGN REQUEST */}
          {step === "sign" && sel && (
            <div style={{ animation: "fi .3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 42, height: 42, borderRadius: 9, background: `${sel.color}18`, border: `1px solid ${sel.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sel.icon}</div>
                <div>
                  <div style={{ fontSize: 12, color: "#ffffff", fontFamily: "monospace", fontWeight: 700 }}>{sel.name}</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>{sh(addr)}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FFB0", boxShadow: "0 0 6px #00FFB0" }} />
                  <span style={{ fontSize: 9, color: "#00FFB0", fontFamily: "monospace" }}>CONNECTED</span>
                </div>
              </div>
              <div style={{ background: "rgba(0,0,0,.45)", border: "1px solid rgba(0,255,176,.12)", borderRadius: 4, padding: "13px 15px", marginBottom: 16, fontFamily: "monospace" }}>
                <div style={{ fontSize: 8, color: "#4a7c5f", letterSpacing: ".15em", marginBottom: 8 }}>SIGNATURE REQUEST — EIP-4361</div>
                {[["Domain", "privarc.io"], ["Address", sh(addr)], ["Chain", "ARC Network (7070)"], ["Nonce", hx(8)], ["Issued", new Date().toISOString().split("T")[0]], ["URI", "https://privarc.io/auth"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: "#64748b", minWidth: 56 }}>{k}:</span>
                    <span style={{ fontSize: 9, color: "#4ade80" }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(0,255,176,.07)", fontSize: 9, color: "#4a7c5f" }}>
                  This request will not trigger a blockchain transaction or cost fees.
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={onClose} style={{ padding: "11px 0", background: "transparent", border: "1px solid rgba(0,255,176,.12)", borderRadius: 3, color: "#64748b", fontSize: 10, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", transition: "all .2s" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.borderColor = "rgba(0,255,176,.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "rgba(0,255,176,.12)"; }}>CANCEL</button>
                <button onClick={sign} style={{ padding: "11px 0", background: "transparent", border: "1px solid #00FFB0", borderRadius: 3, color: "#00FFB0", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", boxShadow: "0 0 16px rgba(0,255,176,.12)", transition: "all .2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.1)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>⟶ SIGN & ENTER</button>
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {step === "ok" && sel && (
            <div style={{ textAlign: "center", padding: "16px 0", animation: "fi .4s ease" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(0,255,176,.08)", border: "2px solid #00FFB0", boxShadow: "0 0 30px rgba(0,255,176,.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26, color: "#00FFB0" }}>✓</div>
              <div style={{ fontSize: 13, color: "#ffffff", fontFamily: "monospace", fontWeight: 700, marginBottom: 4 }}>Authentication Successful</div>
              <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{sel.name} · {sh(addr)}</div>
              <div style={{ marginTop: 12, fontSize: 9, color: "#334155", fontFamily: "monospace" }}>Launching PrivARC OS...</div>
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
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: h ? `${w.color}12` : "rgba(0,0,0,.4)", border: `1px solid ${h ? w.color + "55" : "rgba(0,255,176,.1)"}`, borderRadius: 6, padding: "11px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, transition: "all .2s", boxShadow: h ? `0 0 18px ${w.glow}` : "none" }}>
      <div style={{ width: 34, height: 34, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: h ? `${w.color}18` : "rgba(255,255,255,.05)", border: `1px solid ${h ? w.color + "40" : "rgba(255,255,255,.08)"}`, transition: "all .2s" }}>{w.icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: h ? "#ffffff" : "#e2e8f0", fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color .2s" }}>{w.name}</div>
        <div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          {inst && <span style={{ color: "#00FFB0", fontSize: 7 }}>●</span>}{inst ? "Detected" : "Available"}
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AUTH SCREEN — WALLET ONLY
═══════════════════════════════════════════════════════════════ */
function AuthScreen({ onAuth }) {
  const { connect } = useW3();
  const [showWC, setShowWC] = useState(false);
  const [loading, setLoading] = useState(null); // wallet id being loaded

  const handleWC = async ({ address, wallet: w }) => {
    setShowWC(false); setLoading("connecting");
    await connect(address, w.name, !!window.ethereum);
    setLoading(null);
    onAuth({ walletName: w.name, address });
  };

  const handleQuickConnect = async (w) => {
    setLoading(w.id);
    await sl(600);
    setLoading(null);
    setShowWC(true);
  };

  return (
    <>
      {showWC && <WCModal onClose={() => setShowWC(false)} onConnect={handleWC} />}
      <div style={{ width: "100%", maxWidth: 440, background: "rgba(0,8,5,.94)", backdropFilter: "blur(20px)", border: "1px solid rgba(0,255,176,.15)", borderRadius: 6, boxShadow: "0 0 60px rgba(0,255,176,.05), 0 40px 80px rgba(0,0,0,.85)", padding: "32px 30px 28px", position: "relative", animation: "fu .6s ease forwards" }}>
        {/* Corner decorations */}
        {["tl", "tr", "bl", "br"].map(p => (
          <span key={p} style={{ position: "absolute", zIndex: 2, width: 12, height: 12, borderColor: "rgba(0,255,176,.3)", borderStyle: "solid", borderWidth: 0, ...(p === "tl" ? { top: -1, left: -1, borderTopWidth: 1.5, borderLeftWidth: 1.5 } : p === "tr" ? { top: -1, right: -1, borderTopWidth: 1.5, borderRightWidth: 1.5 } : p === "bl" ? { bottom: -1, left: -1, borderBottomWidth: 1.5, borderLeftWidth: 1.5 } : { bottom: -1, right: -1, borderBottomWidth: 1.5, borderRightWidth: 1.5 }) }} />
        ))}

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, border: "1.5px solid #00FFB0", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#00FFB0", boxShadow: "0 0 16px rgba(0,255,176,.25)" }}>◈</div>
            <Glitch text="privARC" style={{ fontSize: 26, fontWeight: 800, color: "#00FFB0", fontFamily: "'Syne', sans-serif", letterSpacing: "-.01em" }} />
            <span style={{ fontSize: 9, color: "#4a7c5f", fontFamily: "monospace", letterSpacing: ".12em", alignSelf: "flex-end", paddingBottom: 2 }}>OS</span>
          </div>
          <p style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", letterSpacing: ".04em", lineHeight: 1.6 }}>
            Autonomous crypto OS · Private on-chain capital<br />8 AI agents · ARC Network
          </p>
        </div>

        {/* Connect section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".18em", fontFamily: "monospace", marginBottom: 12, textAlign: "center" }}>▸ CONNECT YOUR WALLET TO AUTHENTICATE</div>

          {/* Popular wallets grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {WALLETS.filter(w => w.popular).map(w => (
              <button key={w.id} onClick={() => handleQuickConnect(w)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(0,0,0,.4)", border: `1px solid ${loading === w.id ? w.color + "60" : "rgba(0,255,176,.12)"}`, borderRadius: 5, cursor: "pointer", transition: "all .2s", position: "relative", overflow: "hidden" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${w.color}60`; e.currentTarget.style.background = `${w.color}0D`; e.currentTarget.style.boxShadow = `0 0 18px ${w.glow}`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.12)"; e.currentTarget.style.background = "rgba(0,0,0,.4)"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: `${w.color}18`, border: `1px solid ${w.color}30`, flexShrink: 0 }}>{w.icon}</div>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#ffffff", fontFamily: "monospace", fontWeight: 700 }}>{w.name}</div>
                  {w.installed() && <div style={{ fontSize: 8, color: "#00FFB0", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 3 }}><span style={{ fontSize: 7 }}>●</span> Detected</div>}
                </div>
                {loading === w.id && <Sp sz={14} c={w.color} />}
              </button>
            ))}
          </div>

          {/* All wallets button */}
          <button onClick={() => setShowWC(true)} style={{ width: "100%", padding: "12px 0", background: "transparent", border: "1px solid rgba(0,255,176,.18)", borderRadius: 4, color: "#94a3b8", fontSize: 10, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".12em", transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.4)"; e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.background = "rgba(0,255,176,.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.18)"; e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "transparent"; }}>
            <span>⬡</span> All wallets ({WALLETS.length} supported)
          </button>
        </div>

        {/* Info box */}
        <div style={{ background: "rgba(0,255,176,.03)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 4, padding: "12px 14px", marginBottom: 20 }}>
          <div style={{ fontSize: 8, color: "#00FFB0", letterSpacing: ".15em", fontFamily: "monospace", marginBottom: 6 }}>HOW IT WORKS</div>
          {[["1.", "Connect your wallet — no email or password needed"], ["2.", "Sign the EIP-4361 authentication message (no gas fee)"], ["3.", "PrivARC OS launches with your on-chain identity"]].map(([n, t]) => (
            <div key={n} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#4a7c5f", fontFamily: "monospace", flexShrink: 0 }}>{n}</span>
              <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace", lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 8, color: "#334155", fontFamily: "monospace" }}>🔒 EIP-4361 · Non-custodial</span>
          <span style={{ fontSize: 8, color: "#334155", fontFamily: "monospace" }}>USDC FEES · ARC 7070</span>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING TOUR
═══════════════════════════════════════════════════════════════ */
const TOUR = [
  { target: "overview",   icon: "◈",  title: "Welcome to PrivARC OS", body: "Your autonomous crypto OS for private on-chain capital management, powered by 8 AI agents on ARC Network." },
  { target: "shield",     icon: "🛡", title: "Shield — Deposit Privately", body: "Deposit USDC into the ShieldVault. Funds are wrapped in ZK commitments — completely untraceable on-chain." },
  { target: "swap",       icon: "⇄",  title: "Private Swap — ZK Routed", body: "Exchange tokens without exposing amounts or addresses. Routes through the ZK relay layer." },
  { target: "analytics",  icon: "📈", title: "Analytics Dashboard", body: "Live TVL charts, transaction heatmaps and protocol metrics updated in real time." },
  { target: "governance", icon: "🗳", title: "On-Chain Governance", body: "Vote on protocol proposals (PIP) with your veARC voting power. Shape the future of PrivARC." },
  { target: "staking",    icon: "💎", title: "Staking & Rewards", body: "Stake USDC to earn yield and boost your governance power. Lock multipliers up to 3×." },
  { target: "agents",     icon: "🤖", title: "8 AI Agents — Always On", body: "ShieldAgent, ZKAgent, RiskAgent and 5 others run autonomously to protect and optimize your capital 24/7." },
];

function OnboardingTour({ onFinish }) {
  const [step, setStep] = useState(0);
  const s = TOUR[step];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "rgba(0,8,5,.97)", border: "1px solid rgba(0,255,176,.28)", borderRadius: 7, padding: "28px 28px 24px", boxShadow: "0 0 60px rgba(0,255,176,.08)", animation: "fu .3s ease" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 22 }}>
          {TOUR.map((_, i) => <div key={i} style={{ flex: 1, height: 2, borderRadius: 1, background: i <= step ? "#00FFB0" : "rgba(0,255,176,.12)", transition: "background .3s", boxShadow: i === step ? "0 0 6px #00FFB0" : "none" }} />)}
        </div>
        <div style={{ width: 54, height: 54, borderRadius: 12, background: "rgba(0,255,176,.08)", border: "1.5px solid rgba(0,255,176,.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 16, boxShadow: "0 0 20px rgba(0,255,176,.1)" }}>{s.icon}</div>
        <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".2em", fontFamily: "monospace", marginBottom: 6 }}>STEP {step + 1} / {TOUR.length}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", fontFamily: "'Syne', sans-serif", marginBottom: 12, lineHeight: 1.3 }}>{s.title}</div>
        <p style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", lineHeight: 1.7, marginBottom: 22 }}>{s.body}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onFinish} style={{ flex: 1, padding: "10px 0", background: "transparent", border: "1px solid rgba(0,255,176,.15)", borderRadius: 3, color: "#64748b", fontSize: 9, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", transition: "all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.borderColor = "rgba(0,255,176,.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "rgba(0,255,176,.15)"; }}>SKIP</button>
          <button onClick={() => { if (step < TOUR.length - 1) setStep(s => s + 1); else onFinish(); }}
            style={{ flex: 2, padding: "10px 0", background: "transparent", border: "1px solid #00FFB0", borderRadius: 3, color: "#00FFB0", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".12em", boxShadow: "0 0 18px rgba(0,255,176,.12)", transition: "all .2s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.08)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {step < TOUR.length - 1 ? "NEXT →" : "⟶ LAUNCH OS"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD PANELS (compact, production-quality)
═══════════════════════════════════════════════════════════════ */
function OverviewPanel({ balances, pub, agentLogs, setPanel, prices, changes }) {
  const [stats, setStats] = useState({ tvl: 0n, apy: 0n });
  useEffect(() => { if (!pub) return; (async () => { const [t, a] = await Promise.all([pub.readContract({ functionName: "getTVL" }), pub.readContract({ functionName: "getAPY" })]); setStats({ tvl: t, apy: a }); })(); }, [pub]);
  const spkD = useMemo(() => { let v = 3800000; return Array.from({ length: 24 }, () => { v += R(-60000, 130000); v = Math.max(2e6, v); return Math.round(v); }); }, []);
  const mx = Math.max(...spkD), mn = Math.min(...spkD);
  const spk = spkD.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (spkD.length - 1)) * 100).toFixed(1)} ${(100 - ((v - mn) / (mx - mn || 1)) * 100 * .8 - 10).toFixed(1)}`).join(" ");

  return (
    <div style={{ animation: "fi .3s ease" }}>
      <div style={{ fontSize: 9, color: "#4a7c5f", letterSpacing: ".2em", fontFamily: "monospace", marginBottom: 14 }}>◈ SYSTEM OVERVIEW</div>

      {/* Balance cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginBottom: 14 }}>
        {[
          { l: "SHIELDED", v: f6(balances.shielded), u: "USDC", glow: true,  p: "shield" },
          { l: "WALLET",   v: f6(balances.usdc),     u: "USDC", glow: false, p: "withdraw" },
          { l: "GAS",      v: fE(balances.arc),       u: "ARC",  glow: false, p: null },
        ].map(b => (
          <div key={b.l} onClick={() => b.p && setPanel(b.p)} style={{ background: "rgba(0,0,0,.4)", border: `1px solid rgba(0,255,176,${b.glow ? .22 : .1})`, borderRadius: 5, padding: "11px 13px", cursor: b.p ? "pointer" : "default", transition: "all .2s", boxShadow: b.glow ? "0 0 18px rgba(0,255,176,.06)" : "none" }}
            onMouseEnter={e => { if (b.p) { e.currentTarget.style.borderColor = "rgba(0,255,176,.4)"; e.currentTarget.style.background = "rgba(0,255,176,.04)"; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `rgba(0,255,176,${b.glow ? .22 : .1})`; e.currentTarget.style.background = "rgba(0,0,0,.4)"; }}>
            <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".18em", fontFamily: "monospace", marginBottom: 5 }}>{b.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: b.glow ? "#00FFB0" : "#ffffff", fontFamily: "monospace", lineHeight: 1 }}>{b.v}</div>
            <div style={{ fontSize: 9, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>{b.u}</div>
          </div>
        ))}
      </div>

      {/* Stats + sparkline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "12px 14px" }}>
          <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".18em", fontFamily: "monospace", marginBottom: 5 }}>PROTOCOL TVL</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", fontFamily: "monospace" }}>${(Number(stats.tvl) / 1e12).toFixed(2)}M</div>
          <svg width="100%" height="28" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ marginTop: 7 }}>
            <path d={spk} fill="none" stroke="#00FFB0" strokeWidth="2" opacity=".6" />
          </svg>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          {[
            { l: "APY",       v: `${(Number(stats.apy) / 100).toFixed(2)}%`, c: "#00FFB0" },
            { l: "TX / 24H",  v: Ri(120, 800).toString(),                    c: "#4ade80" },
            { l: "AGENTS",    v: "8/8",                                       c: "#00FFB0" },
            { l: "ZK PROOFS", v: Ri(50, 280).toString(),                      c: "#a78bfa" },
          ].map(s => (
            <div key={s.l} style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 5, padding: "9px 11px" }}>
              <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".16em", fontFamily: "monospace", marginBottom: 4 }}>{s.l}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Live prices */}
      <div style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 5, padding: "10px 13px", marginBottom: 14 }}>
        <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".18em", fontFamily: "monospace", marginBottom: 8 }}>LIVE PRICES</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {["USDC", "WETH", "WBTC", "ARCt", "ARC", "BNB"].map(t => {
            const p = prices[t] || 0; const c = changes[t] || 0; const up = c >= 0;
            return (
              <div key={t}>
                <div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace" }}>{t}</div>
                <div style={{ fontSize: 11, color: up ? "#00FFB0" : "#f87171", fontFamily: "monospace", fontWeight: 700 }}>${p < 10 ? p.toFixed(4) : p < 1000 ? p.toFixed(2) : p.toFixed(0)}</div>
                <div style={{ fontSize: 8, color: up ? "#00FFB0" : "#f87171", fontFamily: "monospace" }}>{up ? "▲" : "▼"}{Math.abs(c / p * 100).toFixed(2)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginBottom: 14 }}>
        {[["shield", "🛡", "Shield"], ["swap", "⇄", "Swap"], ["send", "↗", "Send"], ["withdraw", "↙", "Withdraw"], ["bridge", "⟺", "Bridge"]].map(([id, icon, label]) => (
          <button key={id} onClick={() => setPanel(id)} style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "9px 4px", cursor: "pointer", textAlign: "center", transition: "all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.4)"; e.currentTarget.style.background = "rgba(0,255,176,.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.1)"; e.currentTarget.style.background = "rgba(0,0,0,.35)"; }}>
            <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>
            <div style={{ fontSize: 8, color: "#00FFB0", fontFamily: "monospace", letterSpacing: ".06em" }}>{label}</div>
          </button>
        ))}
      </div>

      {/* Agent log */}
      <div style={{ background: "rgba(0,0,0,.5)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 4, padding: "9px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 8, color: "#4a7c5f", letterSpacing: ".2em", fontFamily: "monospace" }}>AI AGENT LOG</div>
          <button onClick={() => setPanel("agents")} style={{ fontSize: 8, color: "#64748b", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", transition: "color .2s" }}
            onMouseEnter={e => e.target.style.color = "#00FFB0"} onMouseLeave={e => e.target.style.color = "#64748b"}>VIEW ALL →</button>
        </div>
        {agentLogs.slice(-3).map((l, i) => (
          <div key={i} style={{ fontSize: 9, fontFamily: "monospace", marginBottom: 2, color: l.c, lineHeight: 1.4 }}>
            <span style={{ color: "#1e3a2a", marginRight: 7 }}>[{l.t}]</span>{l.m}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Transaction panels ──────────────────────────────────────── */
function ShieldPanel({ wal, pub, account, balances, notify, refresh }) {
  const [a, setA] = useState(""); const [ld, setLd] = useState(false); const [gas, setGas] = useState(null);
  useEffect(() => { if (!pub || !a || isNaN(a) || Number(a) <= 0) return; const id = setTimeout(async () => { const g = await pub.estimateGas(); const gp = await pub.getGasPrice(); setGas(fE(g * gp) + " ARC"); }, 500); return () => clearTimeout(id); }, [a, pub]);
  const sub = async () => { if (!a || !wal) return; setLd(true); notify("Shield", "Approving USDC allowance...", "pending"); try { const ah = await wal.writeContract({}); await pub.waitForTransactionReceipt(ah); const sh = await wal.writeContract({}); await pub.waitForTransactionReceipt(sh); notify("Shield ✓", `${a} USDC shielded`, "success", sh); setA(""); await refresh(); } catch (e) { notify("Shield Failed", e.message || "Rejected", "error"); } setLd(false); };
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="🛡" title="SHIELD" sub="Deposit assets into the private ShieldVault" />
      <div style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(0,255,176,.12)", borderRadius: 5, padding: "13px 15px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace" }}>Available</span>
          <button onClick={() => setA(f6(balances.usdc).replace(/,/g, ""))} style={{ fontSize: 9, color: "#00FFB0", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace" }}>MAX {f6(balances.usdc)}</button>
        </div>
        <OsField label="USDC AMOUNT" value={a} onChange={e => setA(e.target.value)} placeholder="0.00" icon="🛡" suffix="USDC" />
        <IG items={[["Protocol Fee", "0.00 USDC", "Launch phase"], ["Est. Gas", gas || "—", "ARC Network"], ["Privacy", "ZK commitment", "On-chain"]]} />
      </div>
      <div style={{ background: "rgba(0,255,176,.03)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 3, padding: "8px 11px", marginBottom: 12, fontSize: 9, color: "#94a3b8", fontFamily: "monospace", lineHeight: 1.5 }}>
        ZK commitment generated on-chain. Funds become untraceable once shielded.
      </div>
      <ArcBtn label="⟶ SHIELD ASSETS" onClick={sub} loading={ld} disabled={!a || Number(a) <= 0} />
    </div>
  );
}

function SwapPanel({ wal, pub, account, balances, notify, refresh }) {
  const TK = ["USDC", "WETH", "WBTC", "ARCt", "DAI", "USDT"];
  const RT = { USDC: { WETH: .000385, WBTC: .0000155, ARCt: 4.25, DAI: .9997, USDT: 1.0001 }, WETH: { USDC: 2597, WBTC: .0403, ARCt: 11031, DAI: 2596, USDT: 2596 }, WBTC: { USDC: 64500, WETH: 24.8, ARCt: 274000, DAI: 64480, USDT: 64490 }, ARCt: { USDC: .235, WETH: .0000906, DAI: .2348, USDT: .2347, WBTC: .00000365 }, DAI: { USDC: 1.0003, WETH: .000385, WBTC: .0000155, ARCt: 4.25, USDT: 1.0002 }, USDT: { USDC: .9999, WETH: .000384, WBTC: .0000154, ARCt: 4.249, DAI: .9998 } };
  const [fr, setFr] = useState("USDC"); const [to, setTo] = useState("WETH"); const [a, setA] = useState(""); const [q, setQ] = useState(null); const [ld, setLd] = useState(false);
  useEffect(() => { if (!a || isNaN(a) || Number(a) <= 0) { setQ(null); return; } const id = setTimeout(() => { const rate = RT[fr]?.[to] || 1; const out = Number(a) * rate * (0.9992 + Math.random() * .001); setQ({ out: out.toFixed(6), fee: (Number(a) * .0005).toFixed(4), impact: (Math.random() * .3).toFixed(2) }); }, 450); return () => clearTimeout(id); }, [a, fr, to]);
  const sw = async () => { if (!a || !wal || !q) return; setLd(true); notify("Swap", "ZK routing...", "pending"); try { const h = await wal.writeContract({}); await pub.waitForTransactionReceipt(h); notify("Swap ✓", `${a} ${fr} → ${q.out} ${to}`, "success", h); setA(""); setQ(null); await refresh(); } catch (e) { notify("Swap Failed", e.message, "error"); } setLd(false); };
  const TS = ({ v, onChange }) => <select value={v} onChange={e => onChange(e.target.value)} style={{ background: "rgba(0,0,0,.5)", border: "1px solid rgba(0,255,176,.18)", borderRadius: 3, color: "#ffffff", fontSize: 11, fontFamily: "monospace", padding: "8px 9px", cursor: "pointer", outline: "none", flexShrink: 0 }}>{TK.map(t => <option key={t}>{t}</option>)}</select>;
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="⇄" title="PRIVATE SWAP" sub="ZK-routed on-chain exchange — amounts and addresses hidden" />
      <div style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(0,255,176,.12)", borderRadius: 5, padding: "13px 15px", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}><div style={{ flex: 1 }}><OsField label="FROM" value={a} onChange={e => setA(e.target.value)} placeholder="0.00" icon="⬆" /></div><TS v={fr} onChange={v => { setFr(v); if (v === to) setTo(TK.find(t => t !== v)); }} /></div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><button onClick={() => { setFr(to); setTo(fr); setA(""); setQ(null); }} style={{ background: "rgba(0,255,176,.08)", border: "1px solid rgba(0,255,176,.25)", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: "#00FFB0", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.15)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(0,255,176,.08)"}>⇅</button></div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><div style={{ flex: 1 }}><OsField label="TO (ESTIMATED)" value={q ? q.out : ""} placeholder="0.00" icon="⬇" readOnly /></div><TS v={to} onChange={v => { setTo(v); if (v === fr) setFr(TK.find(t => t !== v)); }} /></div>
      </div>
      {q && <div style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 4, padding: "9px 12px", marginBottom: 10 }}>{[["Fee", `${q.fee} USDC`], ["Price Impact", `~${q.impact}%`], ["Route", `${fr} → ZK Relay → ${to}`]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: 9, color: "#64748b", fontFamily: "monospace" }}>{k}</span><span style={{ fontSize: 9, color: "#4ade80", fontFamily: "monospace" }}>{v}</span></div>)}</div>}
      <ArcBtn label="⟶ EXECUTE PRIVATE SWAP" onClick={sw} loading={ld} disabled={!a || !q} />
    </div>
  );
}

function SendPanel({ wal, pub, account, balances, notify, refresh }) {
  const [to, setTo] = useState(""); const [a, setA] = useState(""); const [ld, setLd] = useState(false); const [resolving, setResolving] = useState(false); const [resolved, setResolved] = useState(null); const [note, setNote] = useState("");
  useEffect(() => { if (to.endsWith(".arc") || to.endsWith(".eth")) { setResolving(true); setResolved(null); const id = setTimeout(() => { setResolving(false); setResolved("0x" + hx(40)); }, 700); return () => clearTimeout(id); } else setResolved(null); }, [to]);
  const send = async () => { if ((!to && !resolved) || !a || !wal) return; setLd(true); notify("Send", "Generating stealth address...", "pending"); try { const h = await wal.writeContract({}); await pub.waitForTransactionReceipt(h); notify("Send ✓", `${a} USDC sent privately`, "success", h); setTo(""); setA(""); setResolved(null); setNote(""); await refresh(); } catch (e) { notify("Send Failed", e.message, "error"); } setLd(false); };
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="↗" title="PRIVATE SEND" sub="Stealth address P2P transfer — sender invisible on-chain" />
      <OsField label="RECIPIENT (ADDRESS OR .ARC / .ETH NAME)" value={to} onChange={e => setTo(e.target.value)} placeholder="0x... or name.arc" icon="↗" hint={resolving ? "Resolving name..." : resolved ? `✓ Resolved: ${sh(resolved)}` : null} />
      <OsField label="AMOUNT" value={a} onChange={e => setA(e.target.value)} placeholder="0.00" icon="💸" suffix="USDC" />
      <OsField label="ENCRYPTED NOTE (OPTIONAL)" value={note} onChange={e => setNote(e.target.value)} placeholder="memo for recipient..." icon="📝" />
      <IG items={[["Fee", "0.02 USDC", "Flat"], ["Privacy", "Stealth addr", "Sender hidden"], ["Delivery", "Instant", "ARC Network"]]} />
      <ArcBtn label="⟶ SEND PRIVATELY" onClick={send} loading={ld} disabled={!to || !a || resolving} />
    </div>
  );
}

function WithdrawPanel({ wal, pub, account, balances, notify, refresh }) {
  const [a, setA] = useState(""); const [dest, setDest] = useState(""); const [ld, setLd] = useState(false); const [proving, setProving] = useState(false);
  const withdraw = async () => { if (!a || !wal) return; setLd(true); setProving(true); notify("Withdraw", "Generating ZK ownership proof...", "pending"); await sl(1700); setProving(false); try { const target = dest || account.address; const h = await wal.writeContract({}); await pub.waitForTransactionReceipt(h); notify("Withdraw ✓", `${a} USDC → ${sh(target)}`, "success", h); setA(""); setDest(""); await refresh(); } catch (e) { notify("Withdraw Failed", e.message, "error"); } setLd(false); };
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="↙" title="WITHDRAW" sub="Exit shielded funds to a public address" />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace" }}>Shielded balance</span><button onClick={() => setA(f6(balances.shielded).replace(/,/g, ""))} style={{ fontSize: 9, color: "#00FFB0", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace" }}>MAX {f6(balances.shielded)}</button></div>
      <OsField label="AMOUNT" value={a} onChange={e => setA(e.target.value)} placeholder="0.00" icon="↙" suffix="USDC" />
      <OsField label="DESTINATION ADDRESS (OPTIONAL)" value={dest} onChange={e => setDest(e.target.value)} placeholder={account?.address || "0x..."} icon="📍" />
      <IG items={[["Fee", "0.03 USDC", "Flat"], ["ZK Proof", "Groth16", "~1.8s gen"], ["Available", f6(balances.shielded), "USDC"]]} />
      {proving && <div style={{ marginBottom: 10, padding: "8px 12px", background: "rgba(0,255,176,.04)", border: "1px solid rgba(0,255,176,.18)", borderRadius: 3, display: "flex", alignItems: "center", gap: 8 }}><Sp /><span style={{ fontSize: 9, color: "#00FFB0", fontFamily: "monospace" }}>Generating Groth16 ZK ownership proof...</span></div>}
      <ArcBtn label="⟶ WITHDRAW FUNDS" onClick={withdraw} loading={ld} disabled={!a || Number(a) <= 0} />
    </div>
  );
}

function BridgePanel({ wal, pub, account, balances, notify, refresh }) {
  const CH = [{ id: "ethereum", name: "Ethereum", icon: "Ξ", fee: "0.10", time: "5-10m" }, { id: "bnb", name: "BNB Chain", icon: "⬡", fee: "0.08", time: "3-6m" }, { id: "polygon", name: "Polygon", icon: "⬟", fee: "0.05", time: "2-4m" }, { id: "arbitrum", name: "Arbitrum", icon: "🔵", fee: "0.04", time: "1-3m" }, { id: "base", name: "Base", icon: "🔷", fee: "0.04", time: "1-3m" }, { id: "optimism", name: "Optimism", icon: "🔴", fee: "0.04", time: "1-3m" }];
  const [dest, setDest] = useState("ethereum"); const [a, setA] = useState(""); const [ld, setLd] = useState(false);
  const ch = CH.find(c => c.id === dest);
  const bridge = async () => { if (!a || !wal) return; setLd(true); notify("Bridge", "Locking in BridgeAdapter...", "pending"); try { const h = await wal.writeContract({}); await pub.waitForTransactionReceipt(h); notify("Bridge ✓", `${a} USDC → ${ch?.name}`, "success", h); setA(""); await refresh(); } catch (e) { notify("Bridge Failed", e.message, "error"); } setLd(false); };
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="⟺" title="BRIDGE" sub="Cross-chain private transfer — funds shielded end-to-end" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginBottom: 12 }}>
        {CH.map(c => <button key={c.id} onClick={() => setDest(c.id)} style={{ background: dest === c.id ? "rgba(0,255,176,.08)" : "rgba(0,0,0,.35)", border: `1px solid ${dest === c.id ? "rgba(0,255,176,.4)" : "rgba(0,255,176,.1)"}`, borderRadius: 5, padding: "8px 5px", cursor: "pointer", textAlign: "center", transition: "all .2s" }}><div style={{ fontSize: 17, marginBottom: 2 }}>{c.icon}</div><div style={{ fontSize: 8, color: dest === c.id ? "#00FFB0" : "#94a3b8", fontFamily: "monospace" }}>{c.name.split(" ")[0]}</div><div style={{ fontSize: 7, color: "#4a7c5f", fontFamily: "monospace" }}>{c.fee} USDC</div></button>)}
      </div>
      <OsField label="AMOUNT" value={a} onChange={e => setA(e.target.value)} placeholder="0.00" icon="⟺" suffix="USDC" />
      <IG items={[["Dest", ch?.name || "—"], ["Fee", `${ch?.fee} USDC`], ["Time", ch?.time || "—"], ["Privacy", "E2E shielded"]]} />
      <ArcBtn label={`⟶ BRIDGE TO ${ch?.name?.toUpperCase() || "—"}`} onClick={bridge} loading={ld} disabled={!a || Number(a) <= 0} />
    </div>
  );
}

function AnalyticsPanel({ pub }) {
  const [loading, setLoading] = useState(true); const [stats, setStats] = useState({ tvl: 0n });
  useEffect(() => { if (!pub) return; (async () => { const t = await pub.readContract({ functionName: "getTVL" }); setStats({ tvl: t }); setLoading(false); })(); }, [pub]);
  const tvlD = useMemo(() => { let v = 3800000; return Array.from({ length: 30 }, () => { v += R(-80000, 180000); v = Math.max(2e6, v); return Math.round(v); }); }, []);
  const txD  = useMemo(() => Array.from({ length: 30 }, () => Ri(80, 620)), []);
  const zkD  = useMemo(() => Array.from({ length: 30 }, () => Ri(40, 310)), []);
  const HM   = useMemo(() => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => Ri(0, 200))), []);
  const hmMax = Math.max(...HM.flat());

  const mkSpk = (data, col, label, fmt = v => v.toLocaleString()) => {
    const mx = Math.max(...data), mn = Math.min(...data);
    const W = 260, H = 55;
    const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * W, y: H - ((v - mn) / (mx - mn || 1)) * H * .82 - H * .09 }));
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const last = data[data.length - 1], prev = data[data.length - 2], chg = ((last - prev) / prev * 100);
    return (
      <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "11px 13px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
          <div>
            <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".15em", fontFamily: "monospace", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#ffffff", fontFamily: "monospace" }}>{fmt(last)}</div>
          </div>
          <div style={{ fontSize: 9, color: chg >= 0 ? "#00FFB0" : "#f87171", fontFamily: "monospace", background: `rgba(${chg >= 0 ? "0,255,176" : "248,113,113"},.08)`, border: `1px solid rgba(${chg >= 0 ? "0,255,176" : "248,113,113"},.2)`, borderRadius: 2, padding: "2px 6px" }}>
            {chg >= 0 ? "+" : ""}{chg.toFixed(1)}%
          </div>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 48 }}>
          <defs><linearGradient id={`ag${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".2" /><stop offset="100%" stopColor={col} stopOpacity="0" /></linearGradient></defs>
          <path d={`${path} L${W} ${H} L0 ${H} Z`} fill={`url(#ag${label})`} />
          <path d={path} fill="none" stroke={col} strokeWidth="1.5" opacity=".85" />
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill={col} />
        </svg>
      </div>
    );
  };

  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="📈" title="ANALYTICS" sub="Protocol metrics, charts and transaction heatmaps" />
      {loading
        ? <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 0" }}><Sp /><span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>Loading on-chain data...</span></div>
        : <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {mkSpk(tvlD, "#00FFB0", "TOTAL VALUE LOCKED", v => "$" + (v / 1e6).toFixed(2) + "M")}
            {mkSpk(txD, "#0EA5E9", "DAILY TRANSACTIONS")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            {mkSpk(zkD, "#a78bfa", "ZK PROOFS GENERATED")}
            <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "11px 13px" }}>
              <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".15em", fontFamily: "monospace", marginBottom: 8 }}>PROTOCOL STATS</div>
              {[["TVL", "$" + (Number(stats.tvl) / 1e12).toFixed(2) + "M USDC", "#00FFB0"], ["Operators", Ri(1200, 3400).toLocaleString(), "#94a3b8"], ["ZK/day avg", Ri(180, 420).toString(), "#a78bfa"], ["Shield avg", "$" + Ri(500, 8000).toLocaleString(), "#0EA5E9"], ["Staking APY", "12.80%", "#fbbf24"]].map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 9, color: "#64748b", fontFamily: "monospace" }}>{k}</span>
                  <span style={{ fontSize: 9, color: c, fontFamily: "monospace", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "11px 13px" }}>
            <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".15em", fontFamily: "monospace", marginBottom: 8 }}>TRANSACTION HEATMAP — LAST 7 DAYS × 24H</div>
            <div style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: 24 }, (_, col) => (
                <div key={col} style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  {Array.from({ length: 7 }, (_, row) => (
                    <div key={row} style={{ height: 10, borderRadius: 2, background: `rgba(0,255,176,${HM[row][col] / hmMax * .7 + .05})` }} title={`${HM[row][col]} txs`} />
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontSize: 7, color: "#334155", fontFamily: "monospace" }}>00:00</span>
              <span style={{ fontSize: 7, color: "#334155", fontFamily: "monospace" }}>12:00</span>
              <span style={{ fontSize: 7, color: "#334155", fontFamily: "monospace" }}>23:00</span>
            </div>
          </div>
        </>}
    </div>
  );
}

function ZKPanel({ wal, pub, notify }) {
  const [mode, setMode] = useState("groth16"); const [circuit, setCircuit] = useState("shield"); const [proving, setProving] = useState(false); const [phase, setPhase] = useState(0); const [proof, setProof] = useState(null); const [verified, setVerified] = useState(null); const [verifying, setVerifying] = useState(false); const [history, setHistory] = useState([]);
  const CIRCS = { shield: { name: "ShieldCircuit", constraints: Ri(28000, 35000), time: 1.82 }, transfer: { name: "TransferCircuit", constraints: Ri(42000, 55000), time: 2.41 }, withdraw: { name: "WithdrawCircuit", constraints: Ri(35000, 44000), time: 2.12 } };
  const C = CIRCS[circuit];
  const STEPS = mode === "groth16" ? ["Compiling constraints...", "Generating witness vector...", "Computing FFT on proving key...", "Evaluating QAP polynomials...", "Computing π_A, π_B, π_C...", "Serializing proof...", "PROOF COMPLETE"] : ["Init PLONK prover...", "Computing permutation...", "Building gate constraints...", "Multilinear extensions...", "Commitment scheme...", "Finalizing proof...", "PROOF COMPLETE"];
  const run = async () => { if (!wal) return; setProving(true); setPhase(0); setProof(null); setVerified(null); for (let i = 0; i < STEPS.length; i++) { setPhase(i + 1); await sl(R(260, 480)); } const p = { scheme: mode.toUpperCase(), circuit: C.name, pi_a: ["0x" + hx(64), "0x" + hx(64), "0x01"], pi_c: ["0x" + hx(64), "0x" + hx(64), "0x01"], constraints: C.constraints, provingTime: (C.time + R(-0.3, 0.4)).toFixed(2) + "s", hash: "0x" + hx(64), ts: tc() }; setProof(p); setProving(false); setHistory(h => [{ ...p, id: hx(8) }, ...h.slice(0, 9)]); notify("ZK Proof Ready", `${mode.toUpperCase()} · ${C.name}`, "success"); };
  const verify = async () => { if (!proof) return; setVerifying(true); await sl(R(400, 900)); setVerified(Math.random() > .05); setVerifying(false); };

  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="🔐" title="ZK PROOF CONSOLE" sub="Generate and verify Groth16 & PLONK zero-knowledge proofs" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".14em", fontFamily: "monospace", marginBottom: 6 }}>PROVING SCHEME</div>
          <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
            {["groth16", "plonk"].map(m => <button key={m} onClick={() => { setMode(m); setProof(null); setVerified(null); }} style={{ flex: 1, padding: "7px 0", background: mode === m ? "rgba(0,255,176,.1)" : "rgba(0,0,0,.35)", border: `1px solid ${mode === m ? "rgba(0,255,176,.4)" : "rgba(0,255,176,.1)"}`, borderRadius: 3, color: mode === m ? "#00FFB0" : "#94a3b8", fontSize: 9, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", transition: "all .2s", textTransform: "uppercase" }}>{m}</button>)}
          </div>
          <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".14em", fontFamily: "monospace", marginBottom: 6 }}>CIRCUIT</div>
          {Object.entries(CIRCS).map(([id, cc]) => <button key={id} onClick={() => { setCircuit(id); setProof(null); setVerified(null); }} style={{ padding: "8px 11px", background: circuit === id ? "rgba(0,255,176,.08)" : "rgba(0,0,0,.3)", border: `1px solid ${circuit === id ? "rgba(0,255,176,.3)" : "rgba(0,255,176,.08)"}`, borderRadius: 4, cursor: "pointer", textAlign: "left", transition: "all .2s", marginBottom: 5, display: "block", width: "100%" }}><div style={{ fontSize: 10, color: circuit === id ? "#ffffff" : "#94a3b8", fontFamily: "monospace", fontWeight: 700 }}>{cc.name}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace" }}>{cc.constraints.toLocaleString()} R1CS · ~{cc.time}s</div></button>)}
          <div style={{ marginTop: 8 }}><ArcBtn label={proving ? "Proving..." : "⟶ GENERATE PROOF"} onClick={run} loading={proving} disabled={proving} /></div>
        </div>
        <div style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "11px 13px" }}>
          <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".14em", fontFamily: "monospace", marginBottom: 8 }}>PROVING STATUS</div>
          {proving ? (STEPS.slice(0, phase).map((s, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}><span style={{ fontSize: i === phase - 1 ? 10 : 9, color: i === phase - 1 ? "#00FFB0" : "#4a7c5f" }}>{i === phase - 1 ? <span style={{ animation: "pulse .8s infinite" }}>›</span> : "✓"}</span><span style={{ fontSize: 9, color: i === phase - 1 ? "#ffffff" : "#64748b", fontFamily: "monospace" }}>{s}</span></div>))
            : proof ? (
              <div style={{ animation: "fi .4s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00FFB0", boxShadow: "0 0 6px #00FFB0" }} /><span style={{ fontSize: 11, color: "#00FFB0", fontFamily: "monospace", fontWeight: 700 }}>PROOF READY  ✓</span></div>
                {[["Scheme", proof.scheme], ["Circuit", proof.circuit], ["Constraints", Number(proof.constraints).toLocaleString()], ["Proving Time", proof.provingTime], ["π_A", proof.pi_a[0].slice(0, 18) + "···"], ["π_C", proof.pi_c[0].slice(0, 18) + "···"]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace" }}>{k}</span><span style={{ fontSize: 8, color: "#94a3b8", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "58%", textAlign: "right" }}>{v}</span></div>)}
                <div style={{ marginTop: 8 }}>
                  {verified === null
                    ? <button onClick={verify} disabled={verifying} style={{ width: "100%", padding: "7px 0", background: "transparent", border: "1px solid rgba(0,255,176,.3)", borderRadius: 3, color: "#00FFB0", fontSize: 9, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all .2s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.08)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{verifying ? <><Sp sz={9} /> Verifying...</> : "⟶ VERIFY ON-CHAIN"}</button>
                    : <div style={{ padding: "7px 0", textAlign: "center", background: `rgba(${verified ? "0,255,176" : "248,113,113"},.08)`, border: `1px solid rgba(${verified ? "0,255,176" : "248,113,113"},.3)`, borderRadius: 3, fontSize: 9, color: verified ? "#00FFB0" : "#f87171", fontFamily: "monospace" }}>{verified ? "✓ VALID PROOF" : "✕ INVALID"}</div>}
                </div>
              </div>
            )
            : <div style={{ textAlign: "center", padding: "20px 0" }}><div style={{ fontSize: 30, marginBottom: 8, opacity: .3 }}>🔐</div><div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>Select a circuit and generate proof</div></div>}
        </div>
      </div>
      {history.length > 0 && (
        <div style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 5, padding: "10px 13px" }}>
          <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".16em", fontFamily: "monospace", marginBottom: 7 }}>PROOF HISTORY</div>
          <div style={{ maxHeight: 120, overflow: "auto" }}>
            {history.map((p, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0", borderBottom: "1px solid rgba(0,255,176,.04)" }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: "#00FFB0", flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 9, color: "#ffffff", fontFamily: "monospace" }}>{p.scheme} · {p.circuit}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace" }}>{p.ts} · {p.provingTime}</div></div><div style={{ fontSize: 8, color: "#4ade80", fontFamily: "monospace" }}>{Number(p.constraints).toLocaleString()}</div></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function GovPanel({ wal, pub, account, notify }) {
  const [vp, setVp] = useState(0n); const [voting, setVoting] = useState({}); const [delegating, setDelegating] = useState(false); const [delegate, setDelegate] = useState("");
  useEffect(() => { if (!pub || !account) return; (async () => { const v = await pub.readContract({ functionName: "getVotingPower" }); setVp(v); })(); }, [pub, account]);
  const PROPS = [
    { id: "PIP-04", title: "Increase ShieldVault deposit limit to 500K USDC", status: "active", type: "parameter", for: 6842340, against: 1203110, abstain: 342000, quorum: 5000000, ends: "2d 14h" },
    { id: "PIP-03", title: "Reduce Private Send fee to 0.02 USDC", status: "active", type: "fee", for: 9123400, against: 880200, abstain: 121000, quorum: 5000000, ends: "5d 02h" },
    { id: "PIP-02", title: "Add BNB Chain bridge adapter v2", status: "passed", type: "upgrade", for: 11240000, against: 320000, abstain: 88000, quorum: 5000000, ends: "Ended" },
    { id: "PIP-01", title: "Launch PrivARC token incentive program", status: "defeated", type: "tokenomics", for: 2100000, against: 8900000, abstain: 440000, quorum: 5000000, ends: "Ended" },
  ];
  const vote = async (id, side) => { if (!wal) return; setVoting(p => ({ ...p, [id]: side + "_l" })); await sl(R(800, 1400)); notify("Vote Cast", `Voted ${side} on ${id}`, "success", "0x" + hx(64)); setVoting(p => ({ ...p, [id]: side })); };
  const SC = { active: "#00FFB0", passed: "#4ade80", defeated: "#f87171" };
  const TC = { parameter: "#0EA5E9", fee: "#fbbf24", upgrade: "#a78bfa", tokenomics: "#f97316" };
  const Bar = ({ f, a, ab, q }) => { const tot = f + a + ab || 1; return <div style={{ marginBottom: 8 }}><div style={{ height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(0,0,0,.5)", position: "relative", marginBottom: 3 }}><div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(f / tot) * 100}%`, background: "#00FFB0" }} /><div style={{ position: "absolute", left: `${(f / tot) * 100}%`, top: 0, height: "100%", width: `${(a / tot) * 100}%`, background: "#f87171" }} /><div style={{ position: "absolute", left: `${((f + a) / tot) * 100}%`, top: 0, height: "100%", width: `${(ab / tot) * 100}%`, background: "#475569" }} /><div style={{ position: "absolute", left: `${Math.min((q / tot) * 100, 99)}%`, top: -1, height: "calc(100%+2px)", width: 1.5, background: "#fbbf24" }} /></div><div style={{ display: "flex", gap: 8, fontSize: 7, fontFamily: "monospace" }}><span style={{ color: "#00FFB0" }}>FOR {(f / 1e6).toFixed(1)}M</span><span style={{ color: "#f87171" }}>AGAINST {(a / 1e6).toFixed(1)}M</span><span style={{ color: "#fbbf24", marginLeft: "auto" }}>QUORUM {(q / 1e6).toFixed(0)}M</span></div></div>; };
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="🗳" title="GOVERNANCE" sub="On-chain proposals, voting and veARC delegation" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "rgba(0,255,176,.04)", border: "1px solid rgba(0,255,176,.18)", borderRadius: 5, padding: "12px 14px" }}><div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".16em", fontFamily: "monospace", marginBottom: 5 }}>VOTING POWER</div><div style={{ fontSize: 22, fontWeight: 700, color: "#00FFB0", fontFamily: "monospace" }}>{f6(vp)}</div><div style={{ fontSize: 9, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>veARC tokens</div></div>
        <div style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "12px 14px" }}><div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".16em", fontFamily: "monospace", marginBottom: 7 }}>DELEGATE VOTES</div><OsField label="" value={delegate} onChange={e => setDelegate(e.target.value)} placeholder="0x... or name.arc" icon="👤" /><ArcBtn label={delegating ? "Delegating..." : "DELEGATE"} onClick={async () => { if (!delegate || !wal) return; setDelegating(true); await sl(1200); setDelegating(false); notify("Delegated", `Votes → ${sh(delegate)}`, "success", "0x" + hx(64)); }} loading={delegating} disabled={!delegate} small /></div>
      </div>
      {PROPS.map(p => (
        <div key={p.id} style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(0,255,176,.09)", borderRadius: 5, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace", fontWeight: 700 }}>{p.id}</span>
                <span style={{ fontSize: 7, background: `${SC[p.status]}18`, border: `1px solid ${SC[p.status]}40`, borderRadius: 2, padding: "1px 6px", color: SC[p.status], fontFamily: "monospace" }}>{p.status}</span>
                <span style={{ fontSize: 7, background: `${TC[p.type]}18`, border: `1px solid ${TC[p.type]}40`, borderRadius: 2, padding: "1px 6px", color: TC[p.type], fontFamily: "monospace" }}>{p.type}</span>
              </div>
              <div style={{ fontSize: 11, color: "#ffffff", fontFamily: "monospace", fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div>
              <div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>ends {p.ends}</div>
            </div>
          </div>
          <Bar f={p.for} a={p.against} ab={p.abstain} q={p.quorum} />
          {p.status === "active" && (!voting[p.id]
            ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>{[["FOR", "#00FFB0"], ["AGAINST", "#f87171"], ["ABSTAIN", "#475569"]].map(([side, c]) => <button key={side} onClick={() => vote(p.id, side.toLowerCase())} style={{ padding: "6px 0", background: "transparent", border: `1px solid ${c}40`, borderRadius: 3, color: c, fontSize: 8, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", transition: "all .2s" }} onMouseEnter={e => e.currentTarget.style.background = `${c}12`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{voting[p.id] === side.toLowerCase() + "_l" ? <Sp sz={8} c={c} /> : side}</button>)}</div>
            : <div style={{ padding: "6px 0", textAlign: "center", background: "rgba(0,255,176,.06)", border: "1px solid rgba(0,255,176,.2)", borderRadius: 3, fontSize: 9, color: "#00FFB0", fontFamily: "monospace" }}>✓ VOTED {voting[p.id]?.toUpperCase()}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function StakingPanel({ wal, pub, account, notify }) {
  const [staked, setStaked] = useState(0n); const [rewards, setRewards] = useState(0n); const [apy, setApy] = useState(0n); const [loading, setLoading] = useState(true); const [stakeAmt, setStakeAmt] = useState(""); const [unstakeAmt, setUnstakeAmt] = useState(""); const [staking, setStaking] = useState(false); const [unstaking, setUnstaking] = useState(false); const [claiming, setClaiming] = useState(false); const [lock, setLock] = useState("30");
  useEffect(() => { if (!pub || !account) return; (async () => { const [s, r, a] = await Promise.all([pub.readContract({ functionName: "getStaked" }), pub.readContract({ functionName: "getPendingRewards" }), pub.readContract({ functionName: "getStakingAPY" })]); setStaked(s); setRewards(r); setApy(a); setLoading(false); })(); }, [pub, account]);
  const LOCKS = [{ d: "7", mult: "1.0×", apy: "8.40%" }, { d: "30", mult: "1.5×", apy: "12.80%" }, { d: "90", mult: "2.0×", apy: "18.40%" }, { d: "180", mult: "3.0×", apy: "24.20%" }]; const lk = LOCKS.find(l => l.d === lock);
  const stake = async () => { if (!stakeAmt || !wal) return; setStaking(true); notify("Staking", `Locking ${stakeAmt} USDC (${lock}d)...`, "pending"); try { const h = await wal.writeContract({}); await pub.waitForTransactionReceipt(h); notify("Staked ✓", `${stakeAmt} USDC staked`, "success", h); setStakeAmt(""); } catch (e) { notify("Stake Failed", e.message, "error"); } setStaking(false); };
  const claim = async () => { if (!wal || rewards === 0n) return; setClaiming(true); notify("Claiming", "Claiming rewards...", "pending"); try { const h = await wal.writeContract({}); await pub.waitForTransactionReceipt(h); notify("Claimed ✓", `${f6(rewards)} USDC claimed`, "success", h); setRewards(0n); } catch (e) { notify("Claim Failed", e.message, "error"); } setClaiming(false); };
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="💎" title="STAKING" sub="Stake USDC · earn yield · boost voting power" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginBottom: 14 }}>
        {[{ l: "STAKED", v: loading ? "···" : f6(staked), u: "USDC", c: "#00FFB0" }, { l: "REWARDS", v: loading ? "···" : f6(rewards), u: "USDC", c: "#fbbf24" }, { l: "STAKING APY", v: loading ? "···" : (Number(apy) / 100).toFixed(2) + "%", u: lk?.mult + " mult", c: "#a78bfa" }].map(s => <div key={s.l} style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "10px 12px" }}><div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".16em", fontFamily: "monospace", marginBottom: 4 }}>{s.l}</div><div style={{ fontSize: 16, fontWeight: 700, color: s.c, fontFamily: "monospace" }}>{s.v}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginTop: 1 }}>{s.u}</div></div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(0,255,176,.1)", borderRadius: 5, padding: "12px" }}>
          <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".14em", fontFamily: "monospace", marginBottom: 8 }}>STAKE USDC</div>
          <OsField label="AMOUNT" value={stakeAmt} onChange={e => setStakeAmt(e.target.value)} placeholder="0.00" icon="💎" suffix="USDC" />
          <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".12em", fontFamily: "monospace", marginBottom: 6 }}>LOCK PERIOD</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
            {LOCKS.map(l => <button key={l.d} onClick={() => setLock(l.d)} style={{ padding: "6px 4px", background: lock === l.d ? "rgba(0,255,176,.1)" : "rgba(0,0,0,.3)", border: `1px solid ${lock === l.d ? "rgba(0,255,176,.4)" : "rgba(0,255,176,.1)"}`, borderRadius: 3, cursor: "pointer", textAlign: "center", transition: "all .2s" }}><div style={{ fontSize: 9, color: lock === l.d ? "#ffffff" : "#94a3b8", fontFamily: "monospace", fontWeight: 700 }}>{l.d}d</div><div style={{ fontSize: 7, color: lock === l.d ? "#4ade80" : "#64748b", fontFamily: "monospace" }}>{l.apy}</div></button>)}
          </div>
          <ArcBtn label={staking ? "Staking..." : "⟶ STAKE"} onClick={stake} loading={staking} disabled={!stakeAmt || Number(stakeAmt) <= 0} small />
        </div>
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 5, padding: "11px" }}>
            <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".14em", fontFamily: "monospace", marginBottom: 7 }}>UNSTAKE</div>
            <OsField label="AMOUNT" value={unstakeAmt} onChange={e => setUnstakeAmt(e.target.value)} placeholder="0.00" icon="↙" suffix="USDC" />
            <ArcBtn label={unstaking ? "Unstaking..." : "⟶ UNSTAKE"} onClick={async () => { if (!unstakeAmt || !wal || staked === 0n) return; setUnstaking(true); await sl(1200); setUnstaking(false); setUnstakeAmt(""); notify("Unstaked ✓", `${unstakeAmt} USDC unstaked`, "success", "0x" + hx(64)); }} loading={unstaking} disabled={!unstakeAmt || staked === 0n} color="#4ade80" small />
          </div>
          <div style={{ background: "rgba(0,0,0,.3)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 5, padding: "11px" }}>
            <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".14em", fontFamily: "monospace", marginBottom: 4 }}>PENDING REWARDS</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", marginBottom: 3 }}>{f6(rewards)}</div>
            <div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginBottom: 8 }}>USDC available</div>
            <ArcBtn label={claiming ? "Claiming..." : "⟶ CLAIM"} onClick={claim} loading={claiming} disabled={rewards === 0n} color="#fbbf24" small />
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioPanel({ balances, prices, account, txHistory }) {
  const P = [
    { token: "USDC",   balance: f6(balances.usdc),    price: prices.USDC || 1,    icon: "💵", c: "#4ade80" },
    { token: "USDC ⚡", balance: f6(balances.shielded), price: prices.USDC || 1,    icon: "🛡", c: "#00FFB0" },
    { token: "ARC",    balance: fE(balances.arc),      price: prices.ARC || 0.18,  icon: "⬡", c: "#94a3b8" },
    { token: "WETH",   balance: R(0, 0.5).toFixed(4),  price: prices.WETH || 2597, icon: "Ξ", c: "#818cf8" },
    { token: "ARCt",   balance: R(0, 1000).toFixed(2), price: prices.ARCt || 0.23, icon: "◈", c: "#fbbf24" },
  ];
  const total = P.reduce((s, p) => s + Number(p.balance.replace(/,/g, "")) * p.price, 0);
  const alloc = P.map(p => ({ ...p, pct: ((Number(p.balance.replace(/,/g, "")) * p.price / total) * 100 || 0) }));
  let off = 0; const segs = alloc.map(p => { const s = { pct: p.pct, off, col: p.c }; off += p.pct; return s; });

  const exportReport = () => {
    const lines = ["PRIVARC OS — PORTFOLIO REPORT", "=".repeat(36), `Generated: ${new Date().toLocaleString()}`, `Operator:  ${account?.address || "—"}`, `Network:   ARC Network (chainId: 7070)`, "", "BALANCES", "-".repeat(24), `Shielded USDC:  $${f6(balances.shielded)}`, `Wallet USDC:    $${f6(balances.usdc)}`, `ARC Gas:        ${fE(balances.arc)} ARC`, "", "LIVE PRICES", "-".repeat(24), ...Object.entries(prices).map(([k, v]) => `${k.padEnd(10)}: $${v < 10 ? v.toFixed(4) : v < 1000 ? v.toFixed(2) : v.toFixed(0)}`), "", "RECENT TRANSACTIONS", "-".repeat(24), ...(txHistory.length ? txHistory.slice(0, 10).map(t => `${t.ts}  ${t.label.padEnd(22)}  ${t.hash.slice(0, 18)}···`) : ["No transactions yet."]), "", "CONTRACTS", "-".repeat(24), ...Object.entries(CONTRACTS).map(([k, v]) => `${k.padEnd(16)}: ${v}`), "", "PrivARC OS v2.4.1 — privarc.io"];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `privarc_portfolio_${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="📊" title="PORTFOLIO" sub="Asset allocation, live prices and downloadable report" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ background: "rgba(0,255,176,.04)", border: "1px solid rgba(0,255,176,.15)", borderRadius: 5, padding: "12px 14px", marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: "#64748b", letterSpacing: ".2em", fontFamily: "monospace", marginBottom: 5 }}>TOTAL PORTFOLIO VALUE</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", fontFamily: "monospace" }}>${total.toFixed(2)}</div>
            <button onClick={exportReport} style={{ marginTop: 8, padding: "5px 10px", background: "rgba(0,255,176,.06)", border: "1px solid rgba(0,255,176,.2)", borderRadius: 3, color: "#00FFB0", fontSize: 8, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".1em", transition: "all .2s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,176,.14)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(0,255,176,.06)"}>⬇ EXPORT REPORT</button>
          </div>
          {alloc.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 4, marginBottom: 5 }}>
              <span style={{ fontSize: 14 }}>{p.icon}</span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#ffffff", fontFamily: "monospace", fontWeight: 700 }}>{p.token}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace" }}>@ ${p.price < 10 ? p.price.toFixed(4) : p.price < 1000 ? p.price.toFixed(2) : p.price.toFixed(0)}</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: p.c, fontFamily: "monospace", fontWeight: 600 }}>{p.balance}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace" }}>{p.pct.toFixed(1)}%</div></div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(0,0,0,.35)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 5, padding: "12px" }}>
          <div style={{ fontSize: 7, color: "#64748b", letterSpacing: ".16em", fontFamily: "monospace", marginBottom: 8 }}>ALLOCATION</div>
          <svg width="100%" viewBox="0 0 100 100">
            {segs.map((s, i) => { const r = 38, cx = 50, cy = 50; const st = (s.off / 100) * Math.PI * 2 - Math.PI / 2; const en = ((s.off + s.pct) / 100) * Math.PI * 2 - Math.PI / 2; const x1 = cx + r * Math.cos(st), y1 = cy + r * Math.sin(st), x2 = cx + r * Math.cos(en), y2 = cy + r * Math.sin(en); const lg = s.pct > 50 ? 1 : 0; return s.pct > 0 ? <path key={i} d={`M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${lg} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`} fill={s.col} opacity=".85" /> : null; })}
            <circle cx="50" cy="50" r="23" fill="rgba(0,8,5,.9)" />
            <text x="50" y="47" textAnchor="middle" fill="#00FFB0" fontSize="8" fontFamily="monospace">${total.toFixed(0)}</text>
            <text x="50" y="57" textAnchor="middle" fill="#64748b" fontSize="6" fontFamily="monospace">USD</text>
          </svg>
          <div style={{ marginTop: 7 }}>{alloc.map((p, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}><div style={{ width: 7, height: 7, borderRadius: 1.5, background: p.c, flexShrink: 0 }} /><span style={{ fontSize: 8, color: "#94a3b8", fontFamily: "monospace" }}>{p.token} {p.pct.toFixed(0)}%</span></div>)}</div>
        </div>
      </div>
    </div>
  );
}

function AgentsPanel({ agentLogs }) {
  const AG = [
    { id: "SA", name: "ShieldAgent",  role: "Vault monitoring & deposits",   load: Ri(8, 20),  s: "ACTIVE",  c: "#00FFB0" },
    { id: "SW", name: "SwapAgent",    role: "DEX routing & optimization",     load: Ri(4, 15),  s: "ACTIVE",  c: "#4ade80" },
    { id: "PV", name: "PrivacyAgent", role: "Stealth scanning",               load: Ri(25, 45), s: "ACTIVE",  c: "#00FFB0" },
    { id: "RK", name: "RiskAgent",    role: "Anomaly & volatility scoring",   load: Ri(2, 8),   s: "ACTIVE",  c: "#4ade80" },
    { id: "ZK", name: "ZKAgent",      role: "Proof generation (Groth16)",     load: Ri(55, 75), s: "ACTIVE",  c: "#fbbf24" },
    { id: "BR", name: "BridgeAgent",  role: "Cross-chain relay",              load: 0,          s: "STANDBY", c: "#64748b" },
    { id: "GO", name: "GovAgent",     role: "Governance monitoring",          load: Ri(1, 4),   s: "ACTIVE",  c: "#4ade80" },
    { id: "FE", name: "FeeAgent",     role: "USDC oracle & fee sweep",        load: Ri(12, 22), s: "ACTIVE",  c: "#4ade80" },
  ];
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="🤖" title="AI AGENT CLUSTER" sub="8 autonomous on-chain agents — always running on ARC Network" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
        {AG.map(a => (
          <div key={a.id} style={{ background: "rgba(0,0,0,.4)", border: `1px solid rgba(0,255,176,${a.s === "ACTIVE" ? .12 : .04})`, borderRadius: 5, padding: "10px 13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: a.s === "ACTIVE" ? 6 : 0 }}>
              <div><div style={{ fontSize: 10, color: a.s === "ACTIVE" ? "#ffffff" : "#64748b", fontFamily: "monospace", fontWeight: 700 }}>{a.name}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginTop: 1 }}>{a.role}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: a.s === "ACTIVE" ? a.c : "#334155", boxShadow: a.s === "ACTIVE" ? `0 0 5px ${a.c}` : "none" }} /><span style={{ fontSize: 8, color: a.s === "ACTIVE" ? a.c : "#334155", fontFamily: "monospace" }}>{a.s}</span></div>
            </div>
            {a.s === "ACTIVE" && <><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginBottom: 3 }}>CPU: {a.load}%</div><div style={{ height: 2, background: "#0a1f14", borderRadius: 1 }}><div style={{ height: "100%", background: a.c, width: `${a.load}%`, boxShadow: a.load > 60 ? `0 0 5px ${a.c}` : "none" }} /></div></>}
          </div>
        ))}
      </div>
      <div style={{ background: "rgba(0,0,0,.5)", border: "1px solid rgba(0,255,176,.08)", borderRadius: 4, padding: "10px 12px", maxHeight: 180, overflow: "auto" }}>
        <div style={{ fontSize: 8, color: "#4a7c5f", letterSpacing: ".2em", fontFamily: "monospace", marginBottom: 7 }}>LIVE AGENT LOG</div>
        {[...agentLogs].reverse().map((l, i) => <div key={i} style={{ fontSize: 9, fontFamily: "monospace", marginBottom: 3, color: l.c, lineHeight: 1.4, animation: i === 0 ? "fi .3s ease" : "none" }}><span style={{ color: "#1e3a2a", marginRight: 8 }}>[{l.t}]</span>{l.m}</div>)}
      </div>
    </div>
  );
}

function HistoryPanel({ txHistory }) {
  const [filter, setFilter] = useState("all");
  const demo = [
    { hash: "0x" + hx(64), label: "Shield ✓",    ts: "12:43", status: "success", amount: "500.00 USDC" },
    { hash: "0x" + hx(64), label: "Swap ✓",      ts: "11:22", status: "success", amount: "0.1928 WETH" },
    { hash: "0x" + hx(64), label: "Stake ✓",     ts: "10:05", status: "success", amount: "1,000.00 USDC" },
    { hash: "0x" + hx(64), label: "Vote — PIP-03", ts: "09:31", status: "success", amount: "—" },
  ];
  const all = [...txHistory.map(t => ({ ...t, amount: "—" })), ...demo];
  const filtered = filter === "all" ? all : all.filter(t => t.label.toLowerCase().includes(filter));
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="📋" title="TRANSACTION HISTORY" sub="On-chain activity log for this session" />
      <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
        {["all", "shield", "swap", "send", "withdraw", "bridge", "stake", "vote"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "4px 9px", background: filter === f ? "rgba(0,255,176,.12)" : "rgba(0,0,0,.35)", border: `1px solid ${filter === f ? "rgba(0,255,176,.35)" : "rgba(0,255,176,.08)"}`, borderRadius: 3, color: filter === f ? "#00FFB0" : "#64748b", fontSize: 8, cursor: "pointer", fontFamily: "monospace", letterSpacing: ".08em", textTransform: "uppercase", transition: "all .2s" }}>{f}</button>
        ))}
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: "22px 0", fontSize: 10, color: "#334155", fontFamily: "monospace" }}>No transactions found</div>
        : filtered.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 4, marginBottom: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FFB0", boxShadow: "0 0 4px #00FFB0", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#ffffff", fontFamily: "monospace", fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginTop: 1 }}>{t.ts} · {t.hash.slice(0, 16)}···</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#4ade80", fontFamily: "monospace", fontWeight: 600 }}>{t.amount}</div>
              <a href={`${ARC.blockExplorers.default.url}/tx/${t.hash}`} target="_blank" rel="noreferrer" style={{ fontSize: 8, color: "#64748b", textDecoration: "none", fontFamily: "monospace", transition: "color .2s" }} onMouseEnter={e => e.target.style.color = "#00FFB0"} onMouseLeave={e => e.target.style.color = "#64748b"}>ARCScan ↗</a>
            </div>
          </div>
        ))}
    </div>
  );
}

function SettingsPanel({ testnet, toggleTestnet, account }) {
  const [slip, setSlip] = useState("0.5"); const [dl, setDl] = useState("20"); const [expert, setExpert] = useState(false); const [sound, setSound] = useState(false);
  const Tog = ({ on, onClick }) => <div onClick={onClick} style={{ width: 32, height: 17, background: on ? "rgba(0,255,176,.2)" : "rgba(0,0,0,.5)", border: `1px solid ${on ? "rgba(0,255,176,.55)" : "rgba(0,255,176,.15)"}`, borderRadius: 9, cursor: "pointer", position: "relative", transition: "all .2s", flexShrink: 0 }}><div style={{ position: "absolute", top: 2.5, left: on ? 15 : 2.5, width: 10, height: 10, borderRadius: "50%", background: on ? "#00FFB0" : "#475569", boxShadow: on ? "0 0 5px #00FFB0" : "none", transition: "all .2s" }} /></div>;
  const Sec = ({ t, c }) => <div style={{ marginBottom: 12 }}><div style={{ fontSize: 8, color: "#4a7c5f", letterSpacing: ".18em", fontFamily: "monospace", marginBottom: 6, paddingBottom: 5, borderBottom: "1px solid rgba(0,255,176,.06)" }}>{t}</div>{c}</div>;
  const Row = ({ label, sub, c }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "rgba(0,0,0,.3)", borderRadius: 3, marginBottom: 4, border: "1px solid rgba(255,255,255,.04)" }}><div><div style={{ fontSize: 10, color: "#ffffff", fontFamily: "monospace" }}>{label}</div><div style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace", marginTop: 1 }}>{sub}</div></div>{c}</div>;
  return (
    <div style={{ animation: "fi .3s ease" }}><PH icon="⚙" title="SETTINGS" sub="Network configuration, transaction preferences and interface" />
      <Sec t="NETWORK" c={<>
        <Row label="Network Mode" sub={testnet ? "ARC Testnet (7071)" : "ARC Mainnet (7070)"} c={<Tog on={testnet} onClick={toggleTestnet} />} />
        <Row label="RPC Endpoint" sub={ARC.rpcUrls.default.http[0]} c={<span style={{ fontSize: 8, color: "#4ade80", fontFamily: "monospace" }}>CONNECTED</span>} />
        <Row label="Block Explorer" sub="ARCScan" c={<a href={ARC.blockExplorers.default.url} target="_blank" rel="noreferrer" style={{ fontSize: 8, color: "#00FFB0", fontFamily: "monospace", textDecoration: "none" }}>OPEN ↗</a>} />
      </>} />
      <Sec t="TRANSACTION" c={<>
        <Row label="Max Slippage" sub="Price movement tolerance" c={<div style={{ display: "flex", gap: 4 }}>{["0.1", "0.5", "1.0"].map(v => <button key={v} onClick={() => setSlip(v)} style={{ padding: "3px 7px", background: slip === v ? "rgba(0,255,176,.14)" : "rgba(0,0,0,.35)", border: `1px solid ${slip === v ? "rgba(0,255,176,.4)" : "rgba(0,255,176,.1)"}`, borderRadius: 2, color: slip === v ? "#00FFB0" : "#64748b", fontSize: 8, cursor: "pointer", fontFamily: "monospace" }}>{v}%</button>)}</div>} />
        <Row label="TX Deadline" sub="Minutes until expiry" c={<div style={{ display: "flex", gap: 4 }}>{["10", "20", "30"].map(v => <button key={v} onClick={() => setDl(v)} style={{ padding: "3px 7px", background: dl === v ? "rgba(0,255,176,.14)" : "rgba(0,0,0,.35)", border: `1px solid ${dl === v ? "rgba(0,255,176,.4)" : "rgba(0,255,176,.1)"}`, borderRadius: 2, color: dl === v ? "#00FFB0" : "#64748b", fontSize: 8, cursor: "pointer", fontFamily: "monospace" }}>{v}m</button>)}</div>} />
        <Row label="Expert Mode" sub="Remove confirmation dialogs" c={<Tog on={expert} onClick={() => setExpert(!expert)} />} />
      </>} />
      <Sec t="INTERFACE" c={<Row label="Sound FX" sub="ZK proof and TX audio cues" c={<Tog on={sound} onClick={() => setSound(!sound)} />} />} />
      <Sec t="CONNECTED WALLET" c={<>
        <Row label="Address" sub={account?.address || "—"} c={<span style={{ fontSize: 8, color: "#4ade80", fontFamily: "monospace" }}>ACTIVE</span>} />
        <Row label="Provider" sub={account?.walletName || "—"} c={<span style={{ fontSize: 8, color: "#94a3b8", fontFamily: "monospace" }}>{account?.walletName || "—"}</span>} />
      </>} />
      <Sec t="CONTRACT ADDRESSES" c={Object.entries(CONTRACTS).map(([k, v]) => <Row key={k} label={k} sub={sh(v)} c={<span style={{ fontSize: 8, color: "#334155", fontFamily: "monospace" }}>{v.slice(-6)}</span>} />)} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════════════════ */
function Dashboard({ user, prices, changes }) {
  const { account, pub, wal, disconnect, testnet, toggleTestnet } = useW3();
  const { push } = useNotif();
  const { notifs } = useNotif();
  const [panel, setPanel]       = useState("overview");
  const [balances, setBalances] = useState({ arc: 0n, usdc: 0n, shielded: 0n });
  const [tx, setTx]             = useState(null);
  const [txHistory, setTxHistory] = useState([]);
  const [blockNum, setBlockNum] = useState(8420141);
  const [showNotif, setShowNotif] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [agentLogs, setAgentLogs] = useState([
    { t: "00:00:01", m: "ShieldAgent :: Monitoring deposit pool — depth 4.23M USDC", c: "#00FFB0" },
    { t: "00:00:03", m: "SwapAgent :: DEX route scan — 12 paths indexed",             c: "#4ade80" },
    { t: "00:00:07", m: "ZKAgent :: Proof batch ready — 0 pending",                  c: "#4ade80" },
    { t: "00:00:12", m: "RiskAgent :: Volatility index: LOW (0.02)",                  c: "#4ade80" },
  ]);
  const unread = notifs.filter(n => !n.read).length;

  useEffect(() => {
    if (!pub || !account?.address) return;
    (async () => {
      const [arc, usdc, shielded] = await Promise.all([pub.getBalance(account.address), pub.readContract({ functionName: "balanceOf" }), pub.readContract({ functionName: "getShieldedBalance" })]);
      setBalances({ arc, usdc, shielded });
    })();
  }, [pub, account]);

  useEffect(() => { const id = setInterval(() => setBlockNum(n => n + 1), 6000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const MSGS = [["ZKAgent :: Proof generated in 1.82s", "#00FFB0"], ["ShieldAgent :: Pool depth nominal", "#4ade80"], ["FeeAgent :: Oracle $1.0001 USDC", "#4ade80"], ["PrivacyAgent :: Scan — 0 new notes", "#4ade80"], ["RiskAgent :: Score 0.02 — LOW", "#4ade80"], ["SwapAgent :: Route refreshed", "#4ade80"], ["BridgeAgent :: Bridge idle", "#64748b"], ["GovAgent :: No pending proposals", "#64748b"], ["ZKAgent :: Nullifier check passed", "#4ade80"]];
    const id = setInterval(() => {
      if (Math.random() > .45) {
        const [m, c] = MSGS[Ri(0, MSGS.length)];
        setAgentLogs(p => [...p.slice(-8), { t: tc(), m, c }]);
        if (Math.random() > .75) push(m, "info");
      }
    }, 2500);
    return () => clearInterval(id);
  }, [push]);

  // Keyboard shortcut: Cmd+K → search
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); }
      if (e.key === "Escape") { setShowSearch(false); setShowNotif(false); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const notify = (label, message, status, hash) => {
    setTx({ label, message, status, hash });
    if (status === "success" && hash) setTxHistory(p => [{ hash, label, ts: tc(), status: "success" }, ...p.slice(0, 19)]);
    push(`${label}: ${message}`, status === "success" ? "success" : status === "pending" ? "info" : "error", hash ? `${ARC.blockExplorers.default.url}/tx/${hash}` : null);
  };

  const refreshBal = async () => {
    if (!pub || !account) return;
    const [arc, usdc, shielded] = await Promise.all([pub.getBalance(account.address), pub.readContract({ functionName: "balanceOf" }), pub.readContract({ functionName: "getShieldedBalance" })]);
    setBalances({ arc, usdc, shielded });
  };

  const handleDisconnect = () => { disconnect(); };

  const NAV = [
    { id: "overview",   icon: "◈",  label: "Overview" },
    { id: "shield",     icon: "🛡", label: "Shield" },
    { id: "swap",       icon: "⇄",  label: "Swap" },
    { id: "send",       icon: "↗",  label: "Send" },
    { id: "withdraw",   icon: "↙",  label: "Withdraw" },
    { id: "bridge",     icon: "⟺", label: "Bridge" },
    null,
    { id: "analytics",  icon: "📈", label: "Analytics" },
    { id: "zk",         icon: "🔐", label: "ZK Console" },
    { id: "governance", icon: "🗳", label: "Governance" },
    { id: "staking",    icon: "💎", label: "Staking" },
    null,
    { id: "portfolio",  icon: "📊", label: "Portfolio" },
    { id: "agents",     icon: "🤖", label: "Agents" },
    { id: "history",    icon: "📋", label: "History" },
    { id: "settings",   icon: "⚙",  label: "Settings" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 2 }}>
      {showSearch && <GlobalSearch onSelect={p => { setPanel(p); setShowSearch(false); }} onClose={() => setShowSearch(false)} />}
      {showDisconnect && <DisconnectModal walletName={account?.walletName} address={account?.address} onConfirm={handleDisconnect} onCancel={() => setShowDisconnect(false)} />}

      {/* ── Sidebar ── */}
      <div style={{ width: 52, flexShrink: 0, background: "rgba(0,5,3,.96)", borderRight: "1px solid rgba(0,255,176,.08)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, paddingBottom: 12, gap: 1 }}>
        {/* Logo */}
        <div style={{ width: 30, height: 30, border: "1.5px solid #00FFB0", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#00FFB0", boxShadow: "0 0 10px rgba(0,255,176,.2)", marginBottom: 9 }}>◈</div>
        <div style={{ width: 26, height: 1, background: "rgba(0,255,176,.1)", marginBottom: 5 }} />

        {NAV.map((n, i) => n === null
          ? <div key={i} style={{ width: 24, height: 1, background: "rgba(0,255,176,.06)", margin: "3px 0" }} />
          : (
            <button key={n.id} onClick={() => setPanel(n.id)} title={n.label}
              style={{ width: 36, height: 33, background: panel === n.id ? "rgba(0,255,176,.12)" : "transparent", border: `1px solid ${panel === n.id ? "rgba(0,255,176,.3)" : "transparent"}`, borderRadius: 4, cursor: "pointer", color: panel === n.id ? "#00FFB0" : "#4a7c5f", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", flexShrink: 0 }}
              onMouseEnter={e => { if (panel !== n.id) { e.currentTarget.style.background = "rgba(0,255,176,.06)"; e.currentTarget.style.color = "#94a3b8"; } }}
              onMouseLeave={e => { if (panel !== n.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#4a7c5f"; } }}>
              {n.icon}
            </button>
          )
        )}

        <div style={{ flex: 1 }} />
        {/* Network indicator */}
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00FFB0", boxShadow: "0 0 6px #00FFB0", animation: "pulse 2s infinite", marginBottom: 3 }} />
        <div style={{ fontSize: 7, color: "#4a7c5f", fontFamily: "monospace", letterSpacing: ".04em" }}>{testnet ? "TEST" : "MAIN"}</div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Price ticker */}
        <PriceTicker prices={prices} changes={changes} />

        {/* Top bar */}
        <div style={{ height: 40, flexShrink: 0, background: "rgba(0,5,3,.96)", borderBottom: "1px solid rgba(0,255,176,.08)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Glitch text="privARC" style={{ fontSize: 14, fontWeight: 800, color: "#00FFB0", fontFamily: "'Syne', sans-serif" }} />
            <span style={{ fontSize: 7, color: "#4a7c5f", fontFamily: "monospace", letterSpacing: ".1em" }}>OS v2.4.1</span>
            <span style={{ fontSize: 7, background: "rgba(0,255,176,.08)", border: "1px solid rgba(0,255,176,.18)", borderRadius: 2, padding: "1px 5px", color: "#00FFB0", fontFamily: "monospace" }}>{testnet ? "TESTNET" : "MAINNET"}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {/* Search */}
            <button onClick={() => setShowSearch(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.4)", border: "1px solid rgba(0,255,176,.12)", borderRadius: 3, padding: "3px 10px", cursor: "pointer", color: "#64748b", fontSize: 9, fontFamily: "monospace", transition: "all .2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.35)"; e.currentTarget.style.color = "#ffffff"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,.12)"; e.currentTarget.style.color = "#64748b"; }}>
              <span>⌕</span><span style={{ fontSize: 8 }}>Search</span>
              <span style={{ fontSize: 7, background: "rgba(0,255,176,.08)", border: "1px solid rgba(0,255,176,.18)", borderRadius: 2, padding: "0 4px", marginLeft: 3, color: "#4a7c5f" }}>⌘K</span>
            </button>

            <span style={{ fontSize: 8, color: "#4a7c5f", fontFamily: "monospace" }}>#{blockNum.toLocaleString()}</span>
            <div style={{ height: 12, width: 1, background: "rgba(0,255,176,.1)" }} />

            {/* Notifications */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowNotif(!showNotif)} style={{ background: "none", border: "none", cursor: "pointer", color: unread > 0 ? "#00FFB0" : "#4a7c5f", fontSize: 14, position: "relative", transition: "color .2s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#00FFB0"}
                onMouseLeave={e => e.currentTarget.style.color = unread > 0 ? "#00FFB0" : "#4a7c5f"}>
                🔔
                {unread > 0 && <span style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, background: "#f87171", borderRadius: "50%", fontSize: 8, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontWeight: 700 }}>{Math.min(unread, 9)}</span>}
              </button>
              {showNotif && <NotifCenter onClose={() => setShowNotif(false)} />}
            </div>

            <div style={{ height: 12, width: 1, background: "rgba(0,255,176,.1)" }} />

            {/* Wallet info */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 8, color: "#94a3b8", fontFamily: "monospace" }}>{account?.walletName}</span>
              <span style={{ fontSize: 8, color: "#64748b", fontFamily: "monospace" }}>{sh(account?.address)}</span>
            </div>

            {/* Disconnect button */}
            <button onClick={() => setShowDisconnect(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 3, padding: "3px 9px", cursor: "pointer", color: "#64748b", fontSize: 8, fontFamily: "monospace", letterSpacing: ".08em", transition: "all .2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,.14)"; e.currentTarget.style.borderColor = "rgba(239,68,68,.45)"; e.currentTarget.style.color = "#f87171"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,.06)"; e.currentTarget.style.borderColor = "rgba(239,68,68,.2)"; e.currentTarget.style.color = "#64748b"; }}>
              ⏻ DISCONNECT
            </button>
          </div>
        </div>

        {/* Panel content */}
        <div style={{ flex: 1, padding: "14px", overflow: "auto" }}>
          {panel === "overview"   && <OverviewPanel  balances={balances} pub={pub} agentLogs={agentLogs} setPanel={setPanel} prices={prices} changes={changes} />}
          {panel === "shield"     && <ShieldPanel    wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal} />}
          {panel === "swap"       && <SwapPanel      wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal} />}
          {panel === "send"       && <SendPanel      wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal} />}
          {panel === "withdraw"   && <WithdrawPanel  wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal} />}
          {panel === "bridge"     && <BridgePanel    wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal} />}
          {panel === "analytics"  && <AnalyticsPanel pub={pub} />}
          {panel === "zk"         && <ZKPanel        wal={wal} pub={pub} account={account} notify={notify} />}
          {panel === "governance" && <GovPanel       wal={wal} pub={pub} account={account} notify={notify} />}
          {panel === "staking"    && <StakingPanel   wal={wal} pub={pub} account={account} notify={notify} />}
          {panel === "portfolio"  && <PortfolioPanel balances={balances} prices={prices} account={account} txHistory={txHistory} />}
          {panel === "agents"     && <AgentsPanel    agentLogs={agentLogs} />}
          {panel === "history"    && <HistoryPanel   txHistory={txHistory} />}
          {panel === "settings"   && <SettingsPanel  testnet={testnet} toggleTestnet={toggleTestnet} account={account} />}
        </div>
      </div>

      <TxToast tx={tx} onClose={() => setTx(null)} />
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
  const { prices, changes }       = usePriceFeed();
  const { account }               = useW3();

  // Auto-logout when wallet disconnects
  useEffect(() => { if (user && !account) setUser(null); }, [account]);

  const handleAuth = (u) => { setUser(u); setTimeout(() => setShowTour(true), 500); };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000A06; overflow: hidden; }
        input, select, button, textarea { font-family: 'JetBrains Mono', monospace; }
        input::placeholder, textarea::placeholder { color: #1e3a2a !important; }
        select option { background: #000A06; color: #ffffff; }
        @keyframes fi  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fu  { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.9)} }
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes g1 { 0%,89%,100%{opacity:0} 90%{opacity:.8;transform:translateX(-3px)} 95%{opacity:0;transform:translateX(3px)} }
        @keyframes g2 { 0%,93%,100%{opacity:0} 94%{opacity:.6;transform:translateX(3px)} 98%{opacity:0;transform:translateX(-2px)} }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: #000A06; }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,176,.2); border-radius: 2px; }
      `}</style>

      <HexGrid />
      {!booted && <Boot onDone={() => setBooted(true)} />}
      <ChainBanner />
      {showTour && <OnboardingTour onFinish={() => setShowTour(false)} />}

      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: user ? "0" : "24px 16px", position: "relative", zIndex: 1, opacity: booted ? 1 : 0, transition: "opacity .6s ease .2s", overflow: "hidden" }}>
        {!user
          ? <AuthScreen onAuth={handleAuth} />
          : <Dashboard user={user} prices={prices} changes={changes} />
        }
      </div>
    </>
  );
}

export default function PrivARCOS() {
  return (
    <Web3Provider>
      <NotifProvider>
        <AppCore />
      </NotifProvider>
    </Web3Provider>
  );
}
