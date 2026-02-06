"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface RealtimeOHLCPoint {
  timestamp: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface UseRealtimeChartDataOptions {
  /** Number of data points to maintain */
  pointCount?: number;
  /** Interval in ms between updates */
  updateIntervalMs?: number;
  /** Starting price — seed value */
  basePrice?: number;
  /** Max percent change per tick (0-1, e.g. 0.02 = 2%) */
  volatility?: number;
  /** Timeframe label for formatting timestamps */
  timeframe?: string;
}

/**
 * Generates and maintains a stream of mock OHLC price data on the client,
 * updating at the specified interval to simulate real-time chart data.
 */
export function useRealtimeChartData({
  pointCount = 60,
  updateIntervalMs = 2000,
  basePrice = 100,
  volatility = 0.015,
  timeframe = "1h",
}: UseRealtimeChartDataOptions = {}) {
  const priceRef = useRef(basePrice);
  const [data, setData] = useState<RealtimeOHLCPoint[]>([]);

  // Seed the initial dataset
  const seedData = useCallback(() => {
    const now = Date.now();
    const intervalGap = getIntervalGapMs(timeframe);
    let price = basePrice;
    const points: RealtimeOHLCPoint[] = [];

    for (let i = pointCount; i > 0; i--) {
      const ts = now - i * intervalGap;
      const change = (Math.random() - 0.48) * volatility * price;
      const open = price;
      price = Math.max(price + change, price * 0.01);
      const close = price;
      const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
      const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);

      points.push({
        timestamp: ts,
        time: formatTimestamp(ts, timeframe),
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(close),
      });
    }

    priceRef.current = price;
    setData(points);
  }, [basePrice, pointCount, volatility, timeframe]);

  // Push a new tick and shift the window
  const tick = useCallback(() => {
    setData((prev) => {
      const lastPrice = priceRef.current;
      const change = (Math.random() - 0.48) * volatility * lastPrice;
      const open = lastPrice;
      const close = Math.max(lastPrice + change, lastPrice * 0.01);
      const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
      const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
      const ts = Date.now();

      priceRef.current = close;

      const newPoint: RealtimeOHLCPoint = {
        timestamp: ts,
        time: formatTimestamp(ts, timeframe),
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(close),
      };

      const next = [...prev, newPoint];
      if (next.length > pointCount) next.shift();
      return next;
    });
  }, [volatility, pointCount, timeframe]);

  // Initialize + start interval
  useEffect(() => {
    seedData();
    const id = setInterval(tick, updateIntervalMs);
    return () => clearInterval(id);
  }, [seedData, tick, updateIntervalMs]);

  // Compute summary stats
  const currentPrice = data.length ? data[data.length - 1].close : basePrice;
  const openPrice = data.length ? data[0].open : basePrice;
  const priceChange = currentPrice - openPrice;
  const priceChangePct = openPrice !== 0 ? (priceChange / openPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  return { data, currentPrice, priceChange, priceChangePct, isPositive };
}

// ---- Helpers ----

function round(n: number): number {
  if (n >= 100) return Math.round(n * 100) / 100;
  if (n >= 1) return Math.round(n * 10000) / 10000;
  return Math.round(n * 1000000) / 1000000;
}

function getIntervalGapMs(timeframe: string): number {
  switch (timeframe) {
    case "1h": return 60_000;        // 1 min candles
    case "1d": return 300_000;       // 5 min candles
    case "7d": return 3_600_000;     // 1 hr candles
    case "30d": return 14_400_000;   // 4 hr candles
    default: return 60_000;
  }
}

function formatTimestamp(ts: number, timeframe: string): string {
  const d = new Date(ts);
  if (timeframe === "1h" || timeframe === "1d") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
