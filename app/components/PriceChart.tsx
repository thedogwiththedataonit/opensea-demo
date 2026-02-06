"use client";

import { useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useRealtimeChartData, RealtimeOHLCPoint } from "@/app/hooks/useRealtimeChartData";

interface PriceChartProps {
  chain: string;
  address: string;
}

const TIMEFRAMES = ["1h", "1d", "7d", "30d"] as const;

const TIMEFRAME_CONFIG: Record<string, { points: number; interval: number; volatility: number; label: string }> = {
  "1h": { points: 60, interval: 1500, volatility: 0.008, label: "1m" },
  "1d": { points: 72, interval: 2000, volatility: 0.012, label: "5m" },
  "7d": { points: 84, interval: 3000, volatility: 0.02, label: "1h" },
  "30d": { points: 90, interval: 4000, volatility: 0.03, label: "4h" },
};

// Generate a deterministic-ish base price from the address string
function basePriceFromAddress(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) & 0xffffffff;
  }
  // Price between $0.001 and $5000
  const normalized = (hash >>> 0) / 0xffffffff;
  return Math.pow(10, normalized * 6.7 - 3);
}

function formatPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RealtimeOHLCPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#1e1e1e] border border-[#3a3a3a] rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-[#8a8a8a] mb-1">{d.time}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-[#8a8a8a]">Open</span>
        <span className="text-white font-mono text-right">{formatPrice(d.open)}</span>
        <span className="text-[#8a8a8a]">High</span>
        <span className="text-green-400 font-mono text-right">{formatPrice(d.high)}</span>
        <span className="text-[#8a8a8a]">Low</span>
        <span className="text-red-400 font-mono text-right">{formatPrice(d.low)}</span>
        <span className="text-[#8a8a8a]">Close</span>
        <span className="text-white font-mono text-right">{formatPrice(d.close)}</span>
      </div>
    </div>
  );
}

export default function PriceChart({ chain, address }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<string>("1h");
  const config = TIMEFRAME_CONFIG[timeframe];

  const basePrice = basePriceFromAddress(address + chain);

  const { data, currentPrice, priceChangePct, isPositive } = useRealtimeChartData({
    pointCount: config.points,
    updateIntervalMs: config.interval,
    basePrice,
    volatility: config.volatility,
    timeframe,
  });

  const lineColor = isPositive ? "#22c55e" : "#ef4444";
  const gradientId = `priceGradient-${chain}-${address}`;

  // Format Y-axis tick
  const formatYTick = useCallback(
    (value: number) => {
      if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
      if (value >= 1) return `$${value.toFixed(2)}`;
      if (value >= 0.01) return `$${value.toFixed(4)}`;
      return `$${value.toFixed(6)}`;
    },
    []
  );

  // Compute domain for Y-axis
  const prices = data.map((d) => d.close);
  const minPrice = prices.length ? Math.min(...prices) * 0.998 : 0;
  const maxPrice = prices.length ? Math.max(...prices) * 1.002 : 100;

  // Reference line at the open price
  const openPrice = data.length ? data[0].open : basePrice;

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-[#1e1e1e] rounded-lg p-1">
          <span className="text-xs text-[#8a8a8a] px-2">Timeframe:</span>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                timeframe === tf
                  ? "bg-[#333] text-white"
                  : "text-[#8a8a8a] hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-[#1e1e1e] rounded-lg p-1">
          <span className="text-xs text-[#8a8a8a] px-2">Interval:</span>
          <span className="text-xs text-white px-2">{config.label}</span>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 ml-auto bg-[#1e1e1e] rounded-lg px-3 py-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs text-green-400 font-medium">LIVE</span>
        </div>

        {/* Current price + change badge */}
        <div className="flex items-center gap-2 bg-[#1e1e1e] rounded-lg px-3 py-1">
          <span className="text-xs font-mono text-white">{formatPrice(currentPrice)}</span>
          <span className={`text-xs font-medium ${isPositive ? "text-green-400" : "text-red-400"}`}>
            {isPositive ? "▲" : "▼"} {Math.abs(priceChangePct).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-[#0d0d0d] rounded-xl p-2">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e1e1e"
              horizontal={true}
              vertical={false}
            />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#666", fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={50}
            />

            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fontSize: 10, fill: "#666", fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              orientation="right"
              tickFormatter={formatYTick}
              width={70}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "#555",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
              isAnimationActive={false}
            />

            <ReferenceLine
              y={openPrice}
              stroke="#555"
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            <Area
              type="monotone"
              dataKey="close"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{
                r: 4,
                fill: lineColor,
                stroke: "#0d0d0d",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
