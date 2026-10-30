# Monitor — CloudBase CLI

`tcb monitor` queries **metric** data (call counts, latency, resource usage, error rates) for the
resources in an environment. Logs are a different command — see `logs.md`.

## When to Use

- Checking a function's invocation count / error rate / resource usage over a window
- Checking CloudRun CPU / memory / instance curves
- Checking database metrics, hosting traffic, auth and LLM usage
- Checking gateway call metrics (API dimension or resource dimension)
- Building a quick "is it healthy?" report before or after a deploy

## Do NOT use for

- Log lines / error messages → `logs.md`
- Billing and credit consumption → `tcb env usage` (`env.md`)
- Resource configuration / quotas → `tcb env detail` (`env.md`)

---

## Command map

| Subcommand | Target |
|------------|--------|
| `tcb monitor function [function-name]` | Cloud function metrics |
| `tcb monitor database [collection-name]` | Document database metrics |
| `tcb monitor mysql` | MySQL metrics |
| `tcb monitor cloudrun <service-name>` | CloudRun service metrics |
| `tcb monitor hosting` | Static hosting metrics |
| `tcb monitor auth` | Authentication metrics |
| `tcb monitor ai` | Foundation-model metrics |
| `tcb monitor knowledgebase` | Knowledge-base metrics |
| `tcb monitor userlogin` | User login metrics |
| `tcb monitor gateway <dimension>` | Gateway calls — `dimension` = `api` or `resource` |
| `tcb monitor dbconnector <connector-id>` | Database connector metrics |
| `tcb monitor env` | Environment-level metrics |
| `tcb monitor schema [resource]` | Available metric names (all resource types when omitted) |

> ✅ **`tcb monitor` is officially supported — recommend it normally.** It is simply **not listed in
> `tcb --help`** (that list is hand-maintained), which must not be read as "internal" or "experimental".
> Use it whenever the user asks for metrics / health / usage curves.

---

## Shared flags

Almost every subcommand accepts the same four:

| Flag | Meaning | Default |
|------|---------|---------|
| `--since <since>` | Start time; relative (`1h`, `30m`, `2d`) or absolute | `1h` |
| `--until <until>` | End time; relative (`now`, `5m`) or absolute | `now` |
| `--metric-name <name...>` | Metric(s) to query; comma-separated single value (`A,B`) or repeat the flag. Omitted = all metrics for that resource | all |
| `--period <period>` | Aggregation period **in seconds**: `300` (5 min) / `3600` (1 h) / `86400` (1 d) | auto by range |

Two subcommands add their own:

| Subcommand | Extra flag |
|------------|-----------|
| `monitor cloudrun` | `--service-version <version>` — restrict to one version |
| `monitor gateway` | `--api-type wx\|http_openapi` (only `dimension=api`); `--resource-id <id>` (only `dimension=resource`, value contains `\|` so quote it) |

---

## Examples

```bash
# Last hour of a function's metrics (default window and period)
tcb monitor function my-func --env-id <envId>

# Last 6 hours, 5-minute buckets, only two metrics
tcb monitor function my-func --since 6h --period 300 \
  --metric-name Invocation,MemoryUse --env-id <envId>

# Absolute window
tcb monitor function my-func \
  --since "2026-10-16 00:00:00" --until "2026-10-16 12:00:00" --env-id <envId>

# CloudRun service, single version
tcb monitor cloudrun my-service --service-version my-service-001 --since 2h --env-id <envId>

# Gateway API-dimension calls from mini-program APIs
tcb monitor gateway api --api-type wx --since 1h --env-id <envId>

# Gateway resource dimension (quote the id — it contains |)
tcb monitor gateway resource --resource-id "<domain>|<path>|<resource>" --env-id <envId>

# JSON for programmatic use
tcb monitor function my-func --env-id <envId> --json
```

> ⚠️ `monitor gateway` takes a **positional** `dimension` (`api` | `resource`). Unlike `--api-type`,
> it cannot be omitted.

> ⚠️ `--period` is in **seconds**, not a string like `5m`. `--period 300`, not `--period 5m`.

---

## Common Errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty metrics | Window too short, or the resource had no traffic | Widen `--since`; confirm the resource name |
| "unknown metric" | `--metric-name` value not valid for that resource type | Run `tcb monitor schema <resource>` to list valid names |
| `monitor cloudrun` complains about the target | Service name missing | CloudRun monitor takes the service name **positionally** |
| `--period` rejected | Passed `5m` instead of seconds | Use `300` / `3600` / `86400` |
| `monitor gateway` errors on dimension | Dimension omitted | Pass `api` or `resource` positionally |

---

## Self-Check

- [ ] Confirmed the envId with the user?
- [ ] Chose metrics (`monitor`) vs log lines (`logs search`) correctly?
- [ ] `--period` expressed in seconds?
- [ ] For CloudRun: passed the service name positionally and optionally a version?
- [ ] For gateway: passed the dimension positionally and the type/resource flag that goes with it?
