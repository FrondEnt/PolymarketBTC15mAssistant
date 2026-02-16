"use client";

import { useState, useEffect, useRef } from "react";
import { CONFIG } from "@/lib/config";
import { PolymarketData } from "@/lib/types";

export function usePolymarketWebSocket() {
  const [data, setData] = useState<PolymarketData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let reconnectMs = 500;

    const connect = () => {
      try {
        const ws = new WebSocket(CONFIG.polymarketWsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          reconnectMs = 500;

          // Subscribe to crypto prices
          try {
            ws.send(
              JSON.stringify({
                action: "subscribe",
                subscriptions: [
                  { topic: "crypto_prices_chainlink", type: "*", filters: "" },
                ],
              })
            );
          } catch (err) {
            console.error("Error sending subscription:", err);
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.topic !== "crypto_prices_chainlink") return;

            const payload =
              typeof msg.payload === "string"
                ? JSON.parse(msg.payload)
                : msg.payload;

            const symbol = String(
              payload.symbol || payload.pair || payload.ticker || ""
            ).toLowerCase();

            if (!symbol.includes("btc")) return;

            const price = parseFloat(
              payload.value ?? payload.price ?? payload.current ?? payload.data
            );

            if (isFinite(price)) {
              setData({
                price,
                timestamp: Date.now(),
              });
            }
          } catch (err) {
            console.error("Error parsing Polymarket message:", err);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;

          // Schedule reconnect
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectMs = Math.min(10000, Math.floor(reconnectMs * 1.5));
            connect();
          }, reconnectMs);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.error("Error connecting to Polymarket WebSocket:", err);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { data, connected };
}
