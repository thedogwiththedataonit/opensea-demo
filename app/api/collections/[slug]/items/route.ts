/**
 * GET /api/collections/[slug]/items
 *
 * Paginated NFTs within a collection with status/sort/pagination filters.
 *
 * Trace structure:
 *   marketplace.collection.items (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.collection.items.lookup (opensea-data-service)
 *     ├── marketplace.collection.items.filter (opensea-data-service)
 *     ├── marketplace.collection.items.sort (opensea-data-service)
 *     └── marketplace.collection.items.paginate (opensea-data-service)
 */

import { NextRequest, NextResponse } from "next/server";
import { nftsByCollection } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { apiTracer, dataTracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError } from "@/app/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  ensurePriceEngine();
  const { slug } = await params;
  const { searchParams } = request.nextUrl;
  const sort = searchParams.get("sort") || "price";
  const status = searchParams.get("status") || "all";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  return withSpan(apiTracer, 'marketplace.collection.items', {
    [MA.HTTP_METHOD]: 'GET',
    [MA.HTTP_ROUTE]: '/api/collections/[slug]/items',
    [MA.COLLECTION_SLUG]: slug, [MA.FILTER_SORT]: sort, [MA.FILTER_STATUS]: status,
    [MA.PAGINATION_LIMIT]: limit, [MA.PAGINATION_OFFSET]: offset,
  }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/collections/[slug]/items', slug });
      maybeFault('http502', { route: '/api/collections/[slug]/items' });
      maybeFault('http503', { route: '/api/collections/[slug]/items' });
      maybeFault('http429', { route: '/api/collections/[slug]/items' });

      await simulateLatency(40, 120);

      const nfts = await withSpan(dataTracer, 'marketplace.collection.items.lookup', {
        [MA.COLLECTION_SLUG]: slug,
        [MA.DB_OPERATION]: 'read', [MA.DB_COLLECTION]: 'nfts', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const found = nftsByCollection[slug];
        span.setAttribute(MA.RESULT_COUNT, found ? found.length : 0);
        return found;
      });

      if (!nfts) {
        throw new NotFoundError('COLLECTION_NOT_FOUND', `Collection "${slug}" not found`, { slug });
      }

      let filtered = await withSpan(dataTracer, 'marketplace.collection.items.filter', {
        [MA.FILTER_STATUS]: status,
        [MA.DB_OPERATION]: 'scan', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('cache_hit');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        let result = [...nfts];
        if (status === "listed") result = result.filter((n) => n.isListed);
        span.setAttribute(MA.RESULT_COUNT, result.length);
        return result;
      });

      filtered = await withSpan(dataTracer, 'marketplace.collection.items.sort', {
        [MA.FILTER_SORT]: sort,
        [MA.DB_OPERATION]: 'aggregate', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('cache_hit');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const sorted = [...filtered];
        switch (sort) {
          case "price": sorted.sort((a, b) => (b.currentPrice || 0) - (a.currentPrice || 0)); break;
          case "rarity": sorted.sort((a, b) => a.rarity - b.rarity); break;
          case "recent": sorted.sort((a, b) => (b.activityHistory[0]?.timestamp || 0) - (a.activityHistory[0]?.timestamp || 0)); break;
          default: sorted.sort((a, b) => (b.currentPrice || 0) - (a.currentPrice || 0));
        }
        span.setAttribute(MA.RESULT_COUNT, sorted.length);
        return sorted;
      });

      const total = filtered.length;
      const hasMore = offset + limit < total;
      const paginated = await withSpan(dataTracer, 'marketplace.collection.items.paginate', {
        [MA.PAGINATION_OFFSET]: offset, [MA.PAGINATION_LIMIT]: limit, [MA.PAGINATION_TOTAL]: total, [MA.PAGINATION_HAS_MORE]: hasMore,
        [MA.DB_OPERATION]: 'read',
      }, async (span) => {
        const delayMs = await simulateDbLatency('cache_hit');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const page = filtered.slice(offset, offset + limit);
        span.setAttribute(MA.RESULT_COUNT, page.length);
        return page;
      });

      rootSpan.setAttribute(MA.PAGINATION_TOTAL, total);
      rootSpan.setAttribute(MA.RESULT_COUNT, paginated.length);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, paginated.length);
      return NextResponse.json({ data: paginated, total, limit, offset, hasMore });
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    }
  });
}
