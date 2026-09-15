# Alarm Interpretation (告警解读)

Use this reference when the user asks whether an alert is normal, what peak QPS was, or whether CPU / throttle / invocation metrics look healthy.

## Hard rule: metrics tool only

- **Always** query metrics with `queryEnv(action="metrics", envId="<EnvId>", metricName="<name>")`.
- **Never** call `callCloudApi` (or guess Monitor / TCB Action names) to fetch curves. The MCP path already wraps `DescribeCurveData` via Manager SDK.
- Prefer the returned `Summary` (`max`, `min`, `avg`, `latest`, `peakTimestamp`, `allZero`) before dumping the full `Curve`.

## Default inspection window

- Alert triage: last **1 hour** (`startTime` / `endTime`, format `YYYY-MM-DD HH:mm:ss`)
- Peak / trend questions: last **24 hours** (tool default when times omitted)
- Incident window: narrow to the reported alert time ± 30–60 minutes

## Metric → question map

| User question | metricName | Notes |
|---------------|------------|-------|
| Peak / current QPS | `GatewayTraceEnvQPS` (preferred) or `EnvQPSAll` | Env-level `resourceID` defaults to `all|:|all|:|all|:|all` |
| Function call volume / "调用量为 0" | `FunctionInvocation` | Pass `resourceID=<functionName>` when scoped |
| Function errors | `FunctionError` | Pair with invocation |
| Function timeout | `FunctionTimeout` | |
| Throttle / 429 pressure | `FunctionThrottle` | Also search CLS for `429` |
| MySQL CPU alert | `MysqlCpuUsageRate` | Percent-like usage |
| MySQL memory / disk | `MysqlMemoryUse` / `MysqlStorageUsage` | |
| MySQL QPS / slow queries | `MysqlQps` / `MysqlSlowQueries` | |
| CloudRun CPU / QPS / HTTP errors | `TkeCpuUsedService` / `TkeQPSService` / `TkeHttpErrorService` | `resourceID` = service name (required) |

## Baseline thresholds (skill defaults)

These are **interpretation defaults for Agent answers**, not a substitute for the customer's contracted package. Always state the baseline used, and cross-check `envQuery(action="info")` / `envQuery(action="usage")` for package hints when available.

| Signal | Warning | Critical | Healthy interpretation |
|--------|---------|----------|------------------------|
| Gateway / env QPS vs common integration package (500 QPS) | Peak ≥ **70%** of package (≈350) | Peak ≥ **90%** of package (≈450) or sustained ≥ package | Peak well below package → alert may be false positive or short spike |
| MySQL CPU (`MysqlCpuUsageRate`) | Peak ≥ **80** | Peak ≥ **90** or sustained ≥ 80 for most of the window | Peak < 70 → "CPU 告警偏误报/短时尖刺可能性高" unless alert rule is stricter |
| MySQL memory / disk usage | Peak ≥ **80%** of capacity when unit is percent-like | Peak ≥ **90%** | Below 70% → capacity alert likely not sustained |
| Function error rate (`FunctionError.max` / max(`FunctionInvocation.max`, 1)) | ≥ **1%** | ≥ **5%** | Near 0 with healthy invocations → function path OK |
| Function throttle (`FunctionThrottle`) | Any non-zero in window | Sustained non-zero with user-visible 429 | allZero → throttle not evidenced by metrics |
| Function invocation | — | `Summary.allZero === true` while user expects traffic | See fault playbook "调用量为 0" |

If the environment package QPS is known and **not** 500, recompute 70%/90% against that value. If unknown, say: "按常见集成版默认 500 QPS 解读；若你们已升配，请以合同/控制台配额为准。"

## How to answer "CPU 告警是否正常？"

1. Confirm env: `envQuery(action="info", envId="...")`.
2. Pull `queryEnv(action="metrics", metricName="MysqlCpuUsageRate", ...)` for the alert window (and optionally last 24h for context).
3. Read `Summary.max` / `avg` / `latest` / `peakTimestamp`.
4. Compare to the MySQL CPU baselines above.
5. Answer in plain language, for example:
   - Peak 42%, avg 18% → **告警偏不正常触发或已恢复**：当前窗口未达到 80% 基线。
   - Peak 93% near the alert time → **告警合理**：峰值超过 90% 临界线，建议查慢查询 / 连接数 / 是否变配中。
6. Optional correlates: `MysqlSlowQueries`, `MysqlDbConnections`, `MysqlQps`.

## How to answer "峰值 QPS 多少？"

1. `queryEnv(action="metrics", metricName="GatewayTraceEnvQPS", envId="...")` (default last 24h or user window).
2. Report **`Summary.max` as 峰值 QPS**，并附上 `peakTimestamp`（若有）与 `avg` / `latest`.
3. Compare to package baseline (default 500 unless known otherwise) and state headroom: `headroom = package - peak`.
4. If `sampleCount === 0`, say metrics returned empty — do not invent a number; suggest console monitor and retry with a wider window.

## Report section template

```markdown
## 告警解读

| 问题 | 指标 | 窗口峰值 | 基线 | 结论 |
|------|------|----------|------|------|
| CPU 告警是否正常 | MysqlCpuUsageRate | ${max} | warn≥80 / crit≥90 | ... |
| 峰值 QPS | GatewayTraceEnvQPS | ${max} @ ${peakTimestamp} | package=${packageQps} | ... |

说明：基线为 ops-inspector 默认解读阈值；实际配额以环境套餐为准。
禁止使用 callCloudApi 拉取监控。
```
