<div align="center">

# PrivARC OS

<img src="public/favicon.svg" width="64" alt="PrivARC"/>

**Autonomous Crypto Operating System — Arc Testnet**

[![Arc Testnet](https://img.shields.io/badge/Network-Arc%20Testnet-00FFB0?style=for-the-badge)](https://testnet.arcscan.app)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel)](https://vercel.com)
[![EIP-191](https://img.shields.io/badge/Auth-EIP--191-blue?style=for-the-badge)](https://eips.ethereum.org/EIPS/eip-191)
[![ZK Proofs](https://img.shields.io/badge/ZK-Groth16%20%2B%20PLONK-a78bfa?style=for-the-badge)](https://z.cash/technology/groth16/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

*One repo · One Vercel deployment · Landing page + full DApp*

</div>

---

## Architecture

```
src/
├── App.jsx       ← Router: / → Landing, /app → PrivARCOS
├── Landing.jsx   ← Marketing vitrine (features, roadmap, stats)
├── DApp.jsx      ← Full PrivARC OS (Web3, ZK, AI agents, 14 panels)
└── main.jsx      ← React root
```

### Routing

| URL | Component | Description |
|-----|-----------|-------------|
| `/` | `<Landing>` | Marketing landing page |
| `/app` | `<PrivARCOS>` | Full DApp (wallet auth, shield, swap, governance…) |

Zero external router dependency — pure `window.history.pushState`.
Vercel rewrites all routes to `index.html` (configured in `vercel.json`).

### Bundle splitting (Vite)

| Chunk | Contents | When loaded |
|-------|----------|-------------|
| `react` | react + react-dom | Both routes |
| `landing` | Landing.jsx | `/` only |
| `dapp` | DApp.jsx | `/app` only |

The DApp (~150KB source) is only loaded when the user navigates to `/app`.

---

## Features

### Landing page (`/`)
- Animated hex grid background (canvas)
- Glitch logo animation
- Live terminal animation (AI agent logs)
- Stats counters with intersection observer
- Feature cards (9 features)
- Architecture diagram
- How It Works (4 steps)
- Roadmap (Q3 2026 → Q2 2027)
- CTA section + Footer
- Scroll-reveal animations

### PrivARC OS DApp (`/app`)
- **Auth**: Wallet-only (EIP-191) — 8 providers: MetaMask, Rabby, WalletConnect, Coinbase, Trust, OKX, TokenPocket, Brave
- **Real Arc Testnet** (chainId 5042002) — real USDC balance, real transactions
- **Shield**: Deposit USDC → ZK commitment on-chain
- **Private Swap**: ZK-routed token exchange
- **Private Send**: Stealth address transfer
- **Withdraw**: Groth16 ZK proof → exit funds
- **Bridge**: CCTP v2 cross-chain (6 chains)
- **Analytics**: TVL charts, TX heatmap, real CoinGecko prices
- **ZK Console**: Groth16 + PLONK proof generation
- **Governance**: On-chain voting (PIP proposals)
- **Staking**: USDC yield, 4 lock periods, 1×–3× multipliers
- **Portfolio**: Asset allocation, report export
- **AI Agents**: 8 autonomous on-chain agents
- **History**: Transaction log with ARCScan links
- **Settings**: Network config, slippage, expert mode
- **Disconnect**: Confirmation modal

---

## Arc Testnet

```json
{
  "chainId":    5042002,
  "chainIdHex": "0x4cef52",
  "rpcUrl":     "https://rpc.testnet.arc.network",
  "explorer":   "https://testnet.arcscan.app",
  "faucet":     "https://faucet.circle.com",
  "currency":   "USDC"
}
```

---

## Getting Started

```bash
npm install
npm run dev
# → http://localhost:5173       landing page
# → http://localhost:5173/app   PrivARC OS DApp
```

### Build

```bash
npm run build
# → dist/  (3 chunks: react, landing, dapp)
npm run preview
```

---

## Deploy on Vercel

### Method 1 — GitHub Import

1. Push to GitHub (see procedure below)
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import `privarc-os`
4. Framework: **Vite** — Build: `npm run build` — Output: `dist`
5. Deploy ✓

### Method 2 — Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

---

## GitHub Push Procedure

```bash
git init
git add .
git commit -m "feat: PrivARC OS v10 — unified landing + DApp

Architecture:
- / → Landing vitrine (marketing, features, roadmap)
- /app → PrivARC OS DApp (full Web3 + ZK + 14 panels)
- Single Vite project, single Vercel deployment
- Bundle split: landing / dapp loaded independently
- Real Arc Testnet (chainId 5042002)
- Real USDC balance via eth_getBalance
- Real wallet transactions via eth_sendTransaction
- CoinGecko live prices (USDC/WETH/WBTC)
- 8 wallet providers supported"

gh repo create privarc-os \
  --public \
  --description "PrivARC OS — Landing page + DApp on Arc Testnet" \
  --source=. --remote=origin --push

git tag v10.0.0 -m "PrivARC OS v10.0.0"
git push origin v10.0.0
```

---

## Versioning

| Version | Key Feature |
|---------|-------------|
| v1–v3 | Auth iterations (email → wallet) |
| v4–v6 | OS panels, analytics, ZK console |
| v7–v8 | Live prices, notifications, production-ready |
| v9 | Real Arc Testnet on-chain (chainId 5042002) |
| **v10** | **Unified: landing + DApp, one repo, one deployment** |

---

## License

MIT © 2024 PrivARC
