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
 *   marketplace.trending.aggregate
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.trending.featured_collections
 *     ├── marketplace.trending.top_collections
 *     ├── marketplace.trending.tokens
 *     └── marketplace.trending.marketplace_stats
 */

import { NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getSparklineData } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { enrichCollection, enrichTokenFields, generateMarketplaceStats } from "@/app/lib/faker-enrich";

export const dynamic = "force-dynamic";

export async function GET() {
  ensurePriceEngine();

  return withSpan(tracer, 'marketplace.trending.aggregate', {}, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/trending' });
      maybeFault('http502', { route: '/api/trending' });
      maybeFault('http503', { route: '/api/trending' });
      maybeFault('http429', { route: '/api/trending' });

      await simulateLatency(30, 80);

      const featuredCollections = await withSpan(tracer, 'marketplace.trending.featured_collections', {}, async (span) => {
        const sorted = [...collections]
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 3)
          .map(enrichCollection);
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      });

      const topCollections = await withSpan(tracer, 'marketplace.trending.top_collections', {}, async (span) => {
        const sorted = [...collections]
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 10)
          .map(enrichCollection);
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      });

      const trendingTokens = await withSpan(tracer, 'marketplace.trending.tokens', {}, async (span) => {
        const sorted = [...tokens]
          .sort((a, b) => Math.abs(b.change1d) - Math.abs(a.change1d))
          .slice(0, 6)
          .map((t) => {
            const enriched = enrichTokenFields(t);
            return {
              ...t,
              ...enriched,
              sparkline: getSparklineData(t.priceHistory, 20).map((p) => p.price),
              priceHistory: undefined,
            };
          });
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      });

      // Generate dynamic marketplace stats (ETH price, gas, etc.)
      const marketplaceStats = await withSpan(tracer, 'marketplace.trending.marketplace_stats', {}, async (span) => {
        const stats = generateMarketplaceStats();
        span.setAttribute('marketplace.stats.eth_price', stats.ethPrice);
        span.setAttribute('marketplace.stats.gas_price', stats.gasPrice);
        return stats;
      });

      rootSpan.setAttribute(MA.RESULT_COUNT, featuredCollections.length + topCollections.length + trendingTokens.length);
      return NextResponse.json({ featuredCollections, trendingTokens, topCollections, marketplaceStats });
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
