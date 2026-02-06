# OpenSea Marketplace — Agent Rules

## Tracing: Mandatory OpenTelemetry Instrumentation

Every new or modified backend function in this codebase MUST include OpenTelemetry custom spans. This application serves as a tracing and observability demonstration — incomplete instrumentation defeats its purpose.

### Rule: All API Route Handlers Must Be Fully Traced

When creating or modifying any file in `app/api/`, follow this procedure atomically (do not commit a route without its tracing):

1. **Import the tracing utilities** at the top of the file:
   ```ts
   import { tracer, withSpan, MarketplaceAttributes as MA } from '@/app/lib/tracing';
   ```

2. **Wrap the entire route handler body** in a root span using `withSpan`:
   ```ts
   return withSpan(tracer, 'marketplace.<domain>.<operation>', {
     // Initial attributes known at entry (params, query filters)
   }, async (rootSpan) => {
     // ... handler body ...
   });
   ```

3. **Wrap each logical sub-operation** in its own child span. Common sub-operations that always get their own span:
   - Data lookups (e.g., `marketplace.collection.lookup`)
   - Filtering logic (e.g., `marketplace.tokens.filter`)
   - Sorting logic (e.g., `marketplace.collections.sort`)
   - Pagination (e.g., `marketplace.tokens.paginate`)
   - Input validation (e.g., `marketplace.swap.validate_input`)
   - Price/fee calculations (e.g., `marketplace.swap.impact_calculation`)
   - Data transformations (e.g., `marketplace.tokens.sparkline_extraction`)
   - External service calls or simulations

4. **Document the trace tree** in the file's JSDoc header comment:
   ```ts
   /**
    * Trace structure:
    *   marketplace.swap.quote
    *     ├── marketplace.infra.latency_simulation
    *     ├── marketplace.swap.validate_input
    *     └── marketplace.swap.token_lookup
    */
   ```

5. **Set attributes on both child spans and the root span**. Child spans get granular operational details; the root span gets summary-level attributes for quick trace filtering.

6. **Record errors explicitly**: set `rootSpan.setAttribute('error', true)` before returning error responses (4xx/5xx).

### Rule: All Shared Server-Side Functions Must Be Traced

When creating or modifying functions in `app/lib/` that perform meaningful server-side work (data processing, computation, I/O simulation), add a span:

- Use `tracer.startSpan(name, { attributes })` for synchronous functions
- Use `tracer.startActiveSpan(name, { attributes }, callback)` for async functions
- Always call `span.end()` in a `finally` block or after the computation
- Record input/output cardinality as attributes (e.g., input array length, output count)

Pure formatting utilities (e.g., `formatPrice`, `timeAgo`) do NOT need spans — only functions that represent traceable units of work.

### Span Naming Convention

All span names MUST follow the `marketplace.<domain>.<operation>` dotted format:

| Domain | Examples |
|---|---|
| `marketplace.collection.*` | `.lookup`, `.detail` |
| `marketplace.collections.*` | `.list`, `.filter`, `.sort`, `.paginate` |
| `marketplace.nft.*` | `.detail`, `.collection_lookup`, `.token_lookup` |
| `marketplace.token.*` | `.detail`, `.lookup`, `.chart`, `.chart.lookup` |
| `marketplace.tokens.*` | `.list`, `.filter`, `.tab_sort`, `.paginate`, `.sparkline_extraction` |
| `marketplace.swap.*` | `.quote`, `.validate_input`, `.token_lookup`, `.price_resolution`, `.impact_calculation`, `.quote_assembly` |
| `marketplace.search.*` | `.collections`, `.tokens` |
| `marketplace.trending.*` | `.aggregate`, `.featured_collections`, `.top_collections`, `.tokens` |
| `marketplace.price.*` | `.sparkline`, `.ohlc` |
| `marketplace.infra.*` | `.latency_simulation` |

When adding a new domain (e.g., auctions, offers, user profiles), create a new `marketplace.<newdomain>.*` namespace.

### Attribute Convention

All custom attributes MUST use the `marketplace.*` prefix and MUST be defined as constants in `app/lib/tracing.ts` under the `MarketplaceAttributes` object:

```ts
export const MarketplaceAttributes = {
  // Add new attributes here with JSDoc comments
  /** Description of what this attribute represents */
  NEW_ATTRIBUTE: 'marketplace.<domain>.<attribute_name>',
} as const;
```

Never use inline string attribute keys. Always reference `MarketplaceAttributes.X` (aliased as `MA.X`).

**Attribute types and values:**
- Use strings for identifiers: slugs, symbols, addresses, chain names
- Use numbers for metrics: prices, counts, durations, percentages
- Use booleans for flags: `is_listed`, `is_new`, `verified`, `has_more`

### What Gets a Span (Decision Guide)

| Scenario | Needs a span? |
|---|---|
| New API route handler | Yes — root span wrapping entire body |
| Data lookup (find by ID) | Yes — `marketplace.<domain>.lookup` |
| Array filter/search | Yes — `marketplace.<domain>.filter` |
| Array sort | Yes — `marketplace.<domain>.sort` |
| Pagination slice | Yes — `marketplace.<domain>.paginate` |
| Input validation / body parsing | Yes — `marketplace.<domain>.validate_input` |
| Price or fee calculation | Yes — `marketplace.<domain>.<calculation>` |
| Data transformation (map, aggregate) | Yes — `marketplace.<domain>.<transform>` |
| Simulated latency / I/O | Yes — `marketplace.infra.*` |
| Pure formatting (formatPrice, timeAgo) | No |
| Type definitions / interfaces | No |
| React client components | No (tracing is server-side only) |
| Static config / constants | No |

### Reference Implementation

The swap route (`app/api/tokens/[chain]/[address]/swap/route.ts`) is the canonical reference for maximum-depth tracing. It demonstrates:
- Root span with initial params
- Validation span with error type attributes
- Multiple lookup/computation child spans
- Summary attributes propagated to root span
- Error attribute set before returning error responses

### Files That Must Stay in Sync

When adding new `MarketplaceAttributes` entries:
1. Add the constant to `app/lib/tracing.ts`
2. Use it in the relevant route handler(s)
3. Update `API_BREAKDOWN.md` if the route's documented behavior changes
