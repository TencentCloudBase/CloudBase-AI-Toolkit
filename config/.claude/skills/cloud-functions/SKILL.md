---
name: cloud-functions
description: Complete guide for CloudBase cloud functions development - runtime selection, deployment, logging, invocation, and HTTP access configuration.
alwaysApply: false
---

# Cloud Functions Development

Use this skill when developing, deploying, and managing CloudBase cloud functions (Node.js serverless functions).

## When to use this skill

Use this skill for **cloud function operations** when you need to:

- Create and deploy Node.js cloud functions
- Understand runtime limitations and selection
- Query function logs and monitor execution
- Invoke cloud functions from applications
- Configure HTTP access for cloud functions

**Do NOT use for:**
- CloudRun backend services (use `cloudrun-development` skill)
- Multi-language backend services (use `cloudrun-development` skill)
- Database operations (use database skills)

## How to use this skill (for a coding agent)

1. **Understand runtime limitations**
   - Runtime **CANNOT be changed** after function creation
   - Must select correct runtime during initial creation
   - If runtime needs to change, must delete and recreate function

2. **Choose the right runtime**
   - Check supported runtimes list below
   - Default: `Nodejs18.15` (recommended)
   - Consider Node.js version compatibility with dependencies

3. **Deploy functions correctly**
   - Use `createFunction` for new functions
   - Use `updateFunctionCode` for code updates (runtime cannot be changed)
   - Provide correct `functionRootPath` (parent directory of function folder)

4. **Query logs properly**
   - Use `getFunctionLogs` for log list (basic info)
   - Use `getFunctionLogDetail` with RequestId for detailed logs
   - Note time range limitations (max 1 day interval)

---

## Core Knowledge

### Runtime Environment

**⚠️ CRITICAL: Runtime cannot be modified after function creation**

Once a cloud function is created with a specific runtime, the runtime **cannot be changed**. If you need a different runtime:

1. Delete the existing function
2. Create a new function with the desired runtime

**Supported Node.js Runtimes:**

- `Nodejs18.15` (Default, Recommended)
- `Nodejs16.13`
- `Nodejs14.18`
- `Nodejs12.16`
- `Nodejs10.15`
- `Nodejs8.9`

**Runtime Selection Guidelines:**

- **Use `Nodejs18.15`** for new projects (default, most modern)
- Choose older versions only if dependencies require specific Node.js versions
- Consider security updates and support lifecycle
- Test thoroughly with selected runtime before deployment

### Function Structure

Cloud functions require:

1. **Function Directory**: Contains function code
   - Must have `index.js` (or specified entry file)
   - Must export handler: `exports.main = async (event, context) => {}`
   - Include `package.json` with dependencies

2. **Function Root Path**: Parent directory containing function directories
   - Example: If function is at `/project/cloudfunctions/myFunction/`
   - `functionRootPath` should be `/project/cloudfunctions/`
   - **Important**: Do NOT include function name in root path

3. **Entry Point**: Default is `index.js` with `exports.main`
   - Can be customized via `handler` parameter

### Function Deployment

**Creating New Functions:**

Use `createFunction` tool (see MCP tool documentation for full parameter list):
- **Important**: Always specify `func.runtime` explicitly (defaults to `Nodejs18.15`)
- Provide `functionRootPath` as parent directory of function folders (absolute path)
- Use `force=true` to overwrite existing function

**Updating Function Code:**

Use `updateFunctionCode` tool:
- **⚠️ Note**: Only updates code, **cannot change runtime**
- If runtime needs to change, delete and recreate function

**Deployment Best Practices:**

1. **Always specify runtime** explicitly when creating functions
2. **Use absolute paths** for `functionRootPath`
3. **Don't upload node_modules** - dependencies installed automatically
4. **Test locally** before deployment when possible
5. **Use environment variables** for configuration, not hardcoded values

### Function Logs

**Querying Logs:**

**Primary Method:** Use `getFunctionLogs` and `getFunctionLogDetail` tools (see MCP tool documentation).

**Alternative Method (Plan B):** If tools unavailable, use `callCloudApi`:

