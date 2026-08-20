---
name: cloud-functions
description: CloudBase function runtime guide for building, deploying, and debugging your own Event Functions or HTTP Functions. This skill should be used when users need application runtime code on CloudBase, not when they are merely calling CloudBase official platform APIs.
version: 2.31.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

**Cross-cutting protocols** (required before code changes or deployments):
- Change Safety Protocol: `../cloudbase-platform/references/protocols/change-safety-protocol.md`
- Deployment Gate: `../cloudbase-platform/references/protocols/deployment-gate.md`
- Sensitive Runtime Data Protection: `../cloudbase-platform/references/protocols/sensitive-runtime-data-protection.md`

# Cloud Functions Development

## Activation Contract

### Use this first when

- The task is to create, update, deploy, inspect, or debug a CloudBase Event Function or HTTP Function that serves application runtime logic.
- The request mentions function runtime, function logs, `scf_bootstrap`, function triggers, or function gateway exposure.

### Read before writing code if

- You still need to decide between Event Function and HTTP Function.
- The task mentions `manageFunctions`, `queryFunctions`, `manageGateway`, or legacy function-tool names.
- The task might require `callCloudApi` as a fallback for logs or gateway setup.
- An HTTP Function will call CloudBase resources through `@cloudbase/node-sdk` or `@cloudbase/manager-node` -> read `./references/http-function-credentials.md`. HTTP Functions must use explicit credentials; do not rely on the Event Function passwordless runtime path.

### Exception only (do not read by default)

- Migrating an **existing** app that already uses classic TCP DB clients (`DATABASE_URL` / Prisma / `mysql2` / `pg` / Redis) → read `./references/vpc-and-tcp-database.md` via `./references.md`. New business CRUD must prefer CloudBase native SDK (`app.database()` / `app.rdb()`) or MCP SQL tools instead of TCP.

### Then also read

- Detailed reference routing -> `./references.md`
- Auth setup or provider-related backend work -> `../auth-tool-cloudbase/SKILL.md`
- CloudBase Integration Center generated WeChat Pay or Official Account functions -> `../cloudbase-wechat-integration/SKILL.md` (official docs: `https://docs.cloudbase.net/integration/introduce/index.md`)
- AI in functions -> `../ai-model-nodejs/SKILL.md`
- Long-lived container services or Agent runtimes -> `../cloudrun-development/SKILL.md`
- Calling CloudBase official platform APIs from a client or script -> `../http-api-cloudbase/SKILL.md`

### Do NOT use for

- CloudRun container services.
- Web authentication UI implementation.
- Database-schema design or general data-model work.
- CloudBase official platform API clients or raw HTTP integrations that only consume platform endpoints.
- Creating Integration Center instances through guessed APIs. For WeChat Pay or Official Account generated functions, use `cloudbase-wechat-integration` for the business contract and this skill only for function operations.
- **Tasks that the CloudBase JS SDK can handle directly** — simple data reads/writes, leaderboards, file uploads, real-time queries. Reach for the matching SDK surface before writing a function: `db.collection(...).get/add/update` only for confirmed NoSQL collections, and `app.rdb().from(...)` for CloudBase PG tables. Functions add deployment complexity, CORS configuration, and HTTP gateway binding that the SDK eliminates entirely.

### Common mistakes / gotchas

