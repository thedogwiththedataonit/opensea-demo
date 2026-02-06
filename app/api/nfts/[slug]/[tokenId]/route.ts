/**
 * GET /api/nfts/[slug]/[tokenId]
 *
 * Single NFT detail with traits, activity, comments, and on-chain metadata.
 *
 * Trace structure:
 *   marketplace.nft.detail (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.nft.collection_lookup (opensea-data-service)
 *     ├── marketplace.nft.token_lookup (opensea-data-service)
 *     └── marketplace.nft.comments_generation (opensea-enrichment)
 */

import { NextRequest, NextResponse } from "next/server";
import { nftsByCollection } from "@/app/lib/data/collections";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTracer, mongoTracer, reservoirTracer, withSpan, MarketplaceAttributes as MA, recordEdgeHeaders, tagSpanService, emitEdgeMiddlewareSpan } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError } from "@/app/lib/errors";
import { faker } from "@faker-js/faker";
import { log } from "@/app/lib/logger";

export const dynamic = "force-dynamic";

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

interface Comment {
  id: string;
  author: string;
  authorAvatar: string;
  text: string;
  timestamp: number;
  likes: number;
}

function generateComments(slug: string, tokenId: string): Comment[] {
  faker.seed(Math.abs(hashCode(slug + tokenId + "comments")));
  const count = faker.number.int({ min: 3, max: 8 });
  const comments: Comment[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    comments.push({
      id: `comment-${slug}-${tokenId}-${i}`,
      author: faker.internet.username(),
      authorAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${faker.string.alphanumeric(8)}`,
      text: faker.helpers.arrayElement([
        faker.lorem.sentence({ min: 5, max: 15 }),
        `${faker.word.adjective()} piece! Love the ${faker.word.noun()} on this one.`,
        `Floor is going ${faker.helpers.arrayElement(["up", "to the moon", "crazy"])} 🚀`,
        `I've been watching this collection for ${faker.number.int({ min: 1, max: 12 })} months`,
        `${faker.helpers.arrayElement(["WAGMI", "LFG", "Diamond hands", "This is the way"])} 💎`,
        `The ${faker.word.adjective()} traits make this one special`,
        `Reminds me of the early days when floor was ${faker.number.float({ min: 0.01, max: 2, fractionDigits: 2 })} ETH`,
      ]),
      timestamp: now - faker.number.int({ min: 3600000, max: 86400000 * 30 }),
      likes: faker.number.int({ min: 0, max: 42 }),
    });
  }

  return comments.sort((a, b) => b.timestamp - a.timestamp);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; tokenId: string }> }
) {
  ensurePriceEngine();
  const { slug, tokenId } = await params;

  return apiTracer.startActiveSpan('marketplace.nft.detail', {
    attributes: {
      [MA.HTTP_METHOD]: 'GET',
      [MA.HTTP_ROUTE]: '/api/nfts/[slug]/[tokenId]',
      [MA.COLLECTION_SLUG]: slug, [MA.NFT_TOKEN_ID]: tokenId,
    },
  }, async (rootSpan) => {
    tagSpanService(rootSpan, 'opensea-api-gateway');
    emitEdgeMiddlewareSpan(request.headers);
    recordEdgeHeaders(rootSpan, request.headers);
    const _start = Date.now();
    log.info('api-gateway', 'GET /api/nfts/[slug]/[tokenId]', { slug, tokenId });
    try {
      maybeFault('http500', { route: '/api/nfts/[slug]/[tokenId]', slug, tokenId });
      maybeFault('http502', { route: '/api/nfts/[slug]/[tokenId]' });
      maybeFault('http503', { route: '/api/nfts/[slug]/[tokenId]' });
      maybeFault('http429', { route: '/api/nfts/[slug]/[tokenId]' });

      await simulateLatency(25, 70);

      const nfts = await withSpan(mongoTracer, 'marketplace.nft.collection_lookup', {
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

      const nft = await withSpan(mongoTracer, 'marketplace.nft.token_lookup', {
        [MA.COLLECTION_SLUG]: slug, [MA.NFT_TOKEN_ID]: tokenId,
        [MA.DB_OPERATION]: 'read', [MA.DB_COLLECTION]: 'nfts', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
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

      // Generate dynamic comments via faker.js
      const comments = await withSpan(reservoirTracer, 'marketplace.nft.comments_generation', {
        [MA.COLLECTION_SLUG]: slug, [MA.NFT_TOKEN_ID]: tokenId,
        [MA.ENRICHMENT_SOURCE]: 'reservoir', [MA.DB_OPERATION]: 'read',
        [MA.DB_COLLECTION]: 'comments', [MA.DATA_SOURCE]: 'reservoir-api',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const generated = generateComments(slug, tokenId);
        span.setAttribute(MA.RESULT_COUNT, generated.length);
        return generated;
      });

      rootSpan.setAttribute(MA.NFT_IS_LISTED, nft.isListed);
      rootSpan.setAttribute(MA.CHAIN, nft.chain);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, 1);
      rootSpan.setStatus({ code: SpanStatusCode.OK });
      log.info('data-service', 'nft_viewed', {
        status: 200, duration: `${Date.now() - _start}ms`,
        nft: nft.name, collection: slug, tokenId,
        owner: nft.owner, chain: nft.chain, rarity: `#${nft.rarity}`,
        listed: nft.isListed,
        price: nft.isListed && nft.currentPrice ? `${nft.currentPrice.toFixed(4)} ${nft.currentCurrency}` : 'unlisted',
        lastSale: nft.lastSalePrice ? `${nft.lastSalePrice.toFixed(4)} ${nft.lastSaleCurrency}` : 'none',
        traits: nft.properties.length, activity: nft.activityHistory.length, comments: comments.length,
      });
      return NextResponse.json({ ...nft, comments });
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    } finally {
      rootSpan.end();
    }
  });
}
