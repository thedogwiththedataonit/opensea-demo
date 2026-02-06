"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";
import { NFT } from "@/app/lib/data/types";
import { VerifiedBadge, ChainBadge } from "@/app/components/Badge";
import { Skeleton } from "@/app/components/Skeleton";

interface Comment {
  id: string;
  author: string;
  authorAvatar: string;
  text: string;
  timestamp: number;
  likes: number;
}

interface NFTWithComments extends NFT {
  comments?: Comment[];
}

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

  const { data: nft, loading } = usePollingFetch<NFTWithComments>(
    `/api/nfts/${slug}/${tokenId}`,
    0
  );

  if (loading) {
    return (
      <div className="flex gap-8 p-6 animate-fadeIn">
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
    <div className="flex gap-8 p-6 animate-fadeIn">
      {/* Left - Image */}
      <div className="w-[420px] flex-shrink-0">
        <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-[#2a2a2a] animate-scaleIn">
          <img
            src={nft.imageUrl}
            alt={nft.name}
            className="w-full aspect-square object-cover"
          />
        </div>

        {/* Description accordion */}
        <div className="mt-4 bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] overflow-hidden animate-fadeInUp" style={{ animationDelay: "0.1s" }}>
          <button className="w-full flex items-center justify-between p-4 text-sm font-medium hover:bg-[#252525] transition-colors">
            <span>📝 Description</span>
            <span className="text-[#8a8a8a]">∨</span>
          </button>
          <div className="px-4 pb-4 text-sm text-[#8a8a8a]">
            {nft.description}
          </div>
        </div>

        {/* Details accordion */}
        <div className="mt-2 bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] overflow-hidden animate-fadeInUp" style={{ animationDelay: "0.15s" }}>
          <button className="w-full flex items-center justify-between p-4 text-sm font-medium hover:bg-[#252525] transition-colors">
            <span>📋 Details</span>
            <span className="text-[#8a8a8a]">∨</span>
          </button>
          <div className="px-4 pb-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#8a8a8a]">Contract Address</span>
              <span className="text-blue-400 font-mono text-xs dynamic-data">{truncAddr(nft.contractAddress)}</span>
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
      <div className="flex-1 min-w-0 animate-fadeInUp">
        {/* Collection name */}
        <Link href={`/collection/${slug}`} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mb-1 transition-colors">
          {nft.collectionSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          <VerifiedBadge size={12} />
        </Link>

        {/* NFT name */}
        <h1 className="text-3xl font-bold mb-2">{nft.name}</h1>

        {/* Owner */}
        <p className="text-sm text-[#8a8a8a] mb-6">
          Owned by <span className="text-blue-400 dynamic-data">{nft.owner}</span>
        </p>

        {/* Price box */}
        <div className="bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] p-5 mb-6 animate-fadeInUp" style={{ animationDelay: "0.05s" }}>
          {nft.isListed && nft.currentPrice ? (
            <>
              <div className="text-xs text-[#8a8a8a] mb-1">Current price</div>
              <div className="text-3xl font-bold font-mono mb-1 number-transition">
                {nft.currentPrice.toFixed(4)} {nft.currentCurrency}
              </div>
              <div className="flex gap-3 mt-4">
                <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors btn-press">
                  Buy Now
                </button>
                <button className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-white font-medium py-3 rounded-xl transition-colors border border-[#444] btn-press">
                  Make Offer
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-[#8a8a8a] mb-1">Last sale</div>
              <div className="text-2xl font-bold font-mono mb-1 number-transition">
                {nft.lastSalePrice?.toFixed(4) || "—"} {nft.lastSaleCurrency}
              </div>
              <div className="mt-4">
                <button className="w-full bg-[#2a2a2a] hover:bg-[#333] text-white font-medium py-3 rounded-xl transition-colors border border-[#444] btn-press">
                  Make Offer
                </button>
              </div>
            </>
          )}
        </div>

        {/* Properties / Activity / Comments tabs */}
        <div className="flex items-center gap-4 border-b border-[#2a2a2a] mb-4">
          <button
            onClick={() => setActiveSection("properties")}
            className={`pb-3 text-sm font-medium transition-all duration-200 border-b-2 ${
              activeSection === "properties"
                ? "text-white border-white"
                : "text-[#8a8a8a] border-transparent hover:text-white"
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveSection("activity")}
            className={`pb-3 text-sm font-medium transition-all duration-200 border-b-2 ${
              activeSection === "activity"
                ? "text-white border-white"
                : "text-[#8a8a8a] border-transparent hover:text-white"
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveSection("comments")}
            className={`pb-3 text-sm font-medium transition-all duration-200 border-b-2 flex items-center gap-1.5 ${
              activeSection === "comments"
                ? "text-white border-white"
                : "text-[#8a8a8a] border-transparent hover:text-white"
            }`}
          >
            Comments
            {nft.comments && nft.comments.length > 0 && (
              <span className="text-[10px] bg-[#2a2a2a] px-1.5 py-0.5 rounded-full">{nft.comments.length}</span>
            )}
          </button>
        </div>

        {/* Properties */}
        {activeSection === "properties" && (
          <div className="grid grid-cols-3 gap-2 animate-fadeInUp">
            {nft.properties.map((prop, i) => (
              <div
                key={prop.traitType}
                className={`bg-[#1a2332] border border-[#1e3a5f] rounded-xl p-3 card-hover animate-fadeInUp stagger-${Math.min(i + 1, 12)}`}
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
          <div className="overflow-x-auto animate-fadeInUp">
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
                {nft.activityHistory.map((activity, i) => (
                  <tr key={activity.id} className={`border-b border-[#1e1e1e] text-sm row-hover animate-fadeInUp stagger-${Math.min(i + 1, 12)}`}>
                    <td className="py-2.5 px-3">
                      {eventTypeLabels[activity.eventType] || activity.eventType}
                    </td>
                    <td className="text-right py-2.5 px-3 font-mono number-transition">
                      {activity.price ? `${activity.price.toFixed(4)} ${activity.currency}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-blue-400 font-mono text-xs">
                      <span className="dynamic-data">{truncAddr(activity.fromAddress)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-blue-400 font-mono text-xs">
                      <span className="dynamic-data">{truncAddr(activity.toAddress)}</span>
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

        {/* Comments */}
        {activeSection === "comments" && (
          <div className="space-y-4 animate-fadeInUp">
            {nft.comments && nft.comments.length > 0 ? (
              nft.comments.map((comment, i) => (
                <div
                  key={comment.id}
                  className={`flex gap-3 animate-fadeInUp stagger-${Math.min(i + 1, 12)}`}
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                    <img src={comment.authorAvatar} alt={comment.author} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white dynamic-data">{comment.author}</span>
                      <span className="text-xs text-[#666]">{timeAgo(comment.timestamp)}</span>
                    </div>
                    <p className="text-sm text-[#ccc] dynamic-data">{comment.text}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <button className="text-xs text-[#8a8a8a] hover:text-white transition-colors flex items-center gap-1">
                        ♡ <span className="dynamic-data">{comment.likes}</span>
                      </button>
                      <button className="text-xs text-[#8a8a8a] hover:text-white transition-colors">
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-[#666] text-sm py-8">
                No comments yet. Be the first to comment!
              </div>
            )}

            {/* Comment input */}
            <div className="flex items-center gap-3 pt-4 border-t border-[#2a2a2a]">
              <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex-shrink-0 flex items-center justify-center text-xs text-[#666]">
                ?
              </div>
              <input
                type="text"
                placeholder="Add a comment..."
                className="flex-1 bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none placeholder-[#666] focus:border-[#555] transition-colors"
              />
              <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors btn-press">
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