- Picking the wrong function type and trying to compensate later.
- Confusing official CloudBase API client work with building your own HTTP function.
- Mixing Event Function code shape (`exports.main(event, context)`) with HTTP Function code shape (`req` / `res` on port `9000`).
- Treating HTTP Access as the implementation model for HTTP Functions. HTTP Access is a gateway configuration for Event Functions, not the HTTP Function runtime model.
- Assuming `db.collection("name").add(...)` will create a missing document-database collection automatically. Collection creation is a separate management step.
- Forgetting that runtime cannot be changed after creation.
- Using cloud functions as the first answer for Web login.
- Forgetting that HTTP Functions must ship `scf_bootstrap`, listen on port `9000`, and include dependencies.
- Assuming an HTTP Function can use CloudBase SDKs without explicit credentials. The default temporary credential path is not reliable for HTTP Functions and credential rotation can break a running service. Use a CloudBase server API Key or Tencent Cloud key pair for `@cloudbase/node-sdk`; use a Tencent Cloud key pair for `@cloudbase/manager-node`. See `references/http-function-credentials.md`.
- Forgetting to configure function security rules after creating an HTTP Function. Default rules reject anonymous callers with `EXCEED_AUTHORITY`. Note: anonymous login is disabled by default for new environments — if the function needs public access without authentication, configure the security rule to allow all callers rather than relying on anonymous login.
- Mismatching the `scf_bootstrap` Node.js binary path with the function runtime (e.g. using `/var/lang/node18/bin/node` but setting `runtime: "Nodejs16.13"`).
- For Custom Image HTTP Functions: forgetting that TCR, the CloudApp build, and SCF must be in the same region; using `:latest` instead of a unique tag; or confusing the request-driven port-`9000` image model with a long-lived CloudRun container that listens on the injected `PORT`.
- Assuming MCP covers the whole image pipeline. `manageFunctions` covers SCF image deploy (Stage B) via `runtime: "CustomImage"` + `imageConfig`, but the CloudApp custom build → TCR push (Stage A) is a raw Tencent Cloud API path — confirm action names and parameters from official docs before any `callCloudApi` fallback.
- Making code or configuration changes without first following the Change Safety Protocol (`cloudbase-platform/references/protocols/change-safety-protocol.md`).
- Exposing functions publicly or deploying without first completing the checks in `cloudbase-platform/references/protocols/deployment-gate.md`.
- **Returning `req.headers`, `process.env`, `event`, or `context` wholesale** — gateways may inject `x-cloudbase-context` (base64 temporary credentials). Never echo that header or dump credential env vars to clients. Follow `../cloudbase-platform/references/protocols/sensitive-runtime-data-protection.md`.
- **Using a bare layer name (e.g. `common`) across environments.** SCF LayerName is an account-scoped shared namespace: same name → shared version sequence. Create new layers with fixed format `{layerName}_{当前envId}` (e.g. `common_cloud1-d9ghadgak3edf6b36`). Pass the full name as `layerName` — do not invent automatic suffixes. Treat MCP layer `warnings` as soft advisories (operation still succeeds). Details: `./references/operations-and-config.md`.
- **Defaulting new CRUD to TCP DB clients** (`DATABASE_URL` / `mysql2` / `pg` / Redis) instead of native `app.rdb()` / `app.database()` or MCP SQL. TCP is exception-only for existing ORM migrations — see `references/vpc-and-tcp-database.md` only then.

### Minimal checklist

- Read [Cloud Functions Execution Checklist](checklist.md) before deployment or runtime changes.
- Decide whether the task is Event Function, HTTP Function, or actually CloudRun.
- Pick the detailed reference file in [references.md](references.md) before writing implementation code.

## Overview

Use this skill when developing, deploying, and operating CloudBase cloud functions. CloudBase has two different programming models:

- **Event Functions**: serverless handlers driven by SDK calls, timers, and other events.
- **HTTP Functions**: standard web services for HTTP endpoints, SSE, or WebSocket workloads. By default they run on a managed runtime (`scf_bootstrap` + zip); when they need custom system libraries or an arbitrary runtime they can instead run from a container image (`Runtime: CustomImage`, deployed from TCR — see `./references/http-functions-custom-image.md`).

## Writing mode at a glance

- If the request is for SDK calls, timers, or event-driven workflows, write an **Event Function** with `exports.main = async (event, context) => {}`.
- If the request is for REST APIs, browser-facing endpoints, SSE, or WebSocket, write an **HTTP Function** with `req` / `res` on port `9000`.
- For Node.js HTTP Functions, default to the native `http` module unless the user explicitly asks for Express, Koa, NestJS, or another framework.
- If the HTTP Function needs custom system libraries or an arbitrary runtime but should still be SCF request-driven and scale to zero, deploy it as a **Custom Image HTTP Function** (`Runtime: CustomImage`) from a TCR image. The container still listens on the fixed port `9000`. See `./references/http-functions-custom-image.md`. This is distinct from a CloudRun container, which listens on the injected `PORT` and runs long-lived.
- **有 Dockerfile 的 HTTP 无状态服务可优先考虑 HTTP 云函数，不必上云托管** — a Dockerfile alone does not mean CloudRun. If the service is stateless, request-driven HTTP without long connections / custom runtime / VPC database access, prefer an HTTP Function (or Custom Image HTTP Function) — faster to deploy, cheaper, and no CloudRun environment initialization needed. Route to CloudRun (`../cloudrun-development/SKILL.md`) only for WebSocket/SSE long connections, stable independent processes, custom system dependencies, or VPC DB access.
- If the user mentions HTTP access for an existing Event Function, keep the Event Function code shape and add gateway access separately.

