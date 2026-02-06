"use client";

import { useState } from "react";
import Link from "next/link";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";
import { Collection, PaginatedResponse } from "@/app/lib/data/types";
import { VerifiedBadge } from "@/app/components/Badge";
import { SkeletonTable } from "@/app/components/Skeleton";
import Sparkline from "@/app/components/Sparkline";

const CHAINS = [
  { id: "all", label: "All" },
  { id: "ethereum", label: "Ξ Ethereum" },
  { id: "solana", label: "◎ Solana" },
];

const TABS = [
  { id: "trending", label: "🔥 Trending" },
  { id: "top", label: "📊 Top" },
  { id: "watchlist", label: "⭐ Watchlist" },
];

export default function CollectionsPage() {
  const [activeTab, setActiveTab] = useState("trending");
  const [activeChain, setActiveChain] = useState("all");
  const [sort, setSort] = useState("volume");
  const [showFilters, setShowFilters] = useState(true);

  const url = `/api/collections?sort=${sort}&chain=${activeChain}&limit=20&offset=0`;
  const { data, loading } = usePollingFetch<PaginatedResponse<Collection>>(url, 10000);

  function handleSort(field: string) {
    setSort(field === sort ? field : field);
  }

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

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4">
            <button className="text-xs bg-[#2a2a2a] text-white px-3 py-1.5 rounded-lg">🖼️ Collections</button>
            <Link href="/tokens" className="text-xs text-[#8a8a8a] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[#1e1e1e] transition-colors">
              ◎ Tokens
            </Link>
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
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 p-4">
        {/* Toggle filters if hidden */}
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

        {/* Table */}
        {loading ? (
          <SkeletonTable rows={10} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#8a8a8a] uppercase tracking-wider border-b border-[#2a2a2a]">
                  <th className="text-left py-3 px-4 font-medium">Collection</th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("floor")}>
                    Floor Price {sort === "floor" && "↓"}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("change1d")}>
                    1D Change {sort === "change1d" && "↓"}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("change7d")}>
                    7D Change {sort === "change7d" && "↓"}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("volume")}>
                    Volume {sort === "volume" && "↓"}
                  </th>
                  <th className="text-right py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort("items")}>
                    Items {sort === "items" && "↓"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map((c, index) => (
                  <tr key={c.slug} className={`border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-all duration-150 row-hover animate-fadeInUp stagger-${Math.min(index + 1, 12)}`}>
                    <td className="py-3 px-4">
                      <Link href={`/collection/${c.slug}`} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                          <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className="text-sm text-white flex items-center gap-1">
                            {c.name}
                            {c.verified && <VerifiedBadge size={14} />}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="text-right py-3 px-4 text-sm font-mono number-transition">
                      <span className="dynamic-data">{c.floorPrice < 0.01 ? "< 0.01" : c.floorPrice.toFixed(2)}</span> {c.floorCurrency}
                    </td>
                    <td className={`text-right py-3 px-4 text-sm number-transition ${c.change1d >= 0 ? "text-green-400" : "text-red-400"}`}>
                      <span className="dynamic-data">{c.change1d >= 0 ? "+" : ""}{c.change1d.toFixed(1)}%</span>
                    </td>
                    <td className={`text-right py-3 px-4 text-sm number-transition ${c.change7d >= 0 ? "text-green-400" : "text-red-400"}`}>
                      <span className="dynamic-data">{c.change7d >= 0 ? "+" : ""}{c.change7d.toFixed(1)}%</span>
                    </td>
                    <td className="text-right py-3 px-4 text-sm font-mono number-transition">
                      <span className="dynamic-data">{(c.totalVolume / 1000).toFixed(1)}K</span> {c.totalVolumeCurrency}
                    </td>
                    <td className="text-right py-3 px-4 text-sm font-mono">
                      {c.itemCount.toLocaleString()}
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
