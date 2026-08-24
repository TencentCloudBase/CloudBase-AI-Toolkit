---
name: ops-inspector
description: AIOps-style CloudBase inspection skill (v3). Use when users need health checks, log diagnosis, alarm interpretation (CPU alert normal?, peak QPS), metrics via queryEnv(action=metrics), or fault playbooks for 429 / function 404 / ACCESS_TOKEN_INVALID / zero invocations. Triggers on 巡检, 诊断, 告警, 峰值 QPS, 限频, 调用量为 0, troubleshooting.
version: 2.31.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## Activation Contract

### Use this first when

- The user wants to check the health or status of CloudBase resources (cloud functions, CloudRun, databases, storage, etc.).
- The user reports errors, failures, or abnormal behavior and wants a quick diagnosis.
- The user asks for an "inspection", "health check", "巡检", "诊断", or "troubleshooting" of their CloudBase environment.
- The user wants to review recent error logs across services.
- The user asks **告警解读** questions: whether a **CPU 告警** is normal, what **峰值 QPS** was, or whether throttle/error metrics look healthy.
- The symptom matches a v3 fault playbook: **429 / 限频**, **云函数 404**, **ACCESS_TOKEN_INVALID**, or **调用量为 0**.

### Read before writing code if

- The inspection reveals code-level issues in cloud functions or CloudRun services — then read the relevant implementation skill before suggesting fixes.
- The user wants to fix a problem found during inspection rather than just diagnose it.

### Then also read

- Alarm interpretation baselines -> `references/alarm-interpretation.md`
- Fault playbooks (429 / 404 / token / zero calls) -> `references/fault-playbooks.md`
- Cloud function issues -> `../cloud-functions/SKILL.md`
- CloudRun issues -> `../cloudrun-development/SKILL.md`
- Database issues -> `../postgresql-development-cloudbase/SKILL.md` for CloudBase PG / PostgreSQL, `../relational-database-mcp-cloudbase/SKILL.md` for MySQL, or `../cloudbase-document-database-web-sdk/SKILL.md` for NoSQL
- Auth readiness (token failures) -> `../auth-tool-cloudbase/SKILL.md`
- Platform overview -> `../cloudbase-platform/SKILL.md`

### Do NOT use for

- Deploying new resources or writing application code. This skill is read-only and diagnostic.
- Replacing proper monitoring/alerting infrastructure. It provides point-in-time inspection, not continuous monitoring.
- Directly fixing problems — it diagnoses and recommends; actual fixes should use the appropriate implementation skill.
- Fetching metrics by guessing cloud API Actions. **Never** use `callCloudApi` for monitor curves — always use `queryEnv(action="metrics")`.

### Common mistakes / gotchas

- Running a full inspection without first confirming the environment is bound (`auth` tool must show logged-in and env-bound state).
- Ignoring CLS log service status — if CLS is not enabled, `queryLogs` will fail; always check first with `queryLogs(action="checkLogService")`.
- Searching logs without a time range — this can return excessive or irrelevant results. Always scope searches to a relevant time window.
- Treating a single error log as the root cause without correlating across resources. A function error may stem from a database or config issue.
- Answering "峰值 QPS" / "CPU 告警是否正常" from screenshots or memory instead of `queryEnv(action="metrics")`.
- Calling `callCloudApi` with invented `GetMonitorData` / `DescribeCurveData` parameters — the metrics branch already wraps Manager SDK.

### Minimal checklist

- [ ] Environment is bound and accessible (`envQuery(action="info")`)
- [ ] Metrics pulled with `queryEnv(action="metrics")` when the question involves QPS / CPU / throttle / invocation volume
- [ ] CLS log service is enabled (`queryLogs(action="checkLogService")`) when log diagnosis is needed
- [ ] Matching fault playbook selected when symptoms match 429 / function 404 / ACCESS_TOKEN_INVALID / 调用量为 0
- [ ] Time range is specified for any log or metrics searches
- [ ] Findings are summarized with severity levels, **告警解读**, and actionable recommendations

---

## How to use this skill (for a coding agent)

### Ops Inspector v3 additions

v3 adds two mandatory capabilities on top of log/resource inspection:

1. **告警解读** — pull metrics, compare to baselines in `references/alarm-interpretation.md`, answer CPU-alert / peak-QPS style questions in plain language.
2. **故障剧本** — when symptoms match, follow `references/fault-playbooks.md` instead of ad-hoc tool fishing.

### Inspection Modes

| Mode | When to use | Scope |
|------|-------------|-------|
| **Full inspection** | User asks for a general health check / 巡检 / 全面检查 | All resource types + core metrics |
| **Targeted inspection** | User reports a specific error or asks about a specific resource | One resource type or playbook |
| **Alarm interpretation** | User asks CPU 告警是否正常 / 峰值 QPS / 是否限流 | Metrics-first, then logs |
| **Fault playbook** | 429 / function 404 / ACCESS_TOKEN_INVALID / 调用量为 0 | Playbook steps only |

