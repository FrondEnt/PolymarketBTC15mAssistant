export interface BinanceTradeData {
  price: number;
  timestamp: number;
}

export interface PolymarketData {
  price: number;
  timestamp: number;
}

export interface PolymarketMarketPrices {
  upPrice: number | null;
  downPrice: number | null;
  timestamp: number;
  marketSlug?: string;
  marketQuestion?: string;
}

export interface ChartDataPoint {
  timestamp: number;
  btcPrice: number;
  polymarketPrice: number | null;
  polymarketPriceScaled: number | null; // Scaled to match BTC price for visualization
}
