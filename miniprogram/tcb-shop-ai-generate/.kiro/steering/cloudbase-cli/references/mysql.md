# MySQL Database Operations (`tcb db`)

Execute SQL, manage instances, backups, and slow queries for CloudBase MySQL via `tcb db` commands.

⚠️ MySQL commands live under **`tcb db ...`** (NOT `tcb db mysql ...`). Don't confuse with `tcb db nosql ...` (NoSQL).

## When to Use

- Execute SQL queries or mutations against CloudBase MySQL
- Inspect, restart, or resize MySQL instances
- Create, list, restore, or delete backups
- Analyze slow queries for performance troubleshooting

## Do NOT use for

- NoSQL/MongoDB operations → use `references/nosql.md` (commands are `tcb db nosql ...`)
- In-app MySQL queries via server SDK → use `cloud-functions` skill
- Storage file management → use `references/storage.md`
- Complex stored procedures or multi-statement transactions → use a MySQL client directly

## Command Quick Reference

```
tcb db execute              Execute SQL statement
tcb db instance list        List MySQL instances
tcb db instance restart     Restart a MySQL instance
tcb db instance config get  Read instance configuration
tcb db instance config set  Resize CPU/memory
tcb db backup list          List backups
tcb db backup create        Create a backup
tcb db backup restore       Restore from backup
tcb db backup drop          Delete a backup
tcb db monitor slow-query   Analyze slow queries
```

### Global options

- `-e, --envId <envId>` — target environment
- `--json` — structured output (use for automation)
- `--yes` — skip confirmation for destructive/confirmation-gated operations

⚠️ In `--json` mode, interactive prompts are suppressed — commands that need `--instance-id` or `--yes` will **fail silently** without them.

---

## Workflow 1: Safe SQL Execution

Always start with read-only queries for discovery:

```bash
# Read-only query
tcb db execute -e <envId> --sql "SELECT * FROM users WHERE status = 'active' LIMIT 10" --read-only --json

# Simple connectivity test
tcb db execute -e <envId> --sql "SELECT 1" --read-only --json
```

⚠️ Always use `--read-only` for SELECT queries to prevent accidental mutations.

### Data mutations (INSERT/UPDATE/DELETE)

```bash
# Insert
tcb db execute -e <envId> --sql "INSERT INTO users (name, age, status) VALUES ('alice', 25, 'active')" --json

# Update (keep WHERE clauses narrow)
tcb db execute -e <envId> --sql "UPDATE users SET status = 'inactive' WHERE id = 1001" --json
```

⚠️ Do NOT add `--read-only` to mutation SQL. Show the exact SQL to the user before execution.

⚠️ Always include a `WHERE` clause in `UPDATE` and `DELETE`. Without it, **all rows** are affected.

### `tcb db execute` options

| Option | Description |
|--------|-------------|
| `-s, --sql <sql>` | Required — the SQL statement |
| `--read-only` | Run in read-only mode |
| `--json` | Rows for SELECT; affected-row info for mutations |

---

## Workflow 2: Instance Management

### Inspect instances

```bash
# List all instances
tcb db instance list -e <envId> --json

# Get instance configuration
tcb db instance config get -e <envId> --instance-id <instanceId> --json
```

### Resize instance

```bash
# Step 1: Check current config
tcb db instance config get -e <envId> --instance-id <instanceId> --json

# Step 2: Resize (both --cpu and --memory required)
tcb db instance config set -e <envId> --instance-id <instanceId> --cpu 2 --memory 4 --yes
```

⚠️ Resizing changes CPU and memory together. May cause brief service interruption.

⚠️ In `--json` mode, `config set` **requires `--yes`** — otherwise it fails silently (no interactive prompt available).

### Restart instance

```bash
tcb db instance restart -e <envId> --instance-id <instanceId>
```

⚠️ Restart causes **service interruption**. Only use when:
- Instance is unresponsive
- Configuration changes require restart
- User explicitly confirms after understanding impact

⚠️ In `--json` mode, `--instance-id` is **required** for `restart`, `config get`, and `monitor slow-query`.

---

## Workflow 3: Backup and Restore

### Create and list backups

```bash
# List existing backups
tcb db backup list -e <envId> --json

# List with time range
tcb db backup list -e <envId> --start-time "2026-03-01 00:00:00" --end-time "2026-03-31 23:59:59" --json

# Create a manual backup
tcb db backup create -e <envId>

# Create logical backup of specific databases
tcb db backup create -e <envId> --type logic --databases db1,db2 --name nightly-manual
```

### Restore from backup — two strategies

⚠️ Verify which strategy you need before running. Mixing flags causes validation failure.

