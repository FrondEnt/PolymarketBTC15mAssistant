import styles from "./Dashboard.module.css";

export function DataRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className={styles.dataRow}>
      <span className={styles.dataRowLabel}>{label}</span>
      <span className={styles.dataRowValue} style={{ color: valueColor || "#888" }}>
        {value}
      </span>
    </div>
  );
}
