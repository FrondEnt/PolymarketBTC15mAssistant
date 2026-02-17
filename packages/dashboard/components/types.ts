export interface PolymarketData {
  question: string | null;
  slug: string | null;
  endDate: string | null;
  eventStartTime: string | null;
  upPrice: number | null;
  downPrice: number | null;
  liquidity: number | null;
  priceToBeat: number | null;
  timeLeftMin: number | null;
}

export interface HistoryPoint {
  timeMs: number;
  btc: number;
  poly: number | null;
}

export interface ApiResponse {
  timestamp: string;
  btcPrice: number | null;
  polymarket: PolymarketData;
  timeLeftMin: number | null;
  history: HistoryPoint[];
  atr: number | null;
}

export interface ChartPoint {
  time: string;
  btc: number;
  poly: number;
  idx: number;
}
