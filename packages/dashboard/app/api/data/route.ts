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

async function fetchBinanceKlines(
  interval: string,
  limit: number,
  startTime?: number,
  endTime?: number,
) {
  try {
    let url = `${BINANCE_BASE}/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
    if (startTime !== undefined) url += `&startTime=${startTime}`;
    if (endTime !== undefined) url += `&endTime=${endTime}`;
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

async function fetchPolymarketPriceHistory(
  tokenId: string,
  startTsSec: number,
  endTsSec: number,
  fidelity = 1,
): Promise<Array<{ t: number; p: number }>> {
  try {
    const url = `${CLOB_BASE}/prices-history?market=${tokenId}&startTs=${startTsSec}&endTs=${endTsSec}&fidelity=${fidelity}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const history = Array.isArray(data) ? data : data?.history || [];
    return history
      .map((item: Record<string, unknown>) => ({
        t: Number(item.t),
        p: Number(item.p),
      }))
      .filter((item: { t: number; p: number }) => Number.isFinite(item.t) && Number.isFinite(item.p));
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
    const windowMs = 15 * 60_000;
    const nowMs = Date.now();
    const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
    const windowEndMs = windowStartMs + windowMs;

    const [btcPrice, events] = await Promise.all([
      fetchBinancePrice(),
      fetchLiveEvents(),
    ]);

    const markets = flattenEventMarkets(events);
    const market = pickLatestLiveMarket(markets);

    let upTokenId: string | null = null;
    let downTokenId: string | null = null;

    if (market) {
      const outcomes = parseArray(market.outcomes);
      const clobTokenIds = parseArray(market.clobTokenIds);
      for (let i = 0; i < outcomes.length; i++) {
        const label = outcomes[i].toLowerCase();
        const tokenId = clobTokenIds[i] || null;
        if (!tokenId) continue;
        if (label === "up") upTokenId = tokenId;
        if (label === "down") downTokenId = tokenId;
      }
    }

    const [upPrice, downPrice, btcKlines1s, polyHistory] = await Promise.all([
      upTokenId ? fetchClobPrice(upTokenId, "buy") : Promise.resolve(null),
      downTokenId ? fetchClobPrice(downTokenId, "buy") : Promise.resolve(null),
      fetchBinanceKlines("1s", 1000, windowStartMs, nowMs),
      upTokenId
        ? fetchPolymarketPriceHistory(
            upTokenId,
            Math.floor(windowStartMs / 1000),
            Math.floor(nowMs / 1000),
          )
        : Promise.resolve([]),
    ]);

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

    const polyHistoryMs = polyHistory.map((item) => ({
      t: item.t < 1e12 ? item.t * 1000 : item.t,
      p: item.p,
    }));

    const SAMPLE_INTERVAL_MS = 5000;
    const history: Array<{ timeMs: number; btc: number; poly: number | null }> = [];
    let nextSampleTime = windowStartMs;

    for (const k of btcKlines1s) {
      if (k.openTime >= nextSampleTime && k.close !== null) {
        let polyPrice: number | null = null;
        for (let i = polyHistoryMs.length - 1; i >= 0; i--) {
          if (polyHistoryMs[i].t <= k.openTime) {
            polyPrice = polyHistoryMs[i].p;
            break;
          }
        }

        history.push({ timeMs: k.openTime, btc: k.close, poly: polyPrice });
        nextSampleTime = k.openTime + SAMPLE_INTERVAL_MS;
      }
    }

    const candleTimeLeftMin = (windowEndMs - nowMs) / 60_000;
    const timeLeftMin = polyData.timeLeftMin ?? candleTimeLeftMin;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      btcPrice,
      polymarket: polyData,
      timeLeftMin,
      history,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
