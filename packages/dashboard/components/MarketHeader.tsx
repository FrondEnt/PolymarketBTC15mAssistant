import React from "react";
import styles from "./MarketHeader.module.css";
import { formatNumber } from "./utils";

interface MarketHeaderProps {
  title: string;
  dateStr: string;
  priceToBeat: number | null;
  currentPrice: number | null;
  prevPrice: number | null;
  timeLeftMin: number | null;
}

export const MarketHeader: React.FC<MarketHeaderProps> = ({
  title,
  dateStr,
  priceToBeat,
  currentPrice,
  prevPrice,
  timeLeftMin,
}) => {
  const priceDelta =
    currentPrice !== null && prevPrice !== null ? currentPrice - prevPrice : 0;
  const isUp = priceDelta > 0;
  const isDown = priceDelta < 0;

  const formatTime = (totalMinutes: number | null) => {
    if (totalMinutes === null) return { mins: "00", secs: "00" };
    const mins = Math.floor(totalMinutes);
    const secs = Math.floor((totalMinutes - mins) * 60);
    return {
      mins: mins.toString().padStart(2, "0"),
      secs: secs.toString().padStart(2, "0"),
    };
  };

  const { mins, secs } = formatTime(timeLeftMin);

  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
        <div className={styles.iconWrapper}>
          <div className={styles.btcIcon}>₿</div>
        </div>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.dateStr}>{dateStr}</p>
        </div>
      </div>

      <div className={styles.centerSection}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>PRICE TO BEAT</span>
          <span className={styles.statValue}>
            ${priceToBeat !== null ? formatNumber(priceToBeat, 2) : "---"}
          </span>
        </div>
        <div className={styles.divider} />
        <div className={styles.statItem}>
          <div className={styles.currentPriceLabelRow}>
            <span className={styles.statLabel}>CURRENT PRICE</span>
            {priceDelta !== 0 && (
              <span className={`${styles.delta} ${isUp ? styles.up : styles.down}`}>
                {isUp ? "▲" : "▼"} ${Math.abs(priceDelta).toFixed(2)}
              </span>
            )}
          </div>
          <span className={`${styles.statValue} ${styles.highlight}`}>
            ${currentPrice !== null ? formatNumber(currentPrice, 2) : "---"}
          </span>
        </div>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.timer}>
          <div className={styles.timerUnit}>
            <span className={styles.timerValue}>{mins}</span>
            <span className={styles.timerLabel}>MINS</span>
          </div>
          <div className={styles.timerUnit}>
            <span className={styles.timerValue}>{secs}</span>
            <span className={styles.timerLabel}>SECS</span>
          </div>
        </div>
      </div>
    </div>
  );
};
