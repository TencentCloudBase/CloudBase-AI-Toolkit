# Access Patterns

Read this reference for application-level database access: loops, serial calls, duplicate reads, polling, pagination, and operational data.

## Batch N+1 reads

Database round trips should stay bounded as result cardinality grows.

**Incorrect: one query per row**

```ts
for (const row of rankedRows) {
  const { data: profile } = await db
    .from("profiles")
    .select("id, display_name")
    .eq("id", row.user_id)
    .single();
  profiles.push(profile);
}
```

**Correct: one batch query**

```ts
const userIds = [...new Set(rankedRows.map((row) => row.user_id))];
const { data: profiles, error } = await db
  .from("profiles")
  .select("id, display_name")
  .in("id", userIds);

if (error) throw error;
```

Identity lives in `auth.users`. Do not create `public.users` just to join display names. Use a business `profiles` table or embed a declared foreign key. Use a batch plus an in-memory map when separate result shaping is clearer.

## Run independent queries concurrently

Serial execution is correct when query B depends on query A. Independent reads should share one wait.

```ts
const [roomResult, memberResult] = await Promise.all([
  db.from("rooms").select("id, status").eq("id", roomId).single(),
  db.from("room_members").select("user_id, role").eq("room_id", roomId),
]);
if (roomResult.error) throw roomResult.error;
if (memberResult.error) throw memberResult.error;
```

`app.rdb()` returns `{ data, error }` and does not throw on query failure. Keep writes serial when they require ordered state transitions. Prefer an RPC when multiple writes must commit atomically; `Promise.all` does not provide a database transaction.

## Make polling selective

A status endpoint should read one job, room, or cursor range through an indexed equality/range predicate. Return an explicit retry interval or version marker. CloudBase PG has no NoSQL `.watch()` / Realtime subscription; do not copy that path onto `app.rdb()`.

Implement the poll with SDK filters, not raw `$1` SQL in application code:

```ts
const { data, error } = await db
  .from("jobs")
  .select("id, status")
  .eq("owner_id", ownerId)
  .gt("updated_at", since)
  .order("updated_at", { ascending: true })
  .order("id", { ascending: true })
  .limit(100);
if (error) throw error;
```

Back this path with an index on `(owner_id, updated_at, id)`.

## Bound lists without deep offsets

The documented SDK pagination helper is inclusive `.range(from, to)` after `.order()`. That is enough for short pages. Deep `.range()` still walks earlier rows.

```ts
const { data, error } = await db
  .from("articles")
  .select("id, title, created_at")
  .order("created_at", { ascending: false })
  .range(0, 19);
if (error) throw error;
```

For large ranked lists, wrap keyset SQL in an RPC. `app.rdb()` has no tuple-comparison helper, and application code must not send Postgres `$1` placeholders through the SDK.

```sql
-- RPC body / EXPLAIN target only
SELECT id, title, created_at
FROM articles
WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Back that RPC with `(created_at DESC, id DESC)`.

## Route operational data by purpose

- Application logs and request traces belong in CloudBase logging.
- Large immutable exports and archives belong in object storage.
- High-volume analytics events belong in an analytics-oriented system.
- PG holds transactional facts that need constraints, joins, or transactional updates.

If audit records are a product requirement, store a bounded audit model with retention, archive-to-storage planning, and restricted access. Do not use a catch-all request-log table as the default, and do not assume table partitioning is a CloudBase console feature.
