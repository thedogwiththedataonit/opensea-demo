/**
 * GET /api/health
 *
 * Lightweight health-check endpoint running on Edge Runtime.
 * Returns system status, edge region, timestamp, and version.
 * Simulates occasional 503 "degraded" responses.
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

  // Simulate occasional degraded state (2% chance)
  const isDegraded = Math.random() < 0.02;

  if (isDegraded) {
    const latency = Date.now() - start;
    edgeLog('WARN', 'health_check_degraded', {
      status: 503, region, requestId, latency: `${latency}ms`,
      reason: 'edge_infrastructure_degraded',
    });
    return new Response(
      JSON.stringify({
        status: 'degraded',
        region,
        timestamp: new Date().toISOString(),
        runtime: 'edge',
        version: VERSION,
        requestId,
        message: 'Edge infrastructure is experiencing degraded performance.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Edge-Region': region,
          'Retry-After': '30',
        },
      }
    );
  }

  const latency = Date.now() - start;
  edgeLog('INFO', 'health_check_ok', {
    status: 200, region, requestId, latency: `${latency}ms`, version: VERSION,
  });

  return new Response(
    JSON.stringify({
      status: 'ok',
      region,
      timestamp: new Date().toISOString(),
      runtime: 'edge',
      version: VERSION,
      requestId,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Edge-Region': region,
        'Cache-Control': 'no-cache, no-store',
      },
    }
  );
}
