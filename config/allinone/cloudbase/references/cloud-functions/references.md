# Cloud Functions Reference Map

Use this file to decide which detailed reference to read after the main skill.

## Read this next when

- You already know the task belongs to Cloud Functions, but the main `SKILL.md` is intentionally keeping only the routing and guardrails.

## Reference routing

### `./references/event-functions.md`

Read this when the task is about:

- `exports.main(event, context)`
- SDK-invoked serverless functions
- timer-triggered jobs
- Event Function deployment or invocation patterns

### `./references/http-functions.md`

Read this when the task is about:

- HTTP endpoints
- REST APIs
- SSE or WebSocket services
- `scf_bootstrap`
- browser/public access paths for HTTP Functions

### `./references/http-function-credentials.md`

Read this whenever a managed-runtime or Custom Image HTTP Function calls CloudBase resources through:

- `@cloudbase/node-sdk`
- `@cloudbase/manager-node`
- `CLOUDBASE_APIKEY`
- Tencent Cloud `SecretId` / `SecretKey`

HTTP Functions must use an explicit credential path. The Event Function passwordless runtime path does not apply reliably to HTTP Functions.

### `./references/http-functions-custom-image.md`

Read this when the task is about:

- deploying an HTTP Function from a **container image** (`Runtime: CustomImage`)
- `imageConfig` / `ImageUri` / TCR image addresses
- the zip → COS → CloudApp custom build → TCR → SCF image pipeline
- choosing between a managed-runtime HTTP Function, a Custom Image HTTP Function, and a CloudRun container

### `./references/operations-and-config.md`

Read this when the task is about:

- function logs
- timeout / environment-variable updates
- timer cron format
- VPC field shape only (examples) — for TCP DB policy see `vpc-and-tcp-database.md` (exception-only)
- gateway exposure for Event Functions
- SCF layers: account-scoped naming `{layerName}_{当前envId}`, soft `warnings`, list/create/bind/delete actions
- legacy tool-name translation
- `callCloudApi` fallback for Cloud Functions

### `./references/vpc-and-tcp-database.md` (exception-only — do not read by default)

Read this **only** when the task is migrating an **existing** app that already uses classic TCP clients:

- existing `DATABASE_URL` / Prisma / TypeORM / Sequelize / `mysql2` / `pg` / Redis TCP clients
- private MySQL / PostgreSQL / Redis connectivity from Event or HTTP Functions that cannot use native SDK

**Do NOT read this for new business CRUD.** Prefer CloudBase native SDK (`app.rdb()` / `app.database()`) or MCP SQL tools. New apps must not introduce TCP DB clients, ask users for DB passwords, or treat VPC binding as the default path.

When this exception applies:

- `vpc.vpcId` / `vpc.subnetId` is mandatory for private TCP access
- **never guess** VPC IDs

## Keep these distinctions straight

- Event Function code shape: `exports.main(event, context)`
- HTTP Function code shape: `req` / `res` web server on port `9000`
- Event Functions can use the platform-provided runtime credential path; HTTP Functions that call CloudBase SDKs must follow `http-function-credentials.md`
- HTTP Access for Event Functions is a gateway configuration, not the HTTP Function runtime model
- CloudRun is the right route when the task is actually a long-lived service or broader container workload
- Custom Image HTTP Function (`Runtime: CustomImage`) still listens on the fixed port `9000` and is request-driven — distinct from a CloudRun container, which listens on the injected `PORT` and runs long-lived
