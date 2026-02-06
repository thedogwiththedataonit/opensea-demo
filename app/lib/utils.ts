/**
 * OpenSea Marketplace — Shared Utilities
 *
 * Common helper functions used across API route handlers and components.
 * The simulateLatency function is instrumented with OpenTelemetry and
 * integrated with the busybox chaos engine for timeout fault injection.
 */

import { apiTracer, MarketplaceAttributes as MA } from './tracing';
import { shouldInjectFault } from './busybox';
import { log } from './logger';

// ---------------------------------------------------------------------------
// DB Latency Profiles
// ---------------------------------------------------------------------------

/** Delay profiles simulating different I/O operations */
export type LatencyProfile = 'cache_hit' | 'db_read' | 'db_write' | 'db_aggregate' | 'external_api' | 'enrichment';

const LATENCY_RANGES: Record<LatencyProfile, [number, number]> = {
  cache_hit:    [1, 5],
  db_read:      [8, 30],
  db_write:     [15, 45],
  db_aggregate: [20, 60],
  external_api: [50, 200],
  enrichment:   [5, 20],
};

/**
 * Simulate sub-operation I/O latency.
 *
 * Adds a short delay to make sub-spans look realistic in trace waterfalls.
 * Returns the actual delay applied (useful for setting DB_DURATION_MS attribute).
 *
 * @param profile - Which latency profile to use
 * @returns The delay in milliseconds that was applied
 */
export async function simulateDbLatency(profile: LatencyProfile): Promise<number> {
  const [min, max] = LATENCY_RANGES[profile];
  const delay = Math.round(min + Math.random() * (max - min));
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

// ---------------------------------------------------------------------------
// Network Latency Simulation (Top-Level)
// ---------------------------------------------------------------------------

/**
 * Simulate network/processing latency for realistic tracing.
 *
 * Creates an OpenTelemetry span to make the simulated delay visible in traces.
 * When busybox timeout mode is enabled, the delay is amplified to 3-8 seconds
 * to simulate timeout conditions in downstream services.
 *
 * @param min - Minimum delay in milliseconds (normal mode)
 * @param max - Maximum delay in milliseconds (normal mode)
 */
export async function simulateLatency(min: number = 20, max: number = 80): Promise<void> {
  // Check if busybox should inject a timeout
  const isTimeout = shouldInjectFault('timeout');
  const delay = isTimeout
    ? Math.round(3000 + Math.random() * 5000)  // 3-8 seconds under chaos
    : Math.round(min + Math.random() * (max - min));

  return apiTracer.startActiveSpan(
    'marketplace.infra.latency_simulation',
    {
      attributes: {
        [MA.INFRA_LATENCY_MIN_MS]: isTimeout ? 3000 : min,
        [MA.INFRA_LATENCY_MAX_MS]: isTimeout ? 8000 : max,
        [MA.INFRA_LATENCY_MS]: delay,
        [MA.BUSYBOX_INJECTED]: isTimeout,
        [MA.DATA_SOURCE]: 'network',
      },
    },
    async (span) => {
      if (isTimeout) {
        span.setAttribute(MA.BUSYBOX_FAULT_TYPE, 'timeout');
        log.warn('api-gateway', 'latency_simulation', { injected: 'timeout', delay: `${delay}ms` });
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      span.end();
    }
  );
}

// ---------------------------------------------------------------------------
// Formatting Helpers (no spans needed — pure functions)
// ---------------------------------------------------------------------------

/**
 * Format a number as a compact currency string.
 * e.g. 1234567 -> "$1.2M"
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

/**
 * Format a price with appropriate decimal places.
 */
export function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toExponential(2);
}

/**
 * Format a percentage change with sign.
 */
export function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Relative time string.
 */
export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Truncate an Ethereum address for display.
 */
export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
