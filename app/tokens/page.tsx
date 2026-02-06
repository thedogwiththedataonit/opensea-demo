"use client";

import { useState } from "react";
import Link from "next/link";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";
import { PaginatedResponse } from "@/app/lib/data/types";
import { VerifiedBadge } from "@/app/components/Badge";
import { SkeletonTable } from "@/app/components/Skeleton";
import Sparkline from "@/app/components/Sparkline";

interface TokenListItem {
  address: string;
  chain: string;
  name: string;
  symbol: string;
  imageUrl: string;
  price: number;
  fdv: number;
  volume1d: number;
  change1h: number;
  change1d: number;
  change30d: number;
  verified: boolean;
  isNew: boolean;
  sparkline: number[];
}

const TABS = [
  { id: "trending", label: "🔥 Trending" },
  { id: "top", label: "📊 Top" },
  { id: "watchlist", label: "⭐ Watchlist" },
  { id: "new", label: "🆕 New" },
];

const CHAINS = [
  { id: "all", label: "All" },
  { id: "ethereum", label: "Ξ Ethereum" },
  { id: "solana", label: "◎ Solana" },
];

const FDV_FILTERS = [
  { label: "< $100K", min: 0, max: 100000 },
  { label: "$100K - $500K", min: 100000, max: 500000 },
  { label: "$500K - $1M", min: 500000, max: 1000000 },
  { label: "$1M - $10M", min: 1000000, max: 10000000 },
];

function formatPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function TokensPage() {
  const [activeTab, setActiveTab] = useState("trending");
  const [activeChain, setActiveChain] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const [sort, setSort] = useState("volume1d");
  const [sortOrder, setSortOrder] = useState("desc");

  const url = `/api/tokens?tab=${activeTab}&chain=${activeChain}&sort=${sort}&order=${sortOrder}&limit=20`;
  const { data, loading } = usePollingFetch<PaginatedResponse<TokenListItem>>(url, 5000);

  function handleSort(field: string) {
    if (sort === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSort(field);
      setSortOrder("desc");
    }
  }

  const sortIndicator = (field: string) => {
    if (sort !== field) return "↕";
    return sortOrder === "desc" ? "↓" : "↑";
  };

  return (
    <div className="flex animate-fadeIn">
      {/* Filter sidebar */}
      {showFilters && (
        <div className="w-[260px] border-r border-[#2a2a2a] p-4 flex-shrink-0 animate-slideInLeft">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Filter By</h3>
            <button onClick={() => setShowFilters(false)} className="text-[#8a8a8a] hover:text-white transition-colors">
              ≪
            </button>
          </div>

          {/* Collections / Tokens toggle */}
          <div className="flex items-center gap-1 mb-4">
            <Link href="/collections" className="text-xs text-[#8a8a8a] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#1e1e1e] transition-colors">
              🖼️ Collections
            </Link>
            <button className="text-xs bg-[#2a2a2a] text-white px-3 py-1.5 rounded-lg">◎ Tokens</button>
          </div>

          {/* Chains */}
          <div className="mb-6">
            <h4 className="text-xs text-[#8a8a8a] uppercase tracking-wider mb-2 font-medium flex items-center justify-between">
              Chains <span>∧</span>
            </h4>
            <input
              type="text"
              placeholder="Search for chains"
              className="w-full bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-xs text-white placeholder-[#666] outline-none mb-2 focus:border-[#555] transition-colors"
            />
            <div className="flex flex-wrap gap-1.5">
              {CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => setActiveChain(chain.id)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-all duration-200 btn-press ${
                    activeChain === chain.id
                      ? "bg-white text-black"
                      : "bg-[#1e1e1e] text-[#8a8a8a] hover:bg-[#2a2a2a]"
                  }`}
                >
                  {chain.label}
                </button>
              ))}
            </div>
          </div>

          {/* FDV Filter */}
          <div className="mb-6">
            <h4 className="text-xs text-[#8a8a8a] uppercase tracking-wider mb-2 font-medium flex items-center justify-between">
              FDV <span>∧</span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {FDV_FILTERS.map((f) => (
                <button
                  key={f.label}
                  className="px-3 py-1.5 rounded-full text-xs bg-[#1e1e1e] text-[#8a8a8a] hover:bg-[#2a2a2a] transition-all duration-200 btn-press"
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 p-4">
        {!showFilters && (
          <button
            onClick={() => setShowFilters(true)}
            className="text-[#8a8a8a] hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            ≫ Filters
          </button>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 btn-press ${
                activeTab === tab.id
                  ? "bg-[#2a2a2a] text-white"
                  : "text-[#8a8a8a] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Token table */}
        {loading ? (
          <SkeletonTable rows={12} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#8a8a8a] uppercase tracking-wider border-b border-[#2a2a2a]">
                  <th className="text-left py-3 px-4 font-medium w-8">☆</th>
                  <th className="text-left py-3 px-4 font-medium">Token</th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("price")}>
                    Price {sortIndicator("price")}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("change1h")}>
                    1H Change {sortIndicator("change1h")}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("change1d")}>
                    1D Change {sortIndicator("change1d")}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("change30d")}>
                    30D Change {sortIndicator("change30d")}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("volume1d")}>
                    1D Vol {sortIndicator("volume1d")}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("fdv")}>
                    FDV {sortIndicator("fdv")}
                  </th>
                  <th className="text-right py-3 px-4 font-medium w-[120px]">Last 1D</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map((token, index) => (
                  <tr key={`${token.chain}-${token.address}`} className={`border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-all duration-150 row-hover animate-fadeInUp stagger-${Math.min(index + 1, 12)}`}>
                    <td className="py-3 px-4">
                      <button className="text-[#666] hover:text-yellow-400 transition-colors">☆</button>
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/token/${token.chain}/${token.address}`} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                          <img src={token.imageUrl} alt={token.symbol} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className="text-sm text-white flex items-center gap-1">
                            {token.name}
                            {token.verified && <VerifiedBadge size={12} />}
                          </div>
                          <div className="text-xs text-[#8a8a8a]">{token.symbol}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="text-right py-3 px-4 text-sm font-mono number-transition"><span className="dynamic-data">{formatPrice(token.price)}</span></td>
                    <td className={`text-right py-3 px-4 text-sm number-transition ${token.change1h >= 0 ? "text-green-400" : "text-red-400"}`}>
                      <span className="dynamic-data">{token.change1h >= 0 ? "+" : ""}{token.change1h.toFixed(1)}%</span>
                    </td>
                    <td className={`text-right py-3 px-4 text-sm number-transition ${token.change1d >= 0 ? "text-green-400" : "text-red-400"}`}>
                      <span className="dynamic-data">{token.change1d >= 0 ? "+" : ""}{token.change1d.toFixed(1)}%</span>
                    </td>
                    <td className={`text-right py-3 px-4 text-sm number-transition ${token.change30d >= 0 ? "text-green-400" : "text-red-400"}`}>
                      <span className="dynamic-data">{token.change30d >= 0 ? "+" : ""}{token.change30d.toFixed(1)}%</span>
                    </td>
                    <td className="text-right py-3 px-4 text-sm font-mono number-transition"><span className="dynamic-data">{formatCompact(token.volume1d)}</span></td>
                    <td className="text-right py-3 px-4 text-sm font-mono number-transition"><span className="dynamic-data">{formatCompact(token.fdv)}</span></td>
                    <td className="text-right py-3 px-4">
                      <Sparkline data={token.sparkline} width={100} height={32} realtime realtimeIntervalMs={2500} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
