/**
 * OpenSea Marketplace — Tracing Utilities
 *
 * Centralized OpenTelemetry instrumentation module for the marketplace API.
 * Provides a pre-configured tracer, a typed span wrapper, and domain-specific
 * semantic attribute constants following the `marketplace.*` namespace convention.
 *
 * Usage in route handlers:
 *   import { tracer, withSpan, MarketplaceAttributes as MA } from '@/app/lib/tracing';
 *
 *   const result = await withSpan(tracer, 'marketplace.collection.lookup', {
 *     [MA.COLLECTION_SLUG]: slug,
 *   }, async (span) => {
 *     const collection = collections.find(c => c.slug === slug);
 *     span.setAttribute(MA.COLLECTION_NAME, collection.name);
 *     return collection;
 *   });
 */

import { trace, Span, SpanStatusCode, Attributes } from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// Tracer Instance
// ---------------------------------------------------------------------------

/**
 * Shared tracer for all OpenSea marketplace operations.
 * The name 'opensea-marketplace' groups spans under a single instrumentation scope
 * in observability backends, making it easy to filter marketplace-specific traces.
 */
export const tracer = trace.getTracer('opensea-marketplace');

// ---------------------------------------------------------------------------
// Span Wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an async function in an OpenTelemetry span with automatic error handling.
 *
 * - Creates a child span under the current active context
 * - Passes the span to the callback so attributes can be set mid-execution
 * - Automatically records exceptions and sets ERROR status on failure
 * - Ends the span in all cases (success or failure)
 *
 * @param t      - The tracer instance to create the span with
 * @param name   - Span name following `marketplace.<domain>.<operation>` convention
 * @param attrs  - Initial attributes to set on span creation
 * @param fn     - Async function to execute within the span context
 * @returns      - The return value of the wrapped function
 */
