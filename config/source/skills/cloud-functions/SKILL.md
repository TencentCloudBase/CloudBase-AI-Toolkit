---
name: cloud-functions
description: CloudBase function runtime guide for building, deploying, and debugging your own Event Functions or HTTP Functions. This skill should be used when users need application runtime code on CloudBase, not when they are merely calling CloudBase official platform APIs.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-functions/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# Cloud Functions Development

## Activation Contract

### Use this first when

- The task is to create, update, deploy, inspect, or debug a CloudBase Event Function or HTTP Function that serves application runtime logic.
- The request mentions function runtime, function logs, `scf_bootstrap`, function triggers, or function gateway exposure.

### Read before writing code if

- You still need to decide between Event Function and HTTP Function.
- The task mentions `manageFunctions`, `queryFunctions`, `manageGateway`, or legacy function-tool names.
- The task might require `callCloudApi` as a fallback for logs or gateway setup.

### Then also read

- Detailed reference routing -> `./references.md`
- Auth setup or provider-related backend work -> `../auth-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-tool/SKILL.md`)
- AI in functions -> `../ai-model-nodejs/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/ai-model-nodejs/SKILL.md`)
- Long-lived container services or Agent runtimes -> `../cloudrun-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudrun-development/SKILL.md`)
- Calling CloudBase official platform APIs from a client or script -> `../http-api/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/http-api/SKILL.md`)

### Do NOT use for

- CloudRun container services.
- Web authentication UI implementation.
- Database-schema design or general data-model work.
- CloudBase official platform API clients or raw HTTP integrations that only consume platform endpoints.

### Common mistakes / gotchas

- Picking the wrong function type and trying to compensate later.
- Confusing official CloudBase API client work with building your own HTTP function.
- Mixing Event Function code shape (`exports.main(event, context)`) with HTTP Function code shape (`req` / `res` on port `9000`).
- Treating HTTP Access as the implementation model for HTTP Functions. HTTP Access is a gateway configuration for Event Functions, not the HTTP Function runtime model.
- Forgetting that runtime cannot be changed after creation.
- Using cloud functions as the first answer for Web login.
- Forgetting that HTTP Functions must ship `scf_bootstrap`, listen on port `9000`, and include dependencies.
- Assuming HTTP Functions imply Express. Node.js HTTP Functions can be implemented with the native `http` module; if no framework is requested, prefer a small raw `http.createServer(...)` implementation and parse the request body explicitly.

### Minimal checklist

- Read [Cloud Functions Execution Checklist](checklist.md) before deployment or runtime changes.
- Decide whether the task is Event Function, HTTP Function, or actually CloudRun.
- Pick the detailed reference file in [references.md](references.md) before writing implementation code.

## Overview

Use this skill when developing, deploying, and operating CloudBase cloud functions. CloudBase has two different programming models:

- **Event Functions**: serverless handlers driven by SDK calls, timers, and other events.
- **HTTP Functions**: standard web services for HTTP endpoints, SSE, or WebSocket workloads.

## Writing mode at a glance

- If the request is for SDK calls, timers, or event-driven workflows, write an **Event Function** with `exports.main = async (event, context) => {}`.
- If the request is for REST APIs, browser-facing endpoints, SSE, or WebSocket, write an **HTTP Function** with `req` / `res` on port `9000`.
- For Node.js HTTP Functions, `req` / `res` does not require Express. When the user asks for native Node.js or does not request a framework, use the built-in `http` module and handle JSON parsing, routes, and status codes yourself.
- For Node.js HTTP Functions, write a complete server entry file: create the server in `index.js`, route on both method and pathname, return JSON with `Content-Type: application/json`, handle malformed JSON with `400`, use `404` for unknown paths and `405` for unsupported methods on known paths, and keep `server.listen(9000)` in the entry file.
- If the user mentions HTTP access for an existing Event Function, keep the Event Function code shape and add gateway access separately.

## Quick decision table

| Question | Choose |
| --- | --- |
| Triggered by SDK calls or timers? | Event Function |
| Needs browser-facing HTTP endpoint? | HTTP Function |
| Needs SSE or WebSocket service? | HTTP Function |
| Needs long-lived container runtime or custom system environment? | CloudRun |
| Only needs HTTP access for an existing Event Function? | Event Function + gateway access |

## How to use this skill (for a coding agent)

1. **Choose the correct runtime model first**
   - Event Function -> `exports.main(event, context)`
   - HTTP Function -> web server on port `9000`
   - If the requirement is really a container service, reroute to CloudRun early

2. **Use the converged MCP entrances**
   - Reads -> `queryFunctions`, `queryGateway`
   - Writes -> `manageFunctions`, `manageGateway`
   - Translate legacy names before acting rather than copying them literally

3. **Write code and deploy, do not stop at local files**
   - Use `manageFunctions(action="createFunction")` for creation
   - Use `manageFunctions(action="updateFunctionCode")` for code updates
   - Keep `functionRootPath` as the parent directory of the function folder
   - Use CLI only as a fallback when MCP tools are unavailable

4. **Prefer doc-first fallbacks**
   - If a task falls back to `callCloudApi`, first check the official docs or knowledge-base entry for that action
   - Confirm the exact action name and parameter contract before calling it
   - Do not guess raw cloud API payloads from memory

5. **Read the right detailed reference**
   - Event Function details -> `./references/event-functions.md`
   - HTTP Function details -> `./references/http-functions.md`
   - Logs, gateway, env vars, and legacy mappings -> `./references/operations-and-config.md`

## Function types comparison

| Feature | Event Function | HTTP Function |
| --- | --- | --- |
| Primary trigger | SDK call, timer, event | HTTP request |
| Entry shape | `exports.main(event, context)` | web server with `req` / `res` |
| Port | No port | Must listen on `9000` |
| `scf_bootstrap` | Not required | Required |
| Dependencies | Auto-installed from `package.json` | Must be packaged with function code |
| Best for | serverless handlers, scheduled jobs | APIs, SSE, WebSocket, browser-facing services |

## Minimal code skeletons

### Event Function hello world

`cloudfunctions/hello-event/index.js`

```js
exports.main = async (event, context) => {
  return {
    ok: true,
    message: "hello from event function",
    event,
  };
};
```

`cloudfunctions/hello-event/package.json`

```json
{
  "name": "hello-event",
  "version": "1.0.0"
}
```

### HTTP Function hello world

`cloudfunctions/hello-http/index.js`

```js
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, message: "hello from http function" }));
});

server.listen(9000);
```

`cloudfunctions/hello-http/scf_bootstrap`

```bash
#!/bin/bash
/var/lang/node18/bin/node index.js
```

`cloudfunctions/hello-http/package.json`

```json
{
  "name": "hello-http",
  "version": "1.0.0"
}
```

## Preferred tool map

### Function management

- `queryFunctions(action="listFunctions"|"getFunctionDetail")`
- `manageFunctions(action="createFunction")`
- `manageFunctions(action="updateFunctionCode")`
- `manageFunctions(action="updateFunctionConfig")`

### Logs

- `queryFunctions(action="listFunctionLogs")`
- `queryFunctions(action="getFunctionLogDetail")`
- If these are unavailable, read `./references/operations-and-config.md` before any `callCloudApi` fallback

### Gateway exposure

- `queryGateway(action="getAccess")`
- `manageGateway(action="createAccess")`
- If gateway operations need raw cloud API fallback, read `./references/operations-and-config.md` first

## Related skills

- `cloudrun-development` -> container services, long-lived runtimes, Agent hosting
- `http-api` -> raw CloudBase HTTP API invocation patterns
- `cloudbase-platform` -> general CloudBase platform decisions
