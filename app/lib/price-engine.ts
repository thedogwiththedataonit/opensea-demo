/**
 * OpenSea Marketplace — Price Simulation Engine
 *
 * Server-side price simulation that applies random walk deltas to all tokens
 * and collection floor prices every 3 seconds. Key exported functions are
 * instrumented with OpenTelemetry spans and integrated with the busybox
 * chaos engine for fault injection.
 */

import { tokens } from "./data/tokens";
import { collections } from "./data/collections";
import { PricePoint } from "./data/types";
import { tracer, MarketplaceAttributes as MA } from "./tracing";
import { maybeFault } from "./busybox";

// Module-scoped flag to ensure we only start the engine once
let engineStarted = false;

/**
 * Starts the price simulation engine (idempotent).
 */
export function ensurePriceEngine(): void {
  if (engineStarted) return;
  engineStarted = true;

  setInterval(() => {
    const now = Date.now();

    for (const token of tokens) {
      const volatility = token.isNew ? 0.015 : 0.004;
      const delta = (Math.random() - 0.48) * volatility;
      token.price = Math.max(token.price * (1 + delta), 0.0000001);
      token.change1h += (Math.random() - 0.5) * 0.3;
      token.change1d += (Math.random() - 0.5) * 0.1;
      token.change30d += (Math.random() - 0.5) * 0.05;
      token.priceHistory.push({ timestamp: now, price: token.price });
      if (token.priceHistory.length > 2880) {
        token.priceHistory = token.priceHistory.slice(-2880);
      }
      token.volume1d = Math.max(0, token.volume1d * (1 + (Math.random() - 0.5) * 0.005));
      token.fdv = token.price * (token.fdv / (token.price / (1 + delta) || 1));
    }

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
 * Busybox integration: when subfunctionCrash fault is enabled, this function
 * may throw an InternalError to simulate sparkline computation failures.
 */
export function getSparklineData(priceHistory: PricePoint[], points: number = 20): PricePoint[] {
  const span = tracer.startSpan('marketplace.price.sparkline', {
    attributes: {
      [MA.SPARKLINE_POINTS_REQUESTED]: points,
      [MA.SPARKLINE_HISTORY_SIZE]: priceHistory.length,
    },
  });

  try {
    // Busybox fault injection point
    maybeFault('subfunctionCrash', { function: 'getSparklineData', points });

    let result: PricePoint[];
    if (priceHistory.length <= points) {
      result = [...priceHistory];
    } else {
      result = priceHistory.slice(-points);
    }

    span.setAttribute(MA.SPARKLINE_POINTS_RETURNED, result.length);
    return result;
  } catch (error) {
    span.setAttribute('error', true);
    span.setAttribute(MA.BUSYBOX_INJECTED, true);
    if (error instanceof Error) {
      span.recordException(error);
    }
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Generate OHLC candle data from raw price history.
 *
 * Busybox integration: when subfunctionCrash fault is enabled, this function
 * may throw an InternalError to simulate OHLC computation failures.
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

  try {
    // Busybox fault injection point
    maybeFault('subfunctionCrash', { function: 'getOHLCData', timeframeMinutes, intervalMinutes });

    const now = Date.now();
    const cutoff = now - timeframeMinutes * 60000;
    const filtered = priceHistory.filter((p) => p.timestamp >= cutoff);

    span.setAttribute(MA.CHART_INPUT_POINTS, filtered.length);

    if (filtered.length === 0) {
      span.setAttribute(MA.CHART_CANDLE_COUNT, 0);
      return [];
    }

    const ohlc: { timestamp: number; open: number; high: number; low: number; close: number }[] = [];
    const intervalMs = intervalMinutes * 60000;

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
    return ohlc;
  } catch (error) {
    span.setAttribute('error', true);
    span.setAttribute(MA.BUSYBOX_INJECTED, true);
    if (error instanceof Error) {
      span.recordException(error);
    }
    throw error;
  } finally {
    span.end();
  }
}