export async function withSpan<T>(
  t: typeof tracer,
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return t.startActiveSpan(name, { attributes: attrs }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Marketplace Semantic Attribute Constants
// ---------------------------------------------------------------------------

/**
 * Domain-specific attribute keys for OpenSea marketplace traces.
 *
 * All keys follow the `marketplace.*` namespace to avoid collisions with
 * standard OpenTelemetry semantic conventions and to make marketplace
 * operations instantly identifiable in tracing dashboards.
 */
export const MarketplaceAttributes = {
  // ---- Blockchain / Chain ----
  /** Blockchain network: "ethereum", "solana", "ronin" */
  CHAIN: 'marketplace.chain',

  // ---- Collections ----
  /** URL-safe collection identifier */
  COLLECTION_SLUG: 'marketplace.collection.slug',
  /** Human-readable collection name */
  COLLECTION_NAME: 'marketplace.collection.name',
  /** Whether the collection has a verified badge */
  COLLECTION_VERIFIED: 'marketplace.collection.verified',

  // ---- NFTs ----
  /** On-chain token ID within a collection */
  NFT_TOKEN_ID: 'marketplace.nft.token_id',
  /** Whether the NFT is currently listed for sale */
  NFT_IS_LISTED: 'marketplace.nft.is_listed',
  /** NFT rarity rank */
  NFT_RARITY_RANK: 'marketplace.nft.rarity_rank',
  /** Count of activity events returned */
  NFT_ACTIVITY_COUNT: 'marketplace.nft.activity_count',
  /** Count of trait properties */
  NFT_TRAIT_COUNT: 'marketplace.nft.trait_count',

  // ---- Tokens ----
  /** Token ticker symbol */
  TOKEN_SYMBOL: 'marketplace.token.symbol',
  /** Token contract address */
  TOKEN_ADDRESS: 'marketplace.token.address',
  /** Whether the token was recently created */
  TOKEN_IS_NEW: 'marketplace.token.is_new',
  /** Current token price in USD */
  TOKEN_PRICE_USD: 'marketplace.token.price_usd',
  /** Token fully diluted valuation */
  TOKEN_FDV: 'marketplace.token.fdv',

  // ---- Swap / Trading ----
  /** Source token in a swap */
  SWAP_FROM_TOKEN: 'marketplace.swap.from_token',
  /** Destination token in a swap */
  SWAP_TO_TOKEN: 'marketplace.swap.to_token',
  /** Swap input amount in source token units */
  SWAP_FROM_AMOUNT: 'marketplace.swap.from_amount',
  /** Swap output amount in destination token units */
  SWAP_TO_AMOUNT: 'marketplace.swap.to_amount',
  /** USD value of the swap input */
  SWAP_AMOUNT_USD: 'marketplace.swap.amount_usd',
  /** Price impact as a percentage */
  SWAP_PRICE_IMPACT_PCT: 'marketplace.swap.price_impact_pct',
  /** Fee charged in USD */
  SWAP_FEE_USD: 'marketplace.swap.fee_usd',
  /** Estimated gas cost in native token */
  SWAP_ESTIMATED_GAS: 'marketplace.swap.estimated_gas',
  /** Routing path description */
  SWAP_ROUTE: 'marketplace.swap.route',

  // ---- Search ----
  /** Raw search query string */
  SEARCH_QUERY: 'marketplace.search.query',
  /** Number of collection results matched */
  SEARCH_COLLECTION_HITS: 'marketplace.search.collection_hits',
  /** Number of token results matched */
  SEARCH_TOKEN_HITS: 'marketplace.search.token_hits',

  // ---- Filtering ----
  /** Active chain filter value */
  FILTER_CHAIN: 'marketplace.filter.chain',
  /** Active sort field */
  FILTER_SORT: 'marketplace.filter.sort',
  /** Active sort direction */
  FILTER_ORDER: 'marketplace.filter.order',
  /** Active tab selection (trending, top, new, watchlist) */
  FILTER_TAB: 'marketplace.filter.tab',
  /** Active category filter */
  FILTER_CATEGORY: 'marketplace.filter.category',
  /** Active listing status filter */
  FILTER_STATUS: 'marketplace.filter.status',
  /** FDV minimum filter */
  FILTER_FDV_MIN: 'marketplace.filter.fdv_min',
  /** FDV maximum filter */
  FILTER_FDV_MAX: 'marketplace.filter.fdv_max',

  // ---- Pagination ----
  /** Pagination offset */
  PAGINATION_OFFSET: 'marketplace.pagination.offset',
  /** Pagination page size */
  PAGINATION_LIMIT: 'marketplace.pagination.limit',
  /** Total available results before pagination */
  PAGINATION_TOTAL: 'marketplace.pagination.total',
  /** Whether more results exist beyond this page */
  PAGINATION_HAS_MORE: 'marketplace.pagination.has_more',

  // ---- Result Metadata ----
  /** Number of items in the current response */
  RESULT_COUNT: 'marketplace.result.count',

  // ---- Chart / Price Data ----
  /** Chart timeframe window (1h, 1d, 7d, 30d) */
  CHART_TIMEFRAME: 'marketplace.chart.timeframe',
  /** Chart candle interval (1m, 5m, 1h, etc.) */
  CHART_INTERVAL: 'marketplace.chart.interval',
  /** Number of OHLC candles generated */
  CHART_CANDLE_COUNT: 'marketplace.chart.candle_count',
  /** Number of raw price points processed */
  CHART_INPUT_POINTS: 'marketplace.chart.input_points',

  // ---- Sparkline ----
  /** Points requested for sparkline */
  SPARKLINE_POINTS_REQUESTED: 'marketplace.sparkline.points_requested',
  /** Points actually returned */
  SPARKLINE_POINTS_RETURNED: 'marketplace.sparkline.points_returned',
  /** Size of the source price history array */
  SPARKLINE_HISTORY_SIZE: 'marketplace.sparkline.history_size',

  // ---- Infrastructure ----
  /** Simulated latency delay in milliseconds */
  INFRA_LATENCY_MS: 'marketplace.infra.latency_ms',
  /** Minimum configured latency */
  INFRA_LATENCY_MIN_MS: 'marketplace.infra.latency_min_ms',
  /** Maximum configured latency */
  INFRA_LATENCY_MAX_MS: 'marketplace.infra.latency_max_ms',
} as const;
