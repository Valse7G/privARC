import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo, useReducer } from "react";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const ARC = { id:7070, name:"ARC Network", hex:"0x1BA2", nativeCurrency:{name:"ARC",symbol:"ARC",decimals:18}, rpcUrls:{default:{http:["https://rpc.arcnetwork.io"]}}, blockExplorers:{default:{name:"ARCScan",url:"https://scan.arcnetwork.io"}} };
const ARC_TEST = {...ARC, id:7071, name:"ARC Testnet", hex:"0x1BA3" };
const CONTRACTS = { ShieldVault:"0x7f3A4e9C2b8D1F0a3E5c7b9D2e4F6A8c0B2d4E6f", NoteRegistry:"0x3A5c7E9b1D3f5A7c9E1b3D5f7A9c1E3b5D7f9A1c", VerifierZK:"0x9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D1f3A5c7E", FeeCollector:"0x1b3D5f7A9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D", Staking:"0xF3aC9b5d7A1c3E5b7D9f1A3c5E7b9D1f3A5c7E9b", Governance:"0xB9d1F3aC5E7b9D1f3A5c7E9b1D3f5A7c9E1b3D5f", USDC:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" };
const WL = ["abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse","access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act","action","actor","actress","actual","adapt","add","addict","address","adjust","admit","adult","advance"];

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const R  = (a,b) => Math.random()*(b-a)+a;
const Ri = (a,b) => Math.floor(R(a,b));
const hx = (n)  => Array.from({length:n},()=>"0123456789abcdef"[Ri(0,16)]).join("");
const sl = (ms) => new Promise(r=>setTimeout(r,ms));
const f6 = (v)  => (Number(v)/1e6).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fE = (v)  => (Number(v)/1e18).toFixed(4);
const sh = (a)  => a ? a.slice(0,8)+"···"+a.slice(-6) : "---";
const tc = ()   => { const n=new Date(); return [n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":"); };
const gW = ()   => ({ privateKey:"0x"+hx(64), address:"0x"+hx(40), mnemonic:Array.from({length:12},()=>WL[Ri(0,WL.length)]).join(" "), network:"ARC Network", created:new Date().toISOString() });

/* ═══════════════════════════════════════════════════════════════
   VIEM SIM
═══════════════════════════════════════════════════════════════ */
const mkPub = (chain) => ({
  chain,
  getBalance:     async () => { await sl(400); return BigInt(Math.floor(R(0.1,4.8)*1e18)); },
  readContract:   async ({functionName:fn}) => { await sl(250);
    if(fn==="balanceOf")          return BigInt(Math.floor(R(500,48000)*1e6));
    if(fn==="getShieldedBalance") return BigInt(Math.floor(R(0,11500)*1e6));
    if(fn==="getStaked")          return BigInt(Math.floor(R(0,5000)*1e6));
    if(fn==="getPendingRewards")  return BigInt(Math.floor(R(0,120)*1e6));
    if(fn==="getTVL")             return BigInt(18_450_000*1e6);
    if(fn==="getTotalShielded")   return BigInt(4_230_841*1e6);
    if(fn==="getAPY")             return 420n;
    if(fn==="getStakingAPY")      return 1280n;
    if(fn==="getVotingPower")     return BigInt(Math.floor(R(0,10000)*1e6));
    return 0n;
  },
  estimateGas:    async () => { await sl(150); return BigInt(Ri(160000,220000)); },
  getGasPrice:    async () => { await sl(100); return BigInt(Math.floor(R(0.8,2.5)*1e9)); },
  waitForTransactionReceipt: async (h) => { await sl(R(1800,3200)); return {transactionHash:h,status:"success",blockNumber:BigInt(8420141+Ri(0,200))}; },
});
const mkWal = (address) => ({
  account:{address},
  writeContract:  async () => { await sl(R(700,1400)); return "0x"+hx(64); },
  sendTransaction:async () => { await sl(R(800,1500)); return "0x"+hx(64); },
  signMessage:    async () => { await sl(300); return "0x"+hx(130); },
  switchChain:    async () => { await sl(500); return true; },
  addChain:       async () => { await sl(600); return true; },
});

/* ═══════════════════════════════════════════════════════════════
   LIVE PRICE ENGINE
═══════════════════════════════════════════════════════════════ */
const BASE_PRICES = { USDC:1.0001, WETH:2597.42, WBTC:64521.80, ARCt:0.2347, ARC:0.1832, DAI:0.9999, USDT:1.0000, BNB:412.50 };

function usePriceFeed() {
  const [prices, setPrices] = useState(BASE_PRICES);
  const [changes, setChanges] = useState({});
  useEffect(() => {
    const id = setInterval(() => {
      setPrices(prev => {
        const next = {};
        const chgs = {};
        Object.entries(prev).forEach(([k,v]) => {
          const delta = v * R(-0.0008, 0.0008);
          next[k] = Math.max(0.0001, v + delta);
          chgs[k] = delta;
        });
        setChanges(chgs);
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return { prices, changes };
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION SYSTEM
═══════════════════════════════════════════════════════════════ */
const NotifCtx = createContext(null);
function NotifProvider({ children }) {
  const [notifs, setNotifs] = useState([]);
  const push = useCallback((msg, type="info", link=null) => {
    const id = Date.now() + Math.random();
    setNotifs(p => [...p.slice(-8), { id, msg, type, link, ts: tc(), read: false }]);
    setTimeout(() => setNotifs(p => p.filter(n => n.id !== id)), 8000);
  }, []);
  const markRead = useCallback((id) => setNotifs(p => p.map(n => n.id===id ? {...n,read:true} : n)), []);
  const clearAll = useCallback(() => setNotifs([]), []);
  return <NotifCtx.Provider value={{notifs,push,markRead,clearAll}}>{children}</NotifCtx.Provider>;
}
const useNotif = () => useContext(NotifCtx);

/* ═══════════════════════════════════════════════════════════════
   WEB3 CONTEXT
═══════════════════════════════════════════════════════════════ */
const W3 = createContext(null);
function Web3Provider({ children }) {
  const [account,  setAccount]   = useState(null);
  const [pub,      setPub]       = useState(null);
  const [wal,      setWal]       = useState(null);
  const [chainOk,  setChainOk]   = useState(false);
  const [switching,setSwitching] = useState(false);
  const [testnet,  setTestnet]   = useState(false);

  const connect = useCallback(async (address, walletName, tryReal=false) => {
    let addr = address, cid = ARC.id;
    if (tryReal && window.ethereum) {
      try {
        const accs = await window.ethereum.request({method:"eth_requestAccounts"});
        if (accs?.[0]) {
          addr = accs[0];
          try {
            await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:ARC.hex}]});
          } catch(e) {
            if (e.code===4902) await window.ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:ARC.hex,chainName:ARC.name,nativeCurrency:ARC.nativeCurrency,rpcUrls:ARC.rpcUrls.default.http,blockExplorerUrls:[ARC.blockExplorers.default.url]}]});
          }
          cid = parseInt(await window.ethereum.request({method:"eth_chainId"}),16);
        }
      } catch(e) {}
    }
    const chain = testnet ? ARC_TEST : ARC;
    setPub(mkPub(chain)); setWal(mkWal(addr));
    setAccount({ address:addr, chainId:cid, walletName });
    setChainOk(cid === chain.id);
  }, [testnet]);

  const switchARC = useCallback(async () => {
    if (!wal || !account) return; setSwitching(true);
    try { await wal.switchChain({id:ARC.id}); setAccount(a=>({...a,chainId:ARC.id})); setChainOk(true); }
    finally { setSwitching(false); }
  }, [wal, account]);

  const disconnect = useCallback(() => { setAccount(null); setPub(null); setWal(null); setChainOk(false); }, []);
  const toggleTestnet = useCallback(() => setTestnet(t => !t), []);

  return <W3.Provider value={{account,pub,wal,chainOk,switching,testnet,connect,switchARC,disconnect,toggleTestnet}}>{children}</W3.Provider>;
}
const useW3 = () => useContext(W3);

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING TOUR
═══════════════════════════════════════════════════════════════ */
const TOUR_STEPS = [
  { target:"overview",  title:"Welcome to PrivARC OS",       body:"Your autonomous crypto OS for private on-chain capital. Let's take a quick tour.",                    icon:"◈" },
  { target:"shield",    title:"Shield — Deposit Privately",  body:"Deposit USDC into the ShieldVault. Funds are wrapped in ZK commitments — untraceable on-chain.",       icon:"🛡" },
  { target:"swap",      title:"Private Swap — ZK Routed",    body:"Swap assets without exposing amounts or addresses. Routed through the ZK relay layer.",                 icon:"⇄"  },
  { target:"analytics", title:"Analytics Dashboard",         body:"Live TVL charts, transaction heatmaps, and protocol metrics updated in real time.",                     icon:"📈" },
  { target:"zk",        title:"ZK Proof Console",            body:"Generate and verify Groth16 or PLONK zero-knowledge proofs directly from the OS.",                      icon:"🔐" },
  { target:"governance",title:"On-Chain Governance",         body:"Vote on protocol proposals with your veARC voting power. Shape the future of PrivARC.",                 icon:"🗳" },
  { target:"staking",   title:"Staking & Rewards",           body:"Stake USDC to earn yield and boost voting power. Lock multipliers up to 3x.",                          icon:"💎" },
  { target:"agents",    title:"8 AI Agents — Always On",     body:"ShieldAgent, ZKAgent, RiskAgent and 5 others run autonomously to protect and optimize your capital.",   icon:"🤖" },
];

