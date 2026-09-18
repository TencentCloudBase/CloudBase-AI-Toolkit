---
name: postgresql-best-practices-cloudbase
description: "CloudBase PostgreSQL access-pattern and slow-query quality guidance. Use when designing how tables are read and written, eliminating per-row database calls, adding indexes for filters or joins, reviewing high-traffic data access, or explaining a slow SQL query. Not for first-time PG SDK setup, login UI, or NoSQL collections."
version: 2.34.4
alwaysApply: false
---

# CloudBase PostgreSQL Best Practices

This skill turns a working CloudBase PG implementation into a reviewable access design. It makes query paths, indexes, row authorization, and launch capacity explicit before code is considered complete.

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../postgresql-development-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## When to use

- A feature needs a new or changed access pattern.
- Application code performs repeated, serial, or high-frequency PG queries.
- A SQL query, RPC, endpoint, or polling path is slow.
- A high-traffic launch needs a database readiness review.

## Do NOT use for

- PG environment setup, `app.rdb()` syntax, migrations, GRANTs, or base RLS correctness: use `../postgresql-development-cloudbase/SKILL.md`.
- Login provider or UI implementation: use the matching auth skill.
- Confirmed NoSQL collection work: use the document database skill.
- Platform alarm diagnosis or slow-log collection: use `../ops-inspector/SKILL.md`.

## Workflow

### 1. Inventory access paths

List every changed endpoint, job, RPC, or UI flow and its reads and writes. Record filters, joins, sort keys, expected cardinality, and request frequency.

**Complete when:** every changed path has a concrete query inventory; unknown volume or peak concurrency is marked as an assumption for the user.

### 2. Design schema, indexes, and row authorization together

Derive columns and indexes from the query inventory. Every frequent filter, join, and stable ordering path must have a deliberate index decision. For user-owned rows, use the role as the policy gate and identity as the row predicate:

```sql
CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
```

Apply schema DDL through the versioned `applyMigration` workflow defined by `../postgresql-development-cloudbase/SKILL.md`. This keeps Git, development, and production reproducible; the tradeoff is that experiments require a new migration version instead of ad hoc schema mutation.

**Complete when:** every query predicate has an index decision, every user-owned path has an ownership predicate, and all DDL is represented in one reviewable migration for the change.

### 3. Implement bounded database access

Batch related keys, combine repeated reads, and execute independent queries concurrently. Keep each result bounded by a filter plus `.limit()` / `.range()`, or by an RPC that implements keyset pagination.

```ts
const userIds = [...new Set(rows.map((row) => row.user_id))];
const { data: profiles, error } = await db
  .from("profiles")
  .select("id, display_name")
  .in("id", userIds);

if (error) throw error;
```

Send request logs, traces, and high-volume analytics to the platform logging service or purpose-built analytics storage. Keep PG for transactional data that participates in business queries and constraints.

**Complete when:** the changed code has no database call inside an item loop, no repeated read of the same row in one request, and no unbounded hot-path query.

### 4. Check launch capacity when traffic is material

For campaigns, rankings, polling endpoints, or other bursty paths, inspect the target environment with `queryEnv(action="info", envId=...)`. Report the observed PG allocation, expected peak load, and unresolved capacity risk. CloudBase currently requires an explicit capacity plan; do not represent autoscaling as guaranteed.

**Complete when:** the current allocation is recorded and either judged against an explicit traffic assumption or raised to the user as an unresolved launch blocker.

## Routing

| Current branch | Read |
| --- | --- |
| Repeated calls, serial queries, polling, pagination, or logging tables | `references/access-patterns.md` |
| Missing indexes, slow SQL/RPC, or query-plan review | `references/indexes-and-explain.md` |
| New schema, tenant isolation, or RLS performance | `references/schema-and-rls.md` |
| Campaign launch or database sizing | `references/capacity-and-connections.md` |

Load only the references required by the current branch.

## Minimum self-check

- Every changed access path is accounted for.
- Every frequent filter, join, and stable sort has an index decision.
- Database round trips are bounded independently of result cardinality.
- RLS separates role gating (`TO`) from row authorization (`auth.uid()`).
- Schema changes use the canonical migration workflow.
- Capacity claims are based on observed allocation and stated traffic assumptions.
