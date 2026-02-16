function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;

  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

export function computeMacd(closes, fast, slow, signal) {
  if (!Array.isArray(closes) || closes.length < slow + signal) return null;

  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  if (fastEma === null || slowEma === null) return null;

  const macdLine = fastEma - slowEma;

  const macdSeries = [];
  for (let i = 0; i < closes.length; i += 1) {
    const sub = closes.slice(0, i + 1);
    const f = ema(sub, fast);
    const s = ema(sub, slow);
    if (f === null || s === null) continue;
    macdSeries.push(f - s);
  }

  const signalLine = ema(macdSeries, signal);
  if (signalLine === null) return null;

  const hist = macdLine - signalLine;

  const lastHist = hist;
  const prevHist = macdSeries.length >= signal + 1 ? (macdSeries[macdSeries.length - 2] - ema(macdSeries.slice(0, macdSeries.length - 1), signal)) : null;

  return {
    macd: macdLine,
    signal: signalLine,
    hist,
    histDelta: prevHist === null ? null : lastHist - prevHist
  };
}
