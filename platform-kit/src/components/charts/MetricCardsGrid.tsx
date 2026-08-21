import * as React from "react";
import type { MetricSeries } from "../../core/types.js";
import { SparkChart } from "./SparkChart.js";
import { EmptyState } from "../resources/ResourceParts.js";

export interface MetricCardsGridProps {
  series: MetricSeries[];
  loading?: boolean;
  onRefresh?: () => void;
  refreshLabel?: string;
  title?: string;
  labelFor?: (name: string, fallback: string) => string;
  emptyLabel?: string;
}

function isBlankMetric(item: MetricSeries): boolean {
  const label = (item.valueLabel ?? "").trim();
  return label === "" || label === "—" || label === "-" || label === "N/A";
}

export function MetricCardsGrid(props: MetricCardsGridProps): React.ReactElement {
  const allBlank =
    !props.loading &&
    (props.series.length === 0 ||
      props.series.every((item) => isBlankMetric(item) && (!item.points || item.points.length === 0)));

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
      {allBlank ? (
        <EmptyState>{props.emptyLabel ?? "—"}</EmptyState>
      ) : (
        <div className="cb-kit-metrics">
          {props.series.map((item) => (
            <div key={item.name} className={`cb-kit-metric${item.danger ? " danger" : ""}`}>
              <div className="k">{props.labelFor?.(item.name, item.label) ?? item.label}</div>
              <div className="v">{props.loading ? "…" : isBlankMetric(item) ? (props.emptyLabel ? "…" : "—") : item.valueLabel}</div>
              <SparkChart points={item.points} variant={item.danger ? "danger" : "default"} width={120} height={36} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
