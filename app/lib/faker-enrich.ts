/**
 * Server-side faker.js enrichment utilities.
 *
 * These functions simulate a live database by adding small random fluctuations
 * to collection / token data on each API request. They also generate dynamic
 * marketplace metadata (ETH price, gas, recent buyers, etc.) that would
 * normally come from on-chain data sources.
 *
 * All values are wrapped conceptually as "dynamic db call" results —
 * the frontend should render them inside <span className="dynamic-data"> tags.
 */

import { faker } from "@faker-js/faker";
import { Collection } from "./data/types";

// ---- Price / stat fluctuation helpers ----

/** Apply a small random fluctuation to a number (simulates live market data) */
export function fluctuate(value: number, maxPct: number = 0.5): number {
  const change = value * (faker.number.float({ min: -maxPct, max: maxPct, fractionDigits: 4 }) / 100);
  return Math.max(value + change, 0);
}

/** Apply fluctuations to a collection to simulate live db data */
export function enrichCollection(c: Collection): Collection & { recentBuyers: string[] } {
  faker.seed(undefined); // unseed for true randomness each call
  return {
    ...c,
    floorPrice: fluctuate(c.floorPrice, 2),
    totalVolume: Math.round(fluctuate(c.totalVolume, 0.3)),
    ownerCount: Math.round(fluctuate(c.ownerCount, 0.1)),
    change1d: fluctuate(c.change1d, 5),
    change7d: fluctuate(c.change7d, 3),
    listedPct: parseFloat(fluctuate(c.listedPct, 1).toFixed(1)),
    recentBuyers: generateRecentBuyers(c.slug, 3),
  };
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
export function generateMarketplaceStats(): MarketplaceStats {
  faker.seed(undefined);
  return {
    ethPrice: fluctuate(1879.47, 0.3),
    gasPrice: fluctuate(16.48, 8),
    totalUsers: Math.round(fluctuate(2_400_000, 0.05)),
    activeListings: Math.round(fluctuate(185_000, 0.5)),
  };
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
export function enrichTokenFields(t: EnrichedTokenFields): EnrichedTokenFields {
  faker.seed(undefined);
  const newPrice = fluctuate(t.price, 1.5);
  const priceRatio = newPrice / t.price;
  return {
    price: newPrice,
    fdv: Math.round(t.fdv * priceRatio),
    volume1d: Math.round(fluctuate(t.volume1d, 3)),
    volume7d: Math.round(fluctuate(t.volume7d, 1)),
    change1h: fluctuate(t.change1h, 10),
    change1d: fluctuate(t.change1d, 5),
    change30d: fluctuate(t.change30d, 2),
  };
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

export function generateRecentTransactions(symbol: string, price: number, count: number = 5): RecentTransaction[] {
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

  return txns.sort((a, b) => b.timestamp - a.timestamp);
}
