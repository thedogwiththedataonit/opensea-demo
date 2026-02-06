"use client";

import { useState, useMemo } from "react";
import { usePollingFetch } from "@/app/hooks/usePollingFetch";

interface OHLCPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartData {
  token: string;
  chain: string;
  timeframe: string;
  interval: string;
  data: OHLCPoint[];
}

interface PriceChartProps {
  chain: string;
  address: string;
}

const TIMEFRAMES = ["1h", "1d", "7d", "30d"];
const INTERVALS: Record<string, string> = {
  "1h": "1m",
  "1d": "5m",
  "7d": "1h",
  "30d": "4h",
};

export default function PriceChart({ chain, address }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState("1h");
  const [showCandles, setShowCandles] = useState(false);
  const interval = INTERVALS[timeframe] || "1m";

  const { data: chartData } = usePollingFetch<ChartData>(
    `/api/tokens/${chain}/${address}/chart?timeframe=${timeframe}&interval=${interval}`,
    5000
  );

  const { points, minPrice, maxPrice, width, height, timeLabels } = useMemo(() => {
    const w = 700;
    const h = 300;
    const padding = 40;

    if (!chartData?.data?.length) {
      return { points: "", minPrice: 0, maxPrice: 0, width: w, height: h, timeLabels: [] };
    }

    const prices = chartData.data.map((d) => d.close);
    const min = Math.min(...prices) * 0.999;
    const max = Math.max(...prices) * 1.001;
    const range = max - min || 1;

    const pts = chartData.data
      .map((d, i) => {
        const x = padding + (i / (chartData.data.length - 1)) * (w - padding * 2);
        const y = padding + (1 - (d.close - min) / range) * (h - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");

    // Generate time labels
    const labels: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(chartData.data.length / 6));
    for (let i = 0; i < chartData.data.length; i += step) {
      const d = chartData.data[i];
      const x = padding + (i / (chartData.data.length - 1)) * (w - padding * 2);
      const date = new Date(d.timestamp);
      const label =
        timeframe === "1h" || timeframe === "1d"
          ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      labels.push({ x, label });
    }

    return { points: pts, minPrice: min, maxPrice: max, width: w, height: h, timeLabels: labels };
  }, [chartData, timeframe]);

  // Gradient area fill
  const areaPath = points
    ? `M${points.split(" ")[0]} ${points} L${width - 40},${height - 40} L40,${height - 40} Z`
    : "";

  const trendUp = chartData?.data?.length
    ? chartData.data[chartData.data.length - 1].close >= chartData.data[0].close
    : true;
  const lineColor = trendUp ? "#f59e0b" : "#ef4444";

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
          <span className="text-xs text-white px-2">{interval}</span>
        </div>
        <div className="flex items-center gap-1 bg-[#1e1e1e] rounded-lg p-1 ml-auto">
          <button
            onClick={() => setShowCandles(false)}
            className={`p-1.5 rounded-md ${!showCandles ? "bg-[#333]" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={!showCandles ? "white" : "#666"} strokeWidth="2">
              <polyline points="22,12 18,8 14,14 10,10 6,16 2,12" />
            </svg>
          </button>
          <button
            onClick={() => setShowCandles(true)}
            className={`p-1.5 rounded-md ${showCandles ? "bg-[#333]" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showCandles ? "white" : "#666"} strokeWidth="2">
              <rect x="4" y="6" width="4" height="12" />
              <rect x="10" y="4" width="4" height="16" />
              <rect x="16" y="8" width="4" height="8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chart SVG */}
      <div className="bg-[#0d0d0d] rounded-xl p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 300 }}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct) => (
            <line
              key={pct}
              x1={40}
              y1={40 + pct * (height - 80)}
              x2={width - 40}
              y2={40 + pct * (height - 80)}
              stroke="#1e1e1e"
              strokeWidth="1"
            />
          ))}

          {/* Area fill */}
          {areaPath && (
            <path d={areaPath} fill="url(#chartGrad)" />
          )}

          {/* Line */}
          {points && (
            <polyline
              points={points}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Time labels */}
          {timeLabels.map((tl, i) => (
            <text
              key={i}
              x={tl.x}
              y={height - 10}
              textAnchor="middle"
              fill="#666"
              fontSize="10"
              fontFamily="monospace"
            >
              {tl.label}
            </text>
          ))}

          {/* Price labels */}
          {maxPrice > 0 && (
            <>
              <text x={width - 5} y={45} textAnchor="end" fill="#666" fontSize="10" fontFamily="monospace">
                ${maxPrice < 1 ? maxPrice.toFixed(6) : maxPrice.toFixed(2)}
              </text>
              <text x={width - 5} y={height - 45} textAnchor="end" fill="#666" fontSize="10" fontFamily="monospace">
                ${minPrice < 1 ? minPrice.toFixed(6) : minPrice.toFixed(2)}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
