import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const hex = (len) => Array.from({ length: len }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

function generateWallet() {
  const WORDLIST = [
    "abandon","ability","able","about","above","absent","absorb","abstract",
    "absurd","abuse","access","accident","account","accuse","achieve","acid",
    "acoustic","acquire","across","act","action","actor","actress","actual",
    "adapt","add","addict","address","adjust","admit","adult","advance",
    "advice","aerobic","afford","afraid","again","agent","agree","ahead",
    "aim","air","airport","aisle","alarm","album","alcohol","alert"
  ];
  return {
    privateKey: "0x" + hex(64),
    address: "0x" + hex(40),
    mnemonic: Array.from({ length: 12 }, () => WORDLIST[Math.floor(Math.random() * WORDLIST.length)]).join(" "),
    network: "ARC Network",
    created: new Date().toISOString()
  };
}

function shortAddr(a) { return a.slice(0, 8) + "···" + a.slice(-6); }

/* ═══════════════════════════════════════════════════════════════
   WALLET PROVIDERS CONFIG
═══════════════════════════════════════════════════════════════ */
const WALLETS = [
  {
    id: "metamask",
    name: "MetaMask",
    desc: "Browser extension & mobile",
    popular: true,
    color: "#E2761B",
    glow: "rgba(226,118,27,0.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isMetaMask,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <path d="M36.4 3L22.3 13.3l2.6-6.1L36.4 3z" fill="#E17726" stroke="#E17726" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3.6 3l14 10.4-2.5-6.2L3.6 3z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M31.1 27.5l-3.8 5.8 8.1 2.2 2.3-7.9-6.6-.1z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2.3 27.6l2.3 7.9 8.1-2.2-3.8-5.8-6.6.1z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12.3 18.1l-2.2 3.4 7.9.4-.3-8.5-5.4 4.7z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M27.7 18.1l-5.5-4.8-.3 8.6 7.9-.4-2.1-3.4z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12.7 33.3l4.8-2.3-4.1-3.2-.7 5.5z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22.5 31l4.8 2.3-.7-5.5-4.1 3.2z" fill="#E27625" stroke="#E27625" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M27.3 33.3l-4.8-2.3.4 3.2-.1 1.2 4.5-2.1z" fill="#D5BFB2" stroke="#D5BFB2" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12.7 33.3l4.5 2.1-.1-1.2.4-3.2-4.8 2.3z" fill="#D5BFB2" stroke="#D5BFB2" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17.3 25.6l-4-1.2 2.8-1.3 1.2 2.5z" fill="#233447" stroke="#233447" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22.7 25.6l1.2-2.5 2.9 1.3-4.1 1.2z" fill="#233447" stroke="#233447" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12.7 33.3l.7-5.8-4.5.1 3.8 5.7z" fill="#CC6228" stroke="#CC6228" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M26.6 27.5l.7 5.8 3.8-5.7-4.5-.1z" fill="#CC6228" stroke="#CC6228" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M29.9 21.5l-7.9.4.7 4.1 1.2-2.5 2.9 1.3 3.1-3.3z" fill="#CC6228" stroke="#CC6228" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13.3 24.4l2.9-1.3 1.2 2.5.7-4.1-7.9-.4 3.1 3.3z" fill="#CC6228" stroke="#CC6228" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10.1 21.5l3.3 6.5-.1-3.2-3.2-3.3z" fill="#E27525" stroke="#E27525" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M26.7 24.8l-.1 3.2 3.3-6.5-3.2 3.3z" fill="#E27525" stroke="#E27525" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17.9 21.9l-.7 4.1.9 4.6.2-6.1-.4-2.6z" fill="#E27525" stroke="#E27525" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22.1 21.9l-.4 2.5.2 6.1.9-4.6-.7-4z" fill="#E27525" stroke="#E27525" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22.8 26l-.9 4.6.6.4 3.8-3-.1-3.2-3.4 1.2z" fill="#F5841F" stroke="#F5841F" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13.3 24.4l-.1 3.2 3.8 3 .6-.4-.9-4.6-3.4-1.2z" fill="#F5841F" stroke="#F5841F" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22.9 35.4l.1-1.2-.4-.3h-5.2l-.3.3.1 1.2-4.5-2.1 1.6 1.3 3.2 2.2h5.5l3.2-2.2 1.5-1.3-4.8 2.1z" fill="#C0AC9D" stroke="#C0AC9D" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22.5 31l-.6-.4h-3.8l-.6.4-.4 3.2.3-.3h5.2l.4.3-.5-3.2z" fill="#161616" stroke="#161616" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M37 13.8l1.2-5.7L36.4 3l-13.9 10.3 5.3 4.5 7.5 2.2 1.7-1.9-.7-.5 1.1-1-.9-.7 1.1-.9-.6-.5z" fill="#763E1A" stroke="#763E1A" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M1.8 8.1l1.2 5.7-.8.6 1.1.9-.9.7 1.1 1-.7.5 1.7 1.9 7.5-2.2 5.3-4.5L3.6 3 1.8 8.1z" fill="#763E1A" stroke="#763E1A" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M35.3 20l-7.5-2.2 2.2 3.4-3.3 6.5 4.4-.1h6.6L35.3 20z" fill="#F5841F" stroke="#F5841F" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12.3 17.8L4.7 20 2.4 27.6h6.6l4.4.1-3.3-6.5 2.2-3.4z" fill="#F5841F" stroke="#F5841F" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22.1 21.9l.5-8.6-2.3-6.2h-4.6l-2.3 6.2.5 8.6.2 2.6v6.1h3.8l.1-6.1.2-2.6z" fill="#F5841F" stroke="#F5841F" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  },
  {
    id: "rabby",
    name: "Rabby Wallet",
    desc: "Multi-chain security focused",
    popular: true,
    color: "#7B68EE",
    glow: "rgba(123,104,238,0.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isRabby,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <rect width="40" height="40" rx="10" fill="#7B68EE"/>
        <ellipse cx="20" cy="19" rx="12" ry="10" fill="white" opacity="0.95"/>
        <circle cx="15" cy="17" r="2.5" fill="#7B68EE"/>
        <circle cx="25" cy="17" r="2.5" fill="#7B68EE"/>
        <circle cx="15.8" cy="16.2" r="1" fill="white"/>
        <circle cx="25.8" cy="16.2" r="1" fill="white"/>
        <path d="M15 22 Q20 26 25 22" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M8 14 Q6 10 10 9" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M32 14 Q34 10 30 9" stroke="#7B68EE" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    )
  },
  {
    id: "tokenpocket",
    name: "TokenPocket",
    desc: "Multi-chain mobile wallet",
    popular: false,
    color: "#2980FE",
    glow: "rgba(41,128,254,0.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isTokenPocket,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <rect width="40" height="40" rx="10" fill="#2980FE"/>
        <rect x="8" y="12" width="24" height="6" rx="3" fill="white" opacity="0.9"/>
        <rect x="8" y="22" width="16" height="6" rx="3" fill="white" opacity="0.6"/>
        <circle cx="30" cy="25" r="4" fill="white" opacity="0.9"/>
        <path d="M28.5 25 L30 23.5 L31.5 25 L30 26.5 Z" fill="#2980FE"/>
      </svg>
    )
  },
  {
    id: "walletconnect",
    name: "WalletConnect",
    desc: "Scan QR with any wallet",
    popular: true,
    color: "#3B99FC",
    glow: "rgba(59,153,252,0.3)",
    installed: () => true,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <rect width="40" height="40" rx="10" fill="#3B99FC"/>
        <path d="M11.2 15.8C15.9 11.1 23.5 11.1 28.2 15.8L28.8 16.4C29 16.6 29 16.9 28.8 17.1L27 18.9C26.9 19 26.7 19 26.6 18.9L25.8 18.1C22.6 14.9 17.4 14.9 14.2 18.1L13.4 18.9C13.3 19 13.1 19 13 18.9L11.2 17.1C11 16.9 11 16.6 11.2 15.8Z" fill="white"/>
        <path d="M30.6 18.2L32.2 19.8C32.4 20 32.4 20.3 32.2 20.5L24.5 28.2C24.3 28.4 24 28.4 23.8 28.2L18.5 22.9C18.4 22.8 18.3 22.8 18.2 22.9L12.9 28.2C12.7 28.4 12.4 28.4 12.2 28.2L4.5 20.5C4.3 20.3 4.3 20 4.5 19.8L6.1 18.2C6.3 18 6.6 18 6.8 18.2L12.1 23.5C12.2 23.6 12.3 23.6 12.4 23.5L17.7 18.2C17.9 18 18.2 18 18.4 18.2L23.7 23.5C23.8 23.6 23.9 23.6 24 23.5L29.3 18.2C29.5 18 29.8 18 30 18.2L30.6 18.2Z" fill="white"/>
      </svg>
    )
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    desc: "Self-custody by Coinbase",
    popular: false,
    color: "#0052FF",
    glow: "rgba(0,82,255,0.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isCoinbaseWallet,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <rect width="40" height="40" rx="10" fill="#0052FF"/>
        <circle cx="20" cy="20" r="11" fill="white"/>
        <circle cx="20" cy="20" r="11" fill="#0052FF" opacity="0.1"/>
        <rect x="15" y="17" width="10" height="6" rx="2" fill="#0052FF"/>
      </svg>
    )
  },
  {
    id: "trust",
    name: "Trust Wallet",
    desc: "Official Binance wallet",
    popular: false,
    color: "#3375BB",
    glow: "rgba(51,117,187,0.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isTrust,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <rect width="40" height="40" rx="10" fill="#3375BB"/>
        <path d="M20 8 L30 12 L30 21 C30 26.5 25.5 31 20 32 C14.5 31 10 26.5 10 21 L10 12 Z" fill="white" opacity="0.9"/>
        <path d="M16 20 L19 23 L24 17" stroke="#3375BB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  },
  {
    id: "okx",
    name: "OKX Wallet",
    desc: "Web3 gateway by OKX",
    popular: false,
    color: "#000000",
    glow: "rgba(255,255,255,0.15)",
    installed: () => typeof window !== "undefined" && !!window.okxwallet,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <rect width="40" height="40" rx="10" fill="#000"/>
        <rect x="8" y="8" width="10" height="10" rx="2" fill="white"/>
        <rect x="22" y="8" width="10" height="10" rx="2" fill="white"/>
        <rect x="8" y="22" width="10" height="10" rx="2" fill="white"/>
        <rect x="22" y="22" width="10" height="10" rx="2" fill="white"/>
      </svg>
    )
  },
  {
    id: "brave",
    name: "Brave Wallet",
    desc: "Built into Brave browser",
    popular: false,
    color: "#FF5000",
    glow: "rgba(255,80,0,0.3)",
    installed: () => typeof window !== "undefined" && !!window.ethereum?.isBraveWallet,
    icon: (
      <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
        <rect width="40" height="40" rx="10" fill="#FF5000"/>
        <path d="M20 7 L28 11 L31 20 L26 29 L20 33 L14 29 L9 20 L12 11 Z" fill="white" opacity="0.9"/>
        <path d="M20 12 L24 19 L20 28 L16 19 Z" fill="#FF5000" opacity="0.8"/>
        <circle cx="20" cy="20" r="2.5" fill="#FF5000"/>
      </svg>
    )
  },
];

