/**
 * OpenSea Marketplace — Edge Middleware
 *
 * Runs on Vercel Edge Runtime before every /api/* request.
 * Does NOT generate or overwrite the `traceparent` header — Next.js's
 * auto-instrumentation handles trace context propagation natively.
 * This ensures the Middleware.execute span stays connected to the
 * route handler spans in a single trace.
 *
 * Performs edge-layer operations: request ID generation, region detection,
 * rate limiting, request validation, geo-blocking, routing errors, edge
 * timeouts, and TLS failures.
 *
 * Reads the existing `traceparent` header (set by Next.js) to extract
 * the traceId for structured log correlation (dd.trace_id / dd.span_id).
 *
 * Edge errors returned directly: 429, 413, 403, 502, 504, 503, 525
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Trace Context Reader (reads existing traceparent, never overwrites)
// ---------------------------------------------------------------------------

function parseTraceparent(header: string | null): { traceId: string; spanId: string } | null {
  if (!header) return null;
  const match = header.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-/);
  return match ? { traceId: match[1], spanId: match[2] } : null;
}

/** Generate a 32-char hex trace ID for edge log correlation only (not injected into headers) */
function generateEdgeLogTraceId(): string {
  let id = '';
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/** Generate a 16-char hex span ID for edge log correlation only */
function generateEdgeLogSpanId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

// ---------------------------------------------------------------------------
// Edge Logger with Trace Correlation
// ---------------------------------------------------------------------------

function edgeTimestamp(): string {
  const d = new Date();
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const s = d.getUTCSeconds().toString().padStart(2, '0');
  const ms = d.getUTCMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function edgeLog(
  level: string,
  op: string,
  traceId: string,
  spanId: string,
  meta: Record<string, unknown> = {}
) {
  const allMeta = {
    ...meta,
    'dd.trace_id': traceId,
    'dd.span_id': spanId,
  };
  const metaStr = Object.entries(allMeta)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const line = `[${edgeTimestamp()}] [${level.padEnd(5)}] [edge-middleware] ${op}${metaStr ? ' | ' + metaStr : ''}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

// ---------------------------------------------------------------------------
// Edge Regions (simulated)
// ---------------------------------------------------------------------------

const EDGE_REGIONS = ['iad1', 'sfo1', 'cdg1', 'nrt1', 'sin1', 'gru1', 'syd1', 'lhr1', 'hnd1', 'dub1'];

function pickRegion(): string {
  return EDGE_REGIONS[Math.floor(Math.random() * EDGE_REGIONS.length)];
}

// ---------------------------------------------------------------------------
// Request ID Generator
// ---------------------------------------------------------------------------

function generateEdgeRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `edge_${ts}_${rand}`;
}

// ---------------------------------------------------------------------------
// Chaos detection
// ---------------------------------------------------------------------------

function isChaosEnabled(request: NextRequest): boolean {
  return request.cookies.get('busybox_enabled')?.value === 'true';
}

function shouldFire(rate: number): boolean {
  return Math.random() < rate;
}

// ---------------------------------------------------------------------------
// Geo-blocked regions
// ---------------------------------------------------------------------------

const GEO_BLOCKED_REGIONS = ['nrt1', 'sin1'];

// ---------------------------------------------------------------------------
// Edge JSON error response builder
// ---------------------------------------------------------------------------

function edgeErrorResponse(
  status: number,
  code: string,
  message: string,
  region: string,
  requestId: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: {
        code,
        message,
        statusCode: status,
        region,
        requestId,
        runtime: 'edge',
        timestamp: new Date().toISOString(),
        ...extra,
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Edge-Region': region,
        'X-Edge-Request-Id': requestId,
        ...(status === 429 ? { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } : {}),
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Middleware Handler
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const start = Date.now();
  const requestId = generateEdgeRequestId();
  const region = pickRegion();
  const method = request.method;
  const path = request.nextUrl.pathname;
  const chaosEnabled = isChaosEnabled(request);

  // Read existing trace context if present, otherwise generate a log-only traceId.
  // This ID is ONLY used in structured logs for correlation — it is NOT injected
  // into the traceparent header (Next.js handles trace propagation natively).
  const traceCtx = parseTraceparent(request.headers.get('traceparent'));
  const traceId = traceCtx?.traceId || generateEdgeLogTraceId();
  const edgeLogSpanId = generateEdgeLogSpanId();

  edgeLog('INFO', 'request_received', traceId, edgeLogSpanId, {
    method, path, region, requestId, chaos: chaosEnabled || undefined,
  });

  // ---- 1. Edge Rate Limiting (429) ----
  if (chaosEnabled && shouldFire(0.12)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'rate_limited', traceId, edgeLogSpanId, {
      method, path, region, status: 429, requestId, duration: `${latency}ms`,
      reason: 'edge_rate_limit_exceeded', layer: 'edge-waf',
    });
    return edgeErrorResponse(429, 'EDGE_RATE_LIMITED',
      'Rate limit exceeded at edge. Too many requests from your IP. Please retry after 60 seconds.',
      region, requestId);
  }

  // ---- 2. Geo-Blocking (403) ----
  if (chaosEnabled && GEO_BLOCKED_REGIONS.includes(region) && shouldFire(0.6)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'geo_blocked', traceId, edgeLogSpanId, {
      method, path, region, status: 403, requestId, duration: `${latency}ms`,
      reason: 'geographic_restriction', blockedRegion: region,
    });
    return edgeErrorResponse(403, 'EDGE_GEO_BLOCKED',
      `Access denied from region ${region}. Geographic restrictions apply per OFAC compliance.`,
      region, requestId, { blockedRegion: region });
  }

  // ---- 3. Request Validation: Body Size (413) ----
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 4 * 1024 * 1024) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'payload_too_large', traceId, edgeLogSpanId, {
      method, path, region, status: 413, requestId, duration: `${latency}ms`,
      contentLength, maxAllowed: '4MB',
    });
    return edgeErrorResponse(413, 'EDGE_PAYLOAD_TOO_LARGE',
      'Request body exceeds the 4MB edge function limit.',
      region, requestId, { contentLength, maxAllowed: 4194304 });
  }

  // ---- 4. Edge Timeout (504 Gateway Timeout) ----
  if (chaosEnabled && shouldFire(0.06)) {
    const waitMs = Math.round(3000 + Math.random() * 5000);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'edge_timeout', traceId, edgeLogSpanId, {
      method, path, region, status: 504, requestId, duration: `${latency}ms`,
      reason: 'origin_response_timeout', waited: `${waitMs}ms`, threshold: '25s',
    });
    return edgeErrorResponse(504, 'EDGE_GATEWAY_TIMEOUT',
      `Edge timed out waiting for origin server response after ${Math.round(waitMs / 1000)}s.`,
      region, requestId, { waited: waitMs, threshold: 25000 });
  }

  // ---- 5. Edge Routing / Bad Gateway (502) ----
  if (chaosEnabled && shouldFire(0.08)) {
    const waitMs = Math.round(500 + Math.random() * 1500);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'origin_unreachable', traceId, edgeLogSpanId, {
      method, path, region, status: 502, requestId, duration: `${latency}ms`,
      reason: 'edge_routing_failure', waited: `${waitMs}ms`,
      vercelError: 'ROUTER_EXTERNAL_TARGET_ERROR',
    });
    return edgeErrorResponse(502, 'EDGE_BAD_GATEWAY',
      'Edge could not reach origin server (ROUTER_EXTERNAL_TARGET_ERROR).',
      region, requestId, { waited: waitMs, vercelError: 'ROUTER_EXTERNAL_TARGET_ERROR' });
  }

  // ---- 6. Edge Compute Exceeded (503) ----
  if (chaosEnabled && shouldFire(0.04)) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'edge_compute_exceeded', traceId, edgeLogSpanId, {
      method, path, region, status: 503, requestId, duration: `${latency}ms`,
      reason: 'edge_function_cpu_limit', cpuTime: '50ms',
    });
    return edgeErrorResponse(503, 'EDGE_COMPUTE_EXCEEDED',
      'Edge function exceeded the 50ms CPU time limit.',
      region, requestId, { cpuTimeLimit: '50ms', layer: 'edge-isolate' });
  }

  // ---- 7. TLS Handshake Failure (525) ----
  if (chaosEnabled && shouldFire(0.03)) {
    const waitMs = Math.round(200 + Math.random() * 800);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'tls_handshake_failed', traceId, edgeLogSpanId, {
      method, path, region, status: 525, requestId, duration: `${latency}ms`,
      reason: 'ssl_handshake_failure', waited: `${waitMs}ms`,
    });
    return edgeErrorResponse(525, 'EDGE_TLS_HANDSHAKE_FAILED',
      'SSL/TLS handshake failed between edge and origin.',
      region, requestId, { waited: waitMs, layer: 'edge-tls' });
  }

  // ---- Forward to origin with edge metadata headers (NO traceparent override) ----
  const latency = Date.now() - start;
  edgeLog('INFO', 'request_forwarded', traceId, edgeLogSpanId, {
    method, path, region, requestId, duration: `${latency}ms`,
  });

  const requestHeaders = new Headers(request.headers);
  // DO NOT set traceparent — let Next.js propagate trace context natively
  requestHeaders.set('x-edge-request-id', requestId);
  requestHeaders.set('x-edge-region', region);
  requestHeaders.set('x-edge-start-time', start.toString());
  requestHeaders.set('x-edge-chaos', chaosEnabled ? 'true' : 'false');

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('X-Edge-Region', region);
  response.headers.set('X-Edge-Request-Id', requestId);
  response.headers.set('X-Edge-Latency', `${latency}ms`);

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
