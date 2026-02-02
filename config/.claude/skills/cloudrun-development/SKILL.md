---
name: cloudrun-development
description: CloudBase Run development rules (Function mode/Container mode). Use this skill when deploying （Containers or any http services）services on CloudBase that require long connections, multi-language support, custom environments, or AI agent development. MUST READ before using manageCloudRun or queryCloudRun tools.
---

## When to use this skill

Use this skill for **CloudBase Run service development** when you need:

- Long connection capabilities: WebSocket / SSE / server push
- Long-running or persistent processes: tasks that are not suitable for cloud functions, background jobs
- Custom runtime environments/system dependencies: custom images, specific system libraries
- Multi-language/arbitrary frameworks: Java, Go, PHP, .NET, Python, Node.js, etc.
- Stable external services with elastic scaling: pay-as-you-go, can scale down to 0
- Private/internal network access: VPC/PRIVATE access, mini-program `callContainer` internal direct connection
- AI agent development: develop personalized AI applications based on Function mode CloudRun

**Do NOT use for:**
- Simple cloud functions (use cloud function development instead)
- Pure static website without backend (use static hosting instead)
- Database schema design (use data-model-creation skill)

**Note:** Full-stack applications with both frontend and backend are perfect for CloudBase Run

---

## How to use this skill (for a coding agent)

1. **Choose the right mode**
   - **Function mode**: Fastest to get started, built-in HTTP/WebSocket/SSE, fixed port 3000, local running supported
   - **Container mode**: Any language and runtime, requires Dockerfile, local running not supported by tools. Project already includes Dockerfile

2. **Follow mandatory requirements**
   - Must listen on `PORT` environment variable (real port in container)
   - Stateless service: write data externally (DB/storage/cache)
   - No background persistent threads/processes outside requests
   - Minimize dependencies, slim images; reduce cold start and deployment time
   - Resource constraints: `Mem = 2 × CPU` (e.g., 0.25 vCPU → 0.5 GB)
   - Access control: Only enable public network for Web scenarios; mini-programs prioritize internal direct connection, recommend closing public network

3. **Follow the workflow**
   - Initialize project → Check/generate Dockerfile (for container mode) → **Local build & run verification** (if docker/podman available) → **⚠️ CHECK: CORS/Host/Origin config** → Local run (function mode only) → Configure access → Deploy → Verify

4. **Use tools correctly**
   - **Read operations**: `queryCloudRun` (list, detail, templates)
   - **Write operations**: `manageCloudRun` (init, download, run, deploy, delete, createAgent)
   - Always use absolute paths for `targetPath`
   - Use `force: true` for delete operations

---

# CloudBase Run AI Development Rules

A concise guide for AI assistants and engineering collaboration, providing "when to use, how to use" rules and tool workflows.

## 1. When to use CloudBase Run (Use Cases)

- Need long connection capabilities: WebSocket / SSE / server push
- Need long-running or persistent processes: tasks that are not suitable for cloud functions, background jobs
- Need custom runtime environments/system dependencies: custom images, specific system libraries
- Use multi-language/arbitrary frameworks: Java, Go, PHP, .NET, Python, Node.js, etc.
- Need stable external services with elastic scaling: pay-as-you-go, can scale down to 0
- Need private/internal network access: VPC/PRIVATE access, mini-program `callContainer` internal direct connection
- Need to develop AI agents: develop personalized AI applications based on Function mode CloudRun

## 2. Mode Selection (Quick Comparison)

- **Function mode**: Fastest to get started, built-in HTTP/WebSocket/SSE, fixed port 3000; local running supported by tools
- **Container mode**: Any language and runtime, requires Dockerfile; local running not supported by tools

### Mode Comparison Checklist

