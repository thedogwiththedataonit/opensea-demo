/**
 * POST /api/tokens/[chain]/[address]/swap
 *
 * Mock swap quote with price impact, fees, gas, and routing.
 *
 * Trace structure:
 *   marketplace.swap.quote (opensea-api-gateway)
 *     ├── marketplace.infra.latency_simulation
 *     ├── marketplace.swap.validate_input (opensea-api-gateway)
 *     ├── marketplace.swap.token_lookup (opensea-data-service)
 *     ├── marketplace.swap.price_resolution (opensea-data-service)
 *     ├── marketplace.swap.impact_calculation (opensea-data-service)
 *     └── marketplace.swap.quote_assembly (opensea-data-service)
 */

import { NextRequest, NextResponse } from "next/server";
import { tokens } from "@/app/lib/data/tokens";
import { ensurePriceEngine } from "@/app/lib/price-engine";
import { simulateLatency, simulateDbLatency } from "@/app/lib/utils";
import { SwapQuote } from "@/app/lib/data/types";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTracer, mongoTracer, chainlinkTracer, uniswapTracer, gasTracer, withSpan, MarketplaceAttributes as MA } from "@/app/lib/tracing";
import { handleRouteError } from "@/app/lib/error-handler";
import { maybeFault } from "@/app/lib/busybox";
import { ValidationError, NotFoundError, UnprocessableError } from "@/app/lib/errors";
import { log } from "@/app/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chain: string; address: string }> }
) {
  ensurePriceEngine();
  const { chain, address } = await params;

  return apiTracer.startActiveSpan('marketplace.swap.quote', {
    attributes: {
      [MA.HTTP_METHOD]: 'POST',
      [MA.HTTP_ROUTE]: '/api/tokens/[chain]/[address]/swap',
      [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address,
    },
  }, async (rootSpan) => {
    const _start = Date.now();
    log.info('api-gateway', 'POST /api/tokens/[chain]/[address]/swap', { chain, address });
    try {
      maybeFault('http500', { route: '/api/tokens/[chain]/[address]/swap', chain, address });
      maybeFault('http502', { route: '/api/tokens/[chain]/[address]/swap' });
      maybeFault('http503', { route: '/api/tokens/[chain]/[address]/swap' });
      maybeFault('http429', { route: '/api/tokens/[chain]/[address]/swap' });

      await simulateLatency(80, 200);

      // --- Validate request body ---
      const validatedBody = await withSpan(apiTracer, 'marketplace.swap.validate_input', {
        [MA.DB_OPERATION]: 'read',
      }, async (span) => {
        const delayMs = await simulateDbLatency('cache_hit');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);

        let body: { fromToken?: string; toToken?: string; amount?: number };
        try {
          body = await request.json();
        } catch {
          throw new ValidationError('INVALID_REQUEST_BODY', 'Request body must be valid JSON', { contentType: request.headers.get('content-type') });
        }

        const { fromToken, toToken, amount } = body;
        if (!fromToken || !toToken || !amount || amount <= 0) {
          throw new ValidationError('SWAP_VALIDATION_FAILED', 'Missing required fields: fromToken, toToken, amount (> 0)', {
            fromToken: fromToken || null, toToken: toToken || null, amount: amount || null,
          });
        }

        span.setAttribute(MA.SWAP_FROM_TOKEN, fromToken);
        span.setAttribute(MA.SWAP_TO_TOKEN, toToken);
        span.setAttribute(MA.SWAP_FROM_AMOUNT, amount);
        return { fromToken, toToken, amount };
      });

      const { fromToken, toToken, amount } = validatedBody;
      rootSpan.setAttribute(MA.SWAP_FROM_TOKEN, fromToken);
      rootSpan.setAttribute(MA.SWAP_TO_TOKEN, toToken);
      rootSpan.setAttribute(MA.SWAP_FROM_AMOUNT, amount);

      // --- Look up target token ---
      const targetToken = await withSpan(mongoTracer, 'marketplace.swap.token_lookup', {
        [MA.CHAIN]: chain, [MA.TOKEN_ADDRESS]: address,
        [MA.DB_OPERATION]: 'read', [MA.DB_COLLECTION]: 'tokens', [MA.DATA_SOURCE]: 'in-memory',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_read');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const found = tokens.find((t) => t.chain === chain && t.address === address);
        if (found) {
          span.setAttribute(MA.TOKEN_SYMBOL, found.symbol);
          span.setAttribute(MA.TOKEN_PRICE_USD, found.price);
          span.setAttribute(MA.TOKEN_IS_NEW, found.isNew);
        }
        return found;
      });

      if (!targetToken) {
        throw new NotFoundError('TOKEN_NOT_FOUND', `Token not found on ${chain} at ${address}`, { chain, address });
      }

      // Busybox: inject liquidity failure specifically for swap
      maybeFault('http422', { route: '/api/tokens/[chain]/[address]/swap', token: targetToken.symbol });

      // --- Resolve prices ---
      const { toPrice, fromValueUsd } = await withSpan(chainlinkTracer, 'marketplace.swap.price_resolution', {
        [MA.SWAP_FROM_TOKEN]: fromToken, [MA.TOKEN_SYMBOL]: targetToken.symbol,
        [MA.DB_OPERATION]: 'read', [MA.DATA_SOURCE]: 'chainlink-oracle',
      }, async (span) => {
        const delayMs = await simulateDbLatency('external_api');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);
        const from = fromToken === "SOL" ? 195.42 : fromToken === "ETH" ? 1879.47 : 1;
        const to = targetToken.price;
        const usd = amount * from;
        span.setAttribute('marketplace.swap.from_price_usd', from);
        span.setAttribute('marketplace.swap.to_price_usd', to);
        span.setAttribute(MA.SWAP_AMOUNT_USD, usd);
        return { fromPrice: from, toPrice: to, fromValueUsd: usd };
      });

      rootSpan.setAttribute(MA.SWAP_AMOUNT_USD, fromValueUsd);

      // --- Compute price impact + fees ---
      const { priceImpact, fee, toAmount } = await withSpan(uniswapTracer, 'marketplace.swap.impact_calculation', {
        [MA.SWAP_AMOUNT_USD]: fromValueUsd,
        [MA.DB_OPERATION]: 'aggregate', [MA.DATA_SOURCE]: 'uniswap-v3',
      }, async (span) => {
        const delayMs = await simulateDbLatency('db_aggregate');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);

        const impact = Math.min(fromValueUsd / (targetToken.volume1d || 1) * 100, 50);
        const swapFee = fromValueUsd * 0.003;
        const effective = fromValueUsd - swapFee;
        const output = effective / toPrice * (1 - impact / 100);

        // Business logic check: reject if price impact is dangerously high
        if (impact > 25) {
          throw new UnprocessableError('PRICE_IMPACT_TOO_HIGH', `Price impact of ${impact.toFixed(2)}% exceeds 25% safety threshold`, {
            priceImpact: impact, threshold: 25, amountUsd: fromValueUsd,
          });
        }

        span.setAttribute(MA.SWAP_PRICE_IMPACT_PCT, impact);
        span.setAttribute(MA.SWAP_FEE_USD, swapFee);
        span.setAttribute(MA.SWAP_TO_AMOUNT, output);
        return { priceImpact: impact, fee: swapFee, toAmount: output };
      });

      // --- Assemble quote ---
      const quote = await withSpan(gasTracer, 'marketplace.swap.quote_assembly', {
        [MA.DB_OPERATION]: 'read', [MA.DATA_SOURCE]: 'etherscan-gas',
      }, async (span) => {
        const delayMs = await simulateDbLatency('cache_hit');
        span.setAttribute(MA.DB_DURATION_MS, delayMs);

        const estimatedGas = 0.001 + Math.random() * 0.005;
        const route = `${fromToken} → ${targetToken.symbol}`;
        const q: SwapQuote = {
          fromToken, toToken: targetToken.symbol, fromAmount: amount, toAmount,
          priceImpact, fee, feeCurrency: "USD", estimatedGas, route, expiresAt: Date.now() + 30000,
        };
        span.setAttribute(MA.SWAP_ROUTE, route);
        span.setAttribute(MA.SWAP_ESTIMATED_GAS, estimatedGas);
        span.setAttribute(MA.SWAP_TO_AMOUNT, toAmount);
        return q;
      });

      rootSpan.setAttribute(MA.SWAP_PRICE_IMPACT_PCT, quote.priceImpact);
      rootSpan.setAttribute(MA.SWAP_FEE_USD, quote.fee);
      rootSpan.setAttribute(MA.SWAP_TO_AMOUNT, quote.toAmount);
      rootSpan.setAttribute(MA.SWAP_ROUTE, quote.route);
      rootSpan.setAttribute(MA.HTTP_STATUS_CODE, 200);
      rootSpan.setAttribute(MA.RESPONSE_ITEMS, 1);
      rootSpan.setStatus({ code: SpanStatusCode.OK });
      log.info('data-service', 'swap_quote_generated', {
        status: 200, duration: `${Date.now() - _start}ms`,
        pair: `${quote.fromToken}/${quote.toToken}`, chain,
        inputAmount: `${quote.fromAmount} ${quote.fromToken}`,
        outputAmount: `${quote.toAmount.toFixed(2)} ${quote.toToken}`,
        priceImpact: `${quote.priceImpact.toFixed(2)}%`,
        fee: `$${quote.fee.toFixed(4)}`, gas: `${quote.estimatedGas.toFixed(4)} ${chain === 'solana' ? 'SOL' : 'ETH'}`,
        route: quote.route, expiresIn: '30s',
      });
      return NextResponse.json(quote);
    } catch (error) {
      return await handleRouteError(error, rootSpan);
    } finally {
      rootSpan.end();
    }
  });
}
