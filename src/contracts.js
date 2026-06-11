// ════════════════════════════════════════════════════════════════════════════
//  PrivARC OS — Contract Config v3.1.0
//
//  Addresses synced with latest.json v2.3.0 — Arc Testnet — 2026-06-09
//  Deployer: 0x1Dc72450B3e2782AcD669D7C27073f2C8F2c9894
//
//  ADDRESSES: sourced from VITE_ env vars (Vercel) or hardcoded fallbacks
// ════════════════════════════════════════════════════════════════════════════

export const ARC_CHAIN_ID = 5042002;

// ── Contract addresses ────────────────────────────────────────────────────────
const _c = {
  ShieldVault:         import.meta.env.VITE_SHIELD_VAULT         ?? "0x9D90f31a7E848A9b23Bc74f29ec6DDD49fAd2eed",
  Timelock:            import.meta.env.VITE_TIMELOCK              ?? "0x610Ac4c608BDa6d7a7c9EE92E80E636dA693C9C1",
  Governance:          import.meta.env.VITE_GOVERNANCE            ?? "0xd90450f078B0ae9a2bcb6fC9ce91bbB577761aaa",
  Staking:             import.meta.env.VITE_STAKING               ?? "0x7020421318F41F9A11Ba25a19Ee59Da652a775Cf",
  NullifierRegistry:   import.meta.env.VITE_NULLIFIER_REGISTRY    ?? "0xFA80cB08e92323ABb6110d2A5E3f0CBa228BFFc2",
  MerkleTreeManager:   import.meta.env.VITE_MERKLE_TREE_MANAGER   ?? "0x5Ab317C4bb24a2CD3Fa79Fe85AfA52C4A32462B0",
  DepositManager:      import.meta.env.VITE_DEPOSIT_MANAGER       ?? "0x3f59AC80EA087cC08D85c40aA29335ed57E64032",
  WithdrawalManager:   import.meta.env.VITE_WITHDRAWAL_MANAGER    ?? "0x15244f75dE6221D3E290740dEd52Ec3217C8EC5D",
  ShieldedTransfer:    import.meta.env.VITE_SHIELDED_TRANSFER     ?? "0xbBf614Dd567A98d8879b68Ebc3b9F34aC8732CF6",
  PrivateSwap:         import.meta.env.VITE_PRIVATE_SWAP          ?? "0xa091603CfDDf533937aB68DF55E9295F9aAd38d1",
  PrivateBridge:       import.meta.env.VITE_PRIVATE_BRIDGE        ?? "0x7f7688BD2a53B653C670A0552d8674a909Bd3d9F",
  EmergencyController: import.meta.env.VITE_EMERGENCY_CONTROLLER  ?? "0x7eCAfef63ad0a2Fb3734843AeeF275ACDC216b1F",
  MockVerifierZK:      import.meta.env.VITE_VERIFIER_ZK           ?? "0xF9cC4B19d76709ec33087224f876c4834978f3AD",
};

export const CONTRACTS = {
  // Arc / Circle infrastructure — static
  USDC:                "0x3600000000000000000000000000000000000000",
  // EURC: official Arc Testnet address not yet published by Circle.
  // Set VITE_EURC_ADDRESS in Vercel env vars once Circle deploys on Arc.
  // Until then bridge panel will show a clear error (cannot approve native USDC).
  // EURC + cirBTC — real addresses from latest.json v2.3.0 (Arc Testnet, 2026-06-09)
  EURC:                import.meta.env.VITE_EURC_ADDRESS   ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  cirBTC:              import.meta.env.VITE_CIRBTC_ADDRESS ?? "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  CCTP_TokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  // Deployed by PrivARC
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
  MockVerifierZK:      _c.MockVerifierZK,
};

// ── Token config ──────────────────────────────────────────────────────────────
export const TOKENS = {
  USDC: {
    address:    CONTRACTS.USDC,
    symbol:     "USDC",
    name:       "USD Coin",
    decimals:   6,
    minDeposit: 1_000_000n,   // 1 USDC
    minDisplay: "1 USDC",
    color:      "#2775CA",
    logo:       "💵",
    isNative:   true,         // ← native gas token on Arc Testnet
  },
  EURC: {
    address:    CONTRACTS.EURC,
    symbol:     "EURC",
    name:       "Euro Coin",
    decimals:   6,
    minDeposit: 1_000_000n,
    minDisplay: "1 EURC",
    color:      "#003087",
    logo:       "💶",
    isNative:   false,
    deployed:   true,  // confirmed: 0x89B508... (latest.json v2.3.0)
  },
  cirBTC: {
    address:    CONTRACTS.cirBTC,
    symbol:     "cirBTC",
    name:       "Canonical BTC",
    decimals:   8,
    minDeposit: 10_000n,
    minDisplay: "0.0001 cirBTC",
    color:      "#F7931A",
    logo:       "₿",
    isNative:   false,
    deployed:   true,  // confirmed: 0xf0C4a4... (latest.json v2.3.0)
  },
};

