"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fireOneRequest, RequestLogEntry } from "./simulator";

interface BusyboxFaults {
  http500: boolean;
  http502: boolean;
  http503: boolean;
  http429: boolean;
  http422: boolean;
  subfunctionCrash: boolean;
  timeout: boolean;
}

interface BusyboxState {
  enabled: boolean;
  errorRate: number;
  enabledFaults: BusyboxFaults;
}

const FAULT_LABELS: Record<keyof BusyboxFaults, { label: string; desc: string }> = {
  http500: { label: "500 Internal Error", desc: "Random server crashes on any route" },
  http502: { label: "502 Bad Gateway", desc: "Upstream target failure (Vercel ROUTER_EXTERNAL_TARGET_ERROR)" },
  http503: { label: "503 Unavailable", desc: "Simulated downstream outages" },
  http429: { label: "429 Rate Limit", desc: "Simulated request throttling" },
  http422: { label: "422 Unprocessable", desc: "Business logic failures (swap)" },
  subfunctionCrash: { label: "Subfunction Crash", desc: "Sparkline / OHLC computation failures" },
  timeout: { label: "Timeout (3-8s)", desc: "Latency amplified to simulate timeouts" },
};

const RPS_OPTIONS = [0.5, 1, 2, 5, 10, 20];
const MAX_LOG_ENTRIES = 500;

