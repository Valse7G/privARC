/**
 * api/swap-exec.js — Vercel Serverless Function
 *
 * ⚠️  kit.swap() requires signing — it CANNOT be done server-side without the
 * user's private key. This endpoint is NOT used for execution.
 *
 * Instead, swap execution is done via a different approach:
 * The frontend calls the Arc StableFX DEX directly via raw calldata
 * (no server needed for the actual swap tx — only for quote/estimate).
 *
 * This file is kept as a placeholder for future relayer integration.
 */
export default function handler(req, res) {
  res.status(501).json({
    ok: false,
    error: "Swap execution is not a server-side operation. The frontend signs and submits directly.",
  });
}
