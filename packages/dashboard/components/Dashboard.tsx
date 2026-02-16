"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

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

interface ApiResponse {
  timestamp: string;
  btcPrice: number | null;
  polymarket: PolymarketData;
  timeLeftMin: number | null;
  klines: Array<{ time: string; close: number | null; volume: number | null }>;
}

interface ChartPoint {
  time: string;
  btc: number;
  poly: number;
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
  if (mins === null) return "var(--text-dim)";
  if (mins >= 10) return "var(--green)";
  if (mins >= 5) return "var(--yellow)";
  return "var(--red)";
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
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(new Date());
  } catch { return "-"; }
}

function computeDomains(data: ChartPoint[], padding = 0.15) {
  if (!data.length) return { btcDomain: [0, 1] as [number, number], polyDomain: [0, 1] as [number, number], btcOpen: 0 };

  const btcOpen = data[0].btc;
  const polyAnchor = 0.5;

  const btcVals = data.map((d) => d.btc);
  const polyVals = data.map((d) => d.poly);

  const btcMin = Math.min(...btcVals);
  const btcMax = Math.max(...btcVals);
  const polyMin = Math.min(...polyVals);
  const polyMax = Math.max(...polyVals);

  const btcRange = btcMax - btcMin || 100;
  const polyRange = polyMax - polyMin || 0.1;

  const btcLo = btcMin - btcRange * padding;
  const btcHi = btcMax + btcRange * padding;
  const polyLo = polyMin - polyRange * padding;
  const polyHi = polyMax + polyRange * padding;

  const btcFrac = (btcOpen - btcLo) / (btcHi - btcLo);

  const polyLoAligned = (polyAnchor - btcFrac * polyHi) / (1 - btcFrac);
  const polyHiAligned = (polyAnchor - polyLoAligned) / btcFrac + polyLoAligned;

  return {
    btcDomain: [Math.round(btcLo), Math.round(btcHi)] as [number, number],
    polyDomain: [
      Math.min(polyLoAligned, polyLo),
      Math.max(polyHiAligned, polyHi),
    ] as [number, number],
    btcOpen,
  };
}


