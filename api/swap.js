/**
 * api/swap.js — Vercel Serverless Function
 * Calls Circle App Kit swap() server-side (CORS-restricted from browser).
 *
 * POST /api/swap  { tokenIn, tokenOut, amountIn }
 * GET  /api/swap  → health check
 *
 * Env var required in Vercel Dashboard:
 *   KIT_KEY = KIT_KEY:<keyId>:<keySecret>
 */

export default async function handler(req, res) {
  // Always return JSON
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Health check
  if (req.method === "GET") {
    const KIT_KEY = process.env.KIT_KEY ?? "";
    return res.status(200).json({
      ok:      true,
      status:  "ready",
      kitKey:  KIT_KEY ? `${KIT_KEY.slice(0, 12)}…` : "NOT SET",
      node:    process.version,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const KIT_KEY = process.env.KIT_KEY ?? "";
  if (!KIT_KEY || !KIT_KEY.startsWith("KIT_KEY:") || KIT_KEY.split(":").length !== 3) {
    return res.status(500).json({
      ok: false,
      error: `KIT_KEY not configured or invalid format on server. Got: "${KIT_KEY.slice(0, 15) || "(empty)"}". Add KIT_KEY=KIT_KEY:<id>:<secret> in Vercel env vars.`,
    });
  }

  const { tokenIn, tokenOut, amountIn } = req.body ?? {};
  if (!tokenIn || !tokenOut || !amountIn) {
    return res.status(400).json({
      ok: false,
      error: "Missing required fields: tokenIn, tokenOut, amountIn",
    });
  }

  try {
    const { AppKit } = await import("@circle-fin/app-kit");
    const { createViemAdapterFromPrivateKey } = await import("@circle-fin/adapter-viem-v2");

    // For server-side swap we need a signer — but kit.swap() on Arc DEX
    // is actually executed by Circle's Stablecoin Service, not by a signer.
    // We pass a dummy adapter just to satisfy the SDK type requirement.
    const kit = new AppKit();

    const result = await kit.swap({
      tokenIn,
      tokenOut,
      amountIn:  String(amountIn),
      chain:     "Arc_Testnet",
      config:    { kitKey: KIT_KEY, slippageBps: 100 },
    });

    if (!result?.txHash) {
      throw new Error(result?.error?.message ?? "Swap returned no txHash — check Arc testnet liquidity");
    }

    return res.status(200).json({
      ok:        true,
      txHash:    result.txHash,
      amountOut: result.amountOut ?? null,
    });
  } catch (e) {
    console.error("[api/swap] error:", e.message);
    return res.status(200).json({
      ok:    false,
      error: e.message ?? "Swap failed",
    });
  }
}
