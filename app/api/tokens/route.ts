/**
 * GET /api/tokens
 *
 * Returns a paginated, filtered, and sorted list of tokens with sparkline
 * data for table rendering. Supports tab-based views (trending, top, new,
 * watchlist), chain filtering, FDV range filtering, and column sorting.
 *
 * Trace structure:
 *   marketplace.tokens.list
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.tokens.filter
 *     ├── marketplace.tokens.tab_sort
 *     ├── marketplace.tokens.paginate
 *     └── marketplace.tokens.sparkline_extraction
 *           └── marketplace.price.sparkline  (×N tokens)
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getSparklineData } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  ensurePriceEngine();

  const { searchParams } = request.nextUrl;
  const tab = searchParams.get("tab") || "trending";
  const chain = searchParams.get("chain") || "all";
  const sort = searchParams.get("sort") || "volume1d";
  const order = searchParams.get("order") || "desc";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const fdvMin = parseFloat(searchParams.get("fdvMin") || "0");
  const fdvMax = parseFloat(searchParams.get("fdvMax") || "999999999999");

  return withSpan(tracer, 'marketplace.tokens.list', {
    [MA.FILTER_TAB]: tab,
    [MA.FILTER_CHAIN]: chain,
    [MA.FILTER_SORT]: sort,
    [MA.FILTER_ORDER]: order,
    [MA.PAGINATION_LIMIT]: limit,
    [MA.PAGINATION_OFFSET]: offset,
  }, async (rootSpan) => {
    await simulateLatency(30, 100);

    // --- Filter by chain and FDV range ---
    let filtered = await withSpan(
      tracer,
      'marketplace.tokens.filter',
      {
        [MA.FILTER_CHAIN]: chain,
        [MA.FILTER_FDV_MIN]: fdvMin,
        [MA.FILTER_FDV_MAX]: fdvMax,
      },
      async (span) => {
        let result = [...tokens];

        if (chain !== "all") {
          result = result.filter((t) => t.chain === chain);
        }
        result = result.filter((t) => t.fdv >= fdvMin && t.fdv <= fdvMax);

        span.setAttribute(MA.RESULT_COUNT, result.length);
        return result;
      }
    );

    // --- Apply tab-specific sorting ---
    filtered = await withSpan(
      tracer,
      'marketplace.tokens.tab_sort',
      { [MA.FILTER_TAB]: tab, [MA.FILTER_SORT]: sort, [MA.FILTER_ORDER]: order },
      async (span) => {
        const sorted = [...filtered];

        switch (tab) {
          case "trending":
            sorted.sort((a, b) => Math.abs(b.change1d) - Math.abs(a.change1d));
            break;
          case "top":
            sorted.sort((a, b) => b.fdv - a.fdv);
            break;
          case "new": {
            const newOnly = sorted.filter((t) => t.isNew);
            newOnly.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            span.setAttribute(MA.RESULT_COUNT, newOnly.length);
            return newOnly;
          }
          case "watchlist":
            span.setAttribute(MA.RESULT_COUNT, Math.min(sorted.length, 5));
            return sorted.slice(0, 5);
          default: {
            // Custom sort by column
            const sortKey = sort as keyof typeof sorted[0];
            sorted.sort((a, b) => {
              const aVal = typeof a[sortKey] === "number" ? (a[sortKey] as number) : 0;
              const bVal = typeof b[sortKey] === "number" ? (b[sortKey] as number) : 0;
              return order === "desc" ? bVal - aVal : aVal - bVal;
            });
            break;
          }
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
      'marketplace.tokens.paginate',
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

    // --- Extract sparkline data for each token in the page ---
    const withSparkline = await withSpan(
      tracer,
      'marketplace.tokens.sparkline_extraction',
      { [MA.RESULT_COUNT]: paginated.length },
      async (span) => {
        const results = paginated.map((t) => ({
          ...t,
          sparkline: getSparklineData(t.priceHistory, 20).map((p) => p.price),
          priceHistory: undefined,
        }));
        span.setAttribute(MA.RESULT_COUNT, results.length);
        return results;
      }
    );

    rootSpan.setAttribute(MA.PAGINATION_TOTAL, total);
    rootSpan.setAttribute(MA.RESULT_COUNT, withSparkline.length);

    return NextResponse.json({
      data: withSparkline,
      total,
      limit,
      offset,
      hasMore,
    });
  });
}