function OnboardingTour({ onFinish }) {
  const [step, setStep] = useState(0);
  const s = TOUR_STEPS[step];
  const pct = ((step+1)/TOUR_STEPS.length)*100;
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:400,background:"rgba(0,8,5,.97)",border:"1px solid rgba(0,255,176,.25)",borderRadius:6,padding:"28px 28px 24px",boxShadow:"0 0 60px rgba(0,255,176,.08)",animation:"fu .3s ease"}}>
        {/* Progress */}
        <div style={{display:"flex",gap:4,marginBottom:20}}>
          {TOUR_STEPS.map((_,i)=><div key={i} style={{flex:1,height:2,borderRadius:1,background:i<=step?"#00FFB0":"rgba(0,255,176,.12)",transition:"background .3s"}}/>)}
        </div>
        {/* Icon */}
        <div style={{width:52,height:52,borderRadius:12,background:"rgba(0,255,176,.08)",border:"1.5px solid rgba(0,255,176,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,marginBottom:16,boxShadow:"0 0 20px rgba(0,255,176,.1)"}}>{s.icon}</div>
        {/* Content */}
        <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:5}}>STEP {step+1} / {TOUR_STEPS.length}</div>
        <div style={{fontSize:16,fontWeight:700,color:"#00FFB0",fontFamily:"'Syne',sans-serif",marginBottom:10,lineHeight:1.3}}>{s.title}</div>
        <p style={{fontSize:11,color:"#4ADE80",fontFamily:"monospace",lineHeight:1.6,marginBottom:20}}>{s.body}</p>
        {/* Actions */}
        <div style={{display:"flex",gap:8}}>
          <button onClick={onFinish} style={{flex:1,padding:"9px 0",background:"transparent",border:"1px solid rgba(0,255,176,.15)",borderRadius:3,color:"#1E5C3A",fontSize:9,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.color="#00FFB0";e.currentTarget.style.borderColor="rgba(0,255,176,.35)";}} onMouseLeave={e=>{e.currentTarget.style.color="#1E5C3A";e.currentTarget.style.borderColor="rgba(0,255,176,.15)";}}>SKIP TOUR</button>
          <button onClick={()=>{ if(step<TOUR_STEPS.length-1) setStep(s=>s+1); else onFinish(); }} style={{flex:2,padding:"9px 0",background:"transparent",border:"1px solid #00FFB0",borderRadius:3,color:"#00FFB0",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".14em",boxShadow:"0 0 16px rgba(0,255,176,.12)",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            {step<TOUR_STEPS.length-1?"NEXT →":"⟶ LAUNCH OS"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MICRO UI COMPONENTS
═══════════════════════════════════════════════════════════════ */
const Sp = ({sz=12,c="#00FFB0"}) => <span style={{width:sz,height:sz,border:`1.5px solid rgba(0,255,176,.2)`,borderTop:`1.5px solid ${c}`,borderRadius:"50%",animation:"spin .7s linear infinite",display:"inline-block",flexShrink:0}}/>;

function Glitch({ text, style }) {
  return <span style={{position:"relative",display:"inline-block",...style}}>
    <span style={{position:"relative",zIndex:1}}>{text}</span>
    <span style={{position:"absolute",top:0,left:0,color:"#00FFB0",opacity:0,animation:"g1 4s infinite",clipPath:"polygon(0 30%,100% 30%,100% 50%,0 50%)",transform:"translateX(-2px)"}}>{text}</span>
    <span style={{position:"absolute",top:0,left:0,color:"#0EA5E9",opacity:0,animation:"g2 4s infinite",clipPath:"polygon(0 60%,100% 60%,100% 80%,0 80%)",transform:"translateX(2px)"}}>{text}</span>
  </span>;
}

function ArcBtn({ label, onClick, loading, disabled, color="#00FFB0", small=false }) {
  return <button onClick={onClick} disabled={loading||disabled} style={{width:"100%",padding:small?"8px 0":"11px 0",background:"transparent",border:`1px solid ${disabled||loading?"rgba(0,255,176,.18)":color}`,borderRadius:3,color:disabled||loading?"#1E5C3A":color,fontSize:small?9:10,fontWeight:700,cursor:disabled||loading?"not-allowed":"pointer",fontFamily:"monospace",letterSpacing:".16em",boxShadow:disabled||loading?"none":`0 0 16px ${color}18`,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .2s",textTransform:"uppercase"}}
    onMouseEnter={e=>!disabled&&!loading&&(e.currentTarget.style.background=`${color}0F`)}
    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
    {loading?<><Sp/> Processing...</>:label}
  </button>;
}

function OsField({ label, type="text", value, onChange, placeholder, icon, error, readOnly, suffix, hint }) {
  const [foc,setFoc] = useState(false);
  const [sp,setSp]   = useState(false);
  const isP = type==="password";
  return <div style={{marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
      <label style={{fontSize:9,fontWeight:700,letterSpacing:".13em",textTransform:"uppercase",color:foc?"#00FFB0":"#1E5C3A",fontFamily:"monospace",transition:"color .2s"}}>{icon&&<span style={{marginRight:3}}>{icon}</span>}{label}</label>
      {error&&<span style={{fontSize:9,color:"#EF4444"}}>⚠ {error}</span>}
    </div>
    <div style={{position:"relative"}}>
      {["tl","tr","bl","br"].map(p=><span key={p} style={{position:"absolute",zIndex:2,width:5,height:5,borderColor:foc?"#00FFB0":error?"#EF4444":"#1A4A30",borderStyle:"solid",borderWidth:0,transition:"border-color .2s",...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5})}}/>)}
      <input type={isP&&!sp?"password":"text"} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly} onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
        style={{width:"100%",boxSizing:"border-box",padding:`9px ${suffix?"56px":"32px"} 9px 11px`,background:foc?"rgba(0,255,176,.03)":readOnly?"rgba(0,255,176,.01)":"rgba(0,0,0,.4)",border:`1px solid ${error?"#EF4444":foc?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`,borderRadius:3,color:"#A7F3D0",fontSize:11,fontFamily:"monospace",outline:"none",letterSpacing:".04em",transition:"all .2s",cursor:readOnly?"default":"text"}}/>
      {suffix&&<span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",fontSize:9,color:"#1E5C3A",fontFamily:"monospace",pointerEvents:"none"}}>{suffix}</span>}
      {isP&&<button onClick={()=>setSp(!sp)} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:sp?"#00FFB0":"#1E5C3A",fontSize:12,padding:0}}>{sp?"◉":"◎"}</button>}
    </div>
    {hint&&!error&&<div style={{marginTop:2,fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>{hint}</div>}
  </div>;
}

const PH = ({icon,title,sub}) => <div style={{marginBottom:12}}>
  <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:1}}>▸ {icon} {title}</div>
  <div style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>{sub}</div>
  <div style={{width:"100%",height:1,background:"rgba(0,255,176,.07)",marginTop:6}}/>
</div>;

const IG = ({items}) => <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(items.length,4)},1fr)`,gap:4,marginBottom:10}}>
  {items.map(([k,v,s],i)=><div key={i} style={{background:"rgba(0,0,0,.3)",borderRadius:3,padding:"6px 8px"}}>
    <div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",marginBottom:2}}>{k}</div>
    <div style={{fontSize:9,color:"#4ADE80",fontFamily:"monospace"}}>{v}</div>
    {s&&<div style={{fontSize:7,color:"#0A1F14",fontFamily:"monospace"}}>{s}</div>}
  </div>)}
</div>;

/* ═══════════════════════════════════════════════════════════════
   LIVE PRICE TICKER
═══════════════════════════════════════════════════════════════ */
function PriceTicker({ prices, changes }) {
  const TOKENS = ["USDC","WETH","WBTC","ARCt","BNB"];
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pos = 0;
    const id = setInterval(() => {
      pos -= 1;
      if (pos < -el.scrollWidth/2) pos = 0;
      el.style.transform = `translateX(${pos}px)`;
    }, 20);
    return () => clearInterval(id);
  }, []);
  const items = [...TOKENS, ...TOKENS]; // duplicate for seamless loop
  return (
    <div style={{overflow:"hidden",background:"rgba(0,0,0,.4)",borderBottom:"1px solid rgba(0,255,176,.06)",height:22,display:"flex",alignItems:"center"}}>
      <div ref={ref} style={{display:"flex",gap:0,whiteSpace:"nowrap",willChange:"transform"}}>
        {items.map((t,i) => {
          const p = prices[t] || 0;
          const c = changes[t] || 0;
          const up = c >= 0;
          return <span key={i} style={{fontSize:9,fontFamily:"monospace",padding:"0 16px",color:"#A7F3D0",borderRight:"1px solid rgba(0,255,176,.06)"}}>
            <span style={{color:"#1E5C3A",marginRight:4}}>{t}</span>
            <span style={{color:up?"#00FFB0":"#EF4444"}}>${p<10?p.toFixed(4):p<1000?p.toFixed(2):p.toFixed(0)}</span>
            <span style={{color:up?"#00FFB0":"#EF4444",marginLeft:4,fontSize:8}}>{up?"▲":"▼"}{Math.abs(c/p*100).toFixed(3)}%</span>
          </span>;
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CENTER
═══════════════════════════════════════════════════════════════ */
function NotifCenter({ onClose }) {
  const { notifs, markRead, clearAll } = useNotif();
  const COLS = { info:"#0EA5E9", success:"#00FFB0", warn:"#F59E0B", error:"#EF4444" };
  return (
    <div style={{position:"absolute",top:44,right:12,width:300,background:"rgba(0,8,5,.97)",border:"1px solid rgba(0,255,176,.18)",borderRadius:5,zIndex:200,boxShadow:"0 20px 60px rgba(0,0,0,.8)",animation:"fu .2s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px 8px",borderBottom:"1px solid rgba(0,255,176,.08)"}}>
        <span style={{fontSize:9,color:"#00FFB0",fontFamily:"monospace",letterSpacing:".15em",fontWeight:700}}>NOTIFICATIONS</span>
        <button onClick={clearAll} style={{fontSize:8,color:"#1E5C3A",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"color .2s"}} onMouseEnter={e=>e.target.style.color="#EF4444"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>CLEAR ALL</button>
      </div>
      <div style={{maxHeight:300,overflow:"auto"}}>
        {notifs.length===0 ? (
          <div style={{padding:"20px 14px",textAlign:"center",fontSize:9,color:"#0F3A22",fontFamily:"monospace"}}>No notifications</div>
        ) : [...notifs].reverse().map(n => (
          <div key={n.id} onClick={()=>markRead(n.id)} style={{padding:"9px 14px",borderBottom:"1px solid rgba(0,255,176,.04)",cursor:"pointer",background:n.read?"transparent":"rgba(0,255,176,.02)",transition:"background .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.04)"} onMouseLeave={e=>e.currentTarget.style.background=n.read?"transparent":"rgba(0,255,176,.02)"}>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:COLS[n.type]||"#00FFB0",boxShadow:`0 0 4px ${COLS[n.type]||"#00FFB0"}`,flexShrink:0,marginTop:3}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:"#A7F3D0",fontFamily:"monospace",lineHeight:1.4}}>{n.msg}</div>
                {n.link&&<a href={n.link} target="_blank" style={{fontSize:8,color:"#00FFB0",fontFamily:"monospace",textDecoration:"none"}}>View ↗</a>}
                <div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",marginTop:2}}>{n.ts}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{padding:"8px 14px",borderTop:"1px solid rgba(0,255,176,.06)"}}>
        <button onClick={onClose} style={{width:"100%",padding:"6px 0",background:"transparent",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,color:"#1E5C3A",fontSize:8,cursor:"pointer",fontFamily:"monospace",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(0,255,176,.3)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(0,255,176,.1)"}>CLOSE</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLOBAL SEARCH
═══════════════════════════════════════════════════════════════ */
const SEARCH_INDEX = [
  {label:"Shield Assets",        panel:"shield",    icon:"🛡",  desc:"Deposit USDC into private vault"},
  {label:"Private Swap",         panel:"swap",      icon:"⇄",   desc:"ZK-routed token exchange"},
  {label:"Private Send",         panel:"send",      icon:"↗",   desc:"Stealth address transfer"},
  {label:"Withdraw Funds",       panel:"withdraw",  icon:"↙",   desc:"Exit to public address"},
  {label:"Bridge Cross-chain",   panel:"bridge",    icon:"⟺",  desc:"Transfer to ETH, BNB, Polygon…"},
  {label:"Analytics Dashboard",  panel:"analytics", icon:"📈",  desc:"TVL, charts, heatmaps"},
  {label:"ZK Proof Console",     panel:"zk",        icon:"🔐",  desc:"Groth16 & PLONK proofs"},
  {label:"Governance Proposals", panel:"governance",icon:"🗳",  desc:"Vote on PIP proposals"},
  {label:"Staking & Rewards",    panel:"staking",   icon:"💎",  desc:"Stake USDC, earn yield"},
  {label:"Portfolio View",       panel:"portfolio", icon:"📊",  desc:"Asset allocation & prices"},
  {label:"AI Agent Console",     panel:"agents",    icon:"🤖",  desc:"8 autonomous on-chain agents"},
  {label:"Transaction History",  panel:"history",   icon:"📋",  desc:"On-chain activity log"},
  {label:"Settings",             panel:"settings",  icon:"⚙",   desc:"Network & interface config"},
  {label:"Overview",             panel:"overview",  icon:"◈",   desc:"Dashboard home"},
];

function GlobalSearch({ onSelect, onClose }) {
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const results = q.trim() ? SEARCH_INDEX.filter(i => i.label.toLowerCase().includes(q.toLowerCase()) || i.desc.toLowerCase().includes(q.toLowerCase())) : SEARCH_INDEX;
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:80}}>
      <div style={{width:"100%",maxWidth:480,background:"rgba(0,8,5,.98)",border:"1px solid rgba(0,255,176,.2)",borderRadius:6,overflow:"hidden",boxShadow:"0 30px 80px rgba(0,0,0,.9)",animation:"fu .2s ease"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid rgba(0,255,176,.08)"}}>
          <span style={{color:"#1E5C3A",fontSize:14}}>⌕</span>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search panels, features, actions..." style={{flex:1,background:"none",border:"none",outline:"none",color:"#A7F3D0",fontSize:13,fontFamily:"monospace"}}
            onKeyDown={e=>{ if(e.key==="Escape") onClose(); if(e.key==="Enter"&&results[0]) onSelect(results[0].panel); }}/>
          <button onClick={onClose} style={{color:"#1E5C3A",background:"none",border:"none",cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>ESC</button>
        </div>
        <div style={{maxHeight:360,overflow:"auto"}}>
          {results.map((r,i)=>(
            <div key={i} onClick={()=>onSelect(r.panel)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",cursor:"pointer",borderBottom:"1px solid rgba(0,255,176,.03)",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:18,flexShrink:0}}>{r.icon}</span>
              <div>
                <div style={{fontSize:11,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{r.label}</div>
                <div style={{fontSize:9,color:"#0F3A22",fontFamily:"monospace",marginTop:1}}>{r.desc}</div>
              </div>
              <span style={{marginLeft:"auto",fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>→</span>
            </div>
          ))}
        </div>
        <div style={{padding:"8px 16px",borderTop:"1px solid rgba(0,255,176,.06)",display:"flex",gap:12}}>
          {[["↵","Select"],["ESC","Close"],["▲▼","Navigate"]].map(([k,l])=><span key={k} style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}><span style={{background:"rgba(0,255,176,.08)",border:"1px solid rgba(0,255,176,.15)",borderRadius:2,padding:"1px 5px",marginRight:4,color:"#1E5C3A"}}>{k}</span>{l}</span>)}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TX TOAST
═══════════════════════════════════════════════════════════════ */
function TxToast({ tx, onClose }) {
  useEffect(() => { if(tx?.status==="success"||tx?.status==="error") { const id=setTimeout(onClose,6000); return()=>clearTimeout(id); } }, [tx]);
  if (!tx) return null;
  const C={pending:"#F59E0B",success:"#00FFB0",error:"#EF4444"};
  const I={pending:"⏳",success:"✓",error:"✕"};
  return <div style={{position:"fixed",bottom:20,right:20,zIndex:500,background:"rgba(0,8,5,.97)",border:`1px solid ${C[tx.status]}33`,borderRadius:5,padding:"11px 14px",minWidth:270,maxWidth:330,fontFamily:"monospace",animation:"fu .3s ease",backdropFilter:"blur(12px)",boxShadow:`0 0 22px ${C[tx.status]}12`}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:9}}>
      <span style={{fontSize:13,color:C[tx.status],flexShrink:0}}>{I[tx.status]}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,color:C[tx.status],fontWeight:700,letterSpacing:".08em",marginBottom:2}}>{tx.label}</div>
        <div style={{fontSize:8,color:"#1E5C3A",lineHeight:1.5}}>{tx.message}</div>
        {tx.hash&&<a href={`${ARC.blockExplorers.default.url}/tx/${tx.hash}`} target="_blank" style={{fontSize:8,color:"#00FFB0",textDecoration:"none",display:"block",marginTop:2}}>{tx.hash.slice(0,18)}···  ↗</a>}
      </div>
      <button onClick={onClose} style={{background:"none",border:"none",color:"#1E5C3A",cursor:"pointer",fontSize:10,padding:0,flexShrink:0}}>✕</button>
    </div>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════ */
function Boot({ onDone }) {
  const [lines,setLines]=useState([]); const [done,setDone]=useState(false);
  const BL = [{t:0,c:"#00FFB0",m:"PRIVARC OS v3.0.0  ——  ARC Network"},{t:240,c:"#4ADE80",m:"Viem client + wagmi adapter  ✓"},{t:480,c:"#4ADE80",m:"ZK engine [Groth16 + PLONK]  ✓"},{t:720,c:"#4ADE80",m:"ARC Network RPC  chainId:7070  ✓"},{t:960,c:"#4ADE80",m:"All contracts loaded  ✓"},{t:1200,c:"#00FFB0",m:"AI Agent cluster  8/8 ONLINE"},{t:1440,c:"#4ADE80",m:"Live price feed  active"},{t:1680,c:"#4ADE80",m:"Push notification system  ready"},{t:1920,c:"#F59E0B",m:"Privacy layer  ARMED"},{t:2200,c:"#00FFB0",m:"━━━  PRIVARC OS v3 READY  ━━━"}];
  useEffect(()=>{ BL.forEach(({t,c,m})=>setTimeout(()=>setLines(p=>[...p,{c,m}]),t)); setTimeout(()=>{setDone(true);setTimeout(onDone,500);},2800); },[]);
  return <div style={{position:"fixed",inset:0,zIndex:300,background:"#000A06",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 10vw",fontFamily:"monospace",opacity:done?0:1,transition:"opacity .5s",pointerEvents:done?"none":"all"}}>
    <div style={{marginBottom:20}}><div style={{fontSize:9,color:"#1A4A30",letterSpacing:".3em",marginBottom:5}}>PRIVARC AUTONOMOUS CRYPTO OPERATING SYSTEM v3.0.0</div><div style={{width:40,height:1.5,background:"#00FFB0",marginBottom:16}}/></div>
    {lines.map((l,i)=><div key={i} style={{fontSize:11,color:l.c,marginBottom:4,letterSpacing:".05em",lineHeight:1.6,animation:"fi .3s ease"}}><span style={{color:"#1A4A30",marginRight:8}}>[{String(i).padStart(2,"0")}]</span>{l.m}</div>)}
    {lines.length>0&&<div style={{marginTop:14,height:1.5,background:"#0A2018",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:0,height:"100%",background:"linear-gradient(90deg,#00FFB0,#0EA5E9)",width:`${Math.min(100,(lines.length/BL.length)*100)}%`,transition:"width .24s",boxShadow:"0 0 6px #00FFB0"}}/></div>}
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   CHAIN BANNER
═══════════════════════════════════════════════════════════════ */
function ChainBanner() {
  const {chainOk,switchARC,switching,account}=useW3();
  if (!account||chainOk) return null;
  return <div style={{position:"fixed",top:0,left:0,right:0,zIndex:150,background:"rgba(245,158,11,.1)",borderBottom:"1px solid rgba(245,158,11,.3)",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"monospace",backdropFilter:"blur(8px)"}}>
    <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{color:"#F59E0B"}}>⚠</span><span style={{fontSize:10,color:"#FCD34D"}}>Wrong network — requires <b>ARC Network (7070)</b></span></div>
    <button onClick={switchARC} disabled={switching} style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.4)",borderRadius:3,color:"#F59E0B",fontSize:9,padding:"4px 10px",cursor:"pointer",fontFamily:"monospace",display:"flex",alignItems:"center",gap:6}}>{switching?<><Sp c="#F59E0B" sz={10}/>Switching...</>:"⟶ SWITCH TO ARC"}</button>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   HEX GRID
═══════════════════════════════════════════════════════════════ */
function HexGrid() {
  const ref=useRef(null);
  useEffect(()=>{
    const c=ref.current,ctx=c.getContext("2d"); let raf,t=0;
    const rz=()=>{c.width=window.innerWidth;c.height=window.innerHeight;};
    rz(); window.addEventListener("resize",rz);
    const draw=()=>{ t+=.007; ctx.clearRect(0,0,c.width,c.height); const g=ctx.createRadialGradient(c.width*.5,c.height*.4,0,c.width*.5,c.height*.4,c.width*.7); g.addColorStop(0,"rgba(0,18,10,1)");g.addColorStop(1,"rgba(0,6,4,1)");ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height); const RR=36,cols=Math.ceil(c.width/(RR*1.73))+2,rows=Math.ceil(c.height/(RR*1.5))+2; for(let row=-1;row<rows;row++)for(let col=-1;col<cols;col++){const x=col*RR*1.73+(row%2===0?0:RR*.865),y=row*RR*1.5,d=Math.sqrt((x-c.width*.5)**2+(y-c.height*.4)**2),w=Math.sin(d*.011-t*1.6)*.5+.5,p=Math.sin(t*.6+col*.3+row*.5)*.3+.3,alpha=w*p*.35; ctx.beginPath();for(let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6;i===0?ctx.moveTo(x+RR*.95*Math.cos(a),y+RR*.95*Math.sin(a)):ctx.lineTo(x+RR*.95*Math.cos(a),y+RR*.95*Math.sin(a));}ctx.closePath();if(alpha>.16){ctx.fillStyle=`rgba(0,255,160,${alpha*.05})`;ctx.fill();}ctx.strokeStyle=`rgba(0,255,180,${alpha})`;ctx.lineWidth=.5;ctx.stroke();} for(let y=0;y<c.height;y+=3){ctx.fillStyle="rgba(0,0,0,0.05)";ctx.fillRect(0,y,c.width,1);} raf=requestAnimationFrame(draw); };
    draw(); return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",rz);};
  },[]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}/>;
}

/* ═══════════════════════════════════════════════════════════════
   WALLET CONNECT
═══════════════════════════════════════════════════════════════ */
const WALLETS=[
  {id:"metamask",name:"MetaMask",popular:true,color:"#E2761B",glow:"rgba(226,118,27,.3)",installed:()=>!!window.ethereum?.isMetaMask,icon:<svg viewBox="0 0 40 40" width="26" height="26"><path d="M36.4 3L22.3 13.3l2.6-6.1z" fill="#E17726"/><path d="M3.6 3l14 10.4-2.5-6.2z" fill="#E27625"/><path d="M12.3 18.1l-2.2 3.4 7.9.4-.3-8.5z" fill="#E27625"/><path d="M27.7 18.1l-5.5-4.8-.3 8.6 7.9-.4z" fill="#E27625"/><path d="M22.1 21.9l.5-8.6-2.3-6.2h-4.6l-2.3 6.2.5 8.6.2 2.6v6.1h3.8l.1-6.1z" fill="#F5841F"/></svg>},
  {id:"rabby",name:"Rabby",popular:true,color:"#7B68EE",glow:"rgba(123,104,238,.3)",installed:()=>!!window.ethereum?.isRabby,icon:<svg viewBox="0 0 40 40" width="26" height="26"><rect width="40" height="40" rx="10" fill="#7B68EE"/><ellipse cx="20" cy="19" rx="12" ry="10" fill="white" opacity=".95"/><circle cx="15" cy="17" r="2.5" fill="#7B68EE"/><circle cx="25" cy="17" r="2.5" fill="#7B68EE"/><path d="M15 22 Q20 26 25 22" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>},
  {id:"wc",name:"WalletConnect",popular:true,color:"#3B99FC",glow:"rgba(59,153,252,.3)",installed:()=>true,icon:<svg viewBox="0 0 40 40" width="26" height="26"><rect width="40" height="40" rx="10" fill="#3B99FC"/><path d="M11 16c5-5 13-5 18 0l.6.6c.2.2.2.5 0 .7L28 19c-.1.1-.3.1-.4 0l-.8-.8C24 15 16 15 13 18.2l-.8.8c-.1.1-.3.1-.4 0L10 17.3c-.2-.2-.2-.5 0-.7z" fill="white"/><path d="M30 18l1.6 1.6c.2.2.2.5 0 .7L24 28c-.2.2-.5.2-.7 0l-5.3-5.3c-.1-.1-.2-.1-.3 0L12.4 28c-.2.2-.5.2-.7 0L4 20.3c-.2-.2-.2-.5 0-.7L5.6 18c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0l5.3-5.3c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0L29.3 18c.2-.2.5-.2.7 0z" fill="white"/></svg>},
  {id:"coinbase",name:"Coinbase",popular:true,color:"#0052FF",glow:"rgba(0,82,255,.3)",installed:()=>!!window.ethereum?.isCoinbaseWallet,icon:<svg viewBox="0 0 40 40" width="26" height="26"><rect width="40" height="40" rx="10" fill="#0052FF"/><circle cx="20" cy="20" r="11" fill="white"/><rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF"/></svg>},
  {id:"trust",name:"Trust Wallet",popular:false,color:"#3375BB",glow:"rgba(51,117,187,.3)",installed:()=>!!window.ethereum?.isTrust,icon:<svg viewBox="0 0 40 40" width="26" height="26"><rect width="40" height="40" rx="10" fill="#3375BB"/><path d="M20 8L30 12v9c0 5.5-4.5 10-10 11C9.5 31 5 26.5 5 21v-9z" fill="white" opacity=".9"/><path d="M16 20l3 3 5-6" stroke="#3375BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>},
  {id:"okx",name:"OKX Wallet",popular:false,color:"#111",glow:"rgba(255,255,255,.1)",installed:()=>!!window.okxwallet,icon:<svg viewBox="0 0 40 40" width="26" height="26"><rect width="40" height="40" rx="10" fill="#111"/><rect x="8" y="8" width="10" height="10" rx="2" fill="white"/><rect x="22" y="8" width="10" height="10" rx="2" fill="white"/><rect x="8" y="22" width="10" height="10" rx="2" fill="white"/><rect x="22" y="22" width="10" height="10" rx="2" fill="white"/></svg>},
  {id:"tp",name:"TokenPocket",popular:false,color:"#2980FE",glow:"rgba(41,128,254,.3)",installed:()=>!!window.ethereum?.isTokenPocket,icon:<svg viewBox="0 0 40 40" width="26" height="26"><rect width="40" height="40" rx="10" fill="#2980FE"/><rect x="8" y="12" width="24" height="6" rx="3" fill="white" opacity=".9"/><rect x="8" y="22" width="16" height="6" rx="3" fill="white" opacity=".6"/></svg>},
  {id:"brave",name:"Brave",popular:false,color:"#FF5000",glow:"rgba(255,80,0,.3)",installed:()=>!!window.ethereum?.isBraveWallet,icon:<svg viewBox="0 0 40 40" width="26" height="26"><rect width="40" height="40" rx="10" fill="#FF5000"/><path d="M20 7L28 11 31 20 26 29 20 33 14 29 9 20 12 11z" fill="white" opacity=".9"/><circle cx="20" cy="20" r="3" fill="#FF5000"/></svg>},
];

function WCModal({ onClose, onConnect }) {
  const [step,setStep]=useState("list"); const [sel,setSel]=useState(null); const [addr,setAddr]=useState("");
  const go=async(w)=>{ setSel(w);setStep("conn");await sl(900+Math.random()*700);setAddr("0x"+hx(40));setStep("sign"); };
  const sign=async()=>{ setStep("conn");await sl(800);setStep("ok");setTimeout(()=>onConnect({address:addr,wallet:sel}),900); };
  return <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,zIndex:250,background:"rgba(0,0,0,.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fi .2s ease"}}>
    <div style={{width:"100%",maxWidth:380,background:"rgba(0,8,5,.97)",border:"1px solid rgba(0,255,176,.2)",borderRadius:6,overflow:"hidden",animation:"fu .25s ease",boxShadow:"0 40px 80px rgba(0,0,0,.9)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px 11px",borderBottom:"1px solid rgba(0,255,176,.08)"}}><div><div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:2}}>WALLET CONNECTION</div><div style={{fontSize:12,fontWeight:700,color:"#00FFB0",fontFamily:"monospace"}}>{step==="list"?"Select Provider":step==="conn"?`Connecting ${sel?.name||""}...`:step==="sign"?"Sign Request":"Connected ✓"}</div></div><button onClick={onClose} style={{background:"none",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,color:"#1E5C3A",width:25,height:25,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.3)";e.currentTarget.style.color="#00FFB0";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.1)";e.currentTarget.style.color="#1E5C3A";}}>✕</button></div>
      <div style={{padding:"14px 16px 16px"}}>
        {step==="list"&&<div style={{animation:"fi .3s ease"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".16em",fontFamily:"monospace",marginBottom:7}}>▸ POPULAR</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:10}}>{WALLETS.filter(w=>w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>go(w)}/>)}</div><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".16em",fontFamily:"monospace",marginBottom:7}}>▸ MORE</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>{WALLETS.filter(w=>!w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>go(w)}/>)}</div><div style={{marginTop:10,paddingTop:8,borderTop:"1px solid rgba(0,255,176,.05)",fontSize:7,color:"#0A1F14",fontFamily:"monospace",textAlign:"center"}}>EIP-4361 · ARC Network</div></div>}
        {step==="conn"&&sel&&<div style={{textAlign:"center",padding:"16px 0",animation:"fi .3s ease"}}><div style={{position:"relative",width:64,height:64,margin:"0 auto 12px"}}><div style={{width:64,height:64,borderRadius:"50%",border:`2px solid ${sel.color}22`,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel.icon}</div><svg style={{position:"absolute",inset:0,animation:"spin 1.2s linear infinite"}} width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="none" stroke={sel.color} strokeWidth="1.5" strokeDasharray="48 140" strokeLinecap="round"/></svg></div><div style={{fontSize:11,color:"#A7F3D0",fontFamily:"monospace"}}>Opening {sel.name}...</div></div>}
        {step==="sign"&&sel&&<div style={{animation:"fi .3s ease"}}><div style={{display:"flex",alignItems:"center",gap:9,marginBottom:12}}><div style={{width:34,height:34,borderRadius:6,background:`${sel.color}15`,border:`1px solid ${sel.color}33`,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel.icon}</div><div><div style={{fontSize:11,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{sel.name}</div><div style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>{sh(addr)}</div></div><div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 5px #00FFB0"}}/><span style={{fontSize:8,color:"#00FFB0",fontFamily:"monospace"}}>LINKED</span></div></div><div style={{background:"rgba(0,0,0,.4)",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,padding:"10px 12px",marginBottom:12,fontFamily:"monospace"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".15em",marginBottom:5}}>EIP-4361 SIGNATURE REQUEST</div>{[["Domain","privarc.io"],["Address",sh(addr)],["Chain","ARC Network (7070)"],["Nonce",hx(8)],["Issued",new Date().toISOString().split("T")[0]]].map(([k,v])=><div key={k} style={{display:"flex",gap:8,marginBottom:3}}><span style={{fontSize:9,color:"#0F3A22",minWidth:48}}>{k}:</span><span style={{fontSize:9,color:"#4ADE80"}}>{v}</span></div>)}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}><button onClick={onClose} style={{padding:"9px 0",background:"transparent",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,color:"#1E5C3A",fontSize:9,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.color="#00FFB0";e.currentTarget.style.borderColor="rgba(0,255,176,.3)"}} onMouseLeave={e=>{e.currentTarget.style.color="#1E5C3A";e.currentTarget.style.borderColor="rgba(0,255,176,.1)"}}>CANCEL</button><button onClick={sign} style={{padding:"9px 0",background:"transparent",border:"1px solid #00FFB0",borderRadius:3,color:"#00FFB0",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",boxShadow:"0 0 10px rgba(0,255,176,.1)",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ SIGN & ENTER</button></div></div>}
        {step==="ok"&&sel&&<div style={{textAlign:"center",padding:"14px 0",animation:"fi .4s ease"}}><div style={{width:56,height:56,borderRadius:"50%",background:"rgba(0,255,176,.08)",border:"2px solid #00FFB0",boxShadow:"0 0 20px rgba(0,255,176,.18)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:20,color:"#00FFB0"}}>✓</div><div style={{fontSize:12,color:"#00FFB0",fontFamily:"monospace",fontWeight:700}}>Authentication Successful</div></div>}
      </div>
    </div>
  </div>;
}
function WBtn({ w, onClick }) {
  const [h,setH]=useState(false); const inst=w.installed();
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:h?`${w.color}0D`:"rgba(0,0,0,.3)",border:`1px solid ${h?w.color+"44":"rgba(0,255,176,.07)"}`,borderRadius:5,padding:"8px",cursor:"pointer",display:"flex",alignItems:"center",gap:7,transition:"all .2s",boxShadow:h?`0 0 12px ${w.glow}`:"none"}}>
    <div style={{width:30,height:30,borderRadius:6,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:h?`${w.color}18`:"rgba(255,255,255,.04)",transition:"all .2s"}}>{w.icon}</div>
    <div style={{minWidth:0}}><div style={{fontSize:10,color:h?"#E2F8FF":"#A7F3D0",fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{w.name}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",display:"flex",alignItems:"center",gap:3,marginTop:1}}>{inst&&<span style={{color:"#00FFB0",fontSize:7}}>●</span>}{inst?"Detected":"Available"}</div></div>
  </button>;
}

/* ═══════════════════════════════════════════════════════════════
   WALLET REVEAL
═══════════════════════════════════════════════════════════════ */
function WalletReveal({ wallet, onContinue }) {
  const [phase,setPhase]=useState(0); const [cp,setCp]=useState({}); const [showM,setShowM]=useState(false); const [showP,setShowP]=useState(false); const [prog,setProg]=useState(0);
  const STEPS=["Sampling /dev/urandom entropy...","Deriving secp256k1 keypair...","Computing ARC address hash...","Encoding BIP-39 mnemonic...","Registering stealth keys...","Linking to PrivARC account...","WALLET READY"];
  useEffect(()=>{ const s=[0,15,35,55,72,88,100]; let i=0; const id=setInterval(()=>{ i++;setProg(s[i]||100);if(i>=s.length-1){clearInterval(id);setTimeout(()=>setPhase(1),350);} },260); return()=>clearInterval(id); },[]);
  const copy=(k,t)=>{ navigator.clipboard.writeText(t).catch(()=>{}); setCp(p=>({...p,[k]:true})); setTimeout(()=>setCp(p=>({...p,[k]:false})),2000); };
  const Row=({label,value,k,blur,rev,onRev})=><div style={{marginBottom:9}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".13em",fontFamily:"monospace",marginBottom:3,textTransform:"uppercase"}}>{label}</div><div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,padding:"7px 9px"}}><span style={{flex:1,fontSize:10,fontFamily:"monospace",color:"#A7F3D0",wordBreak:"break-all",lineHeight:1.4,filter:blur&&!rev?"blur(4px)":"none",transition:"filter .3s",userSelect:blur&&!rev?"none":"text"}}>{value}</span>{blur&&<button onClick={onRev} style={{background:"none",border:"1px solid rgba(0,255,176,.2)",borderRadius:2,color:"#00FFB0",fontSize:7,padding:"2px 4px",cursor:"pointer",fontFamily:"monospace",flexShrink:0}}>{rev?"HIDE":"SHOW"}</button>}<button onClick={()=>copy(k,value)} style={{background:"none",border:"1px solid rgba(0,255,176,.12)",borderRadius:2,color:cp[k]?"#00FFB0":"#1E5C3A",fontSize:7,padding:"2px 4px",cursor:"pointer",fontFamily:"monospace",flexShrink:0,transition:"color .2s"}}>{cp[k]?"✓":"COPY"}</button></div></div>;
  if(phase===0) return <div><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:14}}><div style={{width:7,height:7,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 9px #00FFB0",animation:"pulse 1s infinite"}}/><span style={{fontSize:10,color:"#00FFB0",letterSpacing:".15em",fontFamily:"monospace"}}>GENERATING WALLET</span></div>{STEPS.slice(0,Math.ceil((prog/100)*STEPS.length)).map((s,i)=><div key={i} style={{fontSize:9,color:i===Math.ceil((prog/100)*STEPS.length)-1?"#A7F3D0":"#1E5C3A",marginBottom:4,fontFamily:"monospace",animation:"fi .3s ease"}}><span style={{color:"#0F3A22",marginRight:6}}>›</span>{s}</div>)}<div style={{marginTop:12,background:"#0A1F14",borderRadius:2,overflow:"hidden",height:2}}><div style={{height:"100%",background:"linear-gradient(90deg,#00FFB0,#0EA5E9)",width:`${prog}%`,transition:"width .26s",boxShadow:"0 0 6px #00FFB0"}}/></div><div style={{marginTop:2,fontSize:7,color:"#0F3A22",textAlign:"right",fontFamily:"monospace"}}>{prog}%</div></div>;
  return <div style={{animation:"fi .4s ease"}}><div style={{marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><div style={{width:6,height:6,background:"#00FFB0",borderRadius:"50%",boxShadow:"0 0 5px #00FFB0"}}/><span style={{fontSize:12,fontWeight:700,color:"#00FFB0",letterSpacing:".1em",fontFamily:"monospace"}}>WALLET INITIALIZED</span></div><p style={{margin:0,fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>ARC Network · Stealth · ZK-ready · EIP-4361</p></div><div style={{border:"1px solid rgba(245,158,11,.3)",borderRadius:3,background:"rgba(245,158,11,.05)",padding:"7px 10px",marginBottom:11,display:"flex",gap:7}}><span style={{color:"#F59E0B",flexShrink:0}}>⚠</span><p style={{margin:0,fontSize:9,color:"#92400E",lineHeight:1.5,fontFamily:"monospace"}}>CRITICAL: Store offline. PrivARC cannot recover lost keys.</p></div><Row label="// ARC Address" value={wallet.address} k="addr"/><Row label="// Recovery Phrase (BIP-39)" value={wallet.mnemonic} k="mnem" blur rev={showM} onRev={()=>setShowM(!showM)}/><Row label="// Private Key" value={wallet.privateKey} k="pk" blur rev={showP} onRev={()=>setShowP(!showP)}/><button onClick={onContinue} style={{width:"100%",marginTop:7,padding:"10px 0",background:"transparent",border:"1px solid #00FFB0",borderRadius:3,color:"#00FFB0",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".15em",boxShadow:"0 0 14px rgba(0,255,176,.1)",transition:"all .2s",textTransform:"uppercase"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ Launch PrivARC OS</button></div>;
}

/* ═══════════════════════════════════════════════════════════════
   PASS STRENGTH
═══════════════════════════════════════════════════════════════ */
function PassStr({ pw }) {
  if (!pw) return null;
  const s=[pw.length>=8,/[A-Z]/.test(pw),/[0-9]/.test(pw),/[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  const C=["","#EF4444","#F59E0B","#3B82F6","#00FFB0"],L=["","WEAK","FAIR","GOOD","STRONG"];
  return <div style={{marginTop:-5,marginBottom:10}}><div style={{display:"flex",gap:3}}>{[1,2,3,4].map(i=><div key={i} style={{flex:1,height:2,background:i<=s?C[s]:"#0A1F14",boxShadow:i<=s&&s===4?`0 0 4px ${C[s]}`:"none",transition:"background .3s"}}/>)}</div><div style={{marginTop:2,fontSize:7,color:C[s],letterSpacing:".1em"}}>ENTROPY: {L[s]}</div></div>;
}

/* ═══════════════════════════════════════════════════════════════
   REPORT EXPORT
═══════════════════════════════════════════════════════════════ */
function exportReport(balances, account, prices, txHistory) {
  const lines = [
    "PRIVARC OS — PORTFOLIO REPORT",
    "================================",
    `Generated: ${new Date().toLocaleString()}`,
    `Operator:  ${account?.address || "—"}`,
    `Network:   ARC Network (7070)`,
    "",
    "BALANCES",
    "--------",
    `Shielded USDC:  $${f6(balances.shielded)}`,
    `Wallet USDC:    $${f6(balances.usdc)}`,
    `ARC Gas:        ${fE(balances.arc)} ARC`,
    "",
    "LIVE PRICES",
    "-----------",
    ...Object.entries(prices).map(([k,v])=>`${k.padEnd(10)}: $${v<10?v.toFixed(4):v<1000?v.toFixed(2):v.toFixed(0)}`),
    "",
    "RECENT TRANSACTIONS",
    "-------------------",
    ...(txHistory.length ? txHistory.slice(0,10).map(t=>`${t.ts}  ${t.label.padEnd(20)}  ${t.hash.slice(0,18)}···`) : ["No transactions yet."]),
    "",
    "CONTRACTS",
    "---------",
    ...Object.entries(CONTRACTS).map(([k,v])=>`${k.padEnd(16)}: ${v}`),
    "",
    "PrivARC OS v3.0.0 — privarc.io",
  ];
  const blob = new Blob([lines.join("\n")], { type:"text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `privarc_report_${Date.now()}.txt`;
  a.click(); URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════════════
   PANELS (all in one — compact implementations)
═══════════════════════════════════════════════════════════════ */
function OverviewPanel({ balances, pub, agentLogs, setPanel, prices, changes }) {
  const [stats,setStats]=useState({tvl:0n,apy:0n});
  useEffect(()=>{if(!pub)return;(async()=>{const[t,a]=await Promise.all([pub.readContract({functionName:"getTVL"}),pub.readContract({functionName:"getAPY"})]);setStats({tvl:t,apy:a});})();},[pub]);
  const spkD=useMemo(()=>{let v=3800000;return Array.from({length:24},()=>{v+=R(-60000,130000);v=Math.max(2e6,v);return Math.round(v);});},[]);
  const mx=Math.max(...spkD),mn=Math.min(...spkD);
  const spk=spkD.map((v,i)=>`${i===0?"M":"L"}${((i/(spkD.length-1))*100).toFixed(1)} ${(100-((v-mn)/(mx-mn||1))*100*.8-10).toFixed(1)}`).join(" ");
  return <div style={{animation:"fi .3s ease"}}>
    <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:12}}>◈ SYSTEM OVERVIEW</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
      {[{l:"SHIELDED",v:f6(balances.shielded),u:"USDC",glow:true,p:"shield"},{l:"WALLET",v:f6(balances.usdc),u:"USDC",glow:false,p:"withdraw"},{l:"GAS",v:fE(balances.arc),u:"ARC",glow:false,p:null}].map(b=><div key={b.l} onClick={()=>b.p&&setPanel(b.p)} style={{background:"rgba(0,255,176,.03)",border:`1px solid rgba(0,255,176,${b.glow?.22:.08})`,borderRadius:4,padding:"9px 11px",cursor:b.p?"pointer":"default",transition:"all .2s",boxShadow:b.glow?"0 0 14px rgba(0,255,176,.05)":"none"}} onMouseEnter={e=>{if(b.p)e.currentTarget.style.borderColor="rgba(0,255,176,.3)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=`rgba(0,255,176,${b.glow?.22:.08})`;}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".16em",fontFamily:"monospace",marginBottom:4}}>{b.l}</div><div style={{fontSize:16,fontWeight:700,color:b.glow?"#00FFB0":"#A7F3D0",fontFamily:"monospace",lineHeight:1}}>{b.v}</div><div style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace",marginTop:1}}>{b.u}</div></div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
      <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"11px 12px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".16em",fontFamily:"monospace",marginBottom:4}}>PROTOCOL TVL</div><div style={{fontSize:18,fontWeight:700,color:"#A7F3D0",fontFamily:"monospace"}}>${(Number(stats.tvl)/1e12).toFixed(2)}M</div><svg width="100%" height="26" viewBox="0 0 100 100" preserveAspectRatio="none" style={{marginTop:6}}><path d={spk} fill="none" stroke="#00FFB0" strokeWidth="2" opacity=".5"/></svg></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>{[{l:"APY",v:`${(Number(stats.apy)/100).toFixed(2)}%`,c:"#00FFB0"},{l:"TX/24H",v:Ri(120,800).toString(),c:"#4ADE80"},{l:"AGENTS",v:"8/8",c:"#00FFB0"},{l:"ZK PROOFS",v:Ri(50,280).toString(),c:"#7C3AED"}].map(s=><div key={s.l} style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.06)",borderRadius:4,padding:"8px 10px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:3}}>{s.l}</div><div style={{fontSize:13,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div></div>)}</div>
    </div>
    {/* Live prices widget */}
    <div style={{background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"9px 11px",marginBottom:12}}>
      <div style={{fontSize:7,color:"#0F3A22",letterSpacing:".16em",fontFamily:"monospace",marginBottom:7}}>LIVE PRICES</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
        {["USDC","WETH","WBTC","ARCt"].map(t=>{const p=prices[t]||0;const c=changes[t]||0;const up=c>=0;return <div key={t} style={{textAlign:"center"}}><div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>{t}</div><div style={{fontSize:10,color:up?"#00FFB0":"#EF4444",fontFamily:"monospace",fontWeight:700}}>${p<10?p.toFixed(4):p<1000?p.toFixed(2):p.toFixed(0)}</div><div style={{fontSize:7,color:up?"#00FFB0":"#EF4444",fontFamily:"monospace"}}>{up?"▲":"▼"}{Math.abs(c/p*100).toFixed(2)}%</div></div>;})}
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4,marginBottom:12}}>{[["shield","🛡","Shield"],["swap","⇄","Swap"],["send","↗","Send"],["withdraw","↙","Withdraw"],["bridge","⟺","Bridge"]].map(([id,icon,label])=><button key={id} onClick={()=>setPanel(id)} style={{background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"8px 2px",cursor:"pointer",textAlign:"center",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.3)";e.currentTarget.style.background="rgba(0,255,176,.07)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.08)";e.currentTarget.style.background="rgba(0,255,176,.03)";}}>  <div style={{fontSize:14,marginBottom:2}}>{icon}</div><div style={{fontSize:7,color:"#00FFB0",fontFamily:"monospace",letterSpacing:".06em"}}>{label}</div></button>)}</div>
    <div style={{background:"#000A06",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"8px 10px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace"}}>AI AGENT LOG</div><button onClick={()=>setPanel("agents")} style={{fontSize:7,color:"#1E5C3A",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>VIEW ALL →</button></div>{agentLogs.slice(-3).map((l,i)=><div key={i} style={{fontSize:8,fontFamily:"monospace",marginBottom:2,color:l.c,lineHeight:1.4}}><span style={{color:"#0A1F14",marginRight:6}}>[{l.t}]</span>{l.m}</div>)}</div>
  </div>;
}

function ShieldPanel({wal,pub,account,balances,notify,refresh}){const[a,setA]=useState("");const[ld,setLd]=useState(false);const[gas,setGas]=useState(null);useEffect(()=>{if(!pub||!a||isNaN(a)||Number(a)<=0)return;const id=setTimeout(async()=>{const g=await pub.estimateGas();const gp=await pub.getGasPrice();setGas(fE(g*gp)+" ARC");},500);return()=>clearTimeout(id);},[a,pub]);const sub=async()=>{if(!a||!wal)return;setLd(true);notify("Shield","Approving USDC...","pending");try{const ah=await wal.writeContract({address:CONTRACTS.USDC,functionName:"approve"});await pub.waitForTransactionReceipt(ah);const sh=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"shield"});await pub.waitForTransactionReceipt(sh);notify("Shield ✓",`${a} USDC shielded`,"success",sh);setA("");await refresh();}catch(e){notify("Shield Failed",e.message||"Rejected","error");}setLd(false);};return <div style={{animation:"fi .3s ease"}}><PH icon="🛡" title="SHIELD" sub="Deposit assets into private vault"/><div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.1)",borderRadius:4,padding:"11px 13px",marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>Available</span><button onClick={()=>setA(f6(balances.usdc).replace(/,/g,""))} style={{fontSize:8,color:"#00FFB0",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace"}}>MAX {f6(balances.usdc)}</button></div><OsField label="USDC AMOUNT" value={a} onChange={e=>setA(e.target.value)} placeholder="0.00" icon="🛡" suffix="USDC"/><IG items={[["Fee","0.00 USDC","Launch"],["Gas",gas||"—","ARC"],["Privacy","ZK","On-chain"]]}/></div><div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"7px 10px",marginBottom:10,fontSize:9,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>ZK commitment generated on-chain. Funds untraceable once shielded.</div><ArcBtn label="⟶ SHIELD ASSETS" onClick={sub} loading={ld} disabled={!a||Number(a)<=0}/></div>;}

function SwapPanel({wal,pub,account,balances,notify,refresh}){const TK=["USDC","WETH","WBTC","ARCt","DAI","USDT"];const[fr,setFr]=useState("USDC");const[to,setTo]=useState("WETH");const[a,setA]=useState("");const[q,setQ]=useState(null);const[ld,setLd]=useState(false);const RT={USDC:{WETH:.000385,WBTC:.0000155,ARCt:4.25,DAI:.9997,USDT:1.0001},WETH:{USDC:2597,WBTC:.0403,ARCt:11031,DAI:2596,USDT:2596},WBTC:{USDC:64500,WETH:24.8,ARCt:274000,DAI:64480,USDT:64490},ARCt:{USDC:.235,WETH:.0000906,DAI:.2348,USDT:.2347,WBTC:.00000365},DAI:{USDC:1.0003,WETH:.000385,WBTC:.0000155,ARCt:4.25,USDT:1.0002},USDT:{USDC:.9999,WETH:.000384,WBTC:.0000154,ARCt:4.249,DAI:.9998}};useEffect(()=>{if(!a||isNaN(a)||Number(a)<=0){setQ(null);return;}const id=setTimeout(()=>{const rate=RT[fr]?.[to]||1;const out=Number(a)*rate*(0.9992+Math.random()*.001);setQ({out:out.toFixed(6),fee:(Number(a)*.0005).toFixed(4),impact:(Math.random()*.3).toFixed(2)});},450);return()=>clearTimeout(id);},[a,fr,to]);const sw=async()=>{if(!a||!wal||!q)return;setLd(true);notify("Swap","ZK routing...","pending");try{const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"privateSwap"});await pub.waitForTransactionReceipt(h);notify("Swap ✓",`${a} ${fr} → ${q.out} ${to}`,"success",h);setA("");setQ(null);await refresh();}catch(e){notify("Swap Failed",e.message,"error");}setLd(false);};const TS=({v,onChange})=><select value={v} onChange={e=>onChange(e.target.value)} style={{background:"rgba(0,0,0,.5)",border:"1px solid rgba(0,255,176,.15)",borderRadius:3,color:"#A7F3D0",fontSize:10,fontFamily:"monospace",padding:"6px 7px",cursor:"pointer",outline:"none",flexShrink:0}}>{TK.map(t=><option key={t}>{t}</option>)}</select>;
return <div style={{animation:"fi .3s ease"}}><PH icon="⇄" title="PRIVATE SWAP" sub="ZK-routed on-chain exchange"/><div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.1)",borderRadius:4,padding:"11px 13px",marginBottom:10}}><div style={{display:"flex",gap:7,alignItems:"flex-end",marginBottom:7}}><div style={{flex:1}}><OsField label="FROM" value={a} onChange={e=>setA(e.target.value)} placeholder="0.00" icon="⬆"/></div><TS v={fr} onChange={v=>{setFr(v);if(v===to)setTo(TK.find(t=>t!==v));}}/></div><div style={{display:"flex",justifyContent:"center",marginBottom:7}}><button onClick={()=>{setFr(to);setTo(fr);setA("");setQ(null);}} style={{background:"rgba(0,255,176,.06)",border:"1px solid rgba(0,255,176,.2)",borderRadius:"50%",width:27,height:27,cursor:"pointer",color:"#00FFB0",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.12)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,255,176,.06)"}>⇅</button></div><div style={{display:"flex",gap:7,alignItems:"flex-end"}}><div style={{flex:1}}><OsField label="TO (EST.)" value={q?q.out:""} placeholder="0.00" icon="⬇" readOnly/></div><TS v={to} onChange={v=>{setTo(v);if(v===fr)setFr(TK.find(t=>t!==v));}}/></div></div>{q&&<div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"8px 11px",marginBottom:10}}>{[["Fee",`${q.fee} USDC`],["Impact",`~${q.impact}%`],["Route",`${fr}→Pool→ZK→${to}`]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>{k}</span><span style={{fontSize:8,color:"#4ADE80",fontFamily:"monospace"}}>{v}</span></div>)}</div>}<ArcBtn label="⟶ EXECUTE PRIVATE SWAP" onClick={sw} loading={ld} disabled={!a||!q}/></div>;}

function SendPanel({wal,pub,account,balances,notify,refresh}){const[to,setTo]=useState("");const[a,setA]=useState("");const[ld,setLd]=useState(false);const[resolving,setResolving]=useState(false);const[resolved,setResolved]=useState(null);const[note,setNote]=useState("");useEffect(()=>{if(to.endsWith(".arc")||to.endsWith(".eth")){setResolving(true);setResolved(null);const id=setTimeout(()=>{setResolving(false);setResolved("0x"+hx(40));},700);return()=>clearTimeout(id);}else setResolved(null);},[to]);const send=async()=>{if((!to&&!resolved)||!a||!wal)return;setLd(true);notify("Send","Generating stealth address...","pending");try{const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"privateSend"});await pub.waitForTransactionReceipt(h);notify("Send ✓",`${a} USDC sent privately`,"success",h);setTo("");setA("");setResolved(null);setNote("");await refresh();}catch(e){notify("Send Failed",e.message,"error");}setLd(false);};
return <div style={{animation:"fi .3s ease"}}><PH icon="↗" title="PRIVATE SEND" sub="Stealth address P2P transfer"/><OsField label="RECIPIENT" value={to} onChange={e=>setTo(e.target.value)} placeholder="0x... or name.arc" icon="↗" hint={resolving?"Resolving...":resolved?`✓ ${sh(resolved)}`:null}/><OsField label="AMOUNT" value={a} onChange={e=>setA(e.target.value)} placeholder="0.00" icon="💸" suffix="USDC"/><OsField label="ENCRYPTED NOTE (OPTIONAL)" value={note} onChange={e=>setNote(e.target.value)} placeholder="memo..." icon="📝"/><IG items={[["Fee","0.02 USDC","Flat"],["Privacy","Stealth","Hidden"],["Delivery","Instant","ARC"]]}/><ArcBtn label="⟶ SEND PRIVATELY" onClick={send} loading={ld} disabled={!to||!a||resolving}/></div>;}

function WithdrawPanel({wal,pub,account,balances,notify,refresh}){const[a,setA]=useState("");const[dest,setDest]=useState("");const[ld,setLd]=useState(false);const[proving,setProving]=useState(false);const withdraw=async()=>{if(!a||!wal)return;setLd(true);setProving(true);notify("Withdraw","Generating ZK proof...","pending");await sl(1700);setProving(false);try{const target=dest||account.address;const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"withdraw"});await pub.waitForTransactionReceipt(h);notify("Withdraw ✓",`${a} USDC → ${sh(target)}`,"success",h);setA("");setDest("");await refresh();}catch(e){notify("Withdraw Failed",e.message,"error");}setLd(false);};
return <div style={{animation:"fi .3s ease"}}><PH icon="↙" title="WITHDRAW" sub="Exit shielded funds to public address"/><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>Shielded</span><button onClick={()=>setA(f6(balances.shielded).replace(/,/g,""))} style={{fontSize:8,color:"#00FFB0",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace"}}>MAX {f6(balances.shielded)}</button></div><OsField label="AMOUNT" value={a} onChange={e=>setA(e.target.value)} placeholder="0.00" icon="↙" suffix="USDC"/><OsField label="DESTINATION (OPTIONAL)" value={dest} onChange={e=>setDest(e.target.value)} placeholder={account?.address||"0x..."} icon="📍"/><IG items={[["Fee","0.03 USDC","Flat"],["ZK","Groth16","~1.8s"],["Available",f6(balances.shielded),"USDC"]]}/>{proving&&<div style={{marginBottom:9,padding:"7px 10px",background:"rgba(0,255,176,.04)",border:"1px solid rgba(0,255,176,.15)",borderRadius:3,display:"flex",alignItems:"center",gap:7}}><Sp/><span style={{fontSize:9,color:"#00FFB0",fontFamily:"monospace"}}>Generating Groth16 ZK proof...</span></div>}<ArcBtn label="⟶ WITHDRAW FUNDS" onClick={withdraw} loading={ld} disabled={!a||Number(a)<=0}/></div>;}

function BridgePanel({wal,pub,account,balances,notify,refresh}){const CH=[{id:"ethereum",name:"Ethereum",icon:"Ξ",fee:"0.10",time:"5-10m"},{id:"bnb",name:"BNB Chain",icon:"⬡",fee:"0.08",time:"3-6m"},{id:"polygon",name:"Polygon",icon:"⬟",fee:"0.05",time:"2-4m"},{id:"arbitrum",name:"Arbitrum",icon:"🔵",fee:"0.04",time:"1-3m"},{id:"base",name:"Base",icon:"🔷",fee:"0.04",time:"1-3m"},{id:"optimism",name:"Optimism",icon:"🔴",fee:"0.04",time:"1-3m"}];const[dest,setDest]=useState("ethereum");const[a,setA]=useState("");const[ld,setLd]=useState(false);const ch=CH.find(c=>c.id===dest);const bridge=async()=>{if(!a||!wal)return;setLd(true);notify("Bridge","Locking in BridgeAdapter...","pending");try{const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"bridgeOut"});await pub.waitForTransactionReceipt(h);notify("Bridge ✓",`${a} USDC → ${ch?.name}`,"success",h);setA("");await refresh();}catch(e){notify("Bridge Failed",e.message,"error");}setLd(false);};
return <div style={{animation:"fi .3s ease"}}><PH icon="⟺" title="BRIDGE" sub="Cross-chain private transfer"/><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,marginBottom:10}}>{CH.map(c=><button key={c.id} onClick={()=>setDest(c.id)} style={{background:dest===c.id?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)",border:`1px solid ${dest===c.id?"rgba(0,255,176,.35)":"rgba(0,255,176,.07)"}`,borderRadius:4,padding:"7px 4px",cursor:"pointer",textAlign:"center",transition:"all .2s"}}><div style={{fontSize:15,marginBottom:1}}>{c.icon}</div><div style={{fontSize:7,color:dest===c.id?"#00FFB0":"#1E5C3A",fontFamily:"monospace"}}>{c.name.split(" ")[0]}</div><div style={{fontSize:6,color:"#0A1F14",fontFamily:"monospace"}}>{c.fee} USDC</div></button>)}</div><OsField label="AMOUNT" value={a} onChange={e=>setA(e.target.value)} placeholder="0.00" icon="⟺" suffix="USDC"/><IG items={[["Dest",ch?.name||"—",""],["Fee",`${ch?.fee} USDC`,""],["Time",ch?.time||"—",""],["Privacy","E2E",""]]}/><ArcBtn label={`⟶ BRIDGE TO ${ch?.name?.toUpperCase()||"—"}`} onClick={bridge} loading={ld} disabled={!a||Number(a)<=0}/></div>;}

function AnalyticsPanel({pub}){
  const[loading,setLoading]=useState(true);const[stats,setStats]=useState({tvl:0n});
  useEffect(()=>{if(!pub)return;(async()=>{const t=await pub.readContract({functionName:"getTVL"});setStats({tvl:t});setLoading(false);})();},[pub]);
  const tvlD=useMemo(()=>{let v=3800000;return Array.from({length:30},()=>{v+=R(-80000,180000);v=Math.max(2e6,v);return Math.round(v);});},[]);
  const txD =useMemo(()=>Array.from({length:30},()=>Ri(80,620)),[]);
  const zkD  =useMemo(()=>Array.from({length:30},()=>Ri(40,310)),[]);
  const HM   =useMemo(()=>Array.from({length:7},()=>Array.from({length:24},()=>Ri(0,200))),[]);
  const hmMax=Math.max(...HM.flat());
  const mkSpk=(data,col,label,fmt=(v)=>v.toLocaleString())=>{const mx=Math.max(...data),mn=Math.min(...data);const W=260,H=55;const pts=data.map((v,i)=>({x:(i/(data.length-1))*W,y:H-((v-mn)/(mx-mn||1))*H*.82-H*.09}));const path=pts.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");const last=data[data.length-1],prev=data[data.length-2],chg=((last-prev)/prev*100);return <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"10px 12px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}><div><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:2}}>{label}</div><div style={{fontSize:16,fontWeight:700,color,fontFamily:"monospace"}}>{fmt(last)}</div></div><div style={{fontSize:9,color:chg>=0?"#00FFB0":"#EF4444",fontFamily:"monospace",background:`rgba(${chg>=0?"0,255,176":"239,68,68"},.08)`,border:`1px solid rgba(${chg>=0?"0,255,176":"239,68,68"},.2)`,borderRadius:2,padding:"2px 5px"}}>{chg>=0?"+":""}{chg.toFixed(1)}%</div></div><svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{height:46}}><defs><linearGradient id={`ag${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity=".2"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs><path d={`${path} L${W} ${H} L0 ${H} Z`} fill={`url(#ag${label})`}/><path d={path} fill="none" stroke={col} strokeWidth="1.5" opacity=".8"/><circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="2.5" fill={col}/></svg></div>;};
  return <div style={{animation:"fi .3s ease"}}><PH icon="📈" title="ANALYTICS" sub="Protocol metrics, charts & heatmap"/>
    {loading?<div style={{display:"flex",alignItems:"center",gap:8,padding:"16px 0"}}><Sp/><span style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>Loading on-chain data...</span></div>:<>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>{mkSpk(tvlD,"#00FFB0","TVL (USDC)",v=>"$"+(v/1e6).toFixed(2)+"M")}{mkSpk(txD,"#0EA5E9","DAILY TX")}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>{mkSpk(zkD,"#7C3AED","ZK PROOFS")}<div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"10px 12px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:7}}>PROTOCOL STATS</div>{[["TVL","$"+(Number(stats.tvl)/1e12).toFixed(2)+"M","#00FFB0"],["Operators",Ri(1200,3400).toLocaleString(),"#4ADE80"],["ZK/day",Ri(180,420).toString(),"#7C3AED"],["Shield avg","$"+Ri(500,8000).toLocaleString(),"#0EA5E9"],["Staking APY","12.80%","#F59E0B"]].map(([k,v,c])=><div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>{k}</span><span style={{fontSize:8,color:c,fontFamily:"monospace"}}>{v}</span></div>)}</div></div>
      <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"10px 12px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:7}}>TX HEATMAP — 7 DAYS × 24H</div><div style={{display:"flex",gap:1}}>{Array.from({length:24},(_,col)=><div key={col} style={{display:"flex",flexDirection:"column",gap:1,flex:1}}>{Array.from({length:7},(_,row)=><div key={row} style={{height:10,borderRadius:1,background:`rgba(0,255,176,${HM[row][col]/hmMax*.7+.04})`}}/>)}</div>)}</div><div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:6,color:"#0A1F14",fontFamily:"monospace"}}>00:00</span><span style={{fontSize:6,color:"#0A1F14",fontFamily:"monospace"}}>12:00</span><span style={{fontSize:6,color:"#0A1F14",fontFamily:"monospace"}}>23:00</span></div></div>
    </>}
  </div>;
}

