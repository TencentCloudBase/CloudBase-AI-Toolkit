# Access Patterns

Read this reference for application-level database access: loops, serial calls, duplicate reads, polling, pagination, and operational data.

## Batch N+1 reads

Database round trips should stay bounded as result cardinality grows.

**Incorrect: one query per row**

```ts
for (const row of rankedRows) {
  const { data: user } = await db.from("users").select("id, display_name").eq("id", row.user_id).single();
  profiles.push(user);
}
```

**Correct: one batch query**

```ts
const userIds = [...new Set(rankedRows.map((row) => row.user_id))];
const { data: users, error } = await db
  .from("users")
  .select("id, display_name")
  .in("id", userIds);

if (error) throw error;
```

Use embedded PostgREST relationships when the response naturally follows declared foreign keys. Use a batch plus an in-memory map when separate result shaping is clearer.

## Run independent queries concurrently

Serial execution is correct when query B depends on query A. Independent reads should share one wait.

```ts
const [roomResult, memberResult] = await Promise.all([
  db.from("rooms").select("id, status").eq("id", roomId).single(),
  db.from("room_members").select("user_id, role").eq("room_id", roomId),
]);
```

Keep writes serial when they require ordered state transitions. Prefer a transaction or RPC when multiple writes must commit atomically; `Promise.all` does not provide atomicity.

## Make polling selective

A status endpoint should read one job, room, or cursor range through an indexed equality/range predicate. Return an explicit retry interval or version marker. For event-driven state already exposed through CloudBase Realtime, prefer a subscription over repeated scans.

**Incorrect**

```sql
SELECT id, status FROM jobs ORDER BY created_at;
```

**Correct**

```sql
SELECT id, status
FROM jobs
WHERE owner_id = $1 AND updated_at > $2
ORDER BY updated_at, id
LIMIT 100;
```

Back this query with an index on `(owner_id, updated_at, id)`.

## Bound lists with keyset pagination

Deep offsets scan and discard earlier rows. Use a deterministic tie-breaker.

```sql
SELECT id, title, created_at
FROM articles
WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Back this path with `(created_at DESC, id DESC)`.

## Route operational data by purpose

- Application logs and request traces belong in CloudBase logging.
- Large immutable exports and archives belong in object storage.
- High-volume analytics events belong in an analytics-oriented system.
- PG holds transactional facts that need constraints, joins, or transactional updates.

If audit records are a product requirement, store a bounded audit model with retention, partition/archive planning, and restricted access. Do not use a catch-all request-log table as the default.
