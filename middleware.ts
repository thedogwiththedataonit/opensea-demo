/**
 * OpenSea Marketplace — Edge Middleware
 *
 * Runs on Vercel Edge Runtime before every /api/* request.
 * Performs edge-layer operations: request ID generation, region detection,
 * rate limiting, request validation, geo-blocking, and routing error simulation.
 *
 * OTEL is NOT supported on Edge Runtime — all observability uses structured
 * console.log. Custom x-edge-* headers are injected for downstream Node.js
 * routes to read and record on their OTel spans.
 *
 * Edge errors returned directly: 429, 413, 403, 502
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
// Request ID Generator (Edge-compatible, no crypto.randomUUID in all runtimes)
// ---------------------------------------------------------------------------

function generateEdgeRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `edge_${ts}_${rand}`;
}

// ---------------------------------------------------------------------------
// Chaos probability (edge-side rate limiting / geo-block / routing errors)
// ---------------------------------------------------------------------------

// Edge middleware checks for a special header to enable chaos mode.
// The admin page can set a cookie `busybox_enabled=true` to propagate chaos state.
function isChaosEnabled(request: NextRequest): boolean {
  return request.cookies.get('busybox_enabled')?.value === 'true';
}

function shouldFire(rate: number = 0.15): boolean {
  return Math.random() < rate;
}

// ---------------------------------------------------------------------------
// Geo-blocked regions (simulated)
// ---------------------------------------------------------------------------

const GEO_BLOCKED_REGIONS = ['nrt1', 'sin1']; // Simulated: Japan + Singapore blocked

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

  // ---- Rate Limiting (Edge-layer) ----
  if (chaosEnabled && shouldFire(0.08)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'rate_limited', {
      method, path, region, status: 429, requestId, latency: `${latency}ms`,
      reason: 'edge_rate_limit_exceeded',
    });
    return new NextResponse(
      JSON.stringify({
        error: {
          code: 'EDGE_RATE_LIMITED',
          message: 'Rate limit exceeded at edge. Please retry after 60 seconds.',
          statusCode: 429,
          region,
          requestId,
          runtime: 'edge',
        },
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          'X-Edge-Region': region,
          'X-Edge-Request-Id': requestId,
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // ---- Geo-Blocking (Edge-layer) ----
  if (chaosEnabled && GEO_BLOCKED_REGIONS.includes(region) && shouldFire(0.5)) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'geo_blocked', {
      method, path, region, status: 403, requestId, latency: `${latency}ms`,
      reason: 'geographic_restriction',
    });
    return new NextResponse(
      JSON.stringify({
        error: {
          code: 'EDGE_GEO_BLOCKED',
          message: `Access denied from region ${region}. Geographic restrictions apply.`,
          statusCode: 403,
          region,
          requestId,
          runtime: 'edge',
        },
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Edge-Region': region,
          'X-Edge-Request-Id': requestId,
        },
      }
    );
  }

  // ---- Request Validation: Body Size (Edge-layer) ----
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 4 * 1024 * 1024) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'payload_too_large', {
      method, path, region, status: 413, requestId, latency: `${latency}ms`,
      contentLength,
    });
    return new NextResponse(
      JSON.stringify({
        error: {
          code: 'EDGE_PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the 4MB edge limit.',
          statusCode: 413,
          region,
          requestId,
          runtime: 'edge',
        },
      }),
      {
        status: 413,
        headers: {
          'Content-Type': 'application/json',
          'X-Edge-Region': region,
          'X-Edge-Request-Id': requestId,
        },
      }
    );
  }

  // ---- Edge Routing Error (502 Bad Gateway) ----
  if (chaosEnabled && shouldFire(0.05)) {
    // Simulate edge not being able to reach the origin
    const waitMs = Math.round(800 + Math.random() * 2200); // 0.8-3s wait
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'origin_unreachable', {
      method, path, region, status: 502, requestId, latency: `${latency}ms`,
      reason: 'edge_routing_failure', waited: `${waitMs}ms`,
    });
    return new NextResponse(
      JSON.stringify({
        error: {
          code: 'EDGE_BAD_GATEWAY',
          message: 'Edge could not reach origin server. The upstream service may be unavailable.',
          statusCode: 502,
          region,
          requestId,
          runtime: 'edge',
          waited: waitMs,
        },
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'X-Edge-Region': region,
          'X-Edge-Request-Id': requestId,
        },
      }
    );
  }

  // ---- Forward to origin with edge headers ----
  const latency = Date.now() - start;
  edgeLog('INFO', 'request_forwarded', { method, path, region, requestId, latency: `${latency}ms` });

  // Clone the request headers and inject edge metadata
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-edge-request-id', requestId);
  requestHeaders.set('x-edge-region', region);
  requestHeaders.set('x-edge-start-time', start.toString());

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set edge headers on the response too
  response.headers.set('X-Edge-Region', region);
  response.headers.set('X-Edge-Request-Id', requestId);
  response.headers.set('X-Edge-Latency', `${latency}ms`);

  return response;
}

// Only run middleware on API routes
export const config = {
  matcher: '/api/:path*',
};
