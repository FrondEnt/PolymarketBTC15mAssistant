import { NextResponse } from "next/server";

const BINANCE_BASE = "https://api.binance.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";
const SERIES_ID = "10192";

function toNumber(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function fetchBinancePrice(): Promise<number | null> {
  try {
    const res = await fetch(`${BINANCE_BASE}/api/v3/ticker/price?symbol=BTCUSDT`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return toNumber(data.price);
  } catch {
    return null;
  }
}

async function fetchBinanceKlines(interval: string, limit: number) {
  try {
    const url = `${BINANCE_BASE}/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data as unknown[][]).map((k: unknown[]) => ({
      openTime: Number(k[0]),
      open: toNumber(k[1]),
      high: toNumber(k[2]),
      low: toNumber(k[3]),
      close: toNumber(k[4]),
      volume: toNumber(k[5]),
      closeTime: Number(k[6]),
    }));
  } catch {
    return [];
  }
}

function safeTimeMs(x: unknown): number | null {
  if (!x) return null;
  const t = new Date(x as string).getTime();
  return Number.isFinite(t) ? t : null;
}

interface Market {
  question?: string;
  slug?: string;
  endDate?: string;
  eventStartTime?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  clobTokenIds?: string | string[];
  liquidity?: number | string;
  liquidityNum?: number | string;
  bestBid?: number | string;
  bestAsk?: number | string;
  spread?: number | string;
  [key: string]: unknown;
}

async function fetchLiveEvents(): Promise<Market[]> {
  try {
    const url = `${GAMMA_BASE}/events?series_id=${SERIES_ID}&active=true&closed=false&limit=25`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function flattenEventMarkets(events: unknown[]): Market[] {
  const out: Market[] = [];
  for (const e of events) {
    const ev = e as { markets?: Market[] };
    const markets = Array.isArray(ev.markets) ? ev.markets : [];
    for (const m of markets) out.push(m);
  }
  return out;
}

function pickLatestLiveMarket(markets: Market[], nowMs = Date.now()): Market | null {
  if (!markets.length) return null;

  const enriched = markets.map((m) => ({
    m,
    endMs: safeTimeMs(m.endDate),
    startMs: safeTimeMs(m.eventStartTime),
  })).filter((x) => x.endMs !== null);

  const live = enriched
    .filter((x) => {
      const started = x.startMs === null ? true : x.startMs! <= nowMs;
      return started && nowMs < x.endMs!;
    })
    .sort((a, b) => a.endMs! - b.endMs!);

  if (live.length) return live[0].m;

  const upcoming = enriched.filter((x) => nowMs < x.endMs!).sort((a, b) => a.endMs! - b.endMs!);
  return upcoming.length ? upcoming[0].m : null;
}

async function fetchClobPrice(tokenId: string, side: string): Promise<number | null> {
  try {
    const res = await fetch(`${CLOB_BASE}/price?token_id=${tokenId}&side=${side}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return toNumber(data.price);
  } catch {
    return null;
  }
}

function parseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function parsePriceToBeat(market: Market): number | null {
  const text = String(market?.question ?? "");
  if (!text) return null;
  const m = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!m) return null;
  const raw = m[1].replace(/,/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const [btcPrice, klines1m, events] = await Promise.all([
      fetchBinancePrice(),
      fetchBinanceKlines("1m", 60),
      fetchLiveEvents(),
    ]);

    const markets = flattenEventMarkets(events);
    const market = pickLatestLiveMarket(markets);

    let polyData: {
      question: string | null;
      slug: string | null;
      endDate: string | null;
      eventStartTime: string | null;
      upPrice: number | null;
      downPrice: number | null;
      liquidity: number | null;
      priceToBeat: number | null;
      timeLeftMin: number | null;
    } = {
      question: null,
      slug: null,
      endDate: null,
      eventStartTime: null,
      upPrice: null,
      downPrice: null,
      liquidity: null,
      priceToBeat: null,
      timeLeftMin: null,
    };

    if (market) {
      const outcomes = parseArray(market.outcomes);
      const clobTokenIds = parseArray(market.clobTokenIds);

      let upTokenId: string | null = null;
      let downTokenId: string | null = null;
      for (let i = 0; i < outcomes.length; i++) {
        const label = outcomes[i].toLowerCase();
        const tokenId = clobTokenIds[i] || null;
        if (!tokenId) continue;
        if (label === "up") upTokenId = tokenId;
        if (label === "down") downTokenId = tokenId;
      }

      let upPrice: number | null = null;
      let downPrice: number | null = null;

      if (upTokenId && downTokenId) {
        [upPrice, downPrice] = await Promise.all([
          fetchClobPrice(upTokenId, "buy"),
          fetchClobPrice(downTokenId, "buy"),
        ]);
      }

      const endMs = market.endDate ? new Date(market.endDate).getTime() : null;
      const timeLeftMin = endMs ? (endMs - Date.now()) / 60_000 : null;
      const liquidity = toNumber(market.liquidityNum) ?? toNumber(market.liquidity);

      polyData = {
        question: market.question ?? null,
        slug: market.slug ?? null,
        endDate: market.endDate ?? null,
        eventStartTime: market.eventStartTime ?? null,
        upPrice,
        downPrice,
        liquidity,
        priceToBeat: parsePriceToBeat(market),
        timeLeftMin,
      };
    }

    const windowMs = 15 * 60_000;
    const nowMs = Date.now();
    const startMs = Math.floor(nowMs / windowMs) * windowMs;
    const endMs = startMs + windowMs;
    const candleTimeLeftMin = (endMs - nowMs) / 60_000;

    const timeLeftMin = polyData.timeLeftMin ?? candleTimeLeftMin;

    const klines = klines1m.map((k: { openTime: number; close: number | null; volume: number | null }) => ({
      time: new Date(k.openTime).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
      }),
      close: k.close,
      volume: k.volume,
    }));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      btcPrice,
      polymarket: polyData,
      timeLeftMin,
      klines,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
