import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   CHAIN CONFIG
═══════════════════════════════════════════════════════════════ */
const ARC = {
  id: 7070, name: "ARC Network", shortName: "ARC", hex: "0x1BA2",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arcnetwork.io"] } },
  blockExplorers: { default: { name: "ARCScan", url: "https://scan.arcnetwork.io" } },
};
const ARC_TESTNET = { ...ARC, id: 7071, name: "ARC Testnet", hex: "0x1BA3", testnet: true };

const CONTRACTS = {
  ShieldVault:  "0x7f3A4e9C2b8D1F0a3E5c7b9D2e4F6A8c0B2d4E6f",
  NoteRegistry: "0x3A5c7E9b1D3f5A7c9E1b3D5f7A9c1E3b5D7f9A1c",
  VerifierZK:   "0x9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D1f3A5c7E",
  FeeCollector: "0x1b3D5f7A9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D",
  USDC:         "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const rnd = (min,max) => Math.random()*(max-min)+min;
const hex = (n) => Array.from({length:n},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
const fmt6 = (v) => (Number(v)/1e6).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtE = (v) => (Number(v)/1e18).toFixed(4);
const short = (a) => a ? a.slice(0,8)+"···"+a.slice(-6) : "---";
const ts = () => { const n=new Date(); return [n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":"); };

const WORDLIST = ["abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse","access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act","action","actor","actress","actual","adapt","add","addict","address","adjust","admit","adult","advance","advice","aerobic","afford","afraid","again","agent","agree","ahead","aim","air","airport","aisle","alarm","album","alcohol","alert"];
const genWallet = () => ({ privateKey:"0x"+hex(64), address:"0x"+hex(40), mnemonic:Array.from({length:12},()=>WORDLIST[Math.floor(Math.random()*WORDLIST.length)]).join(" "), network:"ARC Network", created:new Date().toISOString() });

/* ═══════════════════════════════════════════════════════════════
   VIEM-COMPATIBLE SIM CLIENTS
═══════════════════════════════════════════════════════════════ */
const mkPublicClient = (chain) => ({
  chain,
  getBalance: async()=>{ await sleep(500); return BigInt(Math.floor(rnd(0.1,4.8)*1e18)); },
  readContract: async({functionName})=>{ await sleep(300);
    if(functionName==="balanceOf") return BigInt(Math.floor(rnd(100,48000)*1e6));
    if(functionName==="getShieldedBalance") return BigInt(Math.floor(rnd(0,11500)*1e6));
    if(functionName==="getTotalShielded") return BigInt(4_230_841*1e6);
    if(functionName==="getTVL") return BigInt(18_450_000*1e6);
    if(functionName==="getAPY") return 420n;
    return 0n;
  },
  estimateGas: async()=>{ await sleep(180); return BigInt(Math.floor(rnd(160000,220000))); },
  getGasPrice: async()=>{ await sleep(120); return BigInt(Math.floor(rnd(0.8,2.5)*1e9)); },
  getBlockNumber: async()=>{ await sleep(100); return BigInt(8_420_141+Math.floor(Math.random()*100)); },
  waitForTransactionReceipt: async(hash)=>{ await sleep(rnd(1800,3200)); return {transactionHash:hash,status:"success",blockNumber:BigInt(8420141+Math.floor(Math.random()*200))}; },
});

const mkWalletClient = (address,chain) => ({
  account:{address}, chain,
  writeContract: async()=>{ await sleep(rnd(700,1400)); return "0x"+hex(64); },
  sendTransaction: async()=>{ await sleep(rnd(800,1500)); return "0x"+hex(64); },
  signMessage: async()=>{ await sleep(300); return "0x"+hex(130); },
  switchChain: async({id})=>{ await sleep(500); return true; },
  addChain: async()=>{ await sleep(600); return true; },
});

const connectReal = async (chain) => {
  if(!window.ethereum) throw new Error("NO_PROVIDER");
  const accounts = await window.ethereum.request({method:"eth_requestAccounts"});
  if(!accounts?.[0]) throw new Error("USER_REJECTED");
  try {
    await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:chain.hex}]});
  } catch(e) {
    if(e.code===4902) await window.ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:chain.hex,chainName:chain.name,nativeCurrency:chain.nativeCurrency,rpcUrls:chain.rpcUrls.default.http,blockExplorerUrls:[chain.blockExplorers.default.url]}]});
  }
  const chainId = await window.ethereum.request({method:"eth_chainId"});
  return {address:accounts[0],chainId};
};

/* ═══════════════════════════════════════════════════════════════
   WEB3 CONTEXT
═══════════════════════════════════════════════════════════════ */
const W3 = createContext(null);
function Web3Provider({children}) {
  const [account, setAccount]   = useState(null);
  const [pub, setPub]           = useState(null);
  const [wal, setWal]           = useState(null);
  const [chainOk, setChainOk]   = useState(false);
  const [switching, setSwitching]= useState(false);
  const [testnet, setTestnet]   = useState(false);

  const connect = useCallback(async(address,walletName,tryReal=false)=>{
    let addr=address, cid=ARC.id;
    if(tryReal&&window.ethereum) {
      try { const r=await connectReal(ARC); addr=r.address; cid=parseInt(r.chainId,16); } catch{}
    }
    const chain = testnet?ARC_TESTNET:ARC;
    setPub(mkPublicClient(chain)); setWal(mkWalletClient(addr,chain));
    setAccount({address:addr,chainId:cid,walletName});
    setChainOk(cid===chain.id);
  },[testnet]);

  const switchARC = useCallback(async()=>{
    if(!wal||!account) return; setSwitching(true);
    try { await wal.switchChain({id:ARC.id}); setAccount(a=>({...a,chainId:ARC.id})); setChainOk(true); }
    finally { setSwitching(false); }
  },[wal,account]);

  const disconnect = useCallback(()=>{ setAccount(null);setPub(null);setWal(null);setChainOk(false); },[]);
  const toggleTestnet = useCallback(()=>setTestnet(t=>!t),[]);

  return <W3.Provider value={{account,pub,wal,chainOk,switching,testnet,connect,switchARC,disconnect,toggleTestnet}}>{children}</W3.Provider>;
}
const useW3 = () => useContext(W3);

/* ═══════════════════════════════════════════════════════════════
   HEX GRID BACKGROUND
═══════════════════════════════════════════════════════════════ */
function HexGrid() {
  const ref = useRef(null);
  useEffect(()=>{
    const c=ref.current,ctx=c.getContext("2d"); let raf,t=0;
    const rz=()=>{c.width=window.innerWidth;c.height=window.innerHeight;};
    rz(); window.addEventListener("resize",rz);
    const dh=(x,y,r,a,f)=>{ ctx.beginPath(); for(let i=0;i<6;i++){const ang=(Math.PI/3)*i-Math.PI/6; i===0?ctx.moveTo(x+r*Math.cos(ang),y+r*Math.sin(ang)):ctx.lineTo(x+r*Math.cos(ang),y+r*Math.sin(ang));} ctx.closePath(); if(f){ctx.fillStyle=f;ctx.fill();} ctx.strokeStyle=`rgba(0,255,180,${a})`;ctx.lineWidth=.5;ctx.stroke(); };
    const draw=()=>{ t+=.008; ctx.clearRect(0,0,c.width,c.height); const g=ctx.createRadialGradient(c.width*.5,c.height*.4,0,c.width*.5,c.height*.4,c.width*.7); g.addColorStop(0,"rgba(0,20,12,1)");g.addColorStop(1,"rgba(0,8,5,1)");ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height); const R=38,cols=Math.ceil(c.width/(R*1.73))+2,rows=Math.ceil(c.height/(R*1.5))+2; for(let row=-1;row<rows;row++)for(let col=-1;col<cols;col++){const x=col*R*1.73+(row%2===0?0:R*.865),y=row*R*1.5,d=Math.sqrt((x-c.width*.5)**2+(y-c.height*.4)**2),wave=Math.sin(d*.012-t*1.8)*.5+.5,pulse=Math.sin(t*.7+col*.3+row*.5)*.3+.3,alpha=wave*pulse*.4; dh(x,y,R-2,alpha,alpha>.18?`rgba(0,255,160,${alpha*.06})`:null);} for(let y=0;y<c.height;y+=3){ctx.fillStyle="rgba(0,0,0,0.06)";ctx.fillRect(0,y,c.width,1);} raf=requestAnimationFrame(draw); };
    draw(); return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",rz);};
  },[]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}/>;
}

