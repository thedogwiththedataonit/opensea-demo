"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";
import { NFT } from "@/app/lib/data/types";
import { VerifiedBadge, ChainBadge } from "@/app/components/Badge";
import { Skeleton } from "@/app/components/Skeleton";

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function truncAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  if (addr.includes(".")) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function NFTDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const tokenId = params.tokenId as string;

  const [activeSection, setActiveSection] = useState<string>("properties");

  const { data: nft, loading } = usePollingFetch<NFT>(
    `/api/nfts/${slug}/${tokenId}`,
    0
  );

  if (loading) {
    return (
      <div className="flex gap-8 p-6">
        <div className="w-[400px] flex-shrink-0">
          <Skeleton className="aspect-square rounded-xl" />
        </div>
        <div className="flex-1 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!nft) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-[#8a8a8a]">NFT not found</div>
      </div>
    );
  }

  const eventTypeLabels: Record<string, string> = {
    sale: "🔄 Sale",
    transfer: "↗️ Transfer",
    list: "📋 List",
    offer: "💰 Offer",
    mint: "✨ Mint",
  };

  return (
    <div className="flex gap-8 p-6">
      {/* Left - Image */}
      <div className="w-[420px] flex-shrink-0">
        <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-[#2a2a2a]">
          <img
            src={nft.imageUrl}
            alt={nft.name}
            className="w-full aspect-square object-cover"
          />
        </div>

        {/* Description accordion */}
        <div className="mt-4 bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 text-sm font-medium">
            <span>📝 Description</span>
            <span className="text-[#8a8a8a]">∨</span>
          </button>
          <div className="px-4 pb-4 text-sm text-[#8a8a8a]">
            {nft.description}
          </div>
        </div>

        {/* Details accordion */}
        <div className="mt-2 bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 text-sm font-medium">
            <span>📋 Details</span>
            <span className="text-[#8a8a8a]">∨</span>
          </button>
          <div className="px-4 pb-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#8a8a8a]">Contract Address</span>
              <span className="text-blue-400 font-mono text-xs">{truncAddr(nft.contractAddress)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a8a8a]">Token ID</span>
              <span className="font-mono">{nft.tokenId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a8a8a]">Token Standard</span>
              <span>{nft.tokenStandard}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a8a8a]">Chain</span>
              <ChainBadge chain={nft.chain} />
            </div>
          </div>
        </div>
      </div>

      {/* Right - Details */}
      <div className="flex-1 min-w-0">
        {/* Collection name */}
        <Link href={`/collection/${slug}`} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mb-1">
          {nft.collectionSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          <VerifiedBadge size={12} />
        </Link>

        {/* NFT name */}
        <h1 className="text-3xl font-bold mb-2">{nft.name}</h1>

        {/* Owner */}
        <p className="text-sm text-[#8a8a8a] mb-6">
          Owned by <span className="text-blue-400">{nft.owner}</span>
        </p>

        {/* Price box */}
        <div className="bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] p-5 mb-6">
          {nft.isListed && nft.currentPrice ? (
            <>
              <div className="text-xs text-[#8a8a8a] mb-1">Current price</div>
              <div className="text-3xl font-bold font-mono mb-1">
                {nft.currentPrice.toFixed(4)} {nft.currentCurrency}
              </div>
              <div className="flex gap-3 mt-4">
                <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors">
                  Buy Now
                </button>
                <button className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-white font-medium py-3 rounded-xl transition-colors border border-[#444]">
                  Make Offer
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-[#8a8a8a] mb-1">Last sale</div>
              <div className="text-2xl font-bold font-mono mb-1">
                {nft.lastSalePrice?.toFixed(4) || "—"} {nft.lastSaleCurrency}
              </div>
              <div className="mt-4">
                <button className="w-full bg-[#2a2a2a] hover:bg-[#333] text-white font-medium py-3 rounded-xl transition-colors border border-[#444]">
                  Make Offer
                </button>
              </div>
            </>
          )}
        </div>

        {/* Properties / Activity tabs */}
        <div className="flex items-center gap-4 border-b border-[#2a2a2a] mb-4">
          <button
            onClick={() => setActiveSection("properties")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeSection === "properties"
                ? "text-white border-white"
                : "text-[#8a8a8a] border-transparent hover:text-white"
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveSection("activity")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeSection === "activity"
                ? "text-white border-white"
                : "text-[#8a8a8a] border-transparent hover:text-white"
            }`}
          >
            Activity
          </button>
        </div>

        {/* Properties */}
        {activeSection === "properties" && (
          <div className="grid grid-cols-3 gap-2">
            {nft.properties.map((prop) => (
              <div
                key={prop.traitType}
                className="bg-[#1a2332] border border-[#1e3a5f] rounded-xl p-3"
              >
                <div className="text-[10px] text-blue-400 uppercase tracking-wider mb-0.5">{prop.traitType}</div>
                <div className="text-sm font-medium text-white">{prop.value}</div>
                <div className="text-xs text-[#8a8a8a] mt-0.5">{prop.rarity}% have this trait</div>
              </div>
            ))}
          </div>
        )}

        {/* Activity */}
        {activeSection === "activity" && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#8a8a8a] uppercase tracking-wider border-b border-[#2a2a2a]">
                  <th className="text-left py-2 px-3 font-medium">Event</th>
                  <th className="text-right py-2 px-3 font-medium">Price</th>
                  <th className="text-left py-2 px-3 font-medium">From</th>
                  <th className="text-left py-2 px-3 font-medium">To</th>
                  <th className="text-right py-2 px-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {nft.activityHistory.map((activity) => (
                  <tr key={activity.id} className="border-b border-[#1e1e1e] text-sm">
                    <td className="py-2.5 px-3">
                      {eventTypeLabels[activity.eventType] || activity.eventType}
                    </td>
                    <td className="text-right py-2.5 px-3 font-mono">
                      {activity.price ? `${activity.price.toFixed(4)} ${activity.currency}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-blue-400 font-mono text-xs">
                      {truncAddr(activity.fromAddress)}
                    </td>
                    <td className="py-2.5 px-3 text-blue-400 font-mono text-xs">
                      {truncAddr(activity.toAddress)}
                    </td>
                    <td className="text-right py-2.5 px-3 text-[#8a8a8a]">
                      {timeAgo(activity.timestamp)}
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