export const TOKEN_LIST = Object.values(TOKENS);

// ── Native USDC constants ─────────────────────────────────────────────────────
// Arc Testnet: USDC is the native gas token.
// eth_getBalance returns wei (18 dec). ERC-20 interface uses 6 dec.
// Conversion: display_usdc = native_wei / 1e12
export const NATIVE_USDC        = "0x3600000000000000000000000000000000000000";
export const NATIVE_TO_ERC20    = BigInt("1000000000000"); // 10^12

// ── Function selectors ────────────────────────────────────────────────────────
// Computed with: keccak256(functionSignature).slice(0,4)
// Struct types are inlined per ABI spec (IModules.sol)
//
// IVerifierZK.Proof = (uint256[2],uint256[2][2],uint256[2])
//
// DepositParams    = (bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[])
// deposit(DepositParams) →
//   deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))
//
// WithdrawalParams = ((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,address,uint256,uint256,address,uint256[])
// withdraw(WithdrawalParams) →
//   withdraw(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,address,uint256,uint256,address,uint256[]))
//
// TransferParams   = (bytes32[],(uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32[],uint256[])
// shieldedSend(TransferParams) →
//   shieldedSend((bytes32[],(uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32[],uint256[]))
//
// SwapParams       = ((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,bytes32,address,address,uint256,uint256,uint256,address,bytes,uint256[])
// privateSwapExec(SwapParams) →
//   privateSwapExec(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,bytes32,address,address,uint256,uint256,uint256,address,bytes,uint256[]))
//
// BridgeParams     = ((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,uint32,address,uint256,bytes32,uint256,uint256[])
// privateBridgeExec(BridgeParams) →
//   privateBridgeExec(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,uint32,address,uint256,bytes32,uint256,uint256[]))

export const SEL = {
  // ERC-20
  balanceOf:          "0x70a08231",  // balanceOf(address)
  approve:            "0x095ea7b3",  // approve(address,uint256)
  allowance:          "0xdd62ed3e",  // allowance(address,address)
  transfer:           "0xa9059cbb",  // transfer(address,uint256)

  // ShieldVault v2.2 — computed from IModules.sol struct ABI signatures
  // NOTE: These selectors are computed from the EXACT function signatures.
  // If deployment reverts with "function not found", verify with:
  //   cast sig "deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))"
  deposit:            "0xbd673975",  // deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))
  withdraw:           "0x3dd75908",  // withdraw(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,address,address,uint256,uint256,address,uint256[]))
  shieldedSend:       "0x5635a2e7",  // shieldedSend((bytes32[],(uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32[],uint256[]))
  privateSwapExec:    "0x49fa2a6e",  // privateSwapExec(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,bytes32,address,address,uint256,uint256,uint256,address,bytes,uint256[]))
  privateBridgeExec:  "0x8fa6444e",  // privateBridgeExec(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,uint32,address,uint256,bytes32,uint256,uint256[]))

  // ShieldVault views
  totalShielded:      "0x6d7f2685",  // totalShielded(address)
  totalShieldedUSDC:  "0x37b12e9e",  // totalShieldedUSDC()

  // MerkleTreeManager
  nextLeafIndex:      "0x0be4f422",  // nextLeafIndex()
  getLastRoot:        "0xba70f757",  // getLastRoot()
  isKnownRoot:        "0x6d9833e3",  // isKnownRoot(bytes32)

  // EmergencyController
  pauseState:         "0xd7118351",  // pauseState()
  depositsAllowed:    "0x8f76137f",  // depositsAllowed()
  withdrawalsAllowed: "0x4843b358",  // withdrawalsAllowed()
  transfersAllowed:   "0xb0660c3d",  // transfersAllowed()
  adminReset:         "0x8c5b9b00",  // adminReset()

  // DepositManager
  isTokenSupported:   "0x75151b63",  // isTokenSupported(address)
  getSupportedTokens: "0xd3c7c2c7",  // getSupportedTokens()
  minDeposit:         "0x3c29f839",  // minDeposit(address)

  // Staking
  stake:              "0x7b0472f0",  // stake(uint256,uint256)
  unstake:            "0x2e17de78",  // unstake(uint256)
  claimRewards:       "0x372500ab",  // claimRewards()
  previewRewards:     "0xf166e920",  // previewRewards(address)
  previewRewards:     "0xf166e920",  // previewRewards(address)
};