/* ═══════════════════════════════════════════════════════════════
   BOOT SEQUENCE
═══════════════════════════════════════════════════════════════ */
function Boot({onDone}) {
  const [lines,setLines]=useState([]),  [done,setDone]=useState(false);
  const BL=[
    {t:0,   c:"#00FFB0",m:"PRIVARC OS v2.5.0  ——  ARC Network"},
    {t:280, c:"#4ADE80",m:"Initializing viem client layer...  ✓"},
    {t:560, c:"#4ADE80",m:"ZK-proof engine [Groth16 + PLONK]  ✓"},
    {t:840, c:"#4ADE80",m:"ARC Network RPC  chainId:7070  ✓"},
    {t:1120,c:"#4ADE80",m:"ShieldVault  0x7f3A···4E6f  ✓"},
    {t:1400,c:"#4ADE80",m:"NoteRegistry  0x3A5c···9A1c  ✓"},
    {t:1680,c:"#00FFB0",m:"AI Agent cluster  ONLINE  (8/8 nodes)"},
    {t:1960,c:"#4ADE80",m:"USDC fee oracle  live  $1.0001"},
    {t:2240,c:"#F59E0B",m:"Privacy layer  ARMED  — stealth enabled"},
    {t:2600,c:"#00FFB0",m:"━━━  SYSTEM READY  ━━━  AUTHENTICATE TO PROCEED  ━━━"},
  ];
  useEffect(()=>{ BL.forEach(({t,c,m})=>setTimeout(()=>setLines(p=>[...p,{c,m}]),t)); setTimeout(()=>{setDone(true);setTimeout(onDone,500);},3200); },[]);
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,background:"#000A06",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 10vw",fontFamily:"'JetBrains Mono',monospace",opacity:done?0:1,transition:"opacity .5s",pointerEvents:done?"none":"all"}}>
      <div style={{marginBottom:24}}><div style={{fontSize:10,color:"#1A4A30",letterSpacing:".3em",marginBottom:6}}>PRIVARC AUTONOMOUS CRYPTO OPERATING SYSTEM</div><div style={{width:48,height:1.5,background:"#00FFB0",marginBottom:20}}/></div>
      {lines.map((l,i)=><div key={i} style={{fontSize:12,color:l.c,marginBottom:4,letterSpacing:".05em",lineHeight:1.6,animation:"fi .3s ease"}}><span style={{color:"#1A4A30",marginRight:10}}>[{String(i).padStart(2,"0")}]</span>{l.m}</div>)}
      {lines.length>0&&<div style={{marginTop:18,height:1.5,background:"#0A2018",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:0,height:"100%",background:"linear-gradient(90deg,#00FFB0,#0EA5E9)",width:`${Math.min(100,(lines.length/BL.length)*100)}%`,transition:"width .28s",boxShadow:"0 0 8px #00FFB0"}}/></div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CHAIN SWITCH BANNER
═══════════════════════════════════════════════════════════════ */
function ChainBanner() {
  const {chainOk,switchARC,switching,account}=useW3();
  if(!account||chainOk) return null;
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:150,background:"rgba(245,158,11,.1)",borderBottom:"1px solid rgba(245,158,11,.3)",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"monospace",backdropFilter:"blur(8px)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:"#F59E0B"}}>⚠</span><span style={{fontSize:11,color:"#FCD34D",letterSpacing:".06em"}}>Wrong network — PrivARC requires <b>ARC Network (7070)</b></span></div>
      <button onClick={switchARC} disabled={switching} style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.4)",borderRadius:3,color:"#F59E0B",fontSize:10,padding:"5px 12px",cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",display:"flex",alignItems:"center",gap:7}}>{switching?<><Spinner/>Switching...</>:"⟶ SWITCH TO ARC"}</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MICRO COMPONENTS
═══════════════════════════════════════════════════════════════ */
const Spinner = ({sz=12,col="#00FFB0"}) => <span style={{width:sz,height:sz,border:`1.5px solid rgba(0,255,176,.2)`,borderTop:`1.5px solid ${col}`,borderRadius:"50%",animation:"spin .7s linear infinite",display:"inline-block",flexShrink:0}}/>;

function Glitch({text,style}) {
  return <span style={{position:"relative",display:"inline-block",...style}}><span style={{position:"relative",zIndex:1}}>{text}</span><span style={{position:"absolute",top:0,left:0,color:"#00FFB0",opacity:0,animation:"g1 4s infinite",clipPath:"polygon(0 30%,100% 30%,100% 50%,0 50%)",transform:"translateX(-2px)"}}>{text}</span><span style={{position:"absolute",top:0,left:0,color:"#0EA5E9",opacity:0,animation:"g2 4s infinite",clipPath:"polygon(0 60%,100% 60%,100% 80%,0 80%)",transform:"translateX(2px)"}}>{text}</span></span>;
}

function ArcBtn({label,onClick,loading,disabled,variant="primary"}) {
  const pri = variant==="primary";
  return (
    <button onClick={onClick} disabled={loading||disabled} style={{width:"100%",padding:"12px 0",background:"transparent",border:`1px solid ${disabled||loading?"rgba(0,255,176,.18)":pri?"#00FFB0":"rgba(0,255,176,.35)"}`,borderRadius:3,color:disabled||loading?"#1E5C3A":pri?"#00FFB0":"#4ADE80",fontSize:11,fontWeight:700,cursor:disabled||loading?"not-allowed":"pointer",fontFamily:"monospace",letterSpacing:".18em",boxShadow:disabled||loading?"none":pri?"0 0 20px rgba(0,255,176,.1)":"none",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .2s",textTransform:"uppercase"}}
      onMouseEnter={e=>!disabled&&!loading&&(e.currentTarget.style.background=pri?"rgba(0,255,176,.08)":"rgba(0,255,176,.04)")}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {loading?<><Spinner/> Processing...</>:label}
    </button>
  );
}

function OsField({label,type="text",value,onChange,placeholder,icon,error,readOnly,suffix,hint}) {
  const [foc,setFoc]=useState(false); const [sp,setSp]=useState(false); const isP=type==="password";
  return (
    <div style={{marginBottom:15}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <label style={{fontSize:9,fontWeight:700,letterSpacing:".15em",textTransform:"uppercase",color:foc?"#00FFB0":"#1E5C3A",fontFamily:"monospace",transition:"color .2s"}}>{icon&&<span style={{marginRight:4}}>{icon}</span>}{label}</label>
        {error&&<span style={{fontSize:9,color:"#EF4444"}}>⚠ {error}</span>}
      </div>
      <div style={{position:"relative"}}>
        {["tl","tr","bl","br"].map(p=><span key={p} style={{position:"absolute",zIndex:2,width:6,height:6,borderColor:foc?"#00FFB0":error?"#EF4444":"#1A4A30",borderStyle:"solid",borderWidth:0,transition:"border-color .2s",...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5})}}/>)}
        <input type={isP&&!sp?"password":"text"} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly} onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
          style={{width:"100%",boxSizing:"border-box",padding:`10px ${suffix?"60px":"36px"} 10px 12px`,background:foc?"rgba(0,255,176,.03)":readOnly?"rgba(0,255,176,.01)":"rgba(0,0,0,.4)",border:`1px solid ${error?"#EF4444":foc?"rgba(0,255,176,.4)":"rgba(0,255,176,.1)"}`,borderRadius:3,color:"#A7F3D0",fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",letterSpacing:".04em",boxShadow:foc?"0 0 14px rgba(0,255,176,.04)":"none",transition:"all .2s",cursor:readOnly?"default":"text"}}/>
        {suffix&&<span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"#1E5C3A",fontFamily:"monospace",pointerEvents:"none"}}>{suffix}</span>}
        {isP&&<button onClick={()=>setSp(!sp)} style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:sp?"#00FFB0":"#1E5C3A",fontSize:12,padding:0}}>{sp?"◉":"◎"}</button>}
      </div>
      {hint&&!error&&<div style={{marginTop:3,fontSize:9,color:"#0F3A22",fontFamily:"monospace"}}>{hint}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TX TOAST
═══════════════════════════════════════════════════════════════ */
function TxToast({tx,onClose}) {
  useEffect(()=>{ if(tx?.status==="success"||tx?.status==="error"){const id=setTimeout(onClose,6000);return()=>clearTimeout(id);} },[tx]);
  if(!tx) return null;
  const C={pending:"#F59E0B",success:"#00FFB0",error:"#EF4444"};
  const I={pending:"⏳",success:"✓",error:"✕"};
  return (
    <div style={{position:"fixed",bottom:24,right:24,zIndex:400,background:"rgba(0,8,5,.97)",border:`1px solid ${C[tx.status]}33`,borderRadius:5,padding:"13px 16px",minWidth:290,maxWidth:360,fontFamily:"monospace",animation:"fu .3s ease",backdropFilter:"blur(12px)",boxShadow:`0 0 28px ${C[tx.status]}14`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{fontSize:15,color:C[tx.status],flexShrink:0}}>{I[tx.status]}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:C[tx.status],fontWeight:700,letterSpacing:".08em",marginBottom:2}}>{tx.label}</div>
          <div style={{fontSize:9,color:"#1E5C3A",lineHeight:1.5}}>{tx.message}</div>
          {tx.hash&&<a href={`${ARC.blockExplorers.default.url}/tx/${tx.hash}`} target="_blank" style={{fontSize:8,color:"#00FFB0",textDecoration:"none",display:"block",marginTop:3}}>{tx.hash.slice(0,20)}···  ↗ ARCScan</a>}
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#1E5C3A",cursor:"pointer",fontSize:11,padding:0,flexShrink:0}}>✕</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WALLET CONNECT MODAL
═══════════════════════════════════════════════════════════════ */
const WALLETS = [
  {id:"metamask",   name:"MetaMask",     popular:true,  color:"#E2761B",glow:"rgba(226,118,27,.3)",installed:()=>!!window.ethereum?.isMetaMask, icon:<svg viewBox="0 0 40 40" width="30" height="30"><path d="M36.4 3L22.3 13.3l2.6-6.1L36.4 3z" fill="#E17726"/><path d="M3.6 3l14 10.4-2.5-6.2L3.6 3z" fill="#E27625"/><path d="M31.1 27.5l-3.8 5.8 8.1 2.2 2.3-7.9-6.6-.1z" fill="#E27625"/><path d="M2.3 27.6l2.3 7.9 8.1-2.2-3.8-5.8-6.6.1z" fill="#E27625"/><path d="M12.3 18.1l-2.2 3.4 7.9.4-.3-8.5-5.4 4.7z" fill="#E27625"/><path d="M27.7 18.1l-5.5-4.8-.3 8.6 7.9-.4-2.1-3.4z" fill="#E27625"/><path d="M22.1 21.9l.5-8.6-2.3-6.2h-4.6l-2.3 6.2.5 8.6.2 2.6v6.1h3.8l.1-6.1.2-2.6z" fill="#F5841F"/></svg>},
  {id:"rabby",      name:"Rabby",        popular:true,  color:"#7B68EE",glow:"rgba(123,104,238,.3)",installed:()=>!!window.ethereum?.isRabby,    icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#7B68EE"/><ellipse cx="20" cy="19" rx="12" ry="10" fill="white" opacity=".95"/><circle cx="15" cy="17" r="2.5" fill="#7B68EE"/><circle cx="25" cy="17" r="2.5" fill="#7B68EE"/><circle cx="15.8" cy="16.2" r="1" fill="white"/><circle cx="25.8" cy="16.2" r="1" fill="white"/><path d="M15 22 Q20 26 25 22" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>},
  {id:"wc",         name:"WalletConnect",popular:true,  color:"#3B99FC",glow:"rgba(59,153,252,.3)",  installed:()=>true,                         icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#3B99FC"/><path d="M11.2 15.8C15.9 11.1 23.5 11.1 28.2 15.8l.6.6c.2.2.2.5 0 .7L27 18.9c-.1.1-.3.1-.4 0l-.8-.8C22.6 14.9 17.4 14.9 14.2 18.1l-.8.8c-.1.1-.3.1-.4 0L11.2 17.1c-.2-.2-.2-.5 0-.7l.6-.6z" fill="white"/><path d="M30.6 18.2l1.6 1.6c.2.2.2.5 0 .7L24.5 28.2c-.2.2-.5.2-.7 0l-5.3-5.3c-.1-.1-.2-.1-.3 0l-5.3 5.3c-.2.2-.5.2-.7 0L4.5 20.5c-.2-.2-.2-.5 0-.7l1.6-1.6c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0l5.3-5.3c.2-.2.5-.2.7 0l5.3 5.3c.1.1.2.1.3 0l5.3-5.3c.2-.2.5-.2.7 0l-.6.1z" fill="white"/></svg>},
  {id:"coinbase",   name:"Coinbase",     popular:true,  color:"#0052FF",glow:"rgba(0,82,255,.3)",    installed:()=>!!window.ethereum?.isCoinbaseWallet, icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#0052FF"/><circle cx="20" cy="20" r="11" fill="white"/><rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF"/></svg>},
  {id:"trust",      name:"Trust Wallet", popular:false, color:"#3375BB",glow:"rgba(51,117,187,.3)", installed:()=>!!window.ethereum?.isTrust,     icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#3375BB"/><path d="M20 8L30 12v9c0 5.5-4.5 10-10 11C9.5 31 5 26.5 5 21v-9z" fill="white" opacity=".9"/><path d="M16 20l3 3 5-6" stroke="#3375BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>},
  {id:"okx",        name:"OKX Wallet",   popular:false, color:"#000",  glow:"rgba(255,255,255,.1)", installed:()=>!!window.okxwallet,             icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#111"/><rect x="8" y="8" width="10" height="10" rx="2" fill="white"/><rect x="22" y="8" width="10" height="10" rx="2" fill="white"/><rect x="8" y="22" width="10" height="10" rx="2" fill="white"/><rect x="22" y="22" width="10" height="10" rx="2" fill="white"/></svg>},
  {id:"tokenpocket",name:"TokenPocket",  popular:false, color:"#2980FE",glow:"rgba(41,128,254,.3)",installed:()=>!!window.ethereum?.isTokenPocket,icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#2980FE"/><rect x="8" y="12" width="24" height="6" rx="3" fill="white" opacity=".9"/><rect x="8" y="22" width="16" height="6" rx="3" fill="white" opacity=".6"/></svg>},
  {id:"brave",      name:"Brave",        popular:false, color:"#FF5000",glow:"rgba(255,80,0,.3)",  installed:()=>!!window.ethereum?.isBraveWallet,icon:<svg viewBox="0 0 40 40" width="30" height="30"><rect width="40" height="40" rx="10" fill="#FF5000"/><path d="M20 7L28 11 31 20 26 29 20 33 14 29 9 20 12 11z" fill="white" opacity=".9"/><circle cx="20" cy="20" r="3" fill="#FF5000"/></svg>},
];

function WCModal({onClose,onConnect}) {
  const [step,setStep]=useState("list"); const [sel,setSel]=useState(null); const [addr,setAddr]=useState("");
  const doConnect=async(w)=>{setSel(w);setStep("connecting");await sleep(1000+Math.random()*800);setAddr("0x"+hex(40));setStep("sign");};
  const doSign=async()=>{setStep("connecting");await sleep(900);setStep("success");setTimeout(()=>onConnect({address:addr,wallet:sel}),1000);};
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,zIndex:250,background:"rgba(0,0,0,.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fi .2s ease"}}>
      <div style={{width:"100%",maxWidth:400,background:"rgba(0,8,5,.97)",border:"1px solid rgba(0,255,176,.18)",borderRadius:6,overflow:"hidden",animation:"fu .25s ease",boxShadow:"0 40px 80px rgba(0,0,0,.9)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"15px 18px 13px",borderBottom:"1px solid rgba(0,255,176,.08)"}}>
          <div><div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:2}}>WALLET CONNECTION</div><div style={{fontSize:13,fontWeight:700,color:"#00FFB0",fontFamily:"monospace"}}>{step==="list"?"Select Provider":step==="connecting"?`Connecting ${sel?.name}...`:step==="sign"?"Sign Auth Request":"Connected ✓"}</div></div>
          <button onClick={onClose} style={{background:"none",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,color:"#1E5C3A",width:27,height:27,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.3)";e.currentTarget.style.color="#00FFB0";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.1)";e.currentTarget.style.color="#1E5C3A";}}>✕</button>
        </div>
        <div style={{padding:"16px 18px 18px"}}>
          {step==="list"&&<div style={{animation:"fi .3s ease"}}>
            <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:7}}>▸ POPULAR</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
              {WALLETS.filter(w=>w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>doConnect(w)}/>)}
            </div>
            <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:7}}>▸ MORE</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {WALLETS.filter(w=>!w.popular).map(w=><WBtn key={w.id} w={w} onClick={()=>doConnect(w)}/>)}
            </div>
            <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid rgba(0,255,176,.05)",fontSize:8,color:"#0A1F14",fontFamily:"monospace",textAlign:"center"}}>EIP-4361 · Sign-In With Ethereum · ARC Network</div>
          </div>}
          {step==="connecting"&&sel&&<div style={{textAlign:"center",padding:"18px 0",animation:"fi .3s ease"}}>
            <div style={{position:"relative",width:70,height:70,margin:"0 auto 16px"}}>
              <div style={{width:70,height:70,borderRadius:"50%",border:`2px solid ${sel.color}22`,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel.icon}</div>
              <svg style={{position:"absolute",inset:0,animation:"spin 1.2s linear infinite"}} width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="32" fill="none" stroke={sel.color} strokeWidth="1.5" strokeDasharray="55 160" strokeLinecap="round"/></svg>
            </div>
            <div style={{fontSize:12,color:"#A7F3D0",fontFamily:"monospace"}}>Opening {sel.name}...</div>
          </div>}
          {step==="sign"&&sel&&<div style={{animation:"fi .3s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:14}}>
              <div style={{width:38,height:38,borderRadius:7,background:`${sel.color}15`,border:`1px solid ${sel.color}33`,display:"flex",alignItems:"center",justifyContent:"center"}}>{sel.icon}</div>
              <div><div style={{fontSize:11,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{sel.name}</div><div style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>{short(addr)}</div></div>
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 5px #00FFB0"}}/><span style={{fontSize:8,color:"#00FFB0",fontFamily:"monospace"}}>LINKED</span></div>
            </div>
            <div style={{background:"rgba(0,0,0,.4)",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,padding:"11px 13px",marginBottom:14,fontFamily:"monospace"}}>
              <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".15em",marginBottom:6}}>SIGNATURE REQUEST — EIP-4361</div>
              {[["Domain","privarc.io"],["Address",short(addr)],["Chain","ARC Network (7070)"],["Nonce",hex(8)],["Issued",new Date().toISOString().split("T")[0]]].map(([k,v])=>(
                <div key={k} style={{display:"flex",gap:8,marginBottom:3}}><span style={{fontSize:9,color:"#0F3A22",minWidth:52}}>{k}:</span><span style={{fontSize:9,color:"#4ADE80"}}>{v}</span></div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              <button onClick={onClose} style={{padding:"10px 0",background:"transparent",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,color:"#1E5C3A",fontSize:9,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.color="#00FFB0";e.currentTarget.style.borderColor="rgba(0,255,176,.3)"}} onMouseLeave={e=>{e.currentTarget.style.color="#1E5C3A";e.currentTarget.style.borderColor="rgba(0,255,176,.1)"}}>CANCEL</button>
              <button onClick={doSign} style={{padding:"10px 0",background:"transparent",border:"1px solid #00FFB0",borderRadius:3,color:"#00FFB0",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",boxShadow:"0 0 12px rgba(0,255,176,.1)",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ SIGN & ENTER</button>
            </div>
          </div>}
          {step==="success"&&sel&&<div style={{textAlign:"center",padding:"14px 0",animation:"fi .4s ease"}}>
            <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(0,255,176,.08)",border:"2px solid #00FFB0",boxShadow:"0 0 24px rgba(0,255,176,.18)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:24,color:"#00FFB0"}}>✓</div>
            <div style={{fontSize:12,color:"#00FFB0",fontFamily:"monospace",fontWeight:700}}>Authentication Successful</div>
          </div>}
        </div>
      </div>
    </div>
  );
}
function WBtn({w,onClick}) {
  const [h,setH]=useState(false); const inst=w.installed();
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:h?`${w.color}0D`:"rgba(0,0,0,.3)",border:`1px solid ${h?w.color+"44":"rgba(0,255,176,.07)"}`,borderRadius:5,padding:"9px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .2s",boxShadow:h?`0 0 16px ${w.glow}`:"none"}}>
    <div style={{width:32,height:32,borderRadius:7,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:h?`${w.color}18`:"rgba(255,255,255,.04)",border:`1px solid ${h?w.color+"33":"rgba(255,255,255,.05)"}`,transition:"all .2s"}}>{w.icon}</div>
    <div style={{minWidth:0}}><div style={{fontSize:10,color:h?"#E2F8FF":"#A7F3D0",fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{w.name}</div><div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",display:"flex",alignItems:"center",gap:3,marginTop:1}}>{inst&&<span style={{color:"#00FFB0",fontSize:7}}>●</span>}{inst?"Detected":"Available"}</div></div>
  </button>;
}

/* ═══════════════════════════════════════════════════════════════
   WALLET REVEAL
═══════════════════════════════════════════════════════════════ */
function WalletReveal({wallet,onContinue}) {
  const [phase,setPhase]=useState(0); const [cp,setCp]=useState({}); const [showM,setShowM]=useState(false); const [showP,setShowP]=useState(false); const [prog,setProg]=useState(0);
  const STEPS=["Sampling /dev/urandom entropy...","Deriving secp256k1 keypair...","Computing ARC address...","Encoding BIP-39 phrase (2048 words)...","Registering stealth keys on-chain...","Linking account to PrivARC OS...","WALLET READY"];
  useEffect(()=>{const s=[0,15,35,55,72,88,100];let i=0;const id=setInterval(()=>{i++;setProg(s[i]||100);if(i>=s.length-1){clearInterval(id);setTimeout(()=>setPhase(1),350);}},270);return()=>clearInterval(id);},[]);
  const copy=(k,t)=>{navigator.clipboard.writeText(t).catch(()=>{});setCp(p=>({...p,[k]:true}));setTimeout(()=>setCp(p=>({...p,[k]:false})),2000);};
  const Row=({label,value,k,blur,rev,onRev})=>(
    <div style={{marginBottom:11}}>
      <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".15em",fontFamily:"monospace",marginBottom:4,textTransform:"uppercase"}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,padding:"8px 10px"}}>
        <span style={{flex:1,fontSize:10,fontFamily:"monospace",color:"#A7F3D0",wordBreak:"break-all",lineHeight:1.4,filter:blur&&!rev?"blur(4px)":"none",transition:"filter .3s",userSelect:blur&&!rev?"none":"text"}}>{value}</span>
        {blur&&<button onClick={onRev} style={{background:"none",border:"1px solid rgba(0,255,176,.2)",borderRadius:2,color:"#00FFB0",fontSize:8,padding:"2px 5px",cursor:"pointer",fontFamily:"monospace",flexShrink:0}}>{rev?"HIDE":"SHOW"}</button>}
        <button onClick={()=>copy(k,value)} style={{background:"none",border:"1px solid rgba(0,255,176,.12)",borderRadius:2,color:cp[k]?"#00FFB0":"#1E5C3A",fontSize:8,padding:"2px 5px",cursor:"pointer",fontFamily:"monospace",flexShrink:0,transition:"color .2s"}}>{cp[k]?"✓":"COPY"}</button>
      </div>
    </div>
  );
  if(phase===0) return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}><div style={{width:8,height:8,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 10px #00FFB0",animation:"pulse 1s infinite"}}/><span style={{fontSize:11,color:"#00FFB0",letterSpacing:".15em",fontFamily:"monospace"}}>GENERATING WALLET</span></div>
      {STEPS.slice(0,Math.ceil((prog/100)*STEPS.length)).map((s,i)=><div key={i} style={{fontSize:10,color:i===Math.ceil((prog/100)*STEPS.length)-1?"#A7F3D0":"#1E5C3A",marginBottom:4,fontFamily:"monospace",animation:"fi .3s ease"}}><span style={{color:"#0F3A22",marginRight:7}}>›</span>{s}</div>)}
      <div style={{marginTop:16,background:"#0A1F14",borderRadius:2,overflow:"hidden",height:2}}><div style={{height:"100%",background:"linear-gradient(90deg,#00FFB0,#0EA5E9)",width:`${prog}%`,transition:"width .27s",boxShadow:"0 0 7px #00FFB0"}}/></div>
      <div style={{marginTop:3,fontSize:8,color:"#0F3A22",textAlign:"right",fontFamily:"monospace"}}>{prog}%</div>
    </div>
  );
  return (
    <div style={{animation:"fi .4s ease"}}>
      <div style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}><div style={{width:6,height:6,background:"#00FFB0",borderRadius:"50%",boxShadow:"0 0 6px #00FFB0"}}/><span style={{fontSize:13,fontWeight:700,color:"#00FFB0",letterSpacing:".1em",fontFamily:"monospace"}}>WALLET INITIALIZED</span></div><p style={{margin:0,fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>ARC Network · Stealth enabled · ZK-ready · EIP-4361</p></div>
      <div style={{border:"1px solid rgba(245,158,11,.3)",borderRadius:3,background:"rgba(245,158,11,.05)",padding:"8px 11px",marginBottom:14,display:"flex",gap:7}}><span style={{color:"#F59E0B",flexShrink:0}}>⚠</span><p style={{margin:0,fontSize:9,color:"#92400E",lineHeight:1.5,fontFamily:"monospace"}}>CRITICAL: Store offline. PrivARC cannot recover lost keys.</p></div>
      <Row label="// ARC Address" value={wallet.address} k="addr"/>
      <Row label="// Recovery Phrase (BIP-39)" value={wallet.mnemonic} k="mnem" blur rev={showM} onRev={()=>setShowM(!showM)}/>
      <Row label="// Private Key — NEVER SHARE" value={wallet.privateKey} k="pk" blur rev={showP} onRev={()=>setShowP(!showP)}/>
      <button onClick={onContinue} style={{width:"100%",marginTop:8,padding:"11px 0",background:"transparent",border:"1px solid #00FFB0",borderRadius:3,color:"#00FFB0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".15em",boxShadow:"0 0 16px rgba(0,255,176,.1)",transition:"all .2s",textTransform:"uppercase"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⟶ Launch PrivARC OS</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD  (full OS with sidebar navigation)
═══════════════════════════════════════════════════════════════ */
function Dashboard({user}) {
  const {account,pub,wal,disconnect,testnet,toggleTestnet}=useW3();
  const [panel,setPanel]=useState("overview");
  const [balances,setBalances]=useState({arc:0n,usdc:0n,shielded:0n});
  const [tx,setTx]=useState(null);
  const [txHistory,setTxHistory]=useState([]);
  const [blockNum,setBlockNum]=useState(8420141);
  const [agentLogs,setAgentLogs]=useState([
    {t:"00:00:01",m:"ShieldAgent :: Monitoring deposit pool — depth 4.23M USDC",c:"#00FFB0"},
    {t:"00:00:03",m:"SwapAgent :: DEX route scan — 12 paths indexed",c:"#4ADE80"},
    {t:"00:00:07",m:"ZKAgent :: Proof batch ready — 0 pending",c:"#4ADE80"},
    {t:"00:00:12",m:"RiskAgent :: Volatility index: LOW (0.02)",c:"#4ADE80"},
    {t:"00:00:18",m:"PrivacyAgent :: Stealth scan complete — 0 new notes",c:"#4ADE80"},
  ]);

  // Balances
  useEffect(()=>{
    if(!pub||!account?.address) return;
    (async()=>{
      const [arc,usdc,shielded]=await Promise.all([pub.getBalance(account.address),pub.readContract({functionName:"balanceOf"}),pub.readContract({functionName:"getShieldedBalance"})]);
      setBalances({arc,usdc,shielded});
    })();
  },[pub,account]);

  // Block ticker
  useEffect(()=>{const id=setInterval(()=>setBlockNum(n=>n+1),6000);return()=>clearInterval(id);},[]);

  // Agent log
  useEffect(()=>{
    const MSGS=[["ZKAgent :: Proof generated in 1.82s","#00FFB0"],["ShieldAgent :: Pool depth nominal","#4ADE80"],["FeeAgent :: Oracle $1.0001 USDC","#4ADE80"],["PrivacyAgent :: Stealth scan 0 notes","#4ADE80"],["RiskAgent :: Score 0.02 — LOW","#4ADE80"],["SwapAgent :: Route refreshed","#4ADE80"],["BridgeAgent :: Bridge idle","#1E5C3A"],["GovAgent :: No proposals","#1E5C3A"],["ZKAgent :: Nullifier check passed","#4ADE80"]];
    const id=setInterval(()=>{ if(Math.random()>.45){const[m,c]=MSGS[Math.floor(Math.random()*MSGS.length)]; setAgentLogs(p=>[...p.slice(-8),{t:ts(),m,c}]);}},2400);
    return()=>clearInterval(id);
  },[]);

  const notify=(label,message,status,hash)=>{
    setTx({label,message,status,hash});
    if(status==="success"&&hash) setTxHistory(p=>[{hash,label,ts:new Date().toLocaleTimeString(),status:"success"},...p.slice(0,19)]);
  };
  const refreshBal=async()=>{ if(!pub||!account) return; const [arc,usdc,shielded]=await Promise.all([pub.getBalance(account.address),pub.readContract({functionName:"balanceOf"}),pub.readContract({functionName:"getShieldedBalance"})]); setBalances({arc,usdc,shielded}); };

  const NAV=[
    {id:"overview",  icon:"◈", label:"Overview"},
    {id:"shield",    icon:"🛡", label:"Shield"},
    {id:"swap",      icon:"⇄",  label:"Swap"},
    {id:"send",      icon:"↗",  label:"Send"},
    {id:"withdraw",  icon:"↙",  label:"Withdraw"},
    {id:"bridge",    icon:"⟺", label:"Bridge"},
    {id:"portfolio", icon:"📊", label:"Portfolio"},
    {id:"agents",    icon:"🤖", label:"Agents"},
    {id:"history",   icon:"📋", label:"History"},
    {id:"settings",  icon:"⚙",  label:"Settings"},
  ];

  return (
    <div style={{display:"flex",height:"100vh",width:"100%",maxWidth:900,margin:"0 auto",position:"relative",zIndex:2}}>
      {/* Sidebar */}
      <div style={{width:54,flexShrink:0,background:"rgba(0,5,3,.95)",borderRight:"1px solid rgba(0,255,176,.08)",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:14,paddingBottom:14,gap:2}}>
        {/* Logo */}
        <div style={{width:32,height:32,border:"1.5px solid #00FFB0",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#00FFB0",boxShadow:"0 0 10px rgba(0,255,176,.2)",marginBottom:12}}>◈</div>
        <div style={{width:28,height:1,background:"rgba(0,255,176,.1)",marginBottom:6}}/>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setPanel(n.id)} title={n.label} style={{width:38,height:38,background:panel===n.id?"rgba(0,255,176,.12)":"transparent",border:`1px solid ${panel===n.id?"rgba(0,255,176,.3)":"transparent"}`,borderRadius:4,cursor:"pointer",color:panel===n.id?"#00FFB0":"#1E5C3A",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0}}
            onMouseEnter={e=>{if(panel!==n.id){e.currentTarget.style.background="rgba(0,255,176,.06)";e.currentTarget.style.color="#4ADE80";}}}
            onMouseLeave={e=>{if(panel!==n.id){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#1E5C3A";}}}>
            {n.icon}
          </button>
        ))}
        <div style={{flex:1}}/>
        <div style={{width:7,height:7,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 6px #00FFB0",animation:"pulse 2s infinite"}}/>
        <div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",letterSpacing:".05em",marginTop:3}}>{testnet?"TEST":"MAIN"}</div>
      </div>

      {/* Main area */}
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column"}}>
        {/* Top bar */}
        <div style={{height:42,flexShrink:0,background:"rgba(0,5,3,.95)",borderBottom:"1px solid rgba(0,255,176,.08)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Glitch text="privARC" style={{fontSize:15,fontWeight:800,color:"#00FFB0",fontFamily:"'Syne',sans-serif"}}/>
            <span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",letterSpacing:".1em"}}>OS v2.5.0</span>
            <span style={{fontSize:8,background:"rgba(0,255,176,.08)",border:"1px solid rgba(0,255,176,.15)",borderRadius:2,padding:"1px 6px",color:"#00FFB0",fontFamily:"monospace"}}>{testnet?"TESTNET":"MAINNET"}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:9,color:"#0F3A22",fontFamily:"monospace"}}>Block #{blockNum.toLocaleString()}</span>
            <div style={{height:14,width:1,background:"rgba(0,255,176,.1)"}}/>
            <span style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>{short(account?.address)}</span>
            <button onClick={disconnect} style={{fontSize:8,color:"#1E5C3A",background:"none",border:"1px solid rgba(0,255,176,.08)",borderRadius:2,padding:"2px 7px",cursor:"pointer",fontFamily:"monospace",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.color="#EF4444";e.currentTarget.style.borderColor="rgba(239,68,68,.25)";}} onMouseLeave={e=>{e.currentTarget.style.color="#1E5C3A";e.currentTarget.style.borderColor="rgba(0,255,176,.08)";}}>DISCONNECT</button>
          </div>
        </div>

        {/* Panel content */}
        <div style={{flex:1,padding:"16px",overflow:"auto"}}>
          {panel==="overview" && <OverviewPanel balances={balances} pub={pub} agentLogs={agentLogs} setPanel={setPanel}/>}
          {panel==="shield"   && <ShieldPanel   wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
          {panel==="swap"     && <SwapPanel     wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
          {panel==="send"     && <SendPanel     wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
          {panel==="withdraw" && <WithdrawPanel wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
          {panel==="bridge"   && <BridgePanel   wal={wal} pub={pub} account={account} balances={balances} notify={notify} refresh={refreshBal}/>}
          {panel==="portfolio"&& <PortfolioPanel balances={balances} pub={pub} account={account}/>}
          {panel==="agents"   && <AgentsPanel   agentLogs={agentLogs}/>}
          {panel==="history"  && <HistoryPanel  txHistory={txHistory}/>}
          {panel==="settings" && <SettingsPanel testnet={testnet} toggleTestnet={toggleTestnet} account={account}/>}
        </div>
      </div>
      <TxToast tx={tx} onClose={()=>setTx(null)}/>
    </div>
  );
}

/* ─── OVERVIEW PANEL ─────────────────────────────────────────── */
function OverviewPanel({balances,pub,agentLogs,setPanel}) {
  const [stats,setStats]=useState({tvl:0n,apy:0n});
  useEffect(()=>{ if(!pub)return; (async()=>{ const[tvl,apy]=await Promise.all([pub.readContract({functionName:"getTVL"}),pub.readContract({functionName:"getAPY"})]); setStats({tvl,apy}); })(); },[pub]);
  const sparkData=useMemo(()=>Array.from({length:20},(_,i)=>({i,v:rnd(8000,14000)})),[]);
  const maxV=Math.max(...sparkData.map(d=>d.v)); const minV=Math.min(...sparkData.map(d=>d.v));
  const sparkPath=sparkData.map((d,i)=>{const x=(i/(sparkData.length-1))*100;const y=100-((d.v-minV)/(maxV-minV))*100;return `${i===0?"M":"L"}${x} ${y}`;}).join(" ");

  return (
    <div style={{animation:"fi .3s ease"}}>
      <div style={{fontSize:9,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:14}}>◈ SYSTEM OVERVIEW</div>

      {/* Balance cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {[
          {label:"SHIELDED",val:fmt6(balances.shielded),unit:"USDC",glow:true,click:"shield"},
          {label:"WALLET",  val:fmt6(balances.usdc),    unit:"USDC",glow:false,click:"withdraw"},
          {label:"GAS",     val:fmtE(balances.arc),     unit:"ARC", glow:false,click:null},
        ].map(b=>(
          <div key={b.label} onClick={()=>b.click&&setPanel(b.click)} style={{background:"rgba(0,255,176,.03)",border:`1px solid rgba(0,255,176,${b.glow?.22:.08})`,borderRadius:4,padding:"11px 13px",boxShadow:b.glow?"0 0 18px rgba(0,255,176,.05)":"none",cursor:b.click?"pointer":"default",transition:"all .2s"}} onMouseEnter={e=>{if(b.click)e.currentTarget.style.borderColor="rgba(0,255,176,.3)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=`rgba(0,255,176,${b.glow?.22:.08})`;}}>
            <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:5}}>{b.label}</div>
            <div style={{fontSize:18,fontWeight:700,color:b.glow?"#00FFB0":"#A7F3D0",fontFamily:"monospace",lineHeight:1}}>{b.val}</div>
            <div style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace",marginTop:2}}>{b.unit}</div>
          </div>
        ))}
      </div>

      {/* Protocol stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:4,padding:"12px 14px"}}>
          <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:6}}>PROTOCOL TVL</div>
          <div style={{fontSize:20,fontWeight:700,color:"#A7F3D0",fontFamily:"monospace"}}>${(Number(stats.tvl)/1e12).toFixed(2)}M</div>
          <div style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace",marginTop:2}}>USDC · ARC Network</div>
          {/* Sparkline */}
          <svg width="100%" height="30" viewBox="0 0 100 100" preserveAspectRatio="none" style={{marginTop:8}}>
            <path d={sparkPath} fill="none" stroke="#00FFB0" strokeWidth="2" opacity=".5"/>
          </svg>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {[
            {label:"APY",      val:`${(Number(stats.apy)/100).toFixed(2)}%`, col:"#00FFB0"},
            {label:"TX TODAY", val:Math.floor(rnd(120,800)).toString(),      col:"#4ADE80"},
            {label:"AGENTS",   val:"8/8",                                    col:"#00FFB0"},
            {label:"PROOFS",   val:Math.floor(rnd(50,300)).toString(),       col:"#4ADE80"},
          ].map(s=>(
            <div key={s.label} style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"10px 11px"}}>
              <div style={{fontSize:7,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:4}}>{s.label}</div>
              <div style={{fontSize:16,fontWeight:700,color:s.col,fontFamily:"monospace"}}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:7}}>▸ QUICK ACTIONS</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5}}>
          {[["shield","🛡","Shield"],["swap","⇄","Swap"],["send","↗","Send"],["withdraw","↙","Withdraw"],["bridge","⟺","Bridge"]].map(([id,icon,label])=>(
            <button key={id} onClick={()=>setPanel(id)} style={{background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.09)",borderRadius:4,padding:"9px 3px",cursor:"pointer",textAlign:"center",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.3)";e.currentTarget.style.background="rgba(0,255,176,.07)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.09)";e.currentTarget.style.background="rgba(0,255,176,.03)";}}>
              <div style={{fontSize:16,marginBottom:3}}>{icon}</div>
              <div style={{fontSize:8,color:"#00FFB0",fontFamily:"monospace",letterSpacing:".08em"}}>{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Agent log preview */}
      <div style={{background:"#000A06",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"9px 11px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace"}}>AI AGENT LOG</div>
          <button onClick={()=>setPanel("agents")} style={{fontSize:8,color:"#1E5C3A",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"color .2s"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>VIEW ALL →</button>
        </div>
        {agentLogs.slice(-4).map((l,i)=><div key={i} style={{fontSize:9,fontFamily:"monospace",marginBottom:2,color:l.c,lineHeight:1.4,animation:i===agentLogs.slice(-4).length-1?"fi .3s ease":"none"}}><span style={{color:"#0A1F14",marginRight:7}}>[{l.t}]</span>{l.m}</div>)}
      </div>
    </div>
  );
}

/* ─── SHIELD PANEL ───────────────────────────────────────────── */
function ShieldPanel({wal,pub,account,balances,notify,refresh}) {
  const [amount,setAmount]=useState(""); const [loading,setLoading]=useState(false); const [gas,setGas]=useState(null);
  useEffect(()=>{if(!pub||!amount||isNaN(amount)||Number(amount)<=0)return;const id=setTimeout(async()=>{const g=await pub.estimateGas();const gp=await pub.getGasPrice();setGas(fmtE(g*gp)+" ARC");},500);return()=>clearTimeout(id);},[amount,pub]);
  const submit=async()=>{if(!amount||!wal)return;setLoading(true);notify("Shield","Approving USDC allowance...","pending");try{const ah=await wal.writeContract({address:CONTRACTS.USDC,functionName:"approve"});await pub.waitForTransactionReceipt(ah);notify("Shield","Submitting shield tx...","pending",ah);const sh=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"shield"});await pub.waitForTransactionReceipt(sh);notify("Shield ✓",`${amount} USDC shielded`,"success",sh);setAmount("");await refresh();}catch(e){notify("Shield Failed",e.message||"Rejected","error");}setLoading(false);};
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="🛡" title="SHIELD" sub="Deposit assets into PrivARC private vault"/>
      <div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.1)",borderRadius:4,padding:"13px 15px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>Available</span>
          <button onClick={()=>setAmount(fmt6(balances.usdc).replace(/,/g,""))} style={{fontSize:9,color:"#00FFB0",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace"}}>MAX {fmt6(balances.usdc)} USDC</button>
        </div>
        <OsField label="USDC AMOUNT" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="🛡" suffix="USDC"/>
        <InfoGrid items={[["Protocol Fee","0.00 USDC","Launch phase"],["Est. Gas",gas||"—","ARC Network"],["Privacy","ZK commitment","Merkle tree"]]}/>
      </div>
      <InfoBox>ZK commitment generated on-chain. Funds become untraceable once shielded.</InfoBox>
      <ArcBtn label="⟶ SHIELD ASSETS" onClick={submit} loading={loading} disabled={!amount||Number(amount)<=0}/>
    </div>
  );
}

/* ─── SWAP PANEL ─────────────────────────────────────────────── */
function SwapPanel({wal,pub,account,balances,notify,refresh}) {
  const TOKENS=["USDC","WETH","WBTC","ARCt","DAI","USDT"];
  const RATES={USDC:{WETH:.000385,WBTC:.0000155,ARCt:4.25,DAI:.9997,USDT:1.0001},WETH:{USDC:2597,WBTC:.0403,ARCt:11031,DAI:2596,USDT:2596},WBTC:{USDC:64500,WETH:24.8,ARCt:274000,DAI:64480,USDT:64490},ARCt:{USDC:.235,WETH:.0000906,WBTC:.00000365,DAI:.2348,USDT:.2347},DAI:{USDC:1.0003,WETH:.000385,WBTC:.0000155,ARCt:4.25,USDT:1.0002},USDT:{USDC:.9999,WETH:.000384,WBTC:.0000154,ARCt:4.249,DAI:.9998}};
  const [from,setFrom]=useState("USDC"); const [to,setTo]=useState("WETH"); const [amount,setAmount]=useState(""); const [quote,setQuote]=useState(null); const [loading,setLoading]=useState(false);
  useEffect(()=>{if(!amount||isNaN(amount)||Number(amount)<=0){setQuote(null);return;}const id=setTimeout(()=>{const rate=RATES[from]?.[to]||1;const out=Number(amount)*rate*(0.9992+Math.random()*.001);setQuote({out:out.toFixed(6),fee:(Number(amount)*.0005).toFixed(4),impact:(Math.random()*.3).toFixed(2),route:[from,"USDC Pool","ZK Relay",to]});},450);return()=>clearTimeout(id);},[amount,from,to]);
  const swap=async()=>{if(!amount||!wal||!quote)return;setLoading(true);notify("Private Swap","Routing through ZK relay...","pending");try{const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"privateSwap"});await pub.waitForTransactionReceipt(h);notify("Swap ✓",`${amount} ${from} → ${quote.out} ${to}`,"success",h);setAmount("");setQuote(null);await refresh();}catch(e){notify("Swap Failed",e.message||"Rejected","error");}setLoading(false);};
  const TkSel=({val,onChange})=><select value={val} onChange={e=>onChange(e.target.value)} style={{background:"rgba(0,0,0,.5)",border:"1px solid rgba(0,255,176,.15)",borderRadius:3,color:"#A7F3D0",fontSize:11,fontFamily:"monospace",padding:"7px 9px",cursor:"pointer",outline:"none",flexShrink:0}}>{TOKENS.map(t=><option key={t} value={t}>{t}</option>)}</select>;
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="⇄" title="PRIVATE SWAP" sub="ZK-routed on-chain exchange"/>
      <div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.1)",borderRadius:4,padding:"13px 15px",marginBottom:10}}>
        <div style={{display:"flex",gap:7,alignItems:"flex-end",marginBottom:10}}><div style={{flex:1}}><OsField label="FROM" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="⬆"/></div><TkSel val={from} onChange={v=>{setFrom(v);if(v===to)setTo(TOKENS.find(t=>t!==v));}}/></div>
        <div style={{display:"flex",justifyContent:"center",marginBottom:10}}><button onClick={()=>{setFrom(to);setTo(from);setAmount("");setQuote(null);}} style={{background:"rgba(0,255,176,.06)",border:"1px solid rgba(0,255,176,.2)",borderRadius:"50%",width:30,height:30,cursor:"pointer",color:"#00FFB0",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,255,176,.12)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,255,176,.06)"}>⇅</button></div>
        <div style={{display:"flex",gap:7,alignItems:"flex-end"}}><div style={{flex:1}}><OsField label="TO (ESTIMATED)" value={quote?quote.out:""} placeholder="0.00" icon="⬇" readOnly/></div><TkSel val={to} onChange={v=>{setTo(v);if(v===from)setFrom(TOKENS.find(t=>t!==v));}}/></div>
      </div>
      {quote&&<div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.08)",borderRadius:3,padding:"10px 12px",marginBottom:10,fontFamily:"monospace"}}><div style={{fontSize:8,color:"#0F3A22",letterSpacing:".15em",marginBottom:6}}>QUOTE DETAILS</div>{[["Rate",`1 ${from} = ${(Number(quote.out)/Number(amount)).toFixed(6)} ${to}`],["Fee",`${quote.fee} USDC (0.05%)`],["Price Impact",`~${quote.impact}%`],["Route",quote.route.join(" → ")]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:9,color:"#0F3A22"}}>{k}</span><span style={{fontSize:9,color:"#4ADE80"}}>{v}</span></div>)}</div>}
      <ArcBtn label="⟶ EXECUTE PRIVATE SWAP" onClick={swap} loading={loading} disabled={!amount||!quote}/>
    </div>
  );
}

/* ─── SEND PANEL ─────────────────────────────────────────────── */
function SendPanel({wal,pub,account,balances,notify,refresh}) {
  const [to,setTo]=useState(""); const [amount,setAmount]=useState(""); const [loading,setLoading]=useState(false); const [resolving,setResolving]=useState(false); const [resolved,setResolved]=useState(null); const [note,setNote]=useState("");
  useEffect(()=>{ if(to.endsWith(".arc")||to.endsWith(".eth")){setResolving(true);setResolved(null);const id=setTimeout(()=>{setResolving(false);setResolved("0x"+hex(40));},700);return()=>clearTimeout(id);}else setResolved(null); },[to]);
  const send=async()=>{ if((!to&&!resolved)||!amount||!wal)return; setLoading(true); notify("Private Send","Generating stealth address...","pending"); try{const dest=resolved||to;const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"privateSend"});await pub.waitForTransactionReceipt(h);notify("Send ✓",`${amount} USDC sent privately`,"success",h);setTo("");setAmount("");setResolved(null);setNote("");await refresh();}catch(e){notify("Send Failed",e.message||"Rejected","error");}setLoading(false); };
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="↗" title="PRIVATE SEND" sub="Stealth address P2P transfer"/>
      <OsField label="RECIPIENT (ADDRESS OR .ARC / .ETH)" value={to} onChange={e=>setTo(e.target.value)} placeholder="0x... or name.arc" icon="↗" hint={resolving?"Resolving...":resolved?`✓ Resolved: ${short(resolved)}`:null}/>
      <OsField label="AMOUNT" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="💸" suffix="USDC"/>
      <OsField label="NOTE (OPTIONAL — ENCRYPTED)" value={note} onChange={e=>setNote(e.target.value)} placeholder="memo for recipient..." icon="📝"/>
      <InfoGrid items={[["Protocol Fee","0.02 USDC","Flat"],["Privacy","Stealth addr","Sender invisible"],["Delivery","Instant","ARC Network"]]}/>
      <ArcBtn label="⟶ SEND PRIVATELY" onClick={send} loading={loading} disabled={!to||!amount||resolving}/>
    </div>
  );
}

/* ─── WITHDRAW PANEL ─────────────────────────────────────────── */
function WithdrawPanel({wal,pub,account,balances,notify,refresh}) {
  const [amount,setAmount]=useState(""); const [dest,setDest]=useState(""); const [loading,setLoading]=useState(false); const [proving,setProving]=useState(false);
  const withdraw=async()=>{ if(!amount||!wal)return; setLoading(true);setProving(true); notify("Withdraw","Generating ZK ownership proof...","pending"); await sleep(1700); setProving(false); try{const target=dest||account.address;const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"withdraw"});await pub.waitForTransactionReceipt(h);notify("Withdraw ✓",`${amount} USDC → ${short(target)}`,"success",h);setAmount("");setDest("");await refresh();}catch(e){notify("Withdraw Failed",e.message||"Rejected","error");}setLoading(false); };
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="↙" title="WITHDRAW" sub="Exit shielded funds to public address"/>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace"}}>Shielded balance</span>
        <button onClick={()=>setAmount(fmt6(balances.shielded).replace(/,/g,""))} style={{fontSize:9,color:"#00FFB0",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace"}}>MAX {fmt6(balances.shielded)} USDC</button>
      </div>
      <OsField label="WITHDRAW AMOUNT" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="↙" suffix="USDC"/>
      <OsField label="DESTINATION (OPTIONAL — DEFAULTS TO CONNECTED WALLET)" value={dest} onChange={e=>setDest(e.target.value)} placeholder={account?.address||"0x..."} icon="📍"/>
      <InfoGrid items={[["Protocol Fee","0.03 USDC","Flat"],["ZK Proof","Groth16","~1.8s gen"],["Shielded",fmt6(balances.shielded)+" USDC","Available"]]}/>
      {proving&&<div style={{marginBottom:10,padding:"8px 11px",background:"rgba(0,255,176,.04)",border:"1px solid rgba(0,255,176,.15)",borderRadius:3,display:"flex",alignItems:"center",gap:8}}><Spinner/><span style={{fontSize:9,color:"#00FFB0",fontFamily:"monospace"}}>Generating ZK ownership proof (Groth16)...</span></div>}
      <ArcBtn label="⟶ WITHDRAW FUNDS" onClick={withdraw} loading={loading} disabled={!amount||Number(amount)<=0}/>
    </div>
  );
}

/* ─── BRIDGE PANEL ───────────────────────────────────────────── */
function BridgePanel({wal,pub,account,balances,notify,refresh}) {
  const CHAINS=[{id:"ethereum",name:"Ethereum",icon:"Ξ",fee:"0.10",time:"5-10 min"},{id:"bnb",name:"BNB Chain",icon:"⬡",fee:"0.08",time:"3-6 min"},{id:"polygon",name:"Polygon",icon:"⬟",fee:"0.05",time:"2-4 min"},{id:"arbitrum",name:"Arbitrum",icon:"🔵",fee:"0.04",time:"1-3 min"},{id:"base",name:"Base",icon:"🔷",fee:"0.04",time:"1-3 min"},{id:"optimism",name:"Optimism",icon:"🔴",fee:"0.04",time:"1-3 min"}];
  const [dest,setDest]=useState("ethereum"); const [amount,setAmount]=useState(""); const [loading,setLoading]=useState(false);
  const chain=CHAINS.find(c=>c.id===dest);
  const bridge=async()=>{ if(!amount||!wal)return; setLoading(true); notify("Bridge","Locking in BridgeAdapter...","pending"); try{const h=await wal.writeContract({address:CONTRACTS.ShieldVault,functionName:"bridgeOut"});await pub.waitForTransactionReceipt(h);notify("Bridge ✓",`${amount} USDC → ${chain?.name}`,"success",h);setAmount("");await refresh();}catch(e){notify("Bridge Failed",e.message||"Rejected","error");}setLoading(false); };
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="⟺" title="BRIDGE" sub="Cross-chain private transfer"/>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:8,color:"#1E5C3A",letterSpacing:".15em",fontFamily:"monospace",marginBottom:7}}>DESTINATION NETWORK</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,marginBottom:6}}>
          {CHAINS.map(c=>(
            <button key={c.id} onClick={()=>setDest(c.id)} style={{background:dest===c.id?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)",border:`1px solid ${dest===c.id?"rgba(0,255,176,.35)":"rgba(0,255,176,.08)"}`,borderRadius:4,padding:"8px 6px",cursor:"pointer",textAlign:"center",transition:"all .2s"}}>
              <div style={{fontSize:18,marginBottom:2}}>{c.icon}</div>
              <div style={{fontSize:8,color:dest===c.id?"#00FFB0":"#1E5C3A",fontFamily:"monospace"}}>{c.name.split(" ")[0]}</div>
              <div style={{fontSize:7,color:"#0A1F14",fontFamily:"monospace"}}>{c.fee} USDC</div>
            </button>
          ))}
        </div>
      </div>
      <OsField label="AMOUNT" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" icon="⟺" suffix="USDC"/>
      <InfoGrid items={[["Destination",chain?.name||"—","Selected"],["Protocol Fee",`${chain?.fee||"—"} USDC`,"Flat"],["Est. Time",chain?.time||"—","Cross-chain"],["Privacy","End-to-end","Shielded"]]}/>
      <ArcBtn label={`⟶ BRIDGE TO ${chain?.name?.toUpperCase()||"—"}`} onClick={bridge} loading={loading} disabled={!amount||Number(amount)<=0}/>
    </div>
  );
}

/* ─── PORTFOLIO PANEL ────────────────────────────────────────── */
function PortfolioPanel({balances,pub,account}) {
  const [prices]=useState({USDC:1.0001,WETH:2597,WBTC:64500,ARCt:0.235,ARC:0.18});
  const portfolio=[
    {token:"USDC",  balance:fmt6(balances.usdc),   price:prices.USDC, icon:"💵",color:"#4ADE80"},
    {token:"USDC ⚡",balance:fmt6(balances.shielded),price:prices.USDC,icon:"🛡",color:"#00FFB0"},
    {token:"ARC",   balance:fmtE(balances.arc),    price:prices.ARC,  icon:"⬡",color:"#A7F3D0"},
    {token:"WETH",  balance:(rnd(0,0.5)).toFixed(4),price:prices.WETH, icon:"Ξ",color:"#7C8EF5"},
  ];
  const total=portfolio.reduce((sum,p)=>sum+Number(p.balance.replace(/,/g,""))*p.price,0);
  const alloc=portfolio.map(p=>({...p,pct:((Number(p.balance.replace(/,/g,""))*p.price/total)*100||0).toFixed(1)}));

  // Donut-like allocation
  let offset=0;
  const segs=alloc.map((p,i)=>{const pct=Number(p.pct);const seg={pct,offset,color:[p.color,"#7C8EF5","#F59E0B","#0EA5E9"][i%4]};offset+=pct;return seg;});

  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="📊" title="PORTFOLIO" sub="Asset allocation & live prices"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 160px",gap:14,marginBottom:14}}>
        <div>
          <div style={{background:"rgba(0,255,176,.03)",border:"1px solid rgba(0,255,176,.12)",borderRadius:4,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:6}}>TOTAL PORTFOLIO VALUE</div>
            <div style={{fontSize:26,fontWeight:700,color:"#00FFB0",fontFamily:"monospace"}}>${total.toFixed(2)}</div>
            <div style={{fontSize:9,color:"#1E5C3A",fontFamily:"monospace",marginTop:2}}>USD equivalent</div>
          </div>
          {alloc.map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.06)",borderRadius:3,marginBottom:5}}>
              <span style={{fontSize:16,flexShrink:0}}>{p.icon}</span>
              <div style={{flex:1}}><div style={{fontSize:11,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{p.token}</div><div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>@ ${p.price.toFixed(p.price>100?0:4)}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:11,color:p.color,fontFamily:"monospace"}}>{p.balance}</div><div style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>{p.pct}%</div></div>
            </div>
          ))}
        </div>
        <div>
          <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"12px",height:"100%"}}>
            <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:10}}>ALLOCATION</div>
            <svg width="100%" viewBox="0 0 100 100">
              {segs.map((s,i)=>{const r=38,cx=50,cy=50;const start=(s.offset/100)*Math.PI*2-Math.PI/2;const end=((s.offset+s.pct)/100)*Math.PI*2-Math.PI/2;const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start),x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);const large=s.pct>50?1:0;return s.pct>0?<path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={s.color} opacity=".85"/>:null;})}
              <circle cx="50" cy="50" r="22" fill="rgba(0,8,5,.9)"/>
              <text x="50" y="47" textAnchor="middle" fill="#00FFB0" fontSize="8" fontFamily="monospace">${total.toFixed(0)}</text>
              <text x="50" y="57" textAnchor="middle" fill="#1E5C3A" fontSize="6" fontFamily="monospace">USD</text>
            </svg>
            <div style={{marginTop:8}}>
              {alloc.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}><div style={{width:7,height:7,borderRadius:1,background:["#00FFB0","#7C8EF5","#F59E0B","#0EA5E9"][i%4],flexShrink:0}}/><span style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>{p.token} {p.pct}%</span></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── AGENTS PANEL ───────────────────────────────────────────── */
