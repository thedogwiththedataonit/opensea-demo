/**
 * OpenSea Marketplace — Tracing Utilities
 *
 * Centralized OpenTelemetry instrumentation module for the marketplace API.
 * Provides multiple service-scoped tracers (simulating a microservice architecture),
 * typed span wrappers with automatic error span creation, and domain-specific
 * semantic attribute constants following the `marketplace.*` namespace convention.
 *
 * Service tracers:
 *   apiTracer        — opensea-api-gateway    (root HTTP handler spans)
 *   dataTracer       — opensea-data-service   (data lookups, filters, sorts)
 *   enrichTracer     — opensea-enrichment     (faker enrichment, comments, holders)
 *   searchTracer     — opensea-search-engine  (search queries)
 *   priceTracer      — opensea-price-engine   (sparkline / OHLC computations)
 */

import { trace, Span, SpanStatusCode, Attributes } from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// Service-Scoped Tracer Instances
// ---------------------------------------------------------------------------

/** @deprecated Use service-specific tracers below. Kept for backward compat. */
export const tracer = trace.getTracer('opensea-marketplace');

/** Root HTTP handler spans — API gateway layer */
export const apiTracer = trace.getTracer('opensea-api-gateway');

/** Data lookups, filtering, sorting, pagination */
export const dataTracer = trace.getTracer('opensea-data-service');

/** Faker enrichment, comments, holders, transactions generation */
export const enrichTracer = trace.getTracer('opensea-enrichment');

/** Search queries across collections and tokens */
export const searchTracer = trace.getTracer('opensea-search-engine');

/** Sparkline, OHLC, and price computation */
export const priceTracer = trace.getTracer('opensea-price-engine');

// ---------------------------------------------------------------------------
// Error Span Name Mapping
// ---------------------------------------------------------------------------

const ERROR_SPAN_NAMES: Record<string, string> = {
  NotFoundError: 'marketplace.error.not_found',
  ValidationError: 'marketplace.error.validation',
  InternalError: 'marketplace.error.internal',
  RateLimitError: 'marketplace.error.rate_limited',
  TimeoutError: 'marketplace.error.timeout',
  BadGatewayError: 'marketplace.error.bad_gateway',
  ServiceUnavailableError: 'marketplace.error.service_unavailable',
  UnprocessableError: 'marketplace.error.unprocessable',
  MarketplaceError: 'marketplace.error.marketplace',
};

function getErrorSpanName(error: unknown): string {
  if (error instanceof Error && error.constructor.name in ERROR_SPAN_NAMES) {
    return ERROR_SPAN_NAMES[error.constructor.name];
  }
  return 'marketplace.error.unknown';
}

// ---------------------------------------------------------------------------
// Error Span Helper
// ---------------------------------------------------------------------------

/**
 * Creates a dedicated child span for error processing.
 *
 * Appears as its own red bar in trace waterfalls, making errors instantly
 * visible. The span has a simulated duration (3-15ms) representing error
 * logging, serialization, and metrics recording.
 *
 * @param t     - Tracer to create the span under
 * @param error - The caught error
 * @param attrs - Additional attributes (origin span, request ID, etc.)
 */
