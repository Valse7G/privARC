import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   ARC NETWORK CONFIG  (Viem-style chain object)
═══════════════════════════════════════════════════════════════════════════ */
const ARC_TESTNET = {
  id: 7070,
  name: "ARC Network Testnet",
  shortName: "ARC",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arcnetwork.io/testnet"] } },
  blockExplorers: { default: { name: "ARCScan", url: "https://scan.arcnetwork.io" } },
  hex: "0x1BA2",  // 7074 hex
  testnet: true,
};
const ARC_MAINNET = {
  id: 7070,
  name: "ARC Network",
  shortName: "ARC",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arcnetwork.io"] } },
  blockExplorers: { default: { name: "ARCScan", url: "https://scan.arcnetwork.io" } },
  hex: "0x1BA2",
  testnet: false,
};

/* PrivARC Contract Addresses (simulated) */
const CONTRACTS = {
  ShieldVault:    "0x7f3A4e9C2b8D1F0a3E5c7b9D2e4F6A8c0B2d4E6f",
  NoteRegistry:  "0x3A5c7E9b1D3f5A7c9E1b3D5f7A9c1E3b5D7f9A1c",
  VerifierZK:    "0x9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D1f3A5c7E",
  FeeCollector:  "0x1b3D5f7A9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D",
  USDC:          "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

/* ═══════════════════════════════════════════════════════════════════════════
   WAGMI / VIEM SIMULATION LAYER
   (Real wagmi/viem can't load in sandbox — this mirrors the exact API surface)
═══════════════════════════════════════════════════════════════════════════ */
const hex = (len) => Array.from({length:len},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Simulate viem publicClient
const createPublicClient = (chain) => ({
  chain,
  getBalance: async (address) => {
    await sleep(600);
    return BigInt(Math.floor(Math.random() * 5e18));
  },
  readContract: async ({ address, abi, functionName, args }) => {
    await sleep(400);
    if (functionName === "balanceOf") return BigInt(Math.floor(Math.random() * 50000e6));
    if (functionName === "getShieldedBalance") return BigInt(Math.floor(Math.random() * 12000e6));
    if (functionName === "getTotalShielded") return BigInt(4_230_000e6);
    if (functionName === "getAPY") return 420n; // 4.20%
    return 0n;
  },
  estimateGas: async () => {
    await sleep(200);
    return BigInt(180000 + Math.floor(Math.random() * 40000));
  },
  getGasPrice: async () => {
    await sleep(150);
    return BigInt(1e9 + Math.floor(Math.random() * 5e8));
  },
  waitForTransactionReceipt: async (hash) => {
    await sleep(2000 + Math.random() * 1500);
    return { transactionHash: hash, status: "success", blockNumber: BigInt(8420000 + Math.floor(Math.random()*1000)) };
  },
});

// Simulate viem walletClient
const createWalletClient = (address, chain) => ({
  account: { address },
  chain,
  writeContract: async ({ address: to, abi, functionName, args, value }) => {
    await sleep(800 + Math.random() * 600);
    return "0x" + hex(64); // tx hash
  },
  sendTransaction: async ({ to, value, data }) => {
    await sleep(900 + Math.random() * 700);
    return "0x" + hex(64);
  },
  signMessage: async ({ message }) => {
    await sleep(300);
    return "0x" + hex(130);
  },
  switchChain: async ({ id }) => {
    await sleep(500);
    // Real impl: window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId:chain.hex}] })
    return true;
  },
  addChain: async (chainParams) => {
    await sleep(600);
    return true;
  },
});

// Real EIP-1193 connector
const connectEIP1193 = async (chain) => {
  if (typeof window === "undefined" || !window.ethereum) throw new Error("NO_PROVIDER");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("USER_REJECTED");
  // Try switch chain
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.hex }],
    });
  } catch (e) {
    if (e.code === 4902) {
      // Chain not added — add it
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chain.hex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: [chain.blockExplorers.default.url],
        }],
      });
    }
  }
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  return { address: accounts[0], chainId };
};

/* ═══════════════════════════════════════════════════════════════════════════
   WEB3 CONTEXT  (mirrors useAccount / usePublicClient / useWalletClient)
═══════════════════════════════════════════════════════════════════════════ */
const Web3Ctx = createContext(null);
function Web3Provider({ children }) {
  const [account, setAccount]     = useState(null);   // { address, chainId, walletName }
  const [pubClient, setPubClient] = useState(null);
  const [walClient, setWalClient] = useState(null);
  const [chainOk, setChainOk]     = useState(false);
  const [switchingChain, setSwitchingChain] = useState(false);

  const connect = useCallback(async (address, walletName, useReal = false) => {
    let addr = address;
    let cid  = ARC_MAINNET.id;

    if (useReal && window.ethereum) {
      try {
        const res = await connectEIP1193(ARC_MAINNET);
        addr = res.address;
        cid  = parseInt(res.chainId, 16);
      } catch { /* fall through to sim */ }
    }

    const pub = createPublicClient(ARC_MAINNET);
    const wal = createWalletClient(addr, ARC_MAINNET);
    setPubClient(pub);
    setWalClient(wal);
    setAccount({ address: addr, chainId: cid, walletName });
    setChainOk(cid === ARC_MAINNET.id);
  }, []);

  const switchToARC = useCallback(async () => {
    if (!walClient || !account) return;
    setSwitchingChain(true);
    try {
      await walClient.switchChain({ id: ARC_MAINNET.id });
      setAccount(a => ({ ...a, chainId: ARC_MAINNET.id }));
      setChainOk(true);
    } finally {
      setSwitchingChain(false);
    }
  }, [walClient, account]);

  const disconnect = useCallback(() => {
    setAccount(null); setPubClient(null); setWalClient(null); setChainOk(false);
  }, []);

  return (
    <Web3Ctx.Provider value={{ account, pubClient, walClient, chainOk, switchingChain, connect, switchToARC, disconnect }}>
      {children}
    </Web3Ctx.Provider>
  );
}
const useWeb3 = () => useContext(Web3Ctx);

