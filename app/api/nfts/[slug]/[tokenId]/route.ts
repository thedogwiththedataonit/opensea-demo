/**
 * GET /api/nfts/[slug]/[tokenId]
 *
 * Returns the full detail for a single NFT identified by its collection slug
 * and token ID. Includes all properties/traits, activity history, and
 * on-chain metadata. Returns 404 if collection or NFT is not found.
 *
 * Trace structure:
 *   marketplace.nft.detail
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.nft.collection_lookup
 *     └── marketplace.nft.token_lookup
 */

import { NextRequest, NextResponse } from "next/server";
import { nftsByCollection } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; tokenId: string }> }
) {
  ensurePriceEngine();

  const { slug, tokenId } = await params;

  return withSpan(tracer, 'marketplace.nft.detail', {
    [MA.COLLECTION_SLUG]: slug,
    [MA.NFT_TOKEN_ID]: tokenId,
  }, async (rootSpan) => {
    await simulateLatency(25, 70);

    // --- Look up the collection's NFT array ---
    const nfts = await withSpan(
      tracer,
      'marketplace.nft.collection_lookup',
      { [MA.COLLECTION_SLUG]: slug },
      async (span) => {
        const found = nftsByCollection[slug];
        span.setAttribute(MA.RESULT_COUNT, found ? found.length : 0);
        return found;
      }
    );

    if (!nfts) {
      rootSpan.setAttribute('error', true);
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // --- Find the specific NFT by token ID ---
    const nft = await withSpan(
      tracer,
      'marketplace.nft.token_lookup',
      {
        [MA.COLLECTION_SLUG]: slug,
        [MA.NFT_TOKEN_ID]: tokenId,
      },
      async (span) => {
        const found = nfts.find((n) => n.tokenId === tokenId);
        if (found) {
          span.setAttribute(MA.NFT_IS_LISTED, found.isListed);
          span.setAttribute(MA.NFT_RARITY_RANK, found.rarity);
          span.setAttribute(MA.NFT_TRAIT_COUNT, found.properties.length);
          span.setAttribute(MA.NFT_ACTIVITY_COUNT, found.activityHistory.length);
          span.setAttribute(MA.CHAIN, found.chain);
        }
        return found;
      }
    );

    if (!nft) {
      rootSpan.setAttribute('error', true);
      return NextResponse.json({ error: "NFT not found" }, { status: 404 });
    }

    rootSpan.setAttribute(MA.NFT_IS_LISTED, nft.isListed);
    rootSpan.setAttribute(MA.CHAIN, nft.chain);

    return NextResponse.json(nft);
  });
}
