---
name: ops-inspector
description: AIOps-style one-click inspection skill for CloudBase resources. Use this skill when users need to diagnose errors, check resource health, inspect logs, or run a comprehensive health check across cloud functions, CloudRun services, databases, and other CloudBase resources.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/ops-inspector/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `cloud-functions` or `cloudrun-development`, use the standalone fallback URL shown next to that reference.

## Activation Contract

### Use this first when

- The user wants to check the health or status of CloudBase resources (cloud functions, CloudRun, databases, storage, etc.).
- The user reports errors, failures, or abnormal behavior and wants a quick diagnosis.
- The user asks for an "inspection", "health check", "巡检", "诊断", or "troubleshooting" of their CloudBase environment.
- The user wants to review recent error logs across services.

### Read before writing code if

- The user has not yet identified the target environment, affected resources, or incident time range.
- The inspection reveals code-level issues in cloud functions or CloudRun services — then read the relevant implementation skill before suggesting fixes.
- The user wants to fix a problem found during inspection rather than just diagnose it.

### Then also read

- Cloud function issues -> `../cloud-functions/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-functions/SKILL.md`)
- CloudRun issues -> `../cloudrun-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudrun-development/SKILL.md`)
- Database issues -> `../relational-database-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/relational-database-tool/SKILL.md`) or `../no-sql-web-sdk/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-web-sdk/SKILL.md`)
- Platform overview -> `../cloudbase-platform/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-platform/SKILL.md`)

### Do NOT use for

- Deploying new resources or writing application code. This skill is read-only and diagnostic.
- Replacing proper monitoring or alerting infrastructure. It provides point-in-time inspection, not continuous monitoring.
- Directly fixing problems — it diagnoses and recommends; actual fixes should use the appropriate implementation skill.

### Common mistakes / gotchas

- Running a full inspection without first confirming the environment is bound (`auth` tool must show logged-in and env-bound state).
- Ignoring CLS log service status — if CLS is not enabled, `queryLogs` will fail; always check first with `queryLogs(action="checkLogService")`.
- Searching logs without a time range — this can return excessive or irrelevant results. Always scope searches to a relevant time window.
- Treating a single error log as the root cause without correlating across resources. A function error may stem from a database or config issue.
- Recommending code changes before recording the incident window, affected resources, and evidence that supports the diagnosis.

### Minimal checklist

- [ ] Environment is bound and accessible (`envQuery(action="info")`)
- [ ] CLS log service is enabled (`queryLogs(action="checkLogService")`)
- [ ] The incident time range or observation window is fixed before log searches
- [ ] All target resources are listed before diving into details
- [ ] Findings are summarized with severity, evidence, and the next handoff target if a code fix is needed

---

## How to use this skill (for a coding agent)

### Inspection Modes

The skill supports two modes based on user intent:

| Mode | When to use | Scope |
|------|-------------|-------|
| **Full inspection** | User asks for a general health check / 巡检 / 全面检查 | All resource types in the environment |
| **Targeted inspection** | User reports a specific error or asks about a specific resource | One resource type or a specific resource |

### Shared prerequisites

Before any inspection, capture or derive these fields:

- `envId` or the currently bound environment
- affected resource type and names when known
- incident time range or observation window
- reported symptom, error text, or failing route if available

If any of these are missing, gather them before broad log searches or deep diagnosis.

### Full Inspection Workflow

Follow these steps in order for a comprehensive environment health check:

**Step 1 — Environment Check**

```
envQuery(action="info")
```

Confirm the environment is accessible. Record the `envId` for console link generation.

**Step 2 — Log Service Status**

```
queryLogs(action="checkLogService")
```

If CLS is not enabled, note this as a **warning** — log-based diagnosis will be unavailable. Recommend enabling CLS in the console: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/devops/log`

**Step 3 — Resource Inventory**

List the resources that belong to the current inspection scope before narrowing down details.

```
queryFunctions(action="listFunctions")
queryCloudRun(action="list")
```

Record which resources are relevant to the current symptom. Do not assume every returned resource is involved.

**Step 4 — Cloud Functions Inspection**

For each relevant function, check:

- **Status**: Is the function in an active or deployed state?
- **Recent errors**: `queryFunctions(action="listFunctionLogs", functionName="<name>", startTime="<recent>")`
- **Common issues**:
  - timeout errors (execution exceeded limit)
  - memory limit exceeded
  - runtime errors (unhandled exceptions)
  - cold start frequency
  - permission or gateway mismatch

**Step 5 — CloudRun Services Inspection**

For each relevant service, check:

- **Status**: Is the service running?
- **Detail**: `queryCloudRun(action="detail", detailServerName="<name>")`
- **Common issues**:
  - service not running (scaled to zero or crashed)
  - image pull failures
  - OOMKilled events
  - health check failures

**Step 6 — Error Log Aggregation** (if CLS is enabled)

```
queryLogs(action="searchLogs", queryString="ERROR", service="tcb", startTime="<start>", endTime="<end>", limit=50)
queryLogs(action="searchLogs", queryString="ERROR", service="tcbr", startTime="<start>", endTime="<end>", limit=50)
```

Look for patterns:

- repeated error messages (same error many times)
- cascading failures (errors in multiple services around the same time)
- timeout patterns
- one resource failing because another dependency is unhealthy

**Step 7 — Summary Report**

Generate a structured report:

```markdown
# CloudBase Resource Inspection Report

