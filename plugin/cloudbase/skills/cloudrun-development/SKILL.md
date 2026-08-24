---
name: cloudrun-development
description: CloudBase Run backend development rules (Function mode/Container mode). Use this skill when deploying backend services that require long connections, multi-language support, custom environments, AI agent development, or migrating existing/GitHub apps that need VPC access to MySQL/PostgreSQL/Redis. Also use when diagnosing CloudRun container deploy failures (deploy_failed, readiness/probe failed, image won't start, docker.io pull loops). For stateless HTTP services, prefer HTTP cloud functions.
version: 2.31.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

**Cross-cutting protocols** (required before writing HTTP handlers or deploying images):
- Sensitive Runtime Data Protection: `../cloudbase-platform/references/protocols/sensitive-runtime-data-protection.md`
- Deployment Gate: `../cloudbase-platform/references/protocols/deployment-gate.md`

# CloudBase Run Development

## Activation Contract

### Use this first when

- The task is to initialize, run, deploy, inspect, or debug a CloudBase Run service.
- The request needs a long-lived HTTP service, SSE, WebSocket, custom system dependencies, or container-style deployment.
- The task is to create or run an Agent service on CloudBase Run.
- The task migrates an **existing / GitHub / third-party** backend that uses classic `DATABASE_URL` / TCP database clients.
- The service requires a **stable independent process** (long connections, custom runtime, VPC database access) — see the 「云托管 vs HTTP 云函数」 decision section below. A Dockerfile alone is **not** a strong trigger.

### Read before writing code if

- You still need to choose between Function mode and Container mode.
- The prompt mentions `queryCloudRun`, `manageCloudRun`, Dockerfile, service domains, or public/private access.
- The app depends on MySQL, PostgreSQL, Redis, or other VPC-private resources over TCP → also read `references/vpc-and-database.md`.
- You are choosing between CloudRun and HTTP cloud functions for a stateless HTTP service.
- Container deploy fails (`deploy_failed`, Pod not ready, readiness/probe failed, third-party `imageUrl` won't stay up) → also read `references/image-deploy-troubleshooting.md` and follow the **Container deploy failure SOP** below. Do not start by raising `InitialDelaySeconds`.

### Then also read

- Cloud functions instead of CloudRun -> `../cloud-functions/SKILL.md`
- Agent SDK and AG-UI specifics -> `../cloudbase-agent/SKILL.md`
- Web authentication for browser callers -> `../auth-web-cloudbase/SKILL.md`
- Existing app + TCP database networking -> `references/vpc-and-database.md`
- Container image deploy failure / probe / `deploy_failed` -> `references/image-deploy-troubleshooting.md`

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
- **Deploying to an environment that has not initialized CloudRun** — `CreateCloudRunServer` on an environment with no 大租户 record silently lands in the legacy 小租户 path, creating wrong small-tenant services/versions. Always ensure the environment is initialized first (`manageCloudRun(action="initEnv")`, tcbr) before the first deploy. `manageCloudRun(action="deploy")` now blocks new-service creation on uninitialized environments with guidance.
- **Using the legacy `tcb` CloudRun API** (`CreateCloudBaseRunResource` / `DescribeCloudBaseRunResource` / `DeleteCloudBaseRunResource`) — these are deprecated 小租户 open APIs and are blocked in `callCloudApi`. CloudRun always goes through `tcbr` (`CreateCloudRunEnv` / `CreateCloudRunServer`). Query a single environment's base info / whether CloudRun is enabled with `DescribeEnvBaseInfo` (`EnvId` required) — use `manageCloudRun(action="initEnv")` to open and `queryCloudRun(action="envStatus")` to poll status; query the environment list / resource info with `DescribeCloudRunEnvs` (`EnvId` optional filter).
- **Deploying `httpbin` / request-echo images or returning `req.headers` / `process.env`** — CloudBase may inject `x-cloudbase-context` (base64 temporary credentials). Echoing it leaks account cloud access. Follow `../cloudbase-platform/references/protocols/sensitive-runtime-data-protection.md`.
- **Seeing readiness probe failed / `deploy_failed` and immediately raising `InitialDelaySeconds`** — the probe window is already ~N+150s; crash loops and loopback binds are not slow-start. Follow the Container deploy failure SOP.
- **Deploying a third-party image without reading its run docs** — missing `Cmd`, bind-address env, or `VolumesConf` looks identical to a probe failure.
- **Calling `getDeployLog` for `imageUrl` deploys** — that is CODING build log; use `getProcessLog`.
- **Treating startup banners as proof the service is healthy** — pull `getProcessLog` twice and compare; a repeated boot sequence is a restart loop.

### Minimal checklist

- Choose Function mode or Container mode explicitly.
- **Confirm the environment has CloudRun initialized before the first deploy** — a brand-new environment must call `CreateCloudRunEnv` (tcbr) first; never `CreateCloudRunServer` on an uninitialized environment (it falls back to the legacy 小租户 path). `manageCloudRun(action="deploy")` validates this automatically and blocks new services on uninitialized environments. When blocked, first call `manageCloudRun(action="initEnv", envId=...)` (异步开通) and poll `queryCloudRun(action="envStatus")` until `Status=normal`, or reconsider an HTTP cloud function to bypass CloudRun entirely.
- Confirm whether the service should be public, VPC-only, or mini-program internal (**ingress**).
- If the app uses TCP databases/caches, resolve and set `VpcConf` (**egress / private network**) before deploy — see `references/vpc-and-database.md`.
- Keep the service stateless and externalize durable data.
- Use absolute paths for every local project path.
- Confirm handlers never echo `x-cloudbase-context`, full headers, or credential env vars; do not deploy httpbin-style reflectors.
- For third-party images, complete the five-item docs checklist (Cmd / port / bind env / volume / health) before deploy.

## Overview

Use CloudBase Run when the task needs a deployed backend service rather than a short-lived serverless function.

### 云托管 vs HTTP 云函数（按需求选，不按文件选）

> 核心原则：**HTTP 云函数优先**。只有需求真正需要云托管时才用云托管；有 `Dockerfile` 不等于必须上云托管。

**HTTP 云函数更合适（优先）：**

- 无状态 HTTP 服务，监听 `PORT`/`9000`，只做「请求进来 → 处理 → 响应」的响应式逻辑
- 短生命周期请求，无长连接需求（SSE/WebSocket 之外的普通 API、CRUD、转发）
- 不需要自定义系统依赖 / 多语言运行时，标准 runtime 足够
- 部署更快、费用更低（按请求计费，可缩容到 0）、**无需初始化云托管环境**
- 有 `Dockerfile` 但服务本质是无状态 HTTP → 优先 HTTP 云函数（HTTP Function / Custom Image HTTP Function），不必上云托管

**云托管才需要（只有以下之一才选云托管）：**

- 长连接：WebSocket、SSE 长连接、服务端推送
- 自定义系统依赖 / 任意语言运行时 / 需要稳定独立进程
- VPC 内数据库 / Redis 访问（`VpcConf` 私有网络连通）
- Agent 服务（Function mode CloudRun）
- 迁移已有 / GitHub / 第三方应用，或需要常驻进程

**决策示例：** 一个带 `Dockerfile` 的 Go/Python HTTP API，无长连接、无自定义运行时、不碰 VPC 数据库 → 选 HTTP 云函数而不是云托管；同一份代码若有 WebSocket 长连接 → 才选云托管。

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
| Dockerfile | Not required | Required — but a Dockerfile alone does **not** mean CloudRun; first check whether the service needs long connections / custom runtime. Stateless HTTP services with a Dockerfile may fit HTTP cloud functions better. |
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
   - For a brand-new environment, ensure CloudRun is initialized first — call `manageCloudRun(action="initEnv", envId=...)` (async, idempotent) before the first deploy; `manageCloudRun(action="deploy")` blocks new services on uninitialized environments and tells you to call `initEnv`
   - For Container mode, verify Dockerfile
   - **Scan for DB/cache dependency signals** (`DATABASE_URL`, docker-compose DB services, ORM configs)
   - If TCP DB access is required, complete the VPC checklist in `references/vpc-and-database.md` **before** deploy
   - Local run when available
   - Configure ingress access model **and** egress `VpcConf` when needed
   - For `imageUrl` / third-party images, complete the **five-item docs checklist** in the Container deploy failure SOP before deploy
   - Deploy and verify detail output + DB connectivity
   - If deploy fails, follow the Container deploy failure SOP (`references/image-deploy-troubleshooting.md`) — docs → `getProcessLog` → config; do not start with `InitialDelaySeconds`

## Tool routing

### Read operations

- `queryCloudRun(action="list")` -> list services
- `queryCloudRun(action="detail")` -> inspect one service and its latest deploy status when available
- `queryCloudRun(action="templates")` -> see available starters
- `queryCloudRun(action="getDeployLog")` -> **构建日志**（CODING / `DescribeCloudRunBuildLog`）。**仅云端源码构建有意义**；已有镜像部署（`imageUrl`）没有构建过程，不要用它诊断镜像部署失败。未登录 CODING 的账号会报错（如 `User not created or may not qcloud user`）
- `queryCloudRun(action="getProcessLog")` -> **运行日志**（`tcbr/DescribeCloudRunProcessLog`）。返回部署阶段步骤（如 `create_version_check_vpc` / `create_eks_virtual_service` / `check_eks_virtual_service`）+ 容器启动/运行日志（s6-overlay、应用进程、readiness probe 失败原因）。**镜像部署与源码构建均可用，不依赖 CODING**。参数：`detailServerName`/`serverName` + 可选 `runId`（不传则取最新部署的 `RunId`；`RunId` 也可从 `detail` / `getDeployRecords` 的 `latestDeploy.RunId` 取得）
- `queryCloudRun(action="getDeployRecords")` -> list deploy records (newest first; includes `BuildId` / `RunId` / `FlowRatio` / `Status`) — use to review release history and rollback context before a traffic operation
- `queryCloudRun(action="envStatus")` -> check whether the environment's CloudRun is opened and its provisioning status (`Status=creating` opening / `normal` opened) — use after `initEnv` to poll progress or before `deploy` to confirm readiness

### Log query SOP（构建日志 vs 运行日志）

部署失败排查时**必须区分**两类日志，不要只用 `getDeployLog`：

1. **云端源码构建**（传 `targetPath`、走 CODING 构建）  
   - 先 `queryCloudRun(action="getDeployLog", detailServerName=..., buildId=...)` 查**构建日志**（编译/打包失败）  
   - 再 `queryCloudRun(action="getProcessLog", detailServerName=..., runId=...)` 查**运行日志**（部署步骤 + 容器启动/健康检查）
2. **已有镜像部署**（传 `imageUrl`、`DeployType=image`）  
   - **跳过** `getDeployLog`（无构建过程；且依赖 CODING，未登录会直接失败）  
   - 直接 `queryCloudRun(action="detail")` 或 `getDeployRecords` 取 `latestDeploy.RunId`，再 `getProcessLog` 查运行日志

```json
{
  "action": "getProcessLog",
  "detailServerName": "my-svc",
  "runId": "<from latestDeploy.RunId>"
}
```

### Write operations

- `manageCloudRun(action="initEnv")` -> **open (initialize) CloudRun for the environment** — async, idempotent (`Status=normal` → already opened, no re-create). Use on a brand-new environment before the first deploy, or when `deploy` is blocked with an "尚未初始化云托管" message. Params: `envId` (defaults to the configured env), `packageType` (default `Trial`). Poll `queryCloudRun(action="envStatus")` until `Status=normal`.
- `manageCloudRun(action="init")` -> create local project
- `manageCloudRun(action="download")` -> pull remote code
- `manageCloudRun(action="run")` -> local run for Function mode
- `manageCloudRun(action="deploy")` -> trigger deploy + **lightweight wait for registration** (does not hang for full build). Returns `buildId` / `runId` / `taskId` + **DeployType-aware `next_step`**: **source** → `getDeployLog` then `getProcessLog`; **image** (`imageUrl`, BuildId often `0`) → **skip `getDeployLog`**, use `getDeployRecords`/`detail` for `RunId` then `getProcessLog`. Follow the returned `next_step` — do not always poll build logs. Existing services: RMW preserves remote VpcConf / EnvParams keys / OpenAccessTypes; **new services automatically validate that the environment's CloudRun is initialized** — if not, deploy is blocked with guidance to call `initEnv` first
- `manageCloudRun(action="updateConfig")` -> config-only update (no code upload; VPC / EnvParams / scaling / access types)
- `manageCloudRun(action="traffic")` -> **traffic management / canary release** (aligns with `tcb cloudrun traffic`): `trafficOp="set"` adjusts the stable/canary traffic ratio (`stablePercent` + `canaryPercent` must equal 100, e.g. 90/10); `trafficOp="promote"` promotes the canary version to full release (100%, closes gray release, irreversible); `trafficOp="rollback"` rolls back to the previous stable version (stops the releasing canary). Check `queryCloudRun(action="getDeployRecords")` first to understand current versions and traffic
- `manageCloudRun(action="delete")` -> delete service
- `manageCloudRun(action="createAgent")` -> create Agent service

## Deploying an existing image (imageUrl)

> 已有一个现成镜像（本地构建好、或第三方发布）时，不需要本地源码目录，直接 `manageCloudRun(action="deploy")` 传入 `imageUrl` 即可，走 `DeployType="image"`（容器型）部署，`targetPath` 可省略。若用户明确提到使用某个镜像或无需重新构建代码，**必须传 imageUrl**，不要仅因本地有源码目录就回退到源码构建。

**决策路径（直填 vs 本地中转）：**

1. **公网匿名可拉取**（如 `ccr.ccs.tencentyun.com/...`、公开 Docker Hub 镜像）→ **直填 imageUrl**：`manageCloudRun(action="deploy", serverName=..., imageUrl="ccr.ccs.tencentyun.com/ns/img:v1", serverConfig={...})`。CloudBase 会直接拉取该 registry 地址构建部署。**若 `docker.io` / Docker Hub 在节点上反复拉取失败**，不要空转重试：改用 Dockerfile `FROM <public-image>` + `targetPath` 源码构建（CODING 拉公网镜像，产物进 CCR 内网拉取）。见下方 SOP 第 4 步。
2. **私有 / 需登录的 registry**（`ghcr.io`、私有 ECR/Harbor 等）→ **本地中转到 CCR**：
   ```
   docker pull ghcr.io/example/app:latest
   docker tag ghcr.io/example/app:latest ccr.ccs.tencentyun.com/<ns>/app:latest
   docker login ccr.ccs.tencentyun.com
   docker push ccr.ccs.tencentyun.com/<ns>/app:latest
   ```
   然后把 `ccr.ccs.tencentyun.com/<ns>/app:latest` 作为 `imageUrl` 传入。中转只解决拉取，**不能替代**镜像文档里的启动命令 / 环境变量 / 数据目录。

**与 initEnv 联动：** 镜像部署同样要求环境已开通云托管。新环境首次部署前先 `manageCloudRun(action="initEnv", envId=...)`，并用 `queryCloudRun(action="envStatus")` 轮询到 `Status=normal`；未开通时 `deploy` 会被拦截并引导先 `initEnv`。

**示例：**

```json
{
  "action": "deploy",
  "serverName": "my-image-svc",
  "imageUrl": "ccr.ccs.tencentyun.com/ns/app:latest",
  "serverConfig": {
    "OpenAccessTypes": ["PUBLIC"],
    "Cpu": 0.5,
    "Mem": 1,
    "MinNum": 1,
    "MaxNum": 3,
    "Port": 8080,
    "Cmd": ["node", "server.js"],
    "EnvParams": "{\"PORT\":\"8080\",\"BIND_HOST\":\"0.0.0.0\"}"
  }
}
```

`Port` / `Cmd` / `EnvParams` 必须来自镜像官方文档的五要素清单，不要套用 `3000` 或省略启动命令。第三方镜像的完整对照见 `references/image-deploy-troubleshooting.md` 附录。

部署后：`manageCloudRun(deploy)` 对镜像返回的 `next_step` 默认指向 `getProcessLog`（或先 `getDeployRecords` 取 `RunId`），**不要**改去调 `getDeployLog`。也可用 `queryCloudRun(action="detail")` 查看 `imageInfo`（镜像地址与部署类型）。镜像部署失败排查走下方 SOP。

## Container deploy failure SOP

**顺序：先查镜像官方文档 → 再查运行日志 → 最后才动配置。禁止一看到 probe failed / `deploy_failed` 就调 `InitialDelaySeconds`。**

详情与案例：`references/image-deploy-troubleshooting.md`。

### 1. 部署前：从镜像官方文档确认五要素

不要靠 Docker Hub tag 或「常见默认值」猜。部署前必须确认：

1. **启动命令** EntryPoint / Cmd（进程如何前台常驻）→ `serverConfig.EntryPoint` / `Cmd`
2. **服务端口**（进程真正 bind 的端口；不要假设 80/3000，也不要假设镜像尊重 `PORT`）→ `serverConfig.Port`
3. **对外监听环境变量**（必须 `0.0.0.0` 而不是 `127.0.0.1`、功能开关默认关闭等）→ `EnvParams`
4. **数据目录挂载** → `serverConfig.VolumesConf`
5. **健康端点**（CloudRun readiness 探的是**服务端口**，不是任意 HTTP path）

缺任何一项再部署，失败看起来都会像「健康检查失败」。

### 2. 部署失败：用 `getProcessLog` 定性

镜像部署（`imageUrl`）**跳过** `getDeployLog`（那是云端源码构建的构建日志）。从 `detail` / `getDeployRecords` 取 `RunId`，再 `queryCloudRun(action="getProcessLog")`。

**启动日志存在 ≠ 服务正常运行。** banner、s6/tini 行、sidecar "listening" 都不能证明探针目标已起来。

**两次日志对比判活：** 隔 20–40 秒再拉一次 `getProcessLog`。

| 观察 | 定性 |
| --- | --- |
| 只有调度/创建步骤（`create_eks_*`），没有容器 stdout | **Pod 调度中 / 镜像拉取** |
| 同一段启动 banner / PID 1 行重复出现（时间戳在走、内容几乎一样） | **容器启动即退出 / 重启循环** |
| 进程还在，但 listen 在 `127.0.0.1` 或端口 ≠ `serverConfig.Port` | **端口 / 绑定地址问题** |
| 两次拉取是**同一条启动过程**在往后打日志，banner 不重复 | 才可能是启动慢 |

### 3. Readiness probe 真实机制（严禁先调延迟）

部署步骤完成后：先等 **N** 秒（`InitialDelaySeconds`），再大约 **每 5 秒** 探一次服务端口，连续约 **30 次全失败** 才判本次部署失败。窗口 ≈ **N+150s**。**不是**「N 秒后立即失败」。

- **禁止：** 看到 probe failed 就把 N 改成 120。崩溃循环和 loopback 绑定不会因为 N 变大而好。
- **允许调大 N 仅当：** 两次日志证明**同一个进程还在一次性初始化**（JVM 预热、迁移）且尚未 listen。

### 4. 公网镜像（`docker.io`）反复失败 → Dockerfile 源码构建

节点直连 Docker Hub 反复失败时，不要空转 `imageUrl`。写：

```dockerfile
FROM docker.io/example/app:latest
```

用 `targetPath` 走云端源码构建：CODING 构建机拉公网镜像，产物进 CCR，云托管节点内网拉取。这只解决**拉取拓扑**，不替代第 1 步的 Cmd / 环境变量 / 卷。

### 5. Supervisor 镜像（s6 / tini / supervisord）启动即退出

PID 1 往往是监督进程，不是 HTTP 应用。用两次日志找子进程重启风暴。若镜像 issue 记录了 PID 1 / `pgrep -f` 误匹配，按文档 workaround（绝对路径 Cmd、关闭 supervise），不要调探针延迟。示例见 reference 附录。

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
3. Use environment variables for secrets and per-environment configuration — **read them server-side only; never return them in HTTP responses**.
4. Verify configuration before and after deployment with `queryCloudRun(action="detail")`.
5. Keep startup work small to reduce cold-start impact.
6. For Agent scenarios, use the Agent SDK skill for protocol and adapter details instead of duplicating them here.
7. For smoke tests, return a fixed `{ "ok": true }` / health payload — never deploy httpbin or any service that reflects request headers.

## Troubleshooting hints

- **Access failure** -> check ingress access type, domain setup, and whether the instance scaled to zero.
- **Deployment blocked with "尚未初始化云托管 / not initialized"** -> the environment needs CloudRun enabled first: call `manageCloudRun(action="initEnv", envId=...)` (异步开通) and poll `queryCloudRun(action="envStatus")` until `Status=normal`; or open the console `环境 → 云托管 → 开通`. For stateless HTTP services, consider an HTTP cloud function instead of CloudRun entirely.
- **Deployment failure** -> follow the **Container deploy failure SOP** above (and `references/image-deploy-troubleshooting.md`): image deploys skip `getDeployLog` and use `getProcessLog` only; classify scheduling vs port vs exit-on-start with two log pulls. Do **not** raise `InitialDelaySeconds` until logs prove a single slow init. Also inspect Dockerfile (source) and CPU/memory ratio.
- **Local run failure** -> remember only Function mode is supported by local-run tools.
- **Performance issues** -> reduce dependencies, optimize initialization, and tune minimum instances.
- **DB / Redis connection failure after a successful deploy** -> almost always missing or wrong `VpcConf`, wrong private host, or security group. Follow `references/vpc-and-database.md` before rewriting application code.

## Reference index

All packaged reference files (required for skill lint reachability):

- [vpc-and-database.md](references/vpc-and-database.md)
- [image-deploy-troubleshooting.md](references/image-deploy-troubleshooting.md)
