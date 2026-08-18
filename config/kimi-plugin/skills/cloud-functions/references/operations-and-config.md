# Cloud Functions Operations and Config Reference

Use this reference for logs, gateway exposure, environment-variable updates, triggers, and legacy tool-name translation.

## Logs

### Preferred path

- `queryFunctions(action="listFunctionLogs")` for the log list.
- `queryFunctions(action="getFunctionLogDetail")` for a specific request log.

### Plan B: `callCloudApi`

Only use raw cloud API calls after reading the official docs or knowledge-base entry for the action and parameter contract. Do not guess the action name or payload shape from memory.

#### Log list

```javascript
callCloudApi({
  service: "tcb",
  action: "GetFunctionLogs",
  params: {
    EnvId: "{envId}",
    FunctionName: "functionName",
    Offset: 0,
    Limit: 10,
    StartTime: "2024-01-01 00:00:00",
    EndTime: "2024-01-01 23:59:59"
  }
});
```

#### Log detail

```javascript
callCloudApi({
  service: "tcb",
  action: "GetFunctionLogDetail",
  params: {
    StartTime: "2024-01-01 00:00:00",
    EndTime: "2024-01-01 23:59:59",
    LogRequestId: "request-id-from-log-list"
  }
});
```

### Log query limits

- `Offset + Limit` cannot exceed `10000`.
- `StartTime` to `EndTime` cannot span more than one day.
- For large ranges, page through day-sized windows.

## Event Function HTTP access

### Preferred path

Use Domain/Route via `manageGateway(action="createRoute")`. Omit `domain` to attach the route on the HTTP gateway IsDefault domain (`DomainType=HTTPSERVICE`, typically `*.{region}.app.tcloudbase.com`).

```javascript
manageGateway({
  action: "createRoute",
  targetName: "functionName",
  upstreamResourceType: "SCF", // Event function -> SCF; HTTP function -> WEB_SCF
  path: "/api/users",
  auth: false
});
```

**IsDefault vs static hosting CDN:** many environments also list an IsDefault `STATIC_STORE` domain (`*.tcloudbaseapp.com`). Omitting `domain` does **not** attach to that static-hosting CDN hostname, and it is **not** a `STATIC_STORE` upstream binding. Confirm with `queryGateway(action="listRoutes")` — inspect `Domain`, `DomainType`, `Path`, and `UpstreamResourceType` on the created route.

**Disable / enable routes:** use `manageGateway(action="disableRoute"|"enableRoute")` with `path` (and prefer an explicit `domain`). This sets `Routes[].Enable` through `ModifyHTTPServiceRoute` (there is no `ModifyGatewayRoute` action). To close the static hosting default domain, list routes, take the `STATIC_STORE` IsDefault host, then:

```javascript
manageGateway({
  action: "disableRoute",
  domain: "<envId>-<appId>.tcloudbaseapp.com",
  path: "/"
});
```

Do not expect a `manageHosting` disable-default-domain action. `updateRoute` may also pass `enable=false` / `route.enable=false` when you already have the full route fields.

Upstream type:

- HTTP cloud function -> `upstreamResourceType="WEB_SCF"`
- Event cloud function -> `upstreamResourceType="SCF"`
- CloudRun -> `upstreamResourceType="CBR"`
- Static hosting -> `upstreamResourceType="STATIC_STORE"` (serviceName often `staticstore`)

Do **not** use deprecated GWAPI / `CreateCloudBaseGWAPI` via `callCloudApi` (blocked in evaluate mode and removed from MCP).
Do **not** pass `manageFunctions` `type="HTTP"|"Event"` into `manageGateway`; gateway uses `upstreamResourceType` only.
When a deploy/create tool returns `accessUrl` or `accessUrls`, prefer those values directly; they already rank gateway custom domains before default domains when routes exist.
## Environment variable updates

Do not overwrite function environment variables blindly.

### Safe pattern

1. Read current config with `queryFunctions(action="getFunctionDetail")`.
2. Merge existing variables with the new variables.
3. Update with `manageFunctions(action="updateFunctionConfig")`.

```javascript
const current = await queryFunctions({
  action: "getFunctionDetail",
  functionName: "functionName"
});

const mergedEnvVariables = {
  ...current.EnvVariables,
  ...newEnvVariables
};

await manageFunctions({
  action: "updateFunctionConfig",
  functionName: "functionName",
  envVariables: mergedEnvVariables
});
```

## Trigger and VPC notes

### Timer triggers

Configure timer triggers through `func.triggers`.

- Type: `timer`
- Cron format: 7 fields -> second minute hour day month week year

Examples:

- `0 0 2 1 * * *` -> 2:00 AM on the first day of every month
- `0 30 9 * * * *` -> 9:30 AM every day

### VPC field shape (example only)

When a function already needs VPC egress (exception path: existing TCP DB clients), `vpc` IDs must be real (never placeholders). This is a field-shape example — not a recommendation to introduce TCP DB access. Prefer native SDK / MCP SQL for new CRUD. Full exception policy: `./vpc-and-tcp-database.md`.

```javascript
{
  vpc: {
    vpcId: "<real-vpc-id>",
    subnetId: "<real-subnet-id>"
  }
}
```

