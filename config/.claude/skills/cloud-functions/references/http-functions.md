# HTTP Functions Reference

Use this reference when the task is clearly about an HTTP Function: REST API, browser-facing endpoint, SSE stream, or WebSocket service.

## Core model

HTTP Functions are standard web services, not `exports.main(event, context)` handlers.

- Handle requests through `req` and `res`.
- Listen on port `9000`.
- Ship an executable `scf_bootstrap` file.
- Include runtime dependencies in the package; HTTP Functions do not auto-install `node_modules` for you.
- Frameworks such as Express are optional. If the task asks for native Node.js or does not require a framework, prefer the built-in `http` module.

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

## Minimal Node.js example with native `http`

Use this shape when the user requests the Node.js standard library or when you want the smallest possible deployment package.

```javascript
const http = require("http");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/echo") {
    const body = await readJsonBody(req);
    return sendJson(res, 200, { received: body });
  }

  return sendJson(res, 404, { error: "Not Found" });
});

server.listen(9000);
```

## Minimal Node.js example with Express

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

- Native Node.js `http` server: use `new URL(req.url, base)` for path and query parsing.
- Native Node.js `http` server: read the request stream yourself before parsing JSON bodies.
- Express or similar frameworks: `req.query`, `req.body`, and `req.params` are available only after the relevant middleware or router setup.
- `req.headers` contains incoming HTTP headers in both native and framework-based implementations.
- Always send a response and set `Content-Type` to `application/json` for JSON APIs.
- Return meaningful status codes such as `400`, `401`, `404`, `405`, `500`.

### Native `http` checklist

- Route on both `req.method` and pathname.
- Wrap `JSON.parse` in error handling when the body might be malformed.
- Return `405` for unsupported methods when the path exists but the method does not.
- Return `404` for unknown paths.

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

app.all("/{*splat}", (req, res) => {
  res.status(405).json({ error: "Method Not Allowed" });
});

app.listen(9000);
```

Express 5 note: do not use bare `*` or `/*` here. Express 5 uses `path-to-regexp` with named wildcards, so `app.all("/{*splat}", ...)` is the safe catch-all form when you also need to match the root path `/`.

## Deployment flow

Prefer `manageFunctions` over CLI in agent flows.

```javascript
manageFunctions({
  action: "createFunction",
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

If an external caller reports `EXCEED_AUTHORITY`, inspect the function permission first with `queryPermissions(action="getResourcePermission", resourceType="function")` before widening access.

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
