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
} from "recharts";
import styles from "./Dashboard.module.css";
import { ApiResponse, ChartPoint } from "./types";
import {
  formatNumber,
  fmtTimeLeft,
  timeColor,
  getBtcSession,
  getEtTime,
} from "./utils";
import { DataRow } from "./DataRow";
import { CustomTooltip } from "./CustomTooltip";
import { MarketHeader } from "./MarketHeader";

// ─── Domain alignment (open ↔ 50% on same Y pixel) ────────────────────────
function computeDomains(slice: ChartPoint[], btcOpen: number, atr: number | null, atrMultiplier: number, visible: any, priceToBeat: number | null, padding = 0.18) {
  if (!slice.length)
    return {
      btcDomain: [0, 1] as [number, number],
      polyDomain: [0, 1] as [number, number],
      btcOpen: 0,
    };

  const center = priceToBeat ?? btcOpen;

  const btcVals = slice.map((d) => d.btc);
  
  // Include ATR levels in domain calculation if they are visible
  if (atr !== null && priceToBeat !== null) {
    if (visible.atrPlus) btcVals.push(priceToBeat + (atr * atrMultiplier));
    if (visible.atrMinus) btcVals.push(priceToBeat - (atr * atrMultiplier));
  }

  const btcMin = Math.min(...btcVals);
  const btcMax = Math.max(...btcVals);

  // Center the Y-domain on priceToBeat (falling back to btcOpen)
  const maxDelta = Math.max(Math.abs(btcMax - center), Math.abs(btcMin - center));
  
  // Apply padding to the range
  const halfRange = maxDelta * (1 + padding);
  
  const btcLo = center - halfRange;
  const btcHi = center + halfRange;

  return {
    btcDomain: [Math.round(btcLo), Math.round(btcHi)] as [number, number],
    polyDomain: [0, 1] as [number, number],
    btcOpen,
  };
}

const MIN_VISIBLE = 6;
const INTERP_DURATION = 800; // ms – smooth transition between data points

interface DashboardProps {
  interval?: number;
}

