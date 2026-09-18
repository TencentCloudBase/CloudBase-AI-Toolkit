# Capacity and Connections

Read this reference for burst traffic, launch readiness, or database sizing. CloudBase PG business data uses the SDK or HTTP gateway, not an application-managed TCP pool.

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

## Prefer the SDK path; do not invent a TCP pool

CloudBase PG traffic from Web, cloud functions, and CloudRun should go through the existing `app.rdb()` client (or the documented PG HTTP API). That path is an HTTP request to the CloudBase gateway. The platform owns database sessions behind the gateway. Application code does not open `pg.Pool`, does not hold `DATABASE_URL`, and cannot tune `max_connections` from the SDK. Do not add a second `cloudbase.init` in this skill; reuse the client from `../postgresql-development-cloudbase/SKILL.md`.

What still belongs to the application:

- fewer round trips per request (batch, join, concurrency);
- bounded result sets;
- observed instance size versus stated peak QPS.

Reuse one SDK `app` / `db` at module scope so credential and client setup are not repeated. That is not a PostgreSQL connection pool. The documented single-row helper is `.single()`, not `.maybeSingle()`.

```ts
export async function loadOrder(id: string) {
  const { data, error } = await db
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
```

Do not expose database connection strings, SecretKey, API Key, or `service_role` credentials to browser code.

TCP clients (`pg`, Prisma, `DATABASE_URL`) are an exception-only migration path. They need VPC access and a bounded pool because each compute instance then holds real database connections. Do not introduce that path for new CloudBase PG CRUD. If an existing app already uses it, follow `../cloudrun-development/references/vpc-and-database.md` and `../cloud-functions/references/vpc-and-tcp-database.md`.

## Define a peak response

Before launch, identify who can change capacity, how long a change takes, what metric triggers action, and how traffic is shed while the database is unhealthy. Treat automatic scaling as unavailable unless the target environment explicitly proves otherwise.

A skill can surface this risk; it cannot provision missing elasticity or repair a platform authentication failure.
