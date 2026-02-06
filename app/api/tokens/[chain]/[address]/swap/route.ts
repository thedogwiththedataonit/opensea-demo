/**
 * POST /api/tokens/[chain]/[address]/swap
 *
 * Generates a mock swap quote for exchanging one token for another.
 * Simulates DEX aggregator behavior with price impact calculation,
 * fee computation, gas estimation, and route description.
 *
 * Intentionally uses higher latency (80-200ms) to simulate the real-world
 * cost of querying multiple liquidity sources for optimal routing.
 *
 * Trace structure:
 *   marketplace.swap.quote
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.swap.validate_input
 *     ├── marketplace.swap.token_lookup
 *     ├── marketplace.swap.price_resolution
 *     ├── marketplace.swap.impact_calculation
 *     └── marketplace.swap.quote_assembly
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency } from "@/app/lib/utils";
import { SwapQuote } from "@/app/lib/data/types";
import { tracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> }
) {
  ensurePriceEngine();

  const { chain, address } = await params;

  return withSpan(tracer, 'marketplace.swap.quote', {
    [MA.CHAIN]: chain,
    [MA.TOKEN_ADDRESS]: address,
  }, async (rootSpan) => {
    await simulateLatency(80, 200);

    // --- Validate request body ---
    const validatedBody = await withSpan(
      tracer,
      'marketplace.swap.validate_input',
      {},
      async (span) => {
        let body: { fromToken?: string; toToken?: string; amount?: number };
        try {
          body = await request.json();
        } catch {
          span.setAttribute('error', true);
          span.setAttribute('error.type', 'invalid_json');
          return { error: "Invalid JSON body", status: 400 } as const;
        }

        const { fromToken, toToken, amount } = body;

        if (!fromToken || !toToken || !amount || amount <= 0) {
          span.setAttribute('error', true);
          span.setAttribute('error.type', 'validation_failed');
          return {
            error: "Missing required fields: fromToken, toToken, amount (> 0)",
            status: 400,
          } as const;
        }

        span.setAttribute(MA.SWAP_FROM_TOKEN, fromToken);
        span.setAttribute(MA.SWAP_TO_TOKEN, toToken);
        span.setAttribute(MA.SWAP_FROM_AMOUNT, amount);
        return { fromToken, toToken, amount } as const;
      }
    );

    // Handle validation errors
    if ('error' in validatedBody && 'status' in validatedBody) {
      rootSpan.setAttribute('error', true);
      return NextResponse.json(
        { error: validatedBody.error },
        { status: validatedBody.status }
      );
    }

    const { fromToken, toToken, amount } = validatedBody;
    rootSpan.setAttribute(MA.SWAP_FROM_TOKEN, fromToken);
    rootSpan.setAttribute(MA.SWAP_TO_TOKEN, toToken);
    rootSpan.setAttribute(MA.SWAP_FROM_AMOUNT, amount);

    // --- Look up the target token ---
    const targetToken = await withSpan(
      tracer,
      'marketplace.swap.token_lookup',
      { [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address },
      async (span) => {
        const found = tokens.find((t) => t.chain === chain && t.address === address);
        if (found) {
          span.setAttribute(MA.TOKEN_SYMBOL, found.symbol);
          span.setAttribute(MA.TOKEN_PRICE_USD, found.price);
          span.setAttribute(MA.TOKEN_IS_NEW, found.isNew);
        }
        return found;
      }
    );

    if (!targetToken) {
      rootSpan.setAttribute('error', true);
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    // --- Resolve from/to prices in USD ---
    const { fromPrice, toPrice, fromValueUsd } = await withSpan(
      tracer,
      'marketplace.swap.price_resolution',
      {
        [MA.SWAP_FROM_TOKEN]: fromToken,
        [MA.TOKEN_SYMBOL]: targetToken.symbol,
      },
      async (span) => {
        const from = fromToken === "SOL" ? 195.42 : fromToken === "ETH" ? 1879.47 : 1;
        const to = targetToken.price;
        const usd = amount * from;

        span.setAttribute('marketplace.swap.from_price_usd', from);
        span.setAttribute('marketplace.swap.to_price_usd', to);
        span.setAttribute(MA.SWAP_AMOUNT_USD, usd);
        return { fromPrice: from, toPrice: to, fromValueUsd: usd };
      }
    );

    rootSpan.setAttribute(MA.SWAP_AMOUNT_USD, fromValueUsd);

    // --- Calculate price impact and fees ---
    const { priceImpact, fee, effectiveAmount, toAmount } = await withSpan(
      tracer,
      'marketplace.swap.impact_calculation',
      { [MA.SWAP_AMOUNT_USD]: fromValueUsd },
      async (span) => {
        const impact = Math.min(fromValueUsd / (targetToken.volume1d || 1) * 100, 50);
        const swapFee = fromValueUsd * 0.003;
        const effective = fromValueUsd - swapFee;
        const output = effective / toPrice * (1 - impact / 100);

        span.setAttribute(MA.SWAP_PRICE_IMPACT_PCT, impact);
        span.setAttribute(MA.SWAP_FEE_USD, swapFee);
        span.setAttribute(MA.SWAP_TO_AMOUNT, output);
        return { priceImpact: impact, fee: swapFee, effectiveAmount: effective, toAmount: output };
      }
    );

    // --- Assemble the final swap quote ---
    const quote = await withSpan(
      tracer,
      'marketplace.swap.quote_assembly',
      {},
      async (span) => {
        const estimatedGas = 0.001 + Math.random() * 0.005;
        const route = `${fromToken} → ${targetToken.symbol}`;
        const expiresAt = Date.now() + 30000;

        const q: SwapQuote = {
          fromToken,
          toToken: targetToken.symbol,
          fromAmount: amount,
          toAmount,
          priceImpact,
          fee,
          feeCurrency: "USD",
          estimatedGas,
          route,
          expiresAt,
        };

        span.setAttribute(MA.SWAP_ROUTE, route);
        span.setAttribute(MA.SWAP_ESTIMATED_GAS, estimatedGas);
        span.setAttribute(MA.SWAP_TO_AMOUNT, toAmount);
        return q;
      }
    );

    // Record final quote summary on the root span for quick trace analysis
    rootSpan.setAttribute(MA.SWAP_PRICE_IMPACT_PCT, quote.priceImpact);
    rootSpan.setAttribute(MA.SWAP_FEE_USD, quote.fee);
    rootSpan.setAttribute(MA.SWAP_TO_AMOUNT, quote.toAmount);
    rootSpan.setAttribute(MA.SWAP_ROUTE, quote.route);

    return NextResponse.json(quote);
  });
}
