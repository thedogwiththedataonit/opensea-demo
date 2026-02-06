/**
 * GET /api/tokens/[chain]/[address]
 *
 * Single token detail by chain and contract address.
 *
 * Status codes: 200, 404, 500, 503, 429
 * Error codes: TOKEN_NOT_FOUND, TOKEN_LOOKUP_FAILED, BUSYBOX_*
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError } from "@/app/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> }
) {
  ensurePriceEngine();
  const { chain, address } = await params;

  return withSpan(tracer, 'marketplace.token.detail', { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/tokens/[chain]/[address]', chain, address });
      maybeFault('http503', { route: '/api/tokens/[chain]/[address]' });
      maybeFault('http429', { route: '/api/tokens/[chain]/[address]' });

      await simulateLatency(20, 60);

      const token = await withSpan(tracer, 'marketplace.token.lookup', { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address }, async (span) => {
        const found = tokens.find((t) => t.chain === chain && t.address === address);
        if (found) {
          span.setAttribute(MA.TOKEN_SYMBOL, found.symbol);
          span.setAttribute(MA.TOKEN_IS_NEW, found.isNew);
          span.setAttribute(MA.TOKEN_PRICE_USD, found.price);
          span.setAttribute(MA.TOKEN_FDV, found.fdv);
        }
        return found;
      });

      if (!token) {
        throw new NotFoundError('TOKEN_NOT_FOUND', `Token not found on ${chain} at ${address}`, { chain, address });
      }

      rootSpan.setAttribute(MA.TOKEN_SYMBOL, token.symbol);
      rootSpan.setAttribute(MA.TOKEN_PRICE_USD, token.price);
      const { priceHistory, ...tokenData } = token;
      return NextResponse.json({ ...tokenData, recentPrices: priceHistory.slice(-20).map((p) => p.price) });
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
