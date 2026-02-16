# BTC 15-Min Price Prediction Dashboard

A minimal, dark-themed Next.js dashboard that displays live BTC price data from Binance and Polymarket prediction data in real-time.

## Features

- **Live Price Tracking**: Real-time BTC/USDT price from Binance via WebSocket
- **Polymarket Integration**: Live UP/DOWN prediction data from Polymarket
- **Interactive Chart**: Dual-line chart showing BTC price and scaled Polymarket data
  - Green line: BTC price from Binance
  - Red line: Polymarket UP probability (scaled)
  - Gray dashed line: Reference price (15-min opening price, representing 50% on Polymarket)
- **Visual Separation**: Clear distinction between Binance (green) and Polymarket (red) data
- **No Roundedness**: Sharp, minimal UI design with no rounded corners
- **Dark Theme**: Pure black background with high contrast

## How It Works

The dashboard tracks BTC price movements and Polymarket predictions in 15-minute windows:

1. At the start of each 15-minute window, the opening BTC price is captured as a reference
2. This reference price represents the "50%" point for Polymarket predictions
3. The chart scales Polymarket UP probabilities to align with BTC prices:
   - 50% UP = Reference price (shown as gray dashed line)
   - Higher UP % = Higher scaled price (above reference)
   - Lower UP % = Lower scaled price (below reference)

## Installation

```bash
npm install
```

## Running the Dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Building for Production

```bash
npm run build
npm start
```

## Technology Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Recharts** - Chart visualization
- **WebSocket** - Real-time data streaming from Binance and Polymarket

## Data Sources

- **Binance**: Live BTC/USDT trades via `wss://stream.binance.com:9443/ws/btcusdt@trade`
- **Polymarket**: Live crypto prices via `wss://ws-live-data.polymarket.com`
