<div align="center">

# PrivARC OS

<img src="public/favicon.svg" width="64" alt="PrivARC logo"/>

**Autonomous Crypto Operating System for Private On-Chain Capital Management**

[![ARC Network](https://img.shields.io/badge/Network-ARC%20Network-00FFB0?style=for-the-badge&logo=ethereum&logoColor=white)](https://arcnetwork.io)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)
[![Version](https://img.shields.io/badge/Version-2.4.1-00FFB0?style=for-the-badge)](https://github.com)
[![EIP-4361](https://img.shields.io/badge/Auth-EIP--4361-blue?style=for-the-badge)](https://eips.ethereum.org/EIPS/eip-4361)
[![ZK Proofs](https://img.shields.io/badge/ZK-Groth16%20%2B%20PLONK-a78bfa?style=for-the-badge)](https://z.cash/technology/groth16/)

---

*privARC is an autonomous crypto operating system for private on-chain capital management powered by AI agents on ARC Network.*

[Live Demo](https://privarc.io) · [ARCScan](https://scan.arcnetwork.io) · [Documentation](https://docs.privarc.io) · [Report a Bug](https://github.com/privarc/privarc-v8/issues)

</div>

---

## Overview

PrivARC OS is a fully non-custodial, privacy-first DApp built on **ARC Network** (chainId: 7070). It provides a complete on-chain operating system experience: authenticated exclusively via Web3 wallet (EIP-4361), with a full suite of DeFi operations wrapped in zero-knowledge privacy.

Authentication requires **no email, no password, no KYC** — only your wallet signature.

---

## Features

### 🔐 Authentication
- **Wallet-only sign-in** via EIP-4361 (Sign-In With Ethereum standard)
- Supports **8 wallet providers**: MetaMask, Rabby, WalletConnect, Coinbase Wallet, Trust Wallet, OKX Wallet, TokenPocket, Brave Wallet
- Auto-detection of installed wallets
- Real EIP-1193 connection when provider is available
- ARC Network auto-switch + auto-add (chainId 7070)
- One-click **Disconnect** with confirmation modal

### 🛡 Shield
- Deposit USDC into the **ShieldVault** smart contract
- ZK commitment generated and inscribed in on-chain Merkle tree
- Funds become untraceable once shielded
- Fee: **0.00 USDC** (launch phase)
- Gas estimation before submission

### ⇄ Private Swap
- ZK-routed token exchange: USDC, WETH, WBTC, ARCt, DAI, USDT
- Amount and addresses remain invisible on-chain
- Real-time quote with price impact and fee breakdown
- Route: `Token → USDC Pool → ZK Relay → Token`

### ↗ Private Send
- Stealth address P2P transfer
- Supports **ARC Name Service** (`.arc`) and ENS (`.eth`) resolution
- Optional encrypted note to recipient
- Fee: **0.02 USDC** flat

### ↙ Withdraw
- Exit shielded funds to any public address
- **Groth16 ZK proof** generated client-side (~1.8s)
- Partial withdrawal supported
- Fee: **0.03 USDC** flat

### ⟺ Bridge
- Cross-chain transfer to: **Ethereum, BNB Chain, Polygon, Arbitrum, Base, Optimism**
- Funds travel shielded end-to-end
- Dynamic fee per destination chain

### 📈 Analytics
- Live TVL chart (30-day sparkline)
- Daily transaction volume chart
- ZK proof generation chart
- Protocol stats: TVL, operators, avg shield size, APY
- **Transaction heatmap** (7 days × 24 hours)

### 🔐 ZK Proof Console
- Generate **Groth16** or **PLONK** proofs on demand
- Three circuits: ShieldCircuit, TransferCircuit, WithdrawCircuit
- On-chain proof verification
- Proof history with timestamp and proving time

### 🗳 Governance
- On-chain **PIP proposals** with FOR / AGAINST / ABSTAIN voting
- veARC voting power display
- Vote delegation to any address or .arc name
- Create new proposals (parameter, fee, upgrade, tokenomics)

### 💎 Staking
- Stake USDC with lock periods: **7d, 30d, 90d, 180d**
- APY multipliers: 1.0× → 3.0×
- Pending rewards display + one-click claim
- Unstake at any time (lock permitting)

### 📊 Portfolio
- Multi-asset allocation donut chart
- Live USD value with real-time price feed
- **Export portfolio report** (.txt download)
- Price per asset with 24h change indicator

### 🤖 AI Agent Cluster (8 agents)
| Agent | Role | Status |
|-------|------|--------|
| ShieldAgent | Vault monitoring & deposits | ACTIVE |
| SwapAgent | DEX routing & optimization | ACTIVE |
| PrivacyAgent | Stealth scanning & note detection | ACTIVE |
| RiskAgent | Anomaly & volatility scoring | ACTIVE |
| ZKAgent | Proof generation (Groth16) | ACTIVE |
| BridgeAgent | Cross-chain relay | STANDBY |
| GovAgent | Governance monitoring | ACTIVE |
| FeeAgent | USDC oracle & fee sweep | ACTIVE |

### Additional Features
- **Live price ticker** — USDC, WETH, WBTC, ARCt, ARC, BNB (updates every 2.2s)
- **Push notification center** with unread badge
- **Global search** (⌘K) — 14 panels indexed
- **Onboarding tour** (7 steps) on first login
- **Block counter** (live, +1 every 6s)
- **Transaction history** with ARCScan links
- **Settings** — slippage, TX deadline, testnet toggle, expert mode

---

## Smart Contracts (ARC Network)

| Contract | Address |
|----------|---------|
| ShieldVault | `0x7f3A4e9C2b8D1F0a3E5c7b9D2e4F6A8c0B2d4E6f` |
| NoteRegistry | `0x3A5c7E9b1D3f5A7c9E1b3D5f7A9c1E3b5D7f9A1c` |
| VerifierZK | `0x9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D1f3A5c7E` |
| FeeCollector | `0x1b3D5f7A9c1E3b5D7f9A1c3E5b7D9f1A3c5E7b9D` |
| Staking | `0xF3aC9b5d7A1c3E5b7D9f1A3c5E7b9D1f3A5c7E9b` |
| Governance | `0xB9d1F3aC5E7b9D1f3A5c7E9b1D3f5A7c9E1b3D5f` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18.2 + Vite 5.1 |
| Wallet integration | EIP-1193 + EIP-4361 (Sign-In With Ethereum) |
| Blockchain client | Viem-compatible layer |
| ZK Proofs | Groth16 + PLONK (Circom 2 / SnarkJS) |
| Fees | USDC on ARC Network |
| Deployment | Vercel (Edge Network) |

---

## ARC Network Config

```json
{
  "chainId": 7070,
  "chainName": "ARC Network",
  "nativeCurrency": { "name": "ARC", "symbol": "ARC", "decimals": 18 },
  "rpcUrls": ["https://rpc.arcnetwork.io"],
  "blockExplorerUrls": ["https://scan.arcnetwork.io"]
}
```

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- A Web3 wallet (MetaMask, Rabby, etc.)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/privarc-v8.git
cd privarc-v8

# Install dependencies
npm install

# Start development server
npm run dev
# → http://localhost:5173
```

### Build for Production

```bash
npm run build
# Output in /dist

# Preview production build locally
npm run preview
```

---

## Deployment on Vercel

### Method 1 — Vercel CLI (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project root
vercel

# Follow prompts:
# ✓ Set up and deploy? Y
# ✓ Which scope? (your account)
# ✓ Link to existing project? N
# ✓ Project name: privarc-v8
# ✓ Directory: ./
# ✓ Override settings? N

# Production deploy
vercel --prod
```

### Method 2 — GitHub Integration

1. Push to GitHub (see procedure below)
2. Go to [vercel.com/new](https://vercel.com/new)
3. Click **Import Git Repository**
4. Select `privarc-v8`
5. Configure:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
6. Click **Deploy** ✓

### Environment Variables (Vercel Dashboard)

| Variable | Value | Required |
|----------|-------|----------|
| `VITE_ARC_RPC` | `https://rpc.arcnetwork.io` | Optional |
| `VITE_CHAIN_ID` | `7070` | Optional |
| `VITE_CHAIN_NAME` | `ARC Network` | Optional |
| `VITE_SCAN_URL` | `https://scan.arcnetwork.io` | Optional |
| `VITE_APP_VERSION` | `2.4.1` | Optional |

---

## GitHub Push Procedure

```bash
# 1. Initialize Git repository
git init
git add .
git commit -m "feat: PrivARC OS v2.4.1 — wallet-only auth + full OS"

# 2. Create GitHub repository
#    Option A — GitHub CLI
gh repo create privarc-v8 --public --source=. --remote=origin --push

#    Option B — Manual
git remote add origin https://github.com/YOUR_USERNAME/privarc-v8.git
git branch -M main
git push -u origin main

# 3. Tag the release
git tag v2.4.1 -m "PrivARC OS v2.4.1 — Production release"
git push origin v2.4.1

# 4. (Optional) Create GitHub Release
gh release create v2.4.1 \
  --title "PrivARC OS v2.4.1" \
  --notes "Wallet-only authentication, full OS with 14 panels, live prices, ZK console, governance, staking."
```

---

## Versioning

| Version | Description |
|---------|-------------|
| v1 | Login/Signup email + auto wallet generation |
| v2 | Cyberpunk OS aesthetic + boot sequence + hex grid |
| v3 | Wallet Connect (8 providers) + EIP-4361 |
| v4 | Viem/Wagmi layer + ARC Network auto-switch |
| v5 | Full OS sidebar (14 panels) |
| v6 | Analytics + ZK Console + Governance + Staking |
| v7 | Live prices + push notifications + search + onboarding |
| **v8** | **Wallet-only auth · disconnect modal · white text · production-ready** |

---

## Security

- **Non-custodial** — private keys never leave your wallet
- **EIP-4361** authentication — no email, no password
- **ZK commitments** — shielded balances untraceable on-chain
- **Nullifier registry** — prevents double-spending
- **No analytics trackers** — zero third-party data collection
- Security headers configured in `vercel.json`

---

## License

MIT © 2024 PrivARC

---

<div align="center">
Built on <strong>ARC Network</strong> · Fees in <strong>USDC</strong> · Powered by <strong>Zero-Knowledge Proofs</strong>
</div>
