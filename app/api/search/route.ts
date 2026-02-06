/**
 * GET /api/search
 *
 * Cross-entity search across collections and tokens.
 *
 * Status codes: 200, 400, 500, 503, 429
 * Error codes: SEARCH_QUERY_INVALID, SEARCH_FAILED, BUSYBOX_*
 *
 * Trace structure:
 *   marketplace.search
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.search.collections
 *     └── marketplace.search.tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { SearchResult } from "@/app/lib/data/types";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  ensurePriceEngine();

  const q = request.nextUrl.searchParams.get("q")?.toLowerCase() || "";

  return withSpan(tracer, 'marketplace.search', { [MA.SEARCH_QUERY]: q }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/search', query: q });
      maybeFault('http503', { route: '/api/search' });
      maybeFault('http429', { route: '/api/search' });

      await simulateLatency(30, 80);

      if (!q || q.length < 1) {
        rootSpan.setAttribute(MA.SEARCH_COLLECTION_HITS, 0);
        rootSpan.setAttribute(MA.SEARCH_TOKEN_HITS, 0);
        return NextResponse.json({ collections: [], tokens: [] } as SearchResult);
      }

      const matchedCollections = await withSpan(tracer, 'marketplace.search.collections', { [MA.SEARCH_QUERY]: q }, async (span) => {
        const results = collections
          .filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || c.creatorName.toLowerCase().includes(q))
          .slice(0, 5)
          .map((c) => ({ slug: c.slug, name: c.name, imageUrl: c.imageUrl, verified: c.verified, floorPrice: c.floorPrice, floorCurrency: c.floorCurrency }));
        span.setAttribute(MA.SEARCH_COLLECTION_HITS, results.length);
        return results;
      });

      const matchedTokens = await withSpan(tracer, 'marketplace.search.tokens', { [MA.SEARCH_QUERY]: q }, async (span) => {
        const results = tokens
          .filter((t) => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q))
          .slice(0, 5)
          .map((t) => ({ address: t.address, chain: t.chain, name: t.name, symbol: t.symbol, imageUrl: t.imageUrl, price: t.price, change1d: t.change1d }));
        span.setAttribute(MA.SEARCH_TOKEN_HITS, results.length);
        return results;
      });

      rootSpan.setAttribute(MA.SEARCH_COLLECTION_HITS, matchedCollections.length);
      rootSpan.setAttribute(MA.SEARCH_TOKEN_HITS, matchedTokens.length);

      return NextResponse.json({ collections: matchedCollections, tokens: matchedTokens } as SearchResult);
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
