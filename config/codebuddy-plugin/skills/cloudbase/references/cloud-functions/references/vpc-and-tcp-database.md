# VPC and non-native TCP database access (cloud functions)

> **STOP — exception-only path.** Prefer CloudBase native SDK (`app.database()` / `app.rdb()`) or MCP SQL tools (`queryMysqlDatabase` / `manageMysqlDatabase` / `queryPgDatabase` / `managePgDatabase`) for business data. Do **not** read this file for new CRUD, notepads, CMS, or greenfield APIs. Continue only when migrating an **existing** app that already ships classic TCP clients (`DATABASE_URL`, Prisma, `mysql2`, `pg`, Redis). Credentials must come from the user or console env config — do **not** infer passwords from standard MCP instance-status queries (`getInstanceInfo`).

## When this applies

Use this only when the Event Function or HTTP Function uses a **classic TCP client** to reach MySQL / PostgreSQL / Redis / MongoDB (for example `DATABASE_URL`, `mysql2`, `pg`, Prisma, TypeORM, Sequelize).

**Does NOT apply** when the function uses CloudBase native SDK surfaces only:

- Document DB: `app.database()` / `db.collection(...)`
- CloudBase PG: `app.rdb()` / HTTP API gateway paths documented for CloudBase PG

Native SDK access is platform-managed and does **not** require function VPC binding for typical CloudBase DB usage.

## Required config for TCP / non-native SDK

| Field | Meaning |
| --- | --- |
| `envVariables.DATABASE_URL` (or `MYSQL_*` / `PG*` / `REDIS_*`) | Connection string / host for the **private** DB endpoint. Set from console or user-provided secrets — never invent credentials. |
| `vpc.vpcId` | Real VPC ID of that database (same region) |
| `vpc.subnetId` | Real subnet ID in that VPC with free IPs |

Event Functions and HTTP Functions share the same SCF networking model: both need `vpc` for private TCP access.

Official MySQL integration docs require enabling 私有网络 on the function and selecting the DB VPC: [Configure network connection](https://docs.cloudbase.net/cloud-function/resource-integration/mysql).

## Do not guess VPC IDs

Agents must **not**:

- Invent `vpc-xxxxx` / `subnet-xxxxx` placeholders
- Copy sample IDs from docs into a real deploy
- Assume “same environment” implies a default VPC without reading a real source

Resolve IDs from one of:

1. Database console / CloudBase MySQL settings (intranet VPC + subnet)
2. An existing resource that already works in that VPC (`queryFunctions getFunctionDetail`, CloudRun detail, CVM, etc.)
3. `callCloudApi` VPC/subnet describe APIs after confirming action names from docs
4. The user (ask and wait)

If IDs are still unknown after those steps: **stop**, report the gap, and do not deploy TCP DB env vars as if connectivity were solved.

## MCP usage

```javascript
await manageFunctions({
  action: "createFunction", // or updateFunctionConfig
  func: {
    name: "api",
    type: "HTTP", // or Event — same VPC rule
    envVariables: {
      // Replace with user/console-provided secret — do not paste passwords into chat logs
      DATABASE_URL: "<private-db-url-from-console-or-user>"
    },
    vpc: {
      vpcId: "<real-vpc-id>",
      subnetId: "<real-subnet-id>"
    }
  },
  functionRootPath: "/abs/path/to/cloudfunctions"
});
```

After create/update, call `queryFunctions(action="getFunctionDetail")` and verify `VpcConfig.VpcId` / `SubnetId`. Do not treat create/update success alone as proof that private TCP DB access works.

For TCP migration only, connection payloads may be fetched via `queryMysqlDatabase(action="getConnectionInfo")`. Standard `getInstanceInfo` does **not** return credentials.

## Side effects of enabling VPC

After VPC is bound, public internet egress may require NAT / public gateway in that VPC. Prefer fixing that network path over removing VPC just to “make outbound work” when the DB is private.
