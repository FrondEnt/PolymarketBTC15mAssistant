import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CONFIG = {
  symbol: "BTCUSDT",
  binanceBaseUrl: "https://api.binance.com",
  gammaBaseUrl: "https://gamma-api.polymarket.com",
  clobBaseUrl: "https://clob.polymarket.com",
  pollIntervalMs: 2000,
  candleWindowMinutes: 15,
  polymarket: {
    seriesId: "10192",
    upOutcomeLabel: "Up",
    downOutcomeLabel: "Down",
  },
};

export function formatNumber(num: number, decimals: number = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatPct(num: number | null, decimals: number = 2) {
  if (num === null) return "-%";
  return (num * 100).toFixed(decimals) + "%";
}
