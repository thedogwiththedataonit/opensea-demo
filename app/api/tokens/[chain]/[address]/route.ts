/**
 * GET /api/tokens/[chain]/[address]
 *
 * Returns the full detail for a single token identified by its blockchain
 * chain and contract address. Strips full priceHistory and returns only
 * the 20 most recent price points. Returns 404 if not found.
 *
 * Trace structure:
 *   marketplace.token.detail
 *     ├── marketplace.infra.latency_simulation
 *     └── marketplace.token.lookup
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> }
) {
  ensurePriceEngine();

  const { chain, address } = await params;

  return withSpan(tracer, 'marketplace.token.detail', {
    [MA.CHAIN]: chain,
    [MA.TOKEN_ADDRESS]: address,
  }, async (rootSpan) => {
    await simulateLatency(20, 60);

    // --- Look up token by chain + address ---
    const token = await withSpan(
      tracer,
      'marketplace.token.lookup',
      { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address },
      async (span) => {
        const found = tokens.find((t) => t.chain === chain && t.address === address);
        if (found) {
          span.setAttribute(MA.TOKEN_SYMBOL, found.symbol);
          span.setAttribute(MA.TOKEN_IS_NEW, found.isNew);
          span.setAttribute(MA.TOKEN_PRICE_USD, found.price);
          span.setAttribute(MA.TOKEN_FDV, found.fdv);
        }
        return found;
      }
    );

    if (!token) {
      rootSpan.setAttribute('error', true);
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    rootSpan.setAttribute(MA.TOKEN_SYMBOL, token.symbol);
    rootSpan.setAttribute(MA.TOKEN_PRICE_USD, token.price);

    // Return token without full price history (use chart endpoint for that)
    const { priceHistory, ...tokenData } = token;
    return NextResponse.json({
      ...tokenData,
      recentPrices: priceHistory.slice(-20).map((p) => p.price),
    });
  });
}
