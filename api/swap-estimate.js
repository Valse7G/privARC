/**
 * api/swap-estimate.js — Vercel Serverless Function
 * Proxies kit.estimateSwap() server-side (App Kit requires server context).
 * Called by SwapPanel before touching the vault.
 *
 * POST /api/swap-estimate
 * Body: { tokenIn, tokenOut, amountIn, fromAddress }
 * Returns: { ok, estimate } or { ok: false, error }
 */
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapter } from "@circle-fin/adapter-viem-v2";
import { createWalletClient, http } from "viem";

const KIT_KEY = process.env.KIT_KEY; // server-side env var (no VITE_ prefix)

const ARC_TESTNET_CHAIN = {
  id: 1313161567,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
};


export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { tokenIn, tokenOut, amountIn, fromAddress } = req.body ?? {};
  if (!tokenIn || !tokenOut || !amountIn || !fromAddress) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }
  if (!KIT_KEY) {
    return res.status(500).json({ ok: false, error: "KIT_KEY not configured on server" });
  }

  try {
    // Server-side viem client (read-only — no signing needed for estimate)
    const walletClient = createWalletClient({
      account: fromAddress,
      chain: ARC_TESTNET_CHAIN,
      transport: http("https://rpc.testnet.arc.io"),
    });
    const adapter = createViemAdapter({ walletClient });
    const kit = new AppKit();

    const estimate = await kit.estimateSwap({
      from:     { adapter, chain: "Arc_Testnet" },
      tokenIn,
      tokenOut,
      amountIn: String(amountIn),
      config:   { kitKey: KIT_KEY },
    });

    return res.status(200).json({
      ok: true,
      estimate: {
        estimatedOutput: estimate.estimatedOutput,
        stopLimit:       estimate.stopLimit,
        fees:            estimate.fees,
        fromAddress:     estimate.fromAddress,
        toAddress:       estimate.toAddress,
      },
    });
  } catch (e) {
    console.error("[swap-estimate]", e);
    return res.status(200).json({ ok: false, error: e.message ?? "Estimate failed" });
  }
}
