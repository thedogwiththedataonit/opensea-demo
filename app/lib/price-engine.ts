/**
 * OpenSea Marketplace — Price Simulation Engine
 *
 * Server-side price simulation that applies random walk deltas to all tokens
 * and collection floor prices every 3 seconds. Key exported functions are
 * instrumented with OpenTelemetry spans under the `opensea-price-engine` tracer
 * and integrated with the busybox chaos engine for fault injection.
 */

import { tokens } from "./data/tokens";
import { collections } from "./data/collections";
import { PricePoint } from "./data/types";
import { redisTracer, withErrorSpan, MarketplaceAttributes as MA } from "./tracing";
import { maybeFault } from "./busybox";
import { SpanStatusCode } from "@opentelemetry/api";
import { log } from "./logger";

// Module-scoped flag to ensure we only start the engine once
let engineStarted = false;

/**
 * Starts the price simulation engine (idempotent).
 */
export function ensurePriceEngine(): void {
  if (engineStarted) return;
  engineStarted = true;
  log.info('price-engine', 'engine_started', { interval: '3000ms', tokens: tokens.length, collections: collections.length });

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
 * Instrumented with `opensea-price-engine` tracer. Includes a simulated
 * Redis cache lookup delay. On busybox subfunctionCrash, creates a dedicated
 * error child span with stack trace.
 */
export async function getSparklineData(priceHistory: PricePoint[], points: number = 20): Promise<PricePoint[]> {
  return redisTracer.startActiveSpan('marketplace.price.sparkline', {
    attributes: {
      [MA.SPARKLINE_POINTS_REQUESTED]: points,
      [MA.SPARKLINE_HISTORY_SIZE]: priceHistory.length,
      [MA.DATA_SOURCE]: 'redis',
      [MA.DB_OPERATION]: 'read',
    },
  }, async (span) => {
    try {
      // Simulate Redis cache lookup
      const cacheDelay = Math.round(1 + Math.random() * 4);
      await new Promise((resolve) => setTimeout(resolve, cacheDelay));
      span.setAttribute(MA.DB_DURATION_MS, cacheDelay);

      // Busybox fault injection point
      maybeFault('subfunctionCrash', { function: 'getSparklineData', points });

      let result: PricePoint[];
      if (priceHistory.length <= points) {
        result = [...priceHistory];
      } else {
        result = priceHistory.slice(-points);
      }

      span.setAttribute(MA.SPARKLINE_POINTS_RETURNED, result.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Sparkline computation failed',
      });
      span.setAttribute('error', true);
      span.setAttribute(MA.BUSYBOX_INJECTED, true);
      if (error instanceof Error) {
        span.recordException(error);
      }
      log.error('price-engine', 'marketplace.price.sparkline', {
        error: error instanceof Error ? error.message : 'unknown',
        points,
      });
      // Create dedicated error child span with stack trace
      await withErrorSpan(redisTracer, error, {
        [MA.ERROR_ORIGIN_SPAN]: 'marketplace.price.sparkline',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Generate OHLC candle data from raw price history.
 *
 * Instrumented with `opensea-price-engine` tracer. Includes a simulated
 * computation delay. On busybox subfunctionCrash, creates a dedicated
 * error child span with stack trace.
 */
export async function getOHLCData(
  priceHistory: PricePoint[],
  timeframeMinutes: number,
  intervalMinutes: number
): Promise<{ timestamp: number; open: number; high: number; low: number; close: number }[]> {
  return redisTracer.startActiveSpan('marketplace.price.ohlc', {
    attributes: {
      [MA.CHART_TIMEFRAME]: `${timeframeMinutes}m`,
      [MA.CHART_INTERVAL]: `${intervalMinutes}m`,
      [MA.DATA_SOURCE]: 'in-memory',
      [MA.DB_OPERATION]: 'aggregate',
    },
  }, async (span) => {
    try {
      // Simulate computation delay
      const computeDelay = Math.round(5 + Math.random() * 15);
      await new Promise((resolve) => setTimeout(resolve, computeDelay));
      span.setAttribute(MA.DB_DURATION_MS, computeDelay);

      // Busybox fault injection point
      maybeFault('subfunctionCrash', { function: 'getOHLCData', timeframeMinutes, intervalMinutes });

      const now = Date.now();
      const cutoff = now - timeframeMinutes * 60000;
      const filtered = priceHistory.filter((p) => p.timestamp >= cutoff);

      span.setAttribute(MA.CHART_INPUT_POINTS, filtered.length);

      if (filtered.length === 0) {
        span.setAttribute(MA.CHART_CANDLE_COUNT, 0);
        span.setStatus({ code: SpanStatusCode.OK });
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
      span.setStatus({ code: SpanStatusCode.OK });
      return ohlc;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'OHLC computation failed',
      });
      span.setAttribute('error', true);
      span.setAttribute(MA.BUSYBOX_INJECTED, true);
      if (error instanceof Error) {
        span.recordException(error);
      }
      log.error('price-engine', 'marketplace.price.ohlc', {
        error: error instanceof Error ? error.message : 'unknown',
        timeframe: `${timeframeMinutes}m`, interval: `${intervalMinutes}m`,
      });
      // Create dedicated error child span with stack trace
      await withErrorSpan(redisTracer, error, {
        [MA.ERROR_ORIGIN_SPAN]: 'marketplace.price.ohlc',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
