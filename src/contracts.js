// ════════════════════════════════════════════════════════════════════════════
//  PrivARC OS — Contract Config v2.0.0
//  Deployed : 2026-06-07T16:03:16Z | Arc Testnet (chainId: 5042002)
//  Version  : 2.0.0 — multi-token (USDC, EURC, cirBTC), free-amount deposits
// ════════════════════════════════════════════════════════════════════════════

export const ARC_CHAIN_ID = 5042002;

// ── Deployed contract addresses ───────────────────────────────────────────────
export const CONTRACTS = {
  // Tokens
  USDC:                "0x3600000000000000000000000000000000000000",
  EURC:                "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  cirBTC:              "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  CCTP_TokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  // Governance
  Timelock:            "0x156eA35D3352FfbEF2F295406884C215A83228f8",
  Governance:          "0x0e374e28B5eD7f6169F4Bb16E4062Da68F59F5Bd",
  Staking:             "0x7738A1Bb06A0Ce548781ec20Ed15996F2017836D",
  // ZK Infrastructure
  MockVerifierZK:      "0xE3dC06e296364e7957697A47CC49Df24515B28E1",
  NullifierRegistry:   "0x951e656a9f482616a3423b293bB53aB512528426",
  MerkleTreeManager:   "0xD096a30e29Ea51f0Dd6feD4f35A27b3ADe8360Cb",
  // Operation Modules
  DepositManager:      "0x738a8665EbF79924B5A9bcEa2E97Ad8A3C14211e",
  WithdrawalManager:   "0xBAf9c787600964E508B58a4103C912EdD4f72C75",
  ShieldedTransfer:    "0xE36Cd98d6912F37d4A503d0E2ca4897B0dC96A12",
  PrivateSwap:         "0xFf06325E6fAA3b43C9e01A3Ed580E5AcafF45604",
  PrivateBridge:       "0x91af1c5621fc77c71DBD2d1bFD209ce773c4b890",
  EmergencyController: "0x8C177328092Ffc4937Ae4334869c6B1F767a9Ae3",
  ShieldVault:         "0x7dCECab394A4483337c64A26239A0C79b99Be079",
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
// ShieldVault.deposit(DepositParams) where DepositParams:
//   bytes32 commitment, address token, uint256 amount,
//   Proof proof{uint256[2],uint256[2][2],uint256[2]}, uint256[] publicInputs
//
// MockVerifierZK accepts any proof → use BN254 generator G1=(1,2), G2 standard
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
  // Slot offsets from start of tuple data:
  // [0]  commitment    bytes32  (32 bytes)
  // [1]  token         address  (32 bytes, padded)
  // [2]  amount        uint256  (32 bytes)
  // [3]  proof.a[0]   uint256
  // [4]  proof.a[1]   uint256
  // [5]  proof.b[0][0]
  // [6]  proof.b[0][1]
  // [7]  proof.b[1][0]
  // [8]  proof.b[1][1]
  // [9]  proof.c[0]
  // [10] proof.c[1]
  // [11] offset to publicInputs  = 11 * 32 = 352 = 0x160
  // [12] publicInputs.length = 1
  // [13] publicInputs[0] = commitment as uint256

  const selector = "0xbd673975"; // deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))
  const dynOffset = "0000000000000000000000000000000000000000000000000000000000000160"; // 352

  return selector
    + "0000000000000000000000000000000000000000000000000000000000000020" // offset to struct
    + comm32   // commitment
    + token32  // token (address, 32-byte padded)
    + amt32    // amount
    + P1x + P1y          // proof.a
    + P2x0 + P2x1        // proof.b[0]
    + P2y0 + P2y1        // proof.b[1]
    + P1x + P1y          // proof.c
    + dynOffset          // offset to publicInputs
    + "0000000000000000000000000000000000000000000000000000000000000001" // length=1
    + comm32;            // publicInputs[0] = commitment
}

export function buildApproveCalldata(spender, amount) {
  return SEL.approve + encodeAddress(spender) + encodeUint256(amount);
}

export function buildStakeCalldata(amount, lockDays) {
  return SEL.stake + encodeUint256(amount) + encodeUint256(lockDays);
}
