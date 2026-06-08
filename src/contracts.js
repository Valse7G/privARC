// ════════════════════════════════════════════════════════════════════════════
//  PrivARC OS — Contract Config v2.2.0 (audited)
//  Addresses auto-loaded from: ../privarc-contracts-v2/deployments/latest.json
//
//  WORKFLOW:
//    1. cd privarc-contracts-v2 && npm run deploy:testnet
//       → writes deployments/latest.json with all contract addresses
//    2. cd ../privarc-v10 && npm run dev
//       → Vite resolves the JSON import at build time — no manual copy needed
//
//  For manual override (e.g. Vercel CI without access to contracts repo),
//  set VITE_OVERRIDE_CONTRACTS=true and define each address as a VITE_ env var.
//
//  Fallback addresses last synced: 2026-06-08 (latest.json v2.1.0 — Arc Testnet)
// ════════════════════════════════════════════════════════════════════════════

export const ARC_CHAIN_ID = 5042002;

// ── Load addresses from latest.json or VITE_ env overrides ───────────────────
let _deployment;

try {
  // Vite resolves this JSON import at build time (static analysis).
  // Path is relative to this file: src/ → ../privarc-contracts-v2/deployments/
  _deployment = (await import("../../privarc-contracts-v2/deployments/latest.json")).default;
} catch {
  // Fallback: last known testnet deployment (manual override)
  // Update these when deploying to a new environment without the contracts monorepo.
  console.warn("[contracts.js] Could not load latest.json — using fallback addresses");
  _deployment = {
    contracts: {
      ShieldVault:         import.meta.env.VITE_SHIELD_VAULT         ?? "0x0352A0cAAEA755e0D1D6c4040c084eA731b5D454",
      Timelock:            import.meta.env.VITE_TIMELOCK              ?? "0x3a9BeAA75bd8b4f975C29AA78744834531E16799",
      Governance:          import.meta.env.VITE_GOVERNANCE            ?? "0x70F71a1CB248Dd900f3d7D39C4a4a54BA5d986d0",
      Staking:             import.meta.env.VITE_STAKING               ?? "0x6841c7A3938791DDFDB90f31acC7072F7B1c967A",
      NullifierRegistry:   import.meta.env.VITE_NULLIFIER_REGISTRY    ?? "0x28AFBbd86841f6eb2A219F4f8Ff69c577F30ADE1",
      MerkleTreeManager:   import.meta.env.VITE_MERKLE_TREE_MANAGER   ?? "0x80333Bf880b28A98b5206216edc4a8Cde0958979",
      DepositManager:      import.meta.env.VITE_DEPOSIT_MANAGER       ?? "0xFabE444BC5231a7cdF61f4346321517aF82162F7",
      WithdrawalManager:   import.meta.env.VITE_WITHDRAWAL_MANAGER    ?? "0xb37Ade468163FE3dCBB39ba1343651d7499dB3a2",
      ShieldedTransfer:    import.meta.env.VITE_SHIELDED_TRANSFER     ?? "0x3C821bd2d510170b11Dc049D5CE988B605Fc1658",
      PrivateSwap:         import.meta.env.VITE_PRIVATE_SWAP          ?? "0x01A06c330d9baEA60C5fc9D9b0AA2510E90C77dA",
      PrivateBridge:       import.meta.env.VITE_PRIVATE_BRIDGE        ?? "0xF5206339d4E6c9712Ec4570A762a04E2fCdA44B0",
      EmergencyController: import.meta.env.VITE_EMERGENCY_CONTROLLER  ?? "0xc44B286E65bAa36597980e48E879d317f954B94E",
      MockVerifierZK:      import.meta.env.VITE_VERIFIER_ZK           ?? "0x8569c0D493c837A7618164DC8DE5BaF68C36e736",
    },
  };
}

const _c = _deployment.contracts;

