"use client";

import { useState, useEffect, useRef } from "react";
import { useBinanceWebSocket } from "@/hooks/useBinanceWebSocket";
import { usePolymarketWebSocket } from "@/hooks/usePolymarketWebSocket";
import { usePolymarketMarketPrices } from "@/hooks/usePolymarketMarketPrices";
import { BinanceDataDisplay } from "./BinanceDataDisplay";
import { PolymarketDataDisplay } from "./PolymarketDataDisplay";
import { PriceChart } from "./PriceChart";
import { ChartDataPoint } from "@/lib/types";
import { CONFIG } from "@/lib/config";

const STORAGE_KEY = "btc-dashboard-data";

interface PersistedData {
  chartData: ChartDataPoint[];
  referencePrice: number | null;
  sessionStartTime: number;
  referenceCaptured: boolean;
}

export function Dashboard() {
  const binance = useBinanceWebSocket();
  const polymarket = usePolymarketWebSocket();
  const polymarketMarketPrices = usePolymarketMarketPrices();

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [referencePrice, setReferencePrice] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  // Reference to track when we last captured the reference price
  const referenceCapturedRef = useRef(false);
  
  // Load persisted data on mount
  useEffect(() => {
    const loadPersistedData = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const data: PersistedData = JSON.parse(stored);
        
        // Calculate current session start time
        const now = Date.now();
        const minutes = Math.floor(now / 60000);
        const sessionMinutes = Math.floor(minutes / CONFIG.candleWindowMinutes);
        const currentSessionStart = sessionMinutes * CONFIG.candleWindowMinutes * 60000;
        
        // Only restore data if it's from the current 15-minute window
        if (data.sessionStartTime === currentSessionStart) {
          setChartData(data.chartData);
          setReferencePrice(data.referencePrice);
          setSessionStartTime(data.sessionStartTime);
          referenceCapturedRef.current = data.referenceCaptured;
        }
      } catch (err) {
        console.error("Error loading persisted data:", err);
      }
    };

    loadPersistedData();
  }, []);

  // Persist data to localStorage whenever it changes
  useEffect(() => {
    try {
      const dataToStore: PersistedData = {
        chartData,
        referencePrice,
        sessionStartTime,
        referenceCaptured: referenceCapturedRef.current,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    } catch (err) {
      console.error("Error persisting data:", err);
    }
  }, [chartData, referencePrice, sessionStartTime]);

  // Calculate the start of the current 15-minute window
  useEffect(() => {
    const updateSessionStart = () => {
      const now = Date.now();
      const minutes = Math.floor(now / 60000);
      const sessionMinutes = Math.floor(minutes / CONFIG.candleWindowMinutes);
      const sessionStart = sessionMinutes * CONFIG.candleWindowMinutes * 60000;
      setSessionStartTime(sessionStart);
      referenceCapturedRef.current = false;
    };

    updateSessionStart();
    const interval = setInterval(updateSessionStart, 1000);
    return () => clearInterval(interval);
  }, []);

  // Capture reference price at the start of each 15-minute window
  useEffect(() => {
    if (
      binance.data &&
      !referenceCapturedRef.current &&
      Date.now() - sessionStartTime < 5000 // Within first 5 seconds of new window
    ) {
      setReferencePrice(binance.data.price);
      referenceCapturedRef.current = true;
    }
  }, [binance.data, sessionStartTime]);

  // Update chart data
  useEffect(() => {
    if (!binance.data) return;

    const binanceData = binance.data;
    // Use the UP price from the market prices (in cents, 0-100 range)
    const polymarketPrice = polymarketMarketPrices.data?.upPrice ?? null;

    setChartData((prev) => {
      const newPoint: ChartDataPoint = {
        timestamp: binanceData.timestamp,
        btcPrice: binanceData.price,
        polymarketPrice: polymarketPrice,
        polymarketPriceScaled: null,
      };

      const updated = [...prev, newPoint];

      // Filter to only keep points within the current 15-minute window
      const windowStart = sessionStartTime;
      const windowEnd = sessionStartTime + CONFIG.candleWindowMinutes * 60 * 1000;
      const filtered = updated.filter(
        (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd
      );

      return filtered;
    });
  }, [binance.data, polymarketMarketPrices.data, sessionStartTime]);

  // Calculate time remaining in current window
  const timeRemaining = () => {
    const now = Date.now();
    const elapsed = now - sessionStartTime;
    const windowMs = CONFIG.candleWindowMinutes * 60 * 1000;
    const remaining = windowMs - elapsed;
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const [timeRemainingStr, setTimeRemainingStr] = useState("--:--");

  useEffect(() => {
    const updateTimer = () => {
      setTimeRemainingStr(timeRemaining());
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="border border-white/20 p-4 bg-black">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              BTC 15-MIN PRICE PREDICTION DASHBOARD
            </h1>
            <div className="text-right">
              <div className="text-sm text-gray-400">Time Remaining</div>
              <div className="text-3xl font-mono text-white">
                {timeRemainingStr}
              </div>
            </div>
          </div>
          {referencePrice && (
            <div className="mt-4 text-sm text-gray-400">
              Current Window Reference Price (15m open):{" "}
              <span className="text-white font-mono">
                ${referencePrice.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="h-[500px]">
          <PriceChart data={chartData} referencePrice={referencePrice} />
        </div>

        {/* Data Displays */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BinanceDataDisplay
            data={binance.data}
            connected={binance.connected}
            referencePrice={referencePrice}
          />
          <PolymarketDataDisplay
            data={polymarket.data}
            marketPrices={polymarketMarketPrices.data}
            connected={polymarket.connected}
            referencePrice={referencePrice}
          />
        </div>
      </div>
    </div>
  );
}
