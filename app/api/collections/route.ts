/**
 * GET /api/collections
 *
 * Paginated, filtered, sorted list of NFT collections.
 *
 * Status codes: 200, 400, 500, 503, 429
 * Error codes: INVALID_PAGINATION, COLLECTION_LIST_FAILED, BUSYBOX_*
 *
 * Trace structure:
 *   marketplace.collections.list
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.collections.filter
 *     ├── marketplace.collections.sort
 *     └── marketplace.collections.paginate
 */

import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { ValidationError } from "@/app/lib/errors";
import { enrichCollection } from "@/app/lib/faker-enrich";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  ensurePriceEngine();

  const { searchParams } = request.nextUrl;
  const sort = searchParams.get("sort") || "volume";
  const chain = searchParams.get("chain") || "all";
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");
  const q = searchParams.get("q")?.toLowerCase() || "";
  const category = searchParams.get("category") || "all";

  return withSpan(tracer, 'marketplace.collections.list', {
    [MA.FILTER_CHAIN]: chain, [MA.FILTER_SORT]: sort, [MA.FILTER_CATEGORY]: category,
    [MA.PAGINATION_LIMIT]: limit, [MA.PAGINATION_OFFSET]: offset,
  }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/collections' });
      maybeFault('http502', { route: '/api/collections' });
      maybeFault('http503', { route: '/api/collections' });
      maybeFault('http429', { route: '/api/collections' });

      // Validate pagination params
      if (isNaN(limit) || limit < 1 || limit > 100) {
        throw new ValidationError('INVALID_PAGINATION', `Invalid limit: must be 1-100, got ${searchParams.get("limit")}`, { limit: searchParams.get("limit") });
      }
      if (isNaN(offset) || offset < 0) {
        throw new ValidationError('INVALID_PAGINATION', `Invalid offset: must be >= 0, got ${searchParams.get("offset")}`, { offset: searchParams.get("offset") });
      }

      await simulateLatency(30, 90);

      let filtered = await withSpan(tracer, 'marketplace.collections.filter', { [MA.FILTER_CHAIN]: chain, [MA.FILTER_CATEGORY]: category, [MA.SEARCH_QUERY]: q }, async (span) => {
        let result = [...collections];
        if (chain !== "all") result = result.filter((c) => c.chain === chain);
        if (category !== "all") result = result.filter((c) => c.category === category);
        if (q) result = result.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
        span.setAttribute(MA.RESULT_COUNT, result.length);
        return result;
      });

      filtered = await withSpan(tracer, 'marketplace.collections.sort', { [MA.FILTER_SORT]: sort }, async (span) => {
        const sorted = [...filtered];
        switch (sort) {
          case "volume": sorted.sort((a, b) => b.totalVolume - a.totalVolume); break;
          case "floor": sorted.sort((a, b) => b.floorPrice - a.floorPrice); break;
          case "change1d": sorted.sort((a, b) => b.change1d - a.change1d); break;
          case "change7d": sorted.sort((a, b) => b.change7d - a.change7d); break;
          case "items": sorted.sort((a, b) => b.itemCount - a.itemCount); break;
          default: sorted.sort((a, b) => b.totalVolume - a.totalVolume);
        }
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      });

      const total = filtered.length;
      const hasMore = offset + limit < total;

      const paginated = await withSpan(tracer, 'marketplace.collections.paginate', {
        [MA.PAGINATION_OFFSET]: offset, [MA.PAGINATION_LIMIT]: limit, [MA.PAGINATION_TOTAL]: total, [MA.PAGINATION_HAS_MORE]: hasMore,
      }, async (span) => {
        const page = filtered.slice(offset, offset + limit);
        span.setAttribute(MA.RESULT_COUNT, page.length);
        return page;
      });

      // Enrich with faker fluctuations to simulate live db data
      const enriched = paginated.map(enrichCollection);

      rootSpan.setAttribute(MA.PAGINATION_TOTAL, total);
      rootSpan.setAttribute(MA.RESULT_COUNT, enriched.length);
      return NextResponse.json({ data: enriched, total, limit, offset, hasMore });
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
