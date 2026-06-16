# PrivARC OS — v11.1.0

Confidential on-chain capital management built on **Arc Testnet** (Circle L1, USDC native gas).  
Aligned with the [Arc Privacy Sector whitepaper](https://www.arc.io/privacy-whitepaper) — **Governed Visibility**, not anonymity.

---

## Deployed contracts — Arc Testnet (v2.3.1 — 2026-06-15)

| Contract            | Address                                      |
|---------------------|----------------------------------------------|
| USDC (native)       | `0x3600000000000000000000000000000000000000` |
| EURC                | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC              | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |
| CCTP_TokenMessenger | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| Timelock            | `0x8DF7C02012EBec968bdEc100F4fEAF772AcAab99` |
| Governance          | `0x89F08E2BBc963e48986D8A0FfA23858bA643C78A` |
| Staking             | `0x80C8247e602D78da93f318862B3d14026Be03505` |
| MockVerifierZK      | `0x83a34C5997c58c36A60855879ae24CC440430181` |
| NullifierRegistry   | `0xAbaADa4ac464f4D9f9195a874c9121FC0A53b212` |
| MerkleTreeManager   | `0x175C61212679376F0c210C1a5c4aC3A5E87fB372` |
| DepositManager      | `0xdd31d70c2Ce1B5b33Fe016569FEF99CeC8cAE34D` |
| WithdrawalManager   | `0x1b81a4d05851C423B81344Abe5693428e3914250` |
| ShieldedTransfer    | `0xa880603916611a0e624f9A04c7f08b62f0532543` |
| PrivateSwap         | `0xd16F252FFc0a406dFcF58eBAF7EA49f9e1DF78Eb` |
| PrivateBridge       | `0x1C22eEb6c422BeF73B335e1E5668ec3109839B40` |
| EmergencyController | `0xa788E96DcF4dBf348995bc5b8D0C7BbaD8e5e88F` |
| ShieldVault         | `0xDC920361131AddeC15A04070052169E941ae8D02` |

Deployer / treasury: `0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894`

---

## Network

| Field     | Value                             |
|-----------|-----------------------------------|
| Chain ID  | 5042002                           |
| Gas token | USDC (ERC-20, 6 dec)              |
| RPC       | https://rpc.testnet.arc.network   |
| Explorer  | https://testnet.arcscan.app       |
| Faucet    | https://faucet.circle.com (1 USDC/day) |

---

## Feature status

| Panel             | Status | Notes |
|-------------------|--------|-------|
| Shield            | ✅ | Deposit USDC/EURC/cirBTC — 0.03 USDC protocol fee per deposit |
| Withdraw          | ✅ | Unshield to any public address — governed visibility |
| Confidential Send | ✅ | Shielded ZK transfer — receipt copied to clipboard |
| Public Send       | ✅ | Direct USDC transfer |
| Confidential Swap | ✅ | Arc StableFX (USDC↔EURC↔USYC) + Uniswap routing (pending Arc deployment) |
| Bridge            | ✅ | Circle App Kit + CCTP v2 — recipient governed visibility |
| Portfolio         | ✅ | Live USDC + EURC + cirBTC balances + shielded notes |
| Staking           | ✅ | 7/30/90/180d lock, positions per wallet, claim rewards |
| Analytics         | ✅ | Live TVL + 24h stats + protocol fees (eth_getLogs + contract reads, 30s refresh) |
| Tx History        | ✅ | Persistent per wallet (localStorage keyed by address) |
| Shielded Wallet   | ✅ | Per-wallet notes, on-chain deposit reconciliation, singleton at root |

---

## Protocol fees (v2.3.1)

- **0.03 USDC** fixed fee per deposit, collected by `ShieldVault.feesCollectedByToken`
- Claimable by deployer or treasury via `ShieldVault.withdrawFees(token)`
- Visible in real-time in Analytics → Protocol Fees panel
- Fee rate can be updated by governance (max 1%)

---

## Privacy model — Arc Privacy Sector aligned

PrivARC implements **Governed Visibility** as defined in the Arc Privacy Sector whitepaper:

| Layer | What's visible | What's private |
|-------|---------------|----------------|
| Deposit | Amount + ShieldVault address | Depositor link to withdrawal |
| Shielded Send | Merkle root update | Sender, recipient, amount |
| Withdraw | Amount + recipient | Link to original deposit |
| Bridge | Amount + destination chain | Recipient address |

EIP-712 authorized view keys planned for Q4 2026 (see roadmap).

---

## Architecture

```
src/
  contracts.js   — addresses, ABI selectors, calldata builders
  DApp.jsx       — full DApp (~3400 lines): panels, hooks, wallet integration
  App.jsx        — router (Landing ↔ DApp) + ErrorBoundary
  Landing.jsx    — marketing / landing page
```

### Key hooks
| Hook | Purpose |
|------|---------|
| `useShieldedBalances(prices, address)` | Wallet-scoped notes + on-chain reconciliation |
| `useProtocolStats(onArc)` | Live TVL, commitments, vault status (10s poll) |
| `useTxSend(...)` | Sends tx, waits receipt, updates persisted txHistory |

### Data isolation per wallet
All localStorage keys are scoped by address:
- `privarc_notes_{address}` — shielded notes
- `privarc_txhistory_{address}` — tx history
- `privarc_stakes_{address}` — staking positions
- `privarc_protocol_fees` — global (protocol-wide)

---

## Swap routing

| Route | Status | Pairs |
|-------|--------|-------|
| Arc StableFX | ✅ Live (testnet: address(0)) | USDC / EURC / USYC |
| Uniswap V3   | ⏳ Pending Arc deployment | All ERC-20 pairs |

Addresses will be updated in `contracts.js` when Circle/Arc publishes them.

---

## Bridge

Powered by **Circle App Kit** + **CCTP v2**.
- [Circle CCTP docs](https://developers.circle.com/stablecoins/cctp-getting-started)
- [Circle App Kit](https://developers.circle.com/w3s/circle-app-kit)
- Arc Testnet: CCTP attestation pending mainnet activation

---

## Quick start

```bash
npm install
npm run dev        # local dev
npm run build      # production build (no env vars required)
```

Deploy on Vercel — fallback addresses built-in, no env vars required.

---

## Contracts — deploy / fix

```bash
cd privarc-contracts-v2
cp .env.example .env   # add DEPLOYER_PRIVATE_KEY

npm run deploy:testnet  # full redeploy
npm run fix:testnet     # add missing tokens without redeploy
npm run verify          # register on ARCScan
```

---

## Changelog

### v12.0.0
- **ECIES Stealth Notes**: encrypted note embedded in `shieldedSendWithNote` tx — recipient auto-decrypts on wallet connect
- **Arc StableFX swap route** + Uniswap V3 placeholder (pending Arc deployment)
- **Circle App Kit + CCTP v2** bridge banner with docs links
- **Protocol fees**: 0.03 USDC/deposit, live read from `feesCollectedByToken`, `withdrawFees()` for treasury
- **Analytics**: fees read directly from contract state (not getLogs fromBlock:0x0), 30s refresh
- **13 new contract addresses** (Arc Testnet deployment 2026-06-15)
- All version strings updated to v12.0.0

### v11.1.0
- **Protocol fees**: 0.03 USDC/deposit collected on-chain (`feesCollectedByToken`)
- **ShieldVault.withdrawFees(token)**: deployer/treasury can claim fees
- **Analytics**: fees read directly from contract state (not getLogs), 30s refresh, live breakdown USDC/EURC
- **Swap**: Arc StableFX route selector + Uniswap V3 placeholder (pending Arc)
- **Bridge**: Circle App Kit + CCTP v2 banner with docs links

### v11.0.0
- AnalyticsPanel: full defensive rewrite — all NaN/undefined crashes eliminated
- Protocol Fees section: all-time volume + tx count + fees (persistent + live)
- BigInt float-string crash fixed in `useShieldedBalances`
- WithdrawPanel/BridgePanel: `notes.length` → `bals.noteCount` (undefined fix)

### v10.14.0
- Arc Privacy Sector whitepaper alignment — "Governed Visibility" terminology
- Roadmap updated with Arc Private EVM milestones

### v10.13.0
- Wallet-scoped notes/txHistory (isolation per address)
- On-chain deposit reconciliation via eth_getLogs at connect

### v10.12.0
- ShieldedWallet singleton (no flash on panel navigation)
- All technical leakage removed from UI

### v10.11.0
- Staking: buildStakeCalldata accepts seconds directly (was doubling duration)
- ErrorBoundary in App.jsx (black screen prevention)

### v10.7.0
- ABI encoding fix: publicInputs offset — deposit/withdraw/swap calldatas
