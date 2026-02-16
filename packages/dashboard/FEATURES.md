# Dashboard Features Summary

## What Was Built

A complete Next.js React TypeScript dashboard application that displays live BTC trading data and Polymarket predictions.

## Key Features

### 1. **Minimal Dark UI**
- Pure black background (`#000000`)
- High contrast text and borders
- **No rounded corners anywhere** - all elements use sharp, square borders
- Monospace fonts for numerical data

### 2. **Visual Data Separation**
- **Binance Data**: Green theme with green border (`border-green-500/50`)
  - Live BTC/USDT price
  - Price change from reference
  - Connection status indicator
  
- **Polymarket Data**: Red theme with red border (`border-red-500/50`)
  - UP/DOWN percentages
  - Deviation from 50%
  - Connection status indicator

### 3. **Synchronized Chart**
- Dual-line chart showing both data sources on the same graph
- **Green line**: Live BTC price from Binance
- **Red line**: Polymarket UP probability (scaled to match BTC price range)
- **Gray dashed line**: Reference price representing 50% on Polymarket

### 4. **Reference Price Alignment**
The chart implements the requested feature where:
- At the start of each 15-minute window, the opening BTC price is captured
- This opening price represents the "50%" neutral point for Polymarket
- The Polymarket UP percentage is scaled so that:
  - 50% UP = Reference price (shown as the gray dashed line)
  - Higher percentages are scaled above the reference
  - Lower percentages are scaled below the reference

### 5. **Live WebSocket Connections**
- **Binance**: Real-time BTC/USDT trade stream
- **Polymarket**: Real-time crypto price feed with Chainlink data
- Auto-reconnection with exponential backoff
- Connection status indicators

### 6. **Time Management**
- 15-minute window tracking
- Countdown timer showing time remaining in current window
- Automatic reference price capture at window start

## Technical Implementation

### Architecture
```
packages/dashboard/
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Main page (renders Dashboard)
│   └── globals.css         # Dark theme with no roundedness
├── components/
│   ├── Dashboard.tsx       # Main dashboard component
│   ├── PriceChart.tsx      # Recharts visualization
│   ├── BinanceDataDisplay.tsx    # Binance data panel
│   └── PolymarketDataDisplay.tsx # Polymarket data panel
├── hooks/
│   ├── useBinanceWebSocket.ts    # Binance WS connection
│   └── usePolymarketWebSocket.ts # Polymarket WS connection
├── lib/
│   ├── config.ts           # Configuration constants
│   └── types.ts            # TypeScript interfaces
└── package.json
```

### Data Flow
1. WebSocket hooks establish connections to Binance and Polymarket
2. Dashboard component receives live data updates
3. Reference price is captured at the start of each 15-minute window
4. Chart data is accumulated (max 60 points)
5. Polymarket data is scaled relative to the reference price for visualization
6. UI updates in real-time showing both raw and scaled data

## Running the Application

Development:
```bash
cd packages/dashboard
npm run dev
```

Production:
```bash
npm run build
npm start
```

The dashboard will be available at http://localhost:3000 (or the next available port).

## Design Philosophy

- **Minimal**: No unnecessary decorations or rounded corners
- **Dark**: Pure black background for reduced eye strain
- **Clear**: High contrast and visual separation between data sources
- **Functional**: All data is immediately visible without scrolling