## HTTP Function authoring contract

Use these rules whenever you are writing the function code itself:

- Do not write an HTTP Function as `exports.main(event, context)`. That is the Event Function contract.
- Treat the function as a standard web server process that must listen on port `9000`.
- With Node.js, prefer `http.createServer((req, res) => { ... })` by default so the runtime contract stays explicit.
- With the Node.js native `http` module, do not assume Express-style helpers exist. `req.body`, `req.query`, and `req.params` are not provided for you.
- For Node.js HTTP Functions, choose one module system up front and keep it consistent. Default to CommonJS for simple functions (`require(...)`, no `"type": "module"` in `package.json`) unless you explicitly want ES Modules.
- If you do choose ES Modules (`"type": "module"` + `import ...`), do not mix in CommonJS-only globals or APIs such as `require(...)`, `module.exports`, or bare `__dirname`. In ESM, derive file paths from `import.meta.url` with `fileURLToPath(...)` only when needed.
- With the native `http` module, parse `req.url` yourself with `new URL(...)`, collect the request body from the stream, and only then call `JSON.parse`. Empty bodies should be handled explicitly instead of assuming JSON is always present.
- Return responses explicitly with `res.writeHead(...)` and `res.end(...)`, including `Content-Type` such as `application/json; charset=utf-8` for JSON APIs.
- **Handle CORS headers**. Browsers block cross-origin requests without proper CORS headers. Default to allowing all origins for simple APIs:
  - Respond to `OPTIONS` preflight with `200` and CORS headers
  - Include `Access-Control-Allow-Origin: *` (or specific origin) on all responses
  - Include `Access-Control-Allow-Methods: GET, POST, OPTIONS` as needed
  - Include `Access-Control-Allow-Headers: Content-Type` for JSON requests
- Keep routing and method handling explicit. Unknown paths should return `404`, and known paths with unsupported methods should normally return `405`.
- Keep gateway setup and security-rule changes separate from the runtime code. They affect access, not the HTTP Function programming model.
- Do not add HTTP access service configuration when the task is only to create an HTTP Function itself. Gateway paths or custom domains are separate access-layer work; public invocation requirements should be handled through the function security rule workflow (note: anonymous login is disabled by default).
- If the HTTP Function calls CloudBase through `@cloudbase/node-sdk` or `@cloudbase/manager-node`, complete the explicit credential gate in `./references/http-function-credentials.md` before deployment. Never hardcode credentials in the function package.
- **Never echo sensitive runtime data.** Do not return `req.headers`, `process.env`, or `x-cloudbase-context` in responses. Debug endpoints must use an explicit non-sensitive allowlist. See `../cloudbase-platform/references/protocols/sensitive-runtime-data-protection.md`.

## Quick decision table

| Question | Choose |
| --- | --- |
| Triggered by SDK calls or timers? | Event Function |
| Needs browser-facing HTTP endpoint? | HTTP Function |
| Needs SSE or WebSocket service? | HTTP Function |
| Needs custom system libraries / arbitrary runtime, but still SCF request-driven + scale-to-zero? | HTTP Function with `Runtime: CustomImage` (deploy from a TCR image) |
| Has a Dockerfile but is a stateless HTTP service (no long connections / custom runtime / VPC DB)? | HTTP Function (or Custom Image HTTP Function) — **not** CloudRun |
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
   - Use `manageFunctions(action="updateFunctionConfig")` for config updates (timeout, memorySize, envVariables)
   - For a Custom Image HTTP Function, call `manageFunctions(action="createFunction")` with `func.runtime="CustomImage"` and `imageConfig` (`imageUri` with tag; `registryId` for enterprise TCR); iterate later with `manageFunctions(action="updateFunctionCode")` + `imageConfig`. No `functionRootPath` is needed because the code lives in the image. See `./references/http-functions-custom-image.md`.
   - Keep `functionRootPath` as the directory that directly contains function folders (e.g., `cloudfunctions/` or `functions/`), NOT the project root and NOT the function subdirectory itself
   - **Prefer MCP when available** — use `manageFunctions` and `queryFunctions` when those tools are in this session
   - **CLI fallback when MCP is missing** — if function tools are not loaded (first session / pre-restart), configure MCP for next time, then use `tcb fn deploy` via `../cloudbase-cli/SKILL.md` (see guideline `tooling-fallback.md`). Do not stall waiting for restart.
   - **Do NOT invent CLI when the runtime has no shell** — if only MCP exists and it works, stay on MCP; if neither works, report the gap
   - For batch updates (multiple functions), call `manageFunctions(action="updateFunctionConfig")` individually for each function — MCP does not have a `--all` batch parameter like CLI
   - If an HTTP Function uses `@cloudbase/node-sdk`, prefer a server API Key created with `manageAppAuth(action="createApiKey", keyType="api_key")` and inject it as `CLOUDBASE_APIKEY`; Tencent Cloud `SecretId` / `SecretKey` is also supported
   - If an HTTP Function uses `@cloudbase/manager-node`, inject Tencent Cloud `SecretId` / `SecretKey`; do not claim that a CloudBase API Key initializes the Manager SDK
   - Merge credential environment variables with the existing function configuration instead of replacing the whole environment-variable set

