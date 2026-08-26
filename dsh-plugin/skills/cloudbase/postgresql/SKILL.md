---
name: postgresql-development
description: Use when building or inspecting CloudBase PostgreSQL — queryPgDatabase, managePgDatabase, RLS, app.rdb().
---

# PostgreSQL (DSH)

- Read: `mcp__cloudbase__queryPgDatabase` `action=context|objects|metadata|schema|sql`.
- Write/DDL: `mcp__cloudbase__managePgDatabase` `action=execute` with `confirm=true`. Never skip confirm.
- Prefer `public.<table>` qualified names.
- Do not call MySQL tools when `RuntimeMode` is `postgresql`.
