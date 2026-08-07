---
name: cloudrun-development
description: CloudBase Run backend development rules (Function mode/Container mode). Use this skill when deploying backend services that require long connections, multi-language support, custom environments, AI agent development, or migrating existing/GitHub apps that need VPC access to MySQL/PostgreSQL/Redis.
version: 2.25.10
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

# CloudBase Run Development

## Activation Contract

### Use this first when

- The task is to initialize, run, deploy, inspect, or debug a CloudBase Run service.
- The request needs a long-lived HTTP service, SSE, WebSocket, custom system dependencies, or container-style deployment.
- The task is to create or run an Agent service on CloudBase Run.
- The task migrates an **existing / GitHub / third-party** backend that uses classic `DATABASE_URL` / TCP database clients.

### Read before writing code if

- You still need to choose between Function mode and Container mode.
- The prompt mentions `queryCloudRun`, `manageCloudRun`, Dockerfile, service domains, or public/private access.
- The app depends on MySQL, PostgreSQL, Redis, or other VPC-private resources over TCP → also read `references/vpc-and-database.md`.

### Then also read

- Cloud functions instead of CloudRun -> `../cloud-functions/SKILL.md`
- Agent SDK and AG-UI specifics -> `../cloudbase-agent/SKILL.md`
- Web authentication for browser callers -> `../auth-web-cloudbase/SKILL.md`
- Existing app + TCP database networking -> `references/vpc-and-database.md`

### Do NOT use for

- Simple Event Function or HTTP Function workflows that fit the function model better.
- Frontend-only projects with no backend service.
- Database-schema design tasks.

### Common mistakes / gotchas

- Choosing CloudRun when the request only needs a normal cloud function.
- Forgetting to listen on the platform-provided `PORT`.
- Treating CloudRun as stateful app hosting and storing important state on local disk.
- Assuming local run is available for Container mode.
- Opening public access by default when the scenario only needs private or mini-program internal access.
- **Deploying an existing app with `DATABASE_URL` / MySQL / PostgreSQL / Redis but omitting `serverConfig.VpcConf`** — deploy appears to succeed, then runtime DB connections fail.
- Confusing `OpenAccessTypes` (how users reach the service) with `VpcConf` (how the service reaches VPC databases).

### Minimal checklist

- Choose Function mode or Container mode explicitly.
- Confirm whether the service should be public, VPC-only, or mini-program internal (**ingress**).
- If the app uses TCP databases/caches, resolve and set `VpcConf` (**egress / private network**) before deploy — see `references/vpc-and-database.md`.
- Keep the service stateless and externalize durable data.
- Use absolute paths for every local project path.

## Overview

Use CloudBase Run when the task needs a deployed backend service rather than a short-lived serverless function.

### When CloudRun is a better fit

- Long connections: WebSocket, SSE, server push
- Long-running request handling or persistent service processes
- Custom runtime environments or system libraries
- Arbitrary languages or frameworks
- Stable external service endpoints with elastic scaling
- AI Agent deployment on Function mode CloudRun
- Migrating existing containerized or multi-language apps that need VPC access to databases

## Mode selection

| Dimension | Function mode | Container mode |
| --- | --- | --- |
| Best for | Fast start, Node.js service patterns, built-in framework, Agent flows | Existing containers, arbitrary runtimes, custom system dependencies |
| Port model | Framework-managed local mode, deployed service still follows platform rules | App must listen on injected `PORT` |
| Dockerfile | Not required | Required |
| Local run through tools | Supported | Not supported |
| Typical use | Streaming APIs, low-latency backend, Agent service | Custom language stack, migrated container app |

## How to use this skill (for a coding agent)

1. **Choose mode first**
   - Function mode -> quickest path for HTTP/SSE/WebSocket or Agent scenarios
   - Container mode -> use when Docker/custom runtime is a real requirement

2. **Follow mandatory runtime rules**
   - Listen on `PORT`
   - Keep the service stateless
   - Put durable data in DB/storage/cache
   - Keep dependencies and image size small
   - Respect resource ratio guidance: `Mem = 2 × CPU`

3. **Use the correct tools**
   - Read operations -> `queryCloudRun`
   - Write operations -> `manageCloudRun`
   - Delete requires explicit confirmation and `force: true`
   - Always use absolute `targetPath`

4. **Follow the deployment sequence**
   - Initialize or download code
   - For Container mode, verify Dockerfile
   - **Scan for DB/cache dependency signals** (`DATABASE_URL`, docker-compose DB services, ORM configs)
   - If TCP DB access is required, complete the VPC checklist in `references/vpc-and-database.md` **before** deploy
   - Local run when available
   - Configure ingress access model **and** egress `VpcConf` when needed
   - Deploy and verify detail output + DB connectivity

