/**
 * OpenSea Marketplace — Centralized Error Response Builder
 *
 * Converts thrown errors (MarketplaceError subclasses or unexpected exceptions)
 * into structured JSON responses with full error metadata. Also records error
 * details on the active OpenTelemetry span for trace-level observability.
 *
 * Every API route wraps its body in a try/catch that calls handleRouteError()
 * in the catch branch, producing consistent error responses across all endpoints.
 */

import { NextResponse } from "next/server";
import { Span, SpanStatusCode } from "@opentelemetry/api";
import { MarketplaceError } from "./errors";

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface ApiErrorResponse {
  error: {
    /** Machine-readable error code, e.g., "COLLECTION_NOT_FOUND" */
    code: string;
    /** Human-readable error description */
    message: string;
    /** HTTP status code */
    statusCode: number;
    /** ISO 8601 timestamp of when the error occurred */
    timestamp: string;
    /** Unique request identifier for correlation */
    requestId: string;
    /** Additional context metadata for debugging */
    context?: Record<string, unknown>;
    /** Stack trace (included for observability demo purposes) */
    stack?: string;
  };
}

// ---------------------------------------------------------------------------
// Request ID Generator
// ---------------------------------------------------------------------------

let requestCounter = 0;

function generateRequestId(): string {
  requestCounter++;
  const ts = Date.now().toString(36);
  const seq = requestCounter.toString(36).padStart(4, '0');
  const rand = Math.random().toString(36).substring(2, 6);
  return `req_${ts}_${seq}_${rand}`;
}

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------

/**
 * Converts any thrown error into a structured NextResponse JSON error.
 *
 * For MarketplaceError subclasses:
 *  - Uses the error's statusCode, code, message, and context
 *  - Records the error code and status on the OTel span
 *
 * For unknown errors:
 *  - Falls back to 500 / "INTERNAL_ERROR"
 *  - Records the raw error message on the span
 *
 * In all cases:
 *  - Generates a unique requestId for log correlation
 *  - Includes the stack trace in the response body
 *  - Sets SpanStatusCode.ERROR on the span
 *
 * @param error - The caught error (may be MarketplaceError or unknown)
 * @param span  - The active OTel span to record error metadata on
 */
export function handleRouteError(error: unknown, span: Span): NextResponse<ApiErrorResponse> {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  if (error instanceof MarketplaceError) {
    // ---- Known marketplace error ----
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: `${error.code}: ${error.message}`,
    });
    span.setAttribute('error', true);
    span.setAttribute('error.code', error.code);
    span.setAttribute('error.status_code', error.statusCode);
    span.setAttribute('error.type', error.name);
    span.setAttribute('error.request_id', requestId);
    if (error.context) {
      span.setAttribute('error.context', JSON.stringify(error.context));
    }
    span.recordException(error);

    const response: ApiErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        timestamp,
        requestId,
        context: error.context,
        stack: error.stack,
      },
    };

    return NextResponse.json(response, { status: error.statusCode });
  }

  // ---- Unknown / unexpected error ----
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  const stack = error instanceof Error ? error.stack : undefined;

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: `INTERNAL_ERROR: ${message}`,
  });
  span.setAttribute('error', true);
  span.setAttribute('error.code', 'INTERNAL_ERROR');
  span.setAttribute('error.status_code', 500);
  span.setAttribute('error.type', 'UnknownError');
  span.setAttribute('error.request_id', requestId);
  if (error instanceof Error) {
    span.recordException(error);
  }

  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message,
      statusCode: 500,
      timestamp,
      requestId,
      stack,
    },
  };

  return NextResponse.json(response, { status: 500 });
}
