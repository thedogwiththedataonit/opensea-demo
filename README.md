# OpenSea Marketplace Mock

A fully functional mock NFT marketplace built with Next.js 16, React 19, and Tailwind CSS 4. Designed as a tracing and observability demonstration application with realistic client-server interactions, live price simulation, and comprehensive OpenTelemetry instrumentation.

No external APIs. No databases. No third-party services. Everything runs in-memory on a single Next.js server.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What This Is

This application mirrors the core pages and data flows of OpenSea — the NFT and token marketplace — with enough depth to produce meaningful distributed traces. Every API route does real work: filtering, sorting, paginating, computing swap quotes, and generating OHLC chart data from a live price simulation engine.

It is purpose-built for:

- **Tracing demonstrations** — every API route is instrumented with nested OpenTelemetry spans and marketplace-specific semantic attributes
- **Observability tooling evaluation** — the app generates realistic trace patterns with variable latency, nested spans, error states, and domain-specific metadata
- **Frontend-to-backend flow analysis** — client components poll API routes at realistic intervals, producing continuous trace traffic

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Styling | Tailwind CSS | 4 |
| Tracing | @vercel/otel + @opentelemetry/api | 2.1 / 1.9 |
| Language | TypeScript | 5 |
| Data | In-memory (module-scoped arrays) | — |

Zero additional dependencies beyond the above.

## Pages

| Route | Description |
|---|---|
| `/` | Home — hero carousel, trending tokens grid, top collections sidebar |
| `/collections` | Collection list (PLP) — sortable table with chain/category filters |
| `/collection/[slug]` | Collection detail (PDP) — banner, stats, NFT card grid |
| `/nft/[slug]/[tokenId]` | NFT detail (PDP) — image, price, traits, activity history |
| `/tokens` | Token list (PLP) — sortable table with live 5s polling |
| `/token/[chain]/[address]` | Token detail (PDP) — price chart, swap widget, stats |

## API Routes

10 endpoints, all `force-dynamic`, all instrumented with OpenTelemetry:

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/trending` | Homepage aggregate: featured collections, top collections, trending tokens |
| GET | `/api/search?q=` | Cross-entity search across collections and tokens |
| GET | `/api/collections` | Paginated collection list with chain/category/sort filters |
| GET | `/api/collections/[slug]` | Single collection detail |
| GET | `/api/collections/[slug]/items` | NFTs in a collection with status/sort/pagination |
| GET | `/api/nfts/[slug]/[tokenId]` | Single NFT detail with traits and activity |
| GET | `/api/tokens` | Paginated token list with tab/chain/FDV/sort filters |
| GET | `/api/tokens/[chain]/[address]` | Single token detail |
| GET | `/api/tokens/[chain]/[address]/chart` | OHLC price chart data with timeframe/interval params |
| POST | `/api/tokens/[chain]/[address]/swap` | Swap quote with price impact, fees, gas, and routing |

## Live Data Simulation

A server-side price engine starts on the first API request and runs continuously:

- **Every 3 seconds**: applies random-walk price deltas to all 15 tokens and 12 collection floor prices
- Token `priceHistory` arrays accumulate new data points (capped at 2880 entries)
- Change percentages (`1h`, `1d`, `30d`), volumes, and FDV drift realistically
- New/meme tokens have higher volatility (0.015) than established tokens (0.004)

This means every API call returns slightly different data — no two responses are identical.

## Client Polling Intervals

| Page | Endpoint | Interval |
|---|---|---|
| Home | `/api/trending` | 10s |
| Collections PLP | `/api/collections` | 10s |
| Collection PDP | `/api/collections/[slug]` + `.../items` | 15s |
| NFT PDP | `/api/nfts/[slug]/[tokenId]` | One-shot (no poll) |
| Tokens PLP | `/api/tokens` | 5s |
| Token PDP | `/api/tokens/.../` + `.../chart` | 5s |
| Status bar | `/api/trending` | 15s |
| Search modal | `/api/search` | On keystroke (250ms debounce) |

## OpenTelemetry Tracing

Instrumentation follows the [Vercel OTel reference](https://vercel.com/docs/tracing/instrumentation) for Next.js:

```
instrumentation.ts          → registerOTel({ serviceName: 'opensea-marketplace' })
app/lib/tracing.ts          → tracer, withSpan() helper, MarketplaceAttributes constants
```

### Span Architecture

Every API route produces a trace tree with a root span and nested child spans for each sub-operation:

```
marketplace.swap.quote                          ← root span
  ├── marketplace.infra.latency_simulation      ← simulated network delay
  ├── marketplace.swap.validate_input           ← parse + validate POST body
  ├── marketplace.swap.token_lookup             ← find token by chain+address
  ├── marketplace.swap.price_resolution         ← resolve USD prices
  ├── marketplace.swap.impact_calculation       ← compute price impact + fees
  └── marketplace.swap.quote_assembly           ← build final SwapQuote
