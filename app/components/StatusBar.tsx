"use client";

import { usePollingFetch } from "@/app/hooks/usePollingFetch";

interface StatusData {
  trendingTokens: { price: number }[];
}

export default function StatusBar() {
  const { data } = usePollingFetch<StatusData>("/api/trending", 15000);

  // Mock ETH price and gas
  const ethPrice = 1879.47;
  const gasPrice = 16.48;

  return (
    <footer className="fixed bottom-0 left-[52px] right-0 h-[32px] bg-[#121212] border-t border-[#2a2a2a] flex items-center px-4 text-xs text-[#8a8a8a] z-40">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Live
        </span>
        <span className="flex items-center gap-1">
          ⚡ Aggregating
        </span>
        <span className="flex items-center gap-1">
          {"(·)"} Networks
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <span>♦ ${ethPrice.toLocaleString()}</span>
        <span>⛽ {gasPrice.toFixed(2)} GWEI</span>
        <span className="flex items-center gap-1">
          ⓘ Support
        </span>
        <span className="text-[#666]">|</span>
        <span>Collector</span>
        <span>Pro</span>
        <span className="text-[#666]">|</span>
        <span>Crypto</span>
        <span>USD</span>
      </div>
    </footer>
  );
}
