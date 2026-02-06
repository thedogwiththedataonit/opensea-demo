"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";
import { Collection, NFT, PaginatedResponse } from "@/app/lib/data/types";
import { VerifiedBadge, ChainBadge } from "@/app/components/Badge";
import { SkeletonCard } from "@/app/components/Skeleton";

export default function CollectionDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [sort, setSort] = useState("price");
  const [status, setStatus] = useState("all");

  const { data: collection, loading: loadingCollection } = usePollingFetch<Collection>(
    `/api/collections/${slug}`,
    15000
  );

  const { data: itemsData, loading: loadingItems } = usePollingFetch<PaginatedResponse<NFT>>(
    `/api/collections/${slug}/items?sort=${sort}&status=${status}&limit=20`,
    15000
  );

  return (
    <div>
      {/* Banner */}
      <div className="relative h-[200px] bg-[#1e1e1e]">
        {collection && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${collection.bannerUrl})` }}
          >
            <div className="absolute inset-0 bg-black/30" />
          </div>
        )}
      </div>

      {/* Collection info */}
      <div className="px-6 -mt-12 relative">
        <div className="flex items-end gap-4 mb-4">
          {collection ? (
            <img
              src={collection.imageUrl}
              alt={collection.name}
              className="w-24 h-24 rounded-2xl border-4 border-[#121212]"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-[#2a2a2a] animate-pulse border-4 border-[#121212]" />
          )}
          <div className="pb-2">
            {collection ? (
              <>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  {collection.name}
                  {collection.verified && <VerifiedBadge size={20} />}
                </h1>
                <p className="text-sm text-[#8a8a8a]">
                  By <span className="text-white">{collection.creatorName}</span>
                  <span className="mx-2">·</span>
                  <ChainBadge chain={collection.chain} />
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-6 w-48 bg-[#2a2a2a] rounded animate-pulse" />
                <div className="h-4 w-32 bg-[#2a2a2a] rounded animate-pulse" />
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {collection && (
          <p className="text-sm text-[#8a8a8a] max-w-2xl mb-4">{collection.description}</p>
        )}

        {/* Stats */}
        {collection && (
          <div className="flex items-center gap-6 mb-6 border border-[#2a2a2a] rounded-xl p-4 w-fit">
            <div>
              <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">Floor Price</div>
              <div className="text-sm font-mono font-semibold">{collection.floorPrice.toFixed(4)} {collection.floorCurrency}</div>
            </div>
            <div className="w-px h-8 bg-[#2a2a2a]" />
            <div>
              <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">Items</div>
              <div className="text-sm font-mono font-semibold">{collection.itemCount.toLocaleString()}</div>
            </div>
            <div className="w-px h-8 bg-[#2a2a2a]" />
            <div>
              <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">Total Volume</div>
              <div className="text-sm font-mono font-semibold">{(collection.totalVolume / 1000).toFixed(1)}K {collection.totalVolumeCurrency}</div>
            </div>
            <div className="w-px h-8 bg-[#2a2a2a]" />
            <div>
              <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">Listed</div>
              <div className="text-sm font-mono font-semibold">{collection.listedPct}%</div>
            </div>
            <div className="w-px h-8 bg-[#2a2a2a]" />
            <div>
              <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">Owners</div>
              <div className="text-sm font-mono font-semibold">{collection.ownerCount.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">All Items</option>
            <option value="listed">Listed Only</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-[#1e1e1e] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none"
          >
            <option value="price">Price: High to Low</option>
            <option value="rarity">Rarity: Rare First</option>
            <option value="recent">Recently Active</option>
          </select>
          <div className="flex-1" />
          <span className="text-sm text-[#8a8a8a]">
            {itemsData?.total || 0} items
          </span>
        </div>

        {/* NFT Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-8">
          {loadingItems
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
            : itemsData?.data.map((nft) => (
                <Link
                  key={nft.tokenId}
                  href={`/nft/${slug}/${nft.tokenId}`}
                  className="bg-[#1e1e1e] rounded-xl overflow-hidden hover:ring-1 hover:ring-[#555] transition-all group"
                >
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={nft.imageUrl}
                      alt={nft.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-xs text-[#8a8a8a] mb-0.5 truncate">{collection?.name}</div>
                    <div className="text-sm font-medium text-white truncate mb-2">{nft.name}</div>
                    {nft.isListed && nft.currentPrice ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-[#8a8a8a]">Price</div>
                          <div className="text-sm font-mono">{nft.currentPrice.toFixed(4)} {nft.currentCurrency}</div>
                        </div>
                        <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                          Buy
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-[#666]">Not listed</div>
                    )}
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </div>
  );
}
