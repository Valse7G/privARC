<div align="center">

# PrivARC OS

<img src="public/favicon.svg" width="64" alt="PrivARC logo"/>

**Autonomous Crypto Operating System — Arc Testnet (Circle L1)**

[![Arc Testnet](https://img.shields.io/badge/Network-Arc%20Testnet-00FFB0?style=for-the-badge&logo=ethereum&logoColor=white)](https://testnet.arcscan.app)
[![Chain ID](https://img.shields.io/badge/ChainID-5042002-00FFB0?style=for-the-badge)](https://docs.arc.io)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![EIP-191](https://img.shields.io/badge/Auth-EIP--191-blue?style=for-the-badge)](https://eips.ethereum.org/EIPS/eip-191)
[![ZK Proofs](https://img.shields.io/badge/ZK-Groth16%20%2B%20PLONK-a78bfa?style=for-the-badge)](https://z.cash/technology/groth16/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

---

*privARC is an autonomous crypto operating system for private on-chain capital management, powered by 8 AI agents on Arc Network (Circle L1).*

> **v3.0.0 — Real on-chain conditions.** No simulation. Real USDC balances, real wallet transactions, real network switch via EIP-1193.

[ARCScan Testnet](https://testnet.arcscan.app) · [Circle Faucet](https://faucet.circle.com) · [Arc Docs](https://docs.arc.io) · [Report a Bug](https://github.com/YOUR_USERNAME/privarc-v9/issues)

</div>

---

## What's New in v3.0.0

| Feature | v1–v8 | v3.0.0 (v9) |
|---------|-------|-------------|
| USDC Balance | Simulated | **Real** — read from Arc Testnet via `eth_getBalance` |
| Network Switch | Simulated | **Real** — `wallet_switchEthereumChain` + `wallet_addEthereumChain` |
| Transactions | Simulated | **Real** — `eth_sendTransaction` signed by wallet |
| Receipt confirmation | Simulated | **Real** — `eth_getTransactionReceipt` polling |
| Auth signature | Simulated | **Real** — `personal_sign` EIP-191 |
| Block number | Simulated | **Real** — `eth_blockNumber` polled every 6s |
| Mainnet toggle | Fake switch | **Locked** — greyed out until Arc Mainnet launches |
| Network | ARC (7070) old | **Arc Testnet (5042002)** — official chain |

---

## Arc Network — Official Testnet Config

```json
{
  "chainId": 5042002,
  "chainIdHex": "0x4CEB12",
  "chainName": "Arc Testnet",
  "nativeCurrency": {
    "name": "USDC",
    "symbol": "USDC",
    "decimals": 18
  },
  "rpcUrls": ["https://rpc.testnet.arc.network"],
  "wsUrls": ["wss://rpc.testnet.arc.network"],
  "blockExplorerUrls": ["https://testnet.arcscan.app"]
}
```

> **Important — USDC decimals on Arc:**
> - **Native gas token**: 18 decimals (used internally by EVM)
> - **ERC-20 interface**: 6 decimals (use this for balances and transfers)
> - Conversion: `native_wei18 / 10^12 = usdc_6dec`
> - Source: [docs.arc.io](https://docs.arc.io)

---

## Features

### Authentication
- Wallet-only sign-in — **no email, no password, no KYC**
- Real `eth_requestAccounts` → real wallet popup
- Real `wallet_switchEthereumChain` / `wallet_addEthereumChain` to Arc Testnet
- EIP-191 `personal_sign` authentication message (no gas, no tx)
- 8 wallet providers: MetaMask, Rabby, WalletConnect, Coinbase, Trust, OKX, TokenPocket, Brave
- Disconnect with confirmation modal

### Real On-Chain Operations
All operations use real EIP-1193 calls via `window.ethereum`:

| Panel | On-Chain Action |
|-------|----------------|
| Shield | `eth_sendTransaction` → ShieldVault |
| Swap | `eth_sendTransaction` → Arc StableFX |
| Send | `eth_sendTransaction` → direct USDC transfer |
| Withdraw | `eth_sendTransaction` → destination address |
| Bridge | `eth_sendTransaction` → CCTP v2 burn |
| Governance | `eth_sendTransaction` → vote / delegate |
| Staking | `eth_sendTransaction` → Staking contract |

Each transaction:
1. Builds the tx object with correct `to`, `value`, `data`, `chainId`
2. Calls `eth_sendTransaction` → wallet prompts user
3. Polls `eth_getTransactionReceipt` every 2s (max 30 attempts = 60s)
4. Shows confirmation with ARCScan link on success

### Balance
- Real USDC balance read from Arc Testnet via `eth_getBalance`
- Native balance (18 dec) → shifted by `1e12` to display as USDC 6-dec
- Auto-refresh on: connect, chain change, account change, manual button
- Faucet link always visible: [faucet.circle.com](https://faucet.circle.com) (1 USDC/day)

### Network Management
- **Testnet**: Active, green dot, fully functional
- **Mainnet**: Locked, greyed out, shows "Not yet available" — will unlock automatically when Arc Mainnet launches
- Wrong network → banner at top with one-click switch button
- Sidebar dot: green = Arc Testnet, red = wrong network

### Additional Features
- Live price ticker (USDC, WETH, WBTC) — USDC locked at ~$1
- ZK Proof Console — Groth16 & PLONK, 3 circuits
- Analytics dashboard with heatmap
- AI Agent cluster — 8 agents monitoring Arc Testnet
- Push notification center
- Global search (⌘K)
- Onboarding tour (7 steps, Arc Testnet focused)
- Portfolio with ARCScan address link + report export

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- A Web3 wallet (MetaMask recommended for Arc Testnet)
- Testnet USDC from [faucet.circle.com](https://faucet.circle.com)

### Add Arc Testnet to MetaMask

The app does this automatically on connect. Manual setup:

| Field | Value |
|-------|-------|
| Network Name | Arc Testnet |
| RPC URL | `https://rpc.testnet.arc.network` |
| Chain ID | `5042002` |
| Currency Symbol | `USDC` |
| Block Explorer | `https://testnet.arcscan.app` |

### Get Testnet USDC

1. Go to [faucet.circle.com](https://faucet.circle.com)
2. Select **Arc Testnet**
3. Paste your wallet address
4. Request USDC (1 USDC / day)

### Install & Run

```bash
git clone https://github.com/YOUR_USERNAME/privarc-v9.git
cd privarc-v9
npm install
npm run dev
# → http://localhost:5173
```

### Build

```bash
npm run build
# Output in /dist
npm run preview
```

---

## Deployment on Vercel

### Method 1 — Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

### Method 2 — GitHub Integration

1. Push to GitHub (see procedure below)
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import `privarc-v9`
4. Settings:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Deploy ✓

---

## Architecture

```
privarc-v9/
├── src/
│   ├── App.jsx          ← Full app (single file, ~1200 lines)
│   └── main.jsx         ← React root
├── public/
│   └── favicon.svg
├── index.html
├── package.json
├── vite.config.js       ← manualChunks for React split
├── vercel.json          ← rewrites + security headers
├── .gitignore
└── README.md
```

### EIP-1193 Layer (no external dependencies)

```javascript
// All chain calls via window.ethereum directly
rpcCall("eth_requestAccounts")
rpcCall("wallet_switchEthereumChain", [{ chainId: "0x4CEB12" }])
rpcCall("wallet_addEthereumChain",    [{ ...arcTestnetConfig }])
rpcCall("eth_getBalance",             [address, "latest"])
rpcCall("eth_blockNumber")
rpcCall("eth_sendTransaction",        [{ from, to, value, data, chainId }])
rpcCall("eth_getTransactionReceipt",  [txHash])
rpcCall("personal_sign",              [messageHex, address])
```

Zero external wallet libraries — pure EIP-1193.

---

## Versioning

| Version | Key Feature |
|---------|-------------|
| v1 | Login/Signup + auto wallet generation |
| v2 | Cyberpunk OS aesthetic + boot sequence |
| v3 | Wallet Connect (8 providers) + EIP-4361 |
| v4 | Viem/Wagmi sim layer + ARC Network |
| v5 | Full OS sidebar (14 panels) |
| v6 | Analytics + ZK Console + Governance + Staking |
| v7 | Live prices + notifications + search + onboarding |
| v8 | Wallet-only auth + disconnect modal + white text |
| **v9** | **Real Arc Testnet — real USDC, real txs, real wallet** |

---

## Security

- Non-custodial — private keys never leave your wallet
- EIP-191 authentication — no email, no password
- Zero external wallet libraries — pure EIP-1193
- Security headers configured in `vercel.json`

---

## License

MIT © 2024 PrivARC

---

<div align="center">
Built on <strong>Arc Testnet</strong> (Circle L1) · Gas in <strong>USDC</strong> · chainId <strong>5042002</strong>
</div>
