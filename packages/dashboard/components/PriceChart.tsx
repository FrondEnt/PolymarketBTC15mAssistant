"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { ChartDataPoint } from "@/lib/types";
import { CONFIG } from "@/lib/config";

// Dynamically import ReactApexChart to avoid SSR issues
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface PriceChartProps {
  data: ChartDataPoint[];
  referencePrice: number | null; // The 15-min opening price of BTC
}

export function PriceChart({ data, referencePrice }: PriceChartProps) {
  // Scale Polymarket data so that 0.5 (50%) aligns with the reference price
  const chartData = useMemo(() => {
    if (!referencePrice) return data;

    return data.map((point) => {
      if (point.polymarketPrice === null) {
        return { ...point, polymarketPriceScaled: null };
      }

      // Scale: polymarket 50 (50 cents) should equal referencePrice
      // Formula: scaled = referencePrice + (polymarket - 50) * scaleFactor
      // We want visible movements, so scale appropriately
      const deviation = point.polymarketPrice - 50;
      const scaleFactor = referencePrice * 0.001; // 0.1% of reference price per cent deviation
      const scaled = referencePrice + deviation * scaleFactor;

      return {
        ...point,
        polymarketPriceScaled: scaled,
      };
    });
  }, [data, referencePrice]);

  // Calculate the time domain for the full 15-minute window
  const timeDomain = useMemo(() => {
    if (data.length === 0) return undefined;

    // Get the start of the current 15-minute window
    const now = Date.now();
    const minutes = Math.floor(now / 60000);
    const sessionMinutes = Math.floor(minutes / CONFIG.candleWindowMinutes);
    const windowStart = sessionMinutes * CONFIG.candleWindowMinutes * 60000;
    const windowEnd = windowStart + CONFIG.candleWindowMinutes * 60 * 1000;

    return [windowStart, windowEnd];
  }, [data]);

  // Prepare series data for ApexCharts
  const series = useMemo(() => {
    const btcSeries = chartData.map((point) => ({
      x: point.timestamp,
      y: point.btcPrice,
    }));

    const polymarketSeries = chartData
      .filter((point) => point.polymarketPriceScaled !== null)
      .map((point) => ({
        x: point.timestamp,
        y: point.polymarketPriceScaled,
      }));

    return [
      {
        name: "BTC Price (Binance)",
        data: btcSeries,
      },
      {
        name: "Polymarket UP (scaled)",
        data: polymarketSeries,
      },
    ];
  }, [chartData]);

  // ApexCharts options
  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "line",
        background: "#000000",
        foreColor: "#999999",
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
      colors: ["#00ff00", "#ff0000"],
      stroke: {
        width: 2,
        curve: "straight",
      },
      grid: {
        borderColor: "#333333",
        strokeDashArray: 3,
      },
      xaxis: {
        type: "datetime",
        min: timeDomain ? timeDomain[0] : undefined,
        max: timeDomain ? timeDomain[1] : undefined,
        labels: {
          style: {
            colors: "#999999",
            fontSize: "12px",
          },
          datetimeFormatter: {
            hour: "HH:mm",
            minute: "HH:mm:ss",
            second: "HH:mm:ss",
          },
        },
        axisBorder: {
          color: "#999999",
        },
        axisTicks: {
          color: "#999999",
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: "#999999",
            fontSize: "12px",
          },
          formatter: (value) => `$${value.toFixed(2)}`,
        },
        axisBorder: {
          show: true,
          color: "#999999",
        },
      },
      tooltip: {
        theme: "dark",
        x: {
          format: "HH:mm:ss",
        },
        y: {
          formatter: (value) => `$${value.toFixed(2)}`,
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
          colors: "#999999",
        },
      },
      annotations: referencePrice
        ? {
            yaxis: [
              {
                y: referencePrice,
                strokeDashArray: 0,
                borderColor: "#ffff00",
                borderWidth: 2,
                label: {
                  text: "15min Open",
                  position: "right",
                  borderColor: "#ffff00",
                  style: {
                    color: "#000000",
                    background: "#ffff00",
                    fontSize: "12px",
                  },
                },
              },
            ],
          }
        : undefined,
    }),
    [referencePrice, timeDomain]
  );

  return (
    <div className="w-full h-full bg-black border border-white/20">
      <ReactApexChart
        options={options}
        series={series}
        type="line"
        height="100%"
        width="100%"
      />
    </div>
  );
}
