/**
 * api/swap.js — Vercel Serverless Function (Node.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxies Circle App Kit swap() server-side.
 *
 * The Circle Stablecoin Service API is NOT accessible from a browser
 * (CORS + server-only auth). This function runs in Node.js on Vercel
 * and calls the API on behalf of the user.
 *
 * IMPORTANT: kit.swap() requires signing — it uses a Circle-managed wallet
 * (createViemAdapterFromPrivateKey) to execute the DEX transaction.
 * The user's ShieldVault already withdrew funds to their wallet (Step 1).
 * This API then executes the swap on Arc DEX and returns the result.
 *
 * POST /api/swap
 * Body: { tokenIn, tokenOut, amountIn, fromAddress, walletAddress }
 * Returns: { ok, txHash, amountOut } or { ok: false, error }
 *
 * env vars required (Vercel Dashboard):
 *   KIT_KEY       — KIT_KEY:<keyId>:<keySecret>  (Circle App Kit)
 */

import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const KIT_KEY = process.env.KIT_KEY;


export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { tokenIn, tokenOut, amountIn } = req.body ?? {};
  if (!tokenIn || !tokenOut || !amountIn)
    return res.status(400).json({ ok: false, error: "Missing required fields: tokenIn, tokenOut, amountIn" });
  if (!KIT_KEY)
    return res.status(500).json({ ok: false, error: "KIT_KEY not configured on server. Add KIT_KEY to Vercel env vars." });

  // ── NOTE ON SIGNING ────────────────────────────────────────────────────────
  // kit.swap() on Arc DEX uses Circle's built-in liquidity routing.
  // The actual swap tx is signed by the App Kit using the Circle Wallets
  // infrastructure — the user doesn't need to sign this directly.
  // The result txHash can be verified on ARCScan.
  try {
    const kit     = new AppKit();

    // For Arc Testnet swap, we use a read-only adapter (no private key needed
    // for quote — execution is handled by Circle's Stablecoin Service).
    // The swap executes atomically on the DEX, funded by the user's wallet
    // (which received funds from ShieldVault.withdraw in step 1).
    const result = await kit.swap({
      tokenIn,
      tokenOut,
      amountIn:  String(amountIn),
      chain:     "Arc_Testnet",
      config:    { kitKey: KIT_KEY, slippageBps: 100 },
    });

    if (!result?.txHash) {
      throw new Error(result?.error?.message ?? "Swap returned no txHash");
    }

    return res.status(200).json({
      ok:        true,
      txHash:    result.txHash,
      amountOut: result.amountOut ?? null,
    });
  } catch (e) {
    console.error("[api/swap]", e.message);
    return res.status(200).json({ ok: false, error: e.message ?? "Swap failed" });
  }
}
