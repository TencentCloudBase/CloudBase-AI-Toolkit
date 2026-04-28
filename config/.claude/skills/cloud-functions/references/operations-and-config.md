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

### Important: Automatic merge behavior

The `manageFunctions(action="updateFunctionConfig")` tool automatically merges environment variables internally. You only need to provide the new or updated variables - existing variables will be preserved.

### Correct usage pattern

```javascript
// Only pass the variables you want to add or update
// Existing variables will be preserved automatically
await manageFunctions({
  action: "updateFunctionConfig",
  functionName: "my-function",
  envVariables: {
    NEW_VAR: "new-value",
    EXISTING_VAR: "updated-value"  // This will update the existing variable
  }
});
```

### Complete example: Read, modify, and update

If you need to read existing variables first, access them through `Environment.Variables` (array format) and then update:

```javascript
// Step 1: Get current configuration
const result = await queryFunctions({
  action: "getFunctionDetail",
  functionName: "my-function"
});

// Step 2: Current env variables are in Environment.Variables as an array
// [{ Key: "EXISTING_VAR", Value: "old-value" }, ...]
const currentVars = result.functionDetail.Environment?.Variables || [];
console.log("Current variables:", currentVars);

// Step 3: Update with new/modified variables (tool handles merging)
await manageFunctions({
  action: "updateFunctionConfig",
  functionName: "my-function",
  envVariables: {
    NEW_VAR: "new-value",          // Will be added
    EXISTING_VAR: "updated-value"  // Will be updated
    // Other existing variables are preserved automatically
  }
});
```

### Key points

- **Field location**: Environment variables are in `functionDetail.Environment.Variables` (array of `{Key, Value}` objects), not `functionDetail.EnvVariables`
- **Merge behavior**: The tool automatically merges new variables with existing ones - you don't need to manually merge
- **Value type**: All values must be strings; numbers and booleans should be converted to strings
- **Preservation**: Variables not included in the update are preserved automatically

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

Use CLI only when MCP tools are unavailable.

- `tcb fn deploy <name>` -> Event Function
- `tcb fn deploy <name> --httpFn` -> HTTP Function
- `tcb fn deploy <name> --httpFn --ws` -> HTTP Function with WebSocket
- `tcb fn deploy --all` -> Deploy all functions

In non-interactive agent runs, do not default to CLI login or interactive setup flows.
