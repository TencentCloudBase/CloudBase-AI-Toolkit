# Indexes and EXPLAIN

Read this reference when a query or RPC is slow, or when a changed access path needs an index decision.

## Index observed access paths

PostgreSQL automatically indexes primary and unique keys. It does not automatically index referencing foreign-key columns. Add indexes for frequent filters, joins, and stable ordering paths. The SQL below is for migrations and `EXPLAIN`; substitute literals. Application reads still go through `app.rdb()`.

**Incorrect**

```sql
SELECT id, status, updated_at
FROM matches
WHERE room_id = $1 AND status = 'active'
ORDER BY updated_at DESC;
```

**Correct migration**

```sql
CREATE INDEX matches_room_active_updated_idx
  ON public.matches (room_id, updated_at DESC)
  WHERE status = 'active';
```

Put equality columns first, then range or ordering columns. Use a partial index when the same selective predicate appears consistently. Each extra index increases write cost and storage, so tie every non-constraint index to a named access path.

## Preserve indexable predicates

Compare raw indexed columns to ranges instead of wrapping them in a function.

```sql
-- Full scan risk unless a matching expression index exists
WHERE date_trunc('day', created_at) = $1

-- Uses a normal index on created_at
WHERE created_at >= $1 AND created_at < $1 + INTERVAL '1 day'
```

## Explain before changing

Use `queryPgDatabase(action="sql")` with `EXPLAIN (BUFFERS, FORMAT TEXT)` and representative literals. That action only accepts read-only SQL. The read-only gate treats the token `ANALYZE` as mutating, so `EXPLAIN ANALYZE` is rejected — do not send it through `queryPgDatabase`.

Plain `EXPLAIN` estimates a plan; it does not prove runtime cost. After an index lands, compare scan type, row estimates, and buffer reads on the same `EXPLAIN` text. If actual timings are required, state that the management SQL path cannot run `EXPLAIN ANALYZE` and do not invent a TCP `psql` session.

Record:

- estimated rows;
- sequential scans on large relations;
- sort or hash nodes;
- buffer reads;
- the dominant node, not merely the highest estimated cost.

After changing SQL or adding an index through `applyMigration`, run the same `EXPLAIN` again and compare scan type, row estimates, and buffers. A plan change without a better scan or estimate is not completion.

## Stored procedures and RPCs

For a slow RPC, identify the SQL statements inside the function and explain those statements with representative arguments. A top-level RPC duration alone cannot identify missing indexes or repeated work. Prefer set-based SQL over procedural loops that issue one query per item.
