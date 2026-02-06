/**
 * Client-side Traffic Simulator
 *
 * Automatically hits all 10 API endpoints in a weighted rotation that simulates
 * realistic user behavior. Some requests are intentionally malformed to generate
 * 400/404 responses. Runs entirely in the browser — no server-side state.
 */

// Known valid slugs, tokens, etc. for generating realistic requests
const COLLECTION_SLUGS = ["cryptopunks", "bored-ape-yacht-club", "pudgy-penguins", "moonbirds", "rektguy", "milady-maker"];
const TOKEN_ENTRIES = [
  { chain: "ethereum", address: "0xbfs000000000000000000000000000000000bfs1" },
  { chain: "ethereum", address: "0xarb000000000000000000000000000000000arb1" },
  { chain: "solana", address: "0xfthr00000000000000000000000000000000fth1" },
  { chain: "ethereum", address: "0xdog000000000000000000000000000000000dog1" },
  { chain: "solana", address: "0xhdg000000000000000000000000000000000hdg1" },
];
const NFT_TOKEN_IDS = ["1137", "1056", "1194", "1332", "2022"];
const SEARCH_TERMS = ["punk", "ape", "dog", "sol", "art", "moon", "milady", "xyz", "rainbow", ""];

export interface RequestLogEntry {
  id: number;
  timestamp: string;
  method: string;
  route: string;
  status: number;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
}

type RequestDef = {
  weight: number;
  method: string;
  label: string;
  buildUrl: () => string;
  buildBody?: () => unknown;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const ENDPOINTS: RequestDef[] = [
  // 20% — trending (home page)
  { weight: 20, method: "GET", label: "/api/trending", buildUrl: () => "/api/trending" },
  // 15% — token list
  { weight: 15, method: "GET", label: "/api/tokens", buildUrl: () => `/api/tokens?tab=${pick(["trending", "top", "new", "watchlist"])}&chain=${pick(["all", "ethereum", "solana"])}&limit=20` },
  // 10% — collection list
  { weight: 10, method: "GET", label: "/api/collections", buildUrl: () => `/api/collections?sort=${pick(["volume", "floor", "change1d"])}&chain=${pick(["all", "ethereum"])}&limit=20` },
  // 10% — search
  { weight: 10, method: "GET", label: "/api/search", buildUrl: () => `/api/search?q=${encodeURIComponent(pick(SEARCH_TERMS))}` },
  // 8% — collection detail
  { weight: 8, method: "GET", label: "/api/collections/[slug]", buildUrl: () => `/api/collections/${pick(COLLECTION_SLUGS)}` },
  // 8% — collection items
  { weight: 8, method: "GET", label: "/api/collections/[slug]/items", buildUrl: () => `/api/collections/${pick(COLLECTION_SLUGS)}/items?sort=${pick(["price", "rarity"])}&limit=8` },
  // 8% — token detail
  { weight: 8, method: "GET", label: "/api/tokens/[chain]/[address]", buildUrl: () => { const t = pick(TOKEN_ENTRIES); return `/api/tokens/${t.chain}/${t.address}`; } },
  // 7% — chart
  { weight: 7, method: "GET", label: "/api/tokens/.../chart", buildUrl: () => { const t = pick(TOKEN_ENTRIES); return `/api/tokens/${t.chain}/${t.address}/chart?timeframe=${pick(["1h", "1d", "7d"])}&interval=${pick(["1m", "5m", "1h"])}`; } },
  // 7% — NFT detail
  { weight: 7, method: "GET", label: "/api/nfts/[slug]/[tokenId]", buildUrl: () => `/api/nfts/${pick(COLLECTION_SLUGS)}/${pick(NFT_TOKEN_IDS)}` },
  // 5% — swap
  { weight: 5, method: "POST", label: "POST /api/.../swap", buildUrl: () => { const t = pick(TOKEN_ENTRIES); return `/api/tokens/${t.chain}/${t.address}/swap`; }, buildBody: () => ({ fromToken: pick(["ETH", "SOL"]), toToken: "TARGET", amount: Math.random() * 2 }) },
  // 2% — intentional 404 (bad slug)
  { weight: 2, method: "GET", label: "/api/collections/404", buildUrl: () => `/api/collections/nonexistent-collection-${Date.now()}` },
];

// Build cumulative weight array for weighted random selection
const totalWeight = ENDPOINTS.reduce((sum, e) => sum + e.weight, 0);

function pickEndpoint(): RequestDef {
  let roll = Math.random() * totalWeight;
  for (const ep of ENDPOINTS) {
    roll -= ep.weight;
    if (roll <= 0) return ep;
  }
  return ENDPOINTS[0];
}

let nextId = 1;

export async function fireOneRequest(): Promise<RequestLogEntry> {
  const ep = pickEndpoint();
  const url = ep.buildUrl();
  const id = nextId++;
  const start = performance.now();

  try {
    const options: RequestInit = { method: ep.method };
    if (ep.method === "POST" && ep.buildBody) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(ep.buildBody());
    }

    const res = await fetch(url, options);
    const latencyMs = Math.round(performance.now() - start);

    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (!res.ok) {
      try {
        const body = await res.json();
        errorCode = body?.error?.code || body?.error || null;
        errorMessage = body?.error?.message || (typeof body?.error === "string" ? body.error : null);
      } catch {
        errorCode = `HTTP_${res.status}`;
        errorMessage = res.statusText;
      }
    }

    return {
      id,
      timestamp: new Date().toISOString(),
      method: ep.method,
      route: ep.label,
      status: res.status,
      latencyMs,
      errorCode,
      errorMessage,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      id,
      timestamp: new Date().toISOString(),
      method: ep.method,
      route: ep.label,
      status: 0,
      latencyMs,
      errorCode: "NETWORK_ERROR",
      errorMessage: err instanceof Error ? err.message : "Network error",
    };
  }
}
