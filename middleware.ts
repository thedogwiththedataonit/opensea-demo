/**
 * OpenSea Marketplace — Edge Middleware
 *
 * Runs on Vercel Edge Runtime before every /api/* request.
 * Generates W3C traceparent for trace propagation to Node.js routes.
 * Performs edge-layer operations: request ID generation, region detection,
 * rate limiting, request validation, geo-blocking, routing errors, edge
 * timeouts, and TLS failures.
 *
 * Trace propagation:
 *   - Generates a traceId (32 hex) + spanId (16 hex)
 *   - Injects `traceparent: 00-{traceId}-{spanId}-01` into the forwarded request
 *   - Node.js OTel SDK auto-reads this and parents all route spans under it
 *   - All edge logs include dd.trace_id / dd.span_id for Datadog log-to-trace correlation
 *
 * Edge errors returned directly: 429, 413, 403, 502, 504, 503, 525
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// W3C Trace Context ID Generators (Edge-compatible, no crypto.randomUUID)
// ---------------------------------------------------------------------------

/** Generate a 32-char lowercase hex string (128-bit trace ID) */
function generateTraceId(): string {
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

/** Generate a 16-char lowercase hex string (64-bit span ID) */
function generateSpanId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
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
// Edge JSON error response builder (includes trace IDs)
// ---------------------------------------------------------------------------

function edgeErrorResponse(
  status: number,
  code: string,
  message: string,
  region: string,
  requestId: string,
  traceId: string,
  spanId: string,
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
        traceId,
        spanId,
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
        'X-Edge-Trace-Id': traceId,
        'X-Edge-Span-Id': spanId,
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

  // Generate W3C trace context IDs
  const traceId = generateTraceId();
  const edgeSpanId = generateSpanId();

  edgeLog('INFO', 'request_received', traceId, edgeSpanId, {
    method, path, region, requestId, chaos: chaosEnabled || undefined,
  });

  // ---- 1. Edge Rate Limiting (429) ----
  if (chaosEnabled && shouldFire(0.12)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'rate_limited', traceId, edgeSpanId, {
      method, path, region, status: 429, requestId, latency: `${latency}ms`,
      duration: `${latency}ms`, reason: 'edge_rate_limit_exceeded', layer: 'edge-waf',
    });
    return edgeErrorResponse(429, 'EDGE_RATE_LIMITED',
      'Rate limit exceeded at edge. Too many requests from your IP. Please retry after 60 seconds.',
      region, requestId, traceId, edgeSpanId);
  }

  // ---- 2. Geo-Blocking (403) ----
  if (chaosEnabled && GEO_BLOCKED_REGIONS.includes(region) && shouldFire(0.6)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'geo_blocked', traceId, edgeSpanId, {
      method, path, region, status: 403, requestId, latency: `${latency}ms`,
      duration: `${latency}ms`, reason: 'geographic_restriction', blockedRegion: region,
    });
    return edgeErrorResponse(403, 'EDGE_GEO_BLOCKED',
      `Access denied from region ${region}. Geographic restrictions apply per OFAC compliance.`,
      region, requestId, traceId, edgeSpanId, { blockedRegion: region });
  }

  // ---- 3. Request Validation: Body Size (413) ----
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 4 * 1024 * 1024) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'payload_too_large', traceId, edgeSpanId, {
      method, path, region, status: 413, requestId, latency: `${latency}ms`,
      duration: `${latency}ms`, contentLength, maxAllowed: '4MB',
    });
    return edgeErrorResponse(413, 'EDGE_PAYLOAD_TOO_LARGE',
      'Request body exceeds the 4MB edge function limit.',
      region, requestId, traceId, edgeSpanId, { contentLength, maxAllowed: 4194304 });
  }

  // ---- 4. Edge Timeout (504 Gateway Timeout) ----
  if (chaosEnabled && shouldFire(0.06)) {
    const waitMs = Math.round(3000 + Math.random() * 5000);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'edge_timeout', traceId, edgeSpanId, {
      method, path, region, status: 504, requestId, latency: `${latency}ms`,
      duration: `${latency}ms`, reason: 'origin_response_timeout', waited: `${waitMs}ms`, threshold: '25s',
    });
    return edgeErrorResponse(504, 'EDGE_GATEWAY_TIMEOUT',
      `Edge timed out waiting for origin server response after ${Math.round(waitMs / 1000)}s.`,
      region, requestId, traceId, edgeSpanId, { waited: waitMs, threshold: 25000 });
  }

  // ---- 5. Edge Routing / Bad Gateway (502) ----
  if (chaosEnabled && shouldFire(0.08)) {
    const waitMs = Math.round(500 + Math.random() * 1500);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'origin_unreachable', traceId, edgeSpanId, {
      method, path, region, status: 502, requestId, latency: `${latency}ms`,
      duration: `${latency}ms`, reason: 'edge_routing_failure', waited: `${waitMs}ms`,
      vercelError: 'ROUTER_EXTERNAL_TARGET_ERROR',
    });
    return edgeErrorResponse(502, 'EDGE_BAD_GATEWAY',
      'Edge could not reach origin server (ROUTER_EXTERNAL_TARGET_ERROR).',
      region, requestId, traceId, edgeSpanId, { waited: waitMs, vercelError: 'ROUTER_EXTERNAL_TARGET_ERROR' });
  }

  // ---- 6. Edge Compute Exceeded (503) ----
  if (chaosEnabled && shouldFire(0.04)) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'edge_compute_exceeded', traceId, edgeSpanId, {
      method, path, region, status: 503, requestId, latency: `${latency}ms`,
      duration: `${latency}ms`, reason: 'edge_function_cpu_limit', cpuTime: '50ms',
    });
    return edgeErrorResponse(503, 'EDGE_COMPUTE_EXCEEDED',
      'Edge function exceeded the 50ms CPU time limit.',
      region, requestId, traceId, edgeSpanId, { cpuTimeLimit: '50ms', layer: 'edge-isolate' });
  }

  // ---- 7. TLS Handshake Failure (525) ----
  if (chaosEnabled && shouldFire(0.03)) {
    const waitMs = Math.round(200 + Math.random() * 800);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'tls_handshake_failed', traceId, edgeSpanId, {
      method, path, region, status: 525, requestId, latency: `${latency}ms`,
      duration: `${latency}ms`, reason: 'ssl_handshake_failure', waited: `${waitMs}ms`,
    });
    return edgeErrorResponse(525, 'EDGE_TLS_HANDSHAKE_FAILED',
      'SSL/TLS handshake failed between edge and origin.',
      region, requestId, traceId, edgeSpanId, { waited: waitMs, layer: 'edge-tls' });
  }

  // ---- Forward to origin with edge headers + W3C traceparent ----
  const latency = Date.now() - start;
  const traceparent = `00-${traceId}-${edgeSpanId}-01`;

  edgeLog('INFO', 'request_forwarded', traceId, edgeSpanId, {
    method, path, region, requestId, latency: `${latency}ms`,
    duration: `${latency}ms`, traceparent,
  });

  const requestHeaders = new Headers(request.headers);
  // W3C Trace Context — Node.js OTel SDK auto-reads this
  requestHeaders.set('traceparent', traceparent);
  // Edge metadata headers
  requestHeaders.set('x-edge-request-id', requestId);
  requestHeaders.set('x-edge-region', region);
  requestHeaders.set('x-edge-start-time', start.toString());
  requestHeaders.set('x-edge-chaos', chaosEnabled ? 'true' : 'false');
  requestHeaders.set('x-edge-trace-id', traceId);
  requestHeaders.set('x-edge-span-id', edgeSpanId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('X-Edge-Region', region);
  response.headers.set('X-Edge-Request-Id', requestId);
  response.headers.set('X-Edge-Latency', `${latency}ms`);
  response.headers.set('X-Edge-Trace-Id', traceId);
  response.headers.set('X-Edge-Span-Id', edgeSpanId);

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
