import { useState, useEffect, useRef } from "react";

// ── Simulated crypto wallet generation ──────────────────────────────────────
function generateWallet() {
  const chars = "0123456789abcdef";
  const hex = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * 16)]).join("");
  const privateKey = "0x" + hex(64);
  const address = "0x" + hex(40);
  const mnemonic = [
    "abandon","ability","able","about","above","absent","absorb","abstract",
    "absurd","abuse","access","accident","account","accuse","achieve","acid",
    "acoustic","acquire","across","act","action","actor","actress","actual"
  ];
  const words = Array.from({ length: 12 }, () => mnemonic[Math.floor(Math.random() * mnemonic.length)]);
  return { privateKey, address, mnemonic: words.join(" ") };
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

// ── Icon components ──────────────────────────────────────────────────────────
const EyeIcon = ({ open }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </>
    )}
  </svg>
);

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const WalletIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <path d="M16 13a1 1 0 100-2 1 1 0 000 2z" fill="currentColor"/>
    <path d="M2 10h20"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
);

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M22 7l-10 7L2 7"/>
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const ArcIcon = () => (
  <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="arcG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#00B4D8"/>
        <stop offset="100%" stopColor="#0077B6"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#arcG)" opacity="0.15"/>
    <circle cx="32" cy="32" r="30" stroke="url(#arcG)" strokeWidth="2"/>
    <path d="M20 44 L32 20 L44 44" stroke="url(#arcG)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M24 36 H40" stroke="url(#arcG)" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

// ── Particle background ───────────────────────────────────────────────────────
function Particles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let particles = [];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < 55; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        o: Math.random() * 0.5 + 0.15,
      });
    }
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,180,216,${p.o})`;
        ctx.fill();
      });
      // connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,180,216,${0.08 * (1 - d / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

// ── Input field ──────────────────────────────────────────────────────────────
function Field({ label, type, value, onChange, placeholder, icon, hint, error }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600,
        color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
          color: error ? "#F87171" : "#00B4D8", display: "flex", alignItems: "center" }}>
          {icon}
        </span>
        <input
          type={isPass && show ? "text" : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "13px 44px 13px 42px",
            background: "rgba(255,255,255,0.04)",
            border: `1.5px solid ${error ? "rgba(248,113,113,0.6)" : "rgba(0,180,216,0.2)"}`,
            borderRadius: 10, color: "#F1F5F9", fontSize: 14,
            outline: "none", fontFamily: "'DM Mono', monospace",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocus={e => {
            e.target.style.borderColor = error ? "rgba(248,113,113,0.8)" : "rgba(0,180,216,0.7)";
            e.target.style.boxShadow = error
              ? "0 0 0 3px rgba(248,113,113,0.12)"
              : "0 0 0 3px rgba(0,180,216,0.12)";
          }}
          onBlur={e => {
            e.target.style.borderColor = error ? "rgba(248,113,113,0.6)" : "rgba(0,180,216,0.2)";
            e.target.style.boxShadow = "none";
          }}
        />
        {isPass && (
          <button onClick={() => setShow(!show)} style={{
            position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            color: "#64748B", padding: 0, display: "flex"
          }}>
            <EyeIcon open={show} />
          </button>
        )}
      </div>
      {error && <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#F87171" }}>{error}</p>}
      {hint && !error && <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#64748B" }}>{hint}</p>}
    </div>
  );
}

// ── Password strength ─────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ["", "Faible", "Moyen", "Bon", "Fort"];
  const colors = ["", "#EF4444", "#F59E0B", "#3B82F6", "#10B981"];
  if (!password) return null;
  return (
    <div style={{ marginTop: -10, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= score ? colors[score] : "rgba(255,255,255,0.1)",
            transition: "background 0.3s"
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: colors[score] }}>{labels[score]}</span>
    </div>
  );
}

// ── Wallet reveal card ────────────────────────────────────────────────────────
function WalletCard({ wallet, onContinue }) {
  const [copied, setCopied] = useState({});
  const [revealed, setRevealed] = useState(false);

  const copy = (key, text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1800);
  };

  return (
    <div style={{ animation: "fadeUp 0.5s ease forwards" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(0,180,216,0.2), rgba(0,119,182,0.3))",
          border: "2px solid rgba(0,180,216,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", fontSize: 28
        }}>✅</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#F1F5F9",
          fontFamily: "'Syne', sans-serif" }}>Wallet créé avec succès</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
          Sauvegardez ces informations en lieu sûr
        </p>
      </div>

      {/* Warning */}
      <div style={{
        background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
        borderRadius: 10, padding: "12px 16px", marginBottom: 20,
        display: "flex", gap: 10, alignItems: "flex-start"
      }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <p style={{ margin: 0, fontSize: 12, color: "#FCD34D", lineHeight: 1.5 }}>
          <strong>Ne partagez jamais</strong> votre clé privée ni votre phrase mnémonique.
          PrivARC ne vous les demandera jamais.
        </p>
      </div>

      {/* Address */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B",
          letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          Adresse du Wallet
        </label>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(0,180,216,0.06)", border: "1px solid rgba(0,180,216,0.2)",
          borderRadius: 10, padding: "10px 14px"
        }}>
          <span style={{ fontSize: 13, color: "#00B4D8", fontFamily: "'DM Mono', monospace",
            flex: 1, wordBreak: "break-all" }}>{wallet.address}</span>
          <button onClick={() => copy("addr", wallet.address)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: copied.addr ? "#10B981" : "#64748B", flexShrink: 0
          }}>
            {copied.addr ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>

      {/* Mnemonic */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B",
            letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Phrase de Récupération (12 mots)
          </label>
          <button onClick={() => setRevealed(!revealed)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, color: "#00B4D8", fontWeight: 600
          }}>
            {revealed ? "Masquer" : "Afficher"}
          </button>
        </div>
        {revealed ? (
          <div style={{ position: "relative" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(0,180,216,0.2)",
              borderRadius: 10, padding: 14
            }}>
              {wallet.mnemonic.split(" ").map((word, i) => (
                <div key={i} style={{
                  background: "rgba(0,180,216,0.06)", borderRadius: 6,
                  padding: "5px 8px", display: "flex", alignItems: "center", gap: 6
                }}>
                  <span style={{ fontSize: 10, color: "#475569", minWidth: 16 }}>{i + 1}.</span>
                  <span style={{ fontSize: 12, color: "#E2E8F0", fontFamily: "'DM Mono', monospace" }}>
                    {word}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => copy("mnem", wallet.mnemonic)} style={{
              position: "absolute", top: 10, right: 10, background: "none", border: "none",
              cursor: "pointer", color: copied.mnem ? "#10B981" : "#64748B"
            }}>
              {copied.mnem ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        ) : (
          <div style={{
            background: "rgba(0,0,0,0.25)", border: "1px solid rgba(0,180,216,0.15)",
            borderRadius: 10, padding: 20, textAlign: "center",
            color: "#475569", fontSize: 12, cursor: "pointer"
          }} onClick={() => setRevealed(true)}>
            🔒 Cliquez sur "Afficher" pour révéler
          </div>
        )}
      </div>

      {/* Private key */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B",
          letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          Clé Privée
        </label>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 10, padding: "10px 14px"
        }}>
          <span style={{
            fontSize: 12, color: "#F87171", fontFamily: "'DM Mono', monospace",
            flex: 1, wordBreak: "break-all",
            filter: revealed ? "none" : "blur(6px)", transition: "filter 0.3s",
            userSelect: revealed ? "text" : "none"
          }}>
            {wallet.privateKey}
          </span>
          <button onClick={() => copy("pk", wallet.privateKey)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: copied.pk ? "#10B981" : "#64748B", flexShrink: 0
          }}>
            {copied.pk ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>

      <button onClick={onContinue} style={{
        width: "100%", padding: "14px 0",
        background: "linear-gradient(135deg, #00B4D8, #0077B6)",
        border: "none", borderRadius: 12, color: "#fff",
        fontSize: 15, fontWeight: 700, cursor: "pointer",
        fontFamily: "'Syne', sans-serif", letterSpacing: "0.04em",
        boxShadow: "0 4px 20px rgba(0,180,216,0.35)",
        transition: "transform 0.15s, box-shadow 0.15s"
      }}
        onMouseEnter={e => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 6px 24px rgba(0,180,216,0.45)"; }}
        onMouseLeave={e => { e.target.style.transform = "none"; e.target.style.boxShadow = "0 4px 20px rgba(0,180,216,0.35)"; }}
      >
        Accéder à PrivARC →
      </button>
    </div>
  );
}

// ── Dashboard preview ─────────────────────────────────────────────────────────
function Dashboard({ user, wallet }) {
  return (
    <div style={{ animation: "fadeUp 0.5s ease forwards" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #00B4D8, #0077B6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 12px", fontSize: 22, fontWeight: 700, color: "#fff",
          fontFamily: "'Syne', sans-serif"
        }}>
          {user.name ? user.name[0].toUpperCase() : "P"}
        </div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#F1F5F9",
          fontFamily: "'Syne', sans-serif" }}>
          Bienvenue, {user.name || "Utilisateur"}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>{user.email}</p>
      </div>

      {/* Wallet summary */}
      <div style={{
        background: "linear-gradient(135deg, rgba(0,180,216,0.1), rgba(0,119,182,0.15))",
        border: "1px solid rgba(0,180,216,0.25)", borderRadius: 14, padding: 20, marginBottom: 16
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#64748B", fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase" }}>Wallet ARC Network</p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#00B4D8",
              fontFamily: "'DM Mono', monospace" }}>{shortAddr(wallet.address)}</p>
          </div>
          <div style={{ color: "#00B4D8" }}><WalletIcon /></div>
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(0,180,216,0.1)" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#64748B" }}>Solde disponible</p>
          <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#F1F5F9",
            fontFamily: "'Syne', sans-serif" }}>0.00 <span style={{ fontSize: 14, color: "#64748B" }}>USDC</span></p>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { icon: "🛡️", label: "Shield", color: "#00B4D8" },
          { icon: "🔄", label: "Private Swap", color: "#7C3AED" },
          { icon: "📤", label: "Private Send", color: "#10B981" },
          { icon: "📥", label: "Withdraw", color: "#F59E0B" },
        ].map(({ icon, label, color }) => (
          <button key={label} style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: "14px 10px", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            transition: "border-color 0.2s, background 0.2s"
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = color + "55"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
          >
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>{label}</span>
          </button>
        ))}
      </div>

      <div style={{
        background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
        borderRadius: 10, padding: "10px 14px",
        display: "flex", gap: 10, alignItems: "center"
      }}>
        <span style={{ fontSize: 16 }}>🟢</span>
        <p style={{ margin: 0, fontSize: 12, color: "#6EE7B7" }}>
          Connecté à <strong>ARC Testnet</strong> — Protocole actif
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function PrivARCAuth() {
  const [mode, setMode] = useState("login"); // login | signup | wallet | dashboard
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [user, setUser] = useState(null);

  // Form fields
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [errors, setErrors]     = useState({});
  const [agreed, setAgreed]     = useState(false);

  const validate = () => {
    const e = {};
    if (mode === "signup" && !name.trim()) e.name = "Nom requis";
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Adresse email invalide";
    if (!password) e.password = "Mot de passe requis";
    if (mode === "signup") {
      if (password.length < 8) e.password = "Minimum 8 caractères";
      if (password !== confirm) e.confirm = "Les mots de passe ne correspondent pas";
      if (!agreed) e.agreed = "Vous devez accepter les conditions";
    }
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      if (mode === "login") {
        setUser({ name: "Utilisateur", email });
        setWallet(generateWallet());
        setMode("dashboard");
      } else {
        const w = generateWallet();
        setWallet(w);
        setUser({ name, email });
        setMode("wallet");
      }
    }, 1600);
  };

  const switchMode = (m) => {
    setMode(m); setErrors({});
    setName(""); setEmail(""); setPassword(""); setConfirm(""); setAgreed(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060B14; }
        input::placeholder { color: #334155; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>

      <Particles />

      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Mono', monospace", padding: "24px 16px",
        position: "relative", zIndex: 1
      }}>
        {/* Card */}
        <div style={{
          width: "100%", maxWidth: 460,
          background: "rgba(10,18,35,0.85)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(0,180,216,0.18)",
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,180,216,0.06) inset",
          padding: "36px 36px 32px",
          animation: "fadeUp 0.6s ease forwards"
        }}>
          {/* Logo */}
          {(mode === "login" || mode === "signup") && (
            <div style={{ textAlign: "center", marginBottom: 30 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
                <ArcIcon />
                <span style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9",
                  fontFamily: "'Syne', sans-serif", letterSpacing: "-0.02em" }}>
                  Priv<span style={{ color: "#00B4D8" }}>ARC</span>
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: "#475569", letterSpacing: "0.06em" }}>
                PRIVACY LAYER · ARC NETWORK
              </p>
            </div>
          )}

          {/* Tabs */}
          {(mode === "login" || mode === "signup") && (
            <div style={{
              display: "flex", background: "rgba(255,255,255,0.04)",
              borderRadius: 12, padding: 4, marginBottom: 28
            }}>
              {["login", "signup"].map(m => (
                <button key={m} onClick={() => switchMode(m)} style={{
                  flex: 1, padding: "10px 0",
                  background: mode === m ? "rgba(0,180,216,0.18)" : "none",
                  border: mode === m ? "1px solid rgba(0,180,216,0.35)" : "1px solid transparent",
                  borderRadius: 9, color: mode === m ? "#00B4D8" : "#475569",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'Syne', sans-serif", transition: "all 0.2s"
                }}>
                  {m === "login" ? "Connexion" : "Inscription"}
                </button>
              ))}
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === "login" && (
            <div style={{ animation: "fadeUp 0.35s ease forwards" }}>
              <Field label="Adresse email" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com"
                icon={<MailIcon />} error={errors.email} />
              <Field label="Mot de passe" type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                icon={<LockIcon />} error={errors.password} />

              <div style={{ textAlign: "right", marginTop: -10, marginBottom: 20 }}>
                <a href="#" style={{ fontSize: 12, color: "#00B4D8", textDecoration: "none" }}>
                  Mot de passe oublié ?
                </a>
              </div>

              <button onClick={handleSubmit} disabled={loading} style={{
                width: "100%", padding: "14px 0",
                background: loading ? "rgba(0,180,216,0.3)" : "linear-gradient(135deg, #00B4D8, #0077B6)",
                border: "none", borderRadius: 12, color: "#fff",
                fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'Syne', sans-serif", letterSpacing: "0.04em",
                boxShadow: loading ? "none" : "0 4px 20px rgba(0,180,216,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10
              }}>
                {loading ? (
                  <>
                    <span style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid #fff", borderRadius: "50%",
                      animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                    Connexion…
                  </>
                ) : "Se connecter"}
              </button>

              <div style={{ margin: "24px 0", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                <span style={{ fontSize: 11, color: "#475569" }}>ou</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>

              {/* Web3 login */}
              <button style={{
                width: "100%", padding: "12px 0",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12, color: "#94A3B8",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                transition: "border-color 0.2s, color 0.2s"
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,180,216,0.3)"; e.currentTarget.style.color = "#E2E8F0"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#94A3B8"; }}
              >
                <WalletIcon /> Connecter un wallet existant
              </button>
            </div>
          )}

          {/* ── SIGNUP ── */}
          {mode === "signup" && (
            <div style={{ animation: "fadeUp 0.35s ease forwards" }}>
              <Field label="Nom complet" type="text" value={name}
                onChange={e => setName(e.target.value)} placeholder="Jean Dupont"
                icon={<UserIcon />} error={errors.name} />
              <Field label="Adresse email" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com"
                icon={<MailIcon />} error={errors.email} />
              <Field label="Mot de passe" type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 caractères"
                icon={<LockIcon />} error={errors.password} />
              <PasswordStrength password={password} />
              <Field label="Confirmer le mot de passe" type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} placeholder="••••••••"
                icon={<LockIcon />} error={errors.confirm} />

              {/* Info box */}
              <div style={{
                background: "rgba(0,180,216,0.06)", border: "1px solid rgba(0,180,216,0.2)",
                borderRadius: 10, padding: "12px 14px", marginBottom: 18,
                display: "flex", gap: 10, alignItems: "flex-start"
              }}>
                <span style={{ color: "#00B4D8", marginTop: 1 }}><ShieldIcon /></span>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>
                    Un <strong style={{ color: "#00B4D8" }}>wallet ARC Network</strong> sera
                    automatiquement généré et lié à votre compte. Vous recevrez votre
                    adresse, clé privée et phrase mnémonique.
                  </p>
                </div>
              </div>

              {/* Checkbox */}
              <label style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                cursor: "pointer", marginBottom: errors.agreed ? 4 : 20
              }}>
                <div onClick={() => setAgreed(!agreed)} style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                  background: agreed ? "#00B4D8" : "transparent",
                  border: `2px solid ${agreed ? "#00B4D8" : "rgba(0,180,216,0.3)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s", cursor: "pointer"
                }}>
                  {agreed && <CheckIcon />}
                </div>
                <span style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                  J'accepte les{" "}
                  <a href="#" style={{ color: "#00B4D8", textDecoration: "none" }}>conditions d'utilisation</a>
                  {" "}et la{" "}
                  <a href="#" style={{ color: "#00B4D8", textDecoration: "none" }}>politique de confidentialité</a>
                </span>
              </label>
              {errors.agreed && (
                <p style={{ fontSize: 11.5, color: "#F87171", marginBottom: 14, marginLeft: 28 }}>
                  {errors.agreed}
                </p>
              )}

              <button onClick={handleSubmit} disabled={loading} style={{
                width: "100%", padding: "14px 0",
                background: loading ? "rgba(0,180,216,0.3)" : "linear-gradient(135deg, #00B4D8, #0077B6)",
                border: "none", borderRadius: 12, color: "#fff",
                fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'Syne', sans-serif", letterSpacing: "0.04em",
                boxShadow: loading ? "none" : "0 4px 20px rgba(0,180,216,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10
              }}>
                {loading ? (
                  <>
                    <span style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid #fff", borderRadius: "50%",
                      animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                    Génération du wallet…
                  </>
                ) : "Créer mon compte & wallet"}
              </button>
            </div>
          )}

          {/* ── WALLET REVEAL ── */}
          {mode === "wallet" && wallet && (
            <WalletCard wallet={wallet} onContinue={() => setMode("dashboard")} />
          )}

          {/* ── DASHBOARD ── */}
          {mode === "dashboard" && user && wallet && (
            <Dashboard user={user} wallet={wallet} />
          )}

          {/* Footer */}
          {(mode === "login" || mode === "signup") && (
            <p style={{ textAlign: "center", marginTop: 24, fontSize: 11.5, color: "#334155" }}>
              <LockIcon style={{ verticalAlign: "middle" }} />{" "}
              Connexion sécurisée · ARC Network · USDC fees
            </p>
          )}
        </div>
      </div>
    </>
  );
}
