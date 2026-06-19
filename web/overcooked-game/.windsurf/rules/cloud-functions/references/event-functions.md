# Event Functions Reference

Use this reference when the task is clearly about an Event Function (`exports.main(event, context)`) rather than an HTTP Function.

## Runtime and packaging facts

- Runtime is fixed at creation time and cannot be changed later.
- For new functions, prefer `Nodejs18.15` unless dependency compatibility forces an older runtime.
- Event Functions auto-install dependencies from `package.json` during deployment, so you normally do not ship `node_modules`.
- The function root path must point to the parent directory that contains the function folder.

## Minimal structure

```text
cloudfunctions/
└── myFunction/
    ├── index.js
    └── package.json
```

```javascript
exports.main = async (event, context) => {
  return {
    code: 0,
    message: "ok",
    data: { event }
  };
};
```

## Create or update flow

### Create

Use `manageFunctions(action="createFunction")` and make the function type explicit.

```javascript
manageFunctions({
  action: "createFunction",
  func: {
    name: "myFunction",
    type: "Event",
    runtime: "Nodejs18.15",
    timeout: 30
  },
  functionRootPath: "/absolute/path/to/cloudfunctions"
});
```

### Update code

Use `manageFunctions(action="updateFunctionCode")` when only code changes.

```javascript
manageFunctions({
  action: "updateFunctionCode",
  functionName: "myFunction",
  functionRootPath: "/absolute/path/to/cloudfunctions"
});
```

### Key reminders

- `updateFunctionCode` does not change runtime.
- If runtime must change, recreate the function.
- Prefer MCP management tools over CLI in agent flows.

## Invocation patterns

### Web

```javascript
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({ env: "your-env-id" });
const result = await app.callFunction({
  name: "myFunction",
  data: { userId: "123" }
});
```

### Mini Program

```javascript
const result = await wx.cloud.callFunction({
  name: "myFunction",
  data: { userId: "123" }
});
```

### Node.js backend

```javascript
const tcb = require("@cloudbase/node-sdk");
const app = tcb.init({ env: "your-env-id" });

const result = await app.callFunction({
  name: "myFunction",
  data: { userId: "123" }
});
```

### Raw HTTP API

Use the CloudBase HTTP API only when the task is explicitly about raw API invocation.

```text
https://{envId}.api.tcloudbasegateway.com/v1/functions/{functionName}
```

This path requires authentication and belongs with the `http-api` skill, not browser-facing anonymous access.

## Common patterns

### Error handling

```javascript
exports.main = async (event, context) => {
  try {
    const result = await doWork(event);
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

### Environment variables

```javascript
exports.main = async () => {
  const apiKey = process.env.API_KEY;
  const envId = process.env.ENV_ID;
  return { apiKeyExists: Boolean(apiKey), envId };
};
```

## When to stop and reroute

- If the user wants a long-lived HTTP service, SSE, or WebSocket server, reroute to HTTP Functions or CloudRun.
- If the user wants browser SDK auth or UI login, reroute to the relevant auth skill.
- If the user wants MySQL or document database schema design, reroute to the data skills instead of forcing it into a function tutorial.
