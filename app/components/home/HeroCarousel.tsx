"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Collection } from "@/app/lib/data/types";
import { VerifiedBadge } from "@/app/components/Badge";

interface HeroCarouselProps {
  collections: Collection[];
}

export default function HeroCarousel({ collections }: HeroCarouselProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % collections.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [collections.length]);

  if (!collections.length) return null;

  const c = collections[active];

  return (
    <div className="relative rounded-2xl overflow-hidden h-[380px] bg-[#1e1e1e]">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${c.bannerUrl})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-8">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-3xl font-bold text-white">{c.name}</h2>
          {c.verified && <VerifiedBadge size={24} />}
        </div>
        <p className="text-sm text-[#ccc] mb-1">By {c.creatorName}</p>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-3">
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Floor Price</div>
            <div className="text-sm font-mono text-white">{c.floorPrice.toFixed(4)} {c.floorCurrency}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Items</div>
            <div className="text-sm font-mono text-white">{c.itemCount.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Total Volume</div>
            <div className="text-sm font-mono text-white">{(c.totalVolume / 1000).toFixed(1)}K {c.totalVolumeCurrency}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Listed</div>
            <div className="text-sm font-mono text-white">{c.listedPct}%</div>
          </div>
        </div>

        <Link
          href={`/collection/${c.slug}`}
          className="mt-4 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2 rounded-lg transition-colors w-fit"
        >
          View Collection →
        </Link>
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {collections.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-8 bg-white" : "w-4 bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
