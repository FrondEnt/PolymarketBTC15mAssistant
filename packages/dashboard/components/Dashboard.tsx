"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface PolymarketData {
  question: string | null;
  slug: string | null;
  endDate: string | null;
  eventStartTime: string | null;
  upPrice: number | null;
  downPrice: number | null;
  liquidity: number | null;
  priceToBeat: number | null;
  timeLeftMin: number | null;
}

interface HistoryPoint {
  timeMs: number;
  btc: number;
  poly: number | null;
}

interface ApiResponse {
  timestamp: string;
  btcPrice: number | null;
  polymarket: PolymarketData;
  timeLeftMin: number | null;
  history: HistoryPoint[];
}

interface ChartPoint {
  time: string;
  btc: number;
  poly: number;
  idx: number;
}

function formatNumber(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(x);
}

function fmtTimeLeft(mins: number | null): string {
  if (mins === null || mins === undefined) return "--:--";
  const totalSeconds = Math.max(0, Math.floor(mins * 60));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function timeColor(mins: number | null): string {
  if (mins === null) return "#50506a";
  if (mins >= 10) return "#4ade80";
  if (mins >= 5) return "#facc15";
  return "#f87171";
}

function getBtcSession(): string {
  const h = new Date().getUTCHours();
  const inAsia = h >= 0 && h < 8;
  const inEurope = h >= 7 && h < 16;
  const inUs = h >= 13 && h < 22;
  if (inEurope && inUs) return "Europe/US overlap";
  if (inAsia && inEurope) return "Asia/Europe overlap";
  if (inAsia) return "Asia";
  if (inEurope) return "Europe";
  if (inUs) return "US";
  return "Off-hours";
}

function getEtTime(): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return "-";
  }
}

// ─── Domain alignment (open ↔ 50% on same Y pixel) ────────────────────────
function computeDomains(slice: ChartPoint[], padding = 0.18) {
  if (!slice.length) return { btcDomain: [0, 1] as [number, number], polyDomain: [0, 1] as [number, number], btcOpen: 0 };

  const btcOpen = slice[0].btc;
  const polyAnchor = 0.5;

  const btcVals = slice.map((d) => d.btc);
  const polyVals = slice.map((d) => d.poly);

  const btcMin = Math.min(...btcVals);
  const btcMax = Math.max(...btcVals);
  const polyMin = Math.min(...polyVals);
  const polyMax = Math.max(...polyVals);

  const btcRange = Math.max(btcMax - btcMin, 1);
  const polyRange = Math.max(polyMax - polyMin, 0.001);

  const btcLo = btcMin - btcRange * padding;
  const btcHi = btcMax + btcRange * padding;
  const polyHi = polyMax + polyRange * padding;

  const btcFrac = (btcOpen - btcLo) / (btcHi - btcLo);
  const polyLoAligned = (polyAnchor - btcFrac * polyHi) / (1 - btcFrac);

  return {
    btcDomain: [Math.round(btcLo), Math.round(btcHi)] as [number, number],
    polyDomain: [Math.min(polyLoAligned, polyMin - polyRange * padding), polyHi] as [number, number],
    btcOpen,
  };
}

