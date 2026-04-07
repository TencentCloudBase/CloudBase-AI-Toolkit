# HTTP Functions Reference

Use this reference when the task is clearly about an HTTP Function: REST API, browser-facing endpoint, SSE stream, or WebSocket service.

## Core model

HTTP Functions are standard web services, not `exports.main(event, context)` handlers.

- Handle requests through `req` and `res`.
- Listen on port `9000`.
- Ship an executable `scf_bootstrap` file.
- Include runtime dependencies in the package; HTTP Functions do not auto-install `node_modules` for you.

## Minimal structure

```text
my-http-function/
├── scf_bootstrap
├── package.json
├── node_modules/
└── index.js
```

### `scf_bootstrap`

```bash
#!/bin/bash
node index.js
```

Requirements:

- File name must be exactly `scf_bootstrap`.
- Use LF line endings.
- Make it executable with `chmod +x scf_bootstrap`.

## Minimal Node.js example

```javascript
const express = require("express");
const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(9000);
```

## Request handling rules

- `req.query` -> query string values.
- `req.body` -> parsed request body, but only after body-parsing middleware is configured.
- `req.headers` -> incoming HTTP headers.
- `req.params` -> path parameters.
- Always send a response with `res.json()`, `res.send()`, or `res.status(...).json()`.
- Return meaningful status codes such as `400`, `401`, `404`, `405`, `500`.

### Example with method checks

```javascript
const express = require("express");
const app = express();

app.use(express.json());

app.post("/users", (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }

  return res.status(201).json({ name, email });
});

app.all("*", (req, res) => {
  res.status(405).json({ error: "Method Not Allowed" });
});

app.listen(9000);
```

## Deployment flow

Prefer `manageFunctions` over CLI in agent flows.

```javascript
manageFunctions({
  action: "createFunction",
  EnvId: "{envId}",
  func: {
    name: "myHttpFunction",
    type: "HTTP",
    protocolType: "HTTP",
    timeout: 60
  },
  functionRootPath: "/absolute/path/to/cloudfunctions"
});
```

### WebSocket

For WebSocket workloads, keep the function type as HTTP and switch `protocolType`:

```javascript
manageFunctions({
  action: "createFunction",
  EnvId: "{envId}",
  func: {
    name: "mySocketFunction",
    type: "HTTP",
    protocolType: "WS"
  },
  functionRootPath: "/absolute/path/to/cloudfunctions"
});
```

## Invocation options

### HTTP API with token

```bash
curl -L "https://{envId}.api.tcloudbasegateway.com/v1/functions/{name}?webfn=true" \
  -H "Authorization: Bearer <TOKEN>"
```

This is suitable for authenticated server-to-server access.

### HTTP access path for browser/public access

Creating the function does not automatically create a browser-facing path. Add gateway access separately when the user actually needs it.

```javascript
manageGateway({
  action: "createAccess",
  targetType: "function",
  targetName: "myHttpFunction",
  type: "HTTP",
  path: "/api/hello"
});
```

Before enabling anonymous access, confirm both of these:

1. The access path exists.
2. The function security rule allows the intended caller identity.

If an external caller reports `EXCEED_AUTHORITY`, inspect the function rule first with `readSecurityRule(resourceType="function")` before widening access.

## SSE and WebSocket notes

### SSE

```javascript
res.setHeader("Content-Type", "text/event-stream");
res.write(`data: ${JSON.stringify({ content: "Hello" })}\n\n`);
```

### WebSocket example

```javascript
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 9000 });

wss.on("connection", (ws) => {
  ws.on("message", (message) => ws.send(`Echo: ${message}`));
});
```

## When to stop and reroute

- If the task is actually a timer-triggered or SDK-invoked serverless function, reroute to Event Functions.
- If the task needs long-lived containers, custom system packages, or broader service architecture, reroute to `cloudrun-development`.
- If the task is only about HTTP API calling patterns rather than implementation, reroute to `http-api`.
