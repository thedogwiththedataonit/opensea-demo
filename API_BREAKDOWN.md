# OpenSea Mock Application — API & Interaction Breakdown

Complete reference for all API routes, server-side subfunctions, client-side hooks, data generation logic, and user flow interactions that power the mock NFT marketplace.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Server-Side Data Layer](#server-side-data-layer)
3. [Price Simulation Engine](#price-simulation-engine)
4. [API Route Reference](#api-route-reference)
5. [Client-Side Fetching Layer](#client-side-fetching-layer)
6. [Page-by-Page Interaction Map](#page-by-page-interaction-map)
7. [Complete Request-Response Catalog](#complete-request-response-catalog)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         SERVER (Node.js Runtime)                        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  In-Memory Data Stores (module-scoped, mutated in-place)           │ │
│  │                                                                     │ │
│  │  collections.ts        tokens.ts           price-engine.ts          │ │
│  │  ├─ 12 Collection[]    ├─ 15 Token[]       ├─ ensurePriceEngine()  │ │
│  │  ├─ 96 NFT[]           ├─ ~1440 PricePoint  ├─ getSparklineData()  │ │
│  │  ├─ ~500 Activity[]    │  per token         ├─ getOHLCData()       │ │
│  │  │                     │                    │                       │ │
│  │  │  Generator Fns:     │  Generator Fns:    │  Every 3s:            │ │
│  │  │  collectionImage()  │  tokenImage()      │  mutate all prices    │ │
│  │  │  bannerImage()      │  generatePrice     │  mutate all floors    │ │
│  │  │  nftImage()         │    History()        │  push priceHistory    │ │
│  │  │  generateNFTs()     │                    │  drift volumes        │ │
│  │  │  generateActivity() │                    │                       │ │
│  │  │  hashCode()         │                    │                       │ │
│  │  └─────────────────────┴────────────────────┴───────────────────────┘ │
│  │                                                                       │
│  │  utils.ts                                                             │
│  │  ├─ simulateLatency(min, max)    Inject random delay per request     │ │
│  │  ├─ formatCompactNumber(num)     $1.2M formatting                    │ │
│  │  ├─ formatPrice(price)           Adaptive decimal precision          │ │
│  │  ├─ formatChange(change)         +8.2% formatting                   │ │
│  │  ├─ timeAgo(timestamp)           "3h ago" formatting                │ │
│  │  └─ truncateAddress(addr)        0x1a2b...ef12                      │ │
│  │                                                                       │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │                     10 API Route Handlers                             │ │
│  │  /api/trending          GET     Home page aggregate                  │ │
│  │  /api/search            GET     Cross-entity search                  │ │
│  │  /api/collections       GET     Paginated collection list            │ │
│  │  /api/collections/[s]   GET     Single collection detail             │ │
│  │  /api/collections/[s]/items GET  NFTs in collection                  │ │
│  │  /api/nfts/[s]/[id]     GET     Single NFT detail                   │ │
│  │  /api/tokens            GET     Paginated token list                 │ │
│  │  /api/tokens/[c]/[a]    GET     Single token detail                  │ │
│  │  /api/tokens/[c]/[a]/chart GET  OHLC chart data                     │ │
│  │  /api/tokens/[c]/[a]/swap POST  Swap quote calculation              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ HTTP (JSON over localhost)
┌──────────────────────────────▼───────────────────────────────────────────┐
│                         CLIENT (React 19 in Browser)                     │
│                                                                          │
│  Hooks:                                                                  │
│  ├─ usePollingFetch(url, intervalMs)   Auto-refetching data hook        │
│  └─ useSearch()                        Debounced search with state       │
│                                                                          │
│  API Client:                                                             │
│  ├─ apiGet<T>(url)                     Typed GET with error handling    │
│  └─ apiPost<T>(url, body)             Typed POST with error handling   │
│                                                                          │
│  6 Pages:                                                                │
│  ├─ /                     Home         polls /api/trending every 10s    │
│  ├─ /collections          PLP          polls /api/collections every 10s │
│  ├─ /collection/[slug]    PDP          polls collection + items, 15s   │
│  ├─ /nft/[slug]/[tokenId] PDP          one-shot fetch, no polling      │
│  ├─ /tokens               PLP          polls /api/tokens every 5s      │
│  └─ /token/[chain]/[addr] PDP          polls token + chart every 5s    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Server-Side Data Layer

### Mock Data Generation Functions

All data is generated at module initialization time and stored in module-scoped arrays. No database. No external APIs.

#### `app/lib/data/collections.ts`

| Function | Signature | Purpose |
|---|---|---|
| `collectionImage` | `(name: string, hue: number) => string` | Generates a data-URI SVG with a linear gradient background and the collection name as text. Hue parameter creates visual variety across collections. Returns a 200x200 inline SVG. |
| `bannerImage` | `(hue: number) => string` | Generates a 1200x400 data-URI SVG gradient used as the collection banner on detail pages. |
| `nftImage` | `(collectionName: string, tokenId: string, hue: number) => string` | Generates a 400x400 data-URI SVG for individual NFTs. The hue is offset by `tokenId * 37` so each NFT in a collection gets a unique color. Displays `#tokenId` and collection name. |
| `hashCode` | `(str: string) => number` | Deterministic hash function (Java-style). Used as a seeded PRNG so the same inputs always produce the same outputs — NFT traits, owners, prices, and activity events are all reproducible across server restarts. |
| `generateActivity` | `(tokenId: string, collectionSlug: string) => Activity[]` | Creates 3–8 activity events (sale, transfer, list, offer, mint) for an NFT. Event types, prices, addresses, and timestamps are all derived from `hashCode` to be deterministic. Events span the last 1–30 days. Returns sorted newest-first. |
| `generateNFTs` | `(collection: Collection, count: number) => NFT[]` | Master NFT factory. For each NFT: generates a deterministic `tokenId`, assigns 7 traits from `traitTypes × traitValues` lookup tables, determines listing status based on the collection's `listedPct`, computes a current price as a multiplier of floor price, assigns an owner from `ownerNames[]`, and generates an activity history. |

**Data produced at startup:**

- `collections` — 12 `Collection` objects (CryptoPunks, BAYC, Pudgy Penguins, Hypurr, Moonbirds, Lil Pudgys, MAYC, Milady Maker, Axie Land, DX Terminal, rektguy, Good Vibes Club)
- `nftsByCollection` — `Record<string, NFT[]>` mapping each slug to 8 NFTs (96 total)
- `allNFTs` — flat array of all 96 NFTs

**Trait generation tables:**

| Trait Type | Possible Values (8 each) |
|---|---|
| Background | Blue, Red, Green, Purple, Gold, Black, White, Orange |
| Body | Default, Gold, Zombie, Alien, Robot, Diamond, Ape, Dark |
| Eyes | Normal, Laser, 3D, Closed, Sunglasses, Angry, Wide, Tired |
| Mouth | Smile, Frown, Pipe, Cigarette, Grin, Open, Tongue, Neutral |
| Headwear | None, Cap, Beanie, Crown, Halo, Bandana, Hoodie, Mohawk |
| Clothing | None, Hoodie, Suit, T-Shirt, Armor, Chain, Toga, Leather |
| Accessory | None, Chain, Earring, Watch, Ring, Monocle, Scarf, Medal |

Each NFT gets exactly 7 traits. Rarity percentages are generated as `5% + (hash % 45)%`.

#### `app/lib/data/tokens.ts`

| Function | Signature | Purpose |
|---|---|---|
| `tokenImage` | `(symbol: string, hue: number) => string` | Generates an 80x80 data-URI SVG with a radial gradient circle and the token symbol as centered text. |
| `generatePriceHistory` | `(basePrice: number, points: number, volatility: number) => PricePoint[]` | Creates a synthetic price history using random walk. Starts at `basePrice × (0.6–1.0)` and applies `(random - 0.48) × volatility` deltas at 1-minute intervals. Last point is adjusted to match `basePrice` exactly. Produces 1441 points per token (~24 hours). |

**Data produced at startup:**

- `tokens` — 15 `Token` objects across Ethereum and Solana chains
- Each token has ~1440 `PricePoint` entries in `priceHistory`
- Volatility ranges: verified tokens get `0.002–0.01`, new/meme tokens get `0.015–0.04`

### Mock Owner/Address Pools

**Owner display names** (used for NFT owners and activity addresses):

```
0xA1b2...c3D4, 0x9f8E...7d6C, 0x5a4B...3c2D, vitalik.eth,
punk6529.eth, pranksy.eth, 0xD1e2...f3A4, cobie.eth
```

**Contract addresses** (8 mock addresses, assigned deterministically per collection via hashCode):

```
0x1a2b3c4d..., 0xdeadbeef..., 0xc0ffee25..., 0xbadc0de0...,
0xfeed0000..., 0xace00000..., 0xbabe0000..., 0xdad00000...
```

---

## Price Simulation Engine

**File:** `app/lib/price-engine.ts`

### `ensurePriceEngine()`

Called by every API route handler on entry. Uses a module-scoped `engineStarted` boolean flag to ensure the `setInterval` is only created once per server process.

**Tick behavior (every 3 seconds):**

For each of the 15 tokens:
1. Compute `volatility` = `0.015` for new tokens, `0.004` for established tokens
2. Apply delta: `price = price × (1 + (random - 0.48) × volatility)`
3. Clamp price floor at `0.0000001`
4. Drift `change1h` by `±0.15`, `change1d` by `±0.05`, `change30d` by `±0.025`
5. Push new `{timestamp, price}` to `priceHistory[]`
6. Trim history to last 2880 entries (~48 hours at the push rate)
7. Drift `volume1d` by `±0.25%`
8. Recalculate `fdv` proportionally to price change

For each of the 12 collections:
1. Apply delta: `floorPrice = floorPrice × (1 + (random - 0.5) × 0.003)`
2. Clamp floor at `0.0001`
3. Drift `change1d` by `±0.05`, `change7d` by `±0.025`

### `getSparklineData(priceHistory, points)`

Extracts the last `N` price points from a token's history for miniature chart rendering. Default `points = 20`. Returns a new array (does not mutate source).

### `getOHLCData(priceHistory, timeframeMinutes, intervalMinutes)`

Converts raw `PricePoint[]` into bucketed OHLC (Open-High-Low-Close) candles.

1. Filter `priceHistory` to entries within `timeframeMinutes` of now
2. Bucket entries by `intervalMinutes` boundaries
3. For each bucket: `open` = first entry price, `high` = max, `low` = min, `close` = last entry price
4. Returns `{timestamp, open, high, low, close}[]`

---

## API Route Reference

All routes are in `app/api/` and use Next.js 16 App Router conventions. Every route:
- Exports `const dynamic = "force-dynamic"` to prevent static caching
- Calls `ensurePriceEngine()` to start the price simulation
- Calls `simulateLatency(min, max)` to inject realistic delay for tracing
- Uses `NextRequest` / `NextResponse` (Web Standard API)
- Uses `params: Promise<{...}>` with `await params` (Next.js 16 async params)

---

### `GET /api/trending`

**File:** `app/api/trending/route.ts`
**Latency:** 30–80ms
**Used by:** Home page (`/`), Status bar

**Server-side operations:**
1. Clone and sort `collections` by `totalVolume` descending → take top 3 as `featuredCollections`
2. Clone and sort `collections` by `totalVolume` descending → take top 10 as `topCollections`
3. Clone and sort `tokens` by `|change1d|` descending → take top 6
4. For each trending token: call `getSparklineData(priceHistory, 20)` → extract price values only
5. Strip `priceHistory` from response (send `sparkline: number[]` instead)

**Response shape:**
```typescript
{
  featuredCollections: Collection[],    // top 3 by volume
  trendingTokens: TokenWithSparkline[], // top 6 by |1d change|
  topCollections: Collection[]          // top 10 by volume
}
```

---

### `GET /api/search`

**File:** `app/api/search/route.ts`
**Latency:** 30–80ms
**Used by:** SearchModal (global)

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string | `""` | Search term (min 1 char) |

**Server-side operations:**
1. If `q` is empty → return `{collections: [], tokens: []}`
2. Filter `collections` where `name`, `slug`, or `creatorName` includes `q` (case-insensitive) → take first 5
3. Filter `tokens` where `name` or `symbol` includes `q` (case-insensitive) → take first 5
4. Shape each result to its lightweight projection (omit full data)

**Response shape:**
```typescript
{
  collections: { slug, name, imageUrl, verified, floorPrice, floorCurrency }[],
  tokens: { address, chain, name, symbol, imageUrl, price, change1d }[]
}
```

---

### `GET /api/collections`

**File:** `app/api/collections/route.ts`
**Latency:** 30–90ms
**Used by:** Collections PLP (`/collections`)

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `sort` | `"volume" \| "floor" \| "change1d" \| "change7d" \| "items"` | `"volume"` | Sort field |
| `chain` | `"all" \| "ethereum" \| "solana" \| "ronin"` | `"all"` | Chain filter |
| `category` | `"all" \| "pfps" \| "art" \| "gaming"` | `"all"` | Category filter |
| `q` | string | `""` | Name/slug search |
| `limit` | number (max 100) | `20` | Page size |
| `offset` | number | `0` | Pagination offset |

**Server-side operations:**
1. Clone `collections` array
2. Apply chain filter (if not `"all"`)
3. Apply category filter (if not `"all"`)
4. Apply search filter (if `q` provided) — matches `name` or `slug`
5. Sort by chosen field (descending)
6. Paginate with `offset` and `limit`
7. Compute `hasMore` flag

**Response shape:**
```typescript
{
  data: Collection[],
  total: number,
  limit: number,
  offset: number,
  hasMore: boolean
}
```

---

### `GET /api/collections/[slug]`

**File:** `app/api/collections/[slug]/route.ts`
**Latency:** 20–60ms
**Used by:** Collection PDP (`/collection/[slug]`)

**Server-side operations:**
1. `await params` to get `slug`
2. Find collection by `slug` in `collections` array
3. Return 404 if not found
4. Return full `Collection` object

**Response shape:** Full `Collection` object (all fields).

---

### `GET /api/collections/[slug]/items`

**File:** `app/api/collections/[slug]/items/route.ts`
**Latency:** 40–120ms
**Used by:** Collection PDP (`/collection/[slug]`)

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `sort` | `"price" \| "rarity" \| "recent"` | `"price"` | Sort field |
| `status` | `"all" \| "listed"` | `"all"` | Listing filter |
| `limit` | number (max 100) | `20` | Page size |
| `offset` | number | `0` | Pagination offset |

**Server-side operations:**
1. `await params` to get `slug`
2. Look up `nftsByCollection[slug]`
3. Return 404 if collection not found
4. Clone array → apply status filter (`isListed === true` if `status=listed`)
5. Sort:
   - `"price"` → descending by `currentPrice` (nulls treated as 0)
   - `"rarity"` → ascending by `rarity` rank (lower = rarer)
   - `"recent"` → descending by most recent activity timestamp
6. Paginate

**Response shape:**
```typescript
{
  data: NFT[],      // each includes full properties[] and activityHistory[]
  total: number,
  limit: number,
  offset: number,
  hasMore: boolean
}
```

---

### `GET /api/nfts/[slug]/[tokenId]`

**File:** `app/api/nfts/[slug]/[tokenId]/route.ts`
**Latency:** 25–70ms
**Used by:** NFT PDP (`/nft/[slug]/[tokenId]`)

**Server-side operations:**
1. `await params` to get `slug` and `tokenId`
2. Look up `nftsByCollection[slug]` → return 404 if missing
3. Find NFT by `tokenId` within the collection → return 404 if missing
4. Return full `NFT` object

**Response shape:** Full `NFT` object including:
- `properties[]` — 7 traits with `traitType`, `value`, `rarity`
- `activityHistory[]` — 3–8 events with `eventType`, `price`, `fromAddress`, `toAddress`, `timestamp`
- `contractAddress`, `tokenStandard`, `chain`
- `currentPrice` / `isListed` / `lastSalePrice`

---

### `GET /api/tokens`

**File:** `app/api/tokens/route.ts`
**Latency:** 30–100ms
**Used by:** Tokens PLP (`/tokens`)

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `tab` | `"trending" \| "top" \| "new" \| "watchlist"` | `"trending"` | View mode |
| `chain` | `"all" \| "ethereum" \| "solana"` | `"all"` | Chain filter |
| `sort` | `"volume1d" \| "price" \| "change1h" \| "change1d" \| "change30d" \| "fdv"` | `"volume1d"` | Sort column |
| `order` | `"asc" \| "desc"` | `"desc"` | Sort direction |
| `fdvMin` | number | `0` | FDV lower bound |
| `fdvMax` | number | `999999999999` | FDV upper bound |
| `limit` | number (max 100) | `20` | Page size |
| `offset` | number | `0` | Pagination offset |

**Server-side operations:**
1. Clone `tokens` array
2. Apply chain filter
3. Apply FDV range filter
4. Apply tab-specific logic:
   - `"trending"` → sort by `|change1d|` descending (highest volatility first)
   - `"top"` → sort by `fdv` descending (largest market cap first)
   - `"new"` → filter to `isNew === true`, sort by `createdAt` descending
   - `"watchlist"` → return first 5 tokens (mock watchlist)
5. If tab is none of the above, apply `sort`/`order` params for custom sorting
6. Paginate
7. For each token in page: call `getSparklineData(priceHistory, 20)` → extract price values
8. Strip `priceHistory` from response payload (save bandwidth)

**Response shape:**
```typescript
{
  data: Array<Token & { sparkline: number[], priceHistory: undefined }>,
  total: number,
  limit: number,
  offset: number,
  hasMore: boolean
}
```

---

### `GET /api/tokens/[chain]/[address]`

**File:** `app/api/tokens/[chain]/[address]/route.ts`
**Latency:** 20–60ms
**Used by:** Token PDP (`/token/[chain]/[address]`)

**Server-side operations:**
1. `await params` to get `chain` and `address`
2. Find token where `chain` and `address` match
3. Return 404 if not found
4. Destructure to separate `priceHistory` from rest of token data
5. Extract last 20 prices as `recentPrices: number[]`

**Response shape:**
```typescript
{
  ...token,                   // all Token fields except priceHistory
  recentPrices: number[]      // last 20 price values
}
```

---

### `GET /api/tokens/[chain]/[address]/chart`

**File:** `app/api/tokens/[chain]/[address]/chart/route.ts`
**Latency:** 40–100ms
**Used by:** PriceChart component on Token PDP

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `timeframe` | `"1h" \| "1d" \| "7d" \| "30d"` | `"1h"` | History window |
| `interval` | `"1m" \| "5m" \| "15m" \| "1h" \| "4h" \| "1d"` | `"1m"` | Candle interval |

**Server-side operations:**
1. `await params` to get `chain` and `address`
2. Find token, return 404 if missing
3. Map `timeframe` → minutes: `1h=60, 1d=1440, 7d=10080, 30d=43200`
4. Map `interval` → minutes: `1m=1, 5m=5, 15m=15, 1h=60, 4h=240, 1d=1440`
5. Call `getOHLCData(token.priceHistory, timeframeMinutes, intervalMinutes)`
6. Returns bucketed OHLC candles

**Response shape:**
```typescript
{
  token: string,        // symbol
  chain: string,
  timeframe: string,
  interval: string,
  data: Array<{
    timestamp: number,
    open: number,
    high: number,
    low: number,
    close: number
  }>
}
```

---

### `POST /api/tokens/[chain]/[address]/swap`

**File:** `app/api/tokens/[chain]/[address]/swap/route.ts`
**Latency:** 80–200ms (intentionally slower — simulates DEX aggregator)
**Used by:** SwapWidget on Token PDP

**Request body:**
```typescript
{
  fromToken: string,   // "ETH" | "SOL" | other
  toToken: string,     // target token symbol
  amount: number       // amount of fromToken (must be > 0)
}
```

**Server-side operations:**
1. `await params` to get `chain` and `address`
2. Parse and validate JSON body
3. Return 400 if missing `fromToken`, `toToken`, or `amount <= 0`
4. Find target token, return 404 if missing
5. Resolve `fromPrice`: SOL = $195.42, ETH = $1,879.47, else $1
6. Compute `fromValueUsd = amount × fromPrice`
7. Compute `priceImpact = min((fromValueUsd / volume1d) × 100, 50%)`
8. Compute `fee = fromValueUsd × 0.003` (0.3% swap fee)
9. Compute `effectiveAmount = fromValueUsd - fee`
10. Compute `toAmount = (effectiveAmount / toPrice) × (1 - priceImpact/100)`
11. Generate random `estimatedGas` between 0.001 and 0.006
12. Set `expiresAt = now + 30 seconds`

**Response shape:**
```typescript
{
  fromToken: string,
  toToken: string,
  fromAmount: number,
  toAmount: number,
  priceImpact: number,     // percentage (0-50)
  fee: number,             // in USD
  feeCurrency: "USD",
  estimatedGas: number,    // in native token
  route: string,           // "ETH → DOG"
  expiresAt: number        // unix ms
}
```

---

## Client-Side Fetching Layer

### `usePollingFetch<T>(url, intervalMs)`

**File:** `app/hooks/usePollingFetch.ts`

Core data-fetching hook used by every page.

| Behavior | Detail |
|---|---|
| **Initial fetch** | On mount and whenever `url` changes, sets `loading=true`, calls `fetch(url)`, parses JSON |
| **Polling** | If `intervalMs > 0`, creates a `setInterval` that re-fetches at that cadence |
| **Cleanup** | Clears interval on unmount or when `url`/`intervalMs` changes |
| **Error handling** | Catches fetch errors, sets `error` state with message string |
| **Return value** | `{ data: T \| null, loading: boolean, error: string \| null, refetch: () => void }` |
| **Null URL** | If `url` is `null`, no fetch is made (conditional fetching) |

**Polling intervals used in the app:**

| Page | URL | Interval |
|---|---|---|
| Home | `/api/trending` | 10,000ms |
| Collections PLP | `/api/collections?...` | 10,000ms |
| Collection PDP | `/api/collections/[slug]` | 15,000ms |
| Collection PDP | `/api/collections/[slug]/items?...` | 15,000ms |
| NFT PDP | `/api/nfts/[slug]/[tokenId]` | 0 (one-shot) |
| Tokens PLP | `/api/tokens?...` | 5,000ms |
| Token PDP | `/api/tokens/[chain]/[address]` | 5,000ms |
| Token PDP (chart) | `/api/tokens/.../chart?...` | 5,000ms |
| Status bar | `/api/trending` | 15,000ms |

### `useSearch()`

**File:** `app/hooks/useSearch.ts`

Debounced search hook used by the SearchModal.

| Behavior | Detail |
|---|---|
| **Debounce** | 250ms delay before firing the API call |
| **Cancellation** | Clears pending timeout on each new keystroke |
| **Min length** | Clears results if query is empty |
| **API call** | `GET /api/search?q={encodeURIComponent(query)}` |
| **Return value** | `{ query, results: SearchResult \| null, loading, search: (q) => void, clear: () => void }` |

### `apiGet<T>(url)` / `apiPost<T>(url, body)`

**File:** `app/lib/api-client.ts`

Thin typed wrappers around `fetch()` with consistent error handling. Used by the swap widget for `POST` requests.

| Function | Behavior |
|---|---|
| `apiGet<T>` | `fetch(url)` → check `res.ok` → parse JSON → return typed `T`, or throw with server error message |
| `apiPost<T>` | `fetch(url, {method:"POST", headers, body})` → same error handling → return typed `T` |

---

## Page-by-Page Interaction Map

### Home Page (`/`)

```
User lands on /
  │
  └──► usePollingFetch("/api/trending", 10000)
        │
        ├──► GET /api/trending
        │      Server: ensurePriceEngine() → simulateLatency(30,80)
        │      Server: sort collections by volume → top 3 + top 10
        │      Server: sort tokens by |change1d| → top 6 with sparklines
        │      ◄── { featuredCollections, trendingTokens, topCollections }
        │
        ├──► Render HeroCarousel (cycles every 5s client-side)
        ├──► Render TrendingTokens (6-card grid with sparklines)
        ├──► Render TopCollections (right sidebar, 10 rows)
        │
        └──► Every 10s: re-poll → prices drift → UI updates
```

**User interactions on this page:**
- Click category tab (All/Gaming/Art/PFPs) → client-side filter state change only
- Click chain filter (All/ETH/SOL) → client-side filter state change only
- Click NFTs/Tokens toggle → client-side tab state change only
- Click collection in sidebar → navigate to `/collection/[slug]`
- Click trending token → navigate to `/token/[chain]/[address]`
- Click carousel "View Collection" → navigate to `/collection/[slug]`
- Press `/` → opens SearchModal → triggers `useSearch` → `GET /api/search`

---

### Collections PLP (`/collections`)

```
User navigates to /collections
  │
  └──► usePollingFetch("/api/collections?sort=volume&chain=all&limit=20&offset=0", 10000)
        │
        ├──► GET /api/collections?sort=volume&chain=all&limit=20&offset=0
        │      Server: clone → filter → sort → paginate
        │      ◄── { data: Collection[], total, limit, offset, hasMore }
        │
        └──► Every 10s: re-poll → floor prices drift → table updates

User clicks "Ξ Ethereum" chain filter
  │
  └──► URL changes to: /api/collections?sort=volume&chain=ethereum&limit=20&offset=0
        └──► usePollingFetch auto-refetches with new URL

User clicks "Floor Price" column header
  │
  └──► URL changes to: /api/collections?sort=floor&chain=ethereum&limit=20&offset=0
        └──► usePollingFetch auto-refetches with new sort

User clicks collection row
  │
  └──► Navigate to /collection/[slug]
```

---

### Collection PDP (`/collection/[slug]`)

```
User navigates to /collection/cryptopunks
  │
  ├──► usePollingFetch("/api/collections/cryptopunks", 15000)
  │      ├──► GET /api/collections/cryptopunks
  │      │      Server: find by slug → return Collection
  │      │      ◄── Collection object
  │      └──► Render banner, avatar, stats row, description
  │
  └──► usePollingFetch("/api/collections/cryptopunks/items?sort=price&status=all&limit=20", 15000)
         ├──► GET /api/collections/cryptopunks/items?sort=price&status=all&limit=20
         │      Server: lookup nftsByCollection → clone → filter → sort → paginate
         │      ◄── { data: NFT[], total, limit, offset, hasMore }
         └──► Render 4-column NFT card grid

User selects "Listed Only" from dropdown
  │
  └──► URL changes to: .../items?sort=price&status=listed&limit=20
        └──► usePollingFetch auto-refetches → only listed NFTs returned

User clicks NFT card
  │
  └──► Navigate to /nft/[slug]/[tokenId]
```

---

### NFT PDP (`/nft/[slug]/[tokenId]`)

```
User navigates to /nft/cryptopunks/2022
  │
  └──► usePollingFetch("/api/nfts/cryptopunks/2022", 0)    ← one-shot, no polling
         ├──► GET /api/nfts/cryptopunks/2022
         │      Server: lookup collection → find NFT → return full object
         │      ◄── NFT { properties[7], activityHistory[3-8], ... }
         │
         ├──► Render left panel: NFT image, Description accordion, Details accordion
         ├──► Render right panel: price box (Buy Now / Make Offer), Properties grid
         │
         └──► No further server calls unless user navigates away

User clicks "Activity" tab
  │
  └──► Client-side state toggle → renders Activity table from same NFT data
       (no additional API call — all data was in initial response)

User clicks "Properties" tab
  │
  └──► Client-side state toggle → renders trait cards from same NFT data
```

---

### Tokens PLP (`/tokens`)

```
User navigates to /tokens
  │
  └──► usePollingFetch("/api/tokens?tab=trending&chain=all&sort=volume1d&order=desc&limit=20", 5000)
        │
        ├──► GET /api/tokens?tab=trending&chain=all&sort=volume1d&order=desc&limit=20
        │      Server: clone → filter chain → filter FDV → apply tab sort → paginate
        │      Server: extract sparkline[20] per token, strip priceHistory
        │      ◄── { data: TokenListItem[], total, limit, offset, hasMore }
        │
        └──► Every 5s: re-poll → prices change → green/red percentages update live

User clicks "◎ Solana" chain filter
  │
  └──► URL changes to: ...?tab=trending&chain=solana&...
        └──► usePollingFetch detects URL change → re-fetches immediately + resets 5s poll

User clicks "1D Change ↕" column header
  │
  └──► sort="change1d", order toggles asc/desc
        └──► URL changes → re-fetch with new sort

User clicks "🆕 New" tab
  │
  └──► tab="new" → server filters to isNew=true, sorts by createdAt desc

User clicks token row
  │
  └──► Navigate to /token/[chain]/[address]
```

---

### Token PDP (`/token/[chain]/[address]`)

```
User navigates to /token/solana/0xfthr...
  │
  ├──► usePollingFetch("/api/tokens/solana/0xfthr...", 5000)
  │      ├──► GET /api/tokens/solana/0xfthr...
  │      │      Server: find token → strip priceHistory → add recentPrices[20]
  │      │      ◄── TokenDetail object
  │      └──► Render header, price, chain badge, NEW badge, stats row, details section
  │
  ├──► PriceChart component mounts with own usePollingFetch:
  │      └──► usePollingFetch("/api/tokens/solana/0xfthr.../chart?timeframe=1h&interval=1m", 5000)
  │             ├──► GET /api/tokens/.../chart?timeframe=1h&interval=1m
  │             │      Server: find token → getOHLCData(history, 60, 1) → bucket into candles
  │             │      ◄── { token, chain, timeframe, interval, data: OHLCPoint[] }
  │             └──► Render SVG line chart with gradient fill
  │
  └──► Both endpoints re-poll every 5s → chart and price update live

User clicks "7d" timeframe button
  │
  └──► PriceChart URL changes to: ...?timeframe=7d&interval=1h
        └──► usePollingFetch re-fetches → chart shows wider history with hourly candles

User types "0.5" in swap Pay With input
  │
  └──► Client-side: compute USD display ($0.5 × $195.42 = $97.71)
       No API call yet

User clicks "Get Quote" button
  │
  └──► apiPost("/api/tokens/solana/0xfthr.../swap", {
         fromToken: "SOL", toToken: "FTHR", amount: 0.5
       })
         ├──► POST /api/tokens/solana/0xfthr.../swap
         │      Server: validate body → find token → compute swap math
         │      Server: priceImpact = (usdValue / volume1d) × 100
         │      Server: fee = usdValue × 0.3%
         │      Server: toAmount = (usdValue - fee) / toPrice × (1 - impact%)
         │      ◄── SwapQuote { toAmount, priceImpact, fee, gas, route, expiresAt }
         │
         └──► Render quote details: price impact, fee, route, gas estimate

User clicks "Connect Wallet"
  │
  └──► No-op (mock — no wallet integration)
```

---

## Complete Request-Response Catalog

### Total Unique Fetch Patterns: 18

| # | Trigger | Method | URL Pattern | Polling | Component |
|---|---|---|---|---|---|
| 1 | Page load | GET | `/api/trending` | 10s | Home page |
| 2 | Page load | GET | `/api/trending` | 15s | StatusBar |
| 3 | Page load | GET | `/api/collections?sort=&chain=&limit=&offset=` | 10s | Collections PLP |
| 4 | Page load | GET | `/api/collections/[slug]` | 15s | Collection PDP |
| 5 | Page load | GET | `/api/collections/[slug]/items?sort=&status=&limit=` | 15s | Collection PDP |
| 6 | Page load | GET | `/api/nfts/[slug]/[tokenId]` | None | NFT PDP |
| 7 | Page load | GET | `/api/tokens?tab=&chain=&sort=&order=&limit=` | 5s | Tokens PLP |
| 8 | Page load | GET | `/api/tokens/[chain]/[address]` | 5s | Token PDP |
| 9 | Page load | GET | `/api/tokens/[chain]/[address]/chart?timeframe=&interval=` | 5s | PriceChart |
| 10 | Keystroke | GET | `/api/search?q=` | None (debounced) | SearchModal |
| 11 | Button click | POST | `/api/tokens/[chain]/[address]/swap` | None | SwapWidget |
| 12 | Sort change | GET | `/api/collections?sort=floor&...` | 10s | Collections PLP |
| 13 | Chain filter | GET | `/api/collections?chain=ethereum&...` | 10s | Collections PLP |
| 14 | Sort change | GET | `/api/tokens?sort=change1d&order=desc&...` | 5s | Tokens PLP |
| 15 | Chain filter | GET | `/api/tokens?chain=solana&...` | 5s | Tokens PLP |
| 16 | Tab change | GET | `/api/tokens?tab=new&...` | 5s | Tokens PLP |
| 17 | Status filter | GET | `/api/collections/[slug]/items?status=listed&...` | 15s | Collection PDP |
| 18 | Timeframe change | GET | `/api/tokens/.../chart?timeframe=7d&interval=1h` | 5s | PriceChart |

### Latency Injection Map

| Route | Min (ms) | Max (ms) | Rationale |
|---|---|---|---|
| `/api/trending` | 30 | 80 | Aggregation query |
| `/api/search` | 30 | 80 | Fast search |
| `/api/collections` | 30 | 90 | List with filters |
| `/api/collections/[slug]` | 20 | 60 | Single lookup |
| `/api/collections/[slug]/items` | 40 | 120 | Heavier query (sort + filter NFTs) |
| `/api/nfts/[slug]/[tokenId]` | 25 | 70 | Nested lookup |
| `/api/tokens` | 30 | 100 | List with sparkline extraction |
| `/api/tokens/[chain]/[address]` | 20 | 60 | Single lookup |
| `/api/tokens/.../chart` | 40 | 100 | OHLC computation |
| `POST /api/tokens/.../swap` | 80 | 200 | DEX aggregator simulation |

### Error Response Patterns

Every API route returns structured JSON errors:

| Status | Body | When |
|---|---|---|
| 400 | `{ error: "Invalid JSON body" }` | Swap: malformed POST body |
| 400 | `{ error: "Missing required fields: fromToken, toToken, amount (> 0)" }` | Swap: validation failure |
| 404 | `{ error: "Collection not found" }` | Invalid slug |
| 404 | `{ error: "NFT not found" }` | Invalid tokenId within valid collection |
| 404 | `{ error: "Token not found" }` | Invalid chain/address pair |
