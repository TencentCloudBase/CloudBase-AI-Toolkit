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

Use `manageGateway(action="createAccess")`.

### Plan B: `callCloudApi`

Use raw cloud API only after checking the documentation for `CreateCloudBaseGWAPI` and confirming the gateway parameter contract.

```javascript
callCloudApi({
  service: "tcb",
  action: "CreateCloudBaseGWAPI",
  params: {
    EnableUnion: true,
    Path: "/api/users",
    ServiceId: "{envId}",
    Type: 6,
    Name: "functionName",
    AuthSwitch: 2,
    PathTransmission: 2,
    EnableRegion: true,
    Domain: "*"
  }
});
```

Key parameters:

- `Type: 6` -> function gateway type.
- `AuthSwitch: 2` -> no auth. Use an authenticated mode only when the requirement says so.
- `Domain: "*"` -> default domain.

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

### VPC access

```javascript
{
  vpc: {
    vpcId: "vpc-xxxxx",
    subnetId: "subnet-xxxxx"
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
| `createFunctionHTTPAccess` | `manageGateway(action="createAccess")` |

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
