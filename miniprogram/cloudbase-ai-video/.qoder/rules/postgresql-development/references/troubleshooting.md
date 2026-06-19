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