function AgentsPanel({agentLogs}) {
  const AGENTS=[
    {id:"SA",name:"ShieldAgent", role:"Vault monitoring & deposit management",   load:()=>Math.floor(rnd(8,20)),  status:"ACTIVE", col:"#00FFB0"},
    {id:"SW",name:"SwapAgent",   role:"DEX routing & price optimization",          load:()=>Math.floor(rnd(4,15)),  status:"ACTIVE", col:"#4ADE80"},
    {id:"PV",name:"PrivacyAgent",role:"Stealth scanning & note detection",         load:()=>Math.floor(rnd(25,45)), status:"ACTIVE", col:"#00FFB0"},
    {id:"RK",name:"RiskAgent",   role:"Volatility & anomaly scoring",              load:()=>Math.floor(rnd(2,8)),   status:"ACTIVE", col:"#4ADE80"},
    {id:"ZK",name:"ZKAgent",     role:"Proof generation (Groth16 / PLONK)",        load:()=>Math.floor(rnd(55,75)), status:"ACTIVE", col:"#F59E0B"},
    {id:"BR",name:"BridgeAgent", role:"Cross-chain relay & lock management",       load:()=>0,                      status:"STANDBY",col:"#1E5C3A"},
    {id:"GO",name:"GovAgent",    role:"Governance proposal monitoring",            load:()=>Math.floor(rnd(1,4)),   status:"ACTIVE", col:"#4ADE80"},
    {id:"FE",name:"FeeAgent",    role:"USDC fee oracle & collector sweep",         load:()=>Math.floor(rnd(12,22)), status:"ACTIVE", col:"#4ADE80"},
  ];
  const [loads]=useState(()=>Object.fromEntries(AGENTS.map(a=>[a.id,a.load()])));
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="🤖" title="AI AGENT CLUSTER" sub="8 autonomous on-chain agents — ARC Network"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
        {AGENTS.map(a=>(
          <div key={a.id} style={{background:"rgba(0,0,0,.3)",border:`1px solid ${a.status==="ACTIVE"?"rgba(0,255,176,.1)":"rgba(0,255,176,.04)"}`,borderRadius:4,padding:"11px 13px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div><div style={{fontSize:11,color:a.status==="ACTIVE"?"#A7F3D0":"#1E5C3A",fontFamily:"monospace",fontWeight:700}}>{a.name}</div><div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",marginTop:1}}>{a.role}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}><div style={{width:5,height:5,borderRadius:"50%",background:a.status==="ACTIVE"?a.col:"#1E5C3A",boxShadow:a.status==="ACTIVE"?`0 0 5px ${a.col}`:"none"}}/><span style={{fontSize:8,color:a.status==="ACTIVE"?a.col:"#1E5C3A",fontFamily:"monospace"}}>{a.status}</span></div>
            </div>
            {a.status==="ACTIVE"&&<>
              <div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",marginBottom:3}}>CPU LOAD: {loads[a.id]}%</div>
              <div style={{height:2,background:"#0A1F14",borderRadius:1,overflow:"hidden"}}><div style={{height:"100%",background:a.col,width:`${loads[a.id]}%`,boxShadow:loads[a.id]>60?`0 0 6px ${a.col}`:"none"}}/></div>
            </>}
          </div>
        ))}
      </div>
      <div style={{background:"#000A06",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"10px 12px",maxHeight:200,overflow:"auto"}}>
        <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:7}}>LIVE AGENT LOG</div>
        {[...agentLogs].reverse().map((l,i)=><div key={i} style={{fontSize:9,fontFamily:"monospace",marginBottom:3,color:l.c,lineHeight:1.4,animation:i===0?"fi .3s ease":"none"}}><span style={{color:"#0A1F14",marginRight:8}}>[{l.t}]</span>{l.m}</div>)}
      </div>
    </div>
  );
}

