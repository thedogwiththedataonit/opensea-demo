/**
 * Server-side faker.js enrichment utilities — fully instrumented with OTel.
 *
 * These functions simulate a live database by adding small random fluctuations
 * to collection / token data on each API request. Each function is wrapped in
 * an OpenTelemetry span under the `opensea-enrichment` tracer with simulated
 * I/O delays to produce realistic trace waterfalls.
 */

import { faker } from "@faker-js/faker";
import { Collection } from "./data/types";
import { alchemyTracer, coingeckoTracer, chainlinkTracer, etherscanTracer, reservoirTracer, withSpan, MarketplaceAttributes as MA } from "./tracing";
import { simulateDbLatency } from "./utils";
import { log } from "./logger";

// ---- Price / stat fluctuation helpers ----

/** Apply a small random fluctuation to a number (simulates live market data) */
export function fluctuate(value: number, maxPct: number = 0.5): number {
  const change = value * (faker.number.float({ min: -maxPct, max: maxPct, fractionDigits: 4 }) / 100);
  return Math.max(value + change, 0);
}

/** Apply fluctuations to a collection to simulate live db data */
export async function enrichCollection(c: Collection): Promise<Collection & { recentBuyers: string[] }> {
  return withSpan(alchemyTracer, 'marketplace.enrichment.collection', {
    [MA.ENRICHMENT_SOURCE]: 'alchemy',
    [MA.ENRICHMENT_FIELDS]: 6,
    [MA.COLLECTION_SLUG]: c.slug,
    [MA.DATA_SOURCE]: 'alchemy-nft-api',
  }, async (span) => {
    const delayMs = await simulateDbLatency('enrichment');
    span.setAttribute(MA.DB_DURATION_MS, delayMs);
    log.debug('enrichment', 'collection_enriched', { slug: c.slug, floor: `${c.floorPrice.toFixed(2)} ${c.floorCurrency}`, owners: c.ownerCount, delay: `${delayMs}ms` });

    faker.seed(undefined);
    const result = {
      ...c,
      floorPrice: fluctuate(c.floorPrice, 2),
      totalVolume: Math.round(fluctuate(c.totalVolume, 0.3)),
      ownerCount: Math.round(fluctuate(c.ownerCount, 0.1)),
      change1d: fluctuate(c.change1d, 5),
      change7d: fluctuate(c.change7d, 3),
      listedPct: parseFloat(fluctuate(c.listedPct, 1).toFixed(1)),
      recentBuyers: generateRecentBuyers(c.slug, 3),
    };
    span.setAttribute(MA.RESULT_COUNT, 1);
    return result;
  });
}

/** Generate a set of fake recent buyer wallet/ENS names */
function generateRecentBuyers(seed: string, count: number): string[] {
  const buyers: string[] = [];
  for (let i = 0; i < count; i++) {
    const roll = faker.number.int({ min: 0, max: 100 });
    if (roll < 35) {
      buyers.push(`${faker.internet.username().toLowerCase()}.eth`);
    } else {
      const addr = faker.finance.ethereumAddress();
      buyers.push(`${addr.slice(0, 6)}...${addr.slice(-4)}`);
    }
  }
  return buyers;
}

// ---- Marketplace-wide dynamic data ----

export interface MarketplaceStats {
  ethPrice: number;
  gasPrice: number;
  totalUsers: number;
  activeListings: number;
}

/** Generate dynamic marketplace stats (ETH price, gas, etc.) */
export async function generateMarketplaceStats(): Promise<MarketplaceStats> {
  return withSpan(chainlinkTracer, 'marketplace.enrichment.marketplace_stats', {
    [MA.ENRICHMENT_SOURCE]: 'chainlink',
    [MA.DATA_SOURCE]: 'chainlink-oracle',
    [MA.ENRICHMENT_FIELDS]: 4,
  }, async (span) => {
    const delayMs = await simulateDbLatency('external_api');
    span.setAttribute(MA.DB_DURATION_MS, delayMs);
    log.debug('enrichment', 'marketplace_stats_fetched', { source: 'price_oracle', delay: `${delayMs}ms` });

    faker.seed(undefined);
    const stats = {
      ethPrice: fluctuate(1879.47, 0.3),
      gasPrice: fluctuate(16.48, 8),
      totalUsers: Math.round(fluctuate(2_400_000, 0.05)),
      activeListings: Math.round(fluctuate(185_000, 0.5)),
    };
    span.setAttribute('marketplace.stats.eth_price', stats.ethPrice);
    span.setAttribute('marketplace.stats.gas_price', stats.gasPrice);
    return stats;
  });
}

