"use client";

import { PolymarketData, PolymarketMarketPrices } from "@/lib/types";

interface PolymarketDataDisplayProps {
  data: PolymarketData | null;
  marketPrices: PolymarketMarketPrices | null;
  connected: boolean;
  referencePrice: number | null;
}

export function PolymarketDataDisplay({
  data,
  marketPrices,
  connected,
  referencePrice,
}: PolymarketDataDisplayProps) {
  // Convert prices from 0-1 range to cents (0-100)
  const upPriceCents = marketPrices?.upPrice !== null && marketPrices?.upPrice !== undefined
    ? marketPrices.upPrice * 100
    : null;
  const downPriceCents = marketPrices?.downPrice !== null && marketPrices?.downPrice !== undefined
    ? marketPrices.downPrice * 100
    : null;

  return (
    <div className="bg-black border-2 border-red-500/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-red-500">POLYMARKET</h2>
        <div
          className={`w-3 h-3 ${
            connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-gray-400 text-sm mb-3">Market Prices</div>
          {upPriceCents !== null && downPriceCents !== null ? (
            <div className="text-lg font-mono text-gray-300">
              <span className="text-green-500">↑ UP {upPriceCents.toFixed(2)}¢</span>
              <span className="text-gray-500 mx-2">|</span>
              <span className="text-red-500">↓ DOWN {downPriceCents.toFixed(2)}¢</span>
            </div>
          ) : (
            <div className="text-lg font-mono text-gray-600">Loading...</div>
          )}
        </div>

        {marketPrices?.marketQuestion && (
          <div>
            <div className="text-gray-400 text-sm mb-1">Current Market</div>
            <div className="text-xs text-gray-300">
              {marketPrices.marketQuestion}
            </div>
          </div>
        )}

    
        <div>
          <div className="text-gray-400 text-sm mb-1">Last Update</div>
          {marketPrices ? (
            <div className="text-sm font-mono text-gray-300">
              {new Date(marketPrices.timestamp).toLocaleTimeString("en-US", {
                hour12: false,
              })}
            </div>
          ) : (
            <div className="text-sm font-mono text-gray-600">--</div>
          )}
        </div>
      </div>
    </div>
  );
}
