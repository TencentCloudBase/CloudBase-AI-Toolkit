# CloudBase PG Reference Index

Use this index after `postgresql-development/SKILL.md` identifies the task as CloudBase PostgreSQL / CloudBase PG / PG mode.

## Read order

1. `pg-mode-overview.md` — environment shape, schemas, roles, and when PG mode applies.
2. `auth-and-rls.md` — JWT identity, `auth.uid()` (**returns `text`**, not `uuid`) / `auth.role()` / `auth.jwt()`, GRANT + RLS templates, and `service_role` risks.
3. `app-workflow.md` — end-to-end Web/CMS implementation workflow.
4. `storage-pg.md` — PG storage bucket/object model, `app.storage.from('bucket')`, and storage RLS.
5. `http-api.md` — PostgREST `/v1/rdb/rest/...` fallback and auth headers.
6. `realtime.md` — `app.realtime()` Broadcast / Presence / Postgres CDC: the mandatory environment probe, delivery guarantees, private-channel RLS, and CDC database-side setup.
7. `troubleshooting.md` — SDK version, DDL wrapping, role simulation, mini program base-library issues.

## Routing reminders

- PG business data uses `app.rdb().from(...)`, `queryPgDatabase`, and `managePgDatabase`.
- Realtime (`app.realtime()`, broadcast / presence / postgres_changes) is a **different module** from document-database `collection.watch()`. Probe the environment first — see `realtime.md` Step 0.
- Do not route PG work to NoSQL `app.database()` / `db.collection(...)` or MySQL `queryMysqlDatabase` / `manageMysqlDatabase`.
- Browser code must never contain API Key / `service_role` credentials.
- For owner fields, prefer `varchar(64)` / `text` with database defaults such as `DEFAULT auth.uid()` and omit the owner field from frontend insert payloads. Remember `auth.uid()` is `text`; cast with `::uuid` only when comparing to an existing `uuid` column.