export default function AdminPage() {
  // ---- Busybox state ----
  const [busybox, setBusybox] = useState<BusyboxState>({
    enabled: false,
    errorRate: 0.3,
    enabledFaults: { http500: true, http502: true, http503: true, http429: true, http422: true, subfunctionCrash: true, timeout: true },
  });
  const [busyboxLoading, setBusyboxLoading] = useState(true);

  // ---- Simulator state ----
  const [running, setRunning] = useState(false);
  const [rps, setRps] = useState(2);
  const [log, setLog] = useState<RequestLogEntry[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Counters ----
  const total = log.length;
  const success = log.filter((r) => r.status >= 200 && r.status < 300).length;
  const client4xx = log.filter((r) => r.status >= 400 && r.status < 500).length;
  const server5xx = log.filter((r) => r.status >= 500).length;
  const networkErr = log.filter((r) => r.status === 0).length;

  // ---- Fetch busybox state on mount ----
  const fetchBusyboxState = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/busybox");
      const data = await res.json();
      setBusybox(data);
    } catch { /* ignore */ }
    setBusyboxLoading(false);
  }, []);

  useEffect(() => {
    fetchBusyboxState();
  }, [fetchBusyboxState]);

  // ---- Update busybox on server ----
  const updateBusybox = useCallback(async (partial: Partial<BusyboxState>) => {
    const optimistic = { ...busybox, ...partial };
    if (partial.enabledFaults) {
      optimistic.enabledFaults = { ...busybox.enabledFaults, ...partial.enabledFaults };
    }
    setBusybox(optimistic);
    try {
      const res = await fetch("/api/admin/busybox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const data = await res.json();
      setBusybox(data);
    } catch { /* revert on failure */ }
  }, [busybox]);

  // ---- Simulator start/stop ----
  const startSimulator = useCallback(() => {
    if (intervalRef.current) return;
    setRunning(true);
    const ms = Math.round(1000 / rps);
    intervalRef.current = setInterval(async () => {
      const entry = await fireOneRequest();
      setLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
    }, ms);
  }, [rps]);

  const stopSimulator = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  }, []);

  // ---- Auto-disable on page unload ----
  useEffect(() => {
    const disableBusybox = () => {
      // Fire-and-forget: disable busybox when leaving page
      navigator.sendBeacon("/api/admin/busybox", JSON.stringify({ enabled: false }));
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopSimulator();
        disableBusybox();
      }
    };

    window.addEventListener("beforeunload", disableBusybox);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopSimulator();
      window.removeEventListener("beforeunload", disableBusybox);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stopSimulator]);

  // ---- Restart simulator when RPS changes while running ----
  useEffect(() => {
    if (running) {
      stopSimulator();
      // Small delay then restart with new rate
      const t = setTimeout(() => startSimulator(), 50);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rps]);

  const statusColor = (status: number) => {
    if (status === 0) return "text-gray-400";
    if (status < 300) return "text-green-400";
    if (status < 500) return "text-yellow-400";
    return "text-red-400";
  };

  const rowBg = (status: number) => {
    if (status === 0) return "bg-gray-900/20";
    if (status < 300) return "";
    if (status < 500) return "bg-yellow-900/10";
    return "bg-red-900/10";
  };

  if (busyboxLoading) {
    return <div className="flex items-center justify-center h-[50vh] text-[#8a8a8a]">Loading admin state...</div>;
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* ========== Section 1: Busybox Controls ========== */}
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Busybox Chaos Engine</h2>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${busybox.enabled ? "bg-red-600 text-white" : "bg-[#333] text-[#8a8a8a]"}`}>
              {busybox.enabled ? "ACTIVE" : "DISABLED"}
            </div>
          </div>

          {/* Master toggle */}
          <div className="flex items-center justify-between mb-5 p-3 bg-[#121212] rounded-lg">
            <div>
              <div className="text-sm font-medium">Enable Chaos Mode</div>
              <div className="text-xs text-[#8a8a8a]">Inject faults into API routes and subfunctions</div>
            </div>
            <button
              onClick={() => updateBusybox({ enabled: !busybox.enabled })}
              className={`relative w-12 h-7 rounded-full transition-colors ${busybox.enabled ? "bg-red-600" : "bg-[#333]"}`}
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${busybox.enabled ? "left-6" : "left-1"}`} />
            </button>
          </div>

          {/* Error rate slider */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#8a8a8a]">Error Rate</span>
              <span className="text-sm font-mono">{Math.round(busybox.errorRate * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(busybox.errorRate * 100)}
              onChange={(e) => updateBusybox({ errorRate: parseInt(e.target.value) / 100 })}
              className="w-full h-2 rounded-full appearance-none bg-[#333] accent-red-500"
            />
            <div className="flex justify-between text-[10px] text-[#666] mt-1">
              <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>

          {/* Fault type toggles */}
          <div className="space-y-2">
            <div className="text-xs text-[#8a8a8a] uppercase tracking-wider mb-1">Fault Types</div>
            {(Object.keys(FAULT_LABELS) as Array<keyof BusyboxFaults>).map((key) => (
              <label key={key} className="flex items-center gap-3 p-2 hover:bg-[#121212] rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={busybox.enabledFaults[key]}
                  onChange={(e) => updateBusybox({ enabledFaults: { ...busybox.enabledFaults, [key]: e.target.checked } })}
                  className="w-4 h-4 rounded accent-red-500 bg-[#333] border-[#555]"
                />
                <div className="flex-1">
                  <div className="text-sm">{FAULT_LABELS[key].label}</div>
                  <div className="text-xs text-[#666]">{FAULT_LABELS[key].desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ========== Section 2: Traffic Simulator ========== */}
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Traffic Simulator</h2>
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${running ? "bg-green-600 text-white" : "bg-[#333] text-[#8a8a8a]"}`}>
              {running ? "RUNNING" : "STOPPED"}
            </div>
          </div>

          {/* Rate selector */}
          <div className="mb-5">
            <div className="text-sm text-[#8a8a8a] mb-2">Requests per Second</div>
            <div className="flex gap-2">
              {RPS_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRps(r)}
                  className={`flex-1 py-2 text-sm font-mono rounded-lg transition-colors ${
                    rps === r ? "bg-blue-600 text-white" : "bg-[#121212] text-[#8a8a8a] hover:bg-[#2a2a2a]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Start/Stop */}
          <div className="flex gap-3 mb-5">
            <button
              onClick={running ? stopSimulator : startSimulator}
              className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors ${
                running
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {running ? "Stop Simulator" : "Start Simulator"}
            </button>
            <button
              onClick={() => setLog([])}
              className="px-4 py-3 rounded-xl font-medium text-sm bg-[#2a2a2a] hover:bg-[#333] text-[#8a8a8a] transition-colors"
            >
              Clear Log
            </button>
          </div>

          {/* Counters */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            <div className="bg-[#121212] rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold">{total}</div>
              <div className="text-[10px] text-[#8a8a8a] uppercase">Total</div>
            </div>
            <div className="bg-[#121212] rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold text-green-400">{success}</div>
              <div className="text-[10px] text-[#8a8a8a] uppercase">2xx</div>
            </div>
            <div className="bg-[#121212] rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold text-yellow-400">{client4xx}</div>
              <div className="text-[10px] text-[#8a8a8a] uppercase">4xx</div>
            </div>
            <div className="bg-[#121212] rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold text-red-400">{server5xx}</div>
              <div className="text-[10px] text-[#8a8a8a] uppercase">5xx</div>
            </div>
            <div className="bg-[#121212] rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold text-gray-400">{networkErr}</div>
              <div className="text-[10px] text-[#8a8a8a] uppercase">Err</div>
            </div>
          </div>

          <div className="text-xs text-[#666]">
            Simulator auto-disables busybox on page unload. Hits all 10 API endpoints with weighted rotation including intentional 404s and malformed requests.
          </div>
        </div>
      </div>

      {/* ========== Section 3: Live Request Log ========== */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
          <h2 className="text-sm font-semibold">Live Request Log</h2>
          <span className="text-xs text-[#666]">{log.length} entries (max {MAX_LOG_ENTRIES})</span>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#1e1e1e] z-10">
              <tr className="text-[#8a8a8a] uppercase tracking-wider border-b border-[#2a2a2a]">
                <th className="text-left py-2 px-3 font-medium w-10">#</th>
                <th className="text-left py-2 px-3 font-medium w-28">Time</th>
                <th className="text-left py-2 px-3 font-medium w-12">Method</th>
                <th className="text-left py-2 px-3 font-medium">Route</th>
                <th className="text-right py-2 px-3 font-medium w-14">Status</th>
                <th className="text-right py-2 px-3 font-medium w-16">Latency</th>
                <th className="text-left py-2 px-3 font-medium w-40">Error Code</th>
                <th className="text-left py-2 px-3 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-[#666]">
                    No requests yet. Start the simulator to begin.
                  </td>
                </tr>
              ) : (
                log.map((entry) => (
                  <tr key={entry.id} className={`border-b border-[#1a1a1a] ${rowBg(entry.status)}`}>
                    <td className="py-1.5 px-3 text-[#666] font-mono">{entry.id}</td>
                    <td className="py-1.5 px-3 text-[#8a8a8a] font-mono">
                      {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 1 } as Intl.DateTimeFormatOptions)}
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={`font-mono ${entry.method === "POST" ? "text-purple-400" : "text-blue-400"}`}>
                        {entry.method}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-white font-mono truncate max-w-[250px]">{entry.route}</td>
                    <td className={`py-1.5 px-3 text-right font-mono font-bold ${statusColor(entry.status)}`}>
                      {entry.status || "ERR"}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[#8a8a8a]">{entry.latencyMs}ms</td>
                    <td className="py-1.5 px-3 font-mono text-red-400 truncate max-w-[160px]">{entry.errorCode || "—"}</td>
                    <td className="py-1.5 px-3 text-[#8a8a8a] truncate max-w-[300px]">{entry.errorMessage || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
