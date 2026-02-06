/**
 * GET /api/trending
 *
 * Aggregates homepage data: featured collections, top collections, trending tokens,
 * and marketplace-wide stats (ETH price, gas, etc.) — all enriched with faker.js
 * fluctuations to simulate a live database.
 *
 * Status codes: 200, 500, 503, 429
 * Error codes: TRENDING_AGGREGATION_FAILED, BUSYBOX_*
 *
 * Trace structure:
 *   marketplace.trending.aggregate (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation (opensea-api-gateway)
 *     ├── marketplace.trending.featured_collections (opensea-data-service)
 *     │     └── marketplace.enrichment.collection x3 (opensea-enrichment)
 *     ├── marketplace.trending.top_collections (opensea-data-service)
 *     │     └── marketplace.enrichment.collection x10 (opensea-enrichment)
 *     ├── marketplace.trending.tokens (opensea-data-service)
 *     │     ├── marketplace.price.sparkline x6 (opensea-price-engine)
 *     │     └── marketplace.enrichment.token x6 (opensea-enrichment)
 *     └── marketplace.enrichment.marketplace_stats (opensea-enrichment)
 */

import { NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getSparklineData } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { apiTracer, dataTracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { enrichCollection, enrichTokenFields, generateMarketplaceStats } from "@/app/lib/faker-enrich";

export const dynamic = "force-dynamic";

export async function GET() {
  ensurePriceEngine();

  return withSpan(apiTracer, 'marketplace.trending.aggregate', {
    [MA.HTTP_METHOD]: 'GET',
    [MA.HTTP_ROUTE]: '/api/trending',
  }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/trending' });
      maybeFault('http502', { route: '/api/trending' });
      maybeFault('http503', { route: '/api/trending' });
      maybeFault('http429', { route: '/api/trending' });

      await simulateLatency(30, 80);

      const featuredCollections = await withSpan(dataTracer, 'marketplace.trending.featured_collections', {
        [MA.DB_OPERATION]: 'aggregate',
        [MA.DB_COLLECTION]: 'collections',
        [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        await simulateDbLatency('db_aggregate');
        const sorted = [...collections]
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 3);
        const enriched = await Promise.all(sorted.map(enrichCollection));
        span.setAttribute(MA.RESULT_COUNT, enriched.length);
        return enriched;
      });

      const topCollections = await withSpan(dataTracer, 'marketplace.trending.top_collections', {
        [MA.DB_OPERATION]: 'aggregate',
        [MA.DB_COLLECTION]: 'collections',
        [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        await simulateDbLatency('db_aggregate');
        const sorted = [...collections]
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 10);
        const enriched = await Promise.all(sorted.map(enrichCollection));
        span.setAttribute(MA.RESULT_COUNT, enriched.length);
        return enriched;
      });

      const trendingTokens = await withSpan(dataTracer, 'marketplace.trending.tokens', {
        [MA.DB_OPERATION]: 'aggregate',
        [MA.DB_COLLECTION]: 'tokens',
        [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        await simulateDbLatency('db_read');
        const sorted = [...tokens]
          .sort((a, b) => Math.abs(b.change1d) - Math.abs(a.change1d))
          .slice(0, 6);
        const enriched = await Promise.all(sorted.map(async (t) => {
          const tokenEnriched = await enrichTokenFields(t);
          const sparkline = await getSparklineData(t.priceHistory, 20);
          return {
            ...t,
            ...tokenEnriched,
            sparkline: sparkline.map((p) => p.price),
            priceHistory: undefined,
          };
        }));
        span.setAttribute(MA.RESULT_COUNT, enriched.length);
        return enriched;
      });

      // Generate dynamic marketplace stats (ETH price, gas, etc.)
      const marketplaceStats = await generateMarketplaceStats();

      rootSpan.setAttribute(MA.RESULT_COUNT, featuredCollections.length + topCollections.length + trendingTokens.length);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, featuredCollections.length + topCollections.length + trendingTokens.length);
      return NextResponse.json({ featuredCollections, trendingTokens, topCollections, marketplaceStats });
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    }
  });
}
