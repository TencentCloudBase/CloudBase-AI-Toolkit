# CloudBase PG RLS Patterns

Use this reference when a CloudBase PostgreSQL app needs backend-side row permissions. Keep the policy model small and verify each operation from the app path.

## Principles

- UI hiding is not authorization.
- RLS enabled with zero policies denies browser/client reads and writes.
- `UPDATE` usually needs both visibility of the existing row and a check on the new row.
- A broad "logged-in users can access everything" rule is authentication, not authorization.
- Do not use privileged functions or definer-style bypasses to silence permission errors unless the task explicitly needs a trusted server/RPC boundary.
- The Web session is the source of truth for the app user. Use `auth.getSession()` in Web code and treat `session.user.id` as the candidate owner UID.
- Do not use `auth.getUser()` as a route guard or owner UID source unless you have already confirmed it returns the same logged-in user as `getSession()`.

## Choose One Permission Boundary

For app CRUD, choose the smallest working boundary:

- **Database/RLS**: tables are accessed directly from browser `app.rdb()` and policies enforce row ownership.
- **Server/RPC**: browser calls a server function/RPC, and the server enforces admin/editor behavior before writing.

Do not half-implement both. If direct browser access is used, RLS/policies must be complete before testing.

## Admin/Editor Shape

Typical role table:

```sql
create table if not exists public.user_roles (
  uid text primary key,
  username text not null unique,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Typical content table:

```sql
create table if not exists public.articles (
  _id uuid primary key default gen_random_uuid(),
  title text not null,
  author_id text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

The exact identity expression depends on CloudBase PG's current auth context. Do not copy Supabase-only helpers such as `auth.uid()` unless CloudBase PG exposes compatible semantics in the current environment. Inspect existing CloudBase docs/schema/functions or use the server/RPC boundary when identity claims are unclear.

## Required Identity Probe

Before writing or trusting policies that compare an owner column with `auth.uid()` or another DB-side helper:

1. In Web code, log in with the real username/password flow.
2. Call `auth.getSession()` and record `data.session.user.id`.
3. Insert a row through the same browser `app.rdb()` client with `author_id = data.session.user.id`.
4. Read that row back with `queryPgDatabase` and verify the owner column.
5. Attempt the same insert/update path as a second user if the app has admin/editor permissions.

If any browser `app.rdb()` operation fails, the RLS identity is not proven. Do not paper over it by catching the error and updating UI state. Either repair the RLS identity expression or move authorization to a server/RPC boundary.

Avoid self-referential role policies when possible. A policy on `public.user_roles` that queries `public.user_roles` again can recurse or behave differently across engines. Prefer one of these simpler patterns:

- Direct browser reads of roles with tightly scoped writes handled by setup/server code.
- A separate immutable role lookup object/function whose identity expression has already been verified.
- A server/RPC boundary for role-sensitive mutations.

## Verification Checklist

After creating policies, verify all required operations through the real app role:

- SELECT list/detail works for allowed rows.
- INSERT creates a row with the current user's owner column.
- UPDATE changes owned rows and does not reassign ownership unexpectedly.
- DELETE removes only allowed rows.
- Admin can operate across rows if the app requires admin behavior.

Then inspect schema/policies:

```text
queryPgDatabase(action="schema", objectName="public.articles")
queryPgDatabase(action="schema", objectName="public.user_roles")
```

If `rowLevelSecurityEnabled` is true and `policies` is empty, stop and create policies or disable RLS for that table before continuing.
