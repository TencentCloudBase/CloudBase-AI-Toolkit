# CloudRun VPC and Database Connectivity

Use this reference when deploying **existing / third-party apps** (GitHub projects, Docker images, classic backends) that talk to databases over **TCP connection strings**, not CloudBase SDK APIs.

Official docs: [VPC configuration for CloudBase Run](https://docs.cloudbase.net/run/deploy/networking/vpc)

## Critical distinction

| Concept | What it controls | Typical field |
| --- | --- | --- |
| **Ingress access type** | How callers reach the CloudRun **service** (public HTTPS, mini program, VPC-only ingress) | `OpenAccessTypes` |
| **Egress / private network** | Whether CloudRun **instances** join a VPC so they can reach MySQL / PostgreSQL / Redis / CVM inside that VPC | `serverConfig.VpcConf` |

These are independent. A service can be publicly reachable (`OpenAccessTypes: ["PUBLIC"]`) **and** still need `VpcConf` so the process can open a TCP connection to a private database.

## VPC bind timing (important)

Evidence and docs are mixed; do **not** assume delete+recreate is always required.

What we know:

1. **`@cloudbase/manager-node` &lt; 5.6.2** silently dropped `VpcConf` in `parseObjectToDiffConfigItem`, so MCP/CLI deploy never sent VPC on create **or** update. That alone can look like “update ignored VPC”.
2. **`>= 5.6.2`** serializes `VpcConf` into deploy `Items` for both `CreateCloudRunServer` and `UpdateCloudRunServer`. MCP also maps `VpcConf` → top-level `vpcInfo` (`CreateType: 2`) on create.
3. **Current CloudBase docs** say VPC can be set at create **or** changed later in service settings ([VPC configuration](https://docs.cloudbase.net/run/deploy/networking/vpc)). An older product page said VPC cannot be changed; treat that as outdated unless you observe otherwise.

Practical agent rules:

1. Always pass `serverConfig.VpcConf` when the app needs TCP access to a VPC DB/cache.
2. Prefer correct VPC on **first** create.
3. If the service already exists:
   - Prefer `manageCloudRun(action="updateConfig")` to change VPC / EnvParams / MinNum without re-uploading code (console-aligned `SubmitServerConfigChangeDiff`).
   - Or redeploy with `VpcConf`. MCP **deploy** uses Read-Merge-Write: omitting `VpcConf` / partial `EnvParams` / omitting `OpenAccessTypes` **preserves** remote values (set `envParamsReplaceAll=true` only when you intend a full env replace).
   - Then **verify** with `queryCloudRun(action="detail")` (`ServerConfig.VpcConf`).
4. If detail still shows missing/wrong VPC after a successful update, fall back to console network settings or delete + recreate — do not loop blind redeploys.

## When VpcConf is mandatory

Treat VPC binding as **required** before deploy when **any** of these signals appear:

- Env vars: `DATABASE_URL`, `DB_HOST`, `MYSQL_*`, `POSTGRES_*`, `PGHOST`, `PG_*`, `REDIS_*`, `MONGO_*`, `SQLALCHEMY_DATABASE_URI`, `SPRING_DATASOURCE_*`
- Connection URLs: `postgres://`, `postgresql://`, `mysql://`, `redis://`, `mongodb://`
- Project files: `docker-compose*.yml` with db/redis services, `.env.example` with DB hosts, ORM configs pointing at a host:port
- User intent: "use CloudBase MySQL / TencentDB / self-hosted PG / Redis in VPC"

## When VpcConf is NOT required for database access

- Browser or Mini Program apps that only use CloudBase PG via `app.rdb()` / PG HTTP gateway
- Backends that only use CloudBase NoSQL / storage SDKs over public CloudBase APIs
- Pure compute services with no VPC-private dependencies

If the user says "PostgreSQL" but the app is a classic TCP client (for example new-api, WordPress, Ghost, most Go/Java/Python ORMs), do **not** assume CloudBase PG SDK mode is a drop-in. Prefer a TCP-reachable database in the same VPC, or explicitly redesign the app to use the SDK/gateway.

## Mandatory deploy sequence (existing app + DB)

1. **Detect** DB / cache dependency signals in code and env templates.
2. **Choose DB shape**
   - Existing TCP app → CloudBase MySQL / TencentDB / other VPC DB with private hostname
   - New CloudBase-native app → CloudBase PG + `app.rdb()` (no CloudRun VPC required for gateway access)
3. **Resolve network**
   - VPC and subnet must be in the **same region** as the CloudRun service
   - Prefer the **same VPC** as the database
   - Ensure the subnet has enough free IPs for CloudRun instances
   - **Do NOT invent** `vpc-` / `subnet-` IDs or paste doc placeholders into a real deploy
   - Resolve real IDs from the DB console, an existing working resource detail, `callCloudApi` describe APIs, or the user — **stop** if still unknown
4. **Configure security groups / allowlists** so the CloudRun subnet can reach the DB port (typically 3306 / 5432 / 6379).
5. **Set env vars to private endpoints** (intranet host), not public endpoints, unless the user explicitly requires public access and has opened the allowlist.
6. **Deploy with both** public ingress (if needed) **and** `VpcConf`:

```json
{
  "action": "deploy",
  "serverName": "my-existing-app",
  "targetPath": "/abs/path/to/app",
  "serverConfig": {
    "OpenAccessTypes": ["PUBLIC"],
    "Cpu": 0.5,
    "Mem": 1,
    "MinNum": 1,
    "MaxNum": 5,
    "EnvParams": "{\"DATABASE_URL\":\"postgres://user:pass@10.x.x.x:5432/db\"}",
    "VpcConf": {
      "VpcId": "vpc-xxxxxxxx",
      "SubnetId": "subnet-xxxxxxxx"
    }
  }
}
```

7. **Verify** with `queryCloudRun(action="detail")` that VPC is attached, then hit an app health/db-check endpoint or inspect runtime logs for connection errors.

## Do not ship this anti-pattern

```json
{
  "serverConfig": {
    "OpenAccessTypes": ["PUBLIC"],
    "EnvParams": "{\"DATABASE_URL\":\"postgres://...private-host...\"}"
  }
}
```

Missing `VpcConf` here commonly yields deploy **success** followed by runtime `ECONNREFUSED`, timeout, or "could not connect to server".

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Deploy OK, app cannot connect to DB | Missing/wrong VPC, or old SDK dropped `VpcConf` | Use `updateConfig` or redeploy with `VpcConf` on SDK &gt;= 5.6.2; verify via `detail`; if still wrong, console or recreate |
| Redeploy wiped console VPC / env keys | Partial deploy without merge (legacy) | Current MCP deploy RMW preserves remote `VpcConf` / EnvParams keys / `OpenAccessTypes`; prefer `updateConfig` for config-only changes |
| Timeout to DB IP | Security group / ACL | Allow CloudRun subnet CIDR on DB port |
| Works locally, fails on CloudRun | Using `localhost` / docker-compose hostname | Replace with VPC private address |
| Connected VPC but lost outbound Internet | Public egress disabled without NAT | Keep platform public egress, or add NAT gateway in VPC |
| User asked for "PG" but SDK APIs fail in existing app | Protocol mismatch | Keep TCP DB + VPC, or refactor to `app.rdb()` |

## Agent checklist (copy into plan before deploy)

- [ ] DB dependency signals scanned
- [ ] TCP vs CloudBase SDK/gateway path decided
- [ ] `VpcId` + `SubnetId` resolved (same region as DB)
- [ ] Private connection string prepared
- [ ] Security group / allowlist planned
- [ ] `manageCloudRun` deploy includes `serverConfig.VpcConf`, **or** `updateConfig` set VPC after create
- [ ] Post-deploy connectivity verified