// ─── Tooltip ───────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const btc = payload.find((p: any) => p.dataKey === "btc");
  const poly = payload.find((p: any) => p.dataKey === "poly");
  return (
    <div
      style={{
        background: "#0f0f14",
        border: "1px solid #2a2a3a",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        lineHeight: 1.8,
        boxShadow: "0 8px 32px rgba(0,0,0,.6)",
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
      {btc && (
        <div style={{ color: "#f7931a" }}>
          BTC <span style={{ color: "#fff" }}>${btc.value?.toLocaleString()}</span>
        </div>
      )}
      {poly && (
        <div style={{ color: "#4ade80" }}>
          UP <span style={{ color: "#fff" }}>{(poly.value * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
};

const MIN_VISIBLE = 6;

export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [prevBtcPrice, setPrevBtcPrice] = useState<number | null>(null);
  const [chartHistory, setChartHistory] = useState<ChartPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [etTime, setEtTime] = useState("--:--:--");
  const [session, setSession] = useState("--");
  const prevMarketSlug = useRef<string | null>(null);

  // ── Zoom/Pan State ──
  const [view, setView] = useState({ lo: 0, hi: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startLo: number; startHi: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData((prev) => {
        if (prev?.btcPrice) setPrevBtcPrice(prev.btcPrice);
        return json;
      });

      if (json.btcPrice !== null && json.polymarket.upPrice !== null) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });

        setChartHistory((prev) => {
          const currentSlug = json.polymarket.slug;
          let baseHistory = prev;

          if (prevMarketSlug.current && currentSlug !== prevMarketSlug.current) {
            baseHistory = [];
          }
          prevMarketSlug.current = currentSlug;

          if (baseHistory.length === 0 && json.history && json.history.length > 0) {
            baseHistory = json.history
              .filter((h) => h.poly !== null)
              .map((h, i) => ({
                time: new Date(h.timeMs).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                }),
                btc: h.btc,
                poly: h.poly!,
                idx: i,
              }));
          }

          const newPoint: ChartPoint = {
            time: timeStr,
            btc: json.btcPrice!,
            poly: json.polymarket.upPrice!,
            idx: baseHistory.length,
          };

          const updated = [...baseHistory, newPoint];
          const final = updated.length > 500 ? updated.slice(-500) : updated;
          
          // Reset view if it was at the end or uninitialized
          setView(v => {
            if (v.hi === 0 || v.hi === baseHistory.length) {
              return { lo: 0, hi: final.length };
            }
            return v;
          });
          
          return final;
        });
      }

      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    setEtTime(getEtTime());
    setSession(getBtcSession());
    const interval = setInterval(() => {
      setEtTime(getEtTime());
      setSession(getBtcSession());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const N = chartHistory.length;
  const slice = useMemo(() => chartHistory.slice(view.lo, view.hi), [chartHistory, view]);
  const { btcDomain, polyDomain, btcOpen } = useMemo(() => computeDomains(slice), [slice]);

  const xTicks = useMemo(() => {
    if (slice.length <= 10) return slice.map((d) => d.time);
    const step = Math.max(1, Math.floor(slice.length / 8));
    return slice.filter((_, i) => i % step === 0).map((d) => d.time);
  }, [slice]);

  const tickStyle = { fill: "#555", fontSize: 11, fontFamily: "JetBrains Mono, monospace" };

  // ── helpers ───────────────────────────────────────────────────────────────
  const chartWidth = () => (wrapRef.current?.clientWidth ?? 800) - 128;

  const pxToCandles = (dx: number, currentView: { lo: number; hi: number }) => {
    const visible = currentView.hi - currentView.lo;
    return Math.round((dx / chartWidth()) * visible);
  };

  const clamp = (lo: number, hi: number) => {
    const size = hi - lo;
    const newLo = Math.max(0, Math.min(N - size, lo));
    return { lo: newLo, hi: newLo + size };
  };

  // ── pan (drag) ────────────────────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { startX: e.clientX, startLo: view.lo, startHi: view.hi };
      setIsDragging(true);
    },
    [view],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current) return;
      const delta = pxToCandles(dragRef.current.startX - e.clientX, {
        lo: dragRef.current.startLo,
        hi: dragRef.current.startHi,
      });
      const size = dragRef.current.startHi - dragRef.current.startLo;
      setView(clamp(dragRef.current.startLo + delta, dragRef.current.startLo + delta + size));
    },
    [N],
  );

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  // ── zoom (scroll wheel) ───────────────────────────────────────────────────
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      setView((prev) => {
        const visible = prev.hi - prev.lo;
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        let newVisible = Math.round(visible * factor);
        newVisible = Math.max(MIN_VISIBLE, Math.min(N, newVisible));

        const rect = wrapRef.current?.getBoundingClientRect();
        const cursorFrac = rect ? Math.max(0, Math.min(1, (e.clientX - rect.left - 64) / chartWidth())) : 0.5;

        const anchorIdx = prev.lo + Math.round(cursorFrac * visible);
        const newLo = Math.round(anchorIdx - cursorFrac * newVisible);
        return clamp(newLo, newLo + newVisible);
      });
    },
    [N],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  useEffect(() => {
    if (!isDragging) return;
    const up = () => {
      dragRef.current = null;
      setIsDragging(false);
    };
    globalThis.addEventListener("mouseup", up);
    return () => globalThis.removeEventListener("mouseup", up);
  }, [isDragging]);

  const resetZoom = () => setView({ lo: 0, hi: N });
  const isZoomed = N > 0 && (view.lo !== 0 || view.hi !== N);

  const poly = data?.polymarket;
  const btcPrice = data?.btcPrice ?? null;
  const timeLeftMin = data?.timeLeftMin ?? null;

  const btcPriceDelta = btcPrice !== null && prevBtcPrice !== null ? btcPrice - prevBtcPrice : null;
  const btcPriceDirection = btcPriceDelta === null ? null : btcPriceDelta > 0 ? "up" : btcPriceDelta < 0 ? "down" : null;

  const priceToBeat = poly?.priceToBeat ?? null;
  const ptbDelta = btcPrice !== null && priceToBeat !== null ? btcPrice - priceToBeat : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a10",
        padding: "24px 16px",
        fontFamily: "'JetBrains Mono', monospace",
        color: "#fff",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>

      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ color: "#f7931a", fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>BTC/USD</span>
            <span style={{ color: "#4ade80", fontSize: 18, fontWeight: 600 }}>× Polymarket UP</span>

            {/* candle counter */}
            <span
              style={{
                fontSize: 10,
                color: "#444",
                background: "#111",
                border: "1px solid #1e1e2e",
                borderRadius: 4,
                padding: "2px 8px",
              }}
            >
              {view.hi - view.lo} / {N} points
            </span>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {isZoomed && (
                <button
                  onClick={resetZoom}
                  style={{
                    background: "none",
                    border: "1px solid #2a2a3a",
                    borderRadius: 4,
                    color: "#555",
                    fontFamily: "inherit",
                    fontSize: 11,
                    padding: "3px 10px",
                    cursor: "pointer",
                  }}
                >
                  ⟳ reset
                </button>
              )}
              <span style={{ color: "#2a2a3a", fontSize: 12 }}>15m · today</span>
            </div>
          </div>
          <div style={{ color: "#252535", fontSize: 10, letterSpacing: 1.5 }}>
            SCROLL TO ZOOM · DRAG TO PAN · OPEN ↔ 50% ANCHORED
          </div>
        </div>

        {/* Market Info Card */}
        {poly && (
          <div
            style={{
              background: "#0d0d16",
              border: "1px solid #161622",
              borderRadius: 8,
              padding: "16px 20px",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginBottom: 8 }}>
              {poly.question || "Loading market..."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 32px", fontSize: 12 }}>
              <div>
                <span style={{ color: "#50506a" }}>Market: </span>
                <span style={{ color: "#888" }}>{poly.slug || "-"}</span>
              </div>
              <div>
                <span style={{ color: "#50506a" }}>Time left: </span>
                <span style={{ color: timeColor(timeLeftMin), fontWeight: 600 }}>{fmtTimeLeft(timeLeftMin)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Chart ── */}
        <div
          ref={wrapRef}
          style={{
            width: "100%",
            background: "#0d0d16",
            border: "1px solid #161622",
            borderRadius: 8,
            padding: "20px 8px 12px",
            marginBottom: 6,
            cursor: isDragging ? "grabbing" : "crosshair",
            userSelect: "none",
            position: "relative",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {chartHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={420}>
              <ComposedChart data={slice} margin={{ top: 16, right: 64, left: 64, bottom: 8 }}>
                <CartesianGrid stroke="#141420" vertical={false} />

                <XAxis
                  dataKey="time"
                  ticks={xTicks}
                  tick={tickStyle}
                  axisLine={{ stroke: "#1e1e2e" }}
                  tickLine={false}
                />

                <YAxis
                  yAxisId="btc"
                  orientation="left"
                  domain={btcDomain}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />

                <YAxis
                  yAxisId="poly"
                  orientation="right"
                  domain={polyDomain}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />

                {/* Shared anchor baseline */}
                <ReferenceLine
                  yAxisId="btc"
                  y={btcOpen}
                  stroke="#1e1e30"
                  strokeDasharray="5 4"
                  strokeWidth={1}
                  label={{
                    value: "open / 50%",
                    position: "insideLeft",
                    fill: "#2e2e48",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                />

                {!isDragging && <Tooltip content={<CustomTooltip />} />}

                <Line
                  yAxisId="btc"
                  type="monotone"
                  dataKey="btc"
                  stroke="#f7931a"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: "#f7931a", stroke: "#0a0a10", strokeWidth: 2 }}
                />

                <Line
                  yAxisId="poly"
                  type="monotone"
                  dataKey="poly"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: "#4ade80", stroke: "#0a0a10", strokeWidth: 2 }}
                />

                <Legend
                  wrapperStyle={{ paddingTop: 16, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}
                  formatter={(v) =>
                    v === "btc" ? (
                      <span style={{ color: "#f7931a" }}>BTC/USD (left, $)</span>
                    ) : (
                      <span style={{ color: "#4ade80" }}>Polymarket UP (right, %)</span>
                    )
                  }
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div
              style={{
                height: 420,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#50506a",
                fontSize: 14,
              }}
            >
              Collecting data points for chart...
            </div>
          )}
        </div>

        {/* ── Mini scrollbar ── */}
        <div
          style={{
            width: "100%",
            marginBottom: 16,
            position: "relative",
            height: 3,
            borderRadius: 2,
            background: "#111",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              height: "100%",
              borderRadius: 2,
              background: "#2a2a40",
              left: `${(view.lo / Math.max(1, N)) * 100}%`,
              width: `${((view.hi - view.lo) / Math.max(1, N)) * 100}%`,
              transition: isDragging ? "none" : "left .08s, width .08s",
            }}
          />
        </div>

        {/* Data Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Polymarket Card */}
          <div
            style={{
              background: "#0d0d16",
              border: "1px solid #161622",
              borderRadius: 8,
              padding: "16px 20px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>POLYMARKET</div>
            <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#50506a", marginBottom: 2 }}>UP</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#4ade80" }}>
                  {poly?.upPrice !== null && poly?.upPrice !== undefined ? `${(poly.upPrice * 100).toFixed(1)}c` : "-"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#50506a", marginBottom: 2 }}>DOWN</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#f87171" }}>
                  {poly?.downPrice !== null && poly?.downPrice !== undefined
                    ? `${(poly.downPrice * 100).toFixed(1)}c`
                    : "-"}
                </div>
              </div>
            </div>
            <DataRow label="Liquidity" value={poly?.liquidity ? formatNumber(poly.liquidity, 0) : "-"} />
            <DataRow
              label="Time left"
              value={fmtTimeLeft(poly?.timeLeftMin ?? null)}
              valueColor={timeColor(poly?.timeLeftMin ?? null)}
            />
          </div>

          {/* Prices Card */}
          <div
            style={{
              background: "#0d0d16",
              border: "1px solid #161622",
              borderRadius: 8,
              padding: "16px 20px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>PRICES</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#50506a", marginBottom: 2 }}>BTC (Binance)</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color:
                      btcPriceDirection === "up" ? "#4ade80" : btcPriceDirection === "down" ? "#f87171" : "#fff",
                  }}
                >
                  ${formatNumber(btcPrice, 2)}
                  {btcPriceDirection === "up" && " ↑"}
                  {btcPriceDirection === "down" && " ↓"}
                </span>
              </div>
            </div>
            <DataRow label="Price to Beat" value={priceToBeat !== null ? `$${formatNumber(priceToBeat, 2)}` : "-"} />
            <DataRow
              label="Delta"
              value={ptbDelta !== null ? `${ptbDelta > 0 ? "+" : ""}$${ptbDelta.toFixed(2)}` : "-"}
              valueColor={ptbDelta === null ? "#50506a" : ptbDelta > 0 ? "#4ade80" : ptbDelta < 0 ? "#f87171" : "#50506a"}
            />
          </div>
        </div>

        {/* Session Info */}
        <div
          style={{
            background: "#0d0d16",
            border: "1px solid #161622",
            borderRadius: 8,
            padding: "12px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <span style={{ color: "#50506a", fontSize: 11 }}>ET Time: </span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{etTime}</span>
            </div>
            <div>
              <span style={{ color: "#50506a", fontSize: 11 }}>Session: </span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{session}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#50506a" }}>Polling every 1s</div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#0d0d16",
            border: "1px solid #161622",
            borderRadius: 8,
            fontSize: 11,
            color: "#383848",
            lineHeight: 1.9,
          }}
        >
          <span style={{ color: "#50506a" }}>How it works: </span>
          both Y-domains are recomputed on every pan/zoom so BTC open and Polymarket 50% stay on the same horizontal
          line at all zoom levels.
          <span style={{ color: "#2a2a3a" }}> · isAnimationActive=false keeps panning smooth.</span>
        </div>

        {error && (
          <div
            style={{
              position: "fixed",
              bottom: 16,
              right: 16,
              background: "#1a0a0a",
              border: "1px solid #3a1a1a",
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: 12,
              color: "#f87171",
              maxWidth: 400,
            }}
          >
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
}

function DataRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
      <span style={{ color: "#50506a" }}>{label}</span>
      <span style={{ color: valueColor || "#888", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