// ── Deployed contract addresses ───────────────────────────────────────────────
export const CONTRACTS = {
  // Tokens (static — not deployed by us, part of Arc/Circle infrastructure)
  USDC:                "0x3600000000000000000000000000000000000000",
  EURC:                "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  cirBTC:              "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  CCTP_TokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  // Deployed by privarc-contracts (auto-loaded from latest.json)
  ShieldVault:         _c.ShieldVault,
  Timelock:            _c.Timelock,
  Governance:          _c.Governance,
  Staking:             _c.Staking,
  NullifierRegistry:   _c.NullifierRegistry,
  MerkleTreeManager:   _c.MerkleTreeManager,
  DepositManager:      _c.DepositManager,
  WithdrawalManager:   _c.WithdrawalManager,
  ShieldedTransfer:    _c.ShieldedTransfer,
  PrivateSwap:         _c.PrivateSwap,
  PrivateBridge:       _c.PrivateBridge,
  EmergencyController: _c.EmergencyController,
  MockVerifierZK:      _c.MockVerifierZK,   // key matches latest.json "MockVerifierZK"
};

// ── Supported tokens config ───────────────────────────────────────────────────
export const TOKENS = {
  USDC: {
    address:    CONTRACTS.USDC,
    symbol:     "USDC",
    name:       "USD Coin",
    decimals:   6,
    minDeposit: 1_000_000n,        // 1 USDC
    minDisplay: "1 USDC",
    color:      "#2775CA",
    logo:       "💵",
  },
  EURC: {
    address:    CONTRACTS.EURC,
    symbol:     "EURC",
    name:       "Euro Coin",
    decimals:   6,
    minDeposit: 1_000_000n,        // 1 EURC
    minDisplay: "1 EURC",
    color:      "#003087",
    logo:       "💶",
  },
  cirBTC: {
    address:    CONTRACTS.cirBTC,
    symbol:     "cirBTC",
    name:       "Canonical BTC",
    decimals:   8,
    minDeposit: 10_000n,           // 0.0001 cirBTC
    minDisplay: "0.0001 cirBTC",
    color:      "#F7931A",
    logo:       "₿",
  },
};

export const TOKEN_LIST = Object.values(TOKENS);

// ── Verified keccak256 selectors ──────────────────────────────────────────────
export const SEL = {
  // ERC-20
  balanceOf:          "0x70a08231",  // balanceOf(address)
  approve:            "0x095ea7b3",  // approve(address,uint256)
  allowance:          "0xdd62ed3e",  // allowance(address,address)
  // ShieldVault v2
  totalShielded:      "0x6d7f2685",  // totalShielded(address)
  // MerkleTreeManager
  nextLeafIndex:      "0x0be4f422",  // nextLeafIndex()
  getLastRoot:        "0xba70f757",  // getLastRoot()
  // EmergencyController
  pauseState:         "0xd7118351",  // pauseState()
  currentWindowVol:   "0xf09b96b6",  // currentWindowVolume()
  cbThreshold:        "0x0ca55cd7",  // CIRCUIT_BREAKER_THRESHOLD()
  depositsAllowed:    "0x8f76137f",  // depositsAllowed()
  withdrawalsAllowed: "0x4843b358",  // withdrawalsAllowed()
  adminReset:         "0x8c5b9b00",  // adminReset()
  // DepositManager v2
  isTokenSupported:   "0x75151b63",  // isTokenSupported(address)
  getSupportedTokens: "0xd3c7c2c7",  // getSupportedTokens()
  minDeposit:         "0x3c29f839",  // minDeposit(address)
  // Staking
  stake:              "0x7b0472f0",  // stake(uint256,uint256)
  unstake:            "0x2e17de78",  // unstake(uint256)
  claimRewards:       "0x372500ab",  // claimRewards()
  previewRewards:     "0xf166e920",  // previewRewards(address)
};

// ── ABI encoding helpers ──────────────────────────────────────────────────────
export const encodeAddress = (addr) =>
  "000000000000000000000000" + addr.toLowerCase().replace("0x", "");

export const encodeUint256 = (n) =>
  BigInt(n).toString(16).padStart(64, "0");

