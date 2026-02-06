"use client";

import Link from "next/link";
import { Collection } from "@/app/lib/data/types";
import { VerifiedBadge } from "@/app/components/Badge";

interface TopCollectionsProps {
  collections: Collection[];
}

export default function TopCollections({ collections }: TopCollectionsProps) {
  if (!collections?.length) return null;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-[#8a8a8a] uppercase tracking-wider font-medium">Collection</div>
        <div className="text-xs text-[#8a8a8a] uppercase tracking-wider font-medium">Floor</div>
      </div>

      <div className="space-y-1">
        {collections.map((c, index) => (
          <Link
            key={c.slug}
            href={`/collection/${c.slug}`}
            className={`flex items-center gap-3 py-2 px-1 hover:bg-[#1e1e1e] rounded-lg transition-all duration-200 row-hover animate-fadeInUp stagger-${Math.min(index + 1, 12)}`}
          >
            <div className="relative w-10 h-10 rounded-full flex-shrink-0 overflow-hidden">
              <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white flex items-center gap-1">
                <span className="truncate">{c.name}</span>
                {c.verified && <VerifiedBadge size={14} />}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-mono text-white number-transition">
                <span className="dynamic-data">{c.floorPrice < 0.01 ? "< 0.01" : c.floorPrice.toFixed(2)}</span> {c.floorCurrency}
              </div>
              <div className={`text-xs number-transition ${c.change1d >= 0 ? "text-green-400" : "text-red-400"}`}>
                <span className="dynamic-data">{c.change1d >= 0 ? "+" : ""}{c.change1d.toFixed(1)}%</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