/* ═══════════════════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════════════════ */
const WORDLIST = ["abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse","access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act","action","actor","actress","actual","adapt","add","addict","address","adjust","admit","adult","advance","advice","aerobic","afford","afraid","again","agent","agree","ahead"];
function generateLocalWallet() {
  return { privateKey:"0x"+hex(64), address:"0x"+hex(40), mnemonic:Array.from({length:12},()=>WORDLIST[Math.floor(Math.random()*WORDLIST.length)]).join(" "), network:"ARC Network", created:new Date().toISOString() };
}
const fmt6 = (v) => (Number(v) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtE  = (v) => (Number(v) / 1e18).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
function shortAddr(a) { return a ? a.slice(0,8)+"···"+a.slice(-6) : "---"; }

/* ═══════════════════════════════════════════════════════════════════════════
   WALLET PROVIDERS
═══════════════════════════════════════════════════════════════════════════ */
const WALLETS = [
  { id:"metamask",   name:"MetaMask",       popular:true,  color:"#E2761B", glow:"rgba(226,118,27,.3)", installed:()=>!!window.ethereum?.isMetaMask,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><path d="M36.4 3L22.3 13.3l2.6-6.1L36.4 3z" fill="#E17726"/><path d="M3.6 3l14 10.4-2.5-6.2L3.6 3z" fill="#E27625"/><path d="M31.1 27.5l-3.8 5.8 8.1 2.2 2.3-7.9-6.6-.1z" fill="#E27625"/><path d="M2.3 27.6l2.3 7.9 8.1-2.2-3.8-5.8-6.6.1z" fill="#E27625"/><path d="M12.3 18.1l-2.2 3.4 7.9.4-.3-8.5-5.4 4.7z" fill="#E27625"/><path d="M27.7 18.1l-5.5-4.8-.3 8.6 7.9-.4-2.1-3.4z" fill="#E27625"/><path d="M12.7 33.3l4.8-2.3-4.1-3.2-.7 5.5z" fill="#E27625"/><path d="M22.5 31l4.8 2.3-.7-5.5-4.1 3.2z" fill="#E27625"/><path d="M27.3 33.3l-4.8-2.3.4 3.2-.1 1.2 4.5-2.1z" fill="#D5BFB2"/><path d="M12.7 33.3l4.5 2.1-.1-1.2.4-3.2-4.8 2.3z" fill="#D5BFB2"/><path d="M22.1 21.9l.5-8.6-2.3-6.2h-4.6l-2.3 6.2.5 8.6.2 2.6v6.1h3.8l.1-6.1.2-2.6z" fill="#F5841F"/></svg> },
  { id:"rabby",      name:"Rabby",          popular:true,  color:"#7B68EE", glow:"rgba(123,104,238,.3)", installed:()=>!!window.ethereum?.isRabby,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="10" fill="#7B68EE"/><ellipse cx="20" cy="19" rx="12" ry="10" fill="white" opacity=".95"/><circle cx="15" cy="17" r="2.5" fill="#7B68EE"/><circle cx="25" cy="17" r="2.5" fill="#7B68EE"/><circle cx="15.8" cy="16.2" r="1" fill="white"/><circle cx="25.8" cy="16.2" r="1" fill="white"/><path d="M15 22 Q20 26 25 22" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg> },
  { id:"walletconnect", name:"WalletConnect",popular:true, color:"#3B99FC", glow:"rgba(59,153,252,.3)", installed:()=>true,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="10" fill="#3B99FC"/><path d="M11.2 15.8C15.9 11.1 23.5 11.1 28.2 15.8L28.8 16.4C29 16.6 29 16.9 28.8 17.1L27 18.9C26.9 19 26.7 19 26.6 18.9L25.8 18.1C22.6 14.9 17.4 14.9 14.2 18.1L13.4 18.9C13.3 19 13.1 19 13 18.9L11.2 17.1C11 16.9 11 16.6 11.2 15.8Z" fill="white"/><path d="M30.6 18.2L32.2 19.8C32.4 20 32.4 20.3 32.2 20.5L24.5 28.2C24.3 28.4 24 28.4 23.8 28.2L18.5 22.9C18.4 22.8 18.3 22.8 18.2 22.9L12.9 28.2C12.7 28.4 12.4 28.4 12.2 28.2L4.5 20.5C4.3 20.3 4.3 20 4.5 19.8L6.1 18.2C6.3 18 6.6 18 6.8 18.2L12.1 23.5C12.2 23.6 12.3 23.6 12.4 23.5L17.7 18.2C17.9 18 18.2 18 18.4 18.2L23.7 23.5C23.8 23.6 23.9 23.6 24 23.5L29.3 18.2C29.5 18 29.8 18 30 18.2L30.6 18.2Z" fill="white"/></svg> },
  { id:"coinbase",   name:"Coinbase",       popular:true,  color:"#0052FF", glow:"rgba(0,82,255,.3)", installed:()=>!!window.ethereum?.isCoinbaseWallet,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="10" fill="#0052FF"/><circle cx="20" cy="20" r="11" fill="white"/><rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF"/></svg> },
  { id:"trust",      name:"Trust",          popular:false, color:"#3375BB", glow:"rgba(51,117,187,.3)", installed:()=>!!window.ethereum?.isTrust,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="10" fill="#3375BB"/><path d="M20 8 L30 12 L30 21 C30 26.5 25.5 31 20 32 C14.5 31 10 26.5 10 21 L10 12 Z" fill="white" opacity=".9"/><path d="M16 20 L19 23 L24 17" stroke="#3375BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id:"okx",        name:"OKX",            popular:false, color:"#000", glow:"rgba(255,255,255,.12)", installed:()=>!!window.okxwallet,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="10" fill="#000"/><rect x="8" y="8" width="10" height="10" rx="2" fill="white"/><rect x="22" y="8" width="10" height="10" rx="2" fill="white"/><rect x="8" y="22" width="10" height="10" rx="2" fill="white"/><rect x="22" y="22" width="10" height="10" rx="2" fill="white"/></svg> },
  { id:"tokenpocket",name:"TokenPocket",    popular:false, color:"#2980FE", glow:"rgba(41,128,254,.3)", installed:()=>!!window.ethereum?.isTokenPocket,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="10" fill="#2980FE"/><rect x="8" y="12" width="24" height="6" rx="3" fill="white" opacity=".9"/><rect x="8" y="22" width="16" height="6" rx="3" fill="white" opacity=".6"/><circle cx="30" cy="25" r="4" fill="white" opacity=".9"/></svg> },
  { id:"brave",      name:"Brave",          popular:false, color:"#FF5000", glow:"rgba(255,80,0,.3)", installed:()=>!!window.ethereum?.isBraveWallet,
    icon:<svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="10" fill="#FF5000"/><path d="M20 7 L28 11 L31 20 L26 29 L20 33 L14 29 L9 20 L12 11 Z" fill="white" opacity=".9"/><circle cx="20" cy="20" r="3" fill="#FF5000"/></svg> },
];

/* ═══════════════════════════════════════════════════════════════════════════
   HEX GRID
═══════════════════════════════════════════════════════════════════════════ */
function HexGrid() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d"); let raf, t=0;
    const resize = () => { c.width=window.innerWidth; c.height=window.innerHeight; };
    resize(); window.addEventListener("resize",resize);
    const dh = (x,y,r,a,f) => { ctx.beginPath(); for(let i=0;i<6;i++){const ang=(Math.PI/3)*i-Math.PI/6; i===0?ctx.moveTo(x+r*Math.cos(ang),y+r*Math.sin(ang)):ctx.lineTo(x+r*Math.cos(ang),y+r*Math.sin(ang));} ctx.closePath(); if(f){ctx.fillStyle=f;ctx.fill();} ctx.strokeStyle=`rgba(0,255,180,${a})`;ctx.lineWidth=.5;ctx.stroke(); };
    const draw = () => { t+=.008; ctx.clearRect(0,0,c.width,c.height); const g=ctx.createRadialGradient(c.width*.5,c.height*.4,0,c.width*.5,c.height*.4,c.width*.7); g.addColorStop(0,"rgba(0,20,12,1)");g.addColorStop(1,"rgba(0,8,5,1)");ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height); const R=38,cols=Math.ceil(c.width/(R*1.73))+2,rows=Math.ceil(c.height/(R*1.5))+2; for(let row=-1;row<rows;row++)for(let col=-1;col<cols;col++){const x=col*R*1.73+(row%2===0?0:R*.865),y=row*R*1.5,d=Math.sqrt((x-c.width*.5)**2+(y-c.height*.4)**2),wave=Math.sin(d*.012-t*1.8)*.5+.5,pulse=Math.sin(t*.7+col*.3+row*.5)*.3+.3,alpha=wave*pulse*.4;dh(x,y,R-2,alpha,alpha>.18?`rgba(0,255,160,${alpha*.06})`:null);} for(let y=0;y<c.height;y+=3){ctx.fillStyle="rgba(0,0,0,0.06)";ctx.fillRect(0,y,c.width,1);} raf=requestAnimationFrame(draw); };
    draw(); return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);};
  },[]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}/>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════════════════ */
