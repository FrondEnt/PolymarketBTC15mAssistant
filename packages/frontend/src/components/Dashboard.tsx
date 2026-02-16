"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Clock, Activity, BarChart3, DollarSign, Zap, Info } from "lucide-react";
import { cn, formatNumber, formatPct, CONFIG } from "@/lib/utils";
import { RSI, MACD, VWAP } from "technicalindicators";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Fetch Polymarket Snapshot - get active, non-closed markets
        const gammaUrl = `${CONFIG.gammaBaseUrl}/events?series_id=${CONFIG.polymarket.seriesId}&active=true&closed=false&limit=5`;
        const eventRes = await fetch(`/api/proxy?url=${encodeURIComponent(gammaUrl)}`);
        const eventData = await eventRes.json();
        
        // Pick the first active market
        const event = eventData[0];
        const market = event?.markets?.[0];
        
        if (!market) throw new Error("No active market found");

        // 2. Fetch Binance Price & Klines
        const binancePriceUrl = `${CONFIG.binanceBaseUrl}/api/v3/ticker/price?symbol=${CONFIG.symbol}`;
        const binanceKlinesUrl = `${CONFIG.binanceBaseUrl}/api/v3/klines?symbol=${CONFIG.symbol}&interval=1m&limit=100`;
        
        const [priceRes, klinesRes] = await Promise.all([
          fetch(`/api/proxy?url=${encodeURIComponent(binancePriceUrl)}`),
          fetch(`/api/proxy?url=${encodeURIComponent(binanceKlinesUrl)}`)
        ]);
        
        const binanceData = await priceRes.json();
        const klines = await klinesRes.json();

        // 3. Calculate Indicators
        const closes = klines.map((k: any) => parseFloat(k[4]));
        const highs = klines.map((k: any) => parseFloat(k[2]));
        const lows = klines.map((k: any) => parseFloat(k[3]));
        const volumes = klines.map((k: any) => parseFloat(k[5]));

        const rsi = RSI.calculate({ values: closes, period: 14 });
        const macd = MACD.calculate({
          values: closes,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false
        });
        
        // VWAP Calculation (Simplified for the window)
        const vwap = VWAP.calculate({
          high: highs,
          low: lows,
          close: closes,
          volume: volumes
        });

        const outcomes = JSON.parse(market.outcomes);
        const outcomePrices = JSON.parse(market.outcomePrices);
        
        const upIndex = outcomes.findIndex((o: string) => o.toLowerCase() === CONFIG.polymarket.upOutcomeLabel.toLowerCase());
        const downIndex = outcomes.findIndex((o: string) => o.toLowerCase() === CONFIG.polymarket.downOutcomeLabel.toLowerCase());

        const currentRsi = rsi[rsi.length - 1];
        const currentMacd = macd[macd.length - 1];
        const currentVwap = vwap[vwap.length - 1];
        const spotPrice = parseFloat(binanceData.price);

        setData({
          market,
          event,
          prices: {
            up: outcomePrices[upIndex],
            down: outcomePrices[downIndex],
          },
          spotPrice,
          indicators: {
            rsi: currentRsi,
            macd: currentMacd,
            vwap: currentVwap,
            vwapDist: ((spotPrice - currentVwap) / currentVwap) * 100
          },
          timeLeft: Math.max(0, (new Date(market.endDate).getTime() - Date.now()) / 60000),
        });
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, CONFIG.pollIntervalMs);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 animate-spin text-blue-500" />
          <p className="text-lg font-medium">Loading Market Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-red-400">
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl max-w-md text-center">
          <p className="font-bold text-xl mb-2">Connection Error</p>
          <p className="text-sm opacity-80">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { market, event, prices, spotPrice, timeLeft, indicators } = data;

  const rsiStatus = indicators.rsi > 60 ? "Overbought" : indicators.rsi < 40 ? "Oversold" : "Neutral";
  const macdStatus = indicators.macd?.histogram > 0 ? "Bullish" : "Bearish";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-800/50 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-blue-500 font-bold text-xs uppercase tracking-widest">Live BTC Assistant</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white leading-tight">
              {market.question}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-zinc-500 text-sm font-medium">
              <span className="flex items-center gap-1.5 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                <Activity className="w-3.5 h-3.5" />
                {market.slug}
              </span>
              <span className="flex items-center gap-1.5 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                <BarChart3 className="w-3.5 h-3.5" />
                Vol: ${formatNumber(event?.volume || 0, 0)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 p-1 rounded-2xl">
            <div className="px-4 py-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Time Remaining</p>
              <div className="flex items-center gap-3">
                <Clock className={cn("w-5 h-5", timeLeft < 5 ? "text-red-500 animate-pulse" : "text-blue-500")} />
                <span className="font-mono text-2xl font-black text-white">
                  {Math.floor(timeLeft)}:{( (timeLeft % 1) * 60 ).toFixed(0).padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Binance Spot */}
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <DollarSign className="w-32 h-32" />
            </div>
            <div className="flex items-center justify-between mb-6">
              <span className="text-zinc-500 font-bold text-xs uppercase tracking-widest">BTC Spot Price</span>
              <div className="bg-zinc-800 p-2 rounded-xl">
                <DollarSign className="w-4 h-4 text-zinc-400" />
              </div>
            </div>
            <div className="text-5xl font-black tracking-tighter text-white">
              ${formatNumber(spotPrice, 2)}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold">
              <span className="text-zinc-500">Source:</span>
              <span className="text-zinc-300">Binance Real-time</span>
            </div>
          </div>

          {/* Up Prediction */}
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16" />
            <div className="flex items-center justify-between mb-6">
              <span className="text-zinc-500 font-bold text-xs uppercase tracking-widest">UP Probability</span>
              <div className="bg-emerald-500/10 p-2 rounded-xl">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
            <div className="text-5xl font-black tracking-tighter text-emerald-500">
              {formatPct(prices.up)}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold">
              <span className="text-zinc-500">Market Sentiment:</span>
              <span className="text-emerald-500/80 uppercase">Bullish</span>
            </div>
          </div>

          {/* Down Prediction */}
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-3xl -mr-16 -mt-16" />
            <div className="flex items-center justify-between mb-6">
              <span className="text-zinc-500 font-bold text-xs uppercase tracking-widest">DOWN Probability</span>
              <div className="bg-rose-500/10 p-2 rounded-xl">
                <TrendingDown className="w-4 h-4 text-rose-500" />
              </div>
            </div>
            <div className="text-5xl font-black tracking-tighter text-rose-500">
              {formatPct(prices.down)}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold">
              <span className="text-zinc-500">Market Sentiment:</span>
              <span className="text-rose-500/80 uppercase">Bearish</span>
            </div>
          </div>
        </div>

        {/* Technical Analysis Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800/50 p-8 rounded-3xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-yellow-500" />
                <h3 className="text-lg font-bold text-white">Technical Indicators</h3>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600 bg-zinc-800/50 px-2 py-1 rounded">
                1m Interval
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">RSI (14)</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{indicators.rsi?.toFixed(1)}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                    rsiStatus === "Overbought" ? "bg-rose-500/10 text-rose-500" : 
                    rsiStatus === "Oversold" ? "bg-emerald-500/10 text-emerald-500" : 
                    "bg-zinc-800 text-zinc-400"
                  )}>{rsiStatus}</span>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all duration-1000", 
                      indicators.rsi > 70 ? "bg-rose-500" : indicators.rsi < 30 ? "bg-emerald-500" : "bg-blue-500"
                    )}
                    style={{ width: `${indicators.rsi}%` }} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">MACD</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{indicators.macd?.histogram?.toFixed(2)}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                    macdStatus === "Bullish" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                  )}>{macdStatus}</span>
                </div>
                <div className="flex gap-1 h-4 items-center">
                  {[...Array(12)].map((_, i) => (
                    <div 
                      key={i} 
                      className={cn("w-full rounded-sm", 
                        macdStatus === "Bullish" ? "bg-emerald-500/40" : "bg-rose-500/40",
                        i === 6 && "h-full bg-white/20"
                      )} 
                      style={{ height: `${Math.random() * 100}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">VWAP Distance</p>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-2xl font-black", indicators.vwapDist > 0 ? "text-emerald-500" : "text-rose-500")}>
                    {indicators.vwapDist > 0 ? "+" : ""}{indicators.vwapDist?.toFixed(3)}%
                  </span>
                </div>
                <p className="text-[10px] text-zinc-600 font-medium">Price vs Volume Weighted Average</p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800/50 p-8 rounded-3xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Info className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-bold text-white">Market Summary</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/30">
                  <span className="text-zinc-500 text-sm font-medium">YES Rate</span>
                  <span className="font-bold text-emerald-500">${(prices.up * 100).toFixed(2)}¢</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/30">
                  <span className="text-zinc-500 text-sm font-medium">NO Rate</span>
                  <span className="font-bold text-rose-500">${(prices.down * 100).toFixed(2)}¢</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/30">
                  <span className="text-zinc-500 text-sm font-medium">Liquidity</span>
                  <span className="font-bold text-zinc-200">${formatNumber(market.liquidityNum || Number(market.liquidity) || 0, 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800/30">
                  <span className="text-zinc-500 text-sm font-medium">Volume</span>
                  <span className="font-bold text-zinc-200">${formatNumber(event?.volume || 0, 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-zinc-500 text-sm font-medium">Resolution</span>
                  <span className="font-bold text-zinc-200">{new Date(market.endDate).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-8 grid grid-cols-2 gap-4">
              <button className="group relative bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-4 rounded-2xl font-black transition-all active:scale-95 overflow-hidden">
                <span className="relative z-10">BET UP</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>
              <button className="group relative bg-rose-500 hover:bg-rose-400 text-zinc-950 py-4 rounded-2xl font-black transition-all active:scale-95 overflow-hidden">
                <span className="relative z-10">BET DOWN</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>
            </div>
          </div>
        </div>

        <footer className="flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-600 text-[10px] font-bold uppercase tracking-[0.2em] pt-12 pb-8 border-t border-zinc-900">
          <p>© 2026 Polymarket BTC 15m Assistant</p>
          <p>Created by @krajekis • Powered by Binance & Polymarket API</p>
        </footer>
      </div>
    </div>
  );
}
