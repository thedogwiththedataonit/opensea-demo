/**
 * OpenSea Marketplace — Shared Utilities
 *
 * Common helper functions used across API route handlers and components.
 * The simulateLatency function is instrumented with OpenTelemetry to produce
 * visible infrastructure spans in traces.
 */

import { tracer, MarketplaceAttributes as MA } from './tracing';

/**
 * Simulate network/processing latency for realistic tracing.
 *
 * Creates an OpenTelemetry span to make the simulated delay visible in traces,
 * allowing engineers to distinguish real processing time from injected latency.
 * The actual delay value is recorded as a span attribute for analysis.
 *
 * @param min - Minimum delay in milliseconds
 * @param max - Maximum delay in milliseconds
 */
export async function simulateLatency(min: number = 20, max: number = 80): Promise<void> {
  const delay = Math.round(min + Math.random() * (max - min));

  return tracer.startActiveSpan(
    'marketplace.infra.latency_simulation',
    {
      attributes: {
        [MA.INFRA_LATENCY_MIN_MS]: min,
        [MA.INFRA_LATENCY_MAX_MS]: max,
        [MA.INFRA_LATENCY_MS]: delay,
      },
    },
    async (span) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      span.end();
    }
  );
}

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