| Dimension | Function Mode | Container Mode |
| --- | --- | --- |
| Language/Framework | Node.js (via `@cloudbase/functions-framework`) | Any language/runtime (Java/Go/PHP/.NET/Python/Node.js, etc.) |
| Runtime | Function framework loads functions (Runtime) | Docker image starts process |
| Port | Fixed 3000 | Application listens on `PORT` (injected by platform during deployment) |
| Dockerfile | Not required | Required (and must pass local build) |
| Local Running | Supported (built-in tools) | Not supported by tools; recommend local build & run with Docker/Podman before deploy |
| Typical Scenarios | WebSocket/SSE/streaming responses, forms/files, low latency, multiple functions per instance, shared memory | Arbitrary system dependencies/languages, migrating existing containerized applications |

## 3. Development Requirements (Must Meet)

- Must listen on `PORT` environment variable (real port in container)
- Stateless service: write data externally (DB/storage/cache)
- No background persistent threads/processes outside requests
- Minimize dependencies, slim images; reduce cold start and deployment time
- Resource constraints: `Mem = 2 × CPU` (e.g., 0.25 vCPU → 0.5 GB)
- Access control: Only enable public network for Web scenarios; mini-programs prioritize internal direct connection, recommend closing public network

## 4. Tools (Plain Language & Read/Write Separation)

- **Read operations** (`queryCloudRun`):
  - `list`: What services do I have? Can filter by name/type
  - `detail`: Current configuration, version, access address of a service
  - `templates`: Ready-to-use starter templates
- **Write operations** (`manageCloudRun`):
  - `init`: Create local project (optional template)
  - `download`: Pull existing service code to local
  - `run`: Run locally (Function mode only, supports normal function and Agent mode)
  - `deploy`: Deploy local code to CloudRun
  - `delete`: Delete service (requires explicit confirmation)
  - `createAgent`: Create AI agent (based on Function mode CloudRun)
- **Important parameters** (remember these):
  - `targetPath`: Local directory (must be absolute path)
  - `serverConfig`: Deployment parameters (CPU/Mem/instance count/access type/environment variables, etc.)
  - `runOptions`: Local running port and temporary environment variables (Function mode), supports `runMode: 'normal' | 'agent'`
  - `agentConfig`: Agent configuration (agentName, botTag, description, template)
  - Delete must include `force: true`, otherwise it won't execute

## 5. Core Workflow (Understand Steps First, Then Examples)

1) **Choose mode**
   - Need multi-language/existing container/Docker: choose "Container mode"
   - Need long connection/streaming/low latency/multiple functions coexisting: prioritize "Function mode"

2) **Initialize local project**
   - General: Use template `init` (both Function mode and Container mode can start from templates)
   - Container mode must "check or generate Dockerfile"
   - Check if the existed Dockerfile is suitable for CloudRun and user requirements
   - Decide whether to use the existed Dockerfile or Create a new one? You should not modify the original Dockerfile. But just create a dedicated one like `Dockerfile.cloudrun`
   - Node.js minimal example:
      ```dockerfile
      FROM node:18-alpine
      WORKDIR /app
      COPY package*.json ./
      RUN npm ci --omit=dev
      COPY . .
      ENV NODE_ENV=production
      EXPOSE 3000
      CMD ["node","server.js"]
      ```
    - Python minimal example:
      ```dockerfile
      FROM python:3.11-slim
      WORKDIR /app
      COPY requirements.txt ./
      RUN pip install -r requirements.txt --no-cache-dir
      COPY . .
      ENV PORT=3000
      EXPOSE 3000
      CMD ["python","app.py"]
      ```

      Make sure the application are actually Running on the PORT.

