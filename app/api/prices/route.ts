/**
 * GET /api/prices
 *
 * Lightweight cached token prices endpoint running on Edge Runtime.
 * Parses traceparent from middleware for trace correlation.
 * Generates its own spanId and logs with dd.trace_id/dd.span_id.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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

interface CachedPrice {
  symbol: string; name: string; price: number; change24h: number; chain: string; lastUpdated: string;
}

const CACHED_PRICES: CachedPrice[] = [
  { symbol: 'ETH', name: 'Ethereum', price: 1879.47, change24h: 2.1, chain: 'ethereum', lastUpdated: new Date().toISOString() },
  { symbol: 'SOL', name: 'Solana', price: 195.42, change24h: -0.3, chain: 'solana', lastUpdated: new Date().toISOString() },
  { symbol: 'BFS', name: 'BFS', price: 0.1177, change24h: 32.1, chain: 'ethereum', lastUpdated: new Date().toISOString() },
  { symbol: 'ARB', name: 'Arbitrum', price: 0.11, change24h: -15.4, chain: 'ethereum', lastUpdated: new Date().toISOString() },
  { symbol: 'FTHR', name: "Desperate Dad's Army", price: 0.001339, change24h: 246.1, chain: 'solana', lastUpdated: new Date().toISOString() },
  { symbol: 'ZEUS', name: 'ZEUS', price: 0.0177, change24h: 138.9, chain: 'solana', lastUpdated: new Date().toISOString() },
  { symbol: 'DOG', name: 'The Crypto Dog', price: 0.00058, change24h: 1262.2, chain: 'ethereum', lastUpdated: new Date().toISOString() },
  { symbol: 'SKR', name: 'Seeker', price: 0.02426, change24h: 39.2, chain: 'ethereum', lastUpdated: new Date().toISOString() },
];

export async function GET(request: Request) {
  const start = Date.now();
  const region = request.headers.get('x-edge-region') || 'iad1';
  const requestId = request.headers.get('x-edge-request-id') || 'unknown';
  const chaosEnabled = request.headers.get('x-edge-chaos') === 'true';
  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get('symbols');

  // Parse trace context from middleware
  const traceCtx = parseTraceparent(request.headers.get('traceparent'));
  const traceId = traceCtx?.traceId || request.headers.get('x-edge-trace-id') || '00000000000000000000000000000000';
  const parentSpanId = traceCtx?.parentSpanId || request.headers.get('x-edge-span-id') || '0000000000000000';
  const fnSpanId = generateSpanId();

  edgeLog('INFO', 'prices_requested', traceId, fnSpanId, {
    region, requestId, parentSpanId, symbols: symbolsParam || 'all', chaos: chaosEnabled || undefined,
  });

  // ---- Chaos: Edge KV timeout (504) ----
  if (chaosEnabled && Math.random() < 0.08) {
    const waitMs = Math.round(2000 + Math.random() * 3000);
    await new Promise((r) => setTimeout(r, waitMs));
    const latency = Date.now() - start;
    edgeLog('ERROR', 'kv_timeout', traceId, fnSpanId, {
      status: 504, region, requestId, parentSpanId, duration: `${latency}ms`,
      reason: 'edge_kv_read_timeout', waited: `${waitMs}ms`,
    });
    return new Response(
      JSON.stringify({ error: { code: 'EDGE_KV_TIMEOUT', message: 'Edge KV store timed out.', statusCode: 504, region, requestId, traceId, spanId: fnSpanId, runtime: 'edge' } }),
      { status: 504, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region } }
    );
  }

  // ---- Chaos: Cache corruption (500) ----
  if (chaosEnabled && Math.random() < 0.06) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'cache_corruption', traceId, fnSpanId, {
      status: 500, region, requestId, parentSpanId, duration: `${latency}ms`,
      reason: 'malformed_cache_entry',
    });
    return new Response(
      JSON.stringify({ error: { code: 'EDGE_CACHE_CORRUPTION', message: 'Cached price data is corrupted.', statusCode: 500, region, requestId, traceId, spanId: fnSpanId, runtime: 'edge' } }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region } }
    );
  }

  // ---- Chaos: Edge function memory exceeded (502) ----
  if (chaosEnabled && Math.random() < 0.04) {
    const latency = Date.now() - start;
    edgeLog('ERROR', 'memory_exceeded', traceId, fnSpanId, {
      status: 502, region, requestId, parentSpanId, duration: `${latency}ms`,
      reason: 'edge_function_oom', memoryUsed: '130MB', memoryLimit: '128MB',
    });
    return new Response(
      JSON.stringify({ error: { code: 'EDGE_MEMORY_EXCEEDED', message: 'Edge function exceeded 128MB memory limit.', statusCode: 502, region, requestId, traceId, spanId: fnSpanId, runtime: 'edge' } }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'X-Edge-Region': region } }
    );
  }

  // ---- Normal cache behavior ----
  const cacheAge = Math.floor(Math.random() * 30);
  const isStale = cacheAge > 20;
  const isCacheMiss = Math.random() < 0.05;

  if (isCacheMiss) {
    edgeLog('DEBUG', 'cache_miss', traceId, fnSpanId, { region, requestId, parentSpanId, source: 'edge-kv' });
  } else {
    edgeLog('DEBUG', 'cache_hit', traceId, fnSpanId, { region, requestId, parentSpanId, source: 'edge-kv', age: `${cacheAge}s`, stale: isStale || undefined });
  }

  if (isStale) {
    edgeLog('WARN', 'stale_data', traceId, fnSpanId, { region, requestId, parentSpanId, age: `${cacheAge}s`, threshold: '20s' });
  }

  let prices = CACHED_PRICES;
  if (symbolsParam) {
    const requested = symbolsParam.toUpperCase().split(',').map(s => s.trim());
    prices = CACHED_PRICES.filter(p => requested.includes(p.symbol));
  }

  const noisyPrices = prices.map(p => ({
    ...p, price: p.price * (1 + (Math.random() - 0.5) * 0.002),
    lastUpdated: new Date(Date.now() - cacheAge * 1000).toISOString(),
  }));

  const latency = Date.now() - start;
  edgeLog('INFO', 'prices_served', traceId, fnSpanId, {
    status: 200, region, requestId, parentSpanId, duration: `${latency}ms`,
    tokens: noisyPrices.length, cacheAge: `${cacheAge}s`,
    stale: isStale || undefined, cacheMiss: isCacheMiss || undefined,
  });

  return new Response(
    JSON.stringify({
      prices: noisyPrices,
      meta: { runtime: 'edge', region, requestId, traceId, spanId: fnSpanId, cacheAge, stale: isStale, timestamp: new Date().toISOString() },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json', 'X-Edge-Region': region, 'X-Edge-Request-Id': requestId,
        'X-Cache-Age': cacheAge.toString(),
        'X-Cache-Status': isStale ? 'STALE' : isCacheMiss ? 'MISS' : 'HIT',
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    }
  );
}
