import * as React from "react";
import type { CloudBaseData, LogEntry, MetricSeries, UsageItem } from "../../../shared/types.js";

function Spark(props: { points: number[]; danger?: boolean }): React.ReactElement {
  const points = props.points.length > 1 ? props.points : [0, 0];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const coords = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 120;
      const y = 32 - ((value - min) / span) * 28;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="cb-spark" viewBox="0 0 120 36" preserveAspectRatio="none">
      <polyline
        points={coords}
        fill="none"
        stroke={props.danger ? "#cf222e" : "#16181d"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AnalyticsTab(props: { data?: CloudBaseData }): React.ReactElement {
  const [metrics, setMetrics] = React.useState<MetricSeries[]>([]);
  const [usage, setUsage] = React.useState<UsageItem[]>([]);
  const [errors, setErrors] = React.useState<LogEntry[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!props.data) {
      setError("cloudbaseData 服务未注入。");
      return;
    }
    void Promise.all([props.data.metrics(), props.data.usage(), props.data.recentErrors()])
      .then(([nextMetrics, nextUsage, nextErrors]) => {
        setMetrics(nextMetrics);
        setUsage(nextUsage);
        setErrors(nextErrors);
        setError(undefined);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [props.data]);

  return (
    <div className="cb-dpanel">
      {error ? <div className="cb-error">{error}</div> : null}
      <div className="cb-tree-sec">指标 · queryEnv metrics</div>
      <div className="cb-chart-grid">
        {metrics.map((item) => (
          <div className="cb-chart-card" key={item.name}>
            <div className="cb-chart-head">
              <span>{item.label}</span>
              <span className="cb-spacer" />
              <span style={{ fontFamily: "var(--cb-mono)", color: item.danger ? "#cf222e" : "#16181d" }}>
                {item.valueLabel}
              </span>
            </div>
            <Spark points={item.points} danger={item.danger} />
          </div>
        ))}
      </div>
      <div className="cb-tree-sec">用量 · queryEnv usage</div>
      <div className="cb-env-list" style={{ paddingTop: 4 }}>
        {usage.map((item) => (
          <div className="cb-env-row" key={item.productName}>
            <span className="k">{item.productName}</span>
            <span className="v">{item.usedLabel}</span>
          </div>
        ))}
        {usage.length === 0 ? <div className="cb-placeholder">暂无用量数据（需已登录环境）</div> : null}
      </div>
      <div className="cb-tree-sec">最近错误 · queryLogs</div>
      <div className="cb-env-list" style={{ paddingTop: 4 }}>
        {errors.map((item, index) => (
          <div className="cb-env-row" key={`${item.title}-${index}`}>
            <span className="k" style={{ color: "#cf222e" }}>
              {item.title}
            </span>
            <span className="v">{item.time ?? "—"}</span>
          </div>
        ))}
        {errors.length === 0 ? <div className="cb-placeholder">暂无错误日志（需 CLS 开通）</div> : null}
      </div>
    </div>
  );
}