// ── ABI encoding primitives ───────────────────────────────────────────────────
export const encodeAddress = (addr) =>
  "000000000000000000000000" + addr.toLowerCase().replace("0x", "");

export const encodeUint256 = (n) =>
  BigInt(n).toString(16).padStart(64, "0");

export const encodeUint32 = (n) =>
  Number(n).toString(16).padStart(64, "0");

export const encodeBytes32 = (hex) =>
  hex.replace("0x", "").padEnd(64, "0");

export const decodeUint256 = (hex) =>
  hex && hex !== "0x" && hex.length > 2 ? BigInt(hex) : 0n;

export const decodeUint8 = (hex) =>
  hex && hex !== "0x" && hex.length > 2 ? parseInt(hex.slice(-64), 16) : 0;

export const formatToken = (amount, decimals, precision = 4) => {
  if (amount === null || amount === undefined) return "—";
  const n = Number(BigInt(amount)) / Math.pow(10, decimals);
  return n.toLocaleString("en-US", { maximumFractionDigits: precision });
};

// ── ZK proof stub (MockVerifierZK: accepts any proof) ────────────────────────
// MockVerifierZK.verifyProof() accepts any (a,b,c,publicInputs).
// We pass minimal valid BN254 generator points to satisfy ABI decoding.
// In production: replace with real Groth16 prover output.
const PROOF_A_X = "0000000000000000000000000000000000000000000000000000000000000001";
const PROOF_A_Y = "0000000000000000000000000000000000000000000000000000000000000002";
// BN254 G2 generator
const PROOF_B_X0 = "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2";
const PROOF_B_X1 = "1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed";
const PROOF_B_Y0 = "090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b";
const PROOF_B_Y1 = "12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa";
const PROOF_C_X = "0000000000000000000000000000000000000000000000000000000000000001";
const PROOF_C_Y = "0000000000000000000000000000000000000000000000000000000000000002";

// ── Calldata builders ─────────────────────────────────────────────────────────
// All builders return { data: "0x...", value: "0x..." }

// ─── DEPOSIT ─────────────────────────────────────────────────────────────────
// ShieldVault.deposit(DepositParams params) payable
//
// ABI: deposit((bytes32,address,uint256,(uint256[2],uint256[2][2],uint256[2]),uint256[]))
//
// Layout (struct wraps in a dynamic tuple, so offset 0x20 first):
//   [sel]
//   [0x00] offset to struct = 0x0000..0020  (struct starts at word 1)
//   --- struct fields ---
//   [0x20] commitment     bytes32
//   [0x40] token          address (padded)
//   [0x60] amount         uint256
//   --- proof.a (uint256[2]) ---
//   [0x80] proof.a[0]
//   [0xa0] proof.a[1]
//   --- proof.b (uint256[2][2]) ---
//   [0xc0] proof.b[0][0]
//   [0xe0] proof.b[0][1]
//   [0x100] proof.b[1][0]
//   [0x120] proof.b[1][1]
//   --- proof.c (uint256[2]) ---
//   [0x140] proof.c[0]
//   [0x160] proof.c[1]
//   --- publicInputs offset (relative to struct start) ---
//   [0x180] offset = 0x0000..0180  (publicInputs array starts at offset 0x180 from struct start = absolute 0x1a0)
//           Wait — the struct has static fields up to proof.c.
//           Static fields: bytes32(1) + address(1) + uint256(1) + uint256[2](2) + uint256[2][2](4) + uint256[2](2) = 11 words = 0x160
//           Dynamic field: publicInputs → offset stored at position 11*32 = 0x160 from struct start
//           The offset VALUE = 0x160 (where the array begins, relative to start of struct encoding)
//   [0x180] length of publicInputs = 1
//   [0x1a0] publicInputs[0] = commitment (as uint256)

