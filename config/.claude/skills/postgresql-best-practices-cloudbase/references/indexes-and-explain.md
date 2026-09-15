# Indexes and EXPLAIN

Read this reference when a query or RPC is slow, or when a changed access path needs an index decision.

## Index observed access paths

PostgreSQL automatically indexes primary and unique keys. It does not automatically index referencing foreign-key columns. Add indexes for frequent filters, joins, and stable ordering paths.

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

Use `queryPgDatabase(action="sql", sql="EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ...")` only with safe, read-only SQL and representative parameters. `ANALYZE` executes the statement; use plain `EXPLAIN` for writes or any statement with side effects.

Record:

- actual time and returned rows;
- estimated rows versus actual rows;
- sequential scans on large relations;
- loops greater than one on expensive child nodes;
- sort/hash spill indicators and buffer reads;
- the dominant node, not merely the highest estimated cost.

After changing SQL or adding an index through `applyMigration`, run the same plan again and compare actual execution time, row estimates, buffers, and scan type. A plan change without measured improvement is not completion.

## Stored procedures and RPCs

For a slow RPC, identify the SQL statements inside the function and explain those statements with representative arguments. A top-level RPC duration alone cannot identify missing indexes or repeated work. Prefer set-based SQL over procedural loops that issue one query per item.
