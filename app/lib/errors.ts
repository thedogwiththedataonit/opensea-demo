/**
 * OpenSea Marketplace — Typed Error Hierarchy
 *
 * Production-grade error classes for all API routes. Every error carries:
 *  - HTTP status code for the response
 *  - Machine-readable error code (e.g., "COLLECTION_NOT_FOUND")
 *  - Human-readable message
 *  - Optional context metadata for debugging
 *  - Stack trace captured at throw site
 *
 * These errors integrate with the OpenTelemetry tracing layer — the `withSpan`
 * wrapper automatically calls `span.recordException(error)` when these are thrown,
 * producing rich error traces with domain-specific codes and context.
 */

// ---------------------------------------------------------------------------
// Base Error
// ---------------------------------------------------------------------------

export class MarketplaceError extends Error {
  public readonly timestamp: string;

  constructor(
    message: string,
    /** HTTP status code */
    public readonly statusCode: number,
    /** Machine-readable error code, e.g., "COLLECTION_NOT_FOUND" */
    public readonly code: string,
    /** Additional context for debugging (logged to traces and responses) */
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MarketplaceError';
    this.timestamp = new Date().toISOString();

    // Preserve proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// 400 — Bad Request / Validation Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when request parameters, query strings, or body fail validation.
 *
 * Examples:
 *  - Invalid pagination offset (negative number)
 *  - Missing required swap fields
 *  - Malformed JSON body
 *  - Invalid sort field name
 */
export class ValidationError extends MarketplaceError {
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message, 400, code, context);
    this.name = 'ValidationError';
  }
}

// ---------------------------------------------------------------------------
// 404 — Not Found
// ---------------------------------------------------------------------------

/**
 * Thrown when a requested resource does not exist in the data store.
 *
 * Examples:
 *  - Collection slug not found
 *  - NFT token ID not found within a collection
 *  - Token chain+address pair not found
 */
export class NotFoundError extends MarketplaceError {
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message, 404, code, context);
    this.name = 'NotFoundError';
  }
}

// ---------------------------------------------------------------------------
// 422 — Unprocessable Entity
// ---------------------------------------------------------------------------

/**
 * Thrown when the request is syntactically valid but cannot be processed
 * due to business logic constraints.
 *
 * Examples:
 *  - Swap price impact exceeds safety threshold
 *  - Insufficient liquidity for the requested trade size
 */
export class UnprocessableError extends MarketplaceError {
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message, 422, code, context);
    this.name = 'UnprocessableError';
  }
}

// ---------------------------------------------------------------------------
// 429 — Too Many Requests
// ---------------------------------------------------------------------------

/**
 * Thrown when the request is rate-limited.
 * Used by busybox to simulate rate limiting under load.
 */
export class RateLimitError extends MarketplaceError {
  constructor(code: string = 'RATE_LIMITED', message: string = 'Too many requests. Please slow down.', context?: Record<string, unknown>) {
    super(message, 429, code, context);
    this.name = 'RateLimitError';
  }
}

// ---------------------------------------------------------------------------
// 500 — Internal Server Error
// ---------------------------------------------------------------------------

/**
 * Thrown when an unexpected error occurs during request processing.
 *
 * Examples:
 *  - Sparkline computation failure
 *  - OHLC bucketing crash
 *  - Unhandled exception in a subfunction
 */
export class InternalError extends MarketplaceError {
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message, 500, code, context);
    this.name = 'InternalError';
  }
}

// ---------------------------------------------------------------------------
// 503 — Service Unavailable
// ---------------------------------------------------------------------------

/**
 * Thrown when a downstream service or subsystem is temporarily unavailable.
 *
 * Examples:
 *  - Liquidity pool unavailable
 *  - Price feed degraded
 *  - Data store temporarily unreachable
 */
export class ServiceUnavailableError extends MarketplaceError {
  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message, 503, code, context);
    this.name = 'ServiceUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// 504 — Gateway Timeout
// ---------------------------------------------------------------------------

/**
 * Thrown when a request exceeds the allowed processing time.
 * Used by busybox to simulate timeout conditions.
 */
export class TimeoutError extends MarketplaceError {
  constructor(code: string = 'REQUEST_TIMEOUT', message: string = 'Request processing timed out.', context?: Record<string, unknown>) {
    super(message, 504, code, context);
    this.name = 'TimeoutError';
  }
}