export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [prevBtcPrice, setPrevBtcPrice] = useState<number | null>(null);
  const [chartHistory, setChartHistory] = useState<ChartPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [etTime, setEtTime] = useState("--:--:--");
  const [session, setSession] = useState("--");
  const prevMarketSlug = useRef<string | null>(null);

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
        const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
        const point: ChartPoint = {
          time: timeStr,
          btc: json.btcPrice,
          poly: json.polymarket.upPrice,
        };

        setChartHistory((prev) => {
          const currentSlug = json.polymarket.slug;
          if (prevMarketSlug.current && currentSlug !== prevMarketSlug.current) {
            prevMarketSlug.current = currentSlug;
            return [point];
          }
          prevMarketSlug.current = currentSlug;

          const updated = [...prev, point];
          if (updated.length > 200) return updated.slice(-200);
          return updated;
        });
      }

      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
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

  const { btcDomain, polyDomain, btcOpen } = useMemo(() => computeDomains(chartHistory), [chartHistory]);

  const xTicks = useMemo(() => {
    if (chartHistory.length <= 12) return chartHistory.map((d) => d.time);
    const step = Math.max(1, Math.floor(chartHistory.length / 10));
    return chartHistory.filter((_, i) => i % step === 0).map((d) => d.time);
  }, [chartHistory]);

  const chartSeries = useMemo(() => {
    const btcData = chartHistory.map((point, idx) => ({ x: idx, y: point.btc }));
    const polyData = chartHistory.map((point, idx) => ({ x: idx, y: point.poly * 100 })); // Convert to percentage
    
    return [
      { name: "BTC/USD", data: btcData, type: "line" as const },
      { name: "Polymarket UP", data: polyData, type: "line" as const },
    ];
  }, [chartHistory]);

  const chartOptions: ApexOptions = useMemo(() => ({
    chart: {
      type: "line",
      background: "transparent",
      foreColor: "#555",
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
        autoSelected: "pan",
      },
      zoom: {
        enabled: true,
        type: "xy",
        autoScaleYaxis: false,
      },
      animations: {
        enabled: false,
      },
    },
    colors: ["#f7931a", "#4ade80"],
    stroke: {
      width: 2,
      curve: "straight",
    },
    grid: {
      borderColor: "#1a1a24",
      strokeDashArray: 0,
      xaxis: {
        lines: { show: false },
      },
    },
    xaxis: {
      type: "category",
      categories: chartHistory.map((d) => d.time),
      tickAmount: 10,
      labels: {
        style: {
          colors: "#555",
          fontSize: "11px",
        },
      },
      axisBorder: {
        color: "#222",
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: [
      {
        seriesName: "BTC/USD",
        title: {
          text: "BTC Price ($)",
          style: {
            color: "#f7931a",
            fontSize: "11px",
          },
        },
        min: btcDomain[0],
        max: btcDomain[1],
        labels: {
          style: {
            colors: "#555",
            fontSize: "11px",
          },
          formatter: (value: number) => `$${(value / 1000).toFixed(1)}k`,
        },
        axisBorder: {
          show: false,
        },
      },
      {
        seriesName: "Polymarket UP",
        opposite: true,
        title: {
          text: "UP Probability (%)",
          style: {
            color: "#4ade80",
            fontSize: "11px",
          },
        },
        min: polyDomain[0] * 100,
        max: polyDomain[1] * 100,
        labels: {
          style: {
            colors: "#555",
            fontSize: "11px",
          },
          formatter: (value: number) => `${Math.round(value)}%`,
        },
        axisBorder: {
          show: false,
        },
      },
    ],
    tooltip: {
      theme: "dark",
      x: {
        formatter: (value: number) => chartHistory[value]?.time || "",
      },
      y: {
        formatter: (value: number, { seriesIndex }) => {
          if (seriesIndex === 0) return `$${value.toLocaleString()}`;
          return `${value.toFixed(1)}%`;
        },
      },
      style: {
        fontSize: "12px",
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontSize: "12px",
      labels: {
        colors: "#555",
      },
    },
    annotations: {
      yaxis: [
        {
          y: btcOpen,
          yAxisIndex: 0,
          strokeDashArray: 4,
          borderColor: "#333",
          borderWidth: 1,
          label: {
            text: "open / 50%",
            position: "left",
            borderColor: "#333",
            style: {
              color: "#444",
              background: "transparent",
              fontSize: "10px",
            },
          },
        },
      ],
    },
  }), [chartHistory, btcDomain, polyDomain, btcOpen]);

  const poly = data?.polymarket;
  const btcPrice = data?.btcPrice ?? null;
  const timeLeftMin = data?.timeLeftMin ?? null;

  const btcPriceDelta = btcPrice !== null && prevBtcPrice !== null ? btcPrice - prevBtcPrice : null;
  const btcPriceDirection = btcPriceDelta === null ? null : btcPriceDelta > 0 ? "up" : btcPriceDelta < 0 ? "down" : null;

  const priceToBeat = poly?.priceToBeat ?? null;
  const ptbDelta = btcPrice !== null && priceToBeat !== null ? btcPrice - priceToBeat : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4 }}>
            <span style={{ color: "var(--orange)", fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
              BTC/USD
            </span>
            <span style={{ color: "var(--green)", fontSize: 18, fontWeight: 600 }}>
              x Polymarket UP
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 13, marginLeft: "auto" }}>15m</span>
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 11, letterSpacing: 1 }}>
            REAL-TIME BINANCE BTC PRICE + POLYMARKET PREDICTION MARKET
          </div>
        </div>

        {/* Market Info Card */}
        {poly && (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "16px 20px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600, marginBottom: 8 }}>
              {poly.question || "Loading market..."}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 32px", fontSize: 12 }}>
              <div>
                <span style={{ color: "var(--text-dim)" }}>Market: </span>
                <span style={{ color: "var(--text-secondary)" }}>{poly.slug || "-"}</span>
              </div>
              <div>
                <span style={{ color: "var(--text-dim)" }}>Time left: </span>
                <span style={{ color: timeColor(timeLeftMin), fontWeight: 600 }}>
                  {fmtTimeLeft(timeLeftMin)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "20px 8px 12px", marginBottom: 16,
        }}>
          {chartHistory.length > 1 ? (
            <ReactApexChart
              options={chartOptions}
              series={chartSeries}
              type="line"
              height={400}
              width="100%"
            />
          ) : (
            <div style={{
              height: 400, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-dim)", fontSize: 14,
            }}>
              Collecting data points for chart...
            </div>
          )}
        </div>

        {/* Data Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

          {/* Polymarket Card */}
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "16px 20px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
              POLYMARKET
            </div>
            <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>UP</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--green)" }}>
                  {poly?.upPrice !== null && poly?.upPrice !== undefined
                    ? `${(poly.upPrice * 100).toFixed(1)}c`
                    : "-"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>DOWN</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--red)" }}>
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
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "16px 20px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
              PRICES
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>BTC (Binance)</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{
                  fontSize: 22, fontWeight: 700,
                  color: btcPriceDirection === "up" ? "var(--green)" : btcPriceDirection === "down" ? "var(--red)" : "var(--text-primary)",
                }}>
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
                ptbDelta !== null
                  ? `${ptbDelta > 0 ? "+" : ""}$${ptbDelta.toFixed(2)}`
                  : "-"
              }
              valueColor={
                ptbDelta === null ? "var(--text-dim)"
                  : ptbDelta > 0 ? "var(--green)"
                  : ptbDelta < 0 ? "var(--red)"
                  : "var(--text-dim)"
              }
            />
          </div>
        </div>

        {/* Session Info */}
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 16,
        }}>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>ET Time: </span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{etTime}</span>
            </div>
            <div>
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>Session: </span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{session}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Polling every 5s
          </div>
        </div>

        {/* Alignment note */}
        <div style={{
          width: "100%",
          padding: "14px 18px",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 11,
          color: "var(--text-dim)",
          lineHeight: 1.8,
          marginBottom: 16,
        }}>
          <span style={{ color: "var(--text-secondary)" }}>Alignment trick: </span>
          the dashed line marks BTC&apos;s open price (left axis) and 50% probability (right axis).
          Both domains are computed so those two values sit at the <em style={{ color: "#666" }}>same normalised fraction</em> of
          their respective Y domains — making them appear on identical pixel rows.
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 11, padding: "8px 0" }}>
          created by @krajekis
        </div>

        {error && (
          <div style={{
            position: "fixed", bottom: 16, right: 16,
            background: "#1a0a0a", border: "1px solid #3a1a1a", borderRadius: 8,
            padding: "10px 16px", fontSize: 12, color: "var(--red)", maxWidth: 400,
          }}>
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
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ color: valueColor || "var(--text-secondary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
