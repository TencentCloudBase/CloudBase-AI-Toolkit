# CloudBase PG RLS Patterns

Use this reference when a CloudBase PostgreSQL app needs backend-side row permissions. Keep the policy model small and verify each operation from the app path.

## Principles

- UI hiding is not authorization.
- Browser/client access requires both table-level `GRANT` and row-level RLS Policy for business tables. Either layer can deny the request.
- RLS enabled with zero policies denies browser/client reads and writes.
- `UPDATE` usually needs both visibility of the existing row (`USING`) and a check on the new row (`WITH CHECK`).
- `serial` / `bigserial` primary keys require sequence grants such as `GRANT USAGE, SELECT ON SEQUENCE public.todos_id_seq TO authenticated;` before inserts work.
- A broad "logged-in users can access everything" rule is authentication, not authorization.
- Do not use privileged functions or definer-style bypasses to silence permission errors unless the task explicitly needs a trusted server/RPC boundary.
- The Web session is the source of truth for the app user. Use `auth.getSession()` in Web code and treat `session.user.id` as the candidate owner UID.
- In SQL policies, use CloudBase PG's official helpers: `auth.uid()` for JWT `sub`, `auth.role()` for `anon` / `authenticated` / `service_role`, `auth.jwt()` for full claims, and `auth.email()` when needed.
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
  author_id varchar(64) not null default auth.uid(),
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

For direct browser `app.rdb()` access, grant the intended role and then constrain rows with RLS. Minimal owner-based policy shape:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY articles_select_own ON public.articles
  FOR SELECT TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY articles_insert_own ON public.articles
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY articles_update_own ON public.articles
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
```

`service_role` can bypass RLS, so never expose API Key / `service_role` credentials to browser code.

## Required Identity Probe

Before trusting policies that compare an owner column with `auth.uid()` or another DB-side helper:

1. In Web code, log in with the real username/password flow.
2. Call `auth.getSession()` and record `data.session.user.id`.
3. Insert a row through the same browser `app.rdb()` client without passing the owner column when the table has `DEFAULT auth.uid()`.
4. Read that row back with `queryPgDatabase` and verify the owner column equals `data.session.user.id`.
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
