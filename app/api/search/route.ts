/**
 * GET /api/search
 *
 * Cross-entity search across collections and tokens.
 *
 * Trace structure:
 *   marketplace.search (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.search.collections (opensea-search-engine)
 *     └── marketplace.search.tokens (opensea-search-engine)
 */

import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { SearchResult } from "@/app/lib/data/types";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTracer, esTracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { log } from "@/app/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  ensurePriceEngine();

  const q = request.nextUrl.searchParams.get("q")?.toLowerCase() || "";

  return apiTracer.startActiveSpan('marketplace.search', {
    attributes: {
      [MA.HTTP_METHOD]: 'GET',
      [MA.HTTP_ROUTE]: '/api/search',
      [MA.SEARCH_QUERY]: q,
    },
  }, async (rootSpan) => {
    const _start = Date.now();
    log.info('search-engine', 'GET /api/search', { query: q || '(empty)' });
    try {
      maybeFault('http500', { route: '/api/search', query: q });
      maybeFault('http502', { route: '/api/search' });
      maybeFault('http503', { route: '/api/search' });
      maybeFault('http429', { route: '/api/search' });

      await simulateLatency(30, 80);

      if (!q || q.length < 1) {
        rootSpan.setAttribute(MA.SEARCH_COLLECTION_HITS, 0);
        rootSpan.setAttribute(MA.SEARCH_TOKEN_HITS, 0);
        rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
        rootSpan.setAttribute(MA.RESPONSE_ITEMS, 0);
        return NextResponse.json({ collections: [], tokens: [] } as SearchResult);
      }

      const matchedCollections = await withSpan(esTracer, 'marketplace.search.collections', {
        [MA.SEARCH_QUERY]: q,
        [MA.DB_OPERATION]: 'scan', [MA.DB_COLLECTION]: 'collections', [MA.DATA_SOURCE]: 'elasticsearch',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const results = collections
          .filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || c.creatorName.toLowerCase().includes(q))
          .slice(0, 5)
          .map((c) => ({ slug: c.slug, name: c.name, imageUrl: c.imageUrl, verified: c.verified, floorPrice: c.floorPrice, floorCurrency: c.floorCurrency }));
        span.setAttribute(MA.SEARCH_COLLECTION_HITS, results.length);
        span.setAttribute(MA.RESULT_COUNT, results.length);
        return results;
      });

      const matchedTokens = await withSpan(esTracer, 'marketplace.search.tokens', {
        [MA.SEARCH_QUERY]: q,
        [MA.DB_OPERATION]: 'scan', [MA.DB_COLLECTION]: 'tokens', [MA.DATA_SOURCE]: 'elasticsearch',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const results = tokens
          .filter((t) => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q))
          .slice(0, 5)
          .map((t) => ({ address: t.address, chain: t.chain, name: t.name, symbol: t.symbol, imageUrl: t.imageUrl, price: t.price, change1d: t.change1d }));
        span.setAttribute(MA.SEARCH_TOKEN_HITS, results.length);
        span.setAttribute(MA.RESULT_COUNT, results.length);
        return results;
      });

      const totalHits = matchedCollections.length + matchedTokens.length;
      rootSpan.setAttribute(MA.SEARCH_COLLECTION_HITS, matchedCollections.length);
      rootSpan.setAttribute(MA.SEARCH_TOKEN_HITS, matchedTokens.length);
      rootSpan.setAttribute(MA.RESULT_COUNT, totalHits);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, totalHits);

      rootSpan.setStatus({ code: SpanStatusCode.OK });
      log.info('search-engine', 'search_completed', {
        status: 200, duration: `${Date.now() - _start}ms`,
        query: q, totalHits: totalHits,
        collections: matchedCollections.length > 0 ? matchedCollections.map(c => c.name).join(', ') : 'none',
        tokens: matchedTokens.length > 0 ? matchedTokens.map(t => `${t.symbol} $${t.price < 1 ? t.price.toFixed(4) : t.price.toFixed(2)}`).join(', ') : 'none',
      });
      return NextResponse.json({ collections: matchedCollections, tokens: matchedTokens } as SearchResult);
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    } finally {
      rootSpan.end();
    }
  });
}