export function buildDepositCalldata(commitment, tokenAddress, amount) {
  const comm32  = commitment.replace("0x", "").padStart(64, "0");
  const amt32   = encodeUint256(amount);
  const tok32   = encodeAddress(tokenAddress);

  // ABI offset to publicInputs from struct start:
  // Head = 12 words: commitment(1) + token(1) + amount(1) + proof(8) + THIS_OFFSET_FIELD(1) = 12
  // Offset field is AT position 11×32 = 0x160
  // Dynamic data starts AFTER the offset field = at 12×32 = 0x180
  const dynOff  = encodeUint256(0x180n);  // ← was 0x160 (pointed to offset field itself → revert)
  const pubLen  = encodeUint256(1n);
  const pubVal  = comm32; // publicInputs[0] = commitment

  // Outer ABI: function takes 1 parameter (struct) → head = offset to struct = 0x20
  const outerOff = encodeUint256(0x20n);

  const data = SEL.deposit
    + outerOff          // offset to struct tuple
    + comm32            // DepositParams.commitment
    + tok32             // DepositParams.token
    + amt32             // DepositParams.amount
    + PROOF_A_X         // proof.a[0]
    + PROOF_A_Y         // proof.a[1]
    + PROOF_B_X0        // proof.b[0][0]
    + PROOF_B_X1        // proof.b[0][1]
    + PROOF_B_Y0        // proof.b[1][0]
    + PROOF_B_Y1        // proof.b[1][1]
    + PROOF_C_X         // proof.c[0]
    + PROOF_C_Y         // proof.c[1]
    + dynOff            // offset to publicInputs within struct (0x160)
    + pubLen            // publicInputs.length = 1
    + pubVal;           // publicInputs[0]

  // Native USDC: msg.value = amount (6-dec) * 1e12 → native wei (18-dec)
  const isNativeUsdc = tokenAddress.toLowerCase() === NATIVE_USDC.toLowerCase();
  const value = isNativeUsdc
    ? "0x" + (BigInt(amount) * NATIVE_TO_ERC20).toString(16)
    : "0x0";

  return { data, value };
}

// ─── WITHDRAW ────────────────────────────────────────────────────────────────
// ShieldVault.withdraw(WithdrawalParams params)
//
// ABI: withdraw(((uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32,address,uint256,uint256,address,uint256[]))
//
// WithdrawalParams fields in order (IModules.sol):
//   proof          (uint256[2],uint256[2][2],uint256[2])  → 8 static words
//   root           bytes32
//   nullifier      bytes32
//   token          address
//   recipient      address
//   amount         uint256
//   relayerFee     uint256
//   relayer        address
//   publicInputs   uint256[]    ← dynamic
//
// Static fields: 8 (proof) + 1 + 1 + 1 + 1 + 1 + 1 + 1 = 15 words
// Offset field for publicInputs is at position 15×32 = 0x1e0
// Dynamic data starts AFTER offset field = at 16×32 = 0x200

export function buildWithdrawCalldata({ nullifier, root, token, recipient, amount, relayerFee = 0n, relayer = "0x0000000000000000000000000000000000000000" }) {
  const dynOff   = encodeUint256(0x200n);  // ← was 0x1e0 (pointed to offset field itself → revert)
  const outerOff = encodeUint256(0x20n);

  // publicInputs = [root, nullifier, recipient (as uint256), amount, relayerFee]
  const pubInputs = [
    encodeBytes32(root),
    encodeBytes32(nullifier),
    encodeAddress(recipient),
    encodeUint256(amount),
    encodeUint256(relayerFee),
  ];

  const data = SEL.withdraw
    + outerOff            // outer offset to struct
    + PROOF_A_X           // proof.a[0]
    + PROOF_A_Y           // proof.a[1]
    + PROOF_B_X0          // proof.b[0][0]
    + PROOF_B_X1          // proof.b[0][1]
    + PROOF_B_Y0          // proof.b[1][0]
    + PROOF_B_Y1          // proof.b[1][1]
    + PROOF_C_X           // proof.c[0]
    + PROOF_C_Y           // proof.c[1]
    + encodeBytes32(root)         // root
    + encodeBytes32(nullifier)    // nullifier
    + encodeAddress(token)        // token
    + encodeAddress(recipient)    // recipient
    + encodeUint256(amount)       // amount
    + encodeUint256(relayerFee)   // relayerFee
    + encodeAddress(relayer)      // relayer
    + dynOff                      // offset to publicInputs (from struct start)
    + encodeUint256(BigInt(pubInputs.length))
    + pubInputs.join("");

  return { data, value: "0x0" };
}

