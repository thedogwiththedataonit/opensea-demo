/**
 * OpenSea Marketplace — Edge Middleware
 *
 * Runs on Vercel Edge Runtime before every /api/* request.
 * Performs edge-layer operations: request ID generation, region detection,
 * rate limiting, request validation, geo-blocking, routing errors, edge
 * timeouts, and TLS failures.
 *
 * Chaos mode is controlled via the `busybox_enabled` cookie (set by admin page).
 * When active, error rates are elevated to simulate production failure scenarios
 * at the edge layer.
 *
 * Edge errors returned directly: 429, 413, 403, 502, 504, 503
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Edge Logger (inline — can't import from app/lib in middleware)
// ---------------------------------------------------------------------------

function edgeTimestamp(): string {
  const d = new Date();
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const s = d.getUTCSeconds().toString().padStart(2, '0');
  const ms = d.getUTCMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function edgeLog(level: string, op: string, meta: Record<string, unknown> = {}) {
  const metaStr = Object.entries(meta)
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
// Geo-blocked regions (simulated)
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

  edgeLog('INFO', 'request_received', { method, path, region, requestId, chaos: chaosEnabled || undefined });

  // ---- 1. Edge Rate Limiting (429) ----
  if (chaosEnabled && shouldFire(0.12)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'rate_limited', {
      method, path, region, status: 429, requestId, latency: `${latency}ms`,
      reason: 'edge_rate_limit_exceeded', layer: 'edge-waf',
    });
    return edgeErrorResponse(429, 'EDGE_RATE_LIMITED',
      'Rate limit exceeded at edge. Too many requests from your IP. Please retry after 60 seconds.',
      region, requestId);
  }

  // ---- 2. Geo-Blocking (403) ----
  if (chaosEnabled && GEO_BLOCKED_REGIONS.includes(region) && shouldFire(0.6)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'geo_blocked', {
      method, path, region, status: 403, requestId, latency: `${latency}ms`,
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
    edgeLog('ERROR', 'payload_too_large', {
      method, path, region, status: 413, requestId, latency: `${latency}ms`,
      contentLength, maxAllowed: '4MB',
    });
    return edgeErrorResponse(413, 'EDGE_PAYLOAD_TOO_LARGE',
      'Request body exceeds the 4MB edge function limit.',
      region, requestId, { contentLength, maxAllowed: 4194304 });
  }

  // ---- 4. Edge Timeout (504 Gateway Timeout) ----
  if (chaosEnabled && shouldFire(0.06)) {
    // Simulate the edge waiting for origin and timing out
    const waitMs = Math.round(3000 + Math.random() * 5000); // 3-8s simulated wait
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'edge_timeout', {
      method, path, region, status: 504, requestId, latency: `${latency}ms`,
      reason: 'origin_response_timeout', waited: `${waitMs}ms`, threshold: '25s',
    });
    return edgeErrorResponse(504, 'EDGE_GATEWAY_TIMEOUT',
      `Edge timed out waiting for origin server response after ${Math.round(waitMs / 1000)}s. The origin function may have exceeded its execution limit.`,
      region, requestId, { waited: waitMs, threshold: 25000 });
  }

  // ---- 5. Edge Routing / Bad Gateway (502) ----
  if (chaosEnabled && shouldFire(0.08)) {
    const waitMs = Math.round(500 + Math.random() * 1500); // 0.5-2s
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'origin_unreachable', {
      method, path, region, status: 502, requestId, latency: `${latency}ms`,
      reason: 'edge_routing_failure', waited: `${waitMs}ms`,
      vercelError: 'ROUTER_EXTERNAL_TARGET_ERROR',
    });
    return edgeErrorResponse(502, 'EDGE_BAD_GATEWAY',
      'Edge could not reach origin server. The upstream service returned an invalid response (ROUTER_EXTERNAL_TARGET_ERROR).',
      region, requestId, { waited: waitMs, vercelError: 'ROUTER_EXTERNAL_TARGET_ERROR' });
  }

  // ---- 6. Edge Compute Exceeded (503) ----
  if (chaosEnabled && shouldFire(0.04)) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'edge_compute_exceeded', {
      method, path, region, status: 503, requestId, latency: `${latency}ms`,
      reason: 'edge_function_cpu_limit', cpuTime: '50ms',
    });
    return edgeErrorResponse(503, 'EDGE_COMPUTE_EXCEEDED',
      'Edge function exceeded the 50ms CPU time limit. The request could not be processed.',
      region, requestId, { cpuTimeLimit: '50ms', layer: 'edge-isolate' });
  }

  // ---- 7. TLS Handshake Failure (525) ----
  if (chaosEnabled && shouldFire(0.03)) {
    const waitMs = Math.round(200 + Math.random() * 800);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'tls_handshake_failed', {
      method, path, region, status: 525, requestId, latency: `${latency}ms`,
      reason: 'ssl_handshake_failure', waited: `${waitMs}ms`,
    });
    return edgeErrorResponse(525, 'EDGE_TLS_HANDSHAKE_FAILED',
      'SSL/TLS handshake failed between edge and origin. The origin server may have an expired or misconfigured certificate.',
      region, requestId, { waited: waitMs, layer: 'edge-tls' });
  }

  // ---- Forward to origin with edge headers ----
  const latency = Date.now() - start;
  edgeLog('INFO', 'request_forwarded', { method, path, region, requestId, latency: `${latency}ms` });

  const requestHeaders = new Headers(request.headers);
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
