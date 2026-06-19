# NoSQL Database Operations (`tcb db nosql`)

Execute MongoDB-style commands against CloudBase document database — CRUD, aggregation, backup, and restore.

⚠️ **Always run `tcb db nosql execute --help` first** — this is the most error-prone command family due to nested JSON encoding.

## When to Use

- Execute MongoDB-style CRUD against CloudBase NoSQL document database
- Run aggregation or count commands on document collections
- Manage backup/restore workflows for document collections
- Query restoreable timestamps or collections
- Track restore task status

## Do NOT use for

- MySQL/SQL database operations → use `references/mysql.md` (commands are `tcb db ...` without `nosql`)
- In-app database queries via Web/Mini-Program SDK → use `no-sql-web-sdk` skill
- Cloud function database access via server SDK → use `cloud-functions` skill
- Storage file management → use `references/storage.md`

## Command Quick Reference

```
tcb db nosql execute              Run Mongo-style commands
tcb db nosql backup time          Discover restoreable timestamps
tcb db nosql backup collection    List restoreable collections at a given time
tcb db nosql backup restore       Submit a restore task
tcb db nosql backup task          Track restore task status
```

⚠️ Don't confuse `tcb db nosql ...` (NoSQL) with `tcb db ...` (MySQL) — they are different command families.

### Global options

- `-e, --envId <envId>` — target environment
- `--json` — structured output (use for automation)
- `--tag <tag>` — select instance when multiple document DBs exist in the environment

---

## The MgoCommandParam Format (Critical)

Every `execute` call takes a `--command` argument: a **JSON array** of `MgoCommandParam` objects.

```json
[
  {
    "TableName": "users",
    "CommandType": "QUERY",
    "Command": "{\"find\":\"users\",\"filter\":{\"status\":\"active\"},\"limit\":10}"
  }
]
```

⚠️ The `Command` field must be a **JSON-encoded string** (with escaped quotes), NOT a raw JSON object. This is the #1 source of errors.

### Two-layer structure

1. **Outer layer** — the `MgoCommands` JSON array (parsed by the CLI)
2. **Inner layer** — the `Command` value: a stringified MongoDB shell command

**Build process:** Write the inner MongoDB JSON first → stringify it (escape all `"` as `\"`) → paste into the `Command` field.

### CommandType → Command template

| `CommandType` | `Command` template |
|---|---|
| `QUERY` | `{"find":"<coll>","filter":{...},"limit":N}` |
| `INSERT` | `{"insert":"<coll>","documents":[{...}]}` |
| `UPDATE` | `{"update":"<coll>","updates":[{"q":{...},"u":{"$set":{...}}}]}` |
| `DELETE` | `{"delete":"<coll>","deletes":[{"q":{...},"limit":1}]}` |
| `COMMAND` (count) | `{"count":"<coll>","query":{...}}` |
| `COMMAND` (aggregate) | `{"aggregate":"<coll>","pipeline":[...],"cursor":{}}` |

Notes:
- `TableName` usually matches the target collection name.
- ⚠️ `UPDATE` and `DELETE` commonly fail because users pass an object instead of the required `updates`/`deletes` **array**.
- ⚠️ Aggregation requires `"cursor":{}` — omitting it causes an error.

---

## Workflow 1: Query Documents

```bash
tcb db nosql execute -e <envId> --command \
  '[{"TableName":"users","CommandType":"QUERY","Command":"{\"find\":\"users\",\"filter\":{\"status\":\"active\"},\"limit\":10}"}]' --json
```

⚠️ Always start with a single **read** command before attempting writes.

---

## Workflow 2: Insert Documents

```bash
tcb db nosql execute -e <envId> --command \
  '[{"TableName":"products","CommandType":"INSERT","Command":"{\"insert\":\"products\",\"documents\":[{\"name\":\"Widget A\",\"price\":29.99},{\"name\":\"Widget B\",\"price\":49.99}]}"}]' --json
```

---

## Workflow 3: Update Documents

```bash
tcb db nosql execute -e <envId> --command \
  '[{"TableName":"users","CommandType":"UPDATE","Command":"{\"update\":\"users\",\"updates\":[{\"q\":{\"name\":\"alice\",\"status\":\"pending\"},\"u\":{\"$set\":{\"status\":\"active\",\"age\":26}}}]}"}]'
```

Inner `Command` (after unescaping) for reference:

```json
{
  "update": "users",
  "updates": [{
    "q": { "name": "alice", "status": "pending" },
    "u": { "$set": { "status": "active", "age": 26 } }
  }]
}
```

---

## Workflow 4: Delete Documents

```bash
tcb db nosql execute -e <envId> --command \
  '[{"TableName":"sessions","CommandType":"DELETE","Command":"{\"delete\":\"sessions\",\"deletes\":[{\"q\":{\"expiredAt\":{\"$lt\":\"2024-01-01\"}},\"limit\":0}]}"}]' --json
```

- `"limit": 1` → delete one matching document
- `"limit": 0` → delete **all** matching documents

⚠️ Always preview with a QUERY command before running DELETE.

