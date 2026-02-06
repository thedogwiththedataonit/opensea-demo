"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";
import { Token } from "@/app/lib/data/types";
import { VerifiedBadge, ChainBadge, Badge } from "@/app/components/Badge";
import PriceChart from "@/app/components/PriceChart";
import { Skeleton } from "@/app/components/Skeleton";
import { apiPost } from "@/app/lib/api-client";

interface Holder {
  address: string;
  displayName: string;
  balance: number;
  percentage: number;
  avatar: string;
}

interface RecentTransaction {
  hash: string;
  type: "buy" | "sell" | "transfer";
  from: string;
  to: string;
  amount: number;
  tokenSymbol: string;
  valueUsd: number;
  timestamp: number;
}

interface TokenDetail extends Omit<Token, "priceHistory"> {
  recentPrices: number[];
  holders?: Holder[];
  recentTransactions?: RecentTransaction[];
}

interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: number;
  fee: number;
  feeCurrency: string;
  estimatedGas: number;
  route: string;
  expiresAt: number;
}

function formatPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
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

function timeAgoFromISO(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

function timeAgoMs(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TokenDetailPage() {
  const params = useParams();
  const chain = params.chain as string;
  const address = params.address as string;

  const [swapAmount, setSwapAmount] = useState("");
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [showHolders, setShowHolders] = useState(false);

  const { data: token, loading } = usePollingFetch<TokenDetail>(
    `/api/tokens/${chain}/${address}`,
    5000
  );

  async function handleSwapQuote() {
    if (!swapAmount || parseFloat(swapAmount) <= 0) return;
    setSwapLoading(true);
    try {
      const quote = await apiPost<SwapQuote>(`/api/tokens/${chain}/${address}/swap`, {
        fromToken: chain === "solana" ? "SOL" : "ETH",
        toToken: token?.symbol,
        amount: parseFloat(swapAmount),
      });
      setSwapQuote(quote);
    } catch {
      // Silently handle errors
    } finally {
      setSwapLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex gap-8 p-6 animate-fadeIn">
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
        <div className="w-[360px]">
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-[#8a8a8a]">Token not found</div>
      </div>
    );
  }

  const nativeCurrency = chain === "solana" ? "SOL" : "ETH";

  return (
    <div className="flex gap-6 p-6 animate-fadeIn">
      {/* Left - Chart and info */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1 animate-fadeInUp">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            <img src={token.imageUrl} alt={token.symbol} className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{token.name}</h1>
              <span className="text-[#8a8a8a] font-medium">{token.symbol}</span>
              {token.verified && <VerifiedBadge size={16} />}
              <span className="text-[#8a8a8a]">·</span>
              <span className="text-[#8a8a8a]">···</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="chain">TOKEN</Badge>
              <ChainBadge chain={token.chain} />
              <span className="text-[#8a8a8a]">{timeAgoFromISO(token.createdAt)}</span>
              {token.isNew && <Badge variant="new">NEW</Badge>}
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-3 mb-6 mt-4 animate-fadeInUp" style={{ animationDelay: "0.05s" }}>
          <span className="text-4xl font-bold font-mono number-transition"><span className="dynamic-data">{formatPrice(token.price)}</span></span>
          <span className={`text-lg font-medium ${token.change1d >= 0 ? "text-green-400" : "text-red-400"}`}>
            {token.change1d >= 0 ? "↑" : "↓"} <span className="dynamic-data">{Math.abs(token.change1d).toFixed(1)}%</span>
          </span>
        </div>

        {/* FDV and date */}
        <div className="text-sm text-[#8a8a8a] mb-6 animate-fadeInUp" style={{ animationDelay: "0.08s" }}>
          FDV: {formatCompact(token.fdv)} · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </div>

        {/* Chart */}
        <div className="animate-fadeInUp" style={{ animationDelay: "0.1s" }}>
          <PriceChart chain={chain} address={address} />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-8 mt-6 mb-8 animate-fadeInUp" style={{ animationDelay: "0.15s" }}>
          <div>
            <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">FDV</div>
            <div className="text-lg font-bold font-mono number-transition"><span className="dynamic-data">{formatCompact(token.fdv)}</span></div>
          </div>
          <div>
            <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">1D Volume</div>
            <div className="text-lg font-bold font-mono number-transition"><span className="dynamic-data">{formatCompact(token.volume1d)}</span></div>
          </div>
          <div>
            <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">1D FDV</div>
            <div className={`text-lg font-bold number-transition ${token.change1d >= 0 ? "text-green-400" : "text-red-400"}`}>
              <span className="dynamic-data">{token.change1d >= 0 ? "+" : ""}{token.change1d.toFixed(1)}%</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">7D Volume</div>
            <div className="text-lg font-bold font-mono number-transition"><span className="dynamic-data">{formatCompact(token.volume7d)}</span></div>
          </div>
          <div>
            <div className="text-xs text-[#8a8a8a] uppercase tracking-wider">7D FDV</div>
            <div className={`text-lg font-bold number-transition ${token.change30d >= 0 ? "text-green-400" : "text-red-400"}`}>
              <span className="dynamic-data">{token.change30d >= 0 ? "+" : ""}{token.change30d.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] p-5 animate-fadeInUp" style={{ animationDelay: "0.2s" }}>
          <h3 className="text-sm font-semibold mb-3">Details</h3>
          <p className="text-sm text-[#8a8a8a] mb-4">{token.description}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#8a8a8a]">Contract</span>
              <span className="text-blue-400 font-mono text-xs dynamic-data">{token.contractAddress.slice(0, 8)}...{token.contractAddress.slice(-6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a8a8a]">Chain</span>
              <ChainBadge chain={token.chain} />
            </div>
            {token.socialLinks.website && (
              <div className="flex justify-between">
                <span className="text-[#8a8a8a]">Website</span>
                <span className="text-blue-400">{token.socialLinks.website}</span>
              </div>
            )}
            {token.socialLinks.twitter && (
              <div className="flex justify-between">
                <span className="text-[#8a8a8a]">Twitter</span>
                <span className="text-blue-400">{token.socialLinks.twitter}</span>
              </div>
            )}
          </div>
        </div>

        {/* Top Holders */}
        {token.holders && token.holders.length > 0 && (
          <div className="bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] p-5 mt-4 animate-fadeInUp" style={{ animationDelay: "0.25s" }}>
            <button
              onClick={() => setShowHolders(!showHolders)}
              className="w-full flex items-center justify-between text-sm font-semibold hover:text-blue-400 transition-colors"
            >
              <span>Top Holders ({token.holders.length})</span>
              <span className="text-[#8a8a8a] text-xs">{showHolders ? "∧" : "∨"}</span>
            </button>

            {showHolders && (
              <div className="mt-3 space-y-2 animate-fadeInUp">
                {token.holders.map((holder, i) => (
                  <div key={holder.address} className={`flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-[#252525] transition-colors row-hover animate-fadeInUp stagger-${Math.min(i + 1, 12)}`}>
                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                      <img src={holder.avatar} alt={holder.displayName} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-mono text-xs">
                        <span className="dynamic-data">{holder.displayName}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-white font-mono number-transition">
                        <span className="dynamic-data">{holder.balance.toLocaleString()}</span> {token.symbol}
                      </div>
                      <div className="text-xs text-[#8a8a8a]">
                        <span className="dynamic-data">{holder.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Transactions */}
        {token.recentTransactions && token.recentTransactions.length > 0 && (
          <div className="bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] p-5 mt-4 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
            <h3 className="text-sm font-semibold mb-3">Recent Transactions</h3>
            <div className="space-y-2">
              {token.recentTransactions.map((tx, i) => (
                <div key={tx.hash} className={`flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-[#252525] transition-colors row-hover animate-fadeInUp stagger-${Math.min(i + 1, 6)}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    tx.type === "buy" ? "bg-green-900/30 text-green-400" :
                    tx.type === "sell" ? "bg-red-900/30 text-red-400" :
                    "bg-blue-900/30 text-blue-400"
                  }`}>
                    {tx.type === "buy" ? "↓" : tx.type === "sell" ? "↑" : "→"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white flex items-center gap-1">
                      <span className={tx.type === "buy" ? "text-green-400" : tx.type === "sell" ? "text-red-400" : "text-blue-400"}>
                        {tx.type.toUpperCase()}
                      </span>
                      <span className="text-[#666]">·</span>
                      <span className="dynamic-data font-mono text-[#8a8a8a]">{tx.from}</span>
                    </div>
                    <div className="text-xs text-[#666]">{timeAgoMs(tx.timestamp)}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-white font-mono number-transition">
                      <span className="dynamic-data">{tx.amount.toLocaleString()}</span> {tx.tokenSymbol}
                    </div>
                    <div className="text-xs text-[#8a8a8a] number-transition">
                      <span className="dynamic-data">{formatCompact(tx.valueUsd)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right - Swap Widget */}
      <div className="w-[360px] flex-shrink-0">
        <div className="sticky top-[72px] animate-fadeInUp" style={{ animationDelay: "0.1s" }}>
          <div className="bg-[#1e1e1e] rounded-xl border border-[#2a2a2a] p-5">
            {/* Buy/Sell tabs */}
            <div className="flex items-center gap-1 mb-5">
              <button
                onClick={() => setActiveTab("buy")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 btn-press ${
                  activeTab === "buy"
                    ? "bg-[#2a2a2a] text-white"
                    : "text-[#8a8a8a] hover:text-white"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setActiveTab("sell")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 btn-press ${
                  activeTab === "sell"
                    ? "bg-[#2a2a2a] text-white"
                    : "text-[#8a8a8a] hover:text-white"
                }`}
              >
                Sell
              </button>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-[#8a8a8a]">AUTO</span>
                <span className="text-xs text-[#8a8a8a]">1%</span>
                <button className="text-[#8a8a8a] hover:text-white transition-colors">⚙️</button>
              </div>
            </div>

            {/* Pay with */}
            <div className="mb-2">
              <label className="text-xs text-[#8a8a8a] mb-1 block">Pay with</label>
              <div className="bg-[#121212] rounded-xl p-4 border border-[#333] transition-colors focus-within:border-[#555]">
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    placeholder="0"
                    value={swapAmount}
                    onChange={(e) => {
                      setSwapAmount(e.target.value);
                      setSwapQuote(null);
                    }}
                    className="bg-transparent text-2xl text-white outline-none w-full font-mono"
                  />
                  <div className="flex items-center gap-2 bg-[#2a2a2a] px-3 py-1.5 rounded-full hover:bg-[#333] transition-colors cursor-pointer">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500" />
                    <span className="text-sm font-medium">{nativeCurrency}</span>
                    <span className="text-[#8a8a8a]">∨</span>
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-xs text-[#8a8a8a]">
                  <span className="number-transition">${swapAmount ? (parseFloat(swapAmount) * (chain === "solana" ? 195.42 : 1879.47)).toFixed(2) : "0.00"}</span>
                  <span>0.00 {nativeCurrency}</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center my-2">
              <div className="w-8 h-8 rounded-full bg-[#121212] border border-[#333] flex items-center justify-center hover:border-[#555] transition-colors cursor-pointer">
                <span className="text-[#8a8a8a]">↓</span>
              </div>
            </div>

            {/* Receive */}
            <div className="mb-4">
              <label className="text-xs text-[#8a8a8a] mb-1 block">Receive</label>
              <div className="bg-[#121212] rounded-xl p-4 border border-[#333]">
                <div className="flex items-center justify-between">
                  <span className="text-2xl text-white font-mono number-transition">
                    {swapQuote ? swapQuote.toAmount.toFixed(2) : "—"}
                  </span>
                  <div className="flex items-center gap-2 bg-[#2a2a2a] px-3 py-1.5 rounded-full">
                    <div className="w-5 h-5 rounded-full overflow-hidden">
                      <img src={token.imageUrl} alt={token.symbol} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-medium">{token.symbol}</span>
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-xs text-[#8a8a8a]">
                  <span className="number-transition">${swapQuote ? (swapQuote.toAmount * token.price).toFixed(2) : "0.00"}</span>
                  <span className="number-transition">{swapQuote ? swapQuote.toAmount.toFixed(2) : "0.00"} {token.symbol}</span>
                </div>
              </div>
            </div>

            {/* Quote button (if amount entered) */}
            {swapAmount && !swapQuote && (
              <button
                onClick={handleSwapQuote}
                disabled={swapLoading}
                className="w-full bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-medium py-3 rounded-xl mb-3 transition-all duration-200 disabled:opacity-50 btn-press animate-fadeIn"
              >
                {swapLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#444] border-t-white rounded-full animate-spin" />
                    Getting quote...
                  </span>
                ) : "Get Quote"}
              </button>
            )}

            {/* Quote details */}
            {swapQuote && (
              <div className="bg-[#121212] rounded-xl p-3 mb-3 text-xs space-y-1.5 animate-fadeInUp">
                <div className="flex justify-between">
                  <span className="text-[#8a8a8a]">Price Impact</span>
                  <span className={swapQuote.priceImpact > 5 ? "text-red-400" : "text-white"}>
                    {swapQuote.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8a8a8a]">Fee</span>
                  <span>${swapQuote.fee.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8a8a8a]">Route</span>
                  <span>{swapQuote.route}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8a8a8a]">Est. Gas</span>
                  <span>{swapQuote.estimatedGas.toFixed(4)} {nativeCurrency}</span>
                </div>
              </div>
            )}

            {/* Warnings */}
            {token.warnings.length > 0 && (
              <button
                onClick={() => setShowWarnings(!showWarnings)}
                className="w-full flex items-center gap-2 text-sm text-red-400 bg-red-900/20 rounded-xl px-4 py-2.5 mb-3 hover:bg-red-900/30 transition-colors btn-press"
              >
                <span>⚠️</span>
                <span>{token.warnings.length} warnings for {token.symbol}</span>
                <span className="ml-auto text-xs">{showWarnings ? "∧" : "∨"}</span>
              </button>
            )}

            {showWarnings && (
              <div className="space-y-2 mb-3 animate-fadeInUp">
                {token.warnings.map((w, i) => (
                  <div key={i} className={`text-xs text-red-300 bg-red-900/10 rounded-lg px-3 py-2 animate-fadeInUp stagger-${i + 1}`}>
                    {w.message}
                  </div>
                ))}
              </div>
            )}

            {/* Connect Wallet */}
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3.5 rounded-xl transition-all duration-200 btn-press">
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
