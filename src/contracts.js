// ════════════════════════════════════════════════════════════════════════════
//  PrivARC — Contract Config
//  Deployed: 2026-06-06 | Arc Testnet (chainId: 5042002)
//  Source:   deployments/latest.json
// ════════════════════════════════════════════════════════════════════════════

export const CONTRACTS = {
  USDC:                "0x3600000000000000000000000000000000000000",
  CCTP_TokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  Timelock:            "0xcA026AFb4988f42A8b4569Ec16b49bcb73855a0e",
  Governance:          "0x8E98c0Dfa9fdC3D00B8aA7800594Eea0260939b0",
  Staking:             "0xBca9C8cDAbEC170f04Fd5420ef773c28B8F6ff68",
  VerifierZK:          "0x1b2633212B84368C2d489a2708D61596BBFE0070",
  NullifierRegistry:   "0x850371D9850b04284877b37070DaBcbc289E10E8",
  MerkleTreeManager:   "0x94c80e477ed252574C5651f329b503aB7d9bebCe",
  DepositManager:      "0x02627f3fEc7433Dbab18f1C1Dd263C3756b65e16",
  WithdrawalManager:   "0x6CFCfb7024AE055316579411d57763158e47F1D0",
  ShieldedTransfer:    "0xB655050ce92b633f8e28110BD6cafE06B9Cd5714",
  PrivateSwap:         "0x68382E6489C8A64E2591cE177AE854dAbB4D93B1",
  PrivateBridge:       "0x13fe3703540Bf3B5f109Bf7493f738D2F4863875",
  EmergencyController: "0xf46f4457A1eA2B2Eb689C7d478722992C656f218",
  ShieldVault:         "0xB8E4FA0d7597C6458FD2D81Fc091FDDb067FBE8e",
};

// ── Minimal ABIs (function selectors only — no full ABI needed for eth_call) ──

// ERC-20 USDC
export const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// ShieldVault
export const SHIELD_VAULT_ABI = [
  "function totalShielded() view returns (uint256)",
  "function protocolFee() view returns (uint256)",
  "function merkleTree() view returns (address)",
  "function deposit((bytes32 commitment, uint256 denomination, bytes proof) params) returns (uint256 leafIndex, bytes32 merkleRoot)",
  "function withdraw((bytes32 nullifier, bytes32 root, address recipient, address relayer, uint256 relayerFee, uint256 amount, bytes proof) params) returns (bool)",
];

// MerkleTreeManager
export const MERKLE_ABI = [
  "function nextLeafIndex() view returns (uint256)",
  "function getLastRoot() view returns (bytes32)",
];

// EmergencyController
export const EMERGENCY_ABI = [
  "function pauseState() view returns (uint8)",   // 0=ACTIVE 1=PAUSED 2=EMERGENCY
  "function currentWindowVolume() view returns (uint256)",
  "function CIRCUIT_BREAKER_THRESHOLD() view returns (uint256)",
];

// Staking
export const STAKING_ABI = [
  "function stake(uint256 amount, uint256 lockDays) returns (bool)",
  "function unstake(uint256 amount) returns (bool)",
  "function stakedBalance(address user) view returns (uint256)",
  "function pendingRewards(address user) view returns (uint256)",
  "function claimRewards() returns (uint256)",
];

// ── ABI encoding helpers (no ethers.js dependency — raw hex encoding) ────────

// keccak256 of function signature → first 4 bytes (selector)
// Pre-computed selectors for the functions we call:
export const SELECTORS = {
  // ERC-20
  balanceOf:         "0x70a08231", // balanceOf(address)
  approve:           "0x095ea7b3", // approve(address,uint256)
  allowance:         "0xdd62ed3e", // allowance(address,address)
  // ShieldVault
  totalShielded:     "0x3ffc1591", // totalShielded()
  protocolFee:       "0x1d1b3464", // protocolFee()
  // MerkleTreeManager
  nextLeafIndex:     "0x5b62e9a2", // nextLeafIndex()
  getLastRoot:       "0x47ef5c1c", // getLastRoot()
  // EmergencyController
  pauseState:        "0x9a1d40a1", // pauseState()
  currentWindowVol:  "0xd8c9b4e7", // currentWindowVolume()
  cbThreshold:       "0x2e82a2e0", // CIRCUIT_BREAKER_THRESHOLD()
  // Staking
  stakedBalance:     "0x49f4a614", // stakedBalance(address)
  pendingRewards:    "0x8d54c2b1", // pendingRewards(address)
};

// Encode address as 32-byte padded hex (for eth_call data)
export const encodeAddress = (addr) =>
  "000000000000000000000000" + addr.toLowerCase().replace("0x", "");

// Encode uint256 as 32-byte padded hex
export const encodeUint256 = (n) =>
  BigInt(n).toString(16).padStart(64, "0");

// Decode uint256 from eth_call result
export const decodeUint256 = (hex) =>
  hex && hex !== "0x" ? BigInt(hex) : 0n;

// Decode uint8 (enum) from eth_call result
export const decodeUint8 = (hex) =>
  hex && hex !== "0x" ? parseInt(hex, 16) : 0;