```bash
# Strategy A: Snapshot rollback (requires --backup-id)
tcb db backup restore -e <envId> --strategy snapRollback --backup-id <backupId>

# Strategy B: Point-in-time rollback (requires --expect-time)
tcb db backup restore -e <envId> --strategy timeRollback --expect-time "2024-03-15 14:00:00"
```

| Strategy | Required flag | Use case |
|----------|--------------|----------|
| `snapRollback` | `--backup-id` | Restore from a known backup artifact |
| `timeRollback` | `--expect-time` | Roll back to a verified timestamp |

⚠️ Restore is a **cluster-level** operation. Confirm scope and impact with the user.

### Delete a backup

```bash
tcb db backup drop -e <envId> --backup-id <backupId> --yes
```

⚠️ Backup deletion is **irreversible**. Confirm the backup ID and check retention/compliance requirements first.

### Recommended backup workflow

```bash
# 1. List to identify the target
tcb db backup list -e <envId> --json
# 2. Create safety backup before risky operations
tcb db backup create -e <envId>
# 3. Restore if needed
tcb db backup restore -e <envId> --strategy snapRollback --backup-id <backupId>
```

---

## Workflow 4: Slow Query Analysis

```bash
# Basic slow query inspection
tcb db monitor slow-query -e <envId> --instance-id <instanceId> --json

# Scoped by time range and threshold
tcb db monitor slow-query -e <envId> --instance-id <instanceId> \
  --start "2026-03-01 00:00:00" --end "2026-03-01 23:59:59" \
  --threshold 1 --json
```

### `monitor slow-query` options

| Option | Description |
|--------|-------------|
| `--instance-id` | Required in `--json` mode |
| `--start`, `--end` | Time range filter |
| `--threshold` | Local filter in seconds |
| `--order-by` | `QueryTime`, `LockTime`, `RowsExamined`, or `RowsSent` |
| `--order-by-type` | `asc` or `desc` |
| `--database` | Filter by database name |
| `--username` | Filter by user |
| `--limit`, `--offset` | Pagination |

**Analysis strategy:** Sort by `QueryTime` first → pivot to `RowsExamined` to find inefficient scans → filter by `--database` or `--username` for shared workloads.

---

## Real-World Scenarios

### Inspect-first workflow (recommended starting point)

```bash
tcb db instance list -e <envId> --json
tcb db backup list -e <envId> --json
tcb db monitor slow-query -e <envId> --instance-id <instanceId> --json
```

### Safe read → mutate cycle

```bash
# Preview affected rows
tcb db execute -e <envId> --sql "SELECT COUNT(*) FROM logs WHERE created_at < '2025-01-01'" --read-only --json

# Delete after user confirmation
tcb db execute -e <envId> --sql "DELETE FROM logs WHERE created_at < '2025-01-01'" --json

# Verify
tcb db execute -e <envId> --sql "SELECT COUNT(*) FROM logs" --read-only --json
```

### Full backup-restore cycle

```bash
tcb db backup list -e <envId> --json                     # identify backups
tcb db backup create -e <envId>                          # safety backup
tcb db backup restore -e <envId> --strategy snapRollback --backup-id <backupId>
```

### Cleanup old backups

```bash
tcb db backup list -e <envId> --json        # identify old backups
tcb db backup drop -e <envId> --backup-id <backupId> --yes
```

---

## Common Errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| Missing instance in `--json` mode | `--instance-id` omitted | Add `--instance-id <id>` explicitly |
| `config set` fails silently in JSON mode | Missing `--yes` | Add `--yes` to skip suppressed prompt |
| `--sql` missing | No SQL statement provided | Add `--sql "..."` |
| Backup restore validation error | Strategy/flag mismatch | `snapRollback` → `--backup-id`; `timeRollback` → `--expect-time` |
| `--cpu`/`--memory` missing | Incomplete resize | Both `--cpu` and `--memory` are required |
| `UPDATE`/`DELETE` affects all rows | Missing `WHERE` clause | Always add a `WHERE` condition |
| No rows returned for mutation | Expected result set from INSERT/UPDATE | Mutations return affected-row info, not rows |
| Timeout on large queries | Query scans too many rows | Add indexes, use `LIMIT`, or narrow the `WHERE` clause |

---

## Self-Check

- [ ] Using `tcb db ...` (not `tcb db mysql ...`) for MySQL commands?
- [ ] Started with `--read-only` for exploratory queries?
- [ ] Included `WHERE` clause in all `UPDATE` and `DELETE` statements?
- [ ] Specified `--instance-id` explicitly (especially in `--json` mode)?
- [ ] For `config set --json`: included `--yes`?
- [ ] For backup restore: verified correct strategy + matching required flag?
- [ ] For destructive ops (restart, resize, backup drop): confirmed with user?
- [ ] Used `--json` for automation and script consumption?
- [ ] Showed exact SQL to user before executing mutations?
