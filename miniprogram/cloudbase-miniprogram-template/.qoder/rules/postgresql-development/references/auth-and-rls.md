# CloudBase PG Auth And RLS

Use this reference before writing browser-side PG CRUD or database policies.

## Key / role mapping

| Credential | Database role | Where it can live | Notes |
| --- | --- | --- | --- |
| Publishable Key | `anon` | Frontend-safe | Still constrained by GRANT/RLS. |
| User access token | `authenticated` | SDK-managed frontend session | Represents a real logged-in user. |
| API Key | `service_role` | Backend / trusted tooling only | Bypasses RLS; never expose to browser code. |

## SQL identity helpers

CloudBase PG provides official SQL helpers:

```sql
select auth.uid();   -- JWT sub / user id
select auth.role();  -- anon / authenticated / service_role
select auth.jwt();   -- full JWT claims as jsonb
select auth.email(); -- current email if available
```

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

## Pitfalls

- RLS enabled with zero policies denies all non-`service_role` access.
- Policy without GRANT still fails at the table-permission layer.
- `UPDATE` must normally include both `USING` and `WITH CHECK` to prevent owner-field reassignment.
- `serial` / `bigserial` requires sequence grants or inserts can fail.
- Admin/control-plane execution can hide user-facing permission failures; test as `anon` / `authenticated` when possible.
