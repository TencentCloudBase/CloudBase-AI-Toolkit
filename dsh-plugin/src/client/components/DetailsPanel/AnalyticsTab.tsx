import * as React from "react";
import type { CloudBaseData, LogEntry, MetricSeries, TableSummary, UsageItem } from "../../../shared/types.js";
import { friendlyError } from "../../lib/parse-tool-result.js";
import { SparkChart } from "../../kit/components/SparkChart.js";
import { SuggestionsPanel } from "../../kit/components/SuggestionsPanel.js";

export function AnalyticsTab(props: { data?: CloudBaseData }): React.ReactElement {
  const [metrics, setMetrics] = React.useState<MetricSeries[]>([]);
  const [usage, setUsage] = React.useState<UsageItem[]>([]);
  const [errors, setErrors] = React.useState<LogEntry[]>([]);
  const [tables, setTables] = React.useState<TableSummary[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!props.data) {
      setError("cloudbaseData 服务未注入。");
      return;
    }
    void Promise.all([
      props.data.metrics(),
      props.data.usage(),
      props.data.recentErrors(),
      props.data.listTables().catch(() => []),
    ])
      .then(([nextMetrics, nextUsage, nextErrors, nextTables]) => {
        setMetrics(nextMetrics);
        setUsage(nextUsage);
        setErrors(nextErrors);
        setTables(nextTables);
        setError(undefined);
      })
      .catch((err: unknown) => setError(friendlyError(err instanceof Error ? err.message : String(err))));
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
            <SparkChart points={item.points} danger={item.danger} />
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
      <SuggestionsPanel tables={tables} errors={errors} />
    </div>
  );
}
