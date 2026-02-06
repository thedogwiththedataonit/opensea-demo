"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Collection } from "@/app/lib/data/types";
import { VerifiedBadge } from "@/app/components/Badge";

interface HeroCarouselProps {
  collections: Collection[];
}

export default function HeroCarousel({ collections }: HeroCarouselProps) {
  const [active, setActive] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goTo = useCallback((index: number) => {
    if (index === active) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActive(index);
      setIsTransitioning(false);
    }, 300);
  }, [active]);

  useEffect(() => {
    const timer = setInterval(() => {
      goTo((active + 1) % collections.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [active, collections.length, goTo]);

  if (!collections.length) return null;

  const c = collections[active];

  return (
    <div className="relative rounded-2xl overflow-hidden h-[380px] bg-[#1e1e1e] group">
      {/* Background with crossfade */}
      <div
        key={active}
        className={`absolute inset-0 bg-cover bg-center transition-all duration-700 ${
          isTransitioning ? "opacity-0 scale-[1.02]" : "opacity-100 scale-100"
        }`}
        style={{ backgroundImage: `url(${c.bannerUrl})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      </div>

      {/* Content with fade-in-up animation */}
      <div
        key={`content-${active}`}
        className="relative h-full flex flex-col justify-end p-8 animate-fadeInUp"
      >
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-3xl font-bold text-white">{c.name}</h2>
          {c.verified && <VerifiedBadge size={24} />}
        </div>
        <p className="text-sm text-[#ccc] mb-1">By <span className="dynamic-data">{c.creatorName}</span></p>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-3">
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Floor Price</div>
            <div className="text-sm font-mono text-white number-transition"><span className="dynamic-data">{c.floorPrice.toFixed(4)}</span> {c.floorCurrency}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Items</div>
            <div className="text-sm font-mono text-white">{c.itemCount.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Total Volume</div>
            <div className="text-sm font-mono text-white"><span className="dynamic-data">{(c.totalVolume / 1000).toFixed(1)}K</span> {c.totalVolumeCurrency}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider">Listed</div>
            <div className="text-sm font-mono text-white"><span className="dynamic-data">{c.listedPct}%</span></div>
          </div>
        </div>

        <Link
          href={`/collection/${c.slug}`}
          className="mt-4 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2 rounded-lg transition-all duration-200 w-fit btn-press hover:translate-x-1"
        >
          View Collection →
        </Link>
      </div>

      {/* Navigation arrows on hover */}
      <button
        onClick={() => goTo((active - 1 + collections.length) % collections.length)}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 btn-press"
      >
        ‹
      </button>
      <button
        onClick={() => goTo((active + 1) % collections.length)}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 btn-press"
      >
        ›
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {collections.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-8 bg-white" : "w-4 bg-white/30 hover:bg-white/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
