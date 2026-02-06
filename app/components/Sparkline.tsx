"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  /** Enable realtime simulation: the sparkline will animate with new mock data */
  realtime?: boolean;
  /** Update interval in ms for realtime mode (default 3000) */
  realtimeIntervalMs?: number;
}

interface SparkPoint {
  value: number;
}

export default function Sparkline({
  data,
  width = 100,
  height = 32,
  color,
  className = "",
  realtime = false,
  realtimeIntervalMs = 3000,
}: SparklineProps) {
  const [liveData, setLiveData] = useState<number[]>(data || []);
  const priceRef = useRef<number>(data?.length ? data[data.length - 1] : 1);

  // Seed liveData whenever incoming data prop changes
  useEffect(() => {
    if (data?.length) {
      setLiveData(data);
      priceRef.current = data[data.length - 1];
    }
  }, [data]);

  // Realtime tick
  useEffect(() => {
    if (!realtime) return;
    const id = setInterval(() => {
      setLiveData((prev) => {
        const last = priceRef.current;
        const change = (Math.random() - 0.48) * 0.03 * last;
        const next = Math.max(last + change, last * 0.01);
        priceRef.current = next;
        const updated = [...prev, next];
        if (updated.length > 24) updated.shift();
        return updated;
      });
    }, realtimeIntervalMs);
    return () => clearInterval(id);
  }, [realtime, realtimeIntervalMs]);

  const chartData: SparkPoint[] = useMemo(
    () => liveData.map((value) => ({ value })),
    [liveData]
  );

  if (!liveData || liveData.length < 2) return null;

  // Determine color from trend if not specified
  const trendColor =
    color || (liveData[liveData.length - 1] >= liveData[0] ? "#22c55e" : "#ef4444");

  const min = Math.min(...liveData);
  const max = Math.max(...liveData);

  return (
    <div className={className} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <YAxis domain={[min * 0.999, max * 1.001]} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={trendColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
