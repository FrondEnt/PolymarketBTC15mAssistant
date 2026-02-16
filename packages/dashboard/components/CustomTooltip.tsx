import styles from "./Dashboard.module.css";

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const btc = payload.find((p: any) => p.dataKey === "btc");
  const poly = payload.find((p: any) => p.dataKey === "poly");
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {btc && (
        <div className={styles.tooltipBtc}>
          BTC <span className={styles.tooltipWhite}>${btc.value?.toLocaleString()}</span>
        </div>
      )}
      {poly && (
        <div className={styles.tooltipPoly}>
          UP <span className={styles.tooltipWhite}>{(poly.value * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
};