/* ─── HISTORY PANEL ──────────────────────────────────────────── */
function HistoryPanel({txHistory}) {
  const [filter,setFilter]=useState("all");
  const demo=[
    {hash:"0x"+hex(64),label:"Shield ✓",ts:"12:43:21",status:"success",amount:"500.00 USDC"},
    {hash:"0x"+hex(64),label:"Swap ✓",ts:"11:22:07",status:"success",amount:"0.1928 WETH"},
    {hash:"0x"+hex(64),label:"Send ✓",ts:"10:05:44",status:"success",amount:"250.00 USDC"},
  ];
  const all=[...txHistory.map(t=>({...t,amount:"—"})),...demo];
  const filtered=filter==="all"?all:all.filter(t=>t.label.toLowerCase().includes(filter));
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="📋" title="TRANSACTION HISTORY" sub="On-chain activity log"/>
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        {["all","shield","swap","send","withdraw","bridge"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:"4px 9px",background:filter===f?"rgba(0,255,176,.1)":"rgba(0,0,0,.3)",border:`1px solid ${filter===f?"rgba(0,255,176,.3)":"rgba(0,255,176,.07)"}`,borderRadius:3,color:filter===f?"#00FFB0":"#1E5C3A",fontSize:8,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",textTransform:"uppercase",transition:"all .2s"}}>{f}</button>
        ))}
      </div>
      {filtered.length===0?<div style={{textAlign:"center",padding:"30px 0",fontSize:10,color:"#0F3A22",fontFamily:"monospace"}}>No transactions found</div>:
        filtered.map((t,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(0,0,0,.25)",border:"1px solid rgba(0,255,176,.06)",borderRadius:3,marginBottom:5}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#00FFB0",boxShadow:"0 0 5px #00FFB0",flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontSize:11,color:"#A7F3D0",fontFamily:"monospace",fontWeight:700}}>{t.label}</div><div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",marginTop:1}}>{t.ts} · {t.hash.slice(0,14)}···</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#4ADE80",fontFamily:"monospace"}}>{t.amount}</div><a href={`${ARC.blockExplorers.default.url}/tx/${t.hash}`} target="_blank" style={{fontSize:8,color:"#1E5C3A",textDecoration:"none",letterSpacing:".05em",fontFamily:"monospace"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>ARCScan ↗</a></div>
          </div>
        ))
      }
    </div>
  );
}

