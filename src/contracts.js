// ════════════════════════════════════════════════════════════════════════════
//  PrivARC OS — Contract Config v2.0.0
//  Deployed : 2026-06-07T19:10:01Z | Arc Testnet (chainId: 5042002)
//  Version  : 2.1.0 — native USDC deposit via msg.value (Arc Testnet fix)
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
  Timelock:            "0x6e6ab9FE36b25FDFbd325cBFA00C32a8548418b7",
  Governance:          "0x483222457b41D7005A94475a29EaD6bBd7E6DC66",
  Staking:             "0x4D4bB6840B38d734E2f292bB8254C2bb9a85AbA6",
  // ZK Infrastructure
  MockVerifierZK:      "0x4778bb7EE307f878fbeBe5eB6E90314011344Db7",
  NullifierRegistry:   "0xF19304271c1DFC42CD09861a091FC07797dFBC63",
  MerkleTreeManager:   "0x39F21d3Bd4Fe0b4BAf0ec3e8006463f334BC2a27",
  // Operation Modules
  DepositManager:      "0x3cA7B7dB9eA4d786EeaaC7C83A5517AC3DC9760f",
  WithdrawalManager:   "0x4aB69086B8aBFEd195cFF691eF9CedE31c6FB5eb",
  ShieldedTransfer:    "0x2FB186ac176D5236da3306Bd78A19D5a184d9D77",
  PrivateSwap:         "0x7B75DBdc6061F0764e1D5E2D7B35df364e9EDF11",
  PrivateBridge:       "0x7851122956a4f9f693aE6bF26dC76C0372AccAF6",
  EmergencyController: "0xDd4A1772Da9C21F6ac994EA126a765993Cf8935b",
  ShieldVault:         "0xB9Ce42924B736C51245374550a0498C0218d8B70",
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

export function buildApproveCalldata(spender, amount) {
  return SEL.approve + encodeAddress(spender) + encodeUint256(amount);
}

export function buildStakeCalldata(amount, lockDays) {
  return SEL.stake + encodeUint256(amount) + encodeUint256(lockDays);
}
