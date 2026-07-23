# Deployment Workflow

When users request deployment to CloudBase:

## 0. Check existing deployment

- Read README.md to check for existing deployment information
- Identify previously deployed services and their URLs
- Determine if this is a new deployment or update to existing services

## 1. Backend deployment (if applicable)

- Only for Node.js cloud functions: deploy directly using `manageFunctions(action="createFunction")` / `manageFunctions(action="updateFunctionCode")`
  - Legacy compatibility: if older materials mention `createFunction`, `updateFunctionCode`, or `getFunctionList`, map them to `manageFunctions(...)` and `queryFunctions(...)`
  - Before deploying, decide whether the function is Event or HTTP. Event Functions use `exports.main = async (event, context) => {}`.
  - HTTP Functions are standard web services: they must listen on port `9000`, include `scf_bootstrap`, and for Node.js should default to native `http.createServer((req, res) => { ... })`. Parse `req.url` and the streamed request body manually, set response headers explicitly, and do not write the function as `exports.main` unless you intentionally choose Functions Framework.
- **Alternative: CLI Deployment** — If MCP is unavailable or the user prefers CLI, read the `cloudbase-cli` skill for `tcb`-based deployment workflows (functions, CloudRun, hosting).
- For other languages backend server (Java, Go, PHP, Python, Node.js): deploy to Cloud Run
- Ensure backend code supports CORS by default
- Prepare Dockerfile for containerized deployment
- Use `manageCloudRun` tool for deployment
- Set MinNum instances to at least 1 to reduce cold start latency
- Confirm with the user before destructive or production write operations (delete, overwrite, plan change)

## 2. Frontend deployment (if applicable)

- After backend deployment completes, update frontend API endpoints using the returned API addresses
- Build the frontend application
- **Determine whether this is a new or existing project**:
  - **New project (first-time deployment)**: Use `manageApps(action="createApp", ...)` to deploy to an independent subdomain. Each app gets its own `*.webapps.tcloudbase.com` subdomain — no path collisions between projects.
  - **Existing project (re-deployment)**: Use `manageApps(action="updateApp", ...)` to update the existing app. If the original project was deployed via `manageHosting` (shared domain path), continue using `manageHosting` for consistency.
- After uploading, call `setWebsiteDocument` to configure SPA routing — set both `indexDocument` and `errorDocument` to `"index.html"`.
- If `manageApps` fails persistently, fall back to `manageHosting`. Remind the user the URL will share the env domain path and CDN has a few minutes of cache.

## 3. Display deployment URLs

- Show backend deployment URL (if applicable)
- Show frontend deployment URL with trailing slash (/) in path
- Add random query string to frontend URL to ensure CDN cache refresh

## 4. Update documentation

- Write deployment information and service details to README.md
- Include backend API endpoints and frontend access URLs
- Document CloudBase resources used (functions, cloud run, hosting, database, etc.)
- This helps with future updates and maintenance