function Boot({onDone}) {
  const [lines,setLines]=useState([]),  [done,setDone]=useState(false);
  const BL=[
    {t:0,   c:"#00FFB0",m:"PRIVARC OS v2.4.1  —  ARC Network"},
    {t:300, c:"#4ADE80",m:"Initializing viem/wagmi client layer..."},
    {t:600, c:"#4ADE80",m:"Loading ZK-proof engine [Groth16] ✓"},
    {t:900, c:"#4ADE80",m:"ARC Network RPC connected  [7070] ✓"},
    {t:1200,c:"#4ADE80",m:"ShieldVault  0x7f3A···4E6f  ✓"},
    {t:1500,c:"#4ADE80",m:"NoteRegistry 0x3A5c···9A1c  ✓"},
    {t:1800,c:"#00FFB0",m:"AI Agent cluster  ONLINE  (8 agents)"},
    {t:2100,c:"#4ADE80",m:"USDC fee oracle  active"},
    {t:2400,c:"#F59E0B",m:"Privacy layer  ARMED"},
    {t:2800,c:"#00FFB0",m:"━━━  SYSTEM READY — AUTHENTICATE TO PROCEED  ━━━"},
  ];
  useEffect(()=>{BL.forEach(({t,c,m})=>setTimeout(()=>setLines(p=>[...p,{c,m}]),t));setTimeout(()=>{setDone(true);setTimeout(onDone,500);},3300);},[]);
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"#000A06",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 10vw",fontFamily:"'JetBrains Mono',monospace",opacity:done?0:1,transition:"opacity .5s",pointerEvents:done?"none":"all"}}>
      <div style={{marginBottom:28}}><div style={{fontSize:10,color:"#1A4A30",letterSpacing:".3em",marginBottom:8}}>PRIVARC AUTONOMOUS CRYPTO OS</div><div style={{width:60,height:2,background:"#00FFB0"}}/></div>
      {lines.map((l,i)=><div key={i} style={{fontSize:12,color:l.c,marginBottom:5,letterSpacing:".05em",lineHeight:1.6,animation:"fadeIn .3s ease"}}><span style={{color:"#1A4A30",marginRight:12}}>[{String(i).padStart(2,"0")}]</span>{l.m}</div>)}
      {lines.length>0&&<div style={{marginTop:20,height:2,background:"#0A2018",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:0,height:"100%",background:"linear-gradient(90deg,#00FFB0,#0EA5E9)",width:`${Math.min(100,(lines.length/BL.length)*100)}%`,transition:"width .3s",boxShadow:"0 0 10px #00FFB0"}}/></div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAIN SWITCH BANNER
═══════════════════════════════════════════════════════════════════════════ */
function ChainBanner() {
  const { chainOk, switchToARC, switchingChain, account } = useWeb3();
  if (!account || chainOk) return null;
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:150,background:"rgba(245,158,11,0.12)",borderBottom:"1px solid rgba(245,158,11,0.35)",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"monospace",backdropFilter:"blur(8px)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:"#F59E0B",fontSize:14}}>⚠</span>
        <span style={{fontSize:11,color:"#FCD34D",letterSpacing:".06em"}}>Wrong network detected — PrivARC requires <strong>ARC Network</strong></span>
      </div>
      <button onClick={switchToARC} disabled={switchingChain} style={{background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.5)",borderRadius:3,color:"#F59E0B",fontSize:10,padding:"6px 14px",cursor:"pointer",fontFamily:"monospace",letterSpacing:".12em",display:"flex",alignItems:"center",gap:8,transition:"all .2s"}}
        onMouseEnter={e=>e.currentTarget.style.background="rgba(245,158,11,0.25)"}
        onMouseLeave={e=>e.currentTarget.style.background="rgba(245,158,11,0.15)"}>
        {switchingChain?<><span style={{width:12,height:12,border:"1.5px solid rgba(245,158,11,.3)",borderTop:"1.5px solid #F59E0B",borderRadius:"50%",animation:"spin .7s linear infinite",display:"inline-block"}}/>Switching...</>:"⟶ SWITCH TO ARC"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OS FIELD
═══════════════════════════════════════════════════════════════════════════ */
function OsField({label,type,value,onChange,placeholder,icon,error,readOnly,suffix}) {
  const [foc,setFoc]=useState(false);
  const [sp,setSp]=useState(false);
  const isP=type==="password";
  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <label style={{fontSize:10,fontWeight:700,letterSpacing:".15em",textTransform:"uppercase",color:foc?"#00FFB0":"#1E5C3A",fontFamily:"monospace",transition:"color .2s"}}>{icon} {label}</label>
        {error&&<span style={{fontSize:10,color:"#EF4444"}}>⚠ {error}</span>}
      </div>
      <div style={{position:"relative"}}>
        {["tl","tr","bl","br"].map(p=><span key={p} style={{position:"absolute",zIndex:2,width:7,height:7,borderColor:foc?"#00FFB0":error?"#EF4444":"#1A4A30",borderStyle:"solid",borderWidth:0,transition:"border-color .2s",...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:{}),(p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:{}),...(p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{}),(p==="br"?{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}:{})}}/>)}
        <input type={isP&&!sp?"password":"text"} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly} onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)} style={{width:"100%",boxSizing:"border-box",padding:`11px ${suffix?"64px":"36px"} 11px 13px`,background:foc?"rgba(0,255,176,0.03)":readOnly?"rgba(0,255,176,0.02)":"rgba(0,0,0,.4)",border:`1px solid ${error?"#EF4444":foc?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`,borderRadius:3,color:"#A7F3D0",fontSize:13,fontFamily:"'JetBrains Mono',monospace",outline:"none",letterSpacing:".04em",boxShadow:foc?"0 0 16px rgba(0,255,176,.05)":"none",transition:"all .2s",cursor:readOnly?"default":"text"}}/>
        {suffix&&<span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#1E5C3A",fontFamily:"monospace"}}>{suffix}</span>}
        {isP&&<button onClick={()=>setSp(!sp)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:sp?"#00FFB0":"#1E5C3A",fontSize:13,padding:0}}>{sp?"◉":"◎"}</button>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TX STATUS TOAST
═══════════════════════════════════════════════════════════════════════════ */
function TxToast({tx,onClose}) {
  useEffect(()=>{if(tx?.status==="success"||tx?.status==="error"){const id=setTimeout(onClose,5000);return()=>clearTimeout(id);}},[tx]);
  if(!tx)return null;
  const colors={pending:"#F59E0B",success:"#00FFB0",error:"#EF4444"};
  const icons={pending:"⏳",success:"✓",error:"✕"};
  return (
    <div style={{position:"fixed",bottom:24,right:24,zIndex:300,background:"rgba(0,10,6,.96)",border:`1px solid ${colors[tx.status]}44`,borderRadius:5,padding:"14px 18px",minWidth:300,fontFamily:"monospace",animation:"fadeUp .3s ease",backdropFilter:"blur(12px)",boxShadow:`0 0 30px ${colors[tx.status]}18`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <span style={{fontSize:16,color:colors[tx.status]}}>{icons[tx.status]}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:colors[tx.status],fontWeight:700,letterSpacing:".1em",marginBottom:3}}>{tx.label}</div>
          <div style={{fontSize:10,color:"#1E5C3A"}}>{tx.message}</div>
          {tx.hash&&<a href={`${ARC_MAINNET.blockExplorers.default.url}/tx/${tx.hash}`} target="_blank" style={{fontSize:9,color:"#00FFB0",textDecoration:"none",display:"block",marginTop:4}}>{tx.hash.slice(0,18)}···  ↗</a>}
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#1E5C3A",cursor:"pointer",fontSize:12,padding:0}}>✕</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WALLET CONNECT MODAL
═══════════════════════════════════════════════════════════════════════════ */
function WCModal({onClose,onConnect}) {
  const [step,setStep]=useState("list"); // list | connecting | sign | success
  const [sel,setSel]=useState(null);
  const [addr,setAddr]=useState("");
  const doConnect=async(w)=>{setSel(w);setStep("connecting");await sleep(1200+Math.random()*600);setStep("sign");setAddr("0x"+hex(40));};
  const doSign=async()=>{setStep("connecting");await sleep(900);setStep("success");setTimeout(()=>onConnect({address:addr,wallet:sel,via:"wallet_connect"}),1100);};
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeIn .2s ease"}}>
      <div style={{width:"100%",maxWidth:420,background:"rgba(0,10,6,.97)",border:"1px solid rgba(0,255,176,.18)",borderRadius:6,boxShadow:"0 40px 80px rgba(0,0,0,.9)",overflow:"hidden",animation:"fadeUp .25s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px 14px",borderBottom:"1px solid rgba(0,255,176,.08)"}}>
          <div><div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:2}}>WALLET CONNECTION PROTOCOL</div>
          <div style={{fontSize:13,fontWeight:700,color:"#00FFB0",fontFamily:"monospace"}}>
            {step==="list"?"Select Provider":step==="connecting"?`Connecting ${sel?.name}...`:step==="sign"?"Sign Auth Request":"Connection Successful"}
          </div></div>
          <button onClick={onClose} style={{background:"none",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,color:"#1E5C3A",fontSize:15,width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.35)";e.currentTarget.style.color="#00FFB0";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.1)";e.currentTarget.style.color="#1E5C3A";}}>✕</button>
        </div>
        <div style={{padding:"18px 20px 20px"}}>
          {step==="list"&&(
            <div style={{animation:"fadeIn .3s ease"}}>
              <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:8}}>▸ POPULAR</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
                {WALLETS.filter(w=>w.popular).map(w=><WalletBtn key={w.id} w={w} onClick={()=>doConnect(w)}/>)}
              </div>
              <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:8}}>▸ MORE</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                {WALLETS.filter(w=>!w.popular).map(w=><WalletBtn key={w.id} w={w} onClick={()=>doConnect(w)}/>)}
              </div>
              <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid rgba(0,255,176,.06)",fontSize:9,color:"#0A1F14",fontFamily:"monospace",textAlign:"center"}}>Secured by EIP-4361 · Sign-In With Ethereum</div>
            </div>
          )}
          {step==="connecting"&&sel&&(
            <div style={{textAlign:"center",padding:"20px 0",animation:"fadeIn .3s ease"}}>
              <div style={{position:"relative",width:80,height:80,margin:"0 auto 18px"}}>
                <div style={{width:80,height:80,borderRadius:"50%",border:`2px solid ${sel.color}22`,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel.icon}</div>
                <svg style={{position:"absolute",inset:0,animation:"spin 1.2s linear infinite"}} width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="37" fill="none" stroke={sel.color} strokeWidth="1.5" strokeDasharray="60 180" strokeLinecap="round"/></svg>
              </div>
              <div style={{fontSize:12,color:"#A7F3D0",fontFamily:"monospace",marginBottom:4}}>Opening {sel.name}...</div>
              <div style={{fontSize:10,color:"#0F3A22",fontFamily:"monospace"}}>Confirm in your wallet</div>
            </div>
          )}
          {step==="sign"&&sel&&(
            <div style={{animation:"fadeIn .3s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <div style={{width:40,height:40,borderRadius:8,background:`${sel.color}15`,border:`1px solid ${sel.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{sel.icon}</div>
                <div><div style={{fontSize:12,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{sel.name}</div><div style={{fontSize:10,color:"#1E5C3A",fontFamily:"monospace",marginTop:1}}>{shortAddr(addr)}</div></div>
                <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 6px #00FFB0"}}/><span style={{fontSize:9,color:"#00FFB0",fontFamily:"monospace"}}>CONNECTED</span></div>
              </div>
              <div style={{background:"rgba(0,0,0,.4)",border:"1px solid rgba(0,255,176,.1)",borderRadius:4,padding:"12px 14px",marginBottom:16,fontFamily:"monospace"}}>
                <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".15em",marginBottom:8}}>SIGNATURE REQUEST — EIP-4361</div>
                {[["Domain","privarc.io"],["Address",shortAddr(addr)],["Chain","ARC Network (7070)"],["Nonce",hex(8)],["Issued",new Date().toISOString().split("T")[0]]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:10,marginBottom:4}}><span style={{fontSize:10,color:"#0F3A22",minWidth:56}}>{k}:</span><span style={{fontSize:10,color:"#4ADE80"}}>{v}</span></div>
                ))}
                <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid rgba(0,255,176,.06)",fontSize:9,color:"#0F3A22"}}>Sign in to PrivARC OS. No blockchain transaction or fee.</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={onClose} style={{padding:"11px 0",background:"transparent",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,color:"#1E5C3A",fontSize:10,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.color="#00FFB0";e.currentTarget.style.borderColor="rgba(0,255,176,.3)";}} onMouseLeave={e=>{e.currentTarget.style.color="#1E5C3A";e.currentTarget.style.borderColor="rgba(0,255,176,.1)";}}>CANCEL</button>
                <button onClick={doSign} style={{padding:"11px 0",background:"transparent",border:"1px solid #00FFB0",borderRadius:3,color:"#00FFB0",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",boxShadow:"0 0 14px rgba(0,255,176,.1)",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ SIGN & ENTER</button>
              </div>
            </div>
          )}
          {step==="success"&&sel&&(
            <div style={{textAlign:"center",padding:"16px 0",animation:"fadeIn .4s ease"}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:"rgba(0,255,176,.08)",border:"2px solid #00FFB0",boxShadow:"0 0 28px rgba(0,255,176,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:26,color:"#00FFB0"}}>✓</div>
              <div style={{fontSize:13,color:"#00FFB0",fontFamily:"monospace",fontWeight:700,marginBottom:4}}>Authentication Successful</div>
              <div style={{fontSize:10,color:"#1E5C3A",fontFamily:"monospace"}}>{sel.name} · {shortAddr(addr)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function WalletBtn({w,onClick}) {
  const [h,setH]=useState(false);
  const inst=w.installed();
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:h?`${w.color}0D`:"rgba(0,0,0,.3)",border:`1px solid ${h?w.color+"44":"rgba(0,255,176,.08)"}`,borderRadius:5,padding:"10px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .2s",boxShadow:h?`0 0 18px ${w.glow}`:"none"}}>
      <div style={{width:34,height:34,borderRadius:7,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:h?`${w.color}18`:"rgba(255,255,255,.04)",border:`1px solid ${h?w.color+"33":"rgba(255,255,255,.06)"}`,transition:"all .2s"}}>{w.icon}</div>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:11,color:h?"#E2F8FF":"#A7F3D0",fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",transition:"color .2s"}}>{w.name}</div>
        <div style={{fontSize:9,color:"#0F3A22",fontFamily:"monospace",marginTop:1,display:"flex",alignItems:"center",gap:4}}>{inst&&<span style={{color:"#00FFB0",fontSize:8}}>●</span>}{inst?"Detected":"Available"}</div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GLITCH LOGO
═══════════════════════════════════════════════════════════════════════════ */
function Glitch({text,style}) {
  return <span style={{position:"relative",display:"inline-block",...style}}><span style={{position:"relative",zIndex:1}}>{text}</span><span style={{position:"absolute",top:0,left:0,color:"#00FFB0",opacity:0,animation:"g1 4s infinite",clipPath:"polygon(0 30%,100% 30%,100% 50%,0 50%)",transform:"translateX(-2px)"}}>{text}</span><span style={{position:"absolute",top:0,left:0,color:"#0EA5E9",opacity:0,animation:"g2 4s infinite",clipPath:"polygon(0 60%,100% 60%,100% 80%,0 80%)",transform:"translateX(2px)"}}>{text}</span></span>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PASS STRENGTH
═══════════════════════════════════════════════════════════════════════════ */
function PassStr({pw}) {
  if(!pw)return null;
  const s=[pw.length>=8,/[A-Z]/.test(pw),/[0-9]/.test(pw),/[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  const c=["","#EF4444","#F59E0B","#3B82F6","#00FFB0"],l=["","WEAK","FAIR","GOOD","STRONG"];
  return <div style={{marginTop:-8,marginBottom:14}}><div style={{display:"flex",gap:3}}>{[1,2,3,4].map(i=><div key={i} style={{flex:1,height:2,background:i<=s?c[s]:"#0A1F14",boxShadow:i<=s&&s===4?`0 0 5px ${c[s]}`:"none",transition:"background .3s"}}/>)}</div><div style={{marginTop:3,fontSize:9,color:c[s],letterSpacing:".1em"}}>ENTROPY: {l[s]}</div></div>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   WALLET REVEAL (post-signup)
═══════════════════════════════════════════════════════════════════════════ */
function WalletReveal({wallet,onContinue}) {
  const [phase,setPhase]=useState(0);
  const [copied,setCopied]=useState({});
  const [showM,setShowM]=useState(false);
  const [showP,setShowP]=useState(false);
  const [prog,setProg]=useState(0);
  const STEPS=["Generating entropy from /dev/urandom...","Deriving secp256k1 keypair...","Computing ARC Network address...","Encoding BIP-39 mnemonic (2048 words)...","Registering stealth keys...","Linking to PrivARC account...","WALLET READY"];
  useEffect(()=>{const s=[0,15,35,55,72,88,100];let i=0;const id=setInterval(()=>{i++;setProg(s[i]||100);if(i>=s.length-1){clearInterval(id);setTimeout(()=>setPhase(1),400);}},280);return()=>clearInterval(id);},[]);
  const cp=(k,t)=>{navigator.clipboard.writeText(t).catch(()=>{});setCopied(p=>({...p,[k]:true}));setTimeout(()=>setCopied(p=>({...p,[k]:false})),2000);};
  const Row=({label,value,k,blur,rev,onRev})=>(
    <div style={{marginBottom:12}}>
      <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".15em",fontFamily:"monospace",marginBottom:4,textTransform:"uppercase"}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:7,background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,padding:"8px 11px"}}>
        <span style={{flex:1,fontSize:11,fontFamily:"monospace",color:"#A7F3D0",wordBreak:"break-all",lineHeight:1.4,filter:blur&&!rev?"blur(4px)":"none",transition:"filter .3s",userSelect:blur&&!rev?"none":"text"}}>{value}</span>
        {blur&&<button onClick={onRev} style={{background:"none",border:"1px solid rgba(0,255,176,.2)",borderRadius:2,color:"#00FFB0",fontSize:9,padding:"2px 6px",cursor:"pointer",fontFamily:"monospace",flexShrink:0}}>{rev?"HIDE":"SHOW"}</button>}
        <button onClick={()=>cp(k,value)} style={{background:"none",border:"1px solid rgba(0,255,176,.15)",borderRadius:2,color:copied[k]?"#00FFB0":"#1E5C3A",fontSize:9,padding:"2px 6px",cursor:"pointer",fontFamily:"monospace",flexShrink:0,transition:"color .2s"}}>{copied[k]?"✓OK":"COPY"}</button>
      </div>
    </div>
  );
  if(phase===0)return(
    <div style={{padding:"8px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><div style={{width:9,height:9,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 10px #00FFB0",animation:"pulse 1s infinite"}}/><span style={{fontSize:11,color:"#00FFB0",letterSpacing:".15em",fontFamily:"monospace"}}>GENERATING WALLET</span></div>
      {STEPS.slice(0,Math.ceil((prog/100)*STEPS.length)).map((s,i)=><div key={i} style={{fontSize:11,color:i===Math.ceil((prog/100)*STEPS.length)-1?"#A7F3D0":"#1E5C3A",marginBottom:5,fontFamily:"monospace",animation:"fadeIn .3s ease"}}><span style={{color:"#0F3A22",marginRight:8}}>›</span>{s}</div>)}
      <div style={{marginTop:18,background:"#0A1F14",borderRadius:2,overflow:"hidden",height:2}}><div style={{height:"100%",background:"linear-gradient(90deg,#00FFB0,#0EA5E9)",width:`${prog}%`,transition:"width .28s",boxShadow:"0 0 8px #00FFB0"}}/></div>
      <div style={{marginTop:4,fontSize:9,color:"#0F3A22",textAlign:"right",fontFamily:"monospace"}}>{prog}%</div>
    </div>
  );
  return(
    <div style={{animation:"fadeIn .4s ease"}}>
      <div style={{marginBottom:20}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><div style={{width:7,height:7,background:"#00FFB0",borderRadius:"50%",boxShadow:"0 0 7px #00FFB0"}}/><span style={{fontSize:13,fontWeight:700,color:"#00FFB0",letterSpacing:".1em",fontFamily:"monospace"}}>WALLET INITIALIZED</span></div><p style={{margin:0,fontSize:10,color:"#1E5C3A",fontFamily:"monospace"}}>ARC Network · Stealth enabled · ZK-ready</p></div>
      <div style={{border:"1px solid rgba(245,158,11,.3)",borderRadius:3,background:"rgba(245,158,11,.05)",padding:"9px 12px",marginBottom:16,display:"flex",gap:8}}><span style={{color:"#F59E0B",fontSize:13}}>⚠</span><p style={{margin:0,fontSize:10,color:"#92400E",lineHeight:1.5,fontFamily:"monospace"}}>CRITICAL: Store recovery phrase offline. PrivARC cannot recover lost keys.</p></div>
      <Row label="// ARC Network Address" value={wallet.address} k="addr"/>
      <Row label="// Recovery Phrase (BIP-39)" value={wallet.mnemonic} k="mnem" blur rev={showM} onRev={()=>setShowM(!showM)}/>
      <Row label="// Private Key — NEVER SHARE" value={wallet.privateKey} k="pk" blur rev={showP} onRev={()=>setShowP(!showP)}/>
      <button onClick={onContinue} style={{width:"100%",marginTop:6,padding:"12px 0",background:"transparent",border:"1px solid #00FFB0",borderRadius:3,color:"#00FFB0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".15em",boxShadow:"0 0 18px rgba(0,255,176,.1)",transition:"all .2s",textTransform:"uppercase"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ Launch PrivARC OS</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════════════════════════════ */
function Dashboard({user}) {
  const {account,pubClient,walClient,disconnect}=useWeb3();
  const [tab,setTab]=useState("shield"); // shield | swap | send | withdraw | bridge
  const [balances,setBalances]=useState({usdc:0n,shielded:0n,arc:0n});
  const [tx,setTx]=useState(null);
  const [agentLogs,setAgentLogs]=useState([
    {t:"00:00:01",m:"ShieldAgent :: Monitoring deposit pool",c:"#00FFB0"},
    {t:"00:00:03",m:"SwapAgent :: DEX liquidity scan complete",c:"#4ADE80"},
    {t:"00:00:07",m:"ZKAgent :: Proof batch ready",c:"#4ADE80"},
    {t:"00:00:12",m:"RiskAgent :: Volatility index: LOW",c:"#4ADE80"},
  ]);
  const [blockNum,setBlockNum]=useState(8420141);

  // Load balances
  useEffect(()=>{
    if(!pubClient||!account?.address)return;
    (async()=>{
      const [arc,usdc,shielded]=await Promise.all([
        pubClient.getBalance(account.address),
        pubClient.readContract({address:CONTRACTS.USDC,abi:[],functionName:"balanceOf",args:[account.address]}),
        pubClient.readContract({address:CONTRACTS.ShieldVault,abi:[],functionName:"getShieldedBalance",args:[account.address]}),
      ]);
      setBalances({arc,usdc,shielded});
    })();
  },[pubClient,account]);

  // Block ticker
  useEffect(()=>{const id=setInterval(()=>setBlockNum(n=>n+1),6000);return()=>clearInterval(id);},[]);

  // Agent log updates
  useEffect(()=>{
    const msgs=[["ZKAgent :: New proof generated","#00FFB0"],["ShieldAgent :: Pool nominal","#4ADE80"],["FeeAgent :: Oracle price updated","#4ADE80"],["PrivacyAgent :: Scan 0 new notes","#4ADE80"],["RiskAgent :: Score 0.02","#4ADE80"],["SwapAgent :: Route optimized","#4ADE80"],["BridgeAgent :: Bridge idle","#1E5C3A"],["GovAgent :: No proposals","#1E5C3A"]];
    const id=setInterval(()=>{if(Math.random()>.5){const[m,c]=msgs[Math.floor(Math.random()*msgs.length)];const n=new Date();const t=[n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":");setAgentLogs(p=>[...p.slice(-7),{t,m,c}]);}},2200);return()=>clearInterval(id);
  },[]);

  const TABS=[
    {id:"shield",  icon:"🛡", label:"SHIELD"},
    {id:"swap",    icon:"⇄",  label:"SWAP"},
    {id:"send",    icon:"↗",  label:"SEND"},
    {id:"withdraw",icon:"↙",  label:"WITHDRAW"},
    {id:"bridge",  icon:"⟺", label:"BRIDGE"},
  ];

  const notify=(label,message,status,hash)=>setTx({label,message,status,hash});
  const refreshBalances=async()=>{
    if(!pubClient||!account?.address)return;
    const[arc,usdc,shielded]=await Promise.all([pubClient.getBalance(account.address),pubClient.readContract({address:CONTRACTS.USDC,abi:[],functionName:"balanceOf",args:[account.address]}),pubClient.readContract({address:CONTRACTS.ShieldVault,abi:[],functionName:"getShieldedBalance",args:[account.address]})]);
    setBalances({arc,usdc,shielded});
  };

  return (
    <div style={{animation:"fadeIn .4s ease"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,paddingBottom:14,borderBottom:"1px solid rgba(0,255,176,.08)"}}>
        <div>
          <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:3}}>OPERATOR</div>
          <div style={{fontSize:13,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{user?.name||"Anonymous"}</div>
          <div style={{fontSize:10,color:"#1E5C3A",fontFamily:"monospace",marginTop:2}}>{shortAddr(account?.address)}</div>
        </div>
        <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:5,height:5,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 5px #00FFB0",animation:"pulse 2s infinite"}}/><span style={{fontSize:9,color:"#00FFB0",letterSpacing:".12em",fontFamily:"monospace"}}>ARC MAINNET</span></div>
          <div style={{fontSize:9,color:"#0F3A22",fontFamily:"monospace"}}>Block #{blockNum.toLocaleString()}</div>
          <button onClick={disconnect} style={{fontSize:9,color:"#1E5C3A",background:"none",border:"1px solid rgba(0,255,176,.08)",borderRadius:2,padding:"3px 8px",cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.color="#EF4444";e.currentTarget.style.borderColor="rgba(239,68,68,.3)";}} onMouseLeave={e=>{e.currentTarget.style.color="#1E5C3A";e.currentTarget.style.borderColor="rgba(0,255,176,.08)";}}>DISCONNECT</button>
        </div>
      </div>

      {/* Balance cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
        {[
          {label:"SHIELDED",value:fmt6(balances.shielded),unit:"USDC",glow:true},
          {label:"WALLET",  value:fmt6(balances.usdc),unit:"USDC",glow:false},
          {label:"GAS",     value:fmtE(balances.arc),unit:"ARC",glow:false},
        ].map(b=>(
          <div key={b.label} style={{background:"rgba(0,255,176,.03)",border:`1px solid rgba(0,255,176,${b.glow?.2:.08})`,borderRadius:4,padding:"10px 12px",boxShadow:b.glow?"0 0 20px rgba(0,255,176,.05)":"none"}}>
            <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:5}}>{b.label}</div>
            <div style={{fontSize:15,fontWeight:700,color:b.glow?"#00FFB0":"#A7F3D0",fontFamily:"monospace",lineHeight:1}}>{b.value}</div>
            <div style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace",marginTop:2}}>{b.unit}</div>
          </div>
        ))}
      </div>

      {/* Tab nav */}
      <div style={{display:"flex",background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:3,gap:2,marginBottom:14}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"7px 2px",background:tab===t.id?"rgba(0,255,176,.1)":"transparent",border:`1px solid ${tab===t.id?"rgba(0,255,176,.3)":"transparent"}`,borderRadius:3,color:tab===t.id?"#00FFB0":"#1E5C3A",fontSize:9,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <span style={{fontSize:14}}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div style={{minHeight:240}}>
        {tab==="shield"&&<ShieldPanel walClient={walClient} pubClient={pubClient} account={account} balances={balances} notify={notify} refresh={refreshBalances}/>}
        {tab==="swap"  &&<SwapPanel   walClient={walClient} pubClient={pubClient} account={account} balances={balances} notify={notify} refresh={refreshBalances}/>}
        {tab==="send"  &&<SendPanel   walClient={walClient} pubClient={pubClient} account={account} balances={balances} notify={notify} refresh={refreshBalances}/>}
        {tab==="withdraw"&&<WithdrawPanel walClient={walClient} pubClient={pubClient} account={account} balances={balances} notify={notify} refresh={refreshBalances}/>}
        {tab==="bridge"&&<BridgePanel walClient={walClient} pubClient={pubClient} account={account} balances={balances} notify={notify} refresh={refreshBalances}/>}
      </div>

      {/* Agent log */}
      <div style={{marginTop:12,background:"#000A06",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"9px 11px"}}>
        <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:5}}>AI AGENT LOG</div>
        {agentLogs.slice(-4).map((l,i)=><div key={i} style={{fontSize:9,fontFamily:"monospace",marginBottom:2,color:l.c,lineHeight:1.4,animation:i===agentLogs.slice(-4).length-1?"fadeIn .3s ease":"none"}}><span style={{color:"#0A1F14",marginRight:7}}>[{l.t}]</span>{l.m}</div>)}
      </div>

      <TxToast tx={tx} onClose={()=>setTx(null)}/>
    </div>
  );
}

/* ─── SHIELD PANEL ───────────────────────────────────────────── */
function ShieldPanel({walClient,pubClient,account,balances,notify,refresh}) {
  const [amount,setAmount]=useState("");
  const [loading,setLoading]=useState(false);
  const [gas,setGas]=useState(null);

  useEffect(()=>{
    if(!pubClient||!amount||isNaN(amount)||Number(amount)<=0)return;
    const id=setTimeout(async()=>{
      const g=await pubClient.estimateGas();
      const gp=await pubClient.getGasPrice();
      setGas(fmtE(g*gp)+" ARC");
    },600);
    return()=>clearTimeout(id);
  },[amount,pubClient]);

  const submit=async()=>{
    if(!amount||!walClient)return;
    setLoading(true);
    notify("Shield","Approving USDC allowance...","pending");
    try {
      // Step 1: approve
      const approveTx=await walClient.writeContract({address:CONTRACTS.USDC,abi:[],functionName:"approve",args:[CONTRACTS.ShieldVault,BigInt(Math.floor(Number(amount)*1e6))]});
      notify("Shield","Submitting shield transaction...","pending",approveTx);
      await pubClient.waitForTransactionReceipt(approveTx);
      // Step 2: shield
      const shieldTx=await walClient.writeContract({address:CONTRACTS.ShieldVault,abi:[],functionName:"shield",args:[CONTRACTS.USDC,BigInt(Math.floor(Number(amount)*1e6))]});
      const receipt=await pubClient.waitForTransactionReceipt(shieldTx);
      notify("Shield ✓",`${amount} USDC shielded successfully`,"success",shieldTx);
      setAmount("");
      await refresh();
    } catch(e) {
      notify("Shield Failed",e.message||"Transaction rejected","error");
    }
    setLoading(false);
  };

  return (
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:12}}>▸ SHIELD ASSETS — DEPOSIT INTO PRIVARC VAULT</div>
      <div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.1)",borderRadius:4,padding:"14px 16px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:10,color:"#1E5C3A",fontFamily:"monospace"}}>Amount to Shield</span>
          <button onClick={()=>setAmount(fmt6(balances.usdc).replace(/,/g,""))} style={{fontSize:9,color:"#00FFB0",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em"}}>MAX {fmt6(balances.usdc)}</button>
        </div>
        <OsField label="USDC AMOUNT" type="text" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="🛡" suffix="USDC"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
          <div style={{background:"rgba(0,0,0,.3)",borderRadius:3,padding:"8px 10px"}}>
            <div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",marginBottom:3}}>PROTOCOL FEE</div>
            <div style={{fontSize:12,color:"#4ADE80",fontFamily:"monospace"}}>0.00 USDC</div>
            <div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>Launch phase</div>
          </div>
          <div style={{background:"rgba(0,0,0,.3)",borderRadius:3,padding:"8px 10px"}}>
            <div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",marginBottom:3}}>EST. GAS</div>
            <div style={{fontSize:12,color:"#A7F3D0",fontFamily:"monospace"}}>{gas||"—"}</div>
            <div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>ARC Network</div>
          </div>
        </div>
      </div>
      <div style={{background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,padding:"9px 12px",marginBottom:14,fontSize:10,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>
        ZK commitment will be generated on-chain.<br/>Funds untraceable once shielded.
      </div>
      <ArcBtn label="⟶ SHIELD ASSETS" onClick={submit} loading={loading} disabled={!amount||Number(amount)<=0}/>
    </div>
  );
}

/* ─── SWAP PANEL ─────────────────────────────────────────────── */
function SwapPanel({walClient,pubClient,account,balances,notify,refresh}) {
  const [fromToken,setFromToken]=useState("USDC");
  const [toToken,setToToken]=useState("WETH");
  const [amount,setAmount]=useState("");
  const [quote,setQuote]=useState(null);
  const [loading,setLoading]=useState(false);
  const TOKENS=["USDC","WETH","WBTC","ARCt","DAI"];

  useEffect(()=>{
    if(!amount||isNaN(amount)||Number(amount)<=0){setQuote(null);return;}
    const id=setTimeout(()=>{
      const rates={USDC:{WETH:0.000385,WBTC:0.0000155,ARCt:4.25,DAI:0.9997},WETH:{USDC:2597,WBTC:0.0403,ARCt:11031,DAI:2596},WBTC:{USDC:64500,WETH:24.8,ARCt:274000,DAI:64480},ARCt:{USDC:0.235,WETH:0.0000906,WBTC:0.00000365,DAI:0.2348},DAI:{USDC:1.0003,WETH:0.000385,WBTC:0.0000155,ARCt:4.25}};
      const rate=rates[fromToken]?.[toToken]||1;
      const out=Number(amount)*rate*(0.999+Math.random()*.001);
      const fee=(Number(amount)*0.0005).toFixed(4);
      const impact=(Math.random()*0.3).toFixed(2);
      setQuote({out:out.toFixed(6),fee,impact,route:[fromToken,"USDC Pool","ZK Relay",toToken]});
    },500);
    return()=>clearTimeout(id);
  },[amount,fromToken,toToken]);

  const swap=async()=>{
    if(!amount||!walClient||!quote)return;
    setLoading(true);
    notify("Private Swap","Routing through ZK relay...","pending");
    try {
      const h=await walClient.writeContract({address:CONTRACTS.ShieldVault,abi:[],functionName:"privateSwap",args:[fromToken,toToken,BigInt(Math.floor(Number(amount)*1e6))]});
      notify("Swap","Waiting for ZK proof...","pending",h);
      await pubClient.waitForTransactionReceipt(h);
      notify("Swap ✓",`${amount} ${fromToken} → ${quote.out} ${toToken}`,"success",h);
      setAmount(""); setQuote(null); await refresh();
    } catch(e){notify("Swap Failed",e.message||"Rejected","error");}
    setLoading(false);
  };

  const TokenSel=({value,onChange})=>(
    <select value={value} onChange={e=>onChange(e.target.value)} style={{background:"rgba(0,0,0,.5)",border:"1px solid rgba(0,255,176,.15)",borderRadius:3,color:"#A7F3D0",fontSize:11,fontFamily:"monospace",padding:"6px 10px",cursor:"pointer",outline:"none"}}>
      {TOKENS.map(t=><option key={t} value={t}>{t}</option>)}
    </select>
  );

  return (
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:12}}>▸ PRIVATE SWAP — ZK-ROUTED ON-CHAIN EXCHANGE</div>
      <div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.1)",borderRadius:4,padding:"14px 16px",marginBottom:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
          <div style={{flex:1}}><OsField label="FROM" type="text" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="⬆"/></div>
          <TokenSel value={fromToken} onChange={v=>{setFromToken(v);if(v===toToken)setToToken(TOKENS.find(t=>t!==v));}}/>
        </div>
        <div style={{display:"flex",justifyContent:"center",margin:"0 0 10px"}}>
          <button onClick={()=>{setFromToken(toToken);setToToken(fromToken);setAmount("");setQuote(null);}} style={{background:"rgba(0,255,176,.06)",border:"1px solid rgba(0,255,176,.2)",borderRadius:"50%",width:32,height:32,cursor:"pointer",color:"#00FFB0",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.12)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,255,176,.06)"}>⇅</button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1}}><OsField label="TO (ESTIMATED)" type="text" value={quote?quote.out:""} placeholder="0.00" icon="⬇" readOnly/></div>
          <TokenSel value={toToken} onChange={v=>{setToToken(v);if(v===fromToken)setFromToken(TOKENS.find(t=>t!==v));}}/>
        </div>
      </div>
      {quote&&(
        <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,padding:"10px 12px",marginBottom:12,fontFamily:"monospace"}}>
          <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".15em",marginBottom:7}}>QUOTE DETAILS</div>
          {[["Rate",`1 ${fromToken} = ${(Number(quote.out)/Number(amount)).toFixed(6)} ${toToken}`],["Fee",`${quote.fee} USDC (0.05%)`],["Price Impact",`${quote.impact}%`],["Route",quote.route.join(" → ")]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:"#0F3A22"}}>{k}</span><span style={{fontSize:9,color:"#4ADE80"}}>{v}</span></div>
          ))}
        </div>
      )}
      <ArcBtn label="⟶ EXECUTE PRIVATE SWAP" onClick={swap} loading={loading} disabled={!amount||!quote}/>
    </div>
  );
}

