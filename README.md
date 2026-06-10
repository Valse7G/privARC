# PrivARC OS — Frontend v10.10.0

ZK privacy protocol interface built on Arc Testnet (Circle L1, USDC native gas).

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

## Network

| Field    | Value                          |
|----------|-------------------------------|
| Chain ID | 5042002                        |
| Gas token | USDC (ERC-20, 6 dec)          |
| RPC      | https://rpc.testnet.arc.network |
| Explorer | https://testnet.arcscan.app    |
| Faucet   | https://faucet.circle.com      |

## Features

| Panel      | Status | Notes |
|------------|--------|-------|
| Shield     | ✅ | Deposit USDC/EURC/cirBTC into ShieldVault |
| Withdraw   | ✅ | Exit shielded pool → public address |
| Shielded Send | ✅ | Private ZK transfer, receipt copied to clipboard |
| Public Send | ✅ | Direct USDC transfer, visible on ARCScan |
| Private Swap | ✅ | USDC ↔ EURC via ShieldVault (testnet: no DEX router) |
| Bridge     | ⚠️ | ZK tx executes; CCTP cross-chain delivery pending Arc Testnet CCTP launch |
| Portfolio  | ✅ | Live USDC + EURC + cirBTC balances + shielded notes |
| Staking    | ✅ | Stake USDC (7/30/90/180d lock), view positions, claim rewards |
| Analytics  | ✅ | Live 24h on-chain stats via eth_getLogs (30s refresh) |
| Tx History | ✅ | Persistent across sessions (localStorage) |

## Changelog

### v10.10.0
- **Tx History**: persistent in localStorage, survives page refresh
- **Portfolio**: live EURC + cirBTC balances via `balanceOf()` on-chain + total USD
- **Portfolio**: shielded notes breakdown (USDC/EURC/cirBTC) + export report
- **Staking**: read `previewRewards()` + protocol TVL on-chain every 15s; positions stored per wallet; unlock countdown; UNSTAKE button per position; MAX button wired to available USDC balance
- **Shielded Send**: generates shareable `privarc://note/<base64>` receipt, auto-copied to clipboard
- **Analytics**: 24h TX count + volume via `eth_getLogs` on ShieldVault, refreshed every 30s
- **Swap**: fixed `minAmountOut` BigInt calculation
- **Bridge**: restored note lookup, explicit CCTP testnet limitation notice

### v10.9.0
- ShieldedWallet component: per-token shielded balances in all panels
- useShieldedBalances hook aggregates notes with USD total

### v10.8.0
- TxConfirmModal: shows real amount before wallet prompt (ERC-20 + ZK txs show value=0)
- Note storage notification simplified

### v10.7.0
- **Root fix**: ABI encoding `publicInputs` offset incorrect in deposit/withdraw/swap
  - `buildDepositCalldata`: dynOff `0x160` → `0x180`
  - `buildWithdrawCalldata`: dynOff `0x1e0` → `0x200`
  - `buildPrivateSwapCalldata`: removed extra +32 word

### v10.5.0
- All 17 contract addresses updated from latest.json v2.3.0
- EURC and cirBTC activated (real addresses deployed)

## Architecture

```
src/
  contracts.js   — addresses, selectors, ABI calldata builders
  DApp.jsx       — full DApp (panels, hooks, wallet integration)
  App.jsx        — router (Landing ↔ DApp)
  Landing.jsx    — marketing page
```

## Quick start

```bash
npm install
npm run dev        # local dev
npm run build      # production build
```

Deploy on Vercel — no env vars required (fallback addresses built-in).
