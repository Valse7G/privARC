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

## Deployed addresses — Arc Testnet (latest.json v2.3.0 — 2026-06-09)

| Contract            | Address                                      |
|---------------------|----------------------------------------------|
| USDC                | `0x3600000000000000000000000000000000000000` |
| EURC                | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC              | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |
| CCTP_TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| Timelock            | `0x610Ac4c608BDa6d7a7c9EE92E80E636dA693C9C1` |
| Governance          | `0xd90450f078B0ae9a2bcb6fC9ce91bbB577761aaa` |
| Staking             | `0x7020421318F41F9A11Ba25a19Ee59Da652a775Cf` |
| MockVerifierZK      | `0xF9cC4B19d76709ec33087224f876c4834978f3AD` |
| NullifierRegistry   | `0xFA80cB08e92323ABb6110d2A5E3f0CBa228BFFc2` |
| MerkleTreeManager   | `0x5Ab317C4bb24a2CD3Fa79Fe85AfA52C4A32462B0` |
| DepositManager      | `0x3f59AC80EA087cC08D85c40aA29335ed57E64032` |
| WithdrawalManager   | `0x15244f75dE6221D3E290740dEd52Ec3217C8EC5D` |
| ShieldedTransfer    | `0xbBf614Dd567A98d8879b68Ebc3b9F34aC8732CF6` |
| PrivateSwap         | `0xa091603CfDDf533937aB68DF55E9295F9aAd38d1` |
| PrivateBridge       | `0x7f7688BD2a53B653C670A0552d8674a909Bd3d9F` |
| EmergencyController | `0x7eCAfef63ad0a2Fb3734843AeeF275ACDC216b1F` |
| ShieldVault         | `0x9D90f31a7E848A9b23Bc74f29ec6DDD49fAd2eed` |

Deployer: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`
