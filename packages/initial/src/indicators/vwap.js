export function computeSessionVwap(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return null;

  let pv = 0;
  let v = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    v += c.volume;
  }
  if (v === 0) return null;
  return pv / v;
}

export function computeVwapSeries(candles) {
  const series = [];
  for (let i = 0; i < candles.length; i += 1) {
    const sub = candles.slice(0, i + 1);
    series.push(computeSessionVwap(sub));
  }
  return series;
}
