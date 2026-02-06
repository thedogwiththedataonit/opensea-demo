/**
 * GET /api/tokens/[chain]/[address]/chart
 *
 * OHLC price chart data with configurable timeframe and interval.
 *
 * Status codes: 200, 400, 404, 500, 503, 429
 * Error codes: TOKEN_NOT_FOUND, INVALID_TIMEFRAME, CHART_COMPUTATION_FAILED, BUSYBOX_*
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getOHLCData } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { NotFoundError, ValidationError } from "@/app/lib/errors";

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

  return withSpan(tracer, 'marketplace.token.chart', {
    [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address, [MA.CHART_TIMEFRAME]: timeframe, [MA.CHART_INTERVAL]: interval,
  }, async (rootSpan) => {
    try {
      maybeFault('http500', { route: '/api/tokens/[chain]/[address]/chart', chain, address });
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

      const token = await withSpan(tracer, 'marketplace.token.chart.lookup', { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address }, async (span) => {
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

      const ohlc = getOHLCData(token.priceHistory, timeframeMap[timeframe], intervalMap[interval]);
      rootSpan.setAttribute(MA.CHART_CANDLE_COUNT, ohlc.length);

      return NextResponse.json({ token: token.symbol, chain: token.chain, timeframe, interval, data: ohlc });
    } catch (error) {
      return handleRouteError(error, rootSpan);
    }
  });
}
