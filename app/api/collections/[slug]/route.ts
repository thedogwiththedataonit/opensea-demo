/**
 * GET /api/collections/[slug]
 *
 * Returns the full detail for a single NFT collection identified by its
 * URL-safe slug. Returns 404 if the collection is not found.
 *
 * Trace structure:
 *   marketplace.collection.detail
 *     ├── marketplace.infra.latency_simulation
 *     └── marketplace.collection.lookup
 */

import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  ensurePriceEngine();

  const { slug } = await params;

  return withSpan(tracer, 'marketplace.collection.detail', {
    [MA.COLLECTION_SLUG]: slug,
  }, async (rootSpan) => {
    await simulateLatency(20, 60);

    // --- Look up collection by slug ---
    const collection = await withSpan(
      tracer,
      'marketplace.collection.lookup',
      { [MA.COLLECTION_SLUG]: slug },
      async (span) => {
        const found = collections.find((c) => c.slug === slug);
        if (found) {
          span.setAttribute(MA.COLLECTION_NAME, found.name);
          span.setAttribute(MA.COLLECTION_VERIFIED, found.verified);
          span.setAttribute(MA.CHAIN, found.chain);
        }
        return found;
      }
    );

    if (!collection) {
      rootSpan.setAttribute('error', true);
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    rootSpan.setAttribute(MA.COLLECTION_NAME, collection.name);
    rootSpan.setAttribute(MA.CHAIN, collection.chain);

    return NextResponse.json(collection);
  });
}