---

## Workflow 5: Aggregation

```bash
tcb db nosql execute -e <envId> --command \
  '[{"TableName":"orders","CommandType":"COMMAND","Command":"{\"aggregate\":\"orders\",\"pipeline\":[{\"$match\":{\"status\":\"done\"}},{\"$group\":{\"_id\":\"$product\",\"total\":{\"$sum\":\"$amount\"}}}],\"cursor\":{}}"}]' --json
```

⚠️ The `"cursor":{}` field is **required** for aggregation — omitting it causes an error.

---

## Workflow 6: Backup and Restore

Resolve restore inputs **in order** — do not skip steps:

```bash
# Step 1: Discover restoreable timestamps
tcb db nosql backup time -e <envId> --json

# Step 2: List restoreable collections at that time
tcb db nosql backup collection -e <envId> --time "2024-03-15 14:00:00" --json

# Step 3: Submit restore (creates NEW collections, does NOT overwrite)
tcb db nosql backup restore -e <envId> \
  --time "2024-03-15 14:00:00" \
  --tables '[{"OldTableName":"users","NewTableName":"users_restore_20240315"}]'

# Step 4: Track restore progress
tcb db nosql backup task -e <envId> --json
```

⚠️ Restore creates **new** collections with `NewTableName`. Original collections remain untouched.

### Backup command options

| Command | Required options |
|---------|-----------------|
| `backup time` | `-e <envId>` |
| `backup collection` | `-e <envId>`, `--time`; optionally `--filters users,orders` |
| `backup restore` | `-e <envId>`, `--time`, `--tables` (non-empty JSON array) |
| `backup task` | `-e <envId>` |

### Validation rules

- `--tables` must parse as a **non-empty** JSON array.
- `--time` is required for `backup collection` and `backup restore`.
- Use `--tag <tag>` when the environment has multiple document database instances.

---

## Workflow 7: Multi-Collection Batch Query

```bash
tcb db nosql execute -e <envId> --command '[
  {"TableName":"users","CommandType":"QUERY","Command":"{\"find\":\"users\",\"filter\":{},\"limit\":5}"},
  {"TableName":"products","CommandType":"QUERY","Command":"{\"find\":\"products\",\"filter\":{\"price\":{\"$gt\":100}},\"limit\":5}"}
]' --json
```

⚠️ Validate each command individually before batching multiple operations.

---

## Shell Quoting Rules

- Wrap the entire `--command` value in **single quotes** (`'...'`) in bash/zsh
- Use double quotes inside JSON keys and string values
- Escape double quotes inside the inner `Command` string as `\"`
- ⚠️ If the command contains `$set`, `$gt`, etc., single quotes **prevent shell `$` interpolation**

```bash
# CORRECT — single quotes protect $ and inner \"
tcb db nosql execute -e <envId> --command '[{"TableName":"users","CommandType":"UPDATE","Command":"{\"update\":\"users\",\"updates\":[{\"q\":{\"name\":\"alice\"},\"u\":{\"$set\":{\"status\":\"active\"}}}]}"}]'

# WRONG — double quotes cause shell to interpret $ and break JSON
tcb db nosql execute -e <envId> --command "[{"TableName":"users"...}]"
```

**Practical tips:**
- Build the inner JSON in an editor first, then compress to one line for the shell.
- When debugging, validate the outer payload first (must be a JSON array), then inspect only the inner `Command` string.
- If parsing still fails, check for unescaped backslashes in the inner string.

### Connector options (advanced)

Use `--instance-id` and `--database-name` only when targeting a specific connector. If not needed, omit them for the simplest working command.

---

## Common Errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| `--command` parse failure | Not a valid JSON array | Validate JSON locally; must be `[...]` not `{...}` |
| `Command` field rejected | Raw object instead of string | Stringify inner JSON: escape `"` as `\"` |
| `UPDATE`/`DELETE` fails silently | Missing `updates`/`deletes` array | Use `"updates":[{...}]` not a bare object |
| `$set` / `$gt` resolves to empty | Shell interprets `$` as variable | Switch to single quotes around `--command` |
| Wrong database targeted | Multiple instances, no `--tag` | Add `--tag <tag>` |
| `--tables` parse failure | Not a non-empty JSON array | Validate: `[{"OldTableName":"x","NewTableName":"y"}]` |
| `aggregate` returns error | Missing `"cursor":{}` | Add `\"cursor\":{}` to the aggregate command |
| Restore seems to have no effect | Looking at original collection | Check the `NewTableName` collection instead |

---

## Self-Check

- [ ] Ran `tcb db nosql execute --help` to verify current command syntax?
- [ ] `--command` is a valid JSON **array** (not a single object)?
- [ ] Inner `Command` field is a JSON-encoded **string** (with escaped quotes)?
- [ ] Used single quotes around `--command` value in shell?
- [ ] Started with a read command before writes?
- [ ] For restore: discovered time → collections → submitted restore (in order)?
- [ ] Used `--tag` when environment has multiple document DB instances?
- [ ] Used `--json` for automation and debugging?
