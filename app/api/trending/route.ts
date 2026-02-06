/**
 * GET /api/trending
 *
 * Aggregates homepage data: featured collections for the hero carousel,
 * top collections for the sidebar ranking, and trending tokens with
 * sparkline price data.
 *
 * Trace structure:
 *   marketplace.trending.aggregate
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.trending.featured_collections
 *     ├── marketplace.trending.top_collections
 *     └── marketplace.trending.tokens
 *           └── marketplace.price.sparkline  (×6 tokens)
 */

import { NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getSparklineData } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

export async function GET() {
  ensurePriceEngine();

  return withSpan(tracer, 'marketplace.trending.aggregate', {}, async (rootSpan) => {
    await simulateLatency(30, 80);

    // --- Featured collections for hero carousel (top 3 by volume) ---
    const featuredCollections = await withSpan(
      tracer,
      'marketplace.trending.featured_collections',
      {},
      async (span) => {
        const sorted = [...collections]
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 3);
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      }
    );

    // --- Top collections for sidebar (top 10 by volume) ---
    const topCollections = await withSpan(
      tracer,
      'marketplace.trending.top_collections',
      {},
      async (span) => {
        const sorted = [...collections]
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 10);
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      }
    );

    // --- Trending tokens (top 6 by absolute 1d change, with sparklines) ---
    const trendingTokens = await withSpan(
      tracer,
      'marketplace.trending.tokens',
      {},
      async (span) => {
        const sorted = [...tokens]
          .sort((a, b) => Math.abs(b.change1d) - Math.abs(a.change1d))
          .slice(0, 6)
          .map((t) => ({
            ...t,
            sparkline: getSparklineData(t.priceHistory, 20).map((p) => p.price),
            priceHistory: undefined,
          }));
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      }
    );

    rootSpan.setAttribute(MA.RESULT_COUNT, featuredCollections.length + topCollections.length + trendingTokens.length);

    return NextResponse.json({
      featuredCollections,
      trendingTokens,
      topCollections,
    });
  });
}
