/**
 * OpenSea Marketplace — Price Simulation Engine
 *
 * Server-side price simulation that applies random walk deltas to all tokens
 * and collection floor prices every 3 seconds. This creates realistic live
 * data for the mock marketplace without any external dependencies.
 *
 * Key exported functions (getSparklineData, getOHLCData) are instrumented
 * with OpenTelemetry spans to provide visibility into price data processing
 * within API request traces.
 */

import { tokens } from "./data/tokens";
import { collections } from "./data/collections";
import { PricePoint } from "./data/types";
import { tracer, MarketplaceAttributes as MA } from "./tracing";

// Module-scoped flag to ensure we only start the engine once
let engineStarted = false;

/**
 * Starts the price simulation engine (idempotent).
 *
 * Called by every API route handler on entry. Uses a module-scoped boolean
 * to ensure the setInterval is only created once per server process.
 *
 * Every 3 seconds the engine:
 *  - Applies random walk to each token's price, change%, volume, and FDV
 *  - Pushes new PricePoint entries to each token's priceHistory
 *  - Drifts each collection's floorPrice and change percentages
 */
export function ensurePriceEngine(): void {
  if (engineStarted) return;
  engineStarted = true;

  setInterval(() => {
    const now = Date.now();

    // Update token prices
    for (const token of tokens) {
      const volatility = token.isNew ? 0.015 : 0.004;
      const delta = (Math.random() - 0.48) * volatility;
      token.price = Math.max(token.price * (1 + delta), 0.0000001);

      // Update change percentages with slight drift
      token.change1h += (Math.random() - 0.5) * 0.3;
      token.change1d += (Math.random() - 0.5) * 0.1;
      token.change30d += (Math.random() - 0.5) * 0.05;

      // Push new price point
      token.priceHistory.push({ timestamp: now, price: token.price });

      // Keep last 2880 points (~48h at 1 per minute, but we push faster so trim)
      if (token.priceHistory.length > 2880) {
        token.priceHistory = token.priceHistory.slice(-2880);
      }

      // Slightly drift volume
      token.volume1d = Math.max(0, token.volume1d * (1 + (Math.random() - 0.5) * 0.005));
      token.fdv = token.price * (token.fdv / (token.price / (1 + delta) || 1));
    }

    // Update collection floor prices
    for (const collection of collections) {
      const delta = (Math.random() - 0.5) * 0.003;
      collection.floorPrice = Math.max(collection.floorPrice * (1 + delta), 0.0001);
      collection.change1d += (Math.random() - 0.5) * 0.1;
      collection.change7d += (Math.random() - 0.5) * 0.05;
    }
  }, 3000);
}

/**
 * Returns the most recent N price points for sparkline rendering.
 *
 * Instrumented with an OpenTelemetry span that records the requested point count,
 * source history size, and actual points returned — useful for diagnosing
 * sparkline rendering issues or detecting tokens with insufficient history.
 *
 * @param priceHistory - Full price history array for a token
 * @param points       - Number of most recent points to extract (default: 20)
 */
export function getSparklineData(priceHistory: PricePoint[], points: number = 20): PricePoint[] {
  const span = tracer.startSpan('marketplace.price.sparkline', {
    attributes: {
      [MA.SPARKLINE_POINTS_REQUESTED]: points,
      [MA.SPARKLINE_HISTORY_SIZE]: priceHistory.length,
    },
  });

  let result: PricePoint[];
  if (priceHistory.length <= points) {
    result = [...priceHistory];
  } else {
    result = priceHistory.slice(-points);
  }

  span.setAttribute(MA.SPARKLINE_POINTS_RETURNED, result.length);
  span.end();
  return result;
}

/**
 * Generate OHLC (Open-High-Low-Close) candle data from raw price history.
 *
 * Instrumented with an OpenTelemetry span that records the timeframe window,
 * candle interval, number of input price points processed, and number of
 * output candles generated — critical for diagnosing chart rendering latency
 * and data density issues.
 *
 * @param priceHistory     - Full price history array
 * @param timeframeMinutes - Window size in minutes to include (e.g. 60 for 1h)
 * @param intervalMinutes  - Candle bucket width in minutes (e.g. 1 for 1m candles)
 */
export function getOHLCData(
  priceHistory: PricePoint[],
  timeframeMinutes: number,
  intervalMinutes: number
): { timestamp: number; open: number; high: number; low: number; close: number }[] {
  const span = tracer.startSpan('marketplace.price.ohlc', {
    attributes: {
      [MA.CHART_TIMEFRAME]: `${timeframeMinutes}m`,
      [MA.CHART_INTERVAL]: `${intervalMinutes}m`,
    },
  });

  const now = Date.now();
  const cutoff = now - timeframeMinutes * 60000;
  const filtered = priceHistory.filter((p) => p.timestamp >= cutoff);

  span.setAttribute(MA.CHART_INPUT_POINTS, filtered.length);

  if (filtered.length === 0) {
    span.setAttribute(MA.CHART_CANDLE_COUNT, 0);
    span.end();
    return [];
  }

  const ohlc: { timestamp: number; open: number; high: number; low: number; close: number }[] = [];
  const intervalMs = intervalMinutes * 60000;

  // Bucket start
  let bucketStart = Math.floor(filtered[0].timestamp / intervalMs) * intervalMs;
  let bucket: PricePoint[] = [];

  for (const point of filtered) {
    const pointBucket = Math.floor(point.timestamp / intervalMs) * intervalMs;
    if (pointBucket !== bucketStart && bucket.length > 0) {
      ohlc.push({
        timestamp: bucketStart,
        open: bucket[0].price,
        high: Math.max(...bucket.map((p) => p.price)),
        low: Math.min(...bucket.map((p) => p.price)),
        close: bucket[bucket.length - 1].price,
      });
      bucket = [];
      bucketStart = pointBucket;
    }
    bucket.push(point);
  }

  // Last bucket
  if (bucket.length > 0) {
    ohlc.push({
      timestamp: bucketStart,
      open: bucket[0].price,
      high: Math.max(...bucket.map((p) => p.price)),
      low: Math.min(...bucket.map((p) => p.price)),
      close: bucket[bucket.length - 1].price,
    });
  }

  span.setAttribute(MA.CHART_CANDLE_COUNT, ohlc.length);
  span.end();
  return ohlc;
}