3) **Local build and run verification (Container mode, when Docker/Podman available)**
   - After writing or updating the Dockerfile, if the user's environment has `docker` or `podman` available (check with `docker --version` or `podman --version`), perform local build and run before deploying to CloudRun.
   - **Build**: From the project root (where Dockerfile lives), run e.g. `docker build -t my-svc:local .` or `podman build -t my-svc:local .`. Use the same Dockerfile that will be used for CloudRun (e.g. `-f Dockerfile.cloudrun` if using a dedicated file).
   - **Run**: Start the container with `PORT` set to the port your app listens on (see Dockerfile `EXPOSE` or app config). Map host port to container port: `docker run -p <host_port>:<container_port> -e PORT=<container_port> <image>` (same for `podman run`).
   - **Verify**: Confirm the app responds on the mapped host port (e.g. `curl http://localhost:<host_port>` or hit a health/root endpoint). Fix any build or runtime errors locally.
   - **Then proceed**: Only after local build and run succeed, continue to CORS check and deploy. If docker/podman is not available, skip this step and proceed to deploy (CloudRun will build remotely).

4) **⚠️ CHECK: CORS / Host / Origin Configuration (CRITICAL)**
   - CloudBase Run provides a default preview URL ending with `.run.tcloudbase.com`
   - **MUST verify** backend CORS / `Access-Control-Allow-Origin` / `allowHost` allows `*.run.tcloudbase.com`
   - **Check locations** (common places):
     - CORS middleware configuration (e.g., `cors` package in Express)
     - `Access-Control-Allow-Origin` header settings
     - Framework-specific CORS configs (NestJS, FastAPI, Spring Boot, etc.)
     - Environment variables like `ALLOWED_ORIGINS`, `CORS_ORIGIN`
   - If using custom domain in production, ensure both custom domain AND `.run.tcloudbase.com` are allowed

5) **Local running** (Function mode only)

6) **Configure access**
   - Set `OpenAccessTypes` (WEB/VPC/PRIVATE) as needed; configure security domain and authentication for Web scenarios

7) **Deploy**
   - Specify CPU/Mem/instance count/environment variables, etc. during `deploy`

8) **Verify**
   - Use `detail` to confirm access address and configuration meet expectations

### Example Tool Calls

1) **View templates/services**
```json
{ "name": "queryCloudRun", "arguments": { "action": "templates" } }
```
```json
{ "name": "queryCloudRun", "arguments": { "action": "detail", "detailServerName": "my-svc" } }
```

2) **Initialize project**
```json
{ "name": "manageCloudRun", "arguments": { "action": "init", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc", "template": "helloworld" } }
```

3) **Download code** (optional)
```json
{ "name": "manageCloudRun", "arguments": { "action": "download", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc" } }
```

4) **Local running** (Function mode only; use the port your app listens on in `runOptions.port`)
```json
{ "name": "manageCloudRun", "arguments": { "action": "run", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc", "runOptions": { "port": 3000 } } }
```

7) **Deploy** (⚠️ Confirm CORS check completed; for container mode, recommend local build & run with Docker/Podman first when available)
```json
{ "name": "manageCloudRun", "arguments": { "action": "deploy", "serverName": "my-svc", "targetPath": "/abs/ws/my-svc", "serverConfig": { "OpenAccessTypes": ["WEB"], "Cpu": 0.5, "Mem": 1, "MinNum": 0, "MaxNum": 5 } } }
```
Make sure application are actually running on PORT that defined here.

6) **Create AI agent** (optional)
```json
{ "name": "manageCloudRun", "arguments": { "action": "createAgent", "serverName": "my-agent", "targetPath": "/abs/ws/agents", "agentConfig": { "agentName": "MyAgent", "botTag": "demo", "description": "My agent", "template": "blank" } } }
```

7) **Run agent** (optional; use the port your app listens on in `runOptions.port`)
```json
{ "name": "manageCloudRun", "arguments": { "action": "run", "serverName": "my-agent", "targetPath": "/abs/ws/agents/my-agent", "runOptions": { "port": 3000, "runMode": "agent" } } }
```

## 6. Best Practices (Strongly Recommended)