function ZKPanel({wal,pub,notify}){
  const[mode,setMode]=useState("groth16");const[circuit,setCircuit]=useState("shield");const[proving,setProving]=useState(false);const[phase,setPhase]=useState(0);const[proof,setProof]=useState(null);const[verified,setVerified]=useState(null);const[verifying,setVerifying]=useState(false);const[history,setHistory]=useState([]);
  const CIRCS={shield:{name:"ShieldCircuit",constraints:Ri(28000,35000),time:1.82},transfer:{name:"TransferCircuit",constraints:Ri(42000,55000),time:2.41},withdraw:{name:"WithdrawCircuit",constraints:Ri(35000,44000),time:2.12}};const C=CIRCS[circuit];
  const PG16=["Compiling constraints...","Generating witness...","Computing FFT...","Evaluating QAP polynomials...","Computing π_A, π_B, π_C...","Serializing proof...","DONE"];
  const PPL=["Init PLONK prover...","Computing permutation...","Building gate constraints...","Multilinear extensions...","Commitment scheme...","Finalizing proof...","DONE"];
  const steps=mode==="groth16"?PG16:PPL;
  const run=async()=>{if(!wal)return;setProving(true);setPhase(0);setProof(null);setVerified(null);for(let i=0;i<steps.length;i++){setPhase(i+1);await sl(R(260,500));}const p={scheme:mode.toUpperCase(),circuit:C.name,pi_a:["0x"+hx(64),"0x"+hx(64),"0x01"],pi_c:["0x"+hx(64),"0x"+hx(64),"0x01"],publicSignals:["0x"+hx(32),"0x"+hx(32)],constraints:C.constraints,provingTime:(C.time+R(-0.3,0.4)).toFixed(2)+"s",hash:"0x"+hx(64),ts:tc()};setProof(p);setProving(false);setHistory(h=>[{...p,id:hx(8)},...h.slice(0,9)]);notify("ZK Proof Ready",`${mode.toUpperCase()} proof for ${C.name}`,"success");};
  const verify=async()=>{if(!proof)return;setVerifying(true);await sl(R(400,900));setVerified(Math.random()>.05);setVerifying(false);};
  return <div style={{animation:"fi .3s ease"}}><PH icon="🔐" title="ZK PROOF CONSOLE" sub="Groth16 & PLONK zero-knowledge proof generation"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
      <div><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:5}}>SCHEME</div><div style={{display:"flex",gap:4,marginBottom:10}}>{["groth16","plonk"].map(m=><button key={m} onClick={()=>{setMode(m);setProof(null);setVerified(null);}} style={{flex:1,padding:"6px 0",background:mode===m?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)",border:`1px solid ${mode===m?"rgba(0,255,176,.35)":"rgba(0,255,176,.08)"}`,borderRadius:3,color:mode===m?"#00FFB0":"#1E5C3A",fontSize:8,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",textTransform:"uppercase"}}>{m}</button>)}</div>
        <div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:5}}>CIRCUIT</div>
        {Object.entries(CIRCS).map(([id,cc])=><button key={id} onClick={()=>{setCircuit(id);setProof(null);setVerified(null);}} style={{padding:"7px 9px",background:circuit===id?"rgba(0,255,176,.08)":"rgba(0,0,0,.2)",border:`1px solid ${circuit===id?"rgba(0,255,176,.28)":"rgba(0,255,176,.06)"}`,borderRadius:3,cursor:"pointer",textAlign:"left",transition:"all .2s",marginBottom:4,display:"block",width:"100%"}}><div style={{fontSize:9,color:circuit===id?"#00FFB0":"#A7F3D0",fontFamily:"monospace"}}>{cc.name}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace"}}>{cc.constraints.toLocaleString()} R1CS</div></button>)}
        <div style={{marginTop:6}}><ArcBtn label={proving?"Proving...":"⟶ GENERATE PROOF"} onClick={run} loading={proving} disabled={proving}/></div>
      </div>
      <div style={{background:"rgba(0,0,0,.35)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"10px 12px"}}>
        <div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:7}}>STATUS</div>
        {proving?(steps.slice(0,phase).map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><span style={{fontSize:i===phase-1?10:9,color:i===phase-1?"#00FFB0":"#1E5C3A"}}>{i===phase-1?"›":"✓"}</span><span style={{fontSize:8,color:i===phase-1?"#A7F3D0":"#1E5C3A",fontFamily:"monospace"}}>{s}</span></div>))
        :proof?(<div style={{animation:"fi .4s ease"}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}><div style={{width:6,height:6,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 5px #00FFB0"}}/><span style={{fontSize:10,color:"#00FFB0",fontFamily:"monospace",fontWeight:700}}>PROOF READY ✓</span></div>{[["Scheme",proof.scheme],["Circuit",proof.circuit],["Constraints",Number(proof.constraints).toLocaleString()],["Time",proof.provingTime],["π_A",proof.pi_a[0].slice(0,16)+"···"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace"}}>{k}</span><span style={{fontSize:7,color:"#4ADE80",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"55%",textAlign:"right"}}>{v}</span></div>)}<div style={{marginTop:7}}>{verified===null?<button onClick={verify} disabled={verifying} style={{width:"100%",padding:"6px 0",background:"transparent",border:"1px solid rgba(0,255,176,.3)",borderRadius:3,color:"#00FFB0",fontSize:8,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.07)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{verifying?<><Sp sz={9}/>Verifying...</>:"⟶ VERIFY ON-CHAIN"}</button>:<div style={{padding:"6px 0",textAlign:"center",background:`rgba(${verified?"0,255,176":"239,68,68"},.08)`,border:`1px solid rgba(${verified?"0,255,176":"239,68,68"},.3)`,borderRadius:3,fontSize:8,color:verified?"#00FFB0":"#EF4444",fontFamily:"monospace"}}>{verified?"✓ VALID PROOF":"✕ INVALID"}</div>}</div></div>)
        :<div style={{textAlign:"center",padding:"18px 0"}}><div style={{fontSize:28,marginBottom:6,opacity:.3}}>🔐</div><div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>Configure circuit and generate</div></div>}
      </div>
    </div>
    {history.length>0&&<div style={{background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"9px 11px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:6}}>PROOF HISTORY</div><div style={{maxHeight:120,overflow:"auto"}}>{history.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(0,255,176,.04)"}}><div style={{width:4,height:4,borderRadius:"50%",background:"#00FFB0",flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:8,color:"#A7F3D0",fontFamily:"monospace"}}>{p.scheme} · {p.circuit}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace"}}>{p.ts} · {p.provingTime}</div></div><div style={{fontSize:7,color:"#4ADE80",fontFamily:"monospace"}}>{Number(p.constraints).toLocaleString()}</div></div>)}</div></div>}
  </div>;
}

function GovPanel({wal,pub,account,notify}){
  const[vp,setVp]=useState(0n);const[voting,setVoting]=useState({});const[delegating,setDelegating]=useState(false);const[delegate,setDelegate]=useState("");
  useEffect(()=>{if(!pub||!account)return;(async()=>{const v=await pub.readContract({functionName:"getVotingPower"});setVp(v);})();},[pub,account]);
  const PROPS=[{id:"PIP-04",title:"Increase ShieldVault limit to 500K USDC",status:"active",type:"parameter",for:6842340,against:1203110,abstain:342000,quorum:5000000,ends:"2d 14h"},{id:"PIP-03",title:"Reduce Private Send fee to 0.02 USDC",status:"active",type:"fee",for:9123400,against:880200,abstain:121000,quorum:5000000,ends:"5d 02h"},{id:"PIP-02",title:"Add BNB Chain bridge adapter v2",status:"passed",type:"upgrade",for:11240000,against:320000,abstain:88000,quorum:5000000,ends:"Ended"},{id:"PIP-01",title:"Launch PrivARC token incentive program",status:"defeated",type:"tokenomics",for:2100000,against:8900000,abstain:440000,quorum:5000000,ends:"Ended"}];
  const vote=async(id,side)=>{if(!wal)return;setVoting(p=>({...p,[id]:side+"_l"}));await sl(R(800,1400));notify("Vote Cast",`Voted ${side} on ${id}`,"success","0x"+hx(64));setVoting(p=>({...p,[id]:side}));};
  const SC={active:"#00FFB0",passed:"#4ADE80",defeated:"#EF4444"};const TC={parameter:"#0EA5E9",fee:"#F59E0B",upgrade:"#7C3AED",tokenomics:"#FF5000"};
  const Bar=({f,a,ab,q})=>{const tot=f+a+ab||1;const fp=(f/tot)*100,ap=(a/tot)*100,qp=(q/tot)*100;return <div style={{marginBottom:8}}><div style={{height:6,borderRadius:3,overflow:"hidden",background:"rgba(0,0,0,.4)",position:"relative",marginBottom:2}}><div style={{position:"absolute",left:0,top:0,height:"100%",width:`${fp}%`,background:"#00FFB0"}}/><div style={{position:"absolute",left:`${fp}%`,top:0,height:"100%",width:`${ap}%`,background:"#EF4444"}}/><div style={{position:"absolute",left:`${fp+ap}%`,top:0,height:"100%",width:`${(ab/tot)*100}%`,background:"#475569"}}/>{qp<100&&<div style={{position:"absolute",left:`${Math.min(qp,99)}%`,top:-1,height:"calc(100%+2px)",width:1.5,background:"#F59E0B"}}/>}</div><div style={{display:"flex",gap:8,fontSize:7,fontFamily:"monospace"}}><span style={{color:"#00FFB0"}}>FOR {(f/1e6).toFixed(1)}M</span><span style={{color:"#EF4444"}}>AGAINST {(a/1e6).toFixed(1)}M</span><span style={{color:"#F59E0B",marginLeft:"auto"}}>QUORUM {(q/1e6).toFixed(0)}M</span></div></div>;};
  return <div style={{animation:"fi .3s ease"}}><PH icon="🗳" title="GOVERNANCE" sub="Proposals, voting & delegation"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:12}}>
      <div style={{background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.15)",borderRadius:4,padding:"10px 12px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:4}}>VOTING POWER</div><div style={{fontSize:20,fontWeight:700,color:"#00FFB0",fontFamily:"monospace"}}>{f6(vp)}</div><div style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>veARC</div></div>
      <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"10px 12px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:6}}>DELEGATE</div><OsField label="" value={delegate} onChange={e=>setDelegate(e.target.value)} placeholder="0x... or name.arc" icon="👤"/><ArcBtn label={delegating?"Delegating...":"DELEGATE"} onClick={async()=>{if(!delegate||!wal)return;setDelegating(true);await sl(1200);setDelegating(false);notify("Delegated",`Votes delegated to ${sh(delegate)}`,"success","0x"+hx(64));}} loading={delegating} disabled={!delegate} small/></div>
    </div>
    {PROPS.map(p=><div key={p.id} style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"10px 12px",marginBottom:7}}><div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:5}}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}><span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",fontWeight:700}}>{p.id}</span><span style={{fontSize:7,background:`${SC[p.status]}15`,border:`1px solid ${SC[p.status]}33`,borderRadius:2,padding:"1px 5px",color:SC[p.status],fontFamily:"monospace"}}>{p.status}</span><span style={{fontSize:7,background:`${TC[p.type]}15`,border:`1px solid ${TC[p.type]}33`,borderRadius:2,padding:"1px 5px",color:TC[p.type],fontFamily:"monospace"}}>{p.type}</span></div><div style={{fontSize:10,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700,lineHeight:1.3}}>{p.title}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",marginTop:2}}>ends {p.ends}</div></div></div><Bar f={p.for} a={p.against} ab={p.abstain} q={p.quorum}/>{p.status==="active"&&(!voting[p.id]?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>{[["FOR","#00FFB0"],["AGAINST","#EF4444"],["ABSTAIN","#475569"]].map(([side,c])=><button key={side} onClick={()=>vote(p.id,side.toLowerCase())} style={{padding:"5px 0",background:"transparent",border:`1px solid ${c}33`,borderRadius:3,color:c,fontSize:7,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background=`${c}0F`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{voting[p.id]===side.toLowerCase()+"_l"?<Sp sz={8} c={c}/>:side}</button>)}</div>:<div style={{padding:"5px 0",textAlign:"center",background:"rgba(0,255,176,.06)",border:"1px solid rgba(0,255,176,.2)",borderRadius:3,fontSize:8,color:"#00FFB0",fontFamily:"monospace"}}>✓ VOTED {voting[p.id]?.toUpperCase()}</div>)}</div>)}
  </div>;
}