export default function Dashboard({ interval = 15 }: DashboardProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [prevBtcPrice, setPrevBtcPrice] = useState<number | null>(null);
  const [chartHistory, setChartHistory] = useState<ChartPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [etTime, setEtTime] = useState("--:--:--");
  const [session, setSession] = useState("--");
  const [atr, setAtr] = useState<number | null>(null);
  const [atrMultiplier, setAtrMultiplier] = useState(0.5);
  const [visible, setVisible] = useState({
    btc: true,
    poly: true,
    open: true,
    atrPlus: true,
    atrMinus: true,
  });
  const prevMarketSlug = useRef<string | null>(null);

  // ── Zoom/Pan State ──
  const [view, setView] = useState({ lo: 0, hi: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startLo: number;
    startHi: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Smooth interpolation state for the latest data point ──
  const prevChartLenRef = useRef(0);
  const animStateRef = useRef<{
    fromBtc: number;
    fromPoly: number;
    toBtc: number;
    toPoly: number;
    fromIdx: number;
    toIdx: number;
    startTime: number;
  } | null>(null);
  const interpolatedRef = useRef<{ btc: number; poly: number; idx: number } | null>(null);
  const rafRef = useRef<number>(0);
  const [interpolated, setInterpolated] = useState<{
    btc: number;
    poly: number;
    idx: number;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/btc/${interval}/data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData((prev) => {
        if (prev?.btcPrice) setPrevBtcPrice(prev.btcPrice);
        if (json.atr !== undefined) setAtr(json.atr);
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

          if (
            baseHistory.length === 0 &&
            json.history &&
            json.history.length > 0
          ) {
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
          setView((v) => {
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
  }, [interval]);

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

  // ── Detect new data points → kick off smooth animation ──
  useEffect(() => {
    const len = chartHistory.length;
    if (len >= 2 && len !== prevChartLenRef.current) {
      const to = chartHistory[len - 1];
      const from = interpolatedRef.current ?? chartHistory[len - 2];
      animStateRef.current = {
        fromBtc: from.btc,
        fromPoly: from.poly,
        fromIdx: from.idx,
        toBtc: to.btc,
        toPoly: to.poly,
        toIdx: to.idx,
        startTime: performance.now(),
      };
    }
    prevChartLenRef.current = len;
  }, [chartHistory]);

  // ── requestAnimationFrame loop for smooth interpolation ──
  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      const a = animStateRef.current;
      if (a) {
        const t = Math.min(
          1,
          (performance.now() - a.startTime) / INTERP_DURATION
        );
        const e = 1 - (1 - t) * (1 - t) * (1 - t); // easeOutCubic
        const val = {
          btc: a.fromBtc + (a.toBtc - a.fromBtc) * e,
          poly: a.fromPoly + (a.toPoly - a.fromPoly) * e,
          idx: a.fromIdx + (a.toIdx - a.fromIdx) * e,
        };
        interpolatedRef.current = val;
        setInterpolated(val);
        if (t >= 1) animStateRef.current = null;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const N = chartHistory.length;
  const slice = useMemo(
    () => chartHistory.slice(view.lo, view.hi),
    [chartHistory, view]
  );
  
  const poly = data?.polymarket;
  const priceToBeat = poly?.priceToBeat ?? null;

  const btcOpenPrice = useMemo(() => {
    return chartHistory.length > 0 ? chartHistory[0].btc : 0;
  }, [chartHistory]);

  const { btcDomain, polyDomain, btcOpen } = useMemo(
    () => computeDomains(slice, btcOpenPrice, atr, atrMultiplier, visible, priceToBeat),
    [slice, btcOpenPrice, atr, atrMultiplier, visible, priceToBeat]
  );

  const xTicks = useMemo(() => {
    if (slice.length <= 10) return slice.map((d) => d.idx);
    const step = Math.max(1, Math.floor(slice.length / 8));
    return slice.filter((_, i) => i % step === 0).map((d) => d.idx);
  }, [slice]);

  // ── Smoothed slice: replaces the last point with its interpolated value ──
  const displaySlice = useMemo(() => {
    if (!slice.length || !interpolated || view.hi < chartHistory.length)
      return slice;
    const out = slice.slice();
    out[out.length - 1] = {
      ...out[out.length - 1],
      btc: interpolated.btc,
      poly: interpolated.poly,
      idx: interpolated.idx,
    };
    return out;
  }, [slice, interpolated, view.hi, chartHistory.length]);

  const xDomain = useMemo(() => {
    if (!displaySlice.length) return [0, 0];
    const first = displaySlice[0].idx;
    const last = displaySlice[displaySlice.length - 1].idx;
    return [first, last];
  }, [displaySlice]);

  const tickStyle = {
    fill: "#555",
    fontSize: 11,
    fontFamily: "JetBrains Mono, monospace",
  };

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
    [view]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current) return;
      const delta = pxToCandles(dragRef.current.startX - e.clientX, {
        lo: dragRef.current.startLo,
        hi: dragRef.current.startHi,
      });
      const size = dragRef.current.startHi - dragRef.current.startLo;
      setView(
        clamp(
          dragRef.current.startLo + delta,
          dragRef.current.startLo + delta + size
        )
      );
    },
    [N]
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
        const cursorFrac = rect
          ? Math.max(0, Math.min(1, (e.clientX - rect.left - 64) / chartWidth()))
          : 0.5;

        const anchorIdx = prev.lo + Math.round(cursorFrac * visible);
        const newLo = Math.round(anchorIdx - cursorFrac * newVisible);
        return clamp(newLo, newLo + newVisible);
      });
    },
    [N]
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

  const btcPrice = data?.btcPrice ?? null;
  const timeLeftMin = data?.timeLeftMin ?? null;

  const btcPriceDelta =
    btcPrice !== null && prevBtcPrice !== null ? btcPrice - prevBtcPrice : null;
  const btcPriceDirection =
    btcPriceDelta === null
      ? null
      : btcPriceDelta > 0
      ? "up"
      : btcPriceDelta < 0
      ? "down"
      : null;

  const ptbDelta =
    btcPrice !== null && priceToBeat !== null ? btcPrice - priceToBeat : null;

  return (
    <div className={styles.container}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.btcTitle}>BTC/USD</span>
          <span className={styles.polyTitle}>× Polymarket UP</span>

          <span className={styles.pointCounter}>
            {view.hi - view.lo} / {N} points
          </span>

          <div className={styles.headerRight}>
            {isZoomed && (
              <button onClick={resetZoom} className={styles.resetButton}>
                ⟳ reset
              </button>
            )}
            <span className={styles.timeInfo}>{interval}m · today</span>
          </div>
        </div>
      </header>

      <div className={styles.inner}>
        {/* ── Main Content (Plot) ── */}
        <main className={styles.mainContent}>
          <MarketHeader
            title={poly?.question?.split(" - ")[0] || "Bitcoin Up or Down"}
            dateStr={`${new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}, ${interval}M-${poly?.slug?.split("-").pop() || ""} ET`}
            priceToBeat={priceToBeat}
            currentPrice={btcPrice}
            prevPrice={prevBtcPrice}
            timeLeftMin={timeLeftMin}
          />
          <div
            ref={wrapRef}
            className={`${styles.chartWrapper} ${
              isDragging ? styles.chartDragging : styles.chartNormal
            }`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {chartHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={displaySlice}
                  margin={{ top: 16, right: 64, left: 64, bottom: 8 }}
                >
                  <CartesianGrid stroke="#141420" vertical={false} />

                  <XAxis
                    dataKey="idx"
                    type="number"
                    domain={xDomain}
                    ticks={xTicks}
                    tick={(props: any) => {
                      const { x, y, payload } = props;
                      const point = slice.find((d) => Math.abs(d.idx - payload.value) < 0.1);
                      return (
                        <text
                          x={x}
                          y={y + 12}
                          fill={tickStyle.fill}
                          fontSize={tickStyle.fontSize}
                          fontFamily={tickStyle.fontFamily}
                          textAnchor="middle"
                        >
                          {point ? point.time : ""}
                        </text>
                      );
                    }}
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

                  {visible.open && priceToBeat !== null && (
                    <ReferenceLine
                      yAxisId="btc"
                      y={priceToBeat}
                      stroke="#ffffff"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      strokeOpacity={0.8}
                      label={{
                        // value: "price to beat",
                        position: "insideLeft",
                        fill: "#ffffff",
                        fontSize: 10,
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 600,
                      }}
                    />
                  )}

                  {visible.atrPlus && atr !== null && priceToBeat !== null && (
                    <ReferenceLine
                      yAxisId="btc"
                      y={priceToBeat + (atr * atrMultiplier)}
                      stroke="#f7931a"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                      strokeOpacity={0.4}
                      label={{
                        value: `+${atrMultiplier} ATR`,
                        position: "insideRight",
                        fill: "#f7931a",
                        fontSize: 9,
                        fontFamily: "JetBrains Mono, monospace",
                        fillOpacity: 0.4,
                      }}
                    />
                  )}

                  {visible.atrMinus && atr !== null && priceToBeat !== null && (
                    <ReferenceLine
                      yAxisId="btc"
                      y={priceToBeat - (atr * atrMultiplier)}
                      stroke="#f7931a"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                      strokeOpacity={0.4}
                      label={{
                        value: `-${atrMultiplier} ATR`,
                        position: "insideRight",
                        fill: "#f7931a",
                        fontSize: 9,
                        fontFamily: "JetBrains Mono, monospace",
                        fillOpacity: 0.4,
                      }}
                    />
                  )}

                  {!isDragging && <Tooltip content={<CustomTooltip />} />}

                  {visible.btc && (
                    <Line
                      yAxisId="btc"
                      type="monotone"
                      dataKey="btc"
                      stroke="#f7931a"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      activeDot={{
                        r: 4,
                        fill: "#f7931a",
                        stroke: "#0a0a10",
                        strokeWidth: 2,
                      }}
                    />
                  )}

                  {visible.poly && (
                    <Line
                      yAxisId="poly"
                      type="monotone"
                      dataKey="poly"
                      stroke="#4ade80"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      activeDot={{
                        r: 4,
                        fill: "#4ade80",
                        stroke: "#0a0a10",
                        strokeWidth: 2,
                      }}
                    />
                  )}

                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.noData}>
                Collecting data points for chart...
              </div>
            )}
          </div>

          <div className={styles.scrollbar}>
            <div
              className={styles.scrollbarThumb}
              style={{
                left: `${(view.lo / Math.max(1, N)) * 100}%`,
                width: `${((view.hi - view.lo) / Math.max(1, N)) * 100}%`,
                transition: isDragging ? "none" : "left .08s, width .08s",
              }}
            />
          </div>
        </main>

        {/* ── Sidebar ── */}
        <aside className={styles.sidebar}>
          {/* Polymarket Section */}
          <div className={styles.section}>
            <div className={styles.cardTitle}>POLYMARKET</div>
            <div className={styles.statGroup}>
              <div>
                <div className={styles.statLabel}>UP</div>
                <div className={styles.statValue} style={{ color: "#4ade80" }}>
                  {poly?.upPrice !== null && poly?.upPrice !== undefined
                    ? `${(poly.upPrice * 100).toFixed(1)}c`
                    : "-"}
                </div>
              </div>
              <div>
                <div className={styles.statLabel}>DOWN</div>
                <div className={styles.statValue} style={{ color: "#f87171" }}>
                  {poly?.downPrice !== null && poly?.downPrice !== undefined
                    ? `${(poly.downPrice * 100).toFixed(1)}c`
                    : "-"}
                </div>
              </div>
            </div>
            <DataRow
              label="Liquidity"
              value={poly?.liquidity ? formatNumber(poly.liquidity, 0) : "-"}
            />
          </div>

          {/* Prices Section */}
          <div className={styles.section}>
            <div className={styles.cardTitle}>PRICES</div>
            <div style={{ marginBottom: 12 }}>
              <div className={styles.btcLabel}>BTC (Binance)</div>
              <div className={styles.btcValueContainer}>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color:
                      btcPriceDirection === "up"
                        ? "#4ade80"
                        : btcPriceDirection === "down"
                        ? "#f87171"
                        : "#fff",
                  }}
                >
                  ${formatNumber(btcPrice, 2)}
                  {btcPriceDirection === "up" && " ↑"}
                  {btcPriceDirection === "down" && " ↓"}
                </span>
              </div>
            </div>
            <DataRow
              label="Price to Beat"
              value={priceToBeat !== null ? `$${formatNumber(priceToBeat, 2)}` : "-"}
            />
            <DataRow
              label="Delta"
              value={
                ptbDelta !== null ? `${ptbDelta > 0 ? "+" : ""}$${ptbDelta.toFixed(2)}` : "-"
              }
              valueColor={
                ptbDelta === null
                  ? "#50506a"
                  : ptbDelta > 0
                  ? "#4ade80"
                  : ptbDelta < 0
                  ? "#f87171"
                  : "#50506a"
              }
            />
          </div>

          {/* Chart Controls Section */}
          <div className={styles.section}>
            <div className={styles.cardTitle}>CHART LAYERS</div>
            <div className={styles.toggleGroup}>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.btc}
                  onChange={() => setVisible(v => ({ ...v, btc: !v.btc }))}
                />
                <svg width="24" height="12" className={styles.legendSwatch}>
                  <line x1="0" y1="6" x2="24" y2="6" stroke="#f7931a" strokeWidth="2" />
                </svg>
                <span className={`${styles.toggleLabel} ${visible.btc ? styles.toggleLabelActive : ""}`}>
                  BTC Price
                </span>
              </label>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.poly}
                  onChange={() => setVisible(v => ({ ...v, poly: !v.poly }))}
                />
                <svg width="24" height="12" className={styles.legendSwatch}>
                  <line x1="0" y1="6" x2="24" y2="6" stroke="#4ade80" strokeWidth="2" />
                </svg>
                <span className={`${styles.toggleLabel} ${visible.poly ? styles.toggleLabelActive : ""}`}>
                  Polymarket %
                </span>
              </label>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.open}
                  onChange={() => setVisible(v => ({ ...v, open: !v.open }))}
                />
                <svg width="24" height="12" className={styles.legendSwatch}>
                  <line x1="0" y1="6" x2="24" y2="6" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="5 4" strokeOpacity="0.8" />
                </svg>
                <span className={`${styles.toggleLabel} ${visible.open ? styles.toggleLabelActive : ""}`}>
                  Price to Beat
                </span>
              </label>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.atrPlus}
                  onChange={() => setVisible(v => ({ ...v, atrPlus: !v.atrPlus }))}
                />
                <svg width="24" height="12" className={styles.legendSwatch}>
                  <line x1="0" y1="6" x2="24" y2="6" stroke="#f7931a" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.4" />
                </svg>
                <span className={`${styles.toggleLabel} ${visible.atrPlus ? styles.toggleLabelActive : ""}`}>
                  PTB + ATR
                </span>
              </label>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.atrMinus}
                  onChange={() => setVisible(v => ({ ...v, atrMinus: !v.atrMinus }))}
                />
                <svg width="24" height="12" className={styles.legendSwatch}>
                  <line x1="0" y1="6" x2="24" y2="6" stroke="#f7931a" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.4" />
                </svg>
                <span className={`${styles.toggleLabel} ${visible.atrMinus ? styles.toggleLabelActive : ""}`}>
                  PTB - ATR
                </span>
              </label>
            </div>

            <div className={styles.multiplierContainer}>
              <div className={styles.multiplierLabel}>ATR Multiplier</div>
              <input
                type="number"
                step="0.05"
                min="0"
                className={styles.multiplierInput}
                value={atrMultiplier}
                onChange={(e) => setAtrMultiplier(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </aside>

        {error && <div className={styles.errorToast}>Error: {error}</div>}
      </div>
    </div>
  );
}
