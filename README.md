# PrivARC OS — Frontend v10.2.0

React + Vite DApp for the PrivARC privacy protocol on Arc Testnet.

## Setup

```bash
# From monorepo root (recommended)
├── privarc-contracts-v2/   ← deploy contracts first
└── privarc-v10/            ← then start frontend

# 1. Deploy contracts (generates deployments/latest.json)
cd privarc-contracts-v2
npm install && npm run deploy:testnet

# 2. Start frontend (auto-loads addresses from latest.json)
cd ../privarc-v10
npm install && npm run dev
```

## Standalone deploy (Vercel, without contracts monorepo)

Set environment variables in Vercel dashboard:
```
VITE_SHIELD_VAULT=0x...
VITE_TIMELOCK=0x...
... (see .env.example)
```

## Architecture

```
src/
├── main.jsx       — React entry point
├── App.jsx        — Router (/ → Landing, /app → DApp)
├── Landing.jsx    — Marketing page
├── DApp.jsx       — Full PrivARC OS DApp (all panels)
└── contracts.js   — Contract addresses + ABI calldata builders
                     Auto-loaded from ../privarc-contracts-v2/deployments/latest.json
```

## Deployed addresses — Arc Testnet (latest.json v2.1.0 — 2026-06-08)

| Contract            | Address                                      |
|---------------------|----------------------------------------------|
| USDC                | `0x3600000000000000000000000000000000000000` |
| CCTP_TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| Timelock            | `0x3a9BeAA75bd8b4f975C29AA78744834531E16799` |
| Governance          | `0x70F71a1CB248Dd900f3d7D39C4a4a54BA5d986d0` |
| Staking             | `0x6841c7A3938791DDFDB90f31acC7072F7B1c967A` |
| MockVerifierZK      | `0x8569c0D493c837A7618164DC8DE5BaF68C36e736` |
| NullifierRegistry   | `0x28AFBbd86841f6eb2A219F4f8Ff69c577F30ADE1` |
| MerkleTreeManager   | `0x80333Bf880b28A98b5206216edc4a8Cde0958979` |
| DepositManager      | `0xFabE444BC5231a7cdF61f4346321517aF82162F7` |
| WithdrawalManager   | `0xb37Ade468163FE3dCBB39ba1343651d7499dB3a2` |
| ShieldedTransfer    | `0x3C821bd2d510170b11Dc049D5CE988B605Fc1658` |
| PrivateSwap         | `0x01A06c330d9baEA60C5fc9D9b0AA2510E90C77dA` |
| PrivateBridge       | `0xF5206339d4E6c9712Ec4570A762a04E2fCdA44B0` |
| EmergencyController | `0xc44B286E65bAa36597980e48E879d317f954B94E` |
| ShieldVault         | `0x0352A0cAAEA755e0D1D6c4040c084eA731b5D454` |

Deployer: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`
