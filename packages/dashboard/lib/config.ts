export const CONFIG = {
  symbol: "BTCUSDT",
  binanceWsUrl: "wss://stream.binance.com:9443/ws/btcusdt@trade",
  polymarketWsUrl: "wss://ws-live-data.polymarket.com",
  candleWindowMinutes: 15,
  maxDataPoints: 60, // Keep last 60 data points for the chart
  
  // Polymarket API endpoints
  gammaBaseUrl: "https://gamma-api.polymarket.com",
  clobBaseUrl: "https://clob.polymarket.com",
  
  polymarket: {
    seriesId: "10192",
    autoSelectLatest: true,
    upOutcomeLabel: "Up",
    downOutcomeLabel: "Down",
    pollIntervalMs: 5000, // Poll every 5 seconds
  }
};
