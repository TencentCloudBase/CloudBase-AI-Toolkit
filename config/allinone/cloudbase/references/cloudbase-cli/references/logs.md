# Logs — CloudBase CLI

`tcb logs search` is the **single** log-search entry point across CloudBase: cloud functions,
CloudRun, database, auth, model, workflow, LLM and gateway access logs — all through CLS query syntax.

## When to Use

- Debugging a cloud function from its runtime logs
- Finding a specific invocation by RequestId
- Reading CloudRun build / runtime logs (see also `cloudrun.md` for `logs build|process`)
- Checking rate-limit / freeze / slow-query events of a database
- Auditing gateway access logs

## Do NOT use for

- CloudRun build / runtime logs by service → `tcb cloudrun logs build|process` (`cloudrun.md`)
- Metrics (QPS, latency, memory curves) → `monitor.md`
- Local function logs → run the function locally (`functions.md`)

---

## Core command

```bash
tcb logs search --env-id <envId>
tcb logs search --env-id <envId> --query 'function_name:"my-func"' --timeRange 6h
tcb logs search --env-id <envId> --json
```

| Flag | Meaning | Default |
|------|---------|---------|
| `-e, --env-id <envId>` | Target environment | interactive pick if omitted |
| `-q, --query <queryString>` | CLS query string | `*` |
| `-t, --timeRange <timeRange>` | `30m` / `1h` / `6h` / `1d`, or absolute `"2026-10-16 14:00:00,2026-10-16 15:00:00"` | `1h` |
| `-l, --limit <limit>` | Result count (max 100) | `20` |
| `--sort <sort>` | `desc` (newest first) / `asc` (oldest first) | `desc` |
| `--context <context>` | Pagination cursor from the previous result | — |
| `--service <service>` | `tcb` (functions / database / LLM …) or `tcbr` (CloudRun) | `tcb` |

> ⚠️ **`--service` is a log *service*, not a service name.** For CloudRun use `--service tcbr` and put
> the service name into the query. `--service my-service` silently queries the wrong backend.

Pagination: pass the returned `Context` back via `--context` to get the next page (the CLI prints the
exact next command).

---

## Cloud function queries

Fields: `function_name`, `request_id`, `status_code`, `src` (`system` = platform logs,
`app` = user-code logs), `log` (message body), `namespace` (envId), `qualifier` (version, `$LATEST`),
`retry_num`.

`status_code`: `200` = success; **`202` = the START/END middle state and must be excluded** when you
are counting real failures.

```bash
# Recent logs of one function
tcb logs search --query 'function_name:"my-func"'

# Full-text AND
tcb logs search --query 'function_name:"my-func" AND "timeout"'

# Only user-code logs
tcb logs search --query 'function_name:"my-func" AND src:"app"'

# Failures only, aggregated per request (note 202 exclusion and retry_num=0)
tcb logs search --query 'function_name:"my-func" | select request_id, max(status_code) as status_code, max(ret_msg) as ret_msg where status_code>200 AND status_code!=202 AND retry_num=0 group by request_id limit 10'

# One invocation by RequestId (sort asc to read it in order)
tcb logs search --query 'request_id:("abc-123-def-456")' --sort asc

# Absolute time window
tcb logs search --timeRange "2026-10-16 14:00:00,2026-10-16 15:00:00"
```

> ℹ️ This replaces the deprecated `tcb fn log` (removed since v3.0.0). See `functions.md`.

---

## CloudRun queries

```bash
tcb logs search --service tcbr --query '"error"' --timeRange 1h
tcb logs search --service tcbr --query '"error" AND "timeout"' --limit 50
tcb logs search --service tcbr --query '__TAG__.container_name:/my-service-[0-9]+/'
```

Full-text matching uses `__CONTENT__` for CloudRun. Fields: `__TAG__.container_name`
(service + instance, regex supported), `__TAG__.pod_name`.

---

## Platform-log queries (database / auth / model / workflow / LLM / gateway)

Filter by `module:` (and optionally `eventType:` / `logType:`):

```bash
# Document database slow queries
tcb logs search --query 'module:database AND eventType:MongoSlowQuery'

# Relational DB events
tcb logs search --query 'module:rdb'
tcb logs search --query 'module:rdb AND eventType:MysqlFreeze'
tcb logs search --query 'module:rdb AND eventType:MysqlSlowQuery'

# Data model / workflow / auth
tcb logs search --query 'module:model'
tcb logs search --query 'module:workflow'
tcb logs search --query 'module:auth'

# LLM trace logs
tcb logs search --query 'module:llm AND logType:llm-tracelog'

# App publish / delete
tcb logs search --query 'module:app AND eventType:AppProdPub'

# Gateway access logs
tcb logs search --query 'logType:accesslog'
```

`module:` values seen in the CLI: `database`, `rdb`, `model`, `workflow`, `auth`, `llm`, `app`.

---

## Query syntax essentials

- Boolean: `AND` / `OR` / `NOT`, plus `field:"value"` and `field:("a" OR "b")`
- Full text: a bare quoted string
- Regex in tag values: `/pattern/`
- Analytics: `| select <agg> as <alias> where <cond> group by <field> limit N` — use it to collapse
  one logical request (spread over several log lines) into one row

---

## Common Errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty result but the function clearly ran | Default window is only `1h` | Widen with `--timeRange 1d`, or use an absolute range |
| Many "failures" that are not failures | Counted `status_code=202` (START/END) | Exclude 202 and add `retry_num=0` |
| CloudRun logs missing | Queried with the default `--service tcb` | Add `--service tcbr` |
| Only one log line per request | Function logs are split per line | Aggregate with `group by request_id` |
| Limit seems ignored | Max is 100 and paging needs a cursor | Page with the returned `--context` value |

---

## Self-Check

- [ ] Confirmed the envId with the user?
- [ ] Picked the right `--service` (`tcb` vs `tcbr`)?
- [ ] Widened `--timeRange` before concluding "no logs"?
- [ ] Excluded `status_code != 202` when counting failures?
- [ ] Used `group by request_id` when the question is per-invocation, not per-line?
