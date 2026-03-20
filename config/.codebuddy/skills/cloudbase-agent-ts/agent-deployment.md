# Agent Deployment Guide

## Core Principle

**Always use the `manageAgent` MCP tool to deploy Agent services.**

It natively supports SSE streaming, session persistence, and Node.js 20 runtime — purpose-built for Agent scenarios.

Do **NOT** use `createFunction` or `manageCloudRun` for Agent deployment.

## Why HTTP Cloud Functions First

| Dimension | HTTP Cloud Functions | CloudRun |
|-----------|---------------------|----------|
| SSE Streaming | ✅ Native support | ✅ Supported |
| WebSocket | ✅ Native support | ✅ Supported |
| Deployment Complexity | Low (no Dockerfile needed) | High (container config required) |
| Cost | Pay-per-invocation, scales to zero | Pay-per-instance-hour |
| Cold Start | Yes, mitigated with provisioned instances | Yes, mitigated with min instances |
| Supported Runtimes | Node.js, Python | Any |

## Deployment Steps (HTTP Cloud Functions)

1. Ensure project has `scf_bootstrap` startup script (see below)
2. Install dependencies locally (`npm install`)
3. Deploy using `manageAgent` MCP tool with `runtime="Nodejs20"`:

```
manageAgent(action="create", runtime="Nodejs20", installDependency=true, targetPath="...")
```

4. Set environment variables (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, etc.)
5. Verify SSE connectivity

## Node.js Runtime Version

**Always select Node.js 20 runtime** (`runtime="Nodejs20"`). This is the recommended version for CloudBase Agent TypeScript SDK because:

- Full compatibility with all `@cloudbase/agent-*` packages
- ES Module support (`"type": "module"` in package.json)
- Stable and well-tested on the CloudBase platform

Do **NOT** use Node.js 16 or earlier — many SDK features require Node.js >= 20.

## Code Adaptation Notes

### Port Listening

Your server **should** listen on port `9000` (the default for CloudBase Agent). The platform will route traffic to this port:

```javascript
app.listen(9000, () => logger.info("Listening on 9000!"));
```

### Startup Script (scf_bootstrap)

The startup script must be named `scf_bootstrap` (no file extension), placed in the project root, and have executable permissions:

```bash
#!/bin/sh
node src/index.js
```

Make it executable:

```bash
chmod +x scf_bootstrap
```

> **IMPORTANT**: The `scf_bootstrap` script should be minimal — just start the Node.js application. Do NOT include dependency installation (`npm install`) in this script. Dependencies are handled during deployment.

> **NOTE**: Use `#!/bin/sh` (not `#!/bin/bash`) for maximum compatibility. The entry point should match the `main` field in `package.json` or the actual location of your server entry file.

### CORS Configuration

CORS should be conditionally enabled, typically only for local development:

```javascript
import cors from "cors";

// Only enable CORS when explicitly set (for local dev)
if (process.env.ENABLE_CORS === "true") {
  app.use(cors());
}
```

In production (CloudBase), CORS is handled by the API gateway, so you generally do NOT need to enable it in your code.

## Complete Deployment Example

### Project Structure

```
my-agent/
├── src/
│   ├── index.js          # App entry: Express server + AG-UI routes
│   ├── agent.js          # LangGraph workflow definition
│   └── utils.js          # Utility functions (env check, JWT parsing)
├── scf_bootstrap          # CloudBase startup script (REQUIRED)
├── .env.example           # Environment variables template
├── Dockerfile             # CloudRun deployment (alternative)
└── package.json           # Dependencies
```

### scf_bootstrap

```bash
#!/bin/sh
node src/index.js
```

### package.json

```json
{
  "name": "langgraph-js",
  "version": "1.0.0",
  "main": "src/index.js",
  "type": "module",
  "dependencies": {
    "@cloudbase/agent-adapter-langgraph": "latest",
    "@cloudbase/agent-server": "latest",
    "@dotenvx/dotenvx": "^1.51.1",
    "@langchain/core": "^1.1.4",
    "@langchain/langgraph": "^1.0.4",
    "@langchain/openai": "^1.1.3",
    "cors": "^2.8.5",
    "express": "^5.2.1",
    "pino": "^10.2.1",
    "uuid": "^13.0.0",
    "zod": "^4.1.13"
  }
}
```