### Full Inspection Workflow

Follow these steps in order for a comprehensive environment health check:

**Step 1 — Environment Check**

```
envQuery(action="info")
```

Confirm the environment is accessible. Record the `envId` for console link generation.

**Step 2 — Metrics snapshot (v3)**

```
queryEnv(action="metrics", envId="<EnvId>", metricName="GatewayTraceEnvQPS")
queryEnv(action="metrics", envId="<EnvId>", metricName="FunctionInvocation")
queryEnv(action="metrics", envId="<EnvId>", metricName="MysqlCpuUsageRate")
```

Use returned `Summary.max` / `avg` / `allZero` / `peakTimestamp`. Add `FunctionError`, `FunctionThrottle`, or CloudRun `Tke*` metrics when those resources exist. Read `references/alarm-interpretation.md` before concluding.

**Step 3 — Log Service Status**

```
queryLogs(action="checkLogService")
```

If CLS is not enabled, note this as a **warning** — log-based diagnosis will be unavailable. Recommend enabling CLS in the console: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/devops/log`

**Step 4 — Cloud Functions Inspection**

```
queryFunctions(action="listFunctions")
```

For each function, check:
- **Status**: Is the function in an active/deployed state?
- **Recent errors**: `queryFunctions(action="listFunctionLogs", functionName="<name>", startTime="<recent>")`
- **Common issues**:
  - Timeout errors (execution exceeded limit)
  - Memory limit exceeded
  - Runtime errors (unhandled exceptions)
  - Cold start frequency
  - Zero invocations while traffic is expected → Playbook 4

**Step 5 — CloudRun Services Inspection**

```
queryCloudRun(action="list")
```

For each service, check:
- **Status**: Is the service running?
- **Detail**: `queryCloudRun(action="detail", detailServerName="<name>")`
- **Metrics**: `queryEnv(action="metrics", metricName="TkeQPSService", resourceID="<serviceName>")` (resourceID required)
- **Common issues**:
  - Service not running (scaled to zero or crashed)
  - Image pull failures
  - OOMKilled events
  - Health check failures

**Step 6 — Error Log Aggregation** (if CLS is enabled)

```
queryLogs(action="searchLogs", queryString="ERROR", service="tcb", startTime="<24h-ago>", limit=50)
queryLogs(action="searchLogs", queryString="ERROR", service="tcbr", startTime="<24h-ago>", limit=50)
```

Look for patterns:
- Repeated error messages (same error many times)
- Cascading failures (errors in multiple services around the same time)
- Timeout / 429 / 404 / ACCESS_TOKEN_INVALID patterns → jump to the matching playbook

**Step 7 — Summary Report**

Generate a structured report:

```markdown
# CloudBase Resource Inspection Report

**Environment**: ${envId}
**Inspection Time**: ${timestamp}

## Overall Health: ✅ Healthy / ⚠️ Warnings Found / ❌ Issues Found

## 告警解读
| 问题 | 指标 | 窗口峰值 | 基线 | 结论 |
|------|------|----------|------|------|
| 峰值 QPS | GatewayTraceEnvQPS | ... | package default 500 unless known | ... |
| CPU 告警是否正常 | MysqlCpuUsageRate | ... | warn≥80 / crit≥90 | ... |

### Cloud Functions
| Function | Status | Recent Errors | Invocations | Severity |
|----------|--------|---------------|-------------|----------|
| ... | ... | ... | ... | ... |

### CloudRun Services
| Service | Status | Issues | Severity |
|---------|--------|--------|----------|
| ... | ... | ... | ... |

### Error Log Summary
- Total errors in last 24h: N
- Top error patterns: ...

## Recommendations
1. ...
2. ...

