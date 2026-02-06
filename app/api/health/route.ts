/**
 * GET /api/health
 *
 * Lightweight health-check endpoint running on Edge Runtime.
 * Returns system status, edge region, timestamp, and version.
 * Integrates with busybox chaos: simulates degraded (503), edge crash (500),
 * and cold start delays.
 *
 * OTEL not supported on Edge — uses structured console.log.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const EDGE_REGIONS = ['iad1', 'sfo1', 'cdg1', 'nrt1', 'sin1', 'gru1', 'syd1', 'lhr1'];
const VERSION = '1.0.0';

function edgeLog(level: string, op: string, meta: Record<string, unknown> = {}) {
  const d = new Date();
  const ts = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}:${d.getUTCSeconds().toString().padStart(2, '0')}.${d.getUTCMilliseconds().toString().padStart(3, '0')}`;
  const metaStr = Object.entries(meta).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join(' ');
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

  edgeLog('INFO', 'health_check_started', { region, requestId, chaos: chaosEnabled || undefined });

  // ---- Chaos: Edge function crash (500) ----
  if (chaosEnabled && Math.random() < 0.10) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'health_check_crash', {
      status: 500, region, requestId, latency: `${latency}ms`,
      reason: 'edge_function_uncaught_exception',
      error: 'TypeError: Cannot read properties of undefined (reading \'status\')',
    });
    return new Response(
      JSON.stringify({
        error: {
          code: 'EDGE_FUNCTION_CRASH',
          message: 'Edge function encountered an uncaught exception during health check.',
          statusCode: 500, region, requestId, runtime: 'edge',
          stack: 'TypeError: Cannot read properties of undefined\n    at healthCheck (edge-function:27:15)\n    at GET (edge-function:42:10)',
        },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region } }
    );
  }

  // ---- Chaos: Edge cold start delay ----
  if (chaosEnabled && Math.random() < 0.15) {
    const coldStartMs = Math.round(800 + Math.random() * 2200); // 0.8-3s
    edgeLog('WARN', 'edge_cold_start', {
      region, requestId, delay: `${coldStartMs}ms`,
      reason: 'v8_isolate_initialization',
    });
    await new Promise((r) => setTimeout(r, coldStartMs));
  }

  // ---- Chaos: Degraded state (503) ----
  if (chaosEnabled && Math.random() < 0.12) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'health_check_degraded', {
      status: 503, region, requestId, latency: `${latency}ms`,
      reason: 'edge_infrastructure_degraded',
    });
    return new Response(
      JSON.stringify({
        status: 'degraded',
        region, timestamp: new Date().toISOString(), runtime: 'edge',
        version: VERSION, requestId,
        message: 'Edge infrastructure is experiencing degraded performance. Some requests may fail.',
        checks: {
          edge_network: 'degraded', origin_connectivity: 'partial', dns_resolution: 'ok',
          tls_certificates: 'ok', kv_store: 'unreachable',
        },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region, 'Retry-After': '30' },
      }
    );
  }

  // ---- Normal: Healthy (2% natural degradation without chaos) ----
  if (!chaosEnabled && Math.random() < 0.02) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'health_check_degraded', {
      status: 503, region, requestId, latency: `${latency}ms`,
      reason: 'transient_degradation',
    });
    return new Response(
      JSON.stringify({ status: 'degraded', region, timestamp: new Date().toISOString(), runtime: 'edge', version: VERSION, requestId }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region, 'Retry-After': '30' } }
    );
  }

  const latency = Date.now() - start;
  edgeLog('INFO', 'health_check_ok', {
    status: 200, region, requestId, latency: `${latency}ms`, version: VERSION,
  });

  return new Response(
    JSON.stringify({
      status: 'ok', region, timestamp: new Date().toISOString(), runtime: 'edge',
      version: VERSION, requestId,
      checks: {
        edge_network: 'ok', origin_connectivity: 'ok', dns_resolution: 'ok',
        tls_certificates: 'ok', kv_store: 'ok',
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region, 'Cache-Control': 'no-cache, no-store' },
    }
  );
}
