import { useState, useEffect, useCallback } from "react";
import { Landing }   from "./Landing.jsx";
import { PrivARCOS } from "./DApp.jsx";

/* ═══════════════════════════════════════════════════════════════
   PRIVARC OS v10 — Unified Router
   /      → Landing page (vitrine)
   /app   → PrivARC OS DApp (full Web3 + ZK + AI agents)

   Zero external router dependency.
   Pure window.history.pushState — works perfectly on Vercel
   because vercel.json rewrites all routes to index.html.
═══════════════════════════════════════════════════════════════ */

function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  return { path, navigate };
}

export default function App() {
  const { path, navigate } = useRoute();

  // /app → full PrivARC OS
  if (path === "/app") {
    return (
      <>
        {/* Floating back button overlaid on DApp */}
        <button
          onClick={() => navigate("/")}
          style={{
            position: "fixed",
            top: 14,
            left: 14,
            zIndex: 9999,
            background: "rgba(0,8,5,.88)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(0,255,176,.22)",
            borderRadius: 4,
            color: "#00FFB0",
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: ".14em",
            padding: "7px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            transition: "all .2s",
            textTransform: "uppercase",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "rgba(0,255,176,.12)";
            e.currentTarget.style.borderColor = "rgba(0,255,176,.45)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "rgba(0,8,5,.88)";
            e.currentTarget.style.borderColor = "rgba(0,255,176,.22)";
          }}
        >
          ← Back to Site
        </button>
        <PrivARCOS />
      </>
    );
  }

  // / → Landing vitrine (passes navigate so "Launch App" works)
  return <Landing navigate={navigate} />;
}
