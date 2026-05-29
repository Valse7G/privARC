import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════ */
const rand = (min, max) => Math.random() * (max - min) + min;
const hex = (len) => Array.from({ length: len }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

function generateWallet() {
  const privateKey = "0x" + hex(64);
  const address = "0x" + hex(40);
  const WORDLIST = [
    "abandon","ability","able","about","above","absent","absorb","abstract",
    "absurd","abuse","access","accident","account","accuse","achieve","acid",
    "acoustic","acquire","across","act","action","actor","actress","actual",
    "adapt","add","addict","address","adjust","admit","adult","advance",
    "advice","aerobic","afford","afraid","again","agent","agree","ahead",
    "aim","air","airport","aisle","alarm","album","alcohol","alert"
  ];
  const mnemonic = Array.from({ length: 12 }, () => WORDLIST[Math.floor(Math.random() * WORDLIST.length)]).join(" ");
  return { privateKey, address, mnemonic, network: "ARC Network", created: new Date().toISOString() };
}

function shortAddr(a) { return a.slice(0, 8) + "···" + a.slice(-6); }

/* ═══════════════════════════════════════════════════════════════
   ANIMATED HEX GRID BACKGROUND
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

      // Radial gradient bg
      const grd = ctx.createRadialGradient(
        canvas.width * 0.5, canvas.height * 0.4, 0,
        canvas.width * 0.5, canvas.height * 0.4, canvas.width * 0.7
      );
      grd.addColorStop(0, "rgba(0,20,12,1)");
      grd.addColorStop(1, "rgba(0,8,5,1)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const R = 38, cols = Math.ceil(canvas.width / (R * 1.73)) + 2;
      const rows = Math.ceil(canvas.height / (R * 1.5)) + 2;

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * R * 1.73 + (row % 2 === 0 ? 0 : R * 0.865);
          const y = row * R * 1.5;
          const d = Math.sqrt((x - canvas.width * 0.5) ** 2 + (y - canvas.height * 0.4) ** 2);
          const wave = Math.sin(d * 0.012 - t * 1.8) * 0.5 + 0.5;
          const pulse = Math.sin(t * 0.7 + col * 0.3 + row * 0.5) * 0.3 + 0.3;
          const alpha = wave * pulse * 0.4;
          const fill = alpha > 0.18 ? `rgba(0,255,160,${alpha * 0.06})` : null;
          drawHex(x, y, R - 2, alpha, fill);
        }
      }

      // Scanlines
      for (let y = 0; y < canvas.height; y += 3) {
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(0, y, canvas.width, 1);
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ═══════════════════════════════════════════════════════════════
   TYPEWRITER
═══════════════════════════════════════════════════════════════ */
function Typewriter({ text, speed = 38, onDone, style }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); onDone?.(); }
    }, speed);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span style={style}>
      {displayed}
      {!done && <span style={{ animation: "blink 1s step-end infinite", color: "#00FFB0" }}>█</span>}
    </span>
  );
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
    BOOT_LINES.forEach(({ t, text, color }) => {
      setTimeout(() => setLines(p => [...p, { text, color }]), t);
    });
    setTimeout(() => { setDone(true); setTimeout(onComplete, 500); }, 3400);
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "#000A06",
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: "0 10vw",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      opacity: done ? 0 : 1,
      transition: "opacity 0.5s ease",
      pointerEvents: done ? "none" : "all"
    }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11, color: "#1A4A30", letterSpacing: "0.3em",
          marginBottom: 8
        }}>PRIVARC AUTONOMOUS CRYPTO OS</div>
        <div style={{ width: 60, height: 2, background: "#00FFB0", marginBottom: 24 }} />
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{
          fontSize: 13, color: l.color, marginBottom: 6,
          letterSpacing: "0.05em", lineHeight: 1.6,
          animation: "fadeIn 0.3s ease forwards"
        }}>
          <span style={{ color: "#1A4A30", marginRight: 12 }}>[{String(i).padStart(2, "0")}]</span>
          {l.text}
        </div>
      ))}
      {lines.length > 0 && (
        <div style={{ marginTop: 24, height: 2, background: "#0A2018",
          position: "relative", overflow: "hidden", width: "100%" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            background: "#00FFB0",
            width: `${Math.min(100, (lines.length / BOOT_LINES.length) * 100)}%`,
            transition: "width 0.3s ease",
            boxShadow: "0 0 10px #00FFB0"
          }} />
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
    <span style={{ position: "relative", display: "inline-block", ...style }}>
      <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
      <span style={{
        position: "absolute", top: 0, left: 0,
        color: "#00FFB0", opacity: 0,
        animation: "glitch1 4s infinite",
        clipPath: "polygon(0 30%, 100% 30%, 100% 50%, 0 50%)",
        transform: "translateX(-2px)"
      }}>{text}</span>
      <span style={{
        position: "absolute", top: 0, left: 0,
        color: "#0EA5E9", opacity: 0,
        animation: "glitch2 4s infinite",
        clipPath: "polygon(0 60%, 100% 60%, 100% 80%, 0 80%)",
        transform: "translateX(2px)"
      }}>{text}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INPUT FIELD — OS TERMINAL STYLE
═══════════════════════════════════════════════════════════════ */
function OsField({ label, type, value, onChange, placeholder, icon, error, hint }) {
  const [focused, setFocused] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 6
      }}>
        <label style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
          textTransform: "uppercase", color: focused ? "#00FFB0" : "#1E5C3A",
          fontFamily: "'JetBrains Mono', monospace", transition: "color 0.2s"
        }}>
          {icon} {label}
        </label>
        {error && <span style={{ fontSize: 10, color: "#EF4444", letterSpacing: "0.05em" }}>
          ⚠ {error}
        </span>}
      </div>
      <div style={{ position: "relative" }}>
        {/* Corner brackets */}
        {["tl","tr","bl","br"].map(pos => (
          <span key={pos} style={{
            position: "absolute", zIndex: 2,
            width: 8, height: 8,
            borderColor: focused ? "#00FFB0" : (error ? "#EF4444" : "#1A4A30"),
            borderStyle: "solid", borderWidth: 0,
            ...(pos === "tl" ? { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 } : {}),
            ...(pos === "tr" ? { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 } : {}),
            ...(pos === "bl" ? { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 } : {}),
            ...(pos === "br" ? { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 } : {}),
            transition: "border-color 0.2s"
          }} />
        ))}
        <input
          type={isPass && !showPass ? "password" : "text"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "12px 40px 12px 14px",
            background: focused ? "rgba(0,255,176,0.03)" : "rgba(0,0,0,0.4)",
            border: `1px solid ${error ? "#EF4444" : focused ? "rgba(0,255,176,0.4)" : "rgba(0,255,176,0.1)"}`,
            borderRadius: 3,
            color: "#A7F3D0",
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            outline: "none",
            letterSpacing: "0.05em",
            boxShadow: focused ? "0 0 20px rgba(0,255,176,0.06), inset 0 0 20px rgba(0,255,176,0.02)" : "none",
            transition: "all 0.2s",
          }}
        />
        {isPass && (
          <button onClick={() => setShowPass(!showPass)} style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            color: showPass ? "#00FFB0" : "#1E5C3A", fontSize: 14, padding: 0,
            fontFamily: "monospace", transition: "color 0.2s"
          }}>
            {showPass ? "◉" : "◎"}
          </button>
        )}
      </div>
      {hint && !error && (
        <div style={{ marginTop: 4, fontSize: 10, color: "#0F3A22", letterSpacing: "0.06em" }}>{hint}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PASSWORD STRENGTH
═══════════════════════════════════════════════════════════════ */
function PassStrength({ pw }) {
  if (!pw) return null;
  const score = [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  const labels = ["", "WEAK", "FAIR", "GOOD", "STRONG"];
  const cols = ["", "#EF4444", "#F59E0B", "#3B82F6", "#00FFB0"];
  return (
    <div style={{ marginTop: -10, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 3 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            flex: 1, height: 2,
            background: i <= score ? cols[score] : "#0A1F14",
            boxShadow: i <= score && score === 4 ? `0 0 6px ${cols[score]}` : "none",
            transition: "background 0.3s"
          }} />
        ))}
      </div>
      <div style={{ marginTop: 4, fontSize: 9, color: cols[score], letterSpacing: "0.12em" }}>
        ENTROPY: {labels[score]}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WALLET REVEAL
═══════════════════════════════════════════════════════════════ */
function WalletReveal({ wallet, onContinue }) {
  const [phase, setPhase] = useState(0); // 0=generating, 1=reveal
  const [copied, setCopied] = useState({});
  const [showMnem, setShowMnem] = useState(false);
  const [showPk, setShowPk] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = [0, 15, 35, 55, 72, 88, 100];
    let i = 0;
    const id = setInterval(() => {
      i++;
      setProgress(steps[i] || 100);
      if (i >= steps.length - 1) { clearInterval(id); setTimeout(() => setPhase(1), 400); }
    }, 280);
    return () => clearInterval(id);
  }, []);

  const copy = (key, text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
  };

  const GEN_STEPS = [
    "Generating entropy from /dev/urandom...",
    "Deriving secp256k1 keypair...",
    "Computing ARC Network address...",
    "Encoding BIP-39 mnemonic...",
    "Registering stealth keys...",
    "Linking to PrivARC account...",
    "WALLET READY",
  ];

  if (phase === 0) return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: "#00FFB0",
          boxShadow: "0 0 12px #00FFB0",
          animation: "pulse 1s ease infinite"
        }} />
        <span style={{ fontSize: 11, color: "#00FFB0", letterSpacing: "0.15em", fontFamily: "monospace" }}>
          GENERATING WALLET
        </span>
      </div>

      {GEN_STEPS.slice(0, Math.ceil((progress / 100) * GEN_STEPS.length)).map((s, i) => (
        <div key={i} style={{
          fontSize: 12, color: i === Math.ceil((progress / 100) * GEN_STEPS.length) - 1 ? "#A7F3D0" : "#1E5C3A",
          marginBottom: 6, fontFamily: "monospace", letterSpacing: "0.04em",
          animation: "fadeIn 0.3s ease"
        }}>
          <span style={{ color: "#0F3A22", marginRight: 10 }}>›</span>{s}
        </div>
      ))}

      <div style={{ marginTop: 20, background: "#0A1F14", borderRadius: 2, overflow: "hidden", height: 3 }}>
        <div style={{
          height: "100%", background: "linear-gradient(90deg, #00FFB0, #0EA5E9)",
          width: `${progress}%`, transition: "width 0.28s ease",
          boxShadow: "0 0 8px #00FFB0"
        }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: "#0F3A22", textAlign: "right", fontFamily: "monospace" }}>
        {progress}%
      </div>
    </div>
  );

  // Data row helper
  const DataRow = ({ label, value, copyKey, blurred, onReveal, revealed }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 9, color: "#0F3A22", letterSpacing: "0.15em",
        fontFamily: "monospace", marginBottom: 5, textTransform: "uppercase"
      }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(0,255,176,0.03)",
        border: "1px solid rgba(0,255,176,0.1)",
        borderRadius: 3, padding: "9px 12px"
      }}>
        <span style={{
          flex: 1, fontSize: 11, fontFamily: "monospace",
          color: "#A7F3D0", wordBreak: "break-all", lineHeight: 1.5,
          filter: blurred && !revealed ? "blur(5px)" : "none",
          transition: "filter 0.3s", userSelect: blurred && !revealed ? "none" : "text"
        }}>{value}</span>
        {blurred && (
          <button onClick={onReveal} style={{
            background: "none", border: "1px solid rgba(0,255,176,0.2)",
            borderRadius: 2, color: "#00FFB0", fontSize: 9, padding: "3px 7px",
            cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.1em",
            flexShrink: 0
          }}>{revealed ? "HIDE" : "SHOW"}</button>
        )}
        <button onClick={() => copy(copyKey, value)} style={{
          background: "none", border: "1px solid rgba(0,255,176,0.15)",
          borderRadius: 2, color: copied[copyKey] ? "#00FFB0" : "#1E5C3A",
          fontSize: 9, padding: "3px 7px", cursor: "pointer",
          fontFamily: "monospace", letterSpacing: "0.1em", flexShrink: 0,
          transition: "color 0.2s"
        }}>
          {copied[copyKey] ? "✓ OK" : "COPY"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, background: "#00FFB0", borderRadius: "50%",
            boxShadow: "0 0 8px #00FFB0" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#00FFB0", letterSpacing: "0.1em",
            fontFamily: "monospace" }}>WALLET INITIALIZED</span>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "#1E5C3A", fontFamily: "monospace" }}>
          ARC Network · Stealth address enabled · ZK-ready
        </p>
      </div>

      {/* Warning */}
      <div style={{
        border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3,
        background: "rgba(245,158,11,0.05)", padding: "10px 14px", marginBottom: 18,
        display: "flex", gap: 10
      }}>
        <span style={{ color: "#F59E0B", fontSize: 13 }}>⚠</span>
        <p style={{ margin: 0, fontSize: 11, color: "#92400E", lineHeight: 1.5, fontFamily: "monospace" }}>
          CRITICAL: Store your recovery phrase offline. PrivARC cannot recover lost keys.
        </p>
      </div>

      <DataRow label="// ARC Network Address" value={wallet.address} copyKey="addr" />
      <DataRow
        label="// Recovery Phrase (BIP-39)"
        value={wallet.mnemonic}
        copyKey="mnem"
        blurred={true}
        revealed={showMnem}
        onReveal={() => setShowMnem(!showMnem)}
      />
      <DataRow
        label="// Private Key — NEVER SHARE"
        value={wallet.privateKey}
        copyKey="pk"
        blurred={true}
        revealed={showPk}
        onReveal={() => setShowPk(!showPk)}
      />

      <button onClick={onContinue} style={{
        width: "100%", marginTop: 8,
        padding: "13px 0",
        background: "transparent",
        border: "1px solid #00FFB0",
        borderRadius: 3, color: "#00FFB0",
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.15em",
        boxShadow: "0 0 20px rgba(0,255,176,0.1), inset 0 0 20px rgba(0,255,176,0.03)",
        transition: "all 0.2s",
        textTransform: "uppercase"
      }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,255,176,0.08)"; e.currentTarget.style.boxShadow = "0 0 30px rgba(0,255,176,0.2), inset 0 0 30px rgba(0,255,176,0.05)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "0 0 20px rgba(0,255,176,0.1), inset 0 0 20px rgba(0,255,176,0.03)"; }}
      >
        ⟶ Launch PrivARC OS
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════ */
function Dashboard({ user, wallet }) {
  const [tick, setTick] = useState(0);
  const [agentLogs, setAgentLogs] = useState([
    { t: "00:00:01", msg: "ShieldAgent :: Monitoring deposit pool", col: "#00FFB0" },
    { t: "00:00:03", msg: "SwapAgent :: DEX liquidity scan complete", col: "#4ADE80" },
    { t: "00:00:07", msg: "RiskAgent :: Volatility index: LOW", col: "#4ADE80" },
    { t: "00:00:12", msg: "ZKAgent :: Proof batch ready (0 pending)", col: "#4ADE80" },
  ]);

  const AGENTS = [
    { id: "SA", name: "ShieldAgent", status: "ACTIVE", load: 12 },
    { id: "SW", name: "SwapAgent", status: "ACTIVE", load: 8 },
    { id: "PV", name: "PrivacyAgent", status: "ACTIVE", load: 34 },
    { id: "RK", name: "RiskAgent", status: "ACTIVE", load: 5 },
    { id: "ZK", name: "ZKAgent", status: "ACTIVE", load: 67 },
    { id: "BR", name: "BridgeAgent", status: "STANDBY", load: 0 },
    { id: "GO", name: "GovAgent", status: "ACTIVE", load: 2 },
    { id: "FE", name: "FeeAgent", status: "ACTIVE", load: 18 },
  ];

  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1);
      if (Math.random() > 0.55) {
        const msgs = [
          ["ZKAgent :: New proof generated", "#00FFB0"],
          ["ShieldAgent :: Pool depth nominal", "#4ADE80"],
          ["FeeAgent :: Fee sweep: 0.00 USDC", "#4ADE80"],
          ["PrivacyAgent :: Stealth scan — 0 new notes", "#4ADE80"],
          ["RiskAgent :: On-chain anomaly score: 0.02", "#4ADE80"],
          ["SwapAgent :: Slippage within bounds", "#4ADE80"],
          ["BridgeAgent :: Cross-chain bridge idle", "#1E5C3A"],
          ["GovAgent :: No pending proposals", "#1E5C3A"],
        ];
        const [msg, col] = msgs[Math.floor(Math.random() * msgs.length)];
        const now = new Date();
        const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map(n => String(n).padStart(2, "0")).join(":");
        setAgentLogs(p => [...p.slice(-6), { t, msg, col }]);
      }
    }, 1800);
    return () => clearInterval(id);
  }, []);

  const ACTIONS = [
    { icon: "🛡", label: "SHIELD", desc: "Deposit private" },
    { icon: "⇄", label: "SWAP", desc: "Private exchange" },
    { icon: "↗", label: "SEND", desc: "Private transfer" },
    { icon: "↙", label: "WITHDRAW", desc: "Public exit" },
    { icon: "⟺", label: "BRIDGE", desc: "Cross-chain" },
  ];

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 20, paddingBottom: 16,
        borderBottom: "1px solid rgba(0,255,176,0.08)"
      }}>
        <div>
          <div style={{ fontSize: 9, color: "#0F3A22", letterSpacing: "0.2em",
            fontFamily: "monospace", marginBottom: 4 }}>OPERATOR</div>
          <div style={{ fontSize: 14, color: "#A7F3D0", fontFamily: "monospace",
            fontWeight: 700 }}>{user.name || user.email.split("@")[0]}</div>
          <div style={{ fontSize: 10, color: "#1E5C3A", fontFamily: "monospace",
            marginTop: 2 }}>{shortAddr(wallet.address)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginBottom: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FFB0",
              boxShadow: "0 0 6px #00FFB0", animation: "pulse 2s ease infinite" }} />
            <span style={{ fontSize: 9, color: "#00FFB0", letterSpacing: "0.15em", fontFamily: "monospace" }}>
              MAINNET
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#0F3A22", fontFamily: "monospace" }}>ARC Network</div>
        </div>
      </div>

      {/* Balance */}
      <div style={{
        background: "rgba(0,255,176,0.03)",
        border: "1px solid rgba(0,255,176,0.12)",
        borderRadius: 4, padding: "16px 18px", marginBottom: 16
      }}>
        <div style={{ fontSize: 9, color: "#0F3A22", letterSpacing: "0.2em",
          fontFamily: "monospace", marginBottom: 8 }}>SHIELDED BALANCE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: "#00FFB0",
            fontFamily: "monospace", lineHeight: 1 }}>0.00</span>
          <span style={{ fontSize: 13, color: "#1E5C3A", fontFamily: "monospace" }}>USDC</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: "#0F3A22", fontFamily: "monospace" }}>
          ≈ $0.00 USD · Fees: 0.00 USDC total paid
        </div>
      </div>

      {/* Actions grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 16 }}>
        {ACTIONS.map(a => (
          <button key={a.label} style={{
            background: "rgba(0,255,176,0.03)",
            border: "1px solid rgba(0,255,176,0.1)",
            borderRadius: 4, padding: "10px 4px",
            cursor: "pointer", textAlign: "center",
            transition: "all 0.2s"
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,0.35)"; e.currentTarget.style.background = "rgba(0,255,176,0.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,0.1)"; e.currentTarget.style.background = "rgba(0,255,176,0.03)"; }}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{a.icon}</div>
            <div style={{ fontSize: 9, color: "#00FFB0", fontFamily: "monospace",
              letterSpacing: "0.1em", fontWeight: 700 }}>{a.label}</div>
            <div style={{ fontSize: 8, color: "#0F3A22", fontFamily: "monospace",
              marginTop: 2 }}>{a.desc}</div>
          </button>
        ))}
      </div>

      {/* AI Agents */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: "#0F3A22", letterSpacing: "0.2em",
          fontFamily: "monospace", marginBottom: 8 }}>AI AGENT CLUSTER — 8 NODES</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {AGENTS.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(0,255,176,0.06)",
              borderRadius: 3, padding: "6px 10px"
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: "50%",
                background: a.status === "ACTIVE" ? "#00FFB0" : "#1E5C3A",
                flexShrink: 0,
                boxShadow: a.status === "ACTIVE" ? "0 0 5px #00FFB0" : "none"
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: "#1E5C3A", fontFamily: "monospace",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name}
                </div>
              </div>
              <div style={{ fontSize: 8, color: a.status === "ACTIVE" ? "#00FFB0" : "#0F3A22",
                fontFamily: "monospace", flexShrink: 0 }}>
                {a.load > 0 ? `${a.load}%` : "---"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent log */}
      <div style={{
        background: "#000A06",
        border: "1px solid rgba(0,255,176,0.08)",
        borderRadius: 3, padding: "10px 12px",
        maxHeight: 110, overflow: "hidden"
      }}>
        <div style={{ fontSize: 9, color: "#0F3A22", letterSpacing: "0.2em",
          fontFamily: "monospace", marginBottom: 6 }}>SYSTEM LOG</div>
        {agentLogs.slice(-5).map((l, i) => (
          <div key={i} style={{
            fontSize: 10, fontFamily: "monospace", marginBottom: 3,
            color: l.col, lineHeight: 1.4,
            animation: i === agentLogs.slice(-5).length - 1 ? "fadeIn 0.3s ease" : "none"
          }}>
            <span style={{ color: "#0A1F14", marginRight: 8 }}>[{l.t}]</span>{l.msg}
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
  const [booted, setBooted] = useState(false);
  const [screen, setScreen] = useState("login"); // login | signup | wallet | dashboard
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [user, setUser] = useState(null);

  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [pw, setPw]         = useState("");
  const [cpw, setCpw]       = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (screen === "signup" && !name.trim()) e.name = "Required";
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Invalid email";
    if (!pw || pw.length < 8) e.pw = "Min 8 chars";
    if (screen === "signup") {
      if (pw !== cpw) e.cpw = "Mismatch";
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
      setUser({ name: name || email.split("@")[0], email });
      if (screen === "signup") setScreen("wallet");
      else setScreen("dashboard");
    }, screen === "login" ? 1200 : 1600);
  };

  const reset = (s) => {
    setScreen(s); setErrors({});
    setName(""); setEmail(""); setPw(""); setCpw(""); setAgreed(false);
  };

  const isLogin = screen === "login";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000A06; overflow-x: hidden; }
        input { font-family: 'JetBrains Mono', monospace !important; }
        input::placeholder { color: #0A1F14 !important; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px);} to {opacity:1; transform:none;} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:0.6; transform:scale(0.9)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes glitch1 {
          0%,89%,100%{opacity:0} 90%{opacity:0.8; transform:translateX(-3px)} 95%{opacity:0; transform:translateX(3px)}
        }
        @keyframes glitch2 {
          0%,93%,100%{opacity:0} 94%{opacity:0.6; transform:translateX(3px)} 98%{opacity:0; transform:translateX(-2px)}
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #000A06; }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,176,0.2); border-radius: 2px; }
      `}</style>

      <HexGrid />
      {!booted && <BootSequence onComplete={() => setBooted(true)} />}

      <div style={{
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
        position: "relative", zIndex: 1,
        opacity: booted ? 1 : 0, transition: "opacity 0.6s ease 0.2s"
      }}>
        {/* Left panel — desktop only */}
        <div style={{
          display: "none",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 260, marginRight: 32,
          padding: "28px 0",
          "@media(min-width:900px)": { display: "flex" }
        }} className="left-panel">
        </div>

        {/* Main card */}
        <div style={{
          width: "100%", maxWidth: 460,
          background: "rgba(0,8,5,0.92)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(0,255,176,0.12)",
          borderRadius: 4,
          boxShadow: "0 0 60px rgba(0,255,176,0.04), 0 40px 80px rgba(0,0,0,0.8)",
          padding: "32px 32px 28px",
          position: "relative",
          animation: booted ? "fadeUp 0.6s ease forwards" : "none"
        }}>
          {/* Corner decorations */}
          {["tl","tr","bl","br"].map(pos => (
            <span key={pos} style={{
              position: "absolute", zIndex: 2,
              width: 14, height: 14,
              borderColor: "rgba(0,255,176,0.25)",
              borderStyle: "solid", borderWidth: 0,
              ...(pos === "tl" ? { top: -1, left: -1, borderTopWidth: 1.5, borderLeftWidth: 1.5 } : {}),
              ...(pos === "tr" ? { top: -1, right: -1, borderTopWidth: 1.5, borderRightWidth: 1.5 } : {}),
              ...(pos === "bl" ? { bottom: -1, left: -1, borderBottomWidth: 1.5, borderLeftWidth: 1.5 } : {}),
              ...(pos === "br" ? { bottom: -1, right: -1, borderBottomWidth: 1.5, borderRightWidth: 1.5 } : {}),
            }} />
          ))}

          {/* Logo — only on auth screens */}
          {(screen === "login" || screen === "signup") && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 32, height: 32, border: "1.5px solid #00FFB0",
                  borderRadius: 3, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 15, color: "#00FFB0",
                  boxShadow: "0 0 12px rgba(0,255,176,0.2)"
                }}>◈</div>
                <GlitchText text="privARC" style={{
                  fontSize: 22, fontWeight: 800, color: "#00FFB0",
                  fontFamily: "'Syne', sans-serif", letterSpacing: "-0.01em"
                }} />
                <span style={{
                  fontSize: 9, color: "#0F3A22", fontFamily: "monospace",
                  letterSpacing: "0.12em", alignSelf: "flex-end", paddingBottom: 2
                }}>OS</span>
              </div>
              <p style={{
                fontSize: 10.5, color: "#1E5C3A", fontFamily: "monospace",
                letterSpacing: "0.06em", lineHeight: 1.6, maxWidth: 340
              }}>
                Autonomous crypto operating system for private on-chain capital management — powered by AI agents on ARC Network.
              </p>
            </div>
          )}

          {/* Tab switcher */}
          {(screen === "login" || screen === "signup") && (
            <div style={{
              display: "flex", gap: 0,
              border: "1px solid rgba(0,255,176,0.1)",
              borderRadius: 3, overflow: "hidden", marginBottom: 26
            }}>
              {["login", "signup"].map(s => (
                <button key={s} onClick={() => reset(s)} style={{
                  flex: 1, padding: "9px 0",
                  background: screen === s ? "rgba(0,255,176,0.08)" : "transparent",
                  border: "none",
                  borderRight: s === "login" ? "1px solid rgba(0,255,176,0.1)" : "none",
                  color: screen === s ? "#00FFB0" : "#1E5C3A",
                  fontSize: 10, fontWeight: 700, cursor: "pointer",
                  fontFamily: "monospace", letterSpacing: "0.15em",
                  textTransform: "uppercase", transition: "all 0.2s"
                }}>
                  {s === "login" ? "[ AUTH ]" : "[ REGISTER ]"}
                </button>
              ))}
            </div>
          )}

          {/* LOGIN */}
          {screen === "login" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <OsField label="EMAIL" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operator@privarc.io" icon="✉" error={errors.email} />
              <OsField label="PASSPHRASE" type="password" value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="••••••••••••" icon="⚿" error={errors.pw} />

              <div style={{ textAlign: "right", marginTop: -10, marginBottom: 20 }}>
                <a href="#" style={{ fontSize: 9, color: "#1E5C3A", textDecoration: "none",
                  fontFamily: "monospace", letterSpacing: "0.1em",
                  transition: "color 0.2s" }}
                  onMouseEnter={e => e.target.style.color="#00FFB0"}
                  onMouseLeave={e => e.target.style.color="#1E5C3A"}>
                  RECOVER ACCESS →
                </a>
              </div>

              <button onClick={submit} disabled={loading} style={{
                width: "100%", padding: "13px 0",
                background: "transparent",
                border: `1px solid ${loading ? "rgba(0,255,176,0.2)" : "#00FFB0"}`,
                borderRadius: 3, color: loading ? "#1E5C3A" : "#00FFB0",
                fontSize: 11, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "monospace", letterSpacing: "0.2em",
                boxShadow: loading ? "none" : "0 0 20px rgba(0,255,176,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                transition: "all 0.2s", textTransform: "uppercase"
              }}
                onMouseEnter={e => !loading && (e.currentTarget.style.background = "rgba(0,255,176,0.07)")}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {loading ? (
                  <>
                    <span style={{ width: 14, height: 14, border: "1.5px solid rgba(0,255,176,0.2)",
                      borderTop: "1.5px solid #00FFB0", borderRadius: "50%",
                      animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                    Authenticating...
                  </>
                ) : "⟶ Authenticate"}
              </button>

              <div style={{ margin: "20px 0", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(0,255,176,0.05)" }} />
                <span style={{ fontSize: 9, color: "#0A1F14", fontFamily: "monospace" }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "rgba(0,255,176,0.05)" }} />
              </div>

              <button style={{
                width: "100%", padding: "11px 0",
                background: "transparent",
                border: "1px solid rgba(0,255,176,0.08)",
                borderRadius: 3, color: "#0F3A22",
                fontSize: 10, cursor: "pointer",
                fontFamily: "monospace", letterSpacing: "0.12em",
                transition: "all 0.2s", textTransform: "uppercase"
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,0.2)"; e.currentTarget.style.color = "#1E5C3A"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,255,176,0.08)"; e.currentTarget.style.color = "#0F3A22"; }}
              >
                ⬡ Connect existing wallet
              </button>
            </div>
          )}

          {/* SIGNUP */}
          {screen === "signup" && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <OsField label="OPERATOR NAME" type="text" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name" icon="⊹" error={errors.name} />
              <OsField label="EMAIL" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operator@privarc.io" icon="✉" error={errors.email} />
              <OsField label="PASSPHRASE" type="password" value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="Min 8 characters" icon="⚿" error={errors.pw} />
              <PassStrength pw={pw} />
              <OsField label="CONFIRM PASSPHRASE" type="password" value={cpw}
                onChange={e => setCpw(e.target.value)}
                placeholder="Repeat passphrase" icon="⚿" error={errors.cpw} />

              {/* Wallet generation notice */}
              <div style={{
                border: "1px solid rgba(0,255,176,0.12)",
                borderRadius: 3, background: "rgba(0,255,176,0.02)",
                padding: "10px 12px", marginBottom: 16
              }}>
                <div style={{ fontSize: 9, color: "#00FFB0", letterSpacing: "0.15em",
                  fontFamily: "monospace", marginBottom: 4 }}>AUTO WALLET INIT</div>
                <p style={{ fontSize: 10, color: "#0F3A22", fontFamily: "monospace", lineHeight: 1.5 }}>
                  An ARC Network wallet will be generated and secured with your passphrase.
                  You will receive your private key and 12-word recovery phrase.
                </p>
              </div>

              {/* Agreement */}
              <div style={{ marginBottom: errors.agreed ? 4 : 20 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <div onClick={() => setAgreed(!agreed)} style={{
                    width: 16, height: 16, border: `1px solid ${agreed ? "#00FFB0" : "rgba(0,255,176,0.2)"}`,
                    borderRadius: 2, flexShrink: 0, marginTop: 1,
                    background: agreed ? "rgba(0,255,176,0.12)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all 0.2s",
                    color: "#00FFB0", fontSize: 11
                  }}>
                    {agreed && "✓"}
                  </div>
                  <span style={{ fontSize: 10, color: "#0F3A22", fontFamily: "monospace", lineHeight: 1.5 }}>
                    I accept the{" "}
                    <a href="#" style={{ color: "#1E5C3A", textDecoration: "none" }}
                      onMouseEnter={e=>e.target.style.color="#00FFB0"}
                      onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Terms of Service</a>
                    {" "}and{" "}
                    <a href="#" style={{ color: "#1E5C3A", textDecoration: "none" }}
                      onMouseEnter={e=>e.target.style.color="#00FFB0"}
                      onMouseLeave={e=>e.target.style.color="#1E5C3A"}>Privacy Policy</a>
                  </span>
                </label>
                {errors.agreed && <div style={{ fontSize: 10, color: "#EF4444",
                  fontFamily: "monospace", marginTop: 4, marginLeft: 26 }}>Required</div>}
              </div>

              <button onClick={submit} disabled={loading} style={{
                width: "100%", padding: "13px 0",
                background: "transparent",
                border: `1px solid ${loading ? "rgba(0,255,176,0.2)" : "#00FFB0"}`,
                borderRadius: 3, color: loading ? "#1E5C3A" : "#00FFB0",
                fontSize: 11, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "monospace", letterSpacing: "0.18em",
                boxShadow: loading ? "none" : "0 0 20px rgba(0,255,176,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                transition: "all 0.2s", textTransform: "uppercase"
              }}
                onMouseEnter={e => !loading && (e.currentTarget.style.background = "rgba(0,255,176,0.07)")}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {loading ? (
                  <>
                    <span style={{ width: 14, height: 14, border: "1.5px solid rgba(0,255,176,0.2)",
                      borderTop: "1.5px solid #00FFB0", borderRadius: "50%",
                      animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                    Initializing wallet...
                  </>
                ) : "⟶ Create account & wallet"}
              </button>
            </div>
          )}

          {/* WALLET REVEAL */}
          {screen === "wallet" && wallet && (
            <WalletReveal wallet={wallet} onContinue={() => setScreen("dashboard")} />
          )}

          {/* DASHBOARD */}
          {screen === "dashboard" && user && wallet && (
            <Dashboard user={user} wallet={wallet} />
          )}

          {/* Status bar */}
          {(screen === "login" || screen === "signup") && (
            <div style={{
              marginTop: 24, paddingTop: 14,
              borderTop: "1px solid rgba(0,255,176,0.06)",
              display: "flex", justifyContent: "space-between",
              alignItems: "center"
            }}>
              <span style={{ fontSize: 9, color: "#0A1F14", fontFamily: "monospace", letterSpacing: "0.1em" }}>
                🔒 TLS 1.3 · ZK-secure
              </span>
              <span style={{ fontSize: 9, color: "#0A1F14", fontFamily: "monospace", letterSpacing: "0.1em" }}>
                USDC FEES · ARC NETWORK
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
