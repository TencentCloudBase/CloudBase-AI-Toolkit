---
name: cloudrun-development
description: CloudBase Run backend development rules (Function mode/Container mode). Use this skill when deploying backend services that require long connections, multi-language support, custom environments, or AI agent development.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudrun-development/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# CloudBase Run Development

## Activation Contract

### Use this first when

- The task is to initialize, run, deploy, inspect, or debug a CloudBase Run service.
- The request needs a long-lived HTTP service, SSE, WebSocket, custom system dependencies, or container-style deployment.
- The task is to create or run an Agent service on CloudBase Run.

### Read before writing code if

- You still need to choose between Function mode and Container mode.
- The prompt mentions `queryCloudRun`, `manageCloudRun`, Dockerfile, service domains, or public/private access.

### Then also read

- Cloud functions instead of CloudRun -> `../cloud-functions/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-functions/SKILL.md`)
- Agent SDK and AG-UI specifics -> `../cloudbase-agent/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-agent/SKILL.md`)
- Web authentication for browser callers -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)

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

### Minimal checklist

- Choose Function mode or Container mode explicitly.
- Confirm whether the service should be public, VPC-only, or mini-program internal.
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
   - Local run when available
   - Configure access model
   - Deploy and verify detail output

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
- `manageCloudRun(action="deploy")` -> deploy local project
- `manageCloudRun(action="delete")` -> delete service
- `manageCloudRun(action="createAgent")` -> create Agent service

## Access guidance

- **Web/public scenarios** -> enable WEB access intentionally and pair it with the right auth flow.
- **Mini Program** -> prefer internal direct connection and avoid unnecessary public exposure.
- **Private/VPC scenarios** -> keep public access off unless the product requirement clearly needs it.

## Quick examples

### Initialize

```json
{ "action": "init", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc" }
```

### Local run (Function mode)

```json
{ "action": "run", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc", "runOptions": { "port": 3000 } }
```

### Deploy

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

**Valid `OpenAccessTypes` values**: `OA` (办公网访问), `PUBLIC` (公网访问), `MINIAPP` (小程序访问), `VPC` (VPC访问). Use `PUBLIC` for web applications that need public HTTPS access.

`MinNum: 1` is the recommended default when you want to reduce cold-start latency. If the user explicitly prefers lower cost and accepts more cold starts, explain the tradeoff and let them reduce `MinNum` to `0`.

## Best practices

1. Prefer PRIVATE/VPC or mini-program internal access when possible.
2. Use environment variables for secrets and per-environment configuration.
3. Verify configuration before and after deployment with `queryCloudRun(action="detail")`.
4. Keep startup work small to reduce cold-start impact.
5. For Agent scenarios, use the Agent SDK skill for protocol and adapter details instead of duplicating them here.

## Troubleshooting hints

- **Access failure** -> check access type, domain setup, and whether the instance scaled to zero.
- **Deployment failure** -> inspect Dockerfile, build logs, and CPU/memory ratio.
- **Local run failure** -> remember only Function mode is supported by local-run tools.
- **Performance issues** -> reduce dependencies, optimize initialization, and tune minimum instances.
