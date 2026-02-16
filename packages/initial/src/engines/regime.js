export function detectRegime({ price, vwap, vwapSlope, vwapCrossCount, volumeRecent, volumeAvg }) {
  if (price === null || vwap === null || vwapSlope === null) return { regime: "CHOP", reason: "missing_inputs" };

  const above = price > vwap;

  const lowVolume = volumeRecent !== null && volumeAvg !== null ? volumeRecent < 0.6 * volumeAvg : false;
  if (lowVolume && Math.abs((price - vwap) / vwap) < 0.001) {
    return { regime: "CHOP", reason: "low_volume_flat" };
  }

  if (above && vwapSlope > 0) {
    return { regime: "TREND_UP", reason: "price_above_vwap_slope_up" };
  }

  if (!above && vwapSlope < 0) {
    return { regime: "TREND_DOWN", reason: "price_below_vwap_slope_down" };
  }

  if (vwapCrossCount !== null && vwapCrossCount >= 3) {
    return { regime: "RANGE", reason: "frequent_vwap_cross" };
  }

  return { regime: "RANGE", reason: "default" };
}