1. **Get Log List** - Use `GetFunctionLogs` action:
```
callCloudApi({
  service: "tcb",
  action: "GetFunctionLogs",
  params: {
    EnvId: "{envId}",
    FunctionName: "functionName",
    Offset: 0,
    Limit: 10,
    StartTime: "2024-01-01 00:00:00",
    EndTime: "2024-01-01 23:59:59",
    LogRequestId: "optional-request-id",
    Qualifier: "$LATEST"
  }
})
```

2. **Get Log Details** - Use `GetFunctionLogDetail` action (requires LogRequestId from step 1):
```
callCloudApi({
  service: "tcb",
  action: "GetFunctionLogDetail",
  params: {
    StartTime: "2024-01-01 00:00:00",
    EndTime: "2024-01-01 23:59:59",
    LogRequestId: "request-id-from-log-list"
  }
})
```

**Log Query Limitations:**

- `Offset + Limit` cannot exceed 10000
- `StartTime` and `EndTime` interval cannot exceed 1 day
- Use pagination for large time ranges

**Log Query Best Practices:**

1. Query logs within 1-day windows
2. Use RequestId for specific invocation debugging
3. Combine list and detail queries for comprehensive debugging
4. Check logs after deployment to verify function behavior

### Invoking Cloud Functions

**From Web Applications:**

```javascript
import cloudbase from "@cloudbase/js-sdk";

import cloudbaseSDK from "@cloudbase/js-sdk";

const cloudbase = cloudbaseSDK.init({
  env: 'your-env-id',
  region: 'ap-shanghai',
  accessKey: 'your-access-key'
});

// Call cloud function
const result = await cloudbase.callFunction({
  name: "functionName",
  data: { /* function parameters */ }
});
```

**From Mini Programs:**

```javascript
wx.cloud.callFunction({
  name: "functionName",
  data: { /* function parameters */ }
}).then(res => {
  console.log(res.result);
});
```

**From Node.js Backend:**

```javascript
const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({
  env: "your-env-id"
});

const result = await app.callFunction({
  name: "functionName",
  data: { /* function parameters */ }
});
```

**From HTTP API:**

Use CloudBase HTTP API to invoke functions:
- Endpoint: `https://api.cloudbase.net/v1/{envId}/functions/{functionName}/invoke`
- Requires authentication token
- See `http-api` skill for details

### HTTP Access Configuration

**HTTP Access vs HTTP API:**

- **HTTP API**: Uses CloudBase API endpoint (`https://api.cloudbase.net/v1/{envId}/functions/{functionName}/invoke`) with authentication token
- **HTTP Access**: Creates direct HTTP/HTTPS endpoint for standard REST API access (GET, POST, etc.) without SDK or CloudBase API format

**Creating HTTP Access:**

**Primary Method:** Use `createFunctionHTTPAccess` tool (see MCP tool documentation).

**Alternative Method (Plan B):** If tool unavailable, use `callCloudApi` with `CreateCloudBaseGWAPI`:

```
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
    Domain: "*"  // Use "*" for default domain, or custom domain name
  }
})
```

**Key Parameters:**
- `Type: 6` - Cloud Function type (required)
- `AuthSwitch: 2` - No auth (1 = with auth)
- `Domain: "*"` - Default domain, or specify custom domain

**Access URL:** `https://{envId}.{region}.app.tcloudbase.com/{path}` or `https://{domain}/{path}`

### Function Configuration

**Environment Variables:**

Set via `func.envVariables` when creating/updating:
```javascript
{
  envVariables: {
    "DATABASE_URL": "mysql://...",
    "API_KEY": "secret-key"
  }
}
```

**⚠️ CRITICAL: Environment Variable Update Constraint**

When updating environment variables for existing functions:

1. **MUST first query current environment variables** using `getFunctionList` with `action=detail` to get the function's current configuration
2. **MUST merge** new environment variables with existing ones
3. **DO NOT directly overwrite** - this will delete existing environment variables not included in the update

**Correct Update Pattern:**