/* ═══════════════════════════════════════════════════════════════
   HEX GRID BACKGROUND
═══════════════════════════════════════════════════════════════ */
function HexGrid() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf, t = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const drawHex = (x, y, r, alpha, fill) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        i === 0 ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a))
                : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.strokeStyle = `rgba(0,255,180,${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    };
    const draw = () => {
      t += 0.008;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const grd = ctx.createRadialGradient(canvas.width*.5, canvas.height*.4, 0, canvas.width*.5, canvas.height*.4, canvas.width*.7);
      grd.addColorStop(0, "rgba(0,20,12,1)");
      grd.addColorStop(1, "rgba(0,8,5,1)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const R = 38, cols = Math.ceil(canvas.width / (R * 1.73)) + 2, rows = Math.ceil(canvas.height / (R * 1.5)) + 2;
      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * R * 1.73 + (row % 2 === 0 ? 0 : R * 0.865);
          const y = row * R * 1.5;
          const d = Math.sqrt((x - canvas.width*.5)**2 + (y - canvas.height*.4)**2);
          const wave = Math.sin(d * 0.012 - t * 1.8) * 0.5 + 0.5;
          const pulse = Math.sin(t * 0.7 + col * 0.3 + row * 0.5) * 0.3 + 0.3;
          const alpha = wave * pulse * 0.4;
          drawHex(x, y, R - 2, alpha, alpha > 0.18 ? `rgba(0,255,160,${alpha * 0.06})` : null);
        }
      }
      for (let y = 0; y < canvas.height; y += 3) { ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(0, y, canvas.width, 1); }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ═══════════════════════════════════════════════════════════════
   BOOT SEQUENCE
═══════════════════════════════════════════════════════════════ */
function BootSequence({ onComplete }) {
  const [lines, setLines] = useState([]);
  const [done, setDone] = useState(false);
  const BOOT_LINES = [
    { t: 0,    text: "PRIVARC OS v2.4.1 — ARC Network", color: "#00FFB0" },
    { t: 300,  text: "Initializing cryptographic subsystems...", color: "#4ADE80" },
    { t: 700,  text: "Loading ZK-proof engine [Groth16] ✓", color: "#4ADE80" },
    { t: 1100, text: "Connecting to ARC Network RPC... [OK]", color: "#4ADE80" },
    { t: 1400, text: "ShieldVault contract: 0x7f3a...d9e2 ✓", color: "#4ADE80" },
    { t: 1700, text: "AI Agent cluster: ONLINE (8 agents)", color: "#00FFB0" },
    { t: 2000, text: "USDC fee module: active", color: "#4ADE80" },
    { t: 2300, text: "Privacy layer: ARMED", color: "#F59E0B" },
    { t: 2700, text: "━━━ SYSTEM READY — AUTHENTICATE TO PROCEED ━━━", color: "#00FFB0" },
  ];
  useEffect(() => {
    BOOT_LINES.forEach(({ t, text, color }) => setTimeout(() => setLines(p => [...p, { text, color }]), t));
    setTimeout(() => { setDone(true); setTimeout(onComplete, 500); }, 3400);
  }, []);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, background:"#000A06",
      display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 10vw",
      fontFamily:"'JetBrains Mono','Fira Code',monospace",
      opacity: done ? 0 : 1, transition:"opacity 0.5s ease", pointerEvents: done ? "none" : "all" }}>
      <div style={{ marginBottom:32 }}>
        <div style={{ fontSize:11, color:"#1A4A30", letterSpacing:"0.3em", marginBottom:8 }}>PRIVARC AUTONOMOUS CRYPTO OS</div>
        <div style={{ width:60, height:2, background:"#00FFB0", marginBottom:24 }} />
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize:13, color:l.color, marginBottom:6, letterSpacing:"0.05em", lineHeight:1.6, animation:"fadeIn 0.3s ease forwards" }}>
          <span style={{ color:"#1A4A30", marginRight:12 }}>[{String(i).padStart(2,"0")}]</span>{l.text}
        </div>
      ))}
      {lines.length > 0 && (
        <div style={{ marginTop:24, height:2, background:"#0A2018", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, height:"100%", background:"#00FFB0",
            width:`${Math.min(100, (lines.length / BOOT_LINES.length) * 100)}%`,
            transition:"width 0.3s ease", boxShadow:"0 0 10px #00FFB0" }} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GLITCH TEXT
═══════════════════════════════════════════════════════════════ */
function GlitchText({ text, style }) {
  return (
    <span style={{ position:"relative", display:"inline-block", ...style }}>
      <span style={{ position:"relative", zIndex:1 }}>{text}</span>
      <span style={{ position:"absolute", top:0, left:0, color:"#00FFB0", opacity:0, animation:"glitch1 4s infinite", clipPath:"polygon(0 30%,100% 30%,100% 50%,0 50%)", transform:"translateX(-2px)" }}>{text}</span>
      <span style={{ position:"absolute", top:0, left:0, color:"#0EA5E9", opacity:0, animation:"glitch2 4s infinite", clipPath:"polygon(0 60%,100% 60%,100% 80%,0 80%)", transform:"translateX(2px)" }}>{text}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OS INPUT FIELD
═══════════════════════════════════════════════════════════════ */
function OsField({ label, type, value, onChange, placeholder, icon, error }) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <label style={{ fontSize:10, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase",
          color: focused ? "#00FFB0" : "#1E5C3A", fontFamily:"monospace", transition:"color 0.2s" }}>
          {icon} {label}
        </label>
        {error && <span style={{ fontSize:10, color:"#EF4444", letterSpacing:"0.05em" }}>⚠ {error}</span>}
      </div>
      <div style={{ position:"relative" }}>
        {["tl","tr","bl","br"].map(pos => (
          <span key={pos} style={{
            position:"absolute", zIndex:2, width:8, height:8,
            borderColor: focused ? "#00FFB0" : (error ? "#EF4444" : "#1A4A30"),
            borderStyle:"solid", borderWidth:0, transition:"border-color 0.2s",
            ...(pos==="tl"?{top:-1,left:-1,borderTopWidth:2,borderLeftWidth:2}:{}),
            ...(pos==="tr"?{top:-1,right:-1,borderTopWidth:2,borderRightWidth:2}:{}),
            ...(pos==="bl"?{bottom:-1,left:-1,borderBottomWidth:2,borderLeftWidth:2}:{}),
            ...(pos==="br"?{bottom:-1,right:-1,borderBottomWidth:2,borderRightWidth:2}:{}),
          }} />
        ))}
        <input type={isPass && !showPass ? "password" : "text"} value={value} onChange={onChange}
          placeholder={placeholder} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ width:"100%", boxSizing:"border-box", padding:"12px 40px 12px 14px",
            background: focused ? "rgba(0,255,176,0.03)" : "rgba(0,0,0,0.4)",
            border:`1px solid ${error?"#EF4444":focused?"rgba(0,255,176,0.4)":"rgba(0,255,176,0.1)"}`,
            borderRadius:3, color:"#A7F3D0", fontSize:13,
            fontFamily:"'JetBrains Mono','Fira Code',monospace", outline:"none",
            letterSpacing:"0.05em",
            boxShadow: focused?"0 0 20px rgba(0,255,176,0.06),inset 0 0 20px rgba(0,255,176,0.02)":"none",
            transition:"all 0.2s" }} />
        {isPass && (
          <button onClick={() => setShowPass(!showPass)} style={{ position:"absolute", right:10, top:"50%",
            transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer",
            color: showPass?"#00FFB0":"#1E5C3A", fontSize:14, padding:0, fontFamily:"monospace" }}>
            {showPass ? "◉" : "◎"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PASSWORD STRENGTH
═══════════════════════════════════════════════════════════════ */
function PassStrength({ pw }) {
  if (!pw) return null;
  const score = [pw.length>=8,/[A-Z]/.test(pw),/[0-9]/.test(pw),/[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  const cols = ["","#EF4444","#F59E0B","#3B82F6","#00FFB0"];
  const labels = ["","WEAK","FAIR","GOOD","STRONG"];
  return (
    <div style={{ marginTop:-10, marginBottom:16 }}>
      <div style={{ display:"flex", gap:3 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex:1, height:2,
            background: i<=score?cols[score]:"#0A1F14",
            boxShadow: i<=score&&score===4?`0 0 6px ${cols[score]}`:"none",
            transition:"background 0.3s" }} />
        ))}
      </div>
      <div style={{ marginTop:4, fontSize:9, color:cols[score], letterSpacing:"0.12em" }}>ENTROPY: {labels[score]}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WALLET CONNECT MODAL
═══════════════════════════════════════════════════════════════ */
function WalletConnectModal({ onClose, onConnect }) {
  const [connecting, setConnecting] = useState(null); // wallet id being connected
  const [step, setStep] = useState("list"); // list | connecting | sign | success | error
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [connectedAddr, setConnectedAddr] = useState("");

  const simulateConnect = async (wallet) => {
    setSelectedWallet(wallet);
    setConnecting(wallet.id);
    setStep("connecting");

    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

    // Simulate MetaMask/Rabby actually being installed
    if (wallet.installed() && typeof window !== "undefined" && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts?.[0]) {
          setConnectedAddr(accounts[0]);
          setStep("sign");
          return;
        }
      } catch (e) {
        // user rejected or not on ARC network — fall through to simulation
      }
    }

    // Simulation fallback
    setStep("sign");
    setConnectedAddr("0x" + hex(40));
  };

  const handleSign = async () => {
    setStep("connecting");
    await new Promise(r => setTimeout(r, 900));
    setStep("success");
    setTimeout(() => {
      onConnect({
        address: connectedAddr,
        wallet: selectedWallet,
        via: "wallet_connect"
      });
    }, 1200);
  };

  // Backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const popular = WALLETS.filter(w => w.popular);
  const others  = WALLETS.filter(w => !w.popular);

  return (
    <div onClick={handleBackdrop} style={{
      position:"fixed", inset:0, zIndex:200,
      background:"rgba(0,0,0,0.85)",
      backdropFilter:"blur(8px)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:"16px",
      animation:"fadeIn 0.2s ease"
    }}>
      <div style={{
        width:"100%", maxWidth:440,
        background:"rgba(0,10,6,0.97)",
        border:"1px solid rgba(0,255,176,0.18)",
        borderRadius:6,
        boxShadow:"0 0 80px rgba(0,255,176,0.06), 0 40px 80px rgba(0,0,0,0.9)",
        overflow:"hidden",
        animation:"fadeUp 0.25s ease"
      }}>
        {/* Modal header */}
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"18px 22px 16px",
          borderBottom:"1px solid rgba(0,255,176,0.08)"
        }}>
          <div>
            <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:3 }}>
              WALLET CONNECTION PROTOCOL
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:"#00FFB0", fontFamily:"monospace", letterSpacing:"0.08em" }}>
              {step === "list"       && "Select Wallet Provider"}
              {step === "connecting" && `Connecting to ${selectedWallet?.name}...`}
              {step === "sign"       && "Sign Authentication Request"}
              {step === "success"    && "Wallet Linked Successfully"}
              {step === "error"      && "Connection Failed"}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:"none", border:"1px solid rgba(0,255,176,0.1)", borderRadius:3,
            color:"#1E5C3A", fontSize:16, width:30, height:30, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"monospace", transition:"all 0.2s"
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor="rgba(0,255,176,0.3)"; e.currentTarget.style.color="#00FFB0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(0,255,176,0.1)"; e.currentTarget.style.color="#1E5C3A"; }}
          >✕</button>
        </div>

        <div style={{ padding:"20px 22px 22px" }}>

          {/* ── WALLET LIST ── */}
          {step === "list" && (
            <div style={{ animation:"fadeIn 0.3s ease" }}>
              {/* Popular */}
              <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.18em", fontFamily:"monospace", marginBottom:10 }}>
                ▸ POPULAR
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
                {popular.map(w => (
                  <WalletCard key={w.id} wallet={w} onClick={() => simulateConnect(w)} />
                ))}
              </div>

              {/* Others */}
              <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.18em", fontFamily:"monospace", marginBottom:10 }}>
                ▸ MORE WALLETS
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {others.map(w => (
                  <WalletCard key={w.id} wallet={w} onClick={() => simulateConnect(w)} />
                ))}
              </div>

              <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid rgba(0,255,176,0.06)",
                fontSize:9, color:"#0A1F14", fontFamily:"monospace", textAlign:"center", lineHeight:1.6 }}>
                Connection secured by EIP-4361 · Sign-In With Ethereum
              </div>
            </div>
          )}

          {/* ── CONNECTING ── */}
          {step === "connecting" && selectedWallet && (
            <div style={{ animation:"fadeIn 0.3s ease", textAlign:"center", padding:"20px 0" }}>
              <div style={{ position:"relative", width:80, height:80, margin:"0 auto 20px" }}>
                <div style={{ width:80, height:80, borderRadius:"50%",
                  border:`2px solid ${selectedWallet.color}22`,
                  display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {selectedWallet.icon}
                </div>
                <svg style={{ position:"absolute", inset:0, animation:"spin 1.2s linear infinite" }}
                  width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="37" fill="none"
                    stroke={selectedWallet.color} strokeWidth="1.5"
                    strokeDasharray="60 180" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ fontSize:12, color:"#A7F3D0", fontFamily:"monospace", marginBottom:6 }}>
                Opening {selectedWallet.name}...
              </div>
              <div style={{ fontSize:10, color:"#0F3A22", fontFamily:"monospace" }}>
                Confirm connection in your wallet
              </div>
            </div>
          )}

          {/* ── SIGN REQUEST ── */}
          {step === "sign" && selectedWallet && (
            <div style={{ animation:"fadeIn 0.3s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
                <div style={{ width:42, height:42, borderRadius:8,
                  background:`${selectedWallet.color}15`,
                  border:`1px solid ${selectedWallet.color}33`,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {selectedWallet.icon}
                </div>
                <div>
                  <div style={{ fontSize:12, color:"#A7F3D0", fontFamily:"monospace", fontWeight:700 }}>
                    {selectedWallet.name}
                  </div>
                  <div style={{ fontSize:10, color:"#1E5C3A", fontFamily:"monospace", marginTop:2 }}>
                    {shortAddr(connectedAddr)}
                  </div>
                </div>
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0",
                    boxShadow:"0 0 6px #00FFB0" }} />
                  <span style={{ fontSize:9, color:"#00FFB0", fontFamily:"monospace" }}>CONNECTED</span>
                </div>
              </div>

              {/* Sign message preview */}
              <div style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(0,255,176,0.1)",
                borderRadius:4, padding:"14px 16px", marginBottom:18, fontFamily:"monospace" }}>
                <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.15em", marginBottom:10 }}>
                  SIGNATURE REQUEST — EIP-4361
                </div>
                {[
                  ["Domain",  "privarc.io"],
                  ["Address", shortAddr(connectedAddr)],
                  ["Chain",   "ARC Network (chainId: 1337)"],
                  ["Nonce",   hex(8)],
                  ["Issued",  new Date().toISOString().split("T")[0]],
                  ["URI",     "https://privarc.io/auth"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:"flex", gap:12, marginBottom:5 }}>
                    <span style={{ fontSize:10, color:"#0F3A22", minWidth:60 }}>{k}:</span>
                    <span style={{ fontSize:10, color:"#4ADE80" }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid rgba(0,255,176,0.06)",
                  fontSize:10, color:"#0F3A22" }}>
                  Statement: Sign in to PrivARC OS. This request will not trigger a blockchain transaction or cost any fees.
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <button onClick={onClose} style={{
                  padding:"11px 0", background:"transparent",
                  border:"1px solid rgba(0,255,176,0.1)", borderRadius:3,
                  color:"#1E5C3A", fontSize:10, cursor:"pointer",
                  fontFamily:"monospace", letterSpacing:"0.12em",
                  transition:"all 0.2s"
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="rgba(0,255,176,0.25)"; e.currentTarget.style.color="#00FFB0"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(0,255,176,0.1)"; e.currentTarget.style.color="#1E5C3A"; }}
                >CANCEL</button>
                <button onClick={handleSign} style={{
                  padding:"11px 0", background:"transparent",
                  border:"1px solid #00FFB0", borderRadius:3,
                  color:"#00FFB0", fontSize:10, fontWeight:700, cursor:"pointer",
                  fontFamily:"monospace", letterSpacing:"0.12em",
                  boxShadow:"0 0 16px rgba(0,255,176,0.12)",
                  transition:"all 0.2s"
                }}
                  onMouseEnter={e => e.currentTarget.style.background="rgba(0,255,176,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                >⟶ SIGN & ENTER</button>
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === "success" && selectedWallet && (
            <div style={{ animation:"fadeIn 0.4s ease", textAlign:"center", padding:"16px 0" }}>
              <div style={{ position:"relative", width:72, height:72, margin:"0 auto 16px" }}>
                <div style={{ width:72, height:72, borderRadius:"50%",
                  background:"rgba(0,255,176,0.08)",
                  border:"2px solid #00FFB0",
                  boxShadow:"0 0 30px rgba(0,255,176,0.2)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:28 }}>✓</div>
              </div>
              <div style={{ fontSize:13, color:"#00FFB0", fontFamily:"monospace", fontWeight:700, marginBottom:4 }}>
                Authentication Successful
              </div>
              <div style={{ fontSize:10, color:"#1E5C3A", fontFamily:"monospace" }}>
                {selectedWallet.name} · {shortAddr(connectedAddr)}
              </div>
              <div style={{ marginTop:14, fontSize:9, color:"#0A1F14", fontFamily:"monospace" }}>
                Launching PrivARC OS...
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* Wallet card in the modal list */
function WalletCard({ wallet, onClick }) {
  const [hovered, setHovered] = useState(false);
  const isInstalled = wallet.installed();
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? `${wallet.color}0D` : "rgba(0,0,0,0.3)",
        border: `1px solid ${hovered ? wallet.color + "44" : "rgba(0,255,176,0.08)"}`,
        borderRadius:5, padding:"12px 12px", cursor:"pointer",
        display:"flex", alignItems:"center", gap:10,
        transition:"all 0.2s", textAlign:"left",
        boxShadow: hovered ? `0 0 20px ${wallet.glow}` : "none"
      }}>
      <div style={{ width:36, height:36, borderRadius:8, overflow:"hidden",
        flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
        background: hovered ? `${wallet.color}18` : "rgba(255,255,255,0.04)",
        border:`1px solid ${hovered ? wallet.color+"33" : "rgba(255,255,255,0.06)"}`,
        transition:"all 0.2s" }}>
        {wallet.icon}
      </div>
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ fontSize:11, color: hovered ? "#E2F8FF" : "#A7F3D0",
          fontFamily:"monospace", fontWeight:700,
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
          transition:"color 0.2s" }}>
          {wallet.name}
        </div>
        <div style={{ fontSize:9, color:"#0F3A22", fontFamily:"monospace", marginTop:2,
          display:"flex", alignItems:"center", gap:5 }}>
          {isInstalled && (
            <span style={{ color:"#00FFB0", fontSize:8 }}>● </span>
          )}
          {isInstalled ? "Detected" : wallet.desc.split(" ").slice(0,2).join(" ")}
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WALLET REVEAL (after email signup)
═══════════════════════════════════════════════════════════════ */
function WalletReveal({ wallet, onContinue }) {
  const [phase, setPhase] = useState(0);
  const [copied, setCopied] = useState({});
  const [showMnem, setShowMnem] = useState(false);
  const [showPk, setShowPk] = useState(false);
  const [progress, setProgress] = useState(0);
  const GEN_STEPS = ["Generating entropy from /dev/urandom...","Deriving secp256k1 keypair...","Computing ARC Network address...","Encoding BIP-39 mnemonic...","Registering stealth keys...","Linking to PrivARC account...","WALLET READY"];
  useEffect(() => {
    const steps = [0,15,35,55,72,88,100]; let i = 0;
    const id = setInterval(() => { i++; setProgress(steps[i]||100); if(i>=steps.length-1){clearInterval(id);setTimeout(()=>setPhase(1),400);} }, 280);
    return () => clearInterval(id);
  }, []);
  const copy = (key, text) => {
    navigator.clipboard.writeText(text).catch(()=>{});
    setCopied(p=>({...p,[key]:true}));
    setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000);
  };
  const DataRow = ({label, value, copyKey, blurred, onReveal, revealed}) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.15em", fontFamily:"monospace", marginBottom:5, textTransform:"uppercase" }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(0,255,176,0.03)", border:"1px solid rgba(0,255,176,0.1)", borderRadius:3, padding:"9px 12px" }}>
        <span style={{ flex:1, fontSize:11, fontFamily:"monospace", color:"#A7F3D0", wordBreak:"break-all", lineHeight:1.5, filter:blurred&&!revealed?"blur(5px)":"none", transition:"filter 0.3s", userSelect:blurred&&!revealed?"none":"text" }}>{value}</span>
        {blurred && (<button onClick={onReveal} style={{ background:"none", border:"1px solid rgba(0,255,176,0.2)", borderRadius:2, color:"#00FFB0", fontSize:9, padding:"3px 7px", cursor:"pointer", fontFamily:"monospace", letterSpacing:"0.1em", flexShrink:0 }}>{revealed?"HIDE":"SHOW"}</button>)}
        <button onClick={()=>copy(copyKey,value)} style={{ background:"none", border:"1px solid rgba(0,255,176,0.15)", borderRadius:2, color:copied[copyKey]?"#00FFB0":"#1E5C3A", fontSize:9, padding:"3px 7px", cursor:"pointer", fontFamily:"monospace", letterSpacing:"0.1em", flexShrink:0, transition:"color 0.2s" }}>{copied[copyKey]?"✓ OK":"COPY"}</button>
      </div>
    </div>
  );
  if (phase === 0) return (
    <div style={{ padding:"8px 0" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <div style={{ width:10, height:10, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 12px #00FFB0", animation:"pulse 1s ease infinite" }} />
        <span style={{ fontSize:11, color:"#00FFB0", letterSpacing:"0.15em", fontFamily:"monospace" }}>GENERATING WALLET</span>
      </div>
      {GEN_STEPS.slice(0, Math.ceil((progress/100)*GEN_STEPS.length)).map((s,i)=>(
        <div key={i} style={{ fontSize:12, color:i===Math.ceil((progress/100)*GEN_STEPS.length)-1?"#A7F3D0":"#1E5C3A", marginBottom:6, fontFamily:"monospace", letterSpacing:"0.04em", animation:"fadeIn 0.3s ease" }}>
          <span style={{ color:"#0F3A22", marginRight:10 }}>›</span>{s}
        </div>
      ))}
      <div style={{ marginTop:20, background:"#0A1F14", borderRadius:2, overflow:"hidden", height:3 }}>
        <div style={{ height:"100%", background:"linear-gradient(90deg,#00FFB0,#0EA5E9)", width:`${progress}%`, transition:"width 0.28s ease", boxShadow:"0 0 8px #00FFB0" }} />
      </div>
      <div style={{ marginTop:6, fontSize:10, color:"#0F3A22", textAlign:"right", fontFamily:"monospace" }}>{progress}%</div>
    </div>
  );
  return (
    <div style={{ animation:"fadeIn 0.4s ease" }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          <div style={{ width:8, height:8, background:"#00FFB0", borderRadius:"50%", boxShadow:"0 0 8px #00FFB0" }} />
          <span style={{ fontSize:13, fontWeight:700, color:"#00FFB0", letterSpacing:"0.1em", fontFamily:"monospace" }}>WALLET INITIALIZED</span>
        </div>
        <p style={{ margin:0, fontSize:11, color:"#1E5C3A", fontFamily:"monospace" }}>ARC Network · Stealth address enabled · ZK-ready</p>
      </div>
      <div style={{ border:"1px solid rgba(245,158,11,0.3)", borderRadius:3, background:"rgba(245,158,11,0.05)", padding:"10px 14px", marginBottom:18, display:"flex", gap:10 }}>
        <span style={{ color:"#F59E0B", fontSize:13 }}>⚠</span>
        <p style={{ margin:0, fontSize:11, color:"#92400E", lineHeight:1.5, fontFamily:"monospace" }}>CRITICAL: Store your recovery phrase offline. PrivARC cannot recover lost keys.</p>
      </div>
      <DataRow label="// ARC Network Address" value={wallet.address} copyKey="addr" />
      <DataRow label="// Recovery Phrase (BIP-39)" value={wallet.mnemonic} copyKey="mnem" blurred revealed={showMnem} onReveal={()=>setShowMnem(!showMnem)} />
      <DataRow label="// Private Key — NEVER SHARE" value={wallet.privateKey} copyKey="pk" blurred revealed={showPk} onReveal={()=>setShowPk(!showPk)} />
      <button onClick={onContinue} style={{ width:"100%", marginTop:8, padding:"13px 0", background:"transparent", border:"1px solid #00FFB0", borderRadius:3, color:"#00FFB0", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"monospace", letterSpacing:"0.15em", boxShadow:"0 0 20px rgba(0,255,176,0.1),inset 0 0 20px rgba(0,255,176,0.03)", transition:"all 0.2s", textTransform:"uppercase" }}
        onMouseEnter={e=>{e.currentTarget.style.background="rgba(0,255,176,0.08)";e.currentTarget.style.boxShadow="0 0 30px rgba(0,255,176,0.2),inset 0 0 30px rgba(0,255,176,0.05)";}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.boxShadow="0 0 20px rgba(0,255,176,0.1),inset 0 0 20px rgba(0,255,176,0.03)";}}>
        ⟶ Launch PrivARC OS
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════ */
function Dashboard({ user, wallet }) {
  const [agentLogs, setAgentLogs] = useState([
    {t:"00:00:01",msg:"ShieldAgent :: Monitoring deposit pool",col:"#00FFB0"},
    {t:"00:00:03",msg:"SwapAgent :: DEX liquidity scan complete",col:"#4ADE80"},
    {t:"00:00:07",msg:"RiskAgent :: Volatility index: LOW",col:"#4ADE80"},
    {t:"00:00:12",msg:"ZKAgent :: Proof batch ready (0 pending)",col:"#4ADE80"},
  ]);
  useEffect(() => {
    const msgs = [
      ["ZKAgent :: New proof generated","#00FFB0"],["ShieldAgent :: Pool depth nominal","#4ADE80"],
      ["FeeAgent :: Fee sweep: 0.00 USDC","#4ADE80"],["PrivacyAgent :: Stealth scan — 0 new notes","#4ADE80"],
      ["RiskAgent :: On-chain anomaly score: 0.02","#4ADE80"],["SwapAgent :: Slippage within bounds","#4ADE80"],
      ["BridgeAgent :: Cross-chain bridge idle","#1E5C3A"],["GovAgent :: No pending proposals","#1E5C3A"],
    ];
    const id = setInterval(() => {
      if (Math.random() > 0.55) {
        const [msg,col] = msgs[Math.floor(Math.random()*msgs.length)];
        const n = new Date();
        const t = [n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":");
        setAgentLogs(p=>[...p.slice(-6),{t,msg,col}]);
      }
    }, 1800);
    return () => clearInterval(id);
  }, []);
  const AGENTS = [
    {id:"SA",name:"ShieldAgent",status:"ACTIVE",load:12},{id:"SW",name:"SwapAgent",status:"ACTIVE",load:8},
    {id:"PV",name:"PrivacyAgent",status:"ACTIVE",load:34},{id:"RK",name:"RiskAgent",status:"ACTIVE",load:5},
    {id:"ZK",name:"ZKAgent",status:"ACTIVE",load:67},{id:"BR",name:"BridgeAgent",status:"STANDBY",load:0},
    {id:"GO",name:"GovAgent",status:"ACTIVE",load:2},{id:"FE",name:"FeeAgent",status:"ACTIVE",load:18},
  ];
  const ACTIONS = [
    {icon:"🛡",label:"SHIELD",desc:"Deposit private"},{icon:"⇄",label:"SWAP",desc:"Private exchange"},
    {icon:"↗",label:"SEND",desc:"Private transfer"},{icon:"↙",label:"WITHDRAW",desc:"Public exit"},
    {icon:"⟺",label:"BRIDGE",desc:"Cross-chain"},
  ];
  const viaWallet = wallet.via === "wallet_connect";
  return (
    <div style={{ animation:"fadeIn 0.4s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, paddingBottom:16, borderBottom:"1px solid rgba(0,255,176,0.08)" }}>
        <div>
          <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:4 }}>OPERATOR</div>
          <div style={{ fontSize:14, color:"#A7F3D0", fontFamily:"monospace", fontWeight:700 }}>{user.name || user.email?.split("@")[0] || "Anonymous"}</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
            {viaWallet && (
              <div style={{ width:16, height:16, borderRadius:3, overflow:"hidden", flexShrink:0 }}>
                {wallet.wallet?.icon}
              </div>
            )}
            <div style={{ fontSize:10, color:"#1E5C3A", fontFamily:"monospace" }}>{shortAddr(wallet.address)}</div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end", marginBottom:4 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FFB0", boxShadow:"0 0 6px #00FFB0", animation:"pulse 2s ease infinite" }} />
            <span style={{ fontSize:9, color:"#00FFB0", letterSpacing:"0.15em", fontFamily:"monospace" }}>MAINNET</span>
          </div>
          <div style={{ fontSize:10, color:"#0F3A22", fontFamily:"monospace" }}>ARC Network</div>
          {viaWallet && <div style={{ fontSize:9, color:"#1E5C3A", fontFamily:"monospace", marginTop:2 }}>via {wallet.wallet?.name}</div>}
        </div>
      </div>
      <div style={{ background:"rgba(0,255,176,0.03)", border:"1px solid rgba(0,255,176,0.12)", borderRadius:4, padding:"16px 18px", marginBottom:16 }}>
        <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:8 }}>SHIELDED BALANCE</div>
        <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
          <span style={{ fontSize:32, fontWeight:700, color:"#00FFB0", fontFamily:"monospace", lineHeight:1 }}>0.00</span>
          <span style={{ fontSize:13, color:"#1E5C3A", fontFamily:"monospace" }}>USDC</span>
        </div>
        <div style={{ marginTop:8, fontSize:10, color:"#0F3A22", fontFamily:"monospace" }}>≈ $0.00 USD · Fees: 0.00 USDC total paid</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6, marginBottom:16 }}>
        {ACTIONS.map(a => (
          <button key={a.label} style={{ background:"rgba(0,255,176,0.03)", border:"1px solid rgba(0,255,176,0.1)", borderRadius:4, padding:"10px 4px", cursor:"pointer", textAlign:"center", transition:"all 0.2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,0.35)";e.currentTarget.style.background="rgba(0,255,176,0.07)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,255,176,0.1)";e.currentTarget.style.background="rgba(0,255,176,0.03)";}}>
            <div style={{ fontSize:18, marginBottom:4 }}>{a.icon}</div>
            <div style={{ fontSize:9, color:"#00FFB0", fontFamily:"monospace", letterSpacing:"0.1em", fontWeight:700 }}>{a.label}</div>
            <div style={{ fontSize:8, color:"#0F3A22", fontFamily:"monospace", marginTop:2 }}>{a.desc}</div>
          </button>
        ))}
      </div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:8 }}>AI AGENT CLUSTER — 8 NODES</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
          {AGENTS.map(a => (
            <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(0,0,0,0.3)", border:"1px solid rgba(0,255,176,0.06)", borderRadius:3, padding:"6px 10px" }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:a.status==="ACTIVE"?"#00FFB0":"#1E5C3A", flexShrink:0, boxShadow:a.status==="ACTIVE"?"0 0 5px #00FFB0":"none" }} />
              <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:9, color:"#1E5C3A", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}</div></div>
              <div style={{ fontSize:8, color:a.status==="ACTIVE"?"#00FFB0":"#0F3A22", fontFamily:"monospace", flexShrink:0 }}>{a.load>0?`${a.load}%`:"---"}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:"#000A06", border:"1px solid rgba(0,255,176,0.08)", borderRadius:3, padding:"10px 12px", maxHeight:110, overflow:"hidden" }}>
        <div style={{ fontSize:9, color:"#0F3A22", letterSpacing:"0.2em", fontFamily:"monospace", marginBottom:6 }}>SYSTEM LOG</div>
        {agentLogs.slice(-5).map((l,i)=>(
          <div key={i} style={{ fontSize:10, fontFamily:"monospace", marginBottom:3, color:l.col, lineHeight:1.4, animation:i===agentLogs.slice(-5).length-1?"fadeIn 0.3s ease":"none" }}>
            <span style={{ color:"#0A1F14", marginRight:8 }}>[{l.t}]</span>{l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════ */
export default function PrivARCOS() {
  const [booted, setBooted]     = useState(false);
  const [screen, setScreen]     = useState("login");
  const [showWCModal, setShowWCModal] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [wallet, setWallet]     = useState(null);
  const [user, setUser]         = useState(null);

  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw]       = useState("");
  const [cpw, setCpw]     = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (screen==="signup" && !name.trim()) e.name = "Required";
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Invalid email";
    if (!pw||pw.length<8) e.pw = "Min 8 chars";
    if (screen==="signup") {
      if (pw!==cpw) e.cpw = "Mismatch";
      if (!agreed) e.agreed = "Required";
    }
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const w = generateWallet();
      setWallet(w);
      setUser({ name: name||email.split("@")[0], email });
      setScreen(screen==="signup" ? "wallet" : "dashboard");
    }, screen==="login" ? 1200 : 1600);
  };

  const reset = (s) => {
    setScreen(s); setErrors({});
    setName(""); setEmail(""); setPw(""); setCpw(""); setAgreed(false);
  };

  // Called when wallet connect succeeds
  const handleWalletConnected = ({ address, wallet: w, via }) => {
    setShowWCModal(false);
    setWallet({ address, via, wallet: w, network: "ARC Network" });
    setUser({ name: w.name + " User", email: null });
    setScreen("dashboard");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#000A06;overflow-x:hidden;}
        input{font-family:'JetBrains Mono',monospace!important;}
        input::placeholder{color:#0A1F14!important;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(0.9)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes glitch1{0%,89%,100%{opacity:0}90%{opacity:.8;transform:translateX(-3px)}95%{opacity:0;transform:translateX(3px)}}
        @keyframes glitch2{0%,93%,100%{opacity:0}94%{opacity:.6;transform:translateX(3px)}98%{opacity:0;transform:translateX(-2px)}}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:#000A06;}
        ::-webkit-scrollbar-thumb{background:rgba(0,255,176,0.2);border-radius:2px;}
      `}</style>

      <HexGrid />
      {!booted && <BootSequence onComplete={() => setBooted(true)} />}
      {showWCModal && <WalletConnectModal onClose={() => setShowWCModal(false)} onConnect={handleWalletConnected} />}

      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
        padding:"24px 16px", position:"relative", zIndex:1,
        opacity: booted?1:0, transition:"opacity 0.6s ease 0.2s" }}>

        <div style={{ width:"100%", maxWidth:460,
          background:"rgba(0,8,5,0.92)", backdropFilter:"blur(20px)",
          border:"1px solid rgba(0,255,176,0.12)", borderRadius:4,
          boxShadow:"0 0 60px rgba(0,255,176,0.04),0 40px 80px rgba(0,0,0,0.8)",
          padding:"32px 32px 28px", position:"relative",
          animation: booted?"fadeUp 0.6s ease forwards":"none" }}>

          {/* Corner decorations */}
          {["tl","tr","bl","br"].map(pos=>(
            <span key={pos} style={{ position:"absolute", zIndex:2, width:14, height:14,
              borderColor:"rgba(0,255,176,0.25)", borderStyle:"solid", borderWidth:0,
              ...(pos==="tl"?{top:-1,left:-1,borderTopWidth:1.5,borderLeftWidth:1.5}:{}),
              ...(pos==="tr"?{top:-1,right:-1,borderTopWidth:1.5,borderRightWidth:1.5}:{}),
              ...(pos==="bl"?{bottom:-1,left:-1,borderBottomWidth:1.5,borderLeftWidth:1.5}:{}),
              ...(pos==="br"?{bottom:-1,right:-1,borderBottomWidth:1.5,borderRightWidth:1.5}:{}),
            }} />
          ))}

          {/* Logo */}
          {(screen==="login"||screen==="signup") && (
            <div style={{ marginBottom:28 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                <div style={{ width:32, height:32, border:"1.5px solid #00FFB0", borderRadius:3,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:15, color:"#00FFB0", boxShadow:"0 0 12px rgba(0,255,176,0.2)" }}>◈</div>
                <GlitchText text="privARC" style={{ fontSize:22, fontWeight:800, color:"#00FFB0",
                  fontFamily:"'Syne',sans-serif", letterSpacing:"-0.01em" }} />
                <span style={{ fontSize:9, color:"#0F3A22", fontFamily:"monospace",
                  letterSpacing:"0.12em", alignSelf:"flex-end", paddingBottom:2 }}>OS</span>
              </div>
              <p style={{ fontSize:10.5, color:"#1E5C3A", fontFamily:"monospace",
                letterSpacing:"0.06em", lineHeight:1.6, maxWidth:340 }}>
                Autonomous crypto operating system for private on-chain capital management — powered by AI agents on ARC Network.
              </p>
            </div>
          )}

          {/* Tabs */}
          {(screen==="login"||screen==="signup") && (
            <div style={{ display:"flex", gap:0, border:"1px solid rgba(0,255,176,0.1)", borderRadius:3, overflow:"hidden", marginBottom:26 }}>
              {["login","signup"].map(s=>(
                <button key={s} onClick={()=>reset(s)} style={{ flex:1, padding:"9px 0",
                  background:screen===s?"rgba(0,255,176,0.08)":"transparent", border:"none",
                  borderRight:s==="login"?"1px solid rgba(0,255,176,0.1)":"none",
                  color:screen===s?"#00FFB0":"#1E5C3A",
                  fontSize:10, fontWeight:700, cursor:"pointer",
                  fontFamily:"monospace", letterSpacing:"0.15em",
                  textTransform:"uppercase", transition:"all 0.2s" }}>
                  {s==="login"?"[ AUTH ]":"[ REGISTER ]"}
                </button>
              ))}
            </div>
          )}

          {/* ── LOGIN ── */}
          {screen==="login" && (
            <div style={{ animation:"fadeIn 0.3s ease" }}>
              <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email} />
              <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••••••" icon="⚿" error={errors.pw} />
              <div style={{ textAlign:"right", marginTop:-10, marginBottom:20 }}>
                <a href="#" style={{ fontSize:9, color:"#1E5C3A", textDecoration:"none", fontFamily:"monospace", letterSpacing:"0.1em", transition:"color 0.2s" }}
                  onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>RECOVER ACCESS →</a>
              </div>
              <button onClick={submit} disabled={loading} style={{ width:"100%", padding:"13px 0", background:"transparent",
                border:`1px solid ${loading?"rgba(0,255,176,0.2)":"#00FFB0"}`, borderRadius:3,
                color:loading?"#1E5C3A":"#00FFB0", fontSize:11, fontWeight:700,
                cursor:loading?"not-allowed":"pointer", fontFamily:"monospace", letterSpacing:"0.2em",
                boxShadow:loading?"none":"0 0 20px rgba(0,255,176,0.1)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:12,
                transition:"all 0.2s", textTransform:"uppercase" }}
                onMouseEnter={e=>!loading&&(e.currentTarget.style.background="rgba(0,255,176,0.07)")}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                {loading ? (<><span style={{ width:14, height:14, border:"1.5px solid rgba(0,255,176,0.2)", borderTop:"1.5px solid #00FFB0", borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block" }} />Authenticating...</>) : "⟶ Authenticate"}
              </button>

              {/* Divider */}
              <div style={{ margin:"20px 0", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ flex:1, height:1, background:"rgba(0,255,176,0.05)" }} />
                <span style={{ fontSize:9, color:"#0A1F14", fontFamily:"monospace" }}>OR CONNECT WITH</span>
                <div style={{ flex:1, height:1, background:"rgba(0,255,176,0.05)" }} />
              </div>

              {/* Wallet Connect grid — 4 popular wallets shown */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12 }}>
                {WALLETS.filter(w=>w.popular).map(w=>(
                  <button key={w.id} onClick={() => setShowWCModal(true)} style={{
                    background:"rgba(0,0,0,0.3)",
                    border:"1px solid rgba(0,255,176,0.08)",
                    borderRadius:5, padding:"10px 6px", cursor:"pointer",
                    display:"flex", flexDirection:"column", alignItems:"center", gap:5,
                    transition:"all 0.2s"
                  }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${w.color}55`; e.currentTarget.style.background=`${w.color}0A`; e.currentTarget.style.boxShadow=`0 0 16px ${w.glow}`; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(0,255,176,0.08)"; e.currentTarget.style.background="rgba(0,0,0,0.3)"; e.currentTarget.style.boxShadow="none"; }}>
                    <div style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {w.icon}
                    </div>
                    <span style={{ fontSize:8, color:"#1E5C3A", fontFamily:"monospace",
                      letterSpacing:"0.05em", textAlign:"center", lineHeight:1.2 }}>
                      {w.name.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>

              {/* More wallets button */}
              <button onClick={() => setShowWCModal(true)} style={{
                width:"100%", padding:"10px 0",
                background:"transparent",
                border:"1px solid rgba(0,255,176,0.08)",
                borderRadius:3, color:"#0F3A22",
                fontSize:10, cursor:"pointer",
                fontFamily:"monospace", letterSpacing:"0.12em",
                transition:"all 0.2s", textTransform:"uppercase",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8
              }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor="rgba(0,255,176,0.25)"; e.currentTarget.style.color="#1E5C3A"; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(0,255,176,0.08)"; e.currentTarget.style.color="#0F3A22"; }}>
                <span>⬡</span> More wallets (8 supported)
              </button>
            </div>
          )}

          {/* ── SIGNUP ── */}
          {screen==="signup" && (
            <div style={{ animation:"fadeIn 0.3s ease" }}>
              <OsField label="OPERATOR NAME" type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" icon="⊹" error={errors.name} />
              <OsField label="EMAIL" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="operator@privarc.io" icon="✉" error={errors.email} />
              <OsField label="PASSPHRASE" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min 8 characters" icon="⚿" error={errors.pw} />
              <PassStrength pw={pw} />
              <OsField label="CONFIRM PASSPHRASE" type="password" value={cpw} onChange={e=>setCpw(e.target.value)} placeholder="Repeat passphrase" icon="⚿" error={errors.cpw} />
              <div style={{ border:"1px solid rgba(0,255,176,0.12)", borderRadius:3, background:"rgba(0,255,176,0.02)", padding:"10px 12px", marginBottom:16 }}>
                <div style={{ fontSize:9, color:"#00FFB0", letterSpacing:"0.15em", fontFamily:"monospace", marginBottom:4 }}>AUTO WALLET INIT</div>
                <p style={{ fontSize:10, color:"#0F3A22", fontFamily:"monospace", lineHeight:1.5 }}>An ARC Network wallet will be generated and secured with your passphrase. You will receive your private key and 12-word recovery phrase.</p>
              </div>
              <div style={{ marginBottom:errors.agreed?4:20 }}>
                <label style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
                  <div onClick={()=>setAgreed(!agreed)} style={{ width:16, height:16, border:`1px solid ${agreed?"#00FFB0":"rgba(0,255,176,0.2)"}`, borderRadius:2, flexShrink:0, marginTop:1, background:agreed?"rgba(0,255,176,0.12)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"all 0.2s", color:"#00FFB0", fontSize:11 }}>{agreed&&"✓"}</div>
                  <span style={{ fontSize:10, color:"#0F3A22", fontFamily:"monospace", lineHeight:1.5 }}>I accept the <a href="#" style={{ color:"#1E5C3A", textDecoration:"none" }} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Terms of Service</a> and <a href="#" style={{ color:"#1E5C3A", textDecoration:"none" }} onMouseEnter={e=>e.target.style.color="#00FFB0"} onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Privacy Policy</a></span>
                </label>
                {errors.agreed&&<div style={{ fontSize:10, color:"#EF4444", fontFamily:"monospace", marginTop:4, marginLeft:26 }}>Required</div>}
              </div>

              <button onClick={submit} disabled={loading} style={{ width:"100%", padding:"13px 0", background:"transparent",
                border:`1px solid ${loading?"rgba(0,255,176,0.2)":"#00FFB0"}`, borderRadius:3,
                color:loading?"#1E5C3A":"#00FFB0", fontSize:11, fontWeight:700,
                cursor:loading?"not-allowed":"pointer", fontFamily:"monospace", letterSpacing:"0.18em",
                boxShadow:loading?"none":"0 0 20px rgba(0,255,176,0.1)",
                display:"flex", alignItems:"center", justifyContent:"center", gap:12,
                transition:"all 0.2s", textTransform:"uppercase" }}
                onMouseEnter={e=>!loading&&(e.currentTarget.style.background="rgba(0,255,176,0.07)")}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                {loading?(<><span style={{ width:14, height:14, border:"1.5px solid rgba(0,255,176,0.2)", borderTop:"1.5px solid #00FFB0", borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block" }} />Initializing wallet...</>):"⟶ Create account & wallet"}
              </button>

              {/* Divider + wallet option on signup too */}
              <div style={{ margin:"18px 0 14px", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ flex:1, height:1, background:"rgba(0,255,176,0.05)" }} />
                <span style={{ fontSize:9, color:"#0A1F14", fontFamily:"monospace" }}>OR</span>
                <div style={{ flex:1, height:1, background:"rgba(0,255,176,0.05)" }} />
              </div>
              <button onClick={()=>setShowWCModal(true)} style={{ width:"100%", padding:"10px 0", background:"transparent", border:"1px solid rgba(0,255,176,0.08)", borderRadius:3, color:"#0F3A22", fontSize:10, cursor:"pointer", fontFamily:"monospace", letterSpacing:"0.12em", transition:"all 0.2s", textTransform:"uppercase", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor="rgba(0,255,176,0.25)"; e.currentTarget.style.color="#1E5C3A"; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(0,255,176,0.08)"; e.currentTarget.style.color="#0F3A22"; }}>
                <span>⬡</span> Register with existing wallet
              </button>
            </div>
          )}

          {/* WALLET REVEAL */}
          {screen==="wallet"&&wallet&&(<WalletReveal wallet={wallet} onContinue={()=>setScreen("dashboard")} />)}

          {/* DASHBOARD */}
          {screen==="dashboard"&&user&&wallet&&(<Dashboard user={user} wallet={wallet} />)}

          {/* Status bar */}
          {(screen==="login"||screen==="signup")&&(
            <div style={{ marginTop:24, paddingTop:14, borderTop:"1px solid rgba(0,255,176,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:9, color:"#0A1F14", fontFamily:"monospace", letterSpacing:"0.1em" }}>🔒 EIP-4361 · ZK-secure</span>
              <span style={{ fontSize:9, color:"#0A1F14", fontFamily:"monospace", letterSpacing:"0.1em" }}>USDC FEES · ARC NETWORK</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