4. **Prefer doc-first fallbacks**
   - If a task falls back to `callCloudApi`, first check the official docs or knowledge-base entry for that action
   - Confirm the exact action name and parameter contract before calling it
   - Do not guess raw cloud API payloads from memory

5. **Read the right detailed reference**
   - Event Function details -> `./references/event-functions.md`
   - HTTP Function details -> `./references/http-functions.md`
   - HTTP Function CloudBase SDK credentials -> `./references/http-function-credentials.md`
   - HTTP Function from a container image (`Runtime: CustomImage`, TCR image pipeline) -> `./references/http-functions-custom-image.md`
   - Logs, gateway, env vars, layers (`{layerName}_{当前envId}`), and legacy mappings -> `./references/operations-and-config.md`

## Database write reminder

- If a function will write to CloudBase document database, create the target collection first through console or management tooling.
- `db.collection("feedback").add(...)` only inserts into an existing collection; it does not auto-create `feedback` when absent.
- If the product requirement says "create when missing", implement that as an explicit collection-management step before the first write instead of assuming the runtime write call will provision it.

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
  // Do not return event/context/process.env — they may contain platform secrets.
  const name = typeof event?.name === "string" ? event.name : "world";
  return {
    ok: true,
    message: `hello ${name} from event function`,
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
const { URL } = require("url");

// CORS headers — default to * for simple cross-origin APIs
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

function sendOptions(res) {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return sendOptions(res);
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/") {
    sendJson(res, 200, { ok: true, message: "hello from http function" });
  } else if (req.method === "POST" && url.pathname === "/") {
    const body = await readJsonBody(req);
    sendJson(res, 200, { received: body });
  } else {
    sendJson(res, 404, { error: "Not Found" });
  }
});

server.listen(9000);
```

For a more complete example with routing, method checks, and error handling, see `./references/http-functions.md`.

`cloudfunctions/hello-http/scf_bootstrap`

```bash
#!/bin/bash
/var/lang/node18/bin/node index.js
```

The `scf_bootstrap` binary path must match the runtime — see the full mapping table in `./references/http-functions.md`.

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

### Layers (SCF Layer)

Layers are **account-scoped**, not env-scoped. Align with MCP `manageFunctions` / `queryFunctions` layer guidance:

- **Naming (required for new layers):** `{layerName}_{当前envId}` — example `common_cloud1-d9ghadgak3edf6b36`. Do not reuse a bare name like `common` in another env.
- **Create:** `manageFunctions(action="createLayerVersion", layerName="…_{envId}", …)` after `queryFunctions(action="listLayers")` to check duplicates. MCP may return a soft `warnings` entry if the name lacks the current `envId`; it does **not** rewrite the name.
- **Read:** `queryFunctions(action="listLayers"|"listLayerVersions"|"getLayerVersionDetail"|"listFunctionLayers")` — list results are an account-level view and may include layers created in other envs.
- **Bind / unbind / replace:** `manageFunctions(action="attachLayer"|"detachLayer"|"updateFunctionLayers")`
- **Delete version:** `manageFunctions(action="deleteLayerVersion")` — deleting a version can affect every env that binds that version.
- Full contract and warning semantics → `./references/operations-and-config.md`

### Logs

**Query function logs** — use the `queryFunctions` tool:

- `queryFunctions(action="listFunctionLogs", functionName="xxx")` — list execution logs of a specific function
- `queryFunctions(action="getFunctionLogDetail", requestId="xxx")` — fetch the detail of one log entry

**`queryFunctions` vs `queryLogs`**:
- `queryFunctions` queries execution logs of a single cloud function and requires `functionName`
- `queryLogs` searches CLS (cross-service log aggregation) using CLS query syntax

**Examples**:
```javascript
// List recent logs for cloud function "my-function"
queryFunctions(action="listFunctionLogs", functionName="my-function", limit=10)