- Prioritize PRIVATE/VPC or mini-program internal `callContainer`, reduce public network exposure
- Web must use CloudBase Web SDK authentication; mini-programs authenticated by platform
- Secrets via environment variables; separate configuration for multiple environments (dev/stg/prod)
- Use `queryCloudRun.detail` to verify configuration and accessibility before and after deployment
- Image layers reusable, small volume; monitor startup latency and memory usage
- Agent development: Use `@cloudbase/aiagent-framework`, supports SSE streaming responses, BotId format is `ibot-{name}-{tag}`

## 7. Quick Troubleshooting

- **Access failure**: Check OpenAccessTypes/domain/port, whether instance scaled down to 0
- **CORS errors**: Backend must allow `*.run.tcloudbase.com` origin. See Step 3 in Core Workflow.
- **Deployment failure**: Verify Dockerfile/build logs/image volume and CPU/Mem ratio; if possible, reproduce with local `docker build` / `podman build` and `docker run` / `podman run` first
- **Local running failure**: Only Function mode supported; requires `package.json` `dev`/`start` or entry `index.js|app.js|server.js`
- **Performance jitter**: Reduce dependencies and initialization; appropriately increase MinNum; optimize cold start
- **Agent running failure**: Check `@cloudbase/aiagent-framework` dependency, BotId format, SSE response format

## 8. Function Mode CloudRun (Function Mode) Key Points (Concise)

- **Definition**: CloudRun + function framework (`@cloudbase/functions-framework`) + function code, making container service development as simple as writing cloud functions
- **When to choose**: Need WebSocket/SSE/file upload/streaming responses; need long tasks or connect to DB/message queue; need multiple functions per instance and shared memory, low latency and better logs/debugging
- **Agent mode**: Develop AI agents based on Function mode CloudRun, use `@cloudbase/aiagent-framework`, supports SSE streaming responses and personalized AI applications
- **Tool support**: Local running only supports Function mode (`manageCloudRun` → `run`); deploy using `manageCloudRun` → `deploy`; query using `queryCloudRun`
- **Migration tips**: Different from cloud function call chain/runtime, migration requires minor modifications (including client calling methods)
- **Portability**: Based on function framework, can run locally/host/Docker, non-CloudRun requires self-managed build and deployment

## 9. Service Invocation Methods (Concise Examples)

### HTTP Direct Access (when WEB public network enabled)
```bash
curl -L "https://<your-service-domain>"
```

### WeChat Mini Program (internal direct connection, recommend closing public network)
```js
// app.js (ensure wx.cloud.init() is called)
const res = await wx.cloud.callContainer({
  config: { env: "<envId>" },
  path: "/",
  method: "GET",
  header: { "X-WX-SERVICE": "<serviceName>" }
});
```

### Web (JS SDK, need to configure security domain and authentication)
```js
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({ env: "<envId>" });  // Collect user's phone number into variable `phoneNum` by providing a input UI

const auth = app.auth();

// Send SMS code
const verificationInfo = await auth.getVerification({
  phone_number: `+86 ${phoneNum}`,
});

// Collect user's phone number into variable `verificationCode` by providing a input UI 

// Sign in
await auth.signInWithSms({
  verificationInfo,
  verificationCode,
  phoneNum,
});

const res = await app.callContainer({
  name: "<serviceName>", method: "POST", path: "/api",
  header: { "Content-Type": "application/json" },
  data: { key: "value" }
});
```

// Web JS SDK initialization MUST be synchronous:
// - Always use top-level `import cloudbase from "@cloudbase/js-sdk";`
// - Do NOT use dynamic imports like `import("@cloudbase/js-sdk")` or async wrappers such as `initCloudBase()` with internal `initPromise`

### Node.js (server-side/cloud function internal call)
```js
import tcb from "@cloudbase/node-sdk";
const app = tcb.init({});
const res = await app.callContainer({
  name: "<serviceName>", method: "GET", path: "/health",
  timeout: 5000
});
```

### Recommendations
- Mini Program/Server side prioritize internal network (VPC/PRIVATE) calls, reduce exposure surface
- Web scenarios need to enable WEB, public domain and security domain, and use SDK authentication
