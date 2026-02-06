/**
 * GET /api/tokens/[chain]/[address]/chart
 *
 * OHLC price chart data with configurable timeframe and interval.
 *
 * Trace structure:
 *   marketplace.token.chart (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.token.chart.lookup (opensea-data-service)
 *     └── marketplace.price.ohlc (opensea-price-engine)
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getOHLCData } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTracer, mongoTracer, withSpan, MarketplaceAttributes as MA, recordEdgeHeaders, tagSpanService, emitEdgeMiddlewareSpan } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError, ValidationError } from "@/app/lib/errors";
import { log } from "@/app/lib/logger";

export const dynamic = "force-dynamic";

const VALID_TIMEFRAMES = ["1h", "1d", "7d", "30d"];
const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> }
) {
  ensurePriceEngine();
  const { chain, address } = await params;
  const { searchParams } = request.nextUrl;
  const timeframe = searchParams.get("timeframe") || "1h";
  const interval = searchParams.get("interval") || "1m";

  return apiTracer.startActiveSpan('marketplace.token.chart', {
    attributes: {
      [MA.HTTP_METHOD]: 'GET',
      [MA.HTTP_ROUTE]: '/api/tokens/[chain]/[address]/chart',
      [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address, [MA.CHART_TIMEFRAME]: timeframe, [MA.CHART_INTERVAL]: interval,
    },
  }, async (rootSpan) => {
    tagSpanService(rootSpan, 'opensea-api-gateway');
    emitEdgeMiddlewareSpan(request.headers);
    recordEdgeHeaders(rootSpan, request.headers);
    const _start = Date.now();
    log.info('api-gateway', 'GET /api/tokens/[chain]/[address]/chart', { chain, address, timeframe, interval });
    try {
      maybeFault('http500', { route: '/api/tokens/[chain]/[address]/chart', chain, address });
      maybeFault('http502', { route: '/api/tokens/[chain]/[address]/chart' });
      maybeFault('http503', { route: '/api/tokens/[chain]/[address]/chart' });
      maybeFault('http429', { route: '/api/tokens/[chain]/[address]/chart' });

      // Validate timeframe and interval
      if (!VALID_TIMEFRAMES.includes(timeframe)) {
        throw new ValidationError('INVALID_TIMEFRAME', `Invalid timeframe "${timeframe}". Valid: ${VALID_TIMEFRAMES.join(", ")}`, { timeframe, valid: VALID_TIMEFRAMES });
      }
      if (!VALID_INTERVALS.includes(interval)) {
        throw new ValidationError('INVALID_INTERVAL', `Invalid interval "${interval}". Valid: ${VALID_INTERVALS.join(", ")}`, { interval, valid: VALID_INTERVALS });
      }

      await simulateLatency(40, 100);

      const token = await withSpan(mongoTracer, 'marketplace.token.chart.lookup', {
        [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address,
        [MA.DB_OPERATION]: 'read', [MA.DB_COLLECTION]: 'tokens', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const found = tokens.find((t) => t.chain === chain && t.address === address);
        if (found) {
          span.setAttribute(MA.TOKEN_SYMBOL, found.symbol);
          span.setAttribute(MA.TOKEN_PRICE_USD, found.price);
        }
        return found;
      });

      if (!token) {
        throw new NotFoundError('TOKEN_NOT_FOUND', `Token not found on ${chain} at ${address}`, { chain, address });
      }

      rootSpan.setAttribute(MA.TOKEN_SYMBOL, token.symbol);

      const timeframeMap: Record<string, number> = { "1h": 60, "1d": 1440, "7d": 10080, "30d": 43200 };
      const intervalMap: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };

      const ohlc = await getOHLCData(token.priceHistory, timeframeMap[timeframe], intervalMap[interval]);
      rootSpan.setAttribute(MA.CHART_CANDLE_COUNT, ohlc.length);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, ohlc.length);
      rootSpan.setStatus({ code: SpanStatusCode.OK });
      const priceOpen = ohlc.length > 0 ? ohlc[0].open : 0;
      const priceClose = ohlc.length > 0 ? ohlc[ohlc.length - 1].close : 0;
      const pctChange = priceOpen > 0 ? ((priceClose - priceOpen) / priceOpen * 100) : 0;
      log.info('price-engine', 'chart_generated', {
        status: 200, duration: `${Date.now() - _start}ms`,
        token: token.symbol, chain, timeframe, interval,
        candles: ohlc.length,
        open: priceOpen < 1 ? priceOpen.toFixed(6) : priceOpen.toFixed(2),
        close: priceClose < 1 ? priceClose.toFixed(6) : priceClose.toFixed(2),
        periodChange: `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`,
      });

      return NextResponse.json({ token: token.symbol, chain: token.chain, timeframe, interval, data: ohlc });
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    } finally {
      rootSpan.end();
    }
  });
}