```

### Custom Attributes

All attributes use the `marketplace.*` namespace. Examples:

```
marketplace.chain                = "ethereum"
marketplace.token.symbol         = "DOG"
marketplace.token.price_usd      = 0.00058
marketplace.swap.price_impact_pct = 0.05
marketplace.swap.fee_usd         = 2.82
marketplace.swap.route           = "ETH → DOG"
marketplace.search.query         = "punk"
marketplace.search.collection_hits = 1
marketplace.pagination.total     = 12
marketplace.chart.candle_count   = 60
marketplace.infra.latency_ms     = 45
```

Full attribute reference is in `app/lib/tracing.ts` — 45 typed constants under `MarketplaceAttributes`.

### Latency Injection

Every API route calls `simulateLatency(min, max)` which creates a visible `marketplace.infra.latency_simulation` span with the actual delay recorded as an attribute. This produces realistic timing variance across traces:

| Route | Min | Max |
|---|---|---|
| Collection/token lookups | 20ms | 60ms |
| List endpoints | 30ms | 100ms |
| NFT item queries | 40ms | 120ms |
| Chart computation | 40ms | 100ms |
| Swap quotes | 80ms | 200ms |

## Mock Data

| Entity | Count | Source |
|---|---|---|
| Collections | 12 | CryptoPunks, BAYC, Pudgy Penguins, Moonbirds, MAYC, Milady, etc. |
| NFTs | 96 | 8 per collection, deterministic traits and activity |
| Tokens | 15 | BFS, ARB, FTHR, hedge, arc, RNBW, pippin, SOL, etc. |
| Price history | ~1440 points/token | Generated at startup, extended by price engine |
| NFT traits | 7 per NFT | Background, Body, Eyes, Mouth, Headwear, Clothing, Accessory |
| Activity events | 3-8 per NFT | Sales, transfers, listings, offers, mints |

All images are inline SVG data URIs with gradient backgrounds — no external image hosting.

## Project Structure

```
opensea/
├── instrumentation.ts                 OTel registration (Next.js entry point)
├── app/
│   ├── layout.tsx                     Global layout: sidebar, topbar, status bar
│   ├── page.tsx                       Home page
│   ├── collections/page.tsx           Collection list PLP
│   ├── collection/[slug]/page.tsx     Collection detail PDP
│   ├── nft/[slug]/[tokenId]/page.tsx  NFT detail PDP
│   ├── tokens/page.tsx                Token list PLP
│   ├── token/[chain]/[address]/page.tsx Token detail PDP
│   ├── api/                           10 API route handlers
│   ├── components/                    Shared UI components
│   ├── hooks/                         usePollingFetch, useSearch
│   └── lib/
│       ├── tracing.ts                 Tracer, withSpan, MarketplaceAttributes
│       ├── price-engine.ts            Live price simulation engine
│       ├── utils.ts                   Formatting + latency simulation
│       ├── api-client.ts              Typed fetch wrappers
│       └── data/
│           ├── types.ts               TypeScript interfaces
│           ├── collections.ts         Collection + NFT mock data
│           └── tokens.ts              Token mock data
├── API_BREAKDOWN.md                   Full API + interaction reference
└── .cursor/agents.md                  Agent rules for tracing consistency
```
# opensea-demo