> **IMPORTANT**: Use `"type": "module"` to enable ES Module syntax (`import`/`export`). The `@cloudbase/agent-*` packages are ESM-only.

### src/index.js

```javascript
import { createExpressRoutes } from "@cloudbase/agent-server";
import { LanggraphAgent } from "@cloudbase/agent-adapter-langgraph";
import { createAgenticChatGraph } from "./agent.js";
import express from "express";
import cors from "cors";
import dotenvx from "@dotenvx/dotenvx";
import pino from "pino";
import { v4 as uuidv4 } from "uuid";

dotenvx.config();

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const createAgent = ({ request, logger, requestId }) => {
  const agenticChatGraph = createAgenticChatGraph();
  return {
    agent: new LanggraphAgent({
      compiledWorkflow: agenticChatGraph,
    })
      .use((input, next) => {
        // Ensure every request has a threadId for session tracking
        return next.run(
          typeof input.threadId === "string"
            ? input
            : { ...input, threadId: uuidv4() },
        );
      }),
  };
};

const app = express();

if (process.env.ENABLE_CORS === "true") {
  app.use(cors());
}

createExpressRoutes({
  createAgent,
  express: app,
  logger,
});

app.listen(9000, () => logger.info("Listening on 9000!"));
```

### src/agent.js

```javascript
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { Command, StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { ClientStateAnnotation } from "@cloudbase/agent-adapter-langgraph";

const checkpointer = new MemorySaver();

async function chatNode(state, config) {
  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
      defaultHeaders: { Accept: "text/event-stream" },
    },
  });

  const effectiveConfig = config ?? { recursionLimit: 25 };
  const modelWithTools = model.bindTools([...(state.client?.tools || [])], {
    parallel_tool_calls: false,
  });

  const systemMessage = new SystemMessage({
    content: "你是一个智能助手。",
  });

  const response = await modelWithTools.invoke(
    [systemMessage, ...state.messages],
    effectiveConfig,
  );

  return new Command({
    goto: END,
    update: { messages: [response] },
  });
}

const workflow = new StateGraph(ClientStateAnnotation)
  .addNode("chat_node", chatNode)
  .addEdge(START, "chat_node")
  .addEdge("chat_node", END);

export function createAgenticChatGraph() {
  return workflow.compile({ checkpointer });
}
```

### .env.example

```
OPENAI_API_KEY=xxx
OPENAI_BASE_URL=xxx
OPENAI_MODEL=xxx

# Optional: enable CORS for local dev
# ENABLE_CORS=true
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | ✅ | OpenAI API key or compatible service key |
| `OPENAI_BASE_URL` | ✅ | API base URL, e.g. `https://api.openai.com/v1` |
| `OPENAI_MODEL` | ✅ | Model name, e.g. `gpt-4o` or `gpt-3.5-turbo` |
| `LOG_LEVEL` | ❌ | Log level: `trace`/`debug`/`info`/`warn`/`error`/`fatal` (default: `info`) |
| `ENABLE_CORS` | ❌ | Set to `true` to enable CORS (local dev only) |

## When to Use CloudRun Instead

Despite HTTP Cloud Functions being preferred, use CloudRun in these cases:

- Custom Docker image required (special system-level dependencies like FFmpeg, Chromium, etc.)
- Resource requirements exceed Cloud Function limits
- Persistent local file storage needed
- Need to install native C extensions that require specific OS packages

For CloudRun deployment, use a Dockerfile:

```dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm i --production

COPY src ./src

ENV NODE_ENV=production
EXPOSE 9000

CMD ["node", "src/index.js"]
```

## Summary

| Decision | Choice |
|----------|--------|
| **Deployment tool** | `manageAgent` MCP tool (MUST USE) |
| **Node.js runtime** | Node.js 20 (MUST USE, `runtime="Nodejs20"`) |
| **Dependency strategy** | Cloud-side install supported (`installDependency=true`) |
| **Default platform** | HTTP Cloud Functions |
| **Fallback platform** | CloudRun (only for special requirements) |
| **Startup script** | `scf_bootstrap` — `#!/bin/sh` + `node src/index.js` |
| **Port** | Listen on port `9000` |
| **CORS** | Conditional via `ENABLE_CORS` env var; production uses API gateway |
| **Module system** | ES Modules (`"type": "module"` in package.json) |