// ─── SHIELDED SEND ────────────────────────────────────────────────────────────
// ShieldVault.shieldedSend(TransferParams params)
//
// ABI: shieldedSend((bytes32[],(uint256[2],uint256[2][2],uint256[2]),bytes32,bytes32[],uint256[]))
//
// TransferParams fields (IModules.sol):
//   inputNullifiers  bytes32[]     ← dynamic (offset at pos 0)
//   proof            (uint256[2],uint256[2][2],uint256[2]) → 8 static words (offset at pos 1)
//   merkleRoot       bytes32
//   outputCommitments bytes32[]    ← dynamic (offset at pos 3)
//   publicInputs     uint256[]     ← dynamic (offset at pos 4)
//
// Static head of struct: 5 words (5 offsets for 2 static + 3 dynamic fields)
// Wait — proof is a static tuple (fixed size). But bytes32[] are dynamic.
// ABI rule: if any field is dynamic, ALL fields use offset encoding.
// So the struct head has 5 words (one per field, all offsets):
//   [0] offset to inputNullifiers
//   [1] offset to proof tuple        ← even static tuples use an offset if struct is dynamic
//   [2] merkleRoot (bytes32 = static, encoded inline as 32-byte value)
//
// Actually re-read the ABI spec:
// When a STRUCT contains dynamic types, the struct itself is dynamic.
// Encoding: head (fixed-size or offset for each member) + tail (dynamic data)
// Static members (bytes32, uint256, address) are encoded inline in the head.
// Dynamic members (bytes32[], uint256[]) are encoded as an offset + data in the tail.
// The "proof" tuple is STATIC (all fixed-size), so encoded inline.
//
// Head layout (offsets are from start of struct encoding):
//   [0x00]  offset to inputNullifiers (dynamic)
//   [0x20]  proof.a[0]   \
//   [0x40]  proof.a[1]    |
//   [0x60]  proof.b[0][0] |  proof inlined (8 words)
//   [0x80]  proof.b[0][1] |
//   [0xa0]  proof.b[1][0] |
//   [0xc0]  proof.b[1][1] |
//   [0xe0]  proof.c[0]   |
//   [0x100] proof.c[1]   /
//   [0x120] merkleRoot  (bytes32, static)
//   [0x140] offset to outputCommitments (dynamic)
//   [0x160] offset to publicInputs (dynamic)
//   ---- tail ----
//   [0x180] inputNullifiers.length = 1
//   [0x1a0] inputNullifiers[0] = nullifierIn
//   [0x1c0] outputCommitments.length = 1
//   [0x1e0] outputCommitments[0] = commitmentOut
//   [0x200] publicInputs.length = 0

export function buildShieldedSendCalldata({ nullifierIn, merkleRoot, commitmentOut }) {
  // Offsets from start of struct encoding:
  // inputNullifiers at 0x180 (head=9 words for proof=8 + offsets: 3 offsets at 0,0x140,0x160 — wait, recalculate)
  // Head = 3 dynamic offsets (inputNullifiers, outputCommitments, publicInputs) + 8 proof words + 1 merkleRoot
  // = 12 words = 0x180
  // tail starts at 0x180
  // inputNullifiers offset: from struct start = 0x180
  // outputCommitments offset: 0x180 + 2*32 = 0x1c0
  // publicInputs offset: 0x1c0 + 2*32 = 0x200

  const outerOff   = encodeUint256(0x20n);
  const offNullIn  = encodeUint256(0x180n);  // inputNullifiers array (from struct start)
  const offCmtOut  = encodeUint256(0x1c0n);  // outputCommitments (from struct start)
  const offPubIn   = encodeUint256(0x200n);  // publicInputs (from struct start)

  const data = SEL.shieldedSend
    + outerOff
    // struct head:
    + offNullIn                       // [0x00] offset to inputNullifiers
    + PROOF_A_X                       // [0x20] proof.a[0]
    + PROOF_A_Y                       // [0x40] proof.a[1]
    + PROOF_B_X0                      // [0x60] proof.b[0][0]
    + PROOF_B_X1                      // [0x80] proof.b[0][1]
    + PROOF_B_Y0                      // [0xa0] proof.b[1][0]
    + PROOF_B_Y1                      // [0xc0] proof.b[1][1]
    + PROOF_C_X                       // [0xe0] proof.c[0]
    + PROOF_C_Y                       // [0x100] proof.c[1]
    + encodeBytes32(merkleRoot)       // [0x120] merkleRoot (static)
    + offCmtOut                       // [0x140] offset to outputCommitments
    + offPubIn                        // [0x160] offset to publicInputs
    // struct tail:
    + encodeUint256(1n)               // [0x180] inputNullifiers.length = 1
    + encodeBytes32(nullifierIn)      // [0x1a0] inputNullifiers[0]
    + encodeUint256(1n)               // [0x1c0] outputCommitments.length = 1
    + encodeBytes32(commitmentOut)    // [0x1e0] outputCommitments[0]
    + encodeUint256(0n);              // [0x200] publicInputs.length = 0

  return { data, value: "0x0" };
}

