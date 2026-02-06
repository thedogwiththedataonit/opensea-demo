"use client";

import Link from "next/link";
import Sparkline from "@/app/components/Sparkline";

interface TrendingToken {
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
}

interface TrendingTokensProps {
  tokens: TrendingToken[];
}

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

export default function TrendingTokens({ tokens }: TrendingTokensProps) {
  if (!tokens?.length) return null;

  return (
    <div className="animate-fadeIn">
      <h3 className="text-xl font-bold mb-1">Trending Tokens</h3>
      <p className="text-sm text-[#8a8a8a] mb-4">Tokens with momentum today</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tokens.map((token, index) => (
          <Link
            key={`${token.chain}-${token.address}`}
            href={`/token/${token.chain}/${token.address}`}
            className={`bg-[#1e1e1e] rounded-xl p-4 hover:bg-[#252525] transition-all duration-200 flex items-center gap-3 card-hover animate-fadeInUp stagger-${Math.min(index + 1, 12)}`}
          >
            <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden">
              <img src={token.imageUrl} alt={token.symbol} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{token.name}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#8a8a8a] number-transition"><span className="dynamic-data">{formatCompact(token.fdv)}</span></span>
                <span className={`text-sm number-transition ${token.change1d >= 0 ? "text-green-400" : "text-red-400"}`}>
                  <span className="dynamic-data">{token.change1d >= 0 ? "+" : ""}{token.change1d.toFixed(1)}%</span>
                </span>
              </div>
            </div>
            <Sparkline
              data={token.sparkline}
              width={60}
              height={28}
              color={token.change1d >= 0 ? "#22c55e" : "#ef4444"}
              realtime
              realtimeIntervalMs={3000}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
