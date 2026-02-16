"use client";

import { useState, useEffect, useRef } from "react";
import { CONFIG } from "@/lib/config";
import { BinanceTradeData } from "@/lib/types";

export function useBinanceWebSocket() {
  const [data, setData] = useState<BinanceTradeData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let reconnectMs = 500;

    const connect = () => {
      try {
        const ws = new WebSocket(CONFIG.binanceWsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          reconnectMs = 500;
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const price = parseFloat(msg.p);
            if (isFinite(price)) {
              setData({
                price,
                timestamp: Date.now(),
              });
            }
          } catch (err) {
            console.error("Error parsing Binance message:", err);
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
        console.error("Error connecting to Binance WebSocket:", err);
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
