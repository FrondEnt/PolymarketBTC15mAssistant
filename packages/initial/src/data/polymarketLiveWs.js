import WebSocket from "ws";
import { CONFIG } from "../config.js";
import { wsAgentForUrl } from "../net/proxy.js";

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizePayload(payload) {
  if (!payload) return null;
  if (typeof payload === "object") return payload;
  if (typeof payload === "string") return safeJsonParse(payload);
  return null;
}

function toFiniteNumber(x) {
  const n = typeof x === "string" ? Number(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
}

export function startPolymarketChainlinkPriceStream({
  wsUrl = CONFIG.polymarket.liveDataWsUrl,
  symbolIncludes = "btc",
  onUpdate
} = {}) {
  if (!wsUrl) {
    return {
      getLast() {
        return { price: null, updatedAt: null, source: "polymarket_ws" };
      },
      close() {}
    };
  }

  let ws = null;
  let closed = false;
  let reconnectMs = 500;

  let lastPrice = null;
  let lastUpdatedAt = null;

  const connect = () => {
    if (closed) return;

    ws = new WebSocket(wsUrl, {
      handshakeTimeout: 10_000,
      agent: wsAgentForUrl(wsUrl)
    });

    const scheduleReconnect = () => {
      if (closed) return;
      try {
        ws?.terminate();
      } catch {
        // ignore
      }
      ws = null;
      const wait = reconnectMs;
      reconnectMs = Math.min(10_000, Math.floor(reconnectMs * 1.5));
      setTimeout(connect, wait);
    };

    ws.on("open", () => {
      reconnectMs = 500;
      try {
        ws.send(
          JSON.stringify({
            action: "subscribe",
            subscriptions: [{ topic: "crypto_prices_chainlink", type: "*", filters: "" }]
          })
        );
      } catch {
        scheduleReconnect();
      }
    });

    ws.on("message", (buf) => {
      const msg = typeof buf === "string" ? buf : buf?.toString?.() ?? "";
      if (!msg || !msg.trim()) return;

      const data = safeJsonParse(msg);
      if (!data || data.topic !== "crypto_prices_chainlink") return;

      const payload = normalizePayload(data.payload) || {};
      const symbol = String(payload.symbol || payload.pair || payload.ticker || "").toLowerCase();
      if (symbolIncludes && !symbol.includes(String(symbolIncludes).toLowerCase())) return;

      const price = toFiniteNumber(payload.value ?? payload.price ?? payload.current ?? payload.data);
      if (price === null) return;

      const updatedAtMs = toFiniteNumber(payload.timestamp)
        ? Math.floor(Number(payload.timestamp) * 1000)
        : toFiniteNumber(payload.updatedAt)
          ? Math.floor(Number(payload.updatedAt) * 1000)
          : null;

      lastPrice = price;
      lastUpdatedAt = updatedAtMs ?? lastUpdatedAt;

      if (typeof onUpdate === "function") {
        onUpdate({ price: lastPrice, updatedAt: lastUpdatedAt, source: "polymarket_ws" });
      }
    });

    ws.on("close", scheduleReconnect);
    ws.on("error", scheduleReconnect);
  };

  connect();

  return {
    getLast() {
      return { price: lastPrice, updatedAt: lastUpdatedAt, source: "polymarket_ws" };
    },
    close() {
      closed = true;
      try {
        ws?.close();
      } catch {
        // ignore
      }
      ws = null;
    }
  };
}
