/**
 * GET /api/tokens/[chain]/[address]/chart
 *
 * Returns OHLC (Open-High-Low-Close) candle data for a token's price chart.
 * Supports configurable timeframe windows (1h, 1d, 7d, 30d) and candle
 * intervals (1m, 5m, 15m, 1h, 4h, 1d).
 *
 * Trace structure:
 *   marketplace.token.chart
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.token.chart.lookup
 *     └── marketplace.price.ohlc  (from price-engine.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine, getOHLCData } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

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
    [MA.CHAIN]: chain,
    [MA.TOKEN_ADDRESS]: address,
    [MA.CHART_TIMEFRAME]: timeframe,
    [MA.CHART_INTERVAL]: interval,
  }, async (rootSpan) => {
    await simulateLatency(40, 100);

    // --- Look up the token ---
    const token = await withSpan(
      tracer,
      'marketplace.token.chart.lookup',
      { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address },
      async (span) => {
        const found = tokens.find((t) => t.chain === chain && t.address === address);
        if (found) {
          span.setAttribute(MA.TOKEN_SYMBOL, found.symbol);
          span.setAttribute(MA.TOKEN_PRICE_USD, found.price);
        }
        return found;
      }
    );

    if (!token) {
      rootSpan.setAttribute('error', true);
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    rootSpan.setAttribute(MA.TOKEN_SYMBOL, token.symbol);

    // Convert timeframe and interval to minutes
    const timeframeMap: Record<string, number> = {
      "1h": 60, "1d": 1440, "7d": 10080, "30d": 43200,
    };
    const intervalMap: Record<string, number> = {
      "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440,
    };

    const tfMinutes = timeframeMap[timeframe] || 60;
    const ivMinutes = intervalMap[interval] || 1;

    // --- Generate OHLC candle data (span is created inside getOHLCData) ---
    const ohlc = getOHLCData(token.priceHistory, tfMinutes, ivMinutes);

    rootSpan.setAttribute(MA.CHART_CANDLE_COUNT, ohlc.length);

    return NextResponse.json({
      token: token.symbol,
      chain: token.chain,
      timeframe,
      interval,
      data: ohlc,
    });
  });
}