// ---- Token enrichment ----

export interface EnrichedTokenFields {
  price: number;
  fdv: number;
  volume1d: number;
  volume7d: number;
  change1h: number;
  change1d: number;
  change30d: number;
}

/** Apply price fluctuations to a token to simulate live market data */
export async function enrichTokenFields(t: EnrichedTokenFields): Promise<EnrichedTokenFields> {
  return withSpan(coingeckoTracer, 'marketplace.enrichment.token', {
    [MA.ENRICHMENT_SOURCE]: 'coingecko',
    [MA.ENRICHMENT_FIELDS]: 7,
    [MA.DATA_SOURCE]: 'coingecko-api',
  }, async (span) => {
    const delayMs = await simulateDbLatency('enrichment');
    span.setAttribute(MA.DB_DURATION_MS, delayMs);
    log.debug('enrichment', 'token_price_enriched', { price: `$${t.price < 1 ? t.price.toFixed(6) : t.price.toFixed(2)}`, delay: `${delayMs}ms` });

    faker.seed(undefined);
    const newPrice = fluctuate(t.price, 1.5);
    const priceRatio = newPrice / t.price;
    const result = {
      price: newPrice,
      fdv: Math.round(t.fdv * priceRatio),
      volume1d: Math.round(fluctuate(t.volume1d, 3)),
      volume7d: Math.round(fluctuate(t.volume7d, 1)),
      change1h: fluctuate(t.change1h, 10),
      change1d: fluctuate(t.change1d, 5),
      change30d: fluctuate(t.change30d, 2),
    };
    span.setAttribute(MA.TOKEN_PRICE_USD, result.price);
    return result;
  });
}

// ---- Recent transactions generator for token detail ----

export interface RecentTransaction {
  hash: string;
  type: "buy" | "sell" | "transfer";
  from: string;
  to: string;
  amount: number;
  tokenSymbol: string;
  valueUsd: number;
  timestamp: number;
}

export async function generateRecentTransactions(symbol: string, price: number, count: number = 5): Promise<RecentTransaction[]> {
  return withSpan(etherscanTracer, 'marketplace.enrichment.transactions', {
    [MA.ENRICHMENT_SOURCE]: 'etherscan',
    [MA.DATA_SOURCE]: 'etherscan-api',
    [MA.TOKEN_SYMBOL]: symbol,
    [MA.DB_OPERATION]: 'read',
  }, async (span) => {
    const delayMs = await simulateDbLatency('db_read');
    span.setAttribute(MA.DB_DURATION_MS, delayMs);
    log.debug('enrichment', 'recent_transactions_generated', { token: symbol, count, pricePerUnit: `$${price < 1 ? price.toFixed(6) : price.toFixed(2)}`, delay: `${delayMs}ms` });

    faker.seed(undefined);
    const now = Date.now();
    const txns: RecentTransaction[] = [];

    for (let i = 0; i < count; i++) {
      const type = faker.helpers.arrayElement(["buy", "sell", "transfer"] as const);
      const amount = faker.number.float({ min: 10, max: 500000, fractionDigits: 2 });
      const fromRoll = faker.number.int({ min: 0, max: 100 });
      const toRoll = faker.number.int({ min: 0, max: 100 });

      txns.push({
        hash: `0x${faker.string.hexadecimal({ length: 64, casing: "lower", prefix: "" })}`,
        type,
        from: fromRoll < 30 ? `${faker.internet.username().toLowerCase()}.eth` : (() => { const a = faker.finance.ethereumAddress(); return `${a.slice(0, 6)}...${a.slice(-4)}`; })(),
        to: toRoll < 30 ? `${faker.internet.username().toLowerCase()}.eth` : (() => { const a = faker.finance.ethereumAddress(); return `${a.slice(0, 6)}...${a.slice(-4)}`; })(),
        amount,
        tokenSymbol: symbol,
        valueUsd: amount * price,
        timestamp: now - faker.number.int({ min: 60000, max: 3600000 * 4 }),
      });
    }

    const sorted = txns.sort((a, b) => b.timestamp - a.timestamp);
    span.setAttribute(MA.RESULT_COUNT, sorted.length);
    return sorted;
  });
}
