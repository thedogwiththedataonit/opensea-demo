/**
 * GET /api/collections
 *
 * Returns a paginated, filtered, and sorted list of NFT collections.
 * Supports filtering by chain, category, and search term, with multiple
 * sort options (volume, floor price, 1d/7d change, item count).
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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  ensurePriceEngine();

  const { searchParams } = request.nextUrl;
  const sort = searchParams.get("sort") || "volume";
  const chain = searchParams.get("chain") || "all";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const q = searchParams.get("q")?.toLowerCase() || "";
  const category = searchParams.get("category") || "all";

  return withSpan(tracer, 'marketplace.collections.list', {
    [MA.FILTER_CHAIN]: chain,
    [MA.FILTER_SORT]: sort,
    [MA.FILTER_CATEGORY]: category,
    [MA.PAGINATION_LIMIT]: limit,
    [MA.PAGINATION_OFFSET]: offset,
  }, async (rootSpan) => {
    await simulateLatency(30, 90);

    let filtered = [...collections];

    // --- Filter by chain, category, and search query ---
    filtered = await withSpan(
      tracer,
      'marketplace.collections.filter',
      {
        [MA.FILTER_CHAIN]: chain,
        [MA.FILTER_CATEGORY]: category,
        [MA.SEARCH_QUERY]: q,
      },
      async (span) => {
        let result = [...collections];

        if (chain !== "all") {
          result = result.filter((c) => c.chain === chain);
        }
        if (category !== "all") {
          result = result.filter((c) => c.category === category);
        }
        if (q) {
          result = result.filter(
            (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
          );
        }

        span.setAttribute(MA.RESULT_COUNT, result.length);
        return result;
      }
    );

    // --- Sort by selected field ---
    filtered = await withSpan(
      tracer,
      'marketplace.collections.sort',
      { [MA.FILTER_SORT]: sort },
      async (span) => {
        const sorted = [...filtered];
        switch (sort) {
          case "volume":
            sorted.sort((a, b) => b.totalVolume - a.totalVolume);
            break;
          case "floor":
            sorted.sort((a, b) => b.floorPrice - a.floorPrice);
            break;
          case "change1d":
            sorted.sort((a, b) => b.change1d - a.change1d);
            break;
          case "change7d":
            sorted.sort((a, b) => b.change7d - a.change7d);
            break;
          case "items":
            sorted.sort((a, b) => b.itemCount - a.itemCount);
            break;
          default:
            sorted.sort((a, b) => b.totalVolume - a.totalVolume);
        }
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      }
    );

    // --- Paginate ---
    const total = filtered.length;
    const hasMore = offset + limit < total;

    const paginated = await withSpan(
      tracer,
      'marketplace.collections.paginate',
      {
        [MA.PAGINATION_OFFSET]: offset,
        [MA.PAGINATION_LIMIT]: limit,
        [MA.PAGINATION_TOTAL]: total,
        [MA.PAGINATION_HAS_MORE]: hasMore,
      },
      async (span) => {
        const page = filtered.slice(offset, offset + limit);
        span.setAttribute(MA.RESULT_COUNT, page.length);
        return page;
      }
    );

    rootSpan.setAttribute(MA.PAGINATION_TOTAL, total);
    rootSpan.setAttribute(MA.RESULT_COUNT, paginated.length);

    return NextResponse.json({
      data: paginated,
      total,
      limit,
      offset,
      hasMore,
    });
  });
}
