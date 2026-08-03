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

Use CLI **only** when MCP tools are unavailable AND CLI is explicitly enabled in the runtime environment.

- `tcb fn deploy <name>` -> Event Function
- `tcb fn deploy <name> --httpFn` -> HTTP Function
- `tcb fn deploy <name> --httpFn --ws` -> HTTP Function with WebSocket
- `tcb fn deploy --all` -> Deploy all functions
- `tcb fn config update <name>` -> Update function config (timeout, memorySize, envVariables)

**Important:** When the available capabilities include MCP tools but not CLI access, use MCP tools exclusively. Do not attempt CLI commands in such environments.

**Batch updates via MCP:** MCP does not have a `--all` batch parameter. To update multiple functions, call `manageFunctions(action="updateFunctionConfig")` individually for each function.

In non-interactive agent runs, do not default to CLI login or interactive setup flows.
