# Schema and RLS Quality

Read this reference when an access design changes tables, relationships, tenant isolation, or row policies. Use `../postgresql-development-cloudbase/references/auth-and-rls.md` as the canonical source for CloudBase grants, helper types, and complete policy templates.

## Start from access paths

Before DDL, write down:

- rows created per business event;
- common equality, range, join, and ordering predicates;
- expected cardinality and retention;
- write contention and required atomic transitions;
- owner or tenant boundary for every row.

Normalize transactional facts by default. Denormalize only a measured hot read and define how the derived value stays consistent.

## Encode invariants in PostgreSQL

Use a primary key, `NOT NULL`, `UNIQUE`, foreign keys, and `CHECK` constraints for invariants the database can enforce. Use `TIMESTAMPTZ` for event time and exact `NUMERIC` for money. Prefer `GENERATED ... AS IDENTITY` for new numeric surrogate keys.

Index the referencing side of every foreign key used for joins or parent deletion checks.

## Separate authentication from authorization

The policy `TO` clause selects eligible database roles. `USING` and `WITH CHECK` select eligible rows.

**Incorrect: authenticated users can access every order**

```sql
CREATE POLICY orders_read ON public.orders
  FOR SELECT
  USING (auth.role() = 'authenticated');
```

**Correct: authenticated users can access their own orders**

```sql
CREATE INDEX orders_owner_id_idx ON public.orders (owner_id);

CREATE POLICY orders_read_own ON public.orders
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
```

CloudBase `auth.uid()` returns `text`; keep owner identifiers as `varchar(64)` or `text`. Do not default owner columns to `uuid`. Wrapping stable auth helpers in `SELECT` lets PostgreSQL initialize the value once instead of evaluating it for every row. Table access still needs `GRANT` plus RLS; copy the grant sequence from `../postgresql-development-cloudbase/references/auth-and-rls.md`.

For updates, use both predicates:

```sql
CREATE POLICY orders_update_own ON public.orders
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
```

`TO authenticated` includes any session that maps to that role, including anonymous sign-in. Do not copy a Supabase claim name from memory. Inspect `auth.jwt()` in this environment, or store a durable role in a `profiles` / `user_roles` table keyed by `auth.uid()`.

## Multi-tenant default

Use shared tables with an explicit `tenant_id` plus RLS when tenants share the same schema and lifecycle. Include `tenant_id` in unique constraints and leading index columns for tenant-scoped queries.

CloudBase PG is one database per environment. Do not plan a second database or a provisioned schema-per-tenant fleet. Isolate tenants with `tenant_id` plus RLS. Do not create one table per user.

## Migration discipline

Represent each schema change as a local `cloudbase/migrations/<version>_<name>.sql` file and apply it through `applyMigration`. In disposable environments, a new migration may deliberately rebuild a table. In persistent environments, use forward-compatible expand/migrate/contract changes and a new migration for every correction.