/* ─── SEND PANEL ─────────────────────────────────────────────── */
function SendPanel({walClient,pubClient,account,balances,notify,refresh}) {
  const [to,setTo]=useState("");
  const [amount,setAmount]=useState("");
  const [loading,setLoading]=useState(false);
  const [resolving,setResolving]=useState(false);
  const [resolved,setResolved]=useState(null);

  // Simulated ENS/ARC Name resolve
  useEffect(()=>{
    if(to.endsWith(".arc")||to.endsWith(".eth")){
      setResolving(true);setResolved(null);
      const id=setTimeout(()=>{setResolving(false);setResolved("0x"+hex(40));},700);
      return()=>clearTimeout(id);
    } else{setResolved(null);}
  },[to]);

  const send=async()=>{
    if((!to&&!resolved)||!amount||!walClient)return;
    setLoading(true);
    notify("Private Send","Generating stealth address...","pending");
    try{
      const dest=resolved||to;
      const h=await walClient.writeContract({address:CONTRACTS.ShieldVault,abi:[],functionName:"privateSend",args:[dest,BigInt(Math.floor(Number(amount)*1e6))]});
      notify("Private Send","Broadcasting ZK transaction...","pending",h);
      await pubClient.waitForTransactionReceipt(h);
      notify("Send ✓",`${amount} USDC sent privately`,"success",h);
      setTo("");setAmount("");setResolved(null);await refresh();
    }catch(e){notify("Send Failed",e.message||"Rejected","error");}
    setLoading(false);
  };

  return (
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:12}}>▸ PRIVATE SEND — STEALTH ADDRESS TRANSFER</div>
      <OsField label="RECIPIENT (ADDRESS OR .ARC / .ETH NAME)" type="text" value={to} onChange={e=>setTo(e.target.value)} placeholder="0x... or name.arc" icon="↗" hint={resolving?"Resolving name...":resolved?`Resolved: ${shortAddr(resolved)}`:null}/>
      {resolved&&<div style={{marginTop:-10,marginBottom:12,fontSize:10,color:"#00FFB0",fontFamily:"monospace"}}>✓ {shortAddr(resolved)}</div>}
      <OsField label="AMOUNT" type="text" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="💸" suffix="USDC"/>
      <div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,padding:"10px 12px",marginBottom:14,fontFamily:"monospace"}}>
        {[["Protocol Fee","0.02 USDC"],["Privacy","Stealth address — sender invisible"],["Delivery","Instant on ARC Network"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:"#0F3A22"}}>{k}</span><span style={{fontSize:9,color:"#4ADE80"}}>{v}</span></div>
        ))}
      </div>
      <ArcBtn label="⟶ SEND PRIVATELY" onClick={send} loading={loading} disabled={!to||!amount||resolving}/>
    </div>
  );
}

