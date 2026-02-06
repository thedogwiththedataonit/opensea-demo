"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearch } from "@/app/hooks/useSearch";

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const { query, results, loading, search, clear } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasResults =
    results &&
    (results.collections.length > 0 || results.tokens.length > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-[#1e1e1e] border border-[#333] rounded-xl w-[560px] max-h-[70vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#333]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search collections, tokens..."
            value={query}
            onChange={(e) => search(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-[#666]"
          />
          {query && (
            <button onClick={clear} className="text-[#8a8a8a] hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="text-xs text-[#666] bg-[#333] px-2 py-0.5 rounded">
            ESC
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
          {loading && query && (
            <div className="px-4 py-6 text-center text-[#666] text-sm">Searching...</div>
          )}

          {!loading && query && !hasResults && (
            <div className="px-4 py-6 text-center text-[#666] text-sm">No results found</div>
          )}

          {!loading && hasResults && (
            <>
              {/* Collections */}
              {results!.collections.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs text-[#666] uppercase tracking-wider">Collections</div>
                  {results!.collections.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/collection/${c.slug}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#2a2a2a] transition-colors"
                      onClick={onClose}
                    >
                      <img src={c.imageUrl} alt={c.name} className="w-8 h-8 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white flex items-center gap-1">
                          <span className="truncate">{c.name}</span>
                          {c.verified && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#2081e2">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </div>
                        <div className="text-xs text-[#8a8a8a]">
                          Floor: {c.floorPrice} {c.floorCurrency}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Tokens */}
              {results!.tokens.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs text-[#666] uppercase tracking-wider border-t border-[#333]">Tokens</div>
                  {results!.tokens.map((t) => (
                    <Link
                      key={`${t.chain}-${t.address}`}
                      href={`/token/${t.chain}/${t.address}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#2a2a2a] transition-colors"
                      onClick={onClose}
                    >
                      <img src={t.imageUrl} alt={t.name} className="w-8 h-8 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{t.name}</div>
                        <div className="text-xs text-[#8a8a8a]">{t.symbol}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-white">${t.price < 0.01 ? t.price.toFixed(6) : t.price.toFixed(2)}</div>
                        <div className={`text-xs ${t.change1d >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {t.change1d >= 0 ? "+" : ""}{t.change1d.toFixed(1)}%
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {!query && (
            <div className="px-4 py-6 text-center text-[#666] text-sm">
              Start typing to search collections and tokens
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
