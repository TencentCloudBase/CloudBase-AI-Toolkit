# CloudBase PG Troubleshooting

## `xxx.rdb is not a function`

Cause: installed CloudBase SDK is too old or the environment SDK surface does not expose PG.

Fix:

- Upgrade to the latest `@cloudbase/js-sdk` for Web.
- Re-check that the target environment is PG mode.

## DDL fails through ExecutePGSql / managePgDatabase

Facts:

- Execute one SQL statement per call.
- Some DDL (`CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `TRUNCATE`, `COMMENT`) may fail directly with transient `InternalError`.

Retry once with a `DO $$` wrapper and escape single quotes:

```sql
DO $$ BEGIN EXECUTE 'CREATE TABLE public.products (id serial PRIMARY KEY, name text)'; END $$;
```

Do not use this as a way to hide real syntax errors. If the wrapped SQL also fails, inspect the exact error and simplify.

## `MIGRATION_TASK_TIMEOUT` / `MIGRATION_TASK_PENDING` after applyMigration

Cause: `PushPGUserMigrations` is async. MCP polls `DescribeTaskResult` by default for up to **10 minutes** (CLI parity). Large DDL or lock waits can outlive the poll window, or the caller set `waitForTask=false`.

Fix:

1. Call `managePgDatabase(action=describeMigrationTask, taskId=...)` **first** for `Status` / `Phase` / `Reason`. `listMigrations` alone cannot explain a Failed task (that was the #857 blind spot).
2. Call `managePgDatabase(action=listMigrations)` and look for your `migrationVersion`.
3. If the version is present → treat as applied; do not re-push.
4. If Status is still non-terminal and version missing, wait and poll `describeMigrationTask` again. Do **not** immediately re-push the same version.
5. Only after the task is terminal (`Succeed`/`Failed`) and list confirms the version never landed, fix SQL/Conflicts and retry with a **new** version, or use `taskPollTimeoutMs` / CLI `tcb db pg migration up` for longer waits.
6. Optional: `waitForTask=false` returns `MIGRATION_TASK_PENDING` immediately with TaskId — still must `describeMigrationTask` then `listMigrations` before any retry.

## Local file missing / checksum mismatch vs remote history

Cause: Agent applied without Git truth, cloned a repo without `cloudbase/migrations/`, or local SQL drifted from remote `Query` (Executable=false / `checksum_mismatch`).

Fix:

1. Prefer `managePgDatabase(action=fetchMigration)` to pull remote history into `cloudbase/migrations/` (same as CLI `tcb db pg migration fetch`).
2. If local files already exist but are wrong, re-run with `force=true` to overwrite from remote — do **not** hand-edit an already-applied version and re-push the same `migrationVersion`.
3. For new schema changes after fetch, always create a **new** `migrationVersion` newer than `LatestVersion`.

## `MIGRATION_NOT_EXECUTABLE` / `local_migration_before_latest_remote`

Cause: pending `migrationVersion` is older than remote `LatestVersion` (out-of-order), or checksum mismatch / other Preview Conflicts. Push is blocked.

Fix:

1. Default: pick a new 14-digit version strictly greater than `LatestVersion` from `listMigrations`.
2. Only when you intentionally need out-of-order apply (branch merge / backfill): retry `planMigration` / `applyMigration` with `includeAll=true` (CLI `tcb db pg migration up --include-all`).
3. For `checksum_mismatch`, fetch/realign local SQL — do not force includeAll.

## `ERROR: operator does not exist: uuid = text` (or `uid = text`) when creating RLS

Cause: CloudBase `auth.uid()` returns **`text`**, not `uuid` (unlike Supabase). Comparing `auth.uid()` to a `uuid` column has no matching operator.

Fix:

1. **Preferred**: define owner columns as `varchar(64)` or `text` so they match `auth.uid()` directly:
   ```sql
   author_id varchar(64) not null default auth.uid()
   -- ...
   USING (author_id = auth.uid())
   ```
2. **If the column must stay `uuid`**: cast the helper (only when JWT `sub` is a valid UUID):
   ```sql
   USING (author_id = auth.uid()::uuid)
   WITH CHECK (author_id = auth.uid()::uuid)
   ```
3. Do **not** use `uuid` owner columns when identity may be WeChat `openid` or another non-UUID string — keep those columns as `text` / `varchar`.

## Permissions pass in MCP but fail in browser

Likely cause: admin/default execution bypassed user-facing role checks.

Fix:

- Verify table `GRANT` exists for `anon` or `authenticated`.
- Verify RLS policies exist and include both `USING` and `WITH CHECK` when needed.
- If the tool/API supports role simulation, execute checks as `authenticated` or `anon`.
- Test through the real `app.rdb()` browser flow with `auth.getSession()`.

## Insert with serial/bigserial fails

Cause: missing sequence grant.

```sql
GRANT USAGE, SELECT ON SEQUENCE public.todos_id_seq TO authenticated;
```

## Mini Program PG gateway error

If a mini program reports `Generating default gateway base url failed: env not found`, the base library may be too old for CloudBase PostgreSQL.

Fix: use WeChat base library `3.8.9` or later and confirm the environment is PG mode.

## Storage upload returns `STORAGE_PERMISSION_DENIED`

Cause: bucket exists but `storage.objects` RLS denies the request.

Fix: read `storage-pg.md`, configure bucket-specific policies, and retry the same SDK upload path.

## Existing app on CloudRun cannot connect to PostgreSQL (TCP)

Symptoms: deploy succeeds, but the container logs `ECONNREFUSED`, connection timeout, or "could not connect to server" when using `DATABASE_URL` / `postgres://` / `pg` drivers.

Cause: classic TCP clients need the CloudRun instances to join the database VPC. CloudBase PG SDK/gateway (`app.rdb()`, HTTP REST) is a different path and is **not** a drop-in for most GitHub apps.

Fix:

1. Confirm whether the app is a **TCP client** (ORM / `DATABASE_URL`) or a **CloudBase PG SDK** client (`app.rdb()`).
2. For TCP clients: redeploy with `serverConfig.VpcConf` pointing at the same region/VPC as the database, and use the **private** DB host. See `../cloudrun-development/references/vpc-and-database.md`.
3. Ensure the DB security group / allowlist accepts the CloudRun subnet CIDR on port 5432.
4. Do not assume enabling CloudBase PG mode alone makes an existing open-source app connect without VPC + a TCP-reachable endpoint.