/* ─── WITHDRAW PANEL ─────────────────────────────────────────── */
function WithdrawPanel({walClient,pubClient,account,balances,notify,refresh}) {
  const [amount,setAmount]=useState("");
  const [dest,setDest]=useState("");
  const [loading,setLoading]=useState(false);
  const [proving,setProving]=useState(false);

  const withdraw=async()=>{
    if(!amount||!walClient)return;
    setLoading(true);setProving(true);
    notify("Withdraw","Generating ZK ownership proof...","pending");
    await sleep(1800);
    setProving(false);
    try{
      const target=dest||account.address;
      const h=await walClient.writeContract({address:CONTRACTS.ShieldVault,abi:[],functionName:"withdraw",args:[BigInt(Math.floor(Number(amount)*1e6)),target]});
      notify("Withdraw","Submitting proof on-chain...","pending",h);
      await pubClient.waitForTransactionReceipt(h);
      notify("Withdraw ✓",`${amount} USDC withdrawn to ${shortAddr(target)}`,"success",h);
      setAmount("");setDest("");await refresh();
    }catch(e){notify("Withdraw Failed",e.message||"Rejected","error");}
    setLoading(false);
  };

  return (
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:12}}>▸ WITHDRAW — EXIT TO PUBLIC ADDRESS</div>
      <OsField label="WITHDRAW AMOUNT" type="text" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="↙" suffix="USDC"/>
      <OsField label="DESTINATION ADDRESS (OPTIONAL — DEFAULTS TO CONNECTED)" type="text" value={dest} onChange={e=>setDest(e.target.value)} placeholder={account?.address||"0x..."} icon="📍"/>
      <div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,padding:"10px 12px",marginBottom:10,fontFamily:"monospace"}}>
        {[["Protocol Fee","0.03 USDC"],["ZK Proof","Groth16 — ~1.8s generation"],["Shielded Balance",`${fmt6(balances.shielded)} USDC available`]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:"#0F3A22"}}>{k}</span><span style={{fontSize:9,color:"#4ADE80"}}>{v}</span></div>
        ))}
      </div>
      {proving&&<div style={{marginBottom:10,padding:"8px 12px",background:"rgba(0,255,176,.04)",border:"1px solid rgba(0,255,176,.15)",borderRadius:3,display:"flex",alignItems:"center",gap:8}}><span style={{width:12,height:12,border:"1.5px solid rgba(0,255,176,.2)",borderTop:"1.5px solid #00FFB0",borderRadius:"50%",animation:"spin .7s linear infinite",display:"inline-block",flexShrink:0}}/><span style={{fontSize:10,color:"#00FFB0",fontFamily:"monospace"}}>Generating ZK proof...</span></div>}
      <ArcBtn label="⟶ WITHDRAW FUNDS" onClick={withdraw} loading={loading} disabled={!amount||Number(amount)<=0}/>
    </div>
  );
}