// ─── PRIVATE SWAP ─────────────────────────────────────────────────────────────
// ShieldVault.privateSwapExec(SwapParams params)
//
// SwapParams (IModules.sol) — all fields in order:
//   proof           (uint256[2],uint256[2][2],uint256[2])  → 8 words (static)
//   nullifier       bytes32
//   merkleRoot      bytes32
//   outputCommitment bytes32
//   tokenIn         address
//   tokenOut        address
//   amountIn        uint256
//   minAmountOut    uint256
//   deadline        uint256
//   dexRouter       address
//   routeData       bytes    ← dynamic
//   publicInputs    uint256[]← dynamic
//
// Static head: 8(proof) + 3(bytes32) + 2(address) + 3(uint256) + 1(address) + 2(offsets for dynamic) = 19+2 = 21 words... 
// Actually: static fields inline, dynamic fields as offsets.
// Static: proof(8) + nullifier(1) + merkleRoot(1) + outputCommitment(1) + tokenIn(1) + tokenOut(1) + amountIn(1) + minAmountOut(1) + deadline(1) + dexRouter(1) = 17 words
// Dynamic: routeData(offset) + publicInputs(offset) = 2 offsets in head
// Total head = 19 words = 0x260
// Tail: routeData at 0x260, publicInputs follows

export function buildPrivateSwapCalldata({ nullifier, merkleRoot, commitmentOut, tokenIn, tokenOut, amountIn, minAmountOut, deadline, dexRouter = "0x0000000000000000000000000000000000000000", routeData = "0x" }) {
  const outerOff = encodeUint256(0x20n);

  // routeData as bytes: length-prefixed, padded to 32-byte boundary
  const rdBytes  = routeData.replace("0x", "");
  const rdLen    = rdBytes.length / 2;  // byte count
  const rdPadded = rdBytes.padEnd(Math.ceil(rdLen / 32) * 64, "0");

  // offsets from struct start (19 static words * 32 = 0x260):
  const offRoute  = encodeUint256(0x260n);  // head ends at 19×32 = 0x260 → routeData tail starts here
  const rdWords   = Math.ceil(rdLen / 32);
  // publicInputs starts after routeData tail: 0x260 + length_word(32) + data_words(rdWords×32)
  const offPubIn  = encodeUint256(BigInt(0x260 + 32 + rdWords * 32));  // ← was +32+32 (extra word → revert)

  const deadlineHex = encodeUint256(BigInt(deadline || Math.floor(Date.now() / 1000) + 1200));

  const data = SEL.privateSwapExec
    + outerOff
    // proof (8 words)
    + PROOF_A_X + PROOF_A_Y
    + PROOF_B_X0 + PROOF_B_X1 + PROOF_B_Y0 + PROOF_B_Y1
    + PROOF_C_X + PROOF_C_Y
    // static fields
    + encodeBytes32(nullifier)
    + encodeBytes32(merkleRoot)
    + encodeBytes32(commitmentOut)
    + encodeAddress(tokenIn)
    + encodeAddress(tokenOut)
    + encodeUint256(amountIn)
    + encodeUint256(minAmountOut)
    + deadlineHex
    + encodeAddress(dexRouter)
    // dynamic offsets
    + offRoute
    + offPubIn
    // tail: routeData
    + encodeUint256(BigInt(rdLen))
    + rdPadded
    // tail: publicInputs
    + encodeUint256(0n);   // empty publicInputs array (MockVerifierZK ignores them)

  return { data, value: "0x0" };
}

