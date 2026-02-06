"use client";

import { useState } from "react";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";
import { Collection } from "@/app/lib/data/types";
import HeroCarousel from "@/app/components/home/HeroCarousel";
import TrendingTokens from "@/app/components/home/TrendingTokens";
import TopCollections from "@/app/components/home/TopCollections";
import CategoryTabs from "@/app/components/home/CategoryTabs";
import ChainFilters from "@/app/components/home/ChainFilters";
import { SkeletonTable } from "@/app/components/Skeleton";

interface TrendingData {
  featuredCollections: Collection[];
  trendingTokens: Array<{
    address: string;
    chain: string;
    name: string;
    symbol: string;
    imageUrl: string;
    price: number;
    change1d: number;
    sparkline: number[];
    fdv: number;
    volume1d: number;
  }>;
  topCollections: Collection[];
}

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeChain, setActiveChain] = useState("all");
  const [activeTab, setActiveTab] = useState<"nfts" | "tokens">("nfts");

  const { data, loading } = usePollingFetch<TrendingData>("/api/trending", 10000);

  return (
    <div className="flex animate-fadeIn">
      {/* Main content */}
      <div className="flex-1 p-6 max-w-[1040px]">
        {/* Category and chain filters */}
        <div className="flex items-center justify-between mb-6 animate-fadeInDown">
          <CategoryTabs active={activeCategory} onChange={setActiveCategory} />
          <div className="flex items-center gap-3">
            <ChainFilters active={activeChain} onChange={setActiveChain} />
          </div>
        </div>

        {/* NFTs / Tokens toggle */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab("nfts")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 btn-press ${
              activeTab === "nfts"
                ? "bg-[#2a2a2a] text-white"
                : "text-[#8a8a8a] hover:text-white"
            }`}
          >
            🖼️ NFTs
          </button>
          <button
            onClick={() => setActiveTab("tokens")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 btn-press ${
              activeTab === "tokens"
                ? "bg-[#2a2a2a] text-white"
                : "text-[#8a8a8a] hover:text-white"
            }`}
          >
            ◎ Tokens
          </button>
        </div>

        {/* Hero Carousel */}
        {loading ? (
          <div className="h-[380px] bg-[#1e1e1e] rounded-2xl animate-shimmer mb-8" />
        ) : (
          data?.featuredCollections && (
            <div className="mb-8 animate-fadeInUp">
              <HeroCarousel collections={data.featuredCollections} />
            </div>
          )
        )}

        {/* Trending Tokens */}
        {loading ? (
          <div className="mb-8">
            <div className="h-6 bg-[#1e1e1e] rounded w-40 mb-4 animate-shimmer" />
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-20 bg-[#1e1e1e] rounded-xl animate-shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
        ) : (
          data?.trendingTokens && (
            <div className="mb-8">
              <TrendingTokens tokens={data.trendingTokens} />
            </div>
          )
        )}
      </div>

      {/* Right sidebar - Top Collections */}
      <div className="w-[340px] border-l border-[#2a2a2a] p-4 hidden lg:block">
        {loading ? (
          <SkeletonTable rows={10} />
        ) : (
          data?.topCollections && <TopCollections collections={data.topCollections} />
        )}
      </div>
    </div>
  );
}