/* ─── BRIDGE PANEL ───────────────────────────────────────────── */
function BridgePanel({walClient,pubClient,account,balances,notify,refresh}) {
  const [destChain,setDestChain]=useState("ethereum");
  const [amount,setAmount]=useState("");
  const [loading,setLoading]=useState(false);
  const CHAINS=[{id:"ethereum",name:"Ethereum",icon:"Ξ",fee:"0.10"},{id:"bnb",name:"BNB Chain",icon:"⬡",fee:"0.08"},{id:"polygon",name:"Polygon",icon:"⬟",fee:"0.05"},{id:"arbitrum",name:"Arbitrum",icon:"🔵",fee:"0.04"},{id:"base",name:"Base",icon:"🔷",fee:"0.04"}];
  const chain=CHAINS.find(c=>c.id===destChain);

  const bridge=async()=>{
    if(!amount||!walClient)return;
    setLoading(true);
    notify("Bridge","Locking funds in BridgeAdapter...","pending");
    try{
      const h=await walClient.writeContract({address:CONTRACTS.ShieldVault,abi:[],functionName:"bridgeOut",args:[destChain,BigInt(Math.floor(Number(amount)*1e6))]});
      notify("Bridge","Cross-chain relay active...","pending",h);
      await pubClient.waitForTransactionReceipt(h);
      notify("Bridge ✓",`${amount} USDC bridged to ${chain?.name}`,"success",h);
      setAmount("");await refresh();
    }catch(e){notify("Bridge Failed",e.message||"Rejected","error");}
    setLoading(false);
  };

  return (
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:12}}>▸ BRIDGE — CROSS-CHAIN PRIVATE TRANSFER</div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:9,color:"#1E5C3A",letterSpacing:".15em",fontFamily:"monospace",marginBottom:7}}>DESTINATION NETWORK</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5}}>
          {CHAINS.map(c=>(
            <button key={c.id} onClick={()=>setDestChain(c.id)} style={{background:destChain===c.id?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)",border:`1px solid ${destChain===c.id?"rgba(0,255,176,.35)":"rgba(0,255,176,.08)"}`,borderRadius:4,padding:"8px 4px",cursor:"pointer",textAlign:"center",transition:"all .2s"}}>
              <div style={{fontSize:16,marginBottom:3}}>{c.icon}</div>
              <div style={{fontSize:8,color:destChain===c.id?"#00FFB0":"#1E5C3A",fontFamily:"monospace"}}>{c.name.split(" ")[0]}</div>
            </button>
          ))}
        </div>
      </div>
      <OsField label="AMOUNT" type="text" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="⟺" suffix="USDC"/>
      <div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,padding:"10px 12px",marginBottom:14,fontFamily:"monospace"}}>
        {[["Destination",chain?.name||"—"],["Protocol Fee",`${chain?.fee||"—"} USDC`],["Bridge Time","~2-5 minutes"],["Privacy","Shielded end-to-end"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:9,color:"#0F3A22"}}>{k}</span><span style={{fontSize:9,color:"#4ADE80"}}>{v}</span></div>
        ))}
      </div>
      <ArcBtn label={`⟶ BRIDGE TO ${chain?.name?.toUpperCase()||"—"}`} onClick={bridge} loading={loading} disabled={!amount||Number(amount)<=0}/>
    </div>
  );
}