/* ─── SETTINGS PANEL ─────────────────────────────────────────── */
function SettingsPanel({testnet,toggleTestnet,account}) {
  const [slippage,setSlippage]=useState("0.5");
  const [deadline,setDeadline]=useState("20");
  const [sound,setSound]=useState(false);
  const [expert,setExpert]=useState(false);
  return (
    <div style={{animation:"fi .3s ease"}}>
      <PanelHeader icon="⚙" title="SETTINGS" sub="Network, transaction, and interface preferences"/>
      <Section title="NETWORK">
        <SettRow label="Network Mode" sub={testnet?"ARC Testnet (7071)":"ARC Mainnet (7070)"}>
          <Toggle on={testnet} onClick={toggleTestnet}/>
        </SettRow>
        <SettRow label="RPC Endpoint" sub={ARC.rpcUrls.default.http[0]}><span style={{fontSize:8,color:"#4ADE80",fontFamily:"monospace"}}>CONNECTED</span></SettRow>
        <SettRow label="Block Explorer" sub={ARC.blockExplorers.default.url}><a href={ARC.blockExplorers.default.url} target="_blank" style={{fontSize:8,color:"#00FFB0",fontFamily:"monospace",textDecoration:"none"}}>OPEN ↗</a></SettRow>
      </Section>
      <Section title="TRANSACTION">
        <SettRow label="Max Slippage" sub="Tolerance for price movement"><div style={{display:"flex",gap:4}}>{["0.1","0.5","1.0"].map(v=><button key={v} onClick={()=>setSlippage(v)} style={{padding:"3px 7px",background:slippage===v?"rgba(0,255,176,.12)":"rgba(0,0,0,.3)",border:`1px solid ${slippage===v?"rgba(0,255,176,.3)":"rgba(0,255,176,.08)"}`,borderRadius:2,color:slippage===v?"#00FFB0":"#1E5C3A",fontSize:8,cursor:"pointer",fontFamily:"monospace"}}>{v}%</button>)}</div></SettRow>
        <SettRow label="TX Deadline" sub="Minutes until tx expires"><div style={{display:"flex",gap:4}}>{["10","20","30"].map(v=><button key={v} onClick={()=>setDeadline(v)} style={{padding:"3px 7px",background:deadline===v?"rgba(0,255,176,.12)":"rgba(0,0,0,.3)",border:`1px solid ${deadline===v?"rgba(0,255,176,.3)":"rgba(0,255,176,.08)"}`,borderRadius:2,color:deadline===v?"#00FFB0":"#1E5C3A",fontSize:8,cursor:"pointer",fontFamily:"monospace"}}>{v}m</button>)}</div></SettRow>
        <SettRow label="Expert Mode" sub="Remove confirmation dialogs"><Toggle on={expert} onClick={()=>setExpert(!expert)}/></SettRow>
      </Section>
      <Section title="INTERFACE">
        <SettRow label="Sound FX" sub="ZK proof and tx audio cues"><Toggle on={sound} onClick={()=>setSound(!sound)}/></SettRow>
      </Section>
      <Section title="WALLET">
        <SettRow label="Connected Address" sub={account?.address||"—"}><span style={{fontSize:8,color:"#4ADE80",fontFamily:"monospace"}}>ACTIVE</span></SettRow>
        <SettRow label="Auth Method" sub={account?.walletName||"Email"}><span style={{fontSize:8,color:"#A7F3D0",fontFamily:"monospace"}}>{account?.walletName||"EMAIL"}</span></SettRow>
      </Section>
      <div style={{marginTop:14,padding:"10px 12px",background:"rgba(0,0,0,.2)",border:"1px solid rgba(0,255,176,.06)",borderRadius:3}}>
        <div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:4}}>CONTRACT ADDRESSES</div>
        {Object.entries(CONTRACTS).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:8,color:"#1E5C3A",fontFamily:"monospace"}}>{k}</span><span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace"}}>{short(v)}</span></div>)}
      </div>
    </div>
  );
}