## Console Links
- Cloud Functions: https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf
- CloudRun: https://tcb.cloud.tencent.com/dev?envId=${envId}#/platform-run
- Logs: https://tcb.cloud.tencent.com/dev?envId=${envId}#/devops/log
- Monitor: https://tcb.cloud.tencent.com/dev?envId=${envId}#/devops
```

### Targeted Inspection Workflow

When the user specifies a resource type or a specific resource:

1. **Cloud function errors**: `queryFunctions(action="listFunctionLogs", functionName="<name>")` then `queryLogs(action="searchLogs", queryString="* AND functionName:<name> AND level:ERROR", ...)`
2. **CloudRun errors**: `queryCloudRun(action="detail", detailServerName="<name>")` then `queryLogs(action="searchLogs", queryString="ERROR", service="tcbr", ...)`
   - If logs show DB / Redis connection failures (`ECONNREFUSED`, timeout, "could not connect"): check whether `VpcConf` is set and matches the database VPC. See `cloudrun-development/references/vpc-and-database.md`.
3. **Database issues**: Check `queryPgDatabase(action="context"|"metadata"|"objects")` for CloudBase PG, `queryMysqlDatabase` for MySQL, or `readNoSqlDatabaseStructure` for NoSQL depending on type; for CPU/disk alerts also pull `MysqlCpuUsageRate` / `MysqlStorageUsage` metrics
4. **General error search**: `queryLogs(action="searchLogs", queryString="<error-keyword>", ...)`
5. **Alarm / QPS questions**: follow `references/alarm-interpretation.md`
6. **429 / function 404 / ACCESS_TOKEN_INVALID / 调用量为 0**: follow `references/fault-playbooks.md`

### AIOps Methodology

This skill follows AIOps principles for intelligent inspection:

1. **Data Collection**: Gather metrics (`queryEnv` metrics), logs, and resource states via MCP tools — never via ad-hoc `callCloudApi`
2. **Pattern Recognition**: Identify recurring errors, anomaly patterns, and correlations across services
3. **Baseline Comparison**: Compare metric `Summary` values to skill baselines (告警解读)
4. **Root Cause Hypothesis**: Based on error patterns + metrics, suggest likely root causes
5. **Actionable Recommendations**: Provide specific, prioritized remediation steps with links to relevant skills and console pages

### Severity Levels

| Level | Icon | Meaning |
|-------|------|---------|
| Critical | ❌ | Service is down or data is at risk; requires immediate action |
| Warning | ⚠️ | Errors detected but service is still partially functional; investigate soon |
| Info | ℹ️ | No errors found; informational status only |
| Healthy | ✅ | Resource is operating normally |

### Preferred Tool Map

| Operation | MCP Tool Call |
|-----------|---------------|
| Check environment | `envQuery(action="info")` |
| Query metrics (QPS/CPU/invocations) | `queryEnv(action="metrics", envId, metricName="...")` |
| Check CLS status | `queryLogs(action="checkLogService")` |
| List cloud functions | `queryFunctions(action="listFunctions")` |
| Get function detail | `queryFunctions(action="getFunctionDetail", functionName="<name>")` |
| Get function logs | `queryFunctions(action="listFunctionLogs", functionName="<name>", startTime="<time>", endTime="<time>")` |
| Get function log detail | `queryFunctions(action="getFunctionLogDetail", requestId="<id>")` |
| List CloudRun services | `queryCloudRun(action="list")` |
| Get CloudRun detail | `queryCloudRun(action="detail", detailServerName="<name>")` |
| Search CLS logs | `queryLogs(action="searchLogs", queryString="<query>", service="tcb\|tcbr", startTime="<time>", endTime="<time>")` |
| Check NoSQL structure | `readNoSqlDatabaseStructure(action="listCollections")` |
| Check PostgreSQL context | `queryPgDatabase(action="context")` |
| Check PostgreSQL metadata | `queryPgDatabase(action="metadata", limit=20)` |
| Check MySQL status | `queryMysqlDatabase(action="getContext")` |
| Auth provider readiness | `queryAppAuth` / auth-tool skill (for ACCESS_TOKEN_INVALID) |

### Common CLS Query Patterns

| Scenario | queryString |
|----------|-------------|
| All errors | `ERROR` |
| Function timeout | `timeout OR 超时` |
| Function OOM | `OOM OR out of memory OR 内存超限` |
| CloudRun crash | `crash OR OOMKilled OR Error` |
| Specific function errors | `functionName:<name> AND level:ERROR` |
| 5xx HTTP errors | `statusCode:>499` |
| 429 / throttle | `429 OR throttle OR 限流 OR FREQUENCY` |
| Function 404 | `404 OR FUNCTION_NOT_FOUND` |
| Token invalid | `ACCESS_TOKEN_INVALID OR token invalid` |
| Cold start issues | `coldStart OR 冷启动` |

### Time Range Guidance

- **Quick check**: Last 1 hour (`startTime` = 1 hour ago)
- **Standard inspection**: Last 24 hours
- **Trend analysis**: Last 7 days
- **Specific incident**: Narrow to the reported time window

Always use ISO-like `YYYY-MM-DD HH:mm:ss` for metrics `startTime`/`endTime`, e.g., `"2026-08-17 00:00:00"`.

## Related Skills

- `cloud-functions` — Cloud function development, deployment, and debugging
- `cloudrun-development` — CloudRun backend deployment and management
- `cloudbase-platform` — General platform knowledge and console navigation
- `postgresql-development-cloudbase` — CloudBase PostgreSQL / PG diagnostics and schema/RLS checks
- `relational-database-mcp-cloudbase` — MySQL database management and diagnostics
- `auth-tool-cloudbase` — Auth provider readiness for token failures
