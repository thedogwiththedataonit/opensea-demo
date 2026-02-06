/**
 * GET /api/tokens/[chain]/[address]
 *
 * Single token detail by chain and contract address, with holder data and recent transactions.
 *
 * Trace structure:
 *   marketplace.token.detail (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.token.lookup (opensea-data-service)
 *     ├── marketplace.token.holders_generation (opensea-enrichment)
 *     ├── marketplace.enrichment.token (opensea-enrichment)
 *     └── marketplace.enrichment.transactions (opensea-enrichment)
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTracer, dataTracer, enrichTracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError } from "@/app/lib/errors";
import { faker } from "@faker-js/faker";
import { enrichTokenFields, generateRecentTransactions } from "@/app/lib/faker-enrich";

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

interface Holder {
  address: string;
  displayName: string;
  balance: number;
  percentage: number;
  avatar: string;
}

function generateHolders(chain: string, address: string): Holder[] {
  faker.seed(Math.abs(hashCode(chain + address + "holders")));
  const count = faker.number.int({ min: 5, max: 10 });
  const holders: Holder[] = [];
  let remaining = 100;

  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const pct = isLast
      ? remaining
      : faker.number.float({ min: 2, max: Math.min(remaining - (count - i - 1) * 2, 35), fractionDigits: 1 });
    remaining -= pct;

    const walletAddr = faker.finance.ethereumAddress();
    const hasEns = faker.number.int({ min: 0, max: 100 }) < 25;

    holders.push({
      address: walletAddr,
      displayName: hasEns ? `${faker.internet.username().toLowerCase()}.eth` : `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`,
      balance: faker.number.float({ min: 100, max: 5000000, fractionDigits: 2 }),
      percentage: Math.max(pct, 0.1),
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${walletAddr.slice(2, 10)}`,
    });
  }

  return holders.sort((a, b) => b.percentage - a.percentage);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> }
) {
  ensurePriceEngine();
  const { chain, address } = await params;

  return apiTracer.startActiveSpan('marketplace.token.detail', {
    attributes: {
      [MA.HTTP_METHOD]: 'GET',
      [MA.HTTP_ROUTE]: '/api/tokens/[chain]/[address]',
      [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address,
    },
  }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/tokens/[chain]/[address]', chain, address });
      maybeFault('http502', { route: '/api/tokens/[chain]/[address]' });
      maybeFault('http503', { route: '/api/tokens/[chain]/[address]' });
      maybeFault('http429', { route: '/api/tokens/[chain]/[address]' });

      await simulateLatency(20, 60);

      const token = await withSpan(dataTracer, 'marketplace.token.lookup', {
        [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address,
        [MA.DB_OPERATION]: 'read', [MA.DB_COLLECTION]: 'tokens', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const found = tokens.find((t) => t.chain === chain && t.address === address);
        if (found) {
          span.setAttribute(MA.TOKEN_SYMBOL, found.symbol);
          span.setAttribute(MA.TOKEN_IS_NEW, found.isNew);
          span.setAttribute(MA.TOKEN_PRICE_USD, found.price);
          span.setAttribute(MA.TOKEN_FDV, found.fdv);
        }
        return found;
      });

      if (!token) {
        throw new NotFoundError('TOKEN_NOT_FOUND', `Token not found on ${chain} at ${address}`, { chain, address });
      }

      // Generate dynamic holder data via faker.js
      const holders = await withSpan(enrichTracer, 'marketplace.token.holders_generation', {
        [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address,
        [MA.DB_OPERATION]: 'read', [MA.DB_COLLECTION]: 'holders', [MA.DATA_SOURCE]: 'blockchain_index',
        [MA.ENRICHMENT_SOURCE]: 'faker',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const generated = generateHolders(chain, address);
        span.setAttribute(MA.RESULT_COUNT, generated.length);
        return generated;
      });

      // Enrich token with live price fluctuations via faker.js
      const enriched = await enrichTokenFields(token);
      // Generate recent transactions via faker.js
      const recentTransactions = await generateRecentTransactions(token.symbol, enriched.price, 5);

      rootSpan.setAttribute(MA.TOKEN_SYMBOL, token.symbol);
      rootSpan.setAttribute(MA.TOKEN_PRICE_USD, enriched.price);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, 1);
      rootSpan.setStatus({ code: SpanStatusCode.OK });
      const { priceHistory, ...tokenData } = token;
      return NextResponse.json({
        ...tokenData,
        ...enriched,
        recentPrices: priceHistory.slice(-20).map((p) => p.price),
        holders,
        recentTransactions,
      });
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    } finally {
      rootSpan.end();
    }
  });
}