// Inspect the log detail for a specific request id
queryFunctions(action="getFunctionLogDetail", requestId="abc-123")

// Cross-service error search via CLS
queryLogs(action="searchLogs", queryString='(src:app OR src:system) AND log:"ERROR"', service="tcb")
```

`queryLogs` `queryString` follows CLS syntax (see https://cloud.tencent.com/document/api/876/128127). The examples below are starting points; adapt them to the concrete log content of your query:
- Function logs: `(src:app OR src:system) AND log:"START RequestId"`
- Aggregated function request status: `| select request_id, max(status_code) as status where ((request_id='xxxx' AND retry_num=0) AND retry_num=0) AND status_code!=202 group by request_id, retry_num`
- Document database (NoSQL): `module:database`
- Document database slow-query events: `module:database AND eventType:(MongoSlowQuery)` — `MongoSlowQuery` is the document-database slow-query event
- Relational database (MySQL): `module:rdb`
- Relational database (MySQL) events: `module:rdb AND eventType:(MysqlFreeze OR MysqlRecover OR MysqlSlowQuery)` — `MysqlFreeze` = freeze, `MysqlRecover` = recover, `MysqlSlowQuery` = slow query
- Workflow (approval flow): `module:workflow`
- Data model: `module:model`
- User permissions: `module:auth`
- LLM trace logs: `module:llm AND logType:llm-tracelog`
- Gateway access logs: `logType:accesslog`
- App publish / delete events: `module:app AND eventType:(AppProdPub OR AppProdDel)` — `AppProdPub` = app publish, `AppProdDel` = app delete

If these are unavailable, read `./references/operations-and-config.md` before any `callCloudApi` fallback

### Gateway exposure

- `queryGateway(action="getRoute")` / `listRoutes` / `listCustomDomains`
- `manageGateway(action="createRoute")` — for HTTP functions pass `upstreamResourceType="WEB_SCF"`; for Event functions pass `upstreamResourceType="SCF"`. Omit `domain` to attach the route on the HTTP gateway IsDefault domain (`DomainType=HTTPSERVICE`, typically `*.{region}.app.tcloudbase.com`)
- **IsDefault vs static hosting CDN:** environments often also expose a separate IsDefault `STATIC_STORE` domain (`*.tcloudbaseapp.com`). Omitting `domain` does **not** bind that static-hosting CDN entry, and it is **not** a `STATIC_STORE` upstream binding (that requires `upstreamResourceType="STATIC_STORE"`). Verify with `queryGateway(action="listRoutes")` and check `Domain` / `DomainType` / `Path` / `UpstreamResourceType`
- `manageGateway(action="updateRoute")` / `deleteRoute` / `enableRoute` / `disableRoute` / `bindCustomDomain` / `deleteCustomDomain`
- **Disable a route or the static hosting default domain:** prefer `manageGateway(action="disableRoute", domain=..., path=...)` (looks up the existing route, sets `Routes[].Enable=false` via `ModifyHTTPServiceRoute`). `updateRoute` may also pass `enable=false` / `route.enable=false`. To close `*.tcloudbaseapp.com`, list routes, take the `STATIC_STORE` IsDefault domain, then `disableRoute` with that `domain` and usually `path="/"` — not `manageHosting`, and not `ModifyGatewayRoute`
- When tool results include `accessUrl` / `accessUrls`, prefer them directly (gateway custom-domain URLs are ranked before default domains)
- Do **not** call deprecated GWAPI actions via `callCloudApi` (`CreateCloudBaseGWAPI`, etc.)

## Related skills

- `cloudrun-development` -> container services, long-lived runtimes, Agent hosting
- `http-api-cloudbase` -> raw CloudBase HTTP API invocation patterns
- `cloudbase-platform` -> general CloudBase platform decisions
- `ops-inspector` -> AIOps-style inspection and log search across services

## Reference index

All packaged reference files (required for skill lint reachability):

- [event-functions.md](references/event-functions.md)
- [http-function-credentials.md](references/http-function-credentials.md)
- [http-functions-custom-image.md](references/http-functions-custom-image.md)
- [http-functions.md](references/http-functions.md)
- [operations-and-config.md](references/operations-and-config.md)
- [vpc-and-tcp-database.md](references/vpc-and-tcp-database.md)