/* ─── SHARED ACTION BUTTON ───────────────────────────────────── */
function ArcBtn({label,onClick,loading,disabled}) {
  return (
    <button onClick={onClick} disabled={loading||disabled} style={{width:"100%",padding:"12px 0",background:"transparent",border:`1px solid ${disabled||loading?"rgba(0,255,176,.2)":"#00FFB0"}`,borderRadius:3,color:disabled||loading?"#1E5C3A":"#00FFB0",fontSize:11,fontWeight:700,cursor:disabled||loading?"not-allowed":"pointer",fontFamily:"monospace",letterSpacing:".18em",boxShadow:disabled||loading?"none":"0 0 18px rgba(0,255,176,.1)",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .2s",textTransform:"uppercase"}}
      onMouseEnter={e=>!disabled&&!loading&&(e.currentTarget.style.background="rgba(0,255,176,.08)")}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {loading?(<><span style={{width:13,height:13,border:"1.5px solid rgba(0,255,176,.2)",borderTop:"1.5px solid #00FFB0",borderRadius:"50%",animation:"spin .7s linear infinite",display:"inline-block"}}/>Processing...</>):label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH SCREENS
═══════════════════════════════════════════════════════════════════════════ */
function AuthCard({onAuth}) {
  const {connect}=useWeb3();
  const [screen,setScreen]=useState("login");
  const [showWC,setShowWC]=useState(false);
  const [loading,setLoading]=useState(false);
  const [localWallet,setLocalWallet]=useState(null);
  const [user,setUser]=useState(null);
  const [phase,setPhase]=useState("auth"); // auth | wallet | ready

  const [name,setName]=useState(""); const [email,setEmail]=useState("");
  const [pw,setPw]=useState(""); const [cpw,setCpw]=useState("");
  const [agreed,setAgreed]=useState(false); const [errors,setErrors]=useState({});

  const validate=()=>{const e={};if(screen==="signup"&&!name.trim())e.name="Required";if(!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))e.email="Invalid email";if(!pw||pw.length<8)e.pw="Min 8 chars";if(screen==="signup"){if(pw!==cpw)e.cpw="Mismatch";if(!agreed)e.agreed="Required";}return e;};

  const submit=async()=>{
    const e=validate(); if(Object.keys(e).length){setErrors(e);return;} setErrors({}); setLoading(true);
    await sleep(screen==="login"?1200:1600);
    setLoading(false);
    const u={name:name||email.split("@")[0],email};
    setUser(u);
    if(screen==="signup"){const w=generateLocalWallet();setLocalWallet(w);setPhase("wallet");}
    else{await connect("0x"+hex(40),"Email",false);onAuth(u);}
  };

  const handleWalletConnect=async({address,wallet:w})=>{
    setShowWC(false);setLoading(true);
    await connect(address,w.name,!!window.ethereum);
    setLoading(false);
    onAuth({name:w.name+" Operator",email:null});
  };

  if(phase==="wallet"&&localWallet) return <div style={{width:"100%",maxWidth:460,...cardStyle}}><WalletReveal wallet={localWallet} onContinue={async()=>{await connect(localWallet.address,"Email",false);onAuth(user);}}/></div>;

  return (
    <>
      {showWC&&<WCModal onClose={()=>setShowWC(false)} onConnect={handleWalletConnect}/>}
      <div style={{width:"100%",maxWidth:460,...cardStyle}}>
        {["tl","tr","bl","br"].map(p=><span key={p} style={{position:"absolute",zIndex:2,width:14,height:14,borderColor:"rgba(0,255,176,.25)",borderStyle:"solid",borderWidth:0,...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:{}),(p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:{}),...(p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{}),(p==="br"?{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}:{})}}/>)}

        <div style={{marginBottom:26}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <div style={{width:32,height:32,border:"1.5px solid #00FFB0",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:"#00FFB0",boxShadow:"0 0 12px rgba(0,255,176,.2)"}}>◈</div>
            <Glitch text="privARC" style={{fontSize:22,fontWeight:800,color:"#00FFB0",fontFamily:"'Syne',sans-serif",letterSpacing:"-.01em"}}/>
            <span style={{fontSize:9,color:"#0F3A22",fontFamily:"monospace",letterSpacing:".12em",alignSelf:"flex-end",paddingBottom:2}}>OS</span>
          </div>
          <p style={{fontSize:10,color:"#1E5C3A",fontFamily:"monospace",letterSpacing:".06em",lineHeight:1.6,maxWidth:340}}>Autonomous crypto OS for private on-chain capital management — AI agents on ARC Network.</p>
        </div>

        <div style={{display:"flex",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,overflow:"hidden",marginBottom:24}}>
          {["login","signup"].map(s=><button key={s} onClick={()=>{setScreen(s);setErrors({});}} style={{flex:1,padding:"9px 0",background:screen===s?"rgba(0,255,176,.08)":"transparent",border:"none",borderRight:s==="login"?"1px solid rgba(0,255,176,.1)":"none",color:screen===s?"#00FFB0":"#1E5C3A",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".15em",textTransform:"uppercase",transition:"all .2s"}}>
            {s==="login"?"[ AUTH ]":"[ REGISTER ]"}
          </button>)}
        </div>

        {screen==="login"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email}/>
            <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••••••" icon="⚿" error={errors.pw}/>
            <div style={{textAlign:"right",marginTop:-8,marginBottom:18}}><a href="#" style={{fontSize:9,color:"#1E5C3A",textDecoration:"none",fontFamily:"monospace",letterSpacing:".1em",transition:"color .2s"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>RECOVER ACCESS →</a></div>
            <ArcBtn label="⟶ Authenticate" onClick={submit} loading={loading}/>
            <Divider label="OR CONNECT WITH"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:8}}>
              {WALLETS.filter(w=>w.popular).map(w=>(
                <button key={w.id} onClick={()=>setShowWC(true)} style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:5,padding:"9px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=`${w.color}55`;e.currentTarget.style.background=`${w.color}0A`;e.currentTarget.style.boxShadow=`0 0 14px ${w.glow}`;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.08)";e.currentTarget.style.background="rgba(0,0,0,.3)";e.currentTarget.style.boxShadow="none";}}>
                  <div style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center"}}>{w.icon}</div>
                  <span style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>{w.name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setShowWC(true)} style={{width:"100%",padding:"9px 0",background:"transparent",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,color:"#0F3A22",fontSize:10,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:7}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.22)";e.currentTarget.style.color="#1E5C3A";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.08)";e.currentTarget.style.color="#0F3A22";}}>⬡ More wallets (8 supported)</button>
          </div>
        )}

        {screen==="signup"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            <OsField label="OPERATOR NAME" type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" icon="⊹" error={errors.name}/>
            <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email}/>
            <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 8 characters" icon="⚿" error={errors.pw}/>
            <PassStr pw={pw}/>
            <OsField label="CONFIRM PASSPHRASE" type="password" value={cpw} onChange={e=>setCpw(e.target.value)} placeholder="Repeat passphrase" icon="⚿" error={errors.cpw}/>
            <div style={{border:"1px solid rgba(0,255,176,.12)",borderRadius:3,background:"rgba(0,255,176,.02)",padding:"9px 11px",marginBottom:14}}>
              <div style={{fontSize:9,color:"#00FFB0",letterSpacing:".15em",fontFamily:"monospace",marginBottom:3}}>AUTO WALLET INIT</div>
              <p style={{fontSize:10,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>An ARC Network wallet will be generated. You'll receive your private key and 12-word recovery phrase.</p>
            </div>
            <div style={{marginBottom:errors.agreed?4:18}}>
              <label style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer"}}>
                <div onClick={()=>setAgreed(!agreed)} style={{width:15,height:15,border:`1px solid ${agreed?"#00FFB0":"rgba(0,255,176,.2)"}`,borderRadius:2,flexShrink:0,marginTop:1,background:agreed?"rgba(0,255,176,.12)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s",color:"#00FFB0",fontSize:10}}>{agreed&&"✓"}</div>
                <span style={{fontSize:10,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>I accept the <a href="#" style={{color:"#1E5C3A",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Terms</a> and <a href="#" style={{color:"#1E5C3A",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Privacy Policy</a></span>
              </label>
              {errors.agreed&&<div style={{fontSize:10,color:"#EF4444",fontFamily:"monospace",marginTop:3,marginLeft:24}}>Required</div>}
            </div>
            <ArcBtn label="⟶ Create account & wallet" onClick={submit} loading={loading}/>
            <Divider label="OR"/>
            <button onClick={()=>setShowWC(true)} style={{width:"100%",padding:"9px 0",background:"transparent",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,color:"#0F3A22",fontSize:10,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:7}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.22)";e.currentTarget.style.color="#1E5C3A";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.08)";e.currentTarget.style.color="#0F3A22";}}>⬡ Register with existing wallet</button>
          </div>
        )}

        <div style={{marginTop:22,paddingTop:12,borderTop:"1px solid rgba(0,255,176,.06)",display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:9,color:"#0A1F14",fontFamily:"monospace",letterSpacing:".08em"}}>🔒 EIP-4361 · Viem · ZK</span>
          <span style={{fontSize:9,color:"#0A1F14",fontFamily:"monospace",letterSpacing:".08em"}}>USDC FEES · ARC NETWORK</span>
        </div>
      </div>
    </>
  );
}

function Divider({label}) {
  return <div style={{margin:"18px 0 14px",display:"flex",alignItems:"center",gap:10}}><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/><span style={{fontSize:9,color:"#0A1F14",fontFamily:"monospace"}}>{label}</span><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/></div>;
}

const cardStyle={background:"rgba(0,8,5,.93)",backdropFilter:"blur(20px)",border:"1px solid rgba(0,255,176,.12)",borderRadius:4,boxShadow:"0 0 60px rgba(0,255,176,.04),0 40px 80px rgba(0,0,0,.8)",padding:"30px 30px 26px",position:"relative",animation:"fadeUp .6s ease forwards"};

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
function AppInner() {
  const [booted,setBooted]=useState(false);
  const [authedUser,setAuthedUser]=useState(null);
  const {account}=useWeb3();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#000A06;overflow-x:hidden;}
        input,select{font-family:'JetBrains Mono',monospace!important;}
        input::placeholder{color:#0A1F14!important;}
        select option{background:#000A06;color:#A7F3D0;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.9)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes g1{0%,89%,100%{opacity:0}90%{opacity:.8;transform:translateX(-3px)}95%{opacity:0;transform:translateX(3px)}}
        @keyframes g2{0%,93%,100%{opacity:0}94%{opacity:.6;transform:translateX(3px)}98%{opacity:0;transform:translateX(-2px)}}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-track{background:#000A06;}::-webkit-scrollbar-thumb{background:rgba(0,255,176,.2);border-radius:2px;}
      `}</style>
      <HexGrid/>
      {!booted&&<Boot onDone={()=>setBooted(true)}/>}
      <ChainBanner/>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",position:"relative",zIndex:1,opacity:booted?1:0,transition:"opacity .6s ease .2s"}}>
        {!authedUser
          ? <AuthCard onAuth={u=>setAuthedUser(u)}/>
          : <div style={{width:"100%",maxWidth:520,...cardStyle}}>
              {["tl","tr","bl","br"].map(p=><span key={p} style={{position:"absolute",zIndex:2,width:14,height:14,borderColor:"rgba(0,255,176,.25)",borderStyle:"solid",borderWidth:0,...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:{}),(p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:{}),...(p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{}),(p==="br"?{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}:{})}}/>)}
              <Dashboard user={authedUser}/>
            </div>
        }
      </div>
    </>
  );
}

export default function PrivARCOS() {
  return <Web3Provider><AppInner/></Web3Provider>;
}
