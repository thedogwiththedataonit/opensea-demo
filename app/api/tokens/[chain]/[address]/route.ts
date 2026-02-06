/**
 * GET /api/tokens/[chain]/[address]
 *
 * Single token detail by chain and contract address, with holder data.
 *
 * Status codes: 200, 404, 500, 503, 429
 * Error codes: TOKEN_NOT_FOUND, TOKEN_LOOKUP_FAILED, BUSYBOX_*
 *
 * Trace structure:
 *   marketplace.token.detail
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.token.lookup
 *     └── marketplace.token.holders_generation
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
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

function generateHolders(chain: string, address: string, symbol: string): Holder[] {
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

  return withSpan(tracer, 'marketplace.token.detail', { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/tokens/[chain]/[address]', chain, address });
      maybeFault('http502', { route: '/api/tokens/[chain]/[address]' });
      maybeFault('http503', { route: '/api/tokens/[chain]/[address]' });
      maybeFault('http429', { route: '/api/tokens/[chain]/[address]' });

      await simulateLatency(20, 60);

      const token = await withSpan(tracer, 'marketplace.token.lookup', { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address }, async (span) => {
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
      const holders = await withSpan(tracer, 'marketplace.token.holders_generation', { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address }, async (span) => {
        const generated = generateHolders(chain, address, token.symbol);
        span.setAttribute(MA.RESULT_COUNT, generated.length);
        return generated;
      });

      // Enrich token with live price fluctuations via faker.js
      const enriched = enrichTokenFields(token);
      // Generate recent transactions via faker.js
      const recentTransactions = await withSpan(tracer, 'marketplace.token.transactions_generation', { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address }, async (span) => {
        const txns = generateRecentTransactions(token.symbol, enriched.price, 5);
        span.setAttribute(MA.RESULT_COUNT, txns.length);
        return txns;
      });

      rootSpan.setAttribute(MA.TOKEN_SYMBOL, token.symbol);
      rootSpan.setAttribute(MA.TOKEN_PRICE_USD, enriched.price);
      const { priceHistory, ...tokenData } = token;
      return NextResponse.json({
        ...tokenData,
        ...enriched,
        recentPrices: priceHistory.slice(-20).map((p) => p.price),
        holders,
        recentTransactions,
      });
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
