# CloudBase PG Auth And RLS

Use this reference before writing browser-side PG CRUD or database policies.

## Key / role mapping

| Credential | Database role | Where it can live | Notes |
| --- | --- | --- | --- |
| Publishable Key | `anon` | Frontend-safe | Still constrained by GRANT/RLS. |
| User access token | `authenticated` | SDK-managed frontend session | Represents a real logged-in user. |
| API Key | `service_role` | Backend / trusted tooling only | Bypasses RLS; never expose to browser code. Treat any leak as a serious credential compromise and rotate/revoke it via `manageAppAuth(action="deleteApiKey")` immediately. |

## `auth.users` — the built-in account table

CloudBase PG stores account data in `auth.users` (schema `auth`), not a business-defined table. Query it directly instead of creating a parallel `public.users` table for identity data:

```sql
select id, email, phone, app_metadata, user_metadata from auth.users;

-- Join business tables against the built-in account table
select o.*, u.user_metadata->>'name' as buyer_name
from public.orders o
join auth.users u on u.id = o.buyer_id;
```

Only create a separate `public.*` table (e.g. `user_roles`, `profiles`) when the app needs fields that do not belong in `auth.users`, such as an app-specific role or a denormalized display name for fast reads. Do not duplicate `email`/`phone` into a new table just to avoid a join.

## SQL identity helpers

CloudBase PG provides official SQL helpers:

```sql
select auth.uid();   -- JWT sub / user id
select auth.role();  -- anon / authenticated / service_role
select auth.jwt();   -- full JWT claims as jsonb
select auth.email(); -- current email if available
```

**⚠️ CRITICAL: Always use `auth.uid()` for user identity in RLS policies.** Do NOT use `current_user` or `current_setting(...)` — these are PostgreSQL built-in functions that return the database role name (e.g. `authenticated`), not the CloudBase auth user ID. Using `current_user` in a policy like `USING (author_id = current_user)` will never match any real user ID.

If you are unsure whether the auth helper functions are available in your environment, run:
```sql
SELECT proname FROM pg_proc WHERE pronamespace = 'auth'::regnamespace;
```
This returns the list of available `auth.*` functions (e.g. `uid`, `role`, `jwt`, `email`).

Prefer database-owned identity fields:

```sql
create table public.todos (
  id bigserial primary key,
  title text not null,
  owner_id varchar(64) not null default auth.uid(),
  created_at timestamptz not null default now()
);
```

Frontend insert payloads should omit `owner_id` / `author_id` when the column has `DEFAULT auth.uid()`.

## Minimum GRANT + RLS sequence

Business tables require two layers: table-level GRANT and row-level RLS. Both must pass.

```sql
create table public.todos (
  id bigserial primary key,
  title text not null,
  is_completed boolean not null default false,
  owner_id varchar(64) not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index idx_todos_owner_id on public.todos(owner_id);

-- Table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.todos_id_seq TO authenticated;
GRANT ALL ON public.todos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.todos_id_seq TO service_role;

-- Row permissions
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY todos_select_own ON public.todos
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY todos_insert_own ON public.todos
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY todos_update_own ON public.todos
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY todos_delete_own ON public.todos
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
```

## Accessing PG from a cloud function

A cloud function has two distinct ways to reach PG, and they are NOT interchangeable. Choose based on whether the function should act as the logged-in caller or as an admin/backend task:

1. **Act as the caller, stay RLS-constrained** — when a function wraps business logic but must still respect row ownership (e.g. an HTTP Function that a logged-in user calls to run a multi-step update). The caller's access token must reach the function and then be forwarded to the PG REST call:

   ```js
   const res = await fetch(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/orders?select=*`, {
     headers: { Authorization: `Bearer ${callerAccessToken}` },
   });
   ```

   Do not guess the exact field/property that carries `callerAccessToken` from `event`/`context` (or an HTTP Function's `req.headers`). Verify it against the installed `@cloudbase/node-sdk` version and the official cloud-functions docs before writing this code; if you cannot verify the field, treat this pattern as unavailable rather than inventing a shape.

2. **Act as admin, bypass RLS with the API Key (`service_role`)** — use this only for admin/backend tasks such as batch imports, cross-user aggregation, or scheduled jobs, and only inside a cloud function / CloudRun service:

   ```js
   // Inject the API Key via function environment variables; never return it to the client.
   const res = await fetch(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/orders?select=*`, {
     headers: { Authorization: `Bearer ${process.env.CLOUDBASE_API_KEY}` },
   });
   ```

Do not default to the API Key path just because it is simpler — if the task only needs "let the logged-in user read/write their own rows," forwarding the caller's access token keeps RLS as the enforcement layer and avoids re-implementing ownership checks in function code. Never let a function response leak the API Key back to the frontend.

## Pitfalls

- RLS enabled with zero policies denies all non-`service_role` access.
- Policy without GRANT still fails at the table-permission layer.
- `UPDATE` must normally include both `USING` and `WITH CHECK` to prevent owner-field reassignment.
- `serial` / `bigserial` requires sequence grants or inserts can fail.
- Admin/control-plane execution can hide user-facing permission failures; test as `anon` / `authenticated` when possible.
- **Do NOT use `current_user` in RLS policies.** `current_user` returns the database role name (e.g. `authenticated`), not the actual user ID. Always use `auth.uid()` for user identity checks.
