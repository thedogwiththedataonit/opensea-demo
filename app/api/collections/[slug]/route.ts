/**
 * GET /api/collections/[slug]
 *
 * Single collection detail by slug.
 *
 * Trace structure:
 *   marketplace.collection.detail (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     └── marketplace.collection.lookup (opensea-data-service)
 */

import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTracer, mongoTracer, withSpan, MarketplaceAttributes as MA, recordEdgeHeaders, tagSpanService } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError } from "@/app/lib/errors";
import { log } from "@/app/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  ensurePriceEngine();
  const { slug } = await params;

  return apiTracer.startActiveSpan('marketplace.collection.detail', {
    attributes: {
      [MA.HTTP_METHOD]: 'GET',
      [MA.HTTP_ROUTE]: '/api/collections/[slug]',
      [MA.COLLECTION_SLUG]: slug,
    },
  }, async (rootSpan) => {
    tagSpanService(rootSpan, 'opensea-api-gateway');
    recordEdgeHeaders(rootSpan, request.headers);
    const _start = Date.now();
    log.info('api-gateway', 'GET /api/collections/[slug]', { slug });
    try {
      maybeFault('http500', { route: '/api/collections/[slug]', slug });
      maybeFault('http502', { route: '/api/collections/[slug]' });
      maybeFault('http503', { route: '/api/collections/[slug]' });
      maybeFault('http429', { route: '/api/collections/[slug]' });

      await simulateLatency(20, 60);

      const collection = await withSpan(mongoTracer, 'marketplace.collection.lookup', {
        [MA.COLLECTION_SLUG]: slug,
        [MA.DB_OPERATION]: 'read',
        [MA.DB_COLLECTION]: 'collections',
        [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const found = collections.find((c) => c.slug === slug);
        if (found) {
          span.setAttribute(MA.COLLECTION_NAME, found.name);
          span.setAttribute(MA.COLLECTION_VERIFIED, found.verified);
          span.setAttribute(MA.CHAIN, found.chain);
        }
        return found;
      });

      if (!collection) {
        throw new NotFoundError('COLLECTION_NOT_FOUND', `Collection "${slug}" not found`, { slug });
      }

      rootSpan.setAttribute(MA.COLLECTION_NAME, collection.name);
      rootSpan.setAttribute(MA.CHAIN, collection.chain);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, 1);
      rootSpan.setStatus({ code: SpanStatusCode.OK });
      log.info('data-service', 'collection_viewed', {
        status: 200, duration: `${Date.now() - _start}ms`,
        collection: collection.name, slug, chain: collection.chain,
        floor: `${collection.floorPrice.toFixed(4)} ${collection.floorCurrency}`,
        volume: `${Math.round(collection.totalVolume/1000)}K ${collection.totalVolumeCurrency}`,
        items: collection.itemCount, owners: collection.ownerCount,
        change24h: `${collection.change1d >= 0 ? '+' : ''}${collection.change1d.toFixed(1)}%`,
        verified: collection.verified,
      });
      return NextResponse.json(collection);
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    } finally {
      rootSpan.end();
    }
  });
}