## Tool routing

### Read operations

- `queryCloudRun(action="list")` -> list services
- `queryCloudRun(action="detail")` -> inspect one service and its latest deploy status when available
- `queryCloudRun(action="templates")` -> see available starters
- `queryCloudRun(action="getDeployLog")` -> retrieve the latest deploy log or a specified `buildId`

### Write operations

- `manageCloudRun(action="init")` -> create local project
- `manageCloudRun(action="download")` -> pull remote code
- `manageCloudRun(action="run")` -> local run for Function mode
- `manageCloudRun(action="deploy")` -> deploy local project (existing services: RMW preserves remote VpcConf / EnvParams keys / OpenAccessTypes)
- `manageCloudRun(action="updateConfig")` -> config-only update (no code upload; VPC / EnvParams / scaling / access types)
- `manageCloudRun(action="delete")` -> delete service
- `manageCloudRun(action="createAgent")` -> create Agent service

## Access guidance

- **Web/public scenarios** -> enable PUBLIC ingress intentionally and pair it with the right auth flow.
- **Mini Program** -> prefer internal direct connection and avoid unnecessary public exposure.
- **Private ingress scenarios** -> keep public access off unless the product requirement clearly needs it.
- **Database / Redis in a VPC** -> this is **not** solved by `OpenAccessTypes`. You must set `serverConfig.VpcConf` and use the database private address. Read `references/vpc-and-database.md`.

## Quick examples

### Initialize

```json
{ "action": "init", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc" }
```

### Local run (Function mode)

```json
{ "action": "run", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc", "runOptions": { "port": 3000 } }
```

### Deploy (no VPC-private dependencies)

```json
{
  "action": "deploy",
  "serverName": "my-svc",
  "targetPath": "/abs/ws/my-svc",
  "serverConfig": {
    "OpenAccessTypes": ["PUBLIC"],
    "Cpu": 0.5,
    "Mem": 1,
    "MinNum": 1,
    "MaxNum": 5
  }
}
```

### Deploy (existing app that connects to MySQL / PostgreSQL / Redis over TCP)

```json
{
  "action": "deploy",
  "serverName": "my-existing-app",
  "targetPath": "/abs/ws/my-existing-app",
  "serverConfig": {
    "OpenAccessTypes": ["PUBLIC"],
    "Cpu": 0.5,
    "Mem": 1,
    "MinNum": 1,
    "MaxNum": 5,
    "EnvParams": "{\"DATABASE_URL\":\"postgres://user:pass@10.x.x.x:5432/app\"}",
    "VpcConf": {
      "VpcId": "vpc-xxxxxxxx",
      "SubnetId": "subnet-xxxxxxxx"
    }
  }
}
```

**Valid `OpenAccessTypes` values**: `OA` (办公网访问), `PUBLIC` (公网访问), `MINIAPP` (小程序访问), `VPC` (VPC访问). Use `PUBLIC` for web applications that need public HTTPS access.

`MinNum: 1` is the recommended default when you want to reduce cold-start latency. If the user explicitly prefers lower cost and accepts more cold starts, explain the tradeoff and let them reduce `MinNum` to `0`.

## Best practices

1. Prefer PRIVATE/VPC or mini-program internal **ingress** when possible.
2. For TCP database access, always pair private DB URLs with `VpcConf` in the same VPC/region as the database.
3. Use environment variables for secrets and per-environment configuration.
4. Verify configuration before and after deployment with `queryCloudRun(action="detail")`.
5. Keep startup work small to reduce cold-start impact.
6. For Agent scenarios, use the Agent SDK skill for protocol and adapter details instead of duplicating them here.

## Troubleshooting hints

- **Access failure** -> check ingress access type, domain setup, and whether the instance scaled to zero.
- **Deployment failure** -> inspect Dockerfile, build logs, and CPU/memory ratio.
- **Local run failure** -> remember only Function mode is supported by local-run tools.
- **Performance issues** -> reduce dependencies, optimize initialization, and tune minimum instances.
- **DB / Redis connection failure after a successful deploy** -> almost always missing or wrong `VpcConf`, wrong private host, or security group. Follow `references/vpc-and-database.md` before rewriting application code.

## Reference index

All packaged reference files (required for skill lint reachability):

- [vpc-and-database.md](references/vpc-and-database.md)