function StakingPanel({wal,pub,account,notify}){
  const[staked,setStaked]=useState(0n);const[rewards,setRewards]=useState(0n);const[apy,setApy]=useState(0n);const[loading,setLoading]=useState(true);const[stakeAmt,setStakeAmt]=useState("");const[unstakeAmt,setUnstakeAmt]=useState("");const[staking,setStaking]=useState(false);const[unstaking,setUnstaking]=useState(false);const[claiming,setClaiming]=useState(false);const[lock,setLock]=useState("30");
  useEffect(()=>{if(!pub||!account)return;(async()=>{const[s,r,a]=await Promise.all([pub.readContract({functionName:"getStaked"}),pub.readContract({functionName:"getPendingRewards"}),pub.readContract({functionName:"getStakingAPY"})]);setStaked(s);setRewards(r);setApy(a);setLoading(false);})();},[pub,account]);
  const LOCKS=[{d:"7",mult:"1.0x",apy:"8.40%"},{d:"30",mult:"1.5x",apy:"12.80%"},{d:"90",mult:"2.0x",apy:"18.40%"},{d:"180",mult:"3.0x",apy:"24.20%"}];const lk=LOCKS.find(l=>l.d===lock);
  const stake=async()=>{if(!stakeAmt||!wal)return;setStaking(true);notify("Staking",`Locking ${stakeAmt} USDC (${lock}d)...`,"pending");try{const h=await wal.writeContract({address:CONTRACTS.Staking,functionName:"stake"});await pub.waitForTransactionReceipt(h);notify("Staked ✓",`${stakeAmt} USDC staked`,"success",h);setStakeAmt("");}catch(e){notify("Stake Failed",e.message,"error");}setStaking(false);};
  const claim=async()=>{if(!wal||rewards===0n)return;setClaiming(true);notify("Claiming","Claiming rewards...","pending");try{const h=await wal.writeContract({address:CONTRACTS.Staking,functionName:"claimRewards"});await pub.waitForTransactionReceipt(h);notify("Claimed ✓",`${f6(rewards)} USDC claimed`,"success",h);setRewards(0n);}catch(e){notify("Claim Failed",e.message,"error");}setClaiming(false);};
  return <div style={{animation:"fi .3s ease"}}><PH icon="💎" title="STAKING" sub="Stake USDC · earn rewards · boost voting power"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>{[{l:"STAKED",v:loading?"···":f6(staked),u:"USDC",c:"#00FFB0"},{l:"REWARDS",v:loading?"···":f6(rewards),u:"USDC",c:"#F59E0B"},{l:"APY",v:loading?"···":(Number(apy)/100).toFixed(2)+"%",u:lk?.mult+" mult",c:"#7C3AED"}].map(s=><div key={s.l} style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"9px 11px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:3}}>{s.l}</div><div style={{fontSize:15,fontWeight:700,color:s.c,fontFamily:"monospace"}}>{s.v}</div><div style={{fontSize:7,color:"#1E5C3A",fontFamily:"monospace"}}>{s.u}</div></div>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
      <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"11px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:7}}>STAKE USDC</div><OsField label="AMOUNT" value={stakeAmt} onChange={e=>setStakeAmt(e.target.value)} placeholder="0.00" icon="💎" suffix="USDC"/><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".12em",fontFamily:"monospace",marginBottom:5}}>LOCK PERIOD</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,marginBottom:7}}>{LOCKS.map(l=><button key={l.d} onClick={()=>setLock(l.d)} style={{padding:"5px 3px",background:lock===l.d?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)",border:`1px solid ${lock===l.d?"rgba(0,255,176,.35)":"rgba(0,255,176,.07)"}`,borderRadius:3,cursor:"pointer",textAlign:"center",transition:"all .2s"}}><div style={{fontSize:8,color:lock===l.d?"#00FFB0":"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{l.d}d</div><div style={{fontSize:6,color:lock===l.d?"#4ADE80":"#0F3A22",fontFamily:"monospace"}}>{l.apy}</div></button>)}</div><ArcBtn label={staking?"Staking...":"⟶ STAKE"} onClick={stake} loading={staking} disabled={!stakeAmt||Number(stakeAmt)<=0} small/></div>
      <div style={{display:"grid",gridTemplateRows:"1fr 1fr",gap:7}}><div style={{background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"10px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:6}}>UNSTAKE</div><OsField label="AMOUNT" value={unstakeAmt} onChange={e=>setUnstakeAmt(e.target.value)} placeholder="0.00" icon="↙" suffix="USDC"/><ArcBtn label={unstaking?"Unstaking...":"⟶ UNSTAKE"} onClick={async()=>{if(!unstakeAmt||!wal||staked===0n)return;setUnstaking(true);await sl(1200);setUnstaking(false);setUnstakeAmt("");notify("Unstaked ✓",`${unstakeAmt} USDC unstaked`,"success","0x"+hx(64));}} loading={unstaking} disabled={!unstakeAmt||staked===0n} color="#4ADE80" small/></div><div style={{background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"10px"}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:3}}>PENDING REWARDS</div><div style={{fontSize:18,fontWeight:700,color:"#F59E0B",fontFamily:"monospace",marginBottom:2}}>{f6(rewards)}</div><div style={{fontSize:7,color:"#1E5C3A",fontFamily:"monospace",marginBottom:7}}>USDC</div><ArcBtn label={claiming?"Claiming...":"⟶ CLAIM"} onClick={claim} loading={claiming} disabled={rewards===0n} color="#F59E0B" small/></div></div>
    </div>
  </div>;
}

function PortfolioPanel({ balances, prices, account, txHistory, onExport }) {
  const P = [
    {token:"USDC",    balance:f6(balances.usdc),   price:prices.USDC||1,  icon:"💵",c:"#4ADE80"},
    {token:"USDC ⚡", balance:f6(balances.shielded),price:prices.USDC||1,  icon:"🛡",c:"#00FFB0"},
    {token:"ARC",     balance:fE(balances.arc),     price:prices.ARC||0.18,icon:"⬡",c:"#A7F3D0"},
    {token:"WETH",    balance:R(0,0.5).toFixed(4),  price:prices.WETH||2597,icon:"Ξ",c:"#7C8EF5"},
    {token:"ARCt",    balance:R(0,1000).toFixed(2), price:prices.ARCt||0.23,icon:"◈",c:"#F59E0B"},
  ];
  const total = P.reduce((s,p)=>s+Number(p.balance.replace(/,/g,""))*p.price,0);
  const alloc = P.map(p=>({...p,pct:((Number(p.balance.replace(/,/g,""))*p.price/total)*100||0)}));
  let off=0; const segs=alloc.map((p,i)=>{const s={pct:p.pct,off,col:p.c};off+=p.pct;return s;});
  return <div style={{animation:"fi .3s ease"}}><PH icon="📊" title="PORTFOLIO" sub="Asset allocation, live prices & report"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 130px",gap:10,marginBottom:12}}>
      <div>
        <div style={{background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.12)",borderRadius:4,padding:"10px 12px",marginBottom:8}}>
          <div style={{fontSize:7,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:4}}>TOTAL VALUE</div>
          <div style={{fontSize:22,fontWeight:700,color:"#00FFB0",fontFamily:"monospace"}}>${total.toFixed(2)}</div>
          <button onClick={onExport} style={{marginTop:6,padding:"4px 8px",background:"rgba(0,255,176,.06)",border:"1px solid rgba(0,255,176,.2)",borderRadius:3,color:"#00FFB0",fontSize:8,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.12)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,255,176,.06)"}>⬇ EXPORT REPORT</button>
        </div>
        {alloc.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 9px",background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.05)",borderRadius:3,marginBottom:4}}>
          <span style={{fontSize:12}}>{p.icon}</span>
          <div style={{flex:1}}><div style={{fontSize:10,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{p.token}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace"}}>@ ${(p.price<10?p.price.toFixed(4):p.price<1000?p.price.toFixed(2):p.price.toFixed(0))}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:9,color:p.c,fontFamily:"monospace"}}>{p.balance}</div><div style={{fontSize:7,color:"#1E5C3A",fontFamily:"monospace"}}>{p.pct.toFixed(1)}%</div></div>
        </div>)}
      </div>
      <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"10px"}}>
        <div style={{fontSize:7,color:"#0F3A22",letterSpacing:".14em",fontFamily:"monospace",marginBottom:7}}>ALLOCATION</div>
        <svg width="100%" viewBox="0 0 100 100">
          {segs.map((s,i)=>{const r=38,cx=50,cy=50;const st=(s.off/100)*Math.PI*2-Math.PI/2;const en=((s.off+s.pct)/100)*Math.PI*2-Math.PI/2;const x1=cx+r*Math.cos(st),y1=cy+r*Math.sin(st),x2=cx+r*Math.cos(en),y2=cy+r*Math.sin(en);const lg=s.pct>50?1:0;return s.pct>0?<path key={i} d={`M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${lg} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`} fill={s.col} opacity=".85"/>:null;})}
          <circle cx="50" cy="50" r="22" fill="rgba(0,8,5,.9)"/>
          <text x="50" y="47" textAnchor="middle" fill="#00FFB0" fontSize="8" fontFamily="monospace">${total.toFixed(0)}</text>
          <text x="50" y="57" textAnchor="middle" fill="#1E5C3A" fontSize="6" fontFamily="monospace">USD</text>
        </svg>
        <div style={{marginTop:6}}>{alloc.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}><div style={{width:6,height:6,borderRadius:1,background:p.c,flexShrink:0}}/><span style={{fontSize:7,color:"#1E5C3A",fontFamily:"monospace"}}>{p.token} {p.pct.toFixed(0)}%</span></div>)}</div>
      </div>
    </div>
  </div>;
}

