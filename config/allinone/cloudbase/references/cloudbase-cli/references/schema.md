# Schema & Migrations — CloudBase CLI

Schema-definition tooling exposed by the CLI: the low-code **data model** sync (`tcb db model`),
the generated TypeScript types (`tcb sync-model-dts`), and **PostgreSQL migrations**
(`tcb db pg migration`).

## When to Use

- Syncing data-model definitions between local files and the cloud
- Generating TypeScript type definitions from the data model
- Creating / listing / applying / repairing PostgreSQL migrations from the terminal or CI

## Do NOT use for

- **Designing** a data model (ER diagrams, multi-entity modelling) → `../postgresql-development-cloudbase/SKILL.md`
  (deprecated; for new work prefer PostgreSQL DDL)
- **PostgreSQL schema design, RLS, queries** → `../postgresql-development-cloudbase/SKILL.md`
- MySQL instance / backup operations → `mysql.md`
- NoSQL collection data operations → `nosql.md`
- Function config in `cloudbaserc.json` → `config.md` / `functions.md`

---

## Data model (`tcb db model`)

Local definitions live in `database-schemas/` by default.

```bash
tcb db model list                        # list all cloud-side data models
tcb db model list --json

tcb db model pull                        # cloud -> local (all models)
tcb db model pull -n user,order          # only the named models (comma-separated)
tcb db model pull -d ./database-schemas  # custom local directory

tcb db model push                        # local -> cloud (all models in the dir)
tcb db model push -n user,order
tcb db model push -d ./database-schemas
```

| Flag | Meaning |
|------|---------|
| `-d, --dir <dir>` | Local directory holding model definitions, default `database-schemas` |
| `-n, --name <name>` | Model identifiers, comma-separated; omitted = all |

> ⚠️ `tcb db list` / `tcb db pull` / `tcb db push` are **deprecated aliases** of
> `tcb db model list` / `pull` / `push`. They still run but print a migration warning — use the
> `db model` form so the user is not told about a soon-to-be-removed command.

> ⚠️ `db model push` writes model definitions to the cloud. Run `db model list` and show the diff
> intent to the user first; a wrong push changes the live model.

### Generate TypeScript types

```bash
tcb sync-model-dts --env-id <envId>
```

Writes type-definition files for the cloud data model so application code can import them.
It needs a real envId (`requiredEnvId: true`).

---

## PostgreSQL migrations (`tcb db pg migration`)

> ⚠️ **PostgreSQL is a different data plane.** Do not drive a PG environment through `mysql.md` /
> `nosql.md`. This section only covers the CLI surface; for the migration *workflow*, conflict
> handling and RLS, read `../postgresql-development-cloudbase/SKILL.md`.

Migration files live in **`cloudbase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`**. That path must match
what the MCP `managePgDatabase` tools use — if an older workspace keeps `migrations/` at the repo
root, move the files into `cloudbase/migrations/` before mixing CLI and MCP.

```bash
tcb db pg migration new add_user_table        # scaffold a new migration file
tcb db pg migration list                      # local + remote status
tcb db pg migration list --remote-only        # remote-applied only
tcb db pg migration list --remote-only --limit 100 --offset 0

tcb db pg migration fetch                     # remote history -> local files
tcb db pg migration fetch 20261016120000      # one version
tcb db pg migration fetch --force             # overwrite existing local files
tcb db pg migration fetch --dry-run           # preview only

tcb db pg migration up                        # apply pending migrations
tcb db pg migration up --dry-run              # preview pending migrations
tcb db pg migration up --include-all          # allow out-of-order (backfill) versions

tcb db pg migration repair <version> --status applied  --reason "manual fix"
tcb db pg migration repair <version> --status reverted --reason "manual fix" --dry-run
```

| Command | Flags |
|---------|-------|
| `new <name>` | — (creates `cloudbase/migrations/<version>_<name>.sql`) |
| `list` | `--remote-only`, `--limit <n>` (1-500, default 100), `--offset <n>` — `--limit/--offset` are **only** valid together with `--remote-only` |
| `fetch [version]` | `-f/--force` (overwrite local), `--dry-run` |
| `up` | `--dry-run`, `--include-all` |
| `repair <version>` | `--status applied\|reverted` (**required**), `--reason <text>` (**required**), `--dry-run` |

> ⚠️ `--include-all` applies versions **older** than the latest applied one. Use it only for branch
> merges / backfills the user explicitly asked for — never for routine work.

> ⚠️ `repair` rewrites recorded migration state, not the database. It does **not** run SQL. Always
> `--dry-run` first and get the user's approval, because it can desynchronise history from reality.

---

## Command Quick Reference

```bash
tcb db model list                         # List cloud data models
tcb db model pull [-n a,b] [-d <dir>]     # Model definitions: cloud -> local
tcb db model push [-n a,b] [-d <dir>]     # Model definitions: local -> cloud
tcb sync-model-dts --env-id <id>          # Generate TS type definitions

tcb db pg migration new <name>            # Scaffold a migration
tcb db pg migration list [--remote-only]  # Status
tcb db pg migration fetch [version]       # Remote history -> local
tcb db pg migration up [--dry-run]        # Apply
tcb db pg migration repair <version>      # Fix recorded state
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `db pull` prints a deprecation warning | Old alias | Use `tcb db model pull` |
| `--limit` rejected on `migration list` | Used without `--remote-only` | Add `--remote-only`, or drop the pagination flags |
| `migration up` skips a version | Version older than latest applied | Intentional; pass `--include-all` only if the user asked for a backfill |
| Migration file not found | Files not in `cloudbase/migrations/` | Move legacy root `migrations/` into `cloudbase/migrations/` |
| PG commands behave oddly / RLS denies | PG environment driven like a NoSQL/MySQL env | Switch to `../postgresql-development-cloudbase/SKILL.md` |
| `sync-model-dts` says envId missing | It requires `-e/--env-id` | Pass an explicit envId |

---

## Self-Check

- [ ] Confirmed the environment's data plane (NoSQL / MySQL / PostgreSQL) before choosing a command?
- [ ] For model pushes: showed the user what will change?
- [ ] For `migration up`: ran `--dry-run` first?
- [ ] For `--include-all`: confirmed with the user that an out-of-order apply is intended?
- [ ] For `repair`: `--dry-run` + explicit approval (it rewrites recorded state only)?
- [ ] For PG work: handed over to the PostgreSQL skill instead of improvising?
