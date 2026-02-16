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

// ─── Domain alignment (open ↔ 50% on same Y pixel) ────────────────────────
function computeDomains(slice: ChartPoint[], btcOpen: number, atr: number | null, atrMultiplier: number, visible: any, padding = 0.18) {
  if (!slice.length)
    return {
      btcDomain: [0, 1] as [number, number],
      polyDomain: [0, 1] as [number, number],
      btcOpen: 0,
    };

  const btcVals = slice.map((d) => d.btc);
  
  // Include ATR levels in domain calculation if they are visible
  if (atr !== null) {
    if (visible.atrPlus) btcVals.push(btcOpen + (atr * atrMultiplier));
    if (visible.atrMinus) btcVals.push(btcOpen - (atr * atrMultiplier));
  }

  const btcMin = Math.min(...btcVals);
  const btcMax = Math.max(...btcVals);

  // To center btcOpen, we find the maximum distance from btcOpen to any point
  const maxDelta = Math.max(Math.abs(btcMax - btcOpen), Math.abs(btcMin - btcOpen));
  
  // Apply padding to the range
  const halfRange = maxDelta * (1 + padding);
  
  const btcLo = btcOpen - halfRange;
  const btcHi = btcOpen + halfRange;

  return {
    btcDomain: [Math.round(btcLo), Math.round(btcHi)] as [number, number],
    polyDomain: [0, 1] as [number, number],
    btcOpen,
  };
}

const MIN_VISIBLE = 6;

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
  const [atrMultiplier, setAtrMultiplier] = useState(0.1);
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

  const N = chartHistory.length;
  const slice = useMemo(
    () => chartHistory.slice(view.lo, view.hi),
    [chartHistory, view]
  );
  
  const btcOpenPrice = useMemo(() => {
    return chartHistory.length > 0 ? chartHistory[0].btc : 0;
  }, [chartHistory]);

  const { btcDomain, polyDomain, btcOpen } = useMemo(
    () => computeDomains(slice, btcOpenPrice, atr, atrMultiplier, visible),
    [slice, btcOpenPrice, atr, atrMultiplier, visible]
  );

  const xTicks = useMemo(() => {
    if (slice.length <= 10) return slice.map((d) => d.time);
    const step = Math.max(1, Math.floor(slice.length / 8));
    return slice.filter((_, i) => i % step === 0).map((d) => d.time);
  }, [slice]);

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

  const poly = data?.polymarket;
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

  const priceToBeat = poly?.priceToBeat ?? null;
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
                  data={slice}
                  margin={{ top: 16, right: 64, left: 64, bottom: 8 }}
                >
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

                  {visible.open && (
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
                  )}

                  {visible.atrPlus && atr !== null && (
                    <ReferenceLine
                      yAxisId="btc"
                      y={btcOpen + (atr * atrMultiplier)}
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

                  {visible.atrMinus && atr !== null && (
                    <ReferenceLine
                      yAxisId="btc"
                      y={btcOpen - (atr * atrMultiplier)}
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

                  <Legend
                    wrapperStyle={{
                      paddingTop: 16,
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 12,
                    }}
                    formatter={(v) => {
                      if (v === "btc" && visible.btc) {
                        return <span style={{ color: "#f7931a" }}>BTC/USD (left, $)</span>;
                      }
                      if (v === "poly" && visible.poly) {
                        return <span style={{ color: "#4ade80" }}>Polymarket UP (right, %)</span>;
                      }
                      return null;
                    }}
                  />
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
          {/* Market Info Card */}
          {poly && (
            <div className={styles.card}>
              <div className={styles.marketQuestion}>
                {poly.question || "Loading market..."}
              </div>
              <div className={styles.marketMeta}>
                <div>
                  <span className={styles.metaLabel}>Market: </span>
                  <span className={styles.metaValue}>{poly.slug || "-"}</span>
                </div>
                <div>
                  <span className={styles.metaLabel}>Time left: </span>
                  <span
                    style={{ color: timeColor(timeLeftMin), fontWeight: 600 }}
                  >
                    {fmtTimeLeft(timeLeftMin)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Data Grid */}
          <div className={styles.grid}>
            {/* Polymarket Card */}
            <div className={styles.card}>
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
              <DataRow
                label="Time left"
                value={fmtTimeLeft(poly?.timeLeftMin ?? null)}
                valueColor={timeColor(poly?.timeLeftMin ?? null)}
              />
            </div>

            {/* Prices Card */}
            <div className={styles.card}>
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
          </div>

          {/* Session Info */}
          <div className={styles.sessionCard}>
            <div className={styles.sessionGroup}>
              <div>
                <span className={styles.sessionLabel}>ET Time: </span>
                <span className={styles.sessionValue}>{etTime}</span>
              </div>
              <div>
                <span className={styles.sessionLabel}>Session: </span>
                <span className={styles.sessionValue}>{session}</span>
              </div>
              {atr !== null && (
                <div>
                  <span className={styles.sessionLabel}>{interval}m ATR: </span>
                  <span className={styles.sessionValue}>${formatNumber(atr, 2)}</span>
                </div>
              )}
            </div>
            <div className={styles.pollingInfo}>Polling every 1s</div>
          </div>

          {/* Chart Controls */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>CHART LAYERS</div>
            <div className={styles.toggleGroup}>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.btc}
                  onChange={() => setVisible(v => ({ ...v, btc: !v.btc }))}
                />
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
                <span className={`${styles.toggleLabel} ${visible.open ? styles.toggleLabelActive : ""}`}>
                  Open Price
                </span>
              </label>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.atrPlus}
                  onChange={() => setVisible(v => ({ ...v, atrPlus: !v.atrPlus }))}
                />
                <span className={`${styles.toggleLabel} ${visible.atrPlus ? styles.toggleLabelActive : ""}`}>
                  Open + ATR
                </span>
              </label>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  className={styles.toggleCheckbox}
                  checked={visible.atrMinus}
                  onChange={() => setVisible(v => ({ ...v, atrMinus: !v.atrMinus }))}
                />
                <span className={`${styles.toggleLabel} ${visible.atrMinus ? styles.toggleLabelActive : ""}`}>
                  Open - ATR
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

          {/* Footer Info */}
          <div className={styles.footer}>
            <span className={styles.footerLabel}>How it works: </span>
            BTC Y-domain is recomputed to keep the open price exactly at the center.
            Polymarket Y-axis is fixed from 0% to 100%.
          </div>
        </aside>

        {error && <div className={styles.errorToast}>Error: {error}</div>}
      </div>
    </div>
  );
}
