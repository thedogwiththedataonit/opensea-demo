/**
 * GET /api/nfts/[slug]/[tokenId]
 *
 * Single NFT detail with traits, activity, and on-chain metadata.
 *
 * Status codes: 200, 404, 500, 503, 429
 * Error codes: COLLECTION_NOT_FOUND, NFT_NOT_FOUND, NFT_LOOKUP_FAILED, BUSYBOX_*
 */

import { NextRequest, NextResponse } from "next/server";
import { nftsByCollection } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError } from "@/app/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; tokenId: string }> }
) {
  ensurePriceEngine();
  const { slug, tokenId } = await params;

  return withSpan(tracer, 'marketplace.nft.detail', { [MA.COLLECTION_SLUG]: slug, [MA.NFT_TOKEN_ID]: tokenId }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/nfts/[slug]/[tokenId]', slug, tokenId });
      maybeFault('http503', { route: '/api/nfts/[slug]/[tokenId]' });
      maybeFault('http429', { route: '/api/nfts/[slug]/[tokenId]' });

      await simulateLatency(25, 70);

      const nfts = await withSpan(tracer, 'marketplace.nft.collection_lookup', { [MA.COLLECTION_SLUG]: slug }, async (span) => {
        const found = nftsByCollection[slug];
        span.setAttribute(MA.RESULT_COUNT, found ? found.length : 0);
        return found;
      });

      if (!nfts) {
        throw new NotFoundError('COLLECTION_NOT_FOUND', `Collection "${slug}" not found`, { slug });
      }

      const nft = await withSpan(tracer, 'marketplace.nft.token_lookup', { [MA.COLLECTION_SLUG]: slug, [MA.NFT_TOKEN_ID]: tokenId }, async (span) => {
        const found = nfts.find((n) => n.tokenId === tokenId);
        if (found) {
          span.setAttribute(MA.NFT_IS_LISTED, found.isListed);
          span.setAttribute(MA.NFT_RARITY_RANK, found.rarity);
          span.setAttribute(MA.NFT_TRAIT_COUNT, found.properties.length);
          span.setAttribute(MA.NFT_ACTIVITY_COUNT, found.activityHistory.length);
          span.setAttribute(MA.CHAIN, found.chain);
        }
        return found;
      });

      if (!nft) {
        throw new NotFoundError('NFT_NOT_FOUND', `NFT "${tokenId}" not found in collection "${slug}"`, { slug, tokenId });
      }

      rootSpan.setAttribute(MA.NFT_IS_LISTED, nft.isListed);
      rootSpan.setAttribute(MA.CHAIN, nft.chain);
      return NextResponse.json(nft);
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
