import * as React from "react";
import type { MetricSeries } from "../../core/types.js";
import { SparkChart } from "./SparkChart.js";

export interface MetricCardsGridProps {
  series: MetricSeries[];
  loading?: boolean;
  onRefresh?: () => void;
  refreshLabel?: string;
  title?: string;
  labelFor?: (name: string, fallback: string) => string;
}

export function MetricCardsGrid(props: MetricCardsGridProps): React.ReactElement {
  return (
    <div className="cb-kit-section">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div className="cb-kit-section-h" style={{ margin: 0 }}>
          {props.title}
        </div>
        {props.onRefresh ? (
          <button type="button" className="cb-kit-btn ghost" onClick={props.onRefresh}>
            {props.refreshLabel ?? "Refresh"}
          </button>
        ) : null}
      </div>
      <div className="cb-kit-metrics">
        {props.series.map((item) => (
          <div key={item.name} className={`cb-kit-metric${item.danger ? " danger" : ""}`}>
            <div className="k">{props.labelFor?.(item.name, item.label) ?? item.label}</div>
            <div className="v">{props.loading ? "…" : item.valueLabel}</div>
            <SparkChart points={item.points} variant={item.danger ? "danger" : "default"} width={120} height={36} />
          </div>
        ))}
      </div>
    </div>
  );
}