```javascript
// 1. First, get current function details
const currentFunction = await getFunctionList({
  action: "detail",
  name: "functionName"
});

// 2. Merge existing envVariables with new ones
const mergedEnvVariables = {
  ...currentFunction.EnvVariables,  // Existing variables
  ...newEnvVariables                 // New/updated variables
};

// 3. Update with merged variables
await updateFunctionConfig({
  funcParam: {
    name: "functionName",
    envVariables: mergedEnvVariables
  }
});
```

**Why This Matters:**

- Direct overwrite will **delete** all environment variables not included in the update
- This can break function functionality if critical variables are removed
- Always preserve existing configuration when making partial updates

**Timeout Configuration:**

Set via `func.timeout` (in seconds):
- Default timeout varies by runtime
- Maximum timeout depends on runtime version
- Consider function execution time when setting

**Timer Triggers:**

Configure via `func.triggers`:
- Type: `timer` (only supported type)
- Config: Cron expression (7 fields: second minute hour day month week year)
- Examples:
  - `"0 0 2 1 * * *"` - 2:00 AM on 1st of every month
  - `"0 30 9 * * * *"` - 9:30 AM every day

**VPC Configuration:**

For accessing VPC resources:
```javascript
{
  vpc: {
    vpcId: "vpc-xxxxx",
    subnetId: "subnet-xxxxx"
  }
}
```

## MCP Tools Reference

**Function Management:**
- `getFunctionList` - List functions or get function details
- `createFunction` - Create new cloud function
- `updateFunctionCode` - Update function code (runtime cannot change)
- `updateFunctionConfig` - Update function configuration (⚠️ when updating envVariables, must first query and merge with existing values to avoid overwriting)

**Logging:**
- `getFunctionLogs` - Get function log list (basic info)
- `getFunctionLogDetail` - Get detailed log content by RequestId
- `callCloudApi` (Plan B) - Use `GetFunctionLogs` and `GetFunctionLogDetail` actions if direct tools unavailable

**HTTP Access:**
- `createFunctionHTTPAccess` - Create HTTP access for function
- `callCloudApi` (Plan B) - Use `CreateCloudBaseGWAPI` action if direct tool unavailable

**Triggers:**
- `manageFunctionTriggers` - Create or delete function triggers

## Console Management

**Function Console URLs:**

- **Function List**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf`
- **Function Detail**: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf/detail?id=${functionName}&NameSpace=${envId}`

**Console Features:**

- View function code and configuration
- Monitor function invocations and performance
- Manage environment variables
- Configure triggers
- View logs and execution history

## Common Patterns

### Error Handling

```javascript
exports.main = async (event, context) => {
  try {
    // Function logic
    return {
      code: 0,
      message: "Success",
      data: result
    };
  } catch (error) {
    return {
      code: -1,
      message: error.message,
      data: null
    };
  }
};
```

### Environment Variable Usage

```javascript
exports.main = async (event, context) => {
  const apiKey = process.env.API_KEY;
  const dbUrl = process.env.DATABASE_URL;
  
  // Use environment variables
};
```

### Database Operations

```javascript
const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({
  env: process.env.ENV_ID
});

exports.main = async (event, context) => {
  const db = app.database();
  const result = await db.collection("users").get();
  return result;
};
```

## Best Practices

1. **Runtime Selection**: Always specify runtime explicitly, use `Nodejs18.15` for new projects
2. **Code Organization**: Keep functions focused and single-purpose
3. **Error Handling**: Always implement proper error handling
4. **Environment Variables**: Use env vars for configuration, never hardcode secrets
5. **Logging**: Add meaningful logs for debugging
6. **Testing**: Test functions locally when possible before deployment
7. **Security**: Implement authentication/authorization for HTTP access
8. **Performance**: Optimize cold start time, use connection pooling for databases
9. **Monitoring**: Regularly check logs and monitor function performance
10. **Documentation**: Document function parameters and return values

## Related Skills

- `cloudrun-development` - For multi-language backend services
- `http-api` - For HTTP API invocation patterns
- `cloudbase-platform` - For general CloudBase platform knowledge
- `http-cloud-function` - For HTTP type cloud function(Recommended for SSE-Events WebSocket usage)