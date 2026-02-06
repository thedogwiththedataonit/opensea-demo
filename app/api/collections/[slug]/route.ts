/**
 * GET /api/collections/[slug]
 *
 * Single collection detail by slug.
 *
 * Status codes: 200, 404, 500, 503, 429
 * Error codes: COLLECTION_NOT_FOUND, COLLECTION_LOOKUP_FAILED, BUSYBOX_*
 */

import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
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

  return withSpan(tracer, 'marketplace.collection.detail', { [MA.COLLECTION_SLUG]: slug }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/collections/[slug]', slug });
      maybeFault('http503', { route: '/api/collections/[slug]' });
      maybeFault('http429', { route: '/api/collections/[slug]' });

      await simulateLatency(20, 60);

      const collection = await withSpan(tracer, 'marketplace.collection.lookup', { [MA.COLLECTION_SLUG]: slug }, async (span) => {
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
      return NextResponse.json(collection);
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