export async function withErrorSpan(
  t: ReturnType<typeof trace.getTracer>,
  error: unknown,
  attrs: Attributes = {}
): Promise<void> {
  const spanName = getErrorSpanName(error);
  const processingMs = Math.round(3 + Math.random() * 12); // 3-15ms

  return t.startActiveSpan(spanName, { attributes: { ...attrs } }, async (span) => {
    try {
      // Set error status
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      // Record exception (captures stack trace in OTel event)
      if (error instanceof Error) {
        span.recordException(error);
      }

      // Set rich error attributes
      span.setAttribute('error', true);
      span.setAttribute(MA.ERROR_PROCESSING_MS, processingMs);

      if (error instanceof Error) {
        span.setAttribute(MA.ERROR_MESSAGE, error.message);
        span.setAttribute(MA.ERROR_TYPE, error.constructor.name);
        if (error.stack) {
          span.setAttribute(MA.ERROR_STACK_TRACE, error.stack);
        }
      }

      // MarketplaceError-specific attributes
      const me = error as { code?: string; statusCode?: number; context?: Record<string, unknown> };
      if (me.code) span.setAttribute(MA.ERROR_CODE, me.code);
      if (me.statusCode) span.setAttribute(MA.ERROR_STATUS_CODE, me.statusCode);
      if (me.context) span.setAttribute(MA.ERROR_CONTEXT, JSON.stringify(me.context));

      // Simulate error processing time
      await new Promise((resolve) => setTimeout(resolve, processingMs));
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Span Wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an async function in an OpenTelemetry span with automatic error handling.
 *
 * - Creates a child span under the current active context
 * - Passes the span to the callback so attributes can be set mid-execution
 * - On failure: sets ERROR status, records exception, creates a dedicated
 *   error child span with its own duration and stack trace
 * - Ends the span in all cases (success or failure)
 *
 * @param t      - The tracer instance to create the span with
 * @param name   - Span name following `marketplace.<domain>.<operation>` convention
 * @param attrs  - Initial attributes to set on span creation
 * @param fn     - Async function to execute within the span context
 * @returns      - The return value of the wrapped function
 */
export async function withSpan<T>(
  t: ReturnType<typeof trace.getTracer>,
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
  // ---- HTTP ----
  /** HTTP method: GET, POST, etc. */
  HTTP_METHOD: 'marketplace.http.method',
  /** Route pattern: /api/tokens/[chain]/[address] */
  HTTP_ROUTE: 'marketplace.http.route',
  /** HTTP response status code */
  HTTP_STATUS_CODE: 'marketplace.http.status_code',

  // ---- Response ----
  /** Number of items in the response payload */
  RESPONSE_ITEMS: 'marketplace.response.items',

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

  // ---- Database / Data Source ----
  /** DB operation type: read, write, aggregate, scan */
  DB_OPERATION: 'marketplace.db.operation',
  /** Simulated DB collection/table name */
  DB_COLLECTION: 'marketplace.db.collection',
  /** Simulated DB query duration in ms */
  DB_DURATION_MS: 'marketplace.db.duration_ms',
  /** Data source: in-memory, redis, postgres, api */
  DATA_SOURCE: 'marketplace.data.source',

  // ---- Enrichment ----
  /** Enrichment data source: faker, cache, oracle */
  ENRICHMENT_SOURCE: 'marketplace.enrichment.source',
  /** Number of fields enriched */
  ENRICHMENT_FIELDS: 'marketplace.enrichment.fields_count',

  // ---- Infrastructure ----
  /** Simulated latency delay in milliseconds */
  INFRA_LATENCY_MS: 'marketplace.infra.latency_ms',
  /** Minimum configured latency */
  INFRA_LATENCY_MIN_MS: 'marketplace.infra.latency_min_ms',
  /** Maximum configured latency */
  INFRA_LATENCY_MAX_MS: 'marketplace.infra.latency_max_ms',

  // ---- Error Metadata ----
  /** Machine-readable error code */
  ERROR_CODE: 'marketplace.error.code',
  /** HTTP status code of the error response */
  ERROR_STATUS_CODE: 'marketplace.error.status_code',
  /** Error class name (e.g., "NotFoundError", "ValidationError") */
  ERROR_TYPE: 'marketplace.error.type',
  /** Unique request ID for log/trace correlation */
  ERROR_REQUEST_ID: 'marketplace.error.request_id',
  /** The span name where the error originated */
  ERROR_ORIGIN_SPAN: 'marketplace.error.origin_span',
  /** Full stack trace string */
  ERROR_STACK_TRACE: 'marketplace.error.stack_trace',
  /** Human-readable error message */
  ERROR_MESSAGE: 'marketplace.error.message',
  /** Time spent processing the error in ms */
  ERROR_PROCESSING_MS: 'marketplace.error.processing_ms',
  /** JSON-serialized context from MarketplaceError */
  ERROR_CONTEXT: 'marketplace.error.context',

  // ---- Busybox / Chaos ----
  /** Whether busybox chaos injection is currently enabled */
  BUSYBOX_ENABLED: 'marketplace.busybox.enabled',
  /** The fault type that was injected */
  BUSYBOX_FAULT_TYPE: 'marketplace.busybox.fault_type',
  /** Whether this request was affected by busybox fault injection */
  BUSYBOX_INJECTED: 'marketplace.busybox.injected',
} as const;

/** Shorthand alias */
export const MA = MarketplaceAttributes;
