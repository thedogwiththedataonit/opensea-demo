// ---- Shared TypeScript interfaces for the OpenSea mock application ----

export interface PricePoint {
  timestamp: number; // unix ms
  price: number;
}

export interface OHLCPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ---- Collections ----

export interface Collection {
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  bannerUrl: string;
  floorPrice: number;
  floorCurrency: string; // "ETH" | "HYPE" | "RON" etc.
  totalVolume: number;
  totalVolumeCurrency: string;
  itemCount: number;
  ownerCount: number;
  listedPct: number;
  chain: string;
  verified: boolean;
  creatorName: string;
  category: string; // "pfps" | "art" | "gaming" | "photography" | "music"
  change1d: number; // percentage
  change7d: number; // percentage
  createdAt: string;
}

// ---- NFTs ----

export interface NFTProperty {
  traitType: string;
  value: string;
  rarity: number; // percentage of items with this trait
}

export interface Activity {
  id: string;
  eventType: "sale" | "transfer" | "list" | "offer" | "mint";
  price: number | null;
  currency: string;
  fromAddress: string;
  toAddress: string;
  timestamp: number;
}

export interface NFT {
  tokenId: string;
  collectionSlug: string;
  name: string;
  description: string;
  imageUrl: string;
  owner: string;
  lastSalePrice: number | null;
  lastSaleCurrency: string;
  currentPrice: number | null;
  currentCurrency: string;
  isListed: boolean;
  rarity: number; // rank
  properties: NFTProperty[];
  activityHistory: Activity[];
  chain: string;
  contractAddress: string;
  tokenStandard: string;
}

// ---- Tokens ----

export interface TokenWarning {
  type: "low_liquidity" | "new_token" | "high_volatility" | "unverified";
  message: string;
}

export interface Token {
  address: string;
  chain: string;
  name: string;
  symbol: string;
  imageUrl: string;
  price: number;
  fdv: number;
  volume1d: number;
  volume7d: number;
  change1h: number;
  change1d: number;
  change30d: number;
  priceHistory: PricePoint[];
  isNew: boolean;
  verified: boolean;
  createdAt: string;
  description: string;
  warnings: TokenWarning[];
  contractAddress: string;
  socialLinks: { twitter?: string; discord?: string; website?: string };
}

// ---- Swap ----

export interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: number;
  fee: number;
  feeCurrency: string;
  estimatedGas: number;
  route: string;
  expiresAt: number;
}

// ---- Search ----

export interface SearchResult {
  collections: { slug: string; name: string; imageUrl: string; verified: boolean; floorPrice: number; floorCurrency: string }[];
  tokens: { address: string; chain: string; name: string; symbol: string; imageUrl: string; price: number; change1d: number }[];
}

// ---- API Responses ----

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface TrendingResponse {
  featuredCollections: Collection[];
  trendingTokens: Token[];
  topCollections: Collection[];
}