## Layers (SCF Layer)

SCF LayerName is an **account-scoped shared namespace** (not per CloudBase env). Different envs that create the same layer name share one version sequence; deleting a version can break every function in every env that binds that version.

This section mirrors the MCP `queryFunctions` / `manageFunctions` **层（Layer）说明** so skill guidance and tool descriptions stay aligned.

### Naming contract (new layers)

- Fixed format: `{layerName}_{当前envId}`
- Example: `common_cloud1-d9ghadgak3edf6b36`
- Pass the full string as `layerName`. MCP / Manager SDK pass the name through as-is — they do **not** auto-append `envId`.
- Do not reuse a bare name (e.g. `common`) in another env.
- Before create: `queryFunctions(action="listLayers")` (optionally with `searchKey`) to check for collisions.

### Preferred tools

| Goal | Tool |
| --- | --- |
| List layers / versions / detail (account-level view) | `queryFunctions(action="listLayers"\|"listLayerVersions"\|"getLayerVersionDetail")` |
| List layers bound to a function | `queryFunctions(action="listFunctionLayers")` |
| Create a layer version | `manageFunctions(action="createLayerVersion")` |
| Delete a layer version | `manageFunctions(action="deleteLayerVersion")` |
| Bind / unbind / replace function layers | `manageFunctions(action="attachLayer"\|"detachLayer"\|"updateFunctionLayers")` |

```javascript
// Create — name already includes current envId
manageFunctions({
  action: "createLayerVersion",
  layerName: "common_cloud1-d9ghadgak3edf6b36",
  runtimes: ["Nodejs18.15"],
  contentPath: "/abs/path/to/layer-content"
});
```

### Soft `warnings` (non-blocking)

Layer actions may return envelope `warnings: string[]` while `success` remains `true`. Surface them to the user; do not treat them as hard failures and do not invent a different tool path because of them.

Typical advisories (wording may vary slightly):

- create without `envId` in the name → suggest `{layerName}_{envId}` because the name may share a version sequence with other envs
- list layers / versions / detail → account-level view may include layers from other envs
- delete version → account-shared; affects all envs bound to that version
- attach / detach / updateFunctionLayers → account-shared bind/unbind impact

### Do not

- Auto-rewrite or suffix existing bare layer names in tooling (breaks callers that still use the bare name).
- Tell the user to switch to `tcb` CLI solely to avoid layer conflicts — stay on MCP when tools are available.
- Assume `listLayers` is filtered to the current env only.

## Legacy tool-name translation

Prefer the converged entrances below, but translate historical names when they appear in old prompts or old docs.

| Historical name | Current action |
| --- | --- |
| `getFunctionList` | `queryFunctions(action="listFunctions")` |
| `createFunction` | `manageFunctions(action="createFunction")` |
| `updateFunctionCode` | `manageFunctions(action="updateFunctionCode")` |
| `updateFunctionConfig` | `manageFunctions(action="updateFunctionConfig")` |
| `getFunctionLogs` | `queryFunctions(action="listFunctionLogs")` |
| `getFunctionLogDetail` | `queryFunctions(action="getFunctionLogDetail")` |
| `manageFunctionTriggers` | `manageFunctions(action="createFunctionTrigger"|"deleteFunctionTrigger")` |
| `readFunctionLayers` | `queryFunctions(action="listLayers"|"listLayerVersions"|"getLayerVersionDetail"|"listFunctionLayers")` |
| `writeFunctionLayers` | `manageFunctions(action="createLayerVersion"|"deleteLayerVersion"|"attachLayer"|"detachLayer"|"updateFunctionLayers")` |
| `createFunctionHTTPAccess` | `manageGateway(action="createRoute")` with `upstreamResourceType="WEB_SCF"` |

## CLI fallback

Use CLI when MCP function tools are **not available in this session** (first conversation, MCP just installed and needs restart, or mcporter/IDE MCP unreachable), or when the user/CI explicitly asks for CLI.

Before CLI deploy: ensure MCP is configured for the next session when missing (`mcp-setup.md`), then follow `cloudbase-cli` (`core.md` + `functions.md`: `tcb login` → confirm envId → `tcb env use` → `tcb fn deploy`). Do **not** use `tcb deploy`. Decision tree: guideline `tooling-fallback.md` (includes No npm/npx).

- `tcb fn deploy <name>` -> Event Function
- `tcb fn deploy <name> --httpFn` -> HTTP Function
- `tcb fn deploy <name> --httpFn --ws` -> HTTP Function with WebSocket
- `tcb fn deploy --all` -> Deploy all functions
- `tcb fn config update <name>` -> Update function config (timeout, memorySize, envVariables)

**Important:** When MCP tools are available in this session, prefer them over CLI unless the user asked for CLI. When MCP is missing but a shell can run `tcb`, use CLI — do not block on restart.

**Batch updates via MCP:** MCP does not have a `--all` batch parameter. To update multiple functions, call `manageFunctions(action="updateFunctionConfig")` individually for each function. CLI may use `--all` when on the CLI path.

In non-interactive CI, prefer `tcb login --apiKeyId / --apiKey` (env-injected) over interactive device-code flows.
