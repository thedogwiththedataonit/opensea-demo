/**
 * GET /api/tokens
 *
 * Paginated, filtered, sorted token list with sparkline data.
 *
 * Trace structure:
 *   marketplace.tokens.list (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.tokens.filter (opensea-data-service)
 *     ├── marketplace.tokens.tab_sort (opensea-data-service)
 *     ├── marketplace.tokens.paginate (opensea-data-service)
 *     └── marketplace.tokens.sparkline_extraction (opensea-data-service)
 *           ├── marketplace.price.sparkline xN (opensea-price-engine)
 *           └── marketplace.enrichment.token xN (opensea-enrichment)
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getSparklineData } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTracer, dataTracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { ValidationError } from "@/app/lib/errors";
import { enrichTokenFields } from "@/app/lib/faker-enrich";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  ensurePriceEngine();

  const { searchParams } = request.nextUrl;
  const tab = searchParams.get("tab") || "trending";
  const chain = searchParams.get("chain") || "all";
  const sort = searchParams.get("sort") || "volume1d";
  const order = searchParams.get("order") || "desc";
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");
  const fdvMin = parseFloat(searchParams.get("fdvMin") || "0");
  const fdvMax = parseFloat(searchParams.get("fdvMax") || "999999999999");

  return apiTracer.startActiveSpan('marketplace.tokens.list', {
    attributes: {
      [MA.HTTP_METHOD]: 'GET',
      [MA.HTTP_ROUTE]: '/api/tokens',
      [MA.FILTER_TAB]: tab, [MA.FILTER_CHAIN]: chain, [MA.FILTER_SORT]: sort,
      [MA.FILTER_ORDER]: order, [MA.PAGINATION_LIMIT]: limit, [MA.PAGINATION_OFFSET]: offset,
    },
  }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/tokens' });
      maybeFault('http502', { route: '/api/tokens' });
      maybeFault('http503', { route: '/api/tokens' });
      maybeFault('http429', { route: '/api/tokens' });

      if (isNaN(limit) || limit < 1 || limit > 100) {
        throw new ValidationError('INVALID_PAGINATION', `Invalid limit: must be 1-100`, { limit: searchParams.get("limit") });
      }
      if (isNaN(offset) || offset < 0) {
        throw new ValidationError('INVALID_PAGINATION', `Invalid offset: must be >= 0`, { offset: searchParams.get("offset") });
      }

      await simulateLatency(30, 100);

      let filtered = await withSpan(dataTracer, 'marketplace.tokens.filter', {
        [MA.FILTER_CHAIN]: chain, [MA.FILTER_FDV_MIN]: fdvMin, [MA.FILTER_FDV_MAX]: fdvMax,
        [MA.DB_OPERATION]: 'scan', [MA.DB_COLLECTION]: 'tokens', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        let result = [...tokens];
        if (chain !== "all") result = result.filter((t) => t.chain === chain);
        result = result.filter((t) => t.fdv >= fdvMin && t.fdv <= fdvMax);
        span.setAttribute(MA.RESULT_COUNT, result.length);
        return result;
      });

      filtered = await withSpan(dataTracer, 'marketplace.tokens.tab_sort', {
        [MA.FILTER_TAB]: tab, [MA.FILTER_SORT]: sort, [MA.FILTER_ORDER]: order,
        [MA.DB_OPERATION]: 'aggregate', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('cache_hit');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const sorted = [...filtered];
        switch (tab) {
          case "trending": sorted.sort((a, b) => Math.abs(b.change1d) - Math.abs(a.change1d)); break;
          case "top": sorted.sort((a, b) => b.fdv - a.fdv); break;
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
      });

      const total = filtered.length;
      const hasMore = offset + limit < total;
      const paginated = await withSpan(dataTracer, 'marketplace.tokens.paginate', {
        [MA.PAGINATION_OFFSET]: offset, [MA.PAGINATION_LIMIT]: limit,
        [MA.PAGINATION_TOTAL]: total, [MA.PAGINATION_HAS_MORE]: hasMore,
        [MA.DB_OPERATION]: 'read',
      }, async (span) => {
        const delayMs = await simulateDbLatency('cache_hit');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const page = filtered.slice(offset, offset + limit);
        span.setAttribute(MA.RESULT_COUNT, page.length);
        return page;
      });

      const withSparklineData = await withSpan(dataTracer, 'marketplace.tokens.sparkline_extraction', {
        [MA.RESULT_COUNT]: paginated.length,
        [MA.DATA_SOURCE]: 'redis',
      }, async (span) => {
        const results = await Promise.all(paginated.map(async (t) => {
          const enriched = await enrichTokenFields(t);
          const sparkline = await getSparklineData(t.priceHistory, 20);
          return {
            ...t,
            ...enriched,
            sparkline: sparkline.map((p) => p.price),
            priceHistory: undefined,
          };
        }));
        span.setAttribute(MA.RESULT_COUNT, results.length);
        return results;
      });

      rootSpan.setAttribute(MA.PAGINATION_TOTAL, total);
      rootSpan.setAttribute(MA.RESULT_COUNT, withSparklineData.length);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, withSparklineData.length);
      rootSpan.setStatus({ code: SpanStatusCode.OK });
      return NextResponse.json({ data: withSparklineData, total, limit, offset, hasMore });
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    } finally {
      rootSpan.end();
    }
  });
}
