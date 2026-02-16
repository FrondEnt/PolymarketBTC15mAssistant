"use client";

import { BinanceTradeData } from "@/lib/types";

interface BinanceDataDisplayProps {
  data: BinanceTradeData | null;
  connected: boolean;
  referencePrice: number | null;
}

export function BinanceDataDisplay({
  data,
  connected,
  referencePrice,
}: BinanceDataDisplayProps) {
  const priceDiff =
    data && referencePrice ? data.price - referencePrice : null;
  const priceDiffPct =
    priceDiff && referencePrice ? (priceDiff / referencePrice) * 100 : null;

  return (
    <div className="bg-black border-2 border-green-500/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-green-500">BINANCE</h2>
        <div
          className={`w-3 h-3 ${
            connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-gray-400 text-sm mb-1">BTC/USDT</div>
          {data ? (
            <div className="text-4xl font-mono text-green-500">
              ${data.price.toFixed(2)}
            </div>
          ) : (
            <div className="text-4xl font-mono text-gray-600">--</div>
          )}
        </div>

        {referencePrice && (
          <div>
            <div className="text-gray-400 text-sm mb-1">
              Change from Reference (15m open)
            </div>
            {priceDiff !== null && priceDiffPct !== null ? (
              <div
                className={`text-xl font-mono ${
                  priceDiff > 0
                    ? "text-green-500"
                    : priceDiff < 0
                    ? "text-red-500"
                    : "text-gray-400"
                }`}
              >
                {priceDiff > 0 ? "+" : ""}
                ${priceDiff.toFixed(2)} ({priceDiff > 0 ? "+" : ""}
                {priceDiffPct.toFixed(2)}%)
              </div>
            ) : (
              <div className="text-xl font-mono text-gray-600">--</div>
            )}
          </div>
        )}

        <div>
          <div className="text-gray-400 text-sm mb-1">Last Update</div>
          {data ? (
            <div className="text-sm font-mono text-gray-300">
              {new Date(data.timestamp).toLocaleTimeString("en-US", {
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
