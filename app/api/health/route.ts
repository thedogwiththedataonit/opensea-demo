/**
 * GET /api/health
 *
 * Lightweight health-check endpoint running on Edge Runtime.
 * Parses traceparent from middleware for trace correlation.
 * Generates its own spanId and logs with dd.trace_id/dd.span_id.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const EDGE_REGIONS = ['iad1', 'sfo1', 'cdg1', 'nrt1', 'sin1', 'gru1', 'syd1', 'lhr1'];
const VERSION = '1.0.0';

function generateSpanId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

function parseTraceparent(header: string | null): { traceId: string; parentSpanId: string } | null {
  if (!header) return null;
  const match = header.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-/);
  return match ? { traceId: match[1], parentSpanId: match[2] } : null;
}

function edgeLog(level: string, op: string, traceId: string, spanId: string, meta: Record<string, unknown> = {}) {
  const d = new Date();
  const ts = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}:${d.getUTCSeconds().toString().padStart(2, '0')}.${d.getUTCMilliseconds().toString().padStart(3, '0')}`;
  const allMeta = { ...meta, 'dd.trace_id': traceId, 'dd.span_id': spanId };
  const metaStr = Object.entries(allMeta).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join(' ');
  const line = `[${ts}] [${level.padEnd(5)}] [edge-function  ] ${op}${metaStr ? ' | ' + metaStr : ''}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

export async function GET(request: Request) {
  const start = Date.now();
  const region = request.headers.get('x-edge-region') || EDGE_REGIONS[Math.floor(Math.random() * EDGE_REGIONS.length)];
  const requestId = request.headers.get('x-edge-request-id') || 'unknown';
  const chaosEnabled = request.headers.get('x-edge-chaos') === 'true';

  // Parse trace context from middleware
  const traceCtx = parseTraceparent(request.headers.get('traceparent'));
  const traceId = traceCtx?.traceId || request.headers.get('x-edge-trace-id') || '00000000000000000000000000000000';
  const parentSpanId = traceCtx?.parentSpanId || request.headers.get('x-edge-span-id') || '0000000000000000';
  const fnSpanId = generateSpanId();

  edgeLog('INFO', 'health_check_started', traceId, fnSpanId, {
    region, requestId, parentSpanId, chaos: chaosEnabled || undefined,
  });

  // ---- Chaos: Edge function crash (500) ----
  if (chaosEnabled && Math.random() < 0.10) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'health_check_crash', traceId, fnSpanId, {
      status: 500, region, requestId, parentSpanId, duration: `${latency}ms`,
      reason: 'edge_function_uncaught_exception',
      error: 'TypeError: Cannot read properties of undefined',
    });
    return new Response(
      JSON.stringify({
        error: {
          code: 'EDGE_FUNCTION_CRASH', message: 'Edge function encountered an uncaught exception.',
          statusCode: 500, region, requestId, traceId, spanId: fnSpanId, runtime: 'edge',
          stack: 'TypeError: Cannot read properties of undefined\n    at healthCheck (edge-function:27:15)',
        },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region } }
    );
  }

  // ---- Chaos: Edge cold start delay ----
  if (chaosEnabled && Math.random() < 0.15) {
    const coldStartMs = Math.round(800 + Math.random() * 2200);
    edgeLog('WARN', 'edge_cold_start', traceId, fnSpanId, {
      region, requestId, parentSpanId, delay: `${coldStartMs}ms`, reason: 'v8_isolate_initialization',
    });
    await new Promise((r) => setTimeout(r, coldStartMs));
  }

  // ---- Chaos: Degraded state (503) ----
  if (chaosEnabled && Math.random() < 0.12) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'health_check_degraded', traceId, fnSpanId, {
      status: 503, region, requestId, parentSpanId, duration: `${latency}ms`,
      reason: 'edge_infrastructure_degraded',
    });
    return new Response(
      JSON.stringify({
        status: 'degraded', region, timestamp: new Date().toISOString(), runtime: 'edge',
        version: VERSION, requestId, traceId, spanId: fnSpanId,
        message: 'Edge infrastructure is experiencing degraded performance.',
        checks: { edge_network: 'degraded', origin_connectivity: 'partial', dns_resolution: 'ok', tls_certificates: 'ok', kv_store: 'unreachable' },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region, 'Retry-After': '30' } }
    );
  }

  // ---- Normal: 2% natural degradation ----
  if (!chaosEnabled && Math.random() < 0.02) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'health_check_degraded', traceId, fnSpanId, {
      status: 503, region, requestId, parentSpanId, duration: `${latency}ms`, reason: 'transient_degradation',
    });
    return new Response(
      JSON.stringify({ status: 'degraded', region, timestamp: new Date().toISOString(), runtime: 'edge', version: VERSION, requestId, traceId, spanId: fnSpanId }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region, 'Retry-After': '30' } }
    );
  }

  const latency = Date.now() - start;
  edgeLog('INFO', 'health_check_ok', traceId, fnSpanId, {
    status: 200, region, requestId, parentSpanId, duration: `${latency}ms`, version: VERSION,
  });

  return new Response(
    JSON.stringify({
      status: 'ok', region, timestamp: new Date().toISOString(), runtime: 'edge',
      version: VERSION, requestId, traceId, spanId: fnSpanId,
      checks: { edge_network: 'ok', origin_connectivity: 'ok', dns_resolution: 'ok', tls_certificates: 'ok', kv_store: 'ok' },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region, 'Cache-Control': 'no-cache, no-store' } }
  );
}