// ─── PRIVATE BRIDGE ───────────────────────────────────────────────────────────
// ShieldVault.privateBridgeExec(BridgeParams params)
//
// BridgeParams (IModules.sol):
//   proof               (uint256[2],uint256[2][2],uint256[2])  → 8 words
//   nullifier           bytes32
//   merkleRoot          bytes32
//   destinationDomain   uint32
//   token               address
//   amount              uint256
//   mintRecipient       bytes32
//   maxBridgeFee        uint256
//   publicInputs        uint256[]  ← dynamic
//
// Static: 8(proof) + 1 + 1 + 1 + 1 + 1 + 1 + 1 = 15 words → head size = (15+1) words = 0x200
// Actually: 15 static + 1 offset for publicInputs = 16 words = 0x200? No.
// Head = all words: 15 static inlined + 1 offset = 16 * 32 = 0x200
// publicInputs tail starts at 0x200

export function buildPrivateBridgeCalldata({ nullifier, merkleRoot, destinationDomain, token, amount, mintRecipient, maxBridgeFee = 0n }) {
  const outerOff = encodeUint256(0x20n);
  const offPubIn = encodeUint256(0x200n);  // 16 words * 32 = 0x200

  const data = SEL.privateBridgeExec
    + outerOff
    // proof (8 words)
    + PROOF_A_X + PROOF_A_Y
    + PROOF_B_X0 + PROOF_B_X1 + PROOF_B_Y0 + PROOF_B_Y1
    + PROOF_C_X + PROOF_C_Y
    // static fields
    + encodeBytes32(nullifier)
    + encodeBytes32(merkleRoot)
    + encodeUint32(destinationDomain)
    + encodeAddress(token)
    + encodeUint256(amount)
    + encodeBytes32(mintRecipient)
    + encodeUint256(maxBridgeFee)
    // dynamic offset
    + offPubIn
    // tail: publicInputs (empty)
    + encodeUint256(0n);

  return { data, value: "0x0" };
}

// ─── ERC-20 APPROVE ──────────────────────────────────────────────────────────
export function buildApproveCalldata(spender, amount) {
  return SEL.approve + encodeAddress(spender) + encodeUint256(amount);
}

// ─── NATIVE USDC GATE ────────────────────────────────────────────────────────
// Native USDC uses msg.value — no ERC-20 approve needed before deposit
export function needsApproveBeforeDeposit(tokenAddress) {
  return tokenAddress.toLowerCase() !== NATIVE_USDC.toLowerCase();
}

// ─── STAKING ─────────────────────────────────────────────────────────────────
// Staking.sol stake(uint256 amount, uint256 lockDuration) expects lockDuration in SECONDS
// Valid values: 604800 (7d), 2592000 (30d), 7776000 (90d), 15552000 (180d)
export function buildStakeCalldata(amount, lockSeconds) {
  return SEL.stake + encodeUint256(amount) + encodeUint256(BigInt(lockSeconds));
}

// ─── MERKLE ROOT GETTER ───────────────────────────────────────────────────────
// For withdraw/send/swap: we need to read the current Merkle root
export function buildGetLastRootCall() {
  return SEL.getLastRoot;  // eth_call to MerkleTreeManager
}

// ─── RANDOM CRYPTO HELPERS ───────────────────────────────────────────────────
// Generate a cryptographically random bytes32 value
export function randomBytes32() {
  return "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── CCTP DESTINATION DOMAINS ────────────────────────────────────────────────
// Circle CCTP v2 domain IDs (matches PrivateBridge.sol constructor)
export const CCTP_DOMAINS = {
  ethereum: { domainId: 0,  name: "Ethereum Sepolia",  icon: "Ξ",  note: "CCTP v2" },
  avalanche:{ domainId: 1,  name: "Avalanche Fuji",    icon: "🔺", note: "CCTP v2" },
  optimism: { domainId: 2,  name: "Optimism Sepolia",  icon: "🔴", note: "CCTP v2" },
  arbitrum: { domainId: 3,  name: "Arbitrum Sepolia",  icon: "🔵", note: "CCTP v2" },
  base:     { domainId: 6,  name: "Base Sepolia",      icon: "🔷", note: "CCTP v2" },
  polygon:  { domainId: 7,  name: "Polygon Amoy",      icon: "⬟", note: "CCTP v2" },
};