function AgentsPanel({ agentLogs }) {
  const AG=[{id:"SA",name:"ShieldAgent",role:"Vault monitoring & deposits",  load:Ri(8,20), s:"ACTIVE",c:"#00FFB0"},{id:"SW",name:"SwapAgent",role:"DEX routing & optimization",    load:Ri(4,15), s:"ACTIVE",c:"#4ADE80"},{id:"PV",name:"PrivacyAgent",role:"Stealth scanning",          load:Ri(25,45),s:"ACTIVE",c:"#00FFB0"},{id:"RK",name:"RiskAgent",role:"Anomaly scoring",              load:Ri(2,8),  s:"ACTIVE",c:"#4ADE80"},{id:"ZK",name:"ZKAgent",role:"Proof generation",                load:Ri(55,75),s:"ACTIVE",c:"#F59E0B"},{id:"BR",name:"BridgeAgent",role:"Cross-chain relay",          load:0,         s:"STANDBY",c:"#1E5C3A"},{id:"GO",name:"GovAgent",role:"Governance monitoring",           load:Ri(1,4),  s:"ACTIVE",c:"#4ADE80"},{id:"FE",name:"FeeAgent",role:"USDC fee oracle & sweep",        load:Ri(12,22),s:"ACTIVE",c:"#4ADE80"}];
  return <div style={{animation:"fi .3s ease"}}><PH icon="🤖" title="AI AGENT CLUSTER" sub="8 autonomous on-chain agents"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:12}}>
      {AG.map(a=><div key={a.id} style={{background:"rgba(0,0,0,.3)",border:`1px solid ${a.s==="ACTIVE"?"rgba(0,255,176,.1)":"rgba(0,255,176,.03)"}`,borderRadius:4,padding:"9px 11px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:a.s==="ACTIVE"?5:0}}><div><div style={{fontSize:9,color:a.s==="ACTIVE"?"#A7F3D0":"#1E5C3A",fontFamily:"monospace",fontWeight:700}}>{a.name}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",marginTop:1}}>{a.role}</div></div><div style={{display:"flex",alignItems:"center",gap:3}}><div style={{width:4,height:4,borderRadius:"50%",background:a.s==="ACTIVE"?a.c:"#1E5C3A",boxShadow:a.s==="ACTIVE"?`0 0 4px ${a.c}`:"none"}}/><span style={{fontSize:7,color:a.s==="ACTIVE"?a.c:"#1E5C3A",fontFamily:"monospace"}}>{a.s}</span></div></div>{a.s==="ACTIVE"&&<><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",marginBottom:2}}>CPU: {a.load}%</div><div style={{height:2,background:"#0A1F14",borderRadius:1}}><div style={{height:"100%",background:a.c,width:`${a.load}%`,boxShadow:a.load>60?`0 0 4px ${a.c}`:"none"}}/></div></>}</div>)}
    </div>
    <div style={{background:"#000A06",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"8px 10px",maxHeight:170,overflow:"auto"}}>
      <div style={{fontSize:7,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:5}}>LIVE LOG</div>
      {[...agentLogs].reverse().map((l,i)=><div key={i} style={{fontSize:8,fontFamily:"monospace",marginBottom:2,color:l.c,animation:i===0?"fi .3s ease":"none"}}><span style={{color:"#0A1F14",marginRight:5}}>[{l.t}]</span>{l.m}</div>)}
    </div>
  </div>;
}

function HistoryPanel({ txHistory }) {
  const [filter,setFilter]=useState("all");
  const demo=[{hash:"0x"+hx(64),label:"Shield ✓",ts:"12:43",amount:"500.00 USDC"},{hash:"0x"+hx(64),label:"Swap ✓",ts:"11:22",amount:"0.1928 WETH"},{hash:"0x"+hx(64),label:"Stake ✓",ts:"10:05",amount:"1000.00 USDC"},{hash:"0x"+hx(64),label:"Vote — PIP-03",ts:"09:31",amount:"—"}];
  const all=[...txHistory.map(t=>({...t,amount:"—"})),...demo];
  const filtered=filter==="all"?all:all.filter(t=>t.label.toLowerCase().includes(filter));
  return <div style={{animation:"fi .3s ease"}}><PH icon="📋" title="HISTORY" sub="On-chain activity log"/>
    <div style={{display:"flex",gap:4,marginBottom:9,flexWrap:"wrap"}}>{["all","shield","swap","send","withdraw","bridge","stake","vote"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{padding:"3px 7px",background:filter===f?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)",border:`1px solid ${filter===f?"rgba(0,255,176,.3)":"rgba(0,255,176,.06)"}`,borderRadius:3,color:filter===f?"#00FFB0":"#1E5C3A",fontSize:7,cursor:"pointer",fontFamily:"monospace",letterSpacing:".08em",textTransform:"uppercase",transition:"all .2s"}}>{f}</button>)}</div>
    {filtered.length===0?<div style={{textAlign:"center",padding:"20px 0",fontSize:9,color:"#0F3A22",fontFamily:"monospace"}}>No transactions</div>:filtered.map((t,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.05)",borderRadius:3,marginBottom:4}}>
      <div style={{width:5,height:5,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 3px #00FFB0",flexShrink:0}}/>
      <div style={{flex:1}}><div style={{fontSize:10,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{t.label}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",marginTop:1}}>{t.ts} · {t.hash.slice(0,14)}···</div></div>
      <div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#4ADE80",fontFamily:"monospace"}}>{t.amount}</div><a href={`${ARC.blockExplorers.default.url}/tx/${t.hash}`} target="_blank" style={{fontSize:7,color:"#1E5C3A",textDecoration:"none",fontFamily:"monospace"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>ARCScan ↗</a></div>
    </div>)}
  </div>;
}

function SettingsPanel({ testnet, toggleTestnet, account }) {
  const [slip,setSlip]=useState("0.5"); const [dl,setDl]=useState("20"); const [expert,setExpert]=useState(false); const [sound,setSound]=useState(false);
  const Tog=({on,onClick})=><div onClick={onClick} style={{width:30,height:16,background:on?"rgba(0,255,176,.2)":"rgba(0,0,0,.4)",border:`1px solid ${on?"rgba(0,255,176,.5)":"rgba(0,255,176,.12)"}`,borderRadius:8,cursor:"pointer",position:"relative",transition:"all .2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:on?15:2,width:10,height:10,borderRadius:"50%",background:on?"#00FFB0":"#1E5C3A",boxShadow:on?"0 0 4px #00FFB0":"none",transition:"all .2s"}}/></div>;
  const Sec=({t,c})=><div style={{marginBottom:10}}><div style={{fontSize:7,color:"#0F3A22",letterSpacing:".16em",fontFamily:"monospace",marginBottom:4,paddingBottom:3,borderBottom:"1px solid rgba(0,255,176,.05)"}}>{t}</div>{c}</div>;
  const Row=({label,sub,c})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:"rgba(0,0,0,.2)",borderRadius:3,marginBottom:3}}><div><div style={{fontSize:9,color:"#A7F3D0",fontFamily:"monospace"}}>{label}</div><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",marginTop:1}}>{sub}</div></div>{c}</div>;
  return <div style={{animation:"fi .3s ease"}}><PH icon="⚙" title="SETTINGS" sub="Network, transaction & interface"/>
    <Sec t="NETWORK" c={<><Row label="Network" sub={testnet?"ARC Testnet":"ARC Mainnet"} c={<Tog on={testnet} onClick={toggleTestnet}/>}/><Row label="RPC" sub={ARC.rpcUrls.default.http[0]} c={<span style={{fontSize:7,color:"#4ADE80",fontFamily:"monospace"}}>CONNECTED</span>}/><Row label="Explorer" sub="ARCScan" c={<a href={ARC.blockExplorers.default.url} target="_blank" style={{fontSize:7,color:"#00FFB0",fontFamily:"monospace",textDecoration:"none"}}>OPEN ↗</a>}/></>}/>
    <Sec t="TRANSACTION" c={<><Row label="Slippage" sub="Price tolerance" c={<div style={{display:"flex",gap:3}}>{["0.1","0.5","1.0"].map(v=><button key={v} onClick={()=>setSlip(v)} style={{padding:"2px 5px",background:slip===v?"rgba(0,255,176,.12)":"rgba(0,0,0,.3)",border:`1px solid ${slip===v?"rgba(0,255,176,.3)":"rgba(0,255,176,.06)"}`,borderRadius:2,color:slip===v?"#00FFB0":"#1E5C3A",fontSize:7,cursor:"pointer",fontFamily:"monospace"}}>{v}%</button>)}</div>}/><Row label="Deadline" sub="TX expiry" c={<div style={{display:"flex",gap:3}}>{["10","20","30"].map(v=><button key={v} onClick={()=>setDl(v)} style={{padding:"2px 5px",background:dl===v?"rgba(0,255,176,.12)":"rgba(0,0,0,.3)",border:`1px solid ${dl===v?"rgba(0,255,176,.3)":"rgba(0,255,176,.06)"}`,borderRadius:2,color:dl===v?"#00FFB0":"#1E5C3A",fontSize:7,cursor:"pointer",fontFamily:"monospace"}}>{v}m</button>)}</div>}/><Row label="Expert Mode" sub="Skip confirms" c={<Tog on={expert} onClick={()=>setExpert(!expert)}/>}/></>}/>
    <Sec t="INTERFACE" c={<Row label="Sound FX" sub="Proof & TX audio" c={<Tog on={sound} onClick={()=>setSound(!sound)}/>}/>}/>
    <Sec t="CONTRACTS" c={Object.entries(CONTRACTS).map(([k,v])=><Row key={k} label={k} sub={sh(v)} c={<span style={{fontSize:7,color:"#1E5C3A",fontFamily:"monospace"}}>{v.slice(-6)}</span>}/>)}/>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════ */
function Dashboard({ user, prices, changes }) {
  const {account,pub,wal,disconnect,testnet,toggleTestnet} = useW3();
  const { push } = useNotif();
  const [panel,setPanel]     = useState("overview");
  const [balances,setBalances]= useState({arc:0n,usdc:0n,shielded:0n});
  const [tx,setTx]           = useState(null);
  const [txHistory,setTxHistory]=useState([]);
  const [blockNum,setBlockNum]=useState(8420141);
  const [showNotif,setShowNotif]=useState(false);
  const [showSearch,setShowSearch]=useState(false);
  const [agentLogs,setAgentLogs]=useState([
    {t:"00:00:01",m:"ShieldAgent :: Monitoring deposit pool — 4.23M USDC",c:"#00FFB0"},
    {t:"00:00:03",m:"SwapAgent :: DEX route scan — 12 paths indexed",c:"#4ADE80"},
    {t:"00:00:07",m:"ZKAgent :: Proof batch ready — 0 pending",c:"#4ADE80"},
    {t:"00:00:12",m:"RiskAgent :: Volatility index: LOW (0.02)",c:"#4ADE80"},
  ]);
  const { notifs } = useNotif();
  const unread = notifs.filter(n=>!n.read).length;

  useEffect(()=>{ if(!pub||!account?.address)return; (async()=>{ const[arc,usdc,shielded]=await Promise.all([pub.getBalance(account.address),pub.readContract({functionName:"balanceOf"}),pub.readContract({functionName:"getShieldedBalance"})]); setBalances({arc,usdc,shielded}); })(); },[pub,account]);
  useEffect(()=>{ const id=setInterval(()=>setBlockNum(n=>n+1),6000); return()=>clearInterval(id); },[]);
  useEffect(()=>{
    const MSGS=[["ZKAgent :: Proof generated 1.82s","#00FFB0"],["ShieldAgent :: Pool nominal","#4ADE80"],["FeeAgent :: Oracle $1.0001","#4ADE80"],["PrivacyAgent :: Scan 0 notes","#4ADE80"],["RiskAgent :: Score 0.02","#4ADE80"],["SwapAgent :: Route refreshed","#4ADE80"],["BridgeAgent :: Idle","#1E5C3A"],["GovAgent :: No proposals","#1E5C3A"]];
    const id=setInterval(()=>{ if(Math.random()>.45){const[m,c]=MSGS[Ri(0,MSGS.length)]; setAgentLogs(p=>[...p.slice(-8),{t:tc(),m,c}]); if(Math.random()>.75) push(m,"info"); } },2500);
    return()=>clearInterval(id);
  },[]);

  // Keyboard shortcut: Cmd/Ctrl+K → search
  useEffect(()=>{
    const h=(e)=>{ if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);} if(e.key==="Escape"){setShowSearch(false);setShowNotif(false);} };
    window.addEventListener("keydown",h); return()=>window.removeEventListener("keydown",h);
  },[]);

  const notify=(label,message,status,hash)=>{ setTx({label,message,status,hash}); if(status==="success"&&hash){setTxHistory(p=>[{hash,label,ts:tc(),status:"success"},...p.slice(0,19)]);} push(`${label}: ${message}`,status==="success"?"success":status==="pending"?"info":"error",hash?`${ARC.blockExplorers.default.url}/tx/${hash}`:null); };
  const refreshBal=async()=>{ if(!pub||!account)return; const[arc,usdc,shielded]=await Promise.all([pub.getBalance(account.address),pub.readContract({functionName:"balanceOf"}),pub.readContract({functionName:"getShieldedBalance"})]); setBalances({arc,usdc,shielded}); };
  const handleExport=()=>exportReport(balances,account,prices,txHistory);

  const NAV=[
    {id:"overview",  icon:"◈", label:"Overview"},
    {id:"shield",    icon:"🛡",label:"Shield"},
    {id:"swap",      icon:"⇄", label:"Swap"},
    {id:"send",      icon:"↗", label:"Send"},
    {id:"withdraw",  icon:"↙", label:"Withdraw"},
    {id:"bridge",    icon:"⟺",label:"Bridge"},
    null, // divider
    {id:"analytics", icon:"📈",label:"Analytics"},
    {id:"zk",        icon:"🔐",label:"ZK Console"},
    {id:"governance",icon:"🗳",label:"Governance"},
    {id:"staking",   icon:"💎",label:"Staking"},
    null,
    {id:"portfolio", icon:"📊",label:"Portfolio"},
    {id:"agents",    icon:"🤖",label:"Agents"},
    {id:"history",   icon:"📋",label:"History"},
    {id:"settings",  icon:"⚙", label:"Settings"},
  ];

  return <div style={{display:"flex",height:"100vh",width:"100%",maxWidth:940,margin:"0 auto",position:"relative",zIndex:2}}>
    {showSearch&&<GlobalSearch onSelect={p=>{setPanel(p);setShowSearch(false);}} onClose={()=>setShowSearch(false)}/>}

    {/* Sidebar */}
    <div style={{width:50,flexShrink:0,background:"rgba(0,5,3,.96)",borderRight:"1px solid rgba(0,255,176,.08)",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:10,paddingBottom:10,gap:1}}>
      <div style={{width:28,height:28,border:"1.5px solid #00FFB0",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#00FFB0",boxShadow:"0 0 8px rgba(0,255,176,.2)",marginBottom:8}}>◈</div>
      <div style={{width:24,height:1,background:"rgba(0,255,176,.1)",marginBottom:4}}/>
      {NAV.map((n,i)=> n===null ? <div key={i} style={{width:24,height:1,background:"rgba(0,255,176,.06)",margin:"3px 0"}}/> :
        <button key={n.id} onClick={()=>setPanel(n.id)} title={n.label} style={{width:34,height:32,background:panel===n.id?"rgba(0,255,176,.12)":"transparent",border:`1px solid ${panel===n.id?"rgba(0,255,176,.3)":"transparent"}`,borderRadius:3,cursor:"pointer",color:panel===n.id?"#00FFB0":"#1E5C3A",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0}}
          onMouseEnter={e=>{if(panel!==n.id){e.currentTarget.style.background="rgba(0,255,176,.06)";e.currentTarget.style.color="#4ADE80";}}}
          onMouseLeave={e=>{if(panel!==n.id){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#1E5C3A";}}}>
          {n.icon}
        </button>
      )}
      <div style={{flex:1}}/>
      <div style={{width:6,height:6,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 5px #00FFB0",animation:"pulse 2s infinite",marginBottom:2}}/>
      <div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",letterSpacing:".04em"}}>{testnet?"TEST":"MAIN"}</div>
    </div>

    {/* Main */}
    <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {/* Price ticker */}
      <PriceTicker prices={prices} changes={changes}/>

      {/* Topbar */}
      <div style={{height:38,flexShrink:0,background:"rgba(0,5,3,.96)",borderBottom:"1px solid rgba(0,255,176,.08)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px",position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <Glitch text="privARC" style={{fontSize:13,fontWeight:800,color:"#00FFB0",fontFamily:"'Syne',sans-serif"}}/>
          <span style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",letterSpacing:".1em"}}>OS v3.0.0</span>
          <span style={{fontSize:7,background:"rgba(0,255,176,.08)",border:"1px solid rgba(0,255,176,.15)",borderRadius:2,padding:"1px 4px",color:"#00FFB0",fontFamily:"monospace"}}>{testnet?"TESTNET":"MAINNET"}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Search */}
          <button onClick={()=>setShowSearch(true)} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,padding:"3px 9px",cursor:"pointer",color:"#1E5C3A",fontSize:9,fontFamily:"monospace",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.3)";e.currentTarget.style.color="#00FFB0";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.1)";e.currentTarget.style.color="#1E5C3A";}}>
            <span>⌕</span><span style={{fontSize:8}}>Search</span><span style={{fontSize:7,background:"rgba(0,255,176,.08)",border:"1px solid rgba(0,255,176,.15)",borderRadius:2,padding:"0 4px",marginLeft:2}}>⌘K</span>
          </button>
          <span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>#{blockNum.toLocaleString()}</span>
          <div style={{height:11,width:1,background:"rgba(0,255,176,.1)"}}/>
          {/* Notifications bell */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowNotif(!showNotif)} style={{background:"none",border:"none",cursor:"pointer",color:unread>0?"#00FFB0":"#1E5C3A",fontSize:13,position:"relative",transition:"color .2s"}} onMouseEnter={e=>e.currentTarget.style.color="#00FFB0"} onMouseLeave={e=>e.currentTarget.style.color=unread>0?"#00FFB0":"#1E5C3A"}>
              🔔
              {unread>0&&<span style={{position:"absolute",top:-3,right:-3,width:14,height:14,background:"#EF4444",borderRadius:"50%",fontSize:8,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:700}}>{Math.min(unread,9)}</span>}
            </button>
            {showNotif&&<NotifCenter onClose={()=>setShowNotif(false)}/>}
          </div>
          <div style={{height:11,width:1,background:"rgba(0,255,176,.1)"}}/>
          <span style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>{sh(account?.address)}</span>
          <button onClick={disconnect} style={{fontSize:7,color:"#1E5C3A",background:"none",border:"1px solid rgba(0,255,176,.07)",borderRadius:2,padding:"2px 5px",cursor:"pointer",fontFamily:"monospace",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.color="#EF4444";e.currentTarget.style.borderColor="rgba(239,68,68,.25)";}} onMouseLeave={e=>{e.currentTarget.style.color="#1E5C3A";e.currentTarget.style.borderColor="rgba(0,255,176,.07)";}}>DISC.</button>
        </div>
      </div>

      {/* Panel */}
      <div style={{flex:1,padding:"12px",overflow:"auto"}}>
        {panel==="overview"  &&<OverviewPanel  balances={balances} pub={pub} agentLogs={agentLogs} setPanel={setPanel} prices={prices} changes={changes}/>}
        {panel==="shield"    &&<ShieldPanel    wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
        {panel==="swap"      &&<SwapPanel      wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
        {panel==="send"      &&<SendPanel      wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
        {panel==="withdraw"  &&<WithdrawPanel  wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
        {panel==="bridge"    &&<BridgePanel    wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
        {panel==="analytics" &&<AnalyticsPanel pub={pub}/>}
        {panel==="zk"        &&<ZKPanel        wal={wal} pub={pub} account={account} notify={notify}/>}
        {panel==="governance"&&<GovPanel       wal={wal} pub={pub} account={account} notify={notify}/>}
        {panel==="staking"   &&<StakingPanel   wal={wal} pub={pub} account={account} notify={notify}/>}
        {panel==="portfolio" &&<PortfolioPanel balances={balances} prices={prices} account={account} txHistory={txHistory} onExport={handleExport}/>}
        {panel==="agents"    &&<AgentsPanel    agentLogs={agentLogs}/>}
        {panel==="history"   &&<HistoryPanel   txHistory={txHistory}/>}
        {panel==="settings"  &&<SettingsPanel  testnet={testnet} toggleTestnet={toggleTestnet} account={account}/>}
      </div>
    </div>
    <TxToast tx={tx} onClose={()=>setTx(null)}/>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   AUTH CARD
}

function AuthCard({ onAuth }) {
  const { connect } = useW3();
  const [screen,setScreen]=useState("login"); const [showWC,setShowWC]=useState(false); const [loading,setLoading]=useState(false);
  const [lw,setLw]=useState(null); const [user,setUser]=useState(null); const [phase,setPhase]=useState("auth");
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [cpw,setCpw]=useState(""); const [agreed,setAgreed]=useState(false); const [errors,setErrors]=useState({});
  const validate=()=>{ const e={}; if(screen==="signup"&&!name.trim())e.name="Required"; if(!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))e.email="Invalid"; if(!pw||pw.length<8)e.pw="Min 8 chars"; if(screen==="signup"){if(pw!==cpw)e.cpw="Mismatch"; if(!agreed)e.agreed="Required";} return e; };
  const submit=async()=>{ const e=validate(); if(Object.keys(e).length){setErrors(e);return;} setErrors({}); setLoading(true); await sl(screen==="login"?1100:1500); setLoading(false); const u={name:name||email.split("@")[0],email}; setUser(u); if(screen==="signup"){const w=gW();setLw(w);setPhase("wallet");}else{await connect("0x"+hx(40),"Email",false);onAuth(u);} };
  const handleWC=async({address,wallet:w})=>{ setShowWC(false); setLoading(true); await connect(address,w.name,!!window.ethereum); setLoading(false); onAuth({name:w.name+" Operator",email:null}); };

  if(phase==="wallet"&&lw) return <div style={{width:"100%",maxWidth:420,...CS}}><WalletReveal wallet={lw} onContinue={async()=>{await connect(lw.address,"Email",false);onAuth(user);}}/></div>;

  const corners = ["tl","tr","bl","br"].map(p=><span key={p} style={{position:"absolute",zIndex:2,width:10,height:10,borderColor:"rgba(0,255,176,.25)",borderStyle:"solid",borderWidth:0,...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5})}}/>);

  return <>{showWC&&<WCModal onClose={()=>setShowWC(false)} onConnect={handleWC}/>}
    <div style={{width:"100%",maxWidth:420,...CS}}>{corners}
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}><div style={{width:27,height:27,border:"1.5px solid #00FFB0",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#00FFB0",boxShadow:"0 0 8px rgba(0,255,176,.18)"}}>◈</div><Glitch text="privARC" style={{fontSize:18,fontWeight:800,color:"#00FFB0",fontFamily:"'Syne',sans-serif",letterSpacing:"-.01em"}}/><span style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",letterSpacing:".1em",alignSelf:"flex-end",paddingBottom:1}}>OS v3</span></div>
        <p style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace",letterSpacing:".05em",lineHeight:1.6}}>Autonomous crypto OS · Private capital · 8 AI agents · ARC Network</p>
      </div>
      <div style={{display:"flex",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,overflow:"hidden",marginBottom:18}}>
        {["login","signup"].map(s=><button key={s} onClick={()=>{setScreen(s);setErrors({});}} style={{flex:1,padding:"7px 0",background:screen===s?"rgba(0,255,176,.08)":"transparent",border:"none",borderRight:s==="login"?"1px solid rgba(0,255,176,.1)":"none",color:screen===s?"#00FFB0":"#1E5C3A",fontSize:8,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".15em",textTransform:"uppercase",transition:"all .2s"}}>{s==="login"?"[ AUTH ]":"[ REGISTER ]"}</button>)}
      </div>

      {screen==="login"&&<div style={{animation:"fi .3s ease"}}>
        <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email}/>
        <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••••••" icon="⚿" error={errors.pw}/>
        <div style={{textAlign:"right",marginTop:-5,marginBottom:13}}><a href="#" style={{fontSize:7,color:"#1E5C3A",textDecoration:"none",fontFamily:"monospace",transition:"color .2s"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>RECOVER ACCESS →</a></div>
        <ArcBtn label="⟶ Authenticate" onClick={submit} loading={loading}/>
        <div style={{margin:"13px 0 10px",display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/><span style={{fontSize:7,color:"#0A1F14",fontFamily:"monospace"}}>OR CONNECT WITH</span><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:5}}>
          {WALLETS.filter(w=>w.popular).map(w=><button key={w.id} onClick={()=>setShowWC(true)} style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.06)",borderRadius:4,padding:"7px 3px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${w.color}44`;e.currentTarget.style.background=`${w.color}0A`;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.06)";e.currentTarget.style.background="rgba(0,0,0,.3)";}}>
            <div style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center"}}>{w.icon}</div><span style={{fontSize:7,color:"#1E5C3A",fontFamily:"monospace"}}>{w.name.split(" ")[0]}</span>
          </button>)}
        </div>
        <button onClick={()=>setShowWC(true)} style={{width:"100%",padding:"7px 0",background:"transparent",border:"1px solid rgba(0,255,176,.06)",borderRadius:3,color:"#0F3A22",fontSize:8,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:6}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.2)";e.currentTarget.style.color="#1E5C3A";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.06)";e.currentTarget.style.color="#0F3A22";}}>⬡ More wallets (8 supported)</button>
      </div>}

      {screen==="signup"&&<div style={{animation:"fi .3s ease"}}>
        <OsField label="OPERATOR NAME" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" icon="⊹" error={errors.name}/>
        <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email}/>
        <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 8 characters" icon="⚿" error={errors.pw}/>
        <PassStr pw={pw}/>
        <OsField label="CONFIRM" type="password" value={cpw} onChange={e=>setCpw(e.target.value)} placeholder="Repeat" icon="⚿" error={errors.cpw}/>
        <div style={{border:"1px solid rgba(0,255,176,.1)",borderRadius:3,background:"rgba(0,255,176,.02)",padding:"6px 9px",marginBottom:9}}><div style={{fontSize:7,color:"#00FFB0",letterSpacing:".12em",fontFamily:"monospace",marginBottom:2}}>AUTO WALLET INIT</div><p style={{margin:0,fontSize:8,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>ARC Network wallet generated. Key + 12-word phrase provided.</p></div>
        <div style={{marginBottom:errors.agreed?2:13}}><label style={{display:"flex",alignItems:"flex-start",gap:7,cursor:"pointer"}}><div onClick={()=>setAgreed(!agreed)} style={{width:13,height:13,border:`1px solid ${agreed?"#00FFB0":"rgba(0,255,176,.2)"}`,borderRadius:2,flexShrink:0,marginTop:1,background:agreed?"rgba(0,255,176,.12)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s",color:"#00FFB0",fontSize:8}}>{agreed&&"✓"}</div><span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>I accept <a href="#" style={{color:"#1E5C3A",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Terms</a> & <a href="#" style={{color:"#1E5C3A",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Privacy</a></span></label>{errors.agreed&&<div style={{fontSize:8,color:"#EF4444",fontFamily:"monospace",marginTop:2,marginLeft:20}}>Required</div>}</div>
        <ArcBtn label="⟶ Create account & wallet" onClick={submit} loading={loading}/>
        <div style={{margin:"11px 0 9px",display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/><span style={{fontSize:7,color:"#0A1F14",fontFamily:"monospace"}}>OR</span><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/></div>
        <button onClick={()=>setShowWC(true)} style={{width:"100%",padding:"7px 0",background:"transparent",border:"1px solid rgba(0,255,176,.06)",borderRadius:3,color:"#0F3A22",fontSize:8,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:6}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.2)";e.currentTarget.style.color="#1E5C3A";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.06)";e.currentTarget.style.color="#0F3A22";}}>⬡ Register with existing wallet</button>
      </div>}

      <div style={{marginTop:14,paddingTop:8,borderTop:"1px solid rgba(0,255,176,.04)",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:7,color:"#0A1F14",fontFamily:"monospace"}}>🔒 EIP-4361 · Viem · ZK</span><span style={{fontSize:7,color:"#0A1F14",fontFamily:"monospace"}}>USDC FEES · ARC 7070</span></div>
    </div>
  </>;
}

const CS = {background:"rgba(0,8,5,.94)",backdropFilter:"blur(20px)",border:"1px solid rgba(0,255,176,.12)",borderRadius:4,boxShadow:"0 0 60px rgba(0,255,176,.04),0 40px 80px rgba(0,0,0,.85)",padding:"24px 24px 20px",position:"relative",animation:"fu .6s ease forwards"};

/* ═══════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════ */
function AppCore() {
  const [booted,setBooted]   = useState(false);
  const [user,setUser]       = useState(null);
  const [showTour,setShowTour]= useState(false);
  const { prices, changes }  = usePriceFeed();

  const handleAuth = (u) => { setUser(u); setTimeout(()=>setShowTour(true), 400); };

  return <>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{background:#000A06;overflow:hidden;}
      input,select,button,textarea{font-family:'JetBrains Mono',monospace;}
      input::placeholder,textarea::placeholder{color:#0A1F14!important;}
      select option{background:#000A06;color:#A7F3D0;}
      @keyframes fi{from{opacity:0}to{opacity:1}}
      @keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.9)}}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes g1{0%,89%,100%{opacity:0}90%{opacity:.8;transform:translateX(-3px)}95%{opacity:0;transform:translateX(3px)}}
      @keyframes g2{0%,93%,100%{opacity:0}94%{opacity:.6;transform:translateX(3px)}98%{opacity:0;transform:translateX(-2px)}}
      ::-webkit-scrollbar{width:3px;height:3px;}
      ::-webkit-scrollbar-track{background:#000A06;}
      ::-webkit-scrollbar-thumb{background:rgba(0,255,176,.18);border-radius:2px;}
    `}</style>
    <HexGrid/>
    {!booted&&<Boot onDone={()=>setBooted(true)}/>}
    <ChainBanner/>
    {showTour&&<OnboardingTour onFinish={()=>setShowTour(false)}/>}
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:user?"0":"24px 16px",position:"relative",zIndex:1,opacity:booted?1:0,transition:"opacity .6s ease .2s",overflow:"hidden"}}>
      {!user ? <AuthCard onAuth={handleAuth}/> : <Dashboard user={user} prices={prices} changes={changes}/>}
    </div>
  </>;
}

export default function PrivARCOS() {
  return (
    <Web3Provider>
      <NotifProvider>
        <AppCore/>
      </NotifProvider>
    </Web3Provider>
  );
}