/* ─── SHARED SUB-COMPONENTS ──────────────────────────────────── */
const PanelHeader=({icon,title,sub})=><div style={{marginBottom:16}}><div style={{fontSize:8,color:"#0F3A22",letterSpacing:".2em",fontFamily:"monospace",marginBottom:2}}>▸ {icon} {title}</div><div style={{fontSize:11,color:"#1E5C3A",fontFamily:"monospace"}}>{sub}</div><div style={{width:"100%",height:1,background:"rgba(0,255,176,.07)",marginTop:8}}/></div>;
const InfoBox=({children})=><div style={{background:"rgba(0,255,176,.02)",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,padding:"8px 11px",marginBottom:12,fontSize:9,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>{children}</div>;
const InfoGrid=({items})=><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,marginBottom:12}}>{items.map(([k,v,sub],i)=><div key={i} style={{background:"rgba(0,0,0,.3)",borderRadius:3,padding:"7px 9px"}}><div style={{fontSize:7,color:"#0F3A22",fontFamily:"monospace",marginBottom:2}}>{k}</div><div style={{fontSize:10,color:"#4ADE80",fontFamily:"monospace"}}>{v}</div>{sub&&<div style={{fontSize:7,color:"#0A1F14",fontFamily:"monospace"}}>{sub}</div>}</div>)}</div>;
const Section=({title,children})=><div style={{marginBottom:14}}><div style={{fontSize:8,color:"#0F3A22",letterSpacing:".18em",fontFamily:"monospace",marginBottom:6,paddingBottom:5,borderBottom:"1px solid rgba(0,255,176,.06)"}}>{title}</div>{children}</div>;
const SettRow=({label,sub,children})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:"rgba(0,0,0,.2)",borderRadius:3,marginBottom:4}}><div><div style={{fontSize:10,color:"#A7F3D0",fontFamily:"monospace"}}>{label}</div><div style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",marginTop:1}}>{sub}</div></div>{children}</div>;
const Toggle=({on,onClick})=><div onClick={onClick} style={{width:34,height:18,background:on?"rgba(0,255,176,.2)":"rgba(0,0,0,.4)",border:`1px solid ${on?"rgba(0,255,176,.5)":"rgba(0,255,176,.12)"}`,borderRadius:9,cursor:"pointer",position:"relative",transition:"all .2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:on?16:2,width:12,height:12,borderRadius:"50%",background:on?"#00FFB0":"#1E5C3A",boxShadow:on?"0 0 6px #00FFB0":"none",transition:"all .2s"}}/></div>;

/* ═══════════════════════════════════════════════════════════════
   PASS STRENGTH
═══════════════════════════════════════════════════════════════ */
function PassStr({pw}) {
  if(!pw) return null;
  const s=[pw.length>=8,/[A-Z]/.test(pw),/[0-9]/.test(pw),/[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  const C=["","#EF4444","#F59E0B","#3B82F6","#00FFB0"],L=["","WEAK","FAIR","GOOD","STRONG"];
  return <div style={{marginTop:-7,marginBottom:12}}><div style={{display:"flex",gap:3}}>{[1,2,3,4].map(i=><div key={i} style={{flex:1,height:2,background:i<=s?C[s]:"#0A1F14",boxShadow:i<=s&&s===4?`0 0 4px ${C[s]}`:"none",transition:"background .3s"}}/>)}</div><div style={{marginTop:2,fontSize:8,color:C[s],letterSpacing:".1em"}}>ENTROPY: {L[s]}</div></div>;
}

/* ═══════════════════════════════════════════════════════════════
   AUTH CARD
═══════════════════════════════════════════════════════════════ */
function AuthCard({onAuth}) {
  const {connect}=useW3();
  const [screen,setScreen]=useState("login"); const [showWC,setShowWC]=useState(false); const [loading,setLoading]=useState(false);
  const [lw,setLw]=useState(null); const [user,setUser]=useState(null); const [phase,setPhase]=useState("auth");
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [cpw,setCpw]=useState(""); const [agreed,setAgreed]=useState(false); const [errors,setErrors]=useState({});
  const validate=()=>{const e={};if(screen==="signup"&&!name.trim())e.name="Required";if(!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))e.email="Invalid";if(!pw||pw.length<8)e.pw="Min 8 chars";if(screen==="signup"){if(pw!==cpw)e.cpw="Mismatch";if(!agreed)e.agreed="Required";}return e;};
  const submit=async()=>{ const e=validate();if(Object.keys(e).length){setErrors(e);return;}setErrors({});setLoading(true);await sleep(screen==="login"?1100:1500);setLoading(false);const u={name:name||email.split("@")[0],email};setUser(u);if(screen==="signup"){const w=genWallet();setLw(w);setPhase("wallet");}else{await connect("0x"+hex(40),"Email",false);onAuth(u);} };
  const handleWC=async({address,wallet:w})=>{ setShowWC(false);setLoading(true);await connect(address,w.name,!!window.ethereum);setLoading(false);onAuth({name:w.name+" Operator",email:null}); };
  if(phase==="wallet"&&lw) return <div style={{width:"100%",maxWidth:440,...CS}}><WalletReveal wallet={lw} onContinue={async()=>{await connect(lw.address,"Email",false);onAuth(user);}}/></div>;
  return (
    <>
      {showWC&&<WCModal onClose={()=>setShowWC(false)} onConnect={handleWC}/>}
      <div style={{width:"100%",maxWidth:440,...CS}}>
        {CORNERS}
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><div style={{width:30,height:30,border:"1.5px solid #00FFB0",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#00FFB0",boxShadow:"0 0 10px rgba(0,255,176,.2)"}}>◈</div><Glitch text="privARC" style={{fontSize:20,fontWeight:800,color:"#00FFB0",fontFamily:"'Syne',sans-serif",letterSpacing:"-.01em"}}/><span style={{fontSize:8,color:"#0F3A22",fontFamily:"monospace",letterSpacing:".1em",alignSelf:"flex-end",paddingBottom:1}}>OS</span></div>
          <p style={{fontSize:9.5,color:"#1E5C3A",fontFamily:"monospace",letterSpacing:".05em",lineHeight:1.6,maxWidth:340}}>Autonomous crypto OS · Private on-chain capital · AI agents · ARC Network</p>
        </div>
        <div style={{display:"flex",border:"1px solid rgba(0,255,176,.1)",borderRadius:3,overflow:"hidden",marginBottom:22}}>
          {["login","signup"].map(s=><button key={s} onClick={()=>{setScreen(s);setErrors({});}} style={{flex:1,padding:"8px 0",background:screen===s?"rgba(0,255,176,.08)":"transparent",border:"none",borderRight:s==="login"?"1px solid rgba(0,255,176,.1)":"none",color:screen===s?"#00FFB0":"#1E5C3A",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"monospace",letterSpacing:".15em",textTransform:"uppercase",transition:"all .2s"}}>{s==="login"?"[ AUTH ]":"[ REGISTER ]"}</button>)}
        </div>
        {screen==="login"&&<div style={{animation:"fi .3s ease"}}>
          <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email}/>
          <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••••••" icon="⚿" error={errors.pw}/>
          <div style={{textAlign:"right",marginTop:-7,marginBottom:16}}><a href="#" style={{fontSize:8,color:"#1E5C3A",textDecoration:"none",fontFamily:"monospace",letterSpacing:".1em",transition:"color .2s"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>RECOVER ACCESS →</a></div>
          <ArcBtn label="⟶ Authenticate" onClick={submit} loading={loading}/>
          <Div/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:7}}>
            {WALLETS.filter(w=>w.popular).map(w=><button key={w.id} onClick={()=>setShowWC(true)} style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(0,255,176,.07)",borderRadius:4,padding:"8px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`${w.color}44`;e.currentTarget.style.background=`${w.color}0A`;e.currentTarget.style.boxShadow=`0 0 12px ${w.glow}`;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.07)";e.currentTarget.style.background="rgba(0,0,0,.3)";e.currentTarget.style.boxShadow="none";}}><div style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center"}}>{w.icon}</div><span style={{fontSize:7,color:"#1E5C3A",fontFamily:"monospace"}}>{w.name.split(" ")[0]}</span></button>)}
          </div>
          <button onClick={()=>setShowWC(true)} style={{width:"100%",padding:"8px 0",background:"transparent",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,color:"#0F3A22",fontSize:9,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:6}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.2)";e.currentTarget.style.color="#1E5C3A";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.07)";e.currentTarget.style.color="#0F3A22";}}>⬡ More wallets (8 supported)</button>
        </div>}
        {screen==="signup"&&<div style={{animation:"fi .3s ease"}}>
          <OsField label="OPERATOR NAME" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" icon="⊹" error={errors.name}/>
          <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email}/>
          <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 8 characters" icon="⚿" error={errors.pw}/>
          <PassStr pw={pw}/>
          <OsField label="CONFIRM PASSPHRASE" type="password" value={cpw} onChange={e=>setCpw(e.target.value)} placeholder="Repeat" icon="⚿" error={errors.cpw}/>
          <div style={{border:"1px solid rgba(0,255,176,.1)",borderRadius:3,background:"rgba(0,255,176,.02)",padding:"8px 10px",marginBottom:12}}><div style={{fontSize:8,color:"#00FFB0",letterSpacing:".12em",fontFamily:"monospace",marginBottom:2}}>AUTO WALLET INIT</div><p style={{margin:0,fontSize:9,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>ARC Network wallet generated & secured. Private key + 12-word phrase provided.</p></div>
          <div style={{marginBottom:errors.agreed?2:16}}><label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer"}}><div onClick={()=>setAgreed(!agreed)} style={{width:14,height:14,border:`1px solid ${agreed?"#00FFB0":"rgba(0,255,176,.2)"}`,borderRadius:2,flexShrink:0,marginTop:1,background:agreed?"rgba(0,255,176,.12)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s",color:"#00FFB0",fontSize:9}}>{agreed&&"✓"}</div><span style={{fontSize:9,color:"#0F3A22",fontFamily:"monospace",lineHeight:1.5}}>I accept <a href="#" style={{color:"#1E5C3A",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Terms</a> & <a href="#" style={{color:"#1E5C3A",textDecoration:"none"}} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Privacy Policy</a></span></label>{errors.agreed&&<div style={{fontSize:9,color:"#EF4444",fontFamily:"monospace",marginTop:2,marginLeft:22}}>Required</div>}</div>
          <ArcBtn label="⟶ Create account & wallet" onClick={submit} loading={loading}/>
          <Div/>
          <button onClick={()=>setShowWC(true)} style={{width:"100%",padding:"8px 0",background:"transparent",border:"1px solid rgba(0,255,176,.07)",borderRadius:3,color:"#0F3A22",fontSize:9,cursor:"pointer",fontFamily:"monospace",letterSpacing:".1em",transition:"all .2s",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:6}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.2)";e.currentTarget.style.color="#1E5C3A";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,.07)";e.currentTarget.style.color="#0F3A22";}}>⬡ Register with existing wallet</button>
        </div>}
        <div style={{marginTop:18,paddingTop:10,borderTop:"1px solid rgba(0,255,176,.05)",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:8,color:"#0A1F14",fontFamily:"monospace"}}>🔒 EIP-4361 · Viem · ZK</span><span style={{fontSize:8,color:"#0A1F14",fontFamily:"monospace"}}>USDC FEES · ARC 7070</span></div>
      </div>
    </>
  );
}
const Div=()=><div style={{margin:"16px 0 12px",display:"flex",alignItems:"center",gap:9}}><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/><span style={{fontSize:8,color:"#0A1F14",fontFamily:"monospace"}}>OR</span><div style={{flex:1,height:1,background:"rgba(0,255,176,.05)"}}/></div>;
const CS={background:"rgba(0,8,5,.94)",backdropFilter:"blur(20px)",border:"1px solid rgba(0,255,176,.12)",borderRadius:4,boxShadow:"0 0 60px rgba(0,255,176,.04),0 40px 80px rgba(0,0,0,.85)",padding:"28px 28px 24px",position:"relative",animation:"fu .6s ease forwards"};
const CORNERS=["tl","tr","bl","br"].map(p=><span key={p} style={{position:"absolute",zIndex:2,width:12,height:12,borderColor:"rgba(0,255,176,.25)",borderStyle:"solid",borderWidth:0,...(p==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:p==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:p==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5})}}/>);

/* ═══════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════ */
function AppCore() {
  const [booted,setBooted]=useState(false);
  const [user,setUser]=useState(null);
  const {account}=useW3();
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#000A06;overflow:hidden;}
        input,select,button{font-family:'JetBrains Mono',monospace;}
        input::placeholder{color:#0A1F14!important;}
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
      <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:user?"0":"24px 16px",position:"relative",zIndex:1,opacity:booted?1:0,transition:"opacity .6s ease .2s",overflow:"hidden"}}>
        {!user ? <AuthCard onAuth={u=>setUser(u)}/> : <Dashboard user={user}/>}
      </div>
    </>
  );
}

export default function PrivARCOS() {
  return <Web3Provider><AppCore/></Web3Provider>;
}