export const decodeUint256 = (hex) =>
  hex && hex !== "0x" && hex.length > 2 ? BigInt(hex) : 0n;

export const decodeUint8 = (hex) =>
  hex && hex !== "0x" && hex.length > 2 ? parseInt(hex.slice(-64), 16) : 0;

export const formatToken = (amount, decimals, precision = 4) => {
  if (amount === null || amount === undefined) return "—";
  const n = Number(BigInt(amount)) / Math.pow(10, decimals);
  return n.toLocaleString("en-US", { maximumFractionDigits: precision });
};

// ── Deposit calldata builder ──────────────────────────────────────────────────
// ShieldVault.deposit(DepositParams) — v2.1.0
//
// Arc Testnet: USDC = native gas token at 0x3600...0000
//   → deposit() is now payable; msg.value = amount * 1e12 (6-dec → 18-dec wei)
//   → For EURC/cirBTC: standard ERC-20, value = "0x0"
//
// MockVerifierZK accepts any proof → BN254 generator points (1,2) are fine
//
// Returns: { data: string, value: string } — both needed for buildTx()

const NATIVE_USDC = "0x3600000000000000000000000000000000000000";
const NATIVE_TO_ERC20_SHIFT = BigInt(1e12); // 10^(18-6)

export function buildDepositCalldata(commitment, tokenAddress, amount) {
  const P1x = "0000000000000000000000000000000000000000000000000000000000000001";
  const P1y = "0000000000000000000000000000000000000000000000000000000000000002";
  const P2x0= "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2";
  const P2x1= "1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed";
  const P2y0= "090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b";
  const P2y1= "12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa";

  const comm32  = commitment.replace("0x","").padStart(64,"0");
  const token32 = encodeAddress(tokenAddress);
  const amt32   = encodeUint256(amount);

  // ABI encode struct with dynamic publicInputs array
  // [0]  commitment    bytes32
  // [1]  token         address (32-byte padded)
  // [2]  amount        uint256
  // [3-4] proof.a      uint256[2]
  // [5-8] proof.b      uint256[2][2]
  // [9-10] proof.c     uint256[2]
  // [11]  offset to publicInputs = 352 = 0x160
  // [12]  publicInputs.length = 1
  // [13]  publicInputs[0] = commitment as uint256

  const selector  = "0xbd673975"; // deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))
  const dynOffset = "0000000000000000000000000000000000000000000000000000000000000160";

  const data = selector
    + "0000000000000000000000000000000000000000000000000000000000000020"
    + comm32
    + token32
    + amt32
    + P1x + P1y
    + P2x0 + P2x1
    + P2y0 + P2y1
    + P1x + P1y
    + dynOffset
    + "0000000000000000000000000000000000000000000000000000000000000001"
    + comm32;

  // Native USDC: msg.value = amount (6-dec) * 1e12 → wei (18-dec)
  const isNative = tokenAddress.toLowerCase() === NATIVE_USDC.toLowerCase();
  const value    = isNative
    ? "0x" + (BigInt(amount) * NATIVE_TO_ERC20_SHIFT).toString(16)
    : "0x0";

  return { data, value };
}

// ── Approve helper — skip for NATIVE_USDC (no ERC-20 approve needed for native token) ──
export function buildApproveCalldata(spender, amount) {
  return SEL.approve + encodeAddress(spender) + encodeUint256(amount);
}

// FIX F-06: Returns whether an approve() step is needed before deposit
// Native USDC uses msg.value — no transferFrom, no approve required
export function needsApproveBeforeDeposit(tokenAddress) {
  return tokenAddress.toLowerCase() !== NATIVE_USDC.toLowerCase();
}

// FIX F-03: lockDays must be converted to seconds — Staking.sol uses LOCK_7D = 604800 (seconds)
// Previous bug: passing lockDays=7 instead of 604800 → revert InvalidLockDuration
export function buildStakeCalldata(amount, lockDays) {
  const lockSeconds = BigInt(lockDays) * 86400n; // days → seconds
  return SEL.stake + encodeUint256(amount) + encodeUint256(lockSeconds);
}
