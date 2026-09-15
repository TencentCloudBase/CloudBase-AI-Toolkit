# Capacity and Connections

Read this reference for burst traffic, launch readiness, connection pressure, or serverless database access.

## Inspect before a launch

Call `queryEnv(action="info", envId=...)` and record the PostgreSQL allocation exposed by the environment response. Pair it with explicit workload assumptions:

- peak requests per second and burst duration;
- database operations per request after batching;
- expected active rows and result sizes;
- scheduled jobs that overlap the peak;
- acceptable latency and failure rate.

Small development allocations are not evidence of production capacity. If the environment response lacks enough detail to judge capacity, state that uncertainty and ask for a verified console allocation or load-test result.

## Estimate database demand

Use:

```text
database_ops_per_second =
  request_rate
  * database_round_trips_per_request
  * retry_multiplier
```

This is a planning estimate, not a capacity guarantee. Reduce round trips before using instance size as the only remedy.

## Reuse connections at trusted compute boundaries

For Cloud Functions and CloudRun code that connects through a supported server-side driver, create the client or pool at module scope so warm invocations reuse it. Bound pool size and request timeouts for the runtime and instance concurrency.

```ts
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 3_000,
  idleTimeoutMillis: 30_000,
});

export async function loadOrder(id: string) {
  const result = await pool.query(
    "SELECT id, status FROM orders WHERE id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}
```

The numeric defaults above are an example, not a universal setting. A larger pool can increase per-instance throughput but can exhaust database connections when serverless instances scale out.

Browser applications should use `app.rdb()` through the CloudBase gateway. Do not expose database connection strings, SecretKey, API Key, or `service_role` credentials to browser code.

## Define a peak response

Before launch, identify who can change capacity, how long a change takes, what metric triggers action, and how traffic is shed while the database is unhealthy. Treat automatic scaling as unavailable unless the target environment explicitly proves otherwise.

A skill can surface this risk; it cannot provision missing elasticity or repair a platform authentication failure.
