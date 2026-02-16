"use client";

import { useState, useEffect } from "react";
import { CONFIG } from "@/lib/config";
import { PolymarketMarketPrices } from "@/lib/types";

interface Market {
  slug?: string;
  question?: string;
  title?: string;
  endDate?: string;
  eventStartTime?: string;
  outcomes?: string[] | string;
  outcomePrices?: number[] | string;
  clobTokenIds?: string[] | string;
}

interface Event {
  markets?: Market[];
}

async function fetchLiveEventsBySeriesId(seriesId: string, limit: number = 25): Promise<Event[]> {
  const url = new URL("/api/polymarket/events", window.location.origin);
  url.searchParams.set("series_id", String(seriesId));
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gamma events error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function flattenEventMarkets(events: Event[]): Market[] {
  const out: Market[] = [];
  for (const e of Array.isArray(events) ? events : []) {
    const markets = Array.isArray(e.markets) ? e.markets : [];
    for (const m of markets) {
      out.push(m);
    }
  }
  return out;
}

function safeTimeMs(x: any): number | null {
  if (!x) return null;
  const t = new Date(x).getTime();
  return Number.isFinite(t) ? t : null;
}

function pickLatestLiveMarket(markets: Market[], nowMs: number = Date.now()): Market | null {
  if (!Array.isArray(markets) || markets.length === 0) return null;

  const enriched = markets
    .map((m) => {
      const endMs = safeTimeMs(m.endDate);
      const startMs = safeTimeMs(m.eventStartTime);
      return { m, endMs, startMs };
    })
    .filter((x) => x.endMs !== null);

  const live = enriched
    .filter((x) => {
      const started = x.startMs === null ? true : x.startMs <= nowMs;
      return started && nowMs < (x.endMs ?? 0);
    })
    .sort((a, b) => (a.endMs ?? 0) - (b.endMs ?? 0));

  if (live.length) return live[0].m;

  const upcoming = enriched
    .filter((x) => nowMs < (x.endMs ?? 0))
    .sort((a, b) => (a.endMs ?? 0) - (b.endMs ?? 0));

  return upcoming.length ? upcoming[0].m : null;
}

async function fetchClobPrice(tokenId: string, side: string): Promise<number | null> {
  const url = new URL("/api/polymarket/price", window.location.origin);
  url.searchParams.set("token_id", tokenId);
  url.searchParams.set("side", side);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CLOB price error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const price = Number(data.price);
  return Number.isFinite(price) ? price : null;
}

async function fetchPolymarketMarketPrices(): Promise<PolymarketMarketPrices | null> {
  try {
    const events = await fetchLiveEventsBySeriesId(CONFIG.polymarket.seriesId, 25);
    const markets = flattenEventMarkets(events);
    const market = pickLatestLiveMarket(markets);

    if (!market) {
      return null;
    }

    const outcomes = Array.isArray(market.outcomes)
      ? market.outcomes
      : typeof market.outcomes === "string"
      ? JSON.parse(market.outcomes)
      : [];

    const outcomePrices = Array.isArray(market.outcomePrices)
      ? market.outcomePrices
      : typeof market.outcomePrices === "string"
      ? JSON.parse(market.outcomePrices)
      : [];

    const clobTokenIds = Array.isArray(market.clobTokenIds)
      ? market.clobTokenIds
      : typeof market.clobTokenIds === "string"
      ? JSON.parse(market.clobTokenIds)
      : [];

    let upTokenId: string | null = null;
    let downTokenId: string | null = null;

    for (let i = 0; i < outcomes.length; i += 1) {
      const label = String(outcomes[i]);
      const tokenId = clobTokenIds[i] ? String(clobTokenIds[i]) : null;
      if (!tokenId) continue;

      if (label.toLowerCase() === CONFIG.polymarket.upOutcomeLabel.toLowerCase()) {
        upTokenId = tokenId;
      }
      if (label.toLowerCase() === CONFIG.polymarket.downOutcomeLabel.toLowerCase()) {
        downTokenId = tokenId;
      }
    }

    const upIndex = outcomes.findIndex(
      (x: any) => String(x).toLowerCase() === CONFIG.polymarket.upOutcomeLabel.toLowerCase()
    );
    const downIndex = outcomes.findIndex(
      (x: any) => String(x).toLowerCase() === CONFIG.polymarket.downOutcomeLabel.toLowerCase()
    );

    const gammaYes = upIndex >= 0 ? Number(outcomePrices[upIndex]) : null;
    const gammaNo = downIndex >= 0 ? Number(outcomePrices[downIndex]) : null;

    let upPrice: number | null = gammaYes;
    let downPrice: number | null = gammaNo;

    // Try to get more accurate prices from CLOB
    if (upTokenId && downTokenId) {
      try {
        const [upBuy, downBuy] = await Promise.all([
          fetchClobPrice(upTokenId, "buy"),
          fetchClobPrice(downTokenId, "buy"),
        ]);

        upPrice = upBuy ?? gammaYes;
        downPrice = downBuy ?? gammaNo;
      } catch {
        // Fall back to gamma prices
        upPrice = gammaYes;
        downPrice = gammaNo;
      }
    }

    return {
      upPrice,
      downPrice,
      timestamp: Date.now(),
      marketSlug: market.slug,
      marketQuestion: market.question || market.title,
    };
  } catch (err) {
    console.error("Error fetching Polymarket market prices:", err);
    return null;
  }
}

export function usePolymarketMarketPrices() {
  const [data, setData] = useState<PolymarketMarketPrices | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      const prices = await fetchPolymarketMarketPrices();
      if (mounted && prices) {
        setData(prices);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, CONFIG.polymarket.pollIntervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { data, loading };
}