**Environment**: ${envId}
**Inspection Time**: ${timestamp}
**Observation Window**: ${startTime} -> ${endTime}

## Overall Health: ✅ Healthy / ⚠️ Warnings Found / ❌ Issues Found

### Cloud Functions
| Function | Status | Recent Errors | Severity |
|----------|--------|---------------|----------|
| ... | ... | ... | ... |

### CloudRun Services
| Service | Status | Issues | Severity |
|---------|--------|--------|----------|
| ... | ... | ... | ... |

### Error Log Summary
- Total errors in window: N
- Top error patterns: ...
- Correlated resources: ...

## Recommendations
1. ...
2. ...

## Next Handoff
- Continue in `cloud-functions` / `cloudrun-development` / database skill only if the inspection confirms a concrete implementation or config fix path.

## Console Links
- Cloud Functions: https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf
- CloudRun: https://tcb.cloud.tencent.com/dev?envId=${envId}#/platform-run
- Logs: https://tcb.cloud.tencent.com/dev?envId=${envId}#/devops/log
```

### Targeted Inspection Workflow

When the user specifies a resource type or a specific resource:

1. **Cloud function errors**: `queryFunctions(action="listFunctionLogs", functionName="<name>")` then `queryLogs(action="searchLogs", queryString="* AND functionName:<name> AND level:ERROR", ...)`
2. **CloudRun errors**: `queryCloudRun(action="detail", detailServerName="<name>")` then `queryLogs(action="searchLogs", queryString="ERROR", service="tcbr", ...)`
3. **Database issues**: Check `querySqlDatabase` or `readNoSqlDatabaseStructure` depending on type
4. **General error search**: `queryLogs(action="searchLogs", queryString="<error-keyword>", ...)`

Always keep the search window aligned with the reported incident instead of using unbounded historical queries.

### AIOps Methodology

This skill follows AIOps principles for intelligent inspection:

1. **Data Collection**: Gather logs and resource states via MCP tools
2. **Pattern Recognition**: Identify recurring errors, anomaly patterns, and correlations across services
3. **Root Cause Hypothesis**: Based on error patterns, suggest likely root causes (e.g., a function timeout may be caused by a database query bottleneck)
4. **Actionable Recommendations**: Provide specific, prioritized remediation steps with links to relevant skills and console pages
5. **Controlled Handoff**: When a fix is required, route the user to the implementation skill with environment, resource, and evidence context instead of restarting from scratch

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
| Check CLS status | `queryLogs(action="checkLogService")` |
| List cloud functions | `queryFunctions(action="listFunctions")` |
| Get function detail | `queryFunctions(action="getFunctionDetail", functionName="<name>")` |
| Get function logs | `queryFunctions(action="listFunctionLogs", functionName="<name>", startTime="<time>", endTime="<time>")` |
| Get function log detail | `queryFunctions(action="getFunctionLogDetail", requestId="<id>")` |
| List CloudRun services | `queryCloudRun(action="list")` |
| Get CloudRun detail | `queryCloudRun(action="detail", detailServerName="<name>")` |
| Search CLS logs | `queryLogs(action="searchLogs", queryString="<query>", service="tcb\|tcbr", startTime="<time>", endTime="<time>")` |
| Check NoSQL structure | `readNoSqlDatabaseStructure(action="listCollections")` |
| Check MySQL status | `querySqlDatabase(action="getContext")` |

### Common CLS Query Patterns

| Scenario | queryString |
|----------|-------------|
| All errors | `ERROR` |
| Function timeout | `timeout OR 超时` |
| Function OOM | `OOM OR out of memory OR 内存超限` |
| CloudRun crash | `crash OR OOMKilled OR Error` |
| Specific function errors | `functionName:<name> AND level:ERROR` |
| 5xx HTTP errors | `statusCode:>499` |
| Cold start issues | `coldStart OR 冷启动` |

### Time Range Guidance

- **Quick check**: Last 1 hour (`startTime` = 1 hour ago)
- **Standard inspection**: Last 24 hours
- **Trend analysis**: Last 7 days
- **Specific incident**: Narrow to the reported time window

Always use ISO 8601 format for `startTime` / `endTime`, e.g. `"2025-01-15 00:00:00"`.

## Related Skills

- `cloud-functions` — Cloud function development, deployment, and debugging
- `cloudrun-development` — CloudRun backend deployment and management
- `cloudbase-platform` — General platform knowledge and console navigation
- `relational-database-tool` — MySQL database management and diagnostics
