# CloudBase PG Reference Index

Use this index after `postgresql-development/SKILL.md` identifies the task as CloudBase PostgreSQL / CloudBase PG / PG mode.

## Read order

1. `pg-mode-overview.md` — environment shape, schemas, roles, and when PG mode applies.
2. `auth-and-rls.md` — JWT identity, `auth.uid()` / `auth.role()` / `auth.jwt()`, GRANT + RLS templates, and `service_role` risks.
3. `app-workflow.md` — end-to-end Web/CMS implementation workflow.
4. `storage-pg.md` — PG storage bucket/object model, `app.storage.from('bucket')`, and storage RLS.
5. `http-api.md` — PostgREST `/v1/rdb/rest/...` fallback and auth headers.
6. `troubleshooting.md` — SDK version, DDL wrapping, role simulation, mini program base-library issues.

## Routing reminders

- PG business data uses `app.rdb().from(...)`, `queryPgDatabase`, and `managePgDatabase`.
- Do not route PG work to NoSQL `app.database()` / `db.collection(...)` or MySQL `queryMysqlDatabase` / `manageMysqlDatabase`.
- Browser code must never contain API Key / `service_role` credentials.
- For owner fields, prefer database defaults such as `DEFAULT auth.uid()` and omit the owner field from frontend insert payloads.
