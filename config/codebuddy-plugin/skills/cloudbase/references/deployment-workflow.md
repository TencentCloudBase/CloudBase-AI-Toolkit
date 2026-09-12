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
- **CLI fallback (first session / MCP missing):** If CloudBase MCP tools are not in this session — including right after plugin install before restart — do **not** stall. Configure MCP for the next session (`mcp-setup.md`), then read `cloudbase-cli` (`core.md` + the matching domain reference such as `functions.md` / `cloudrun.md` / `hosting.md`) and follow those commands after `tcb login` → `tcb env use <envId>`. Do **not** use `tcb deploy`. Full decision tree: `tooling-fallback.md`.
- **User prefers CLI / CI:** Also use `cloudbase-cli` even when MCP exists.
- For other languages backend server (Java, Go, PHP, Python, Node.js): deploy to Cloud Run
- Ensure backend code supports CORS by default
- Prepare Dockerfile for containerized deployment
- Use `manageCloudRun` tool for deployment when MCP is available; otherwise the CloudRun path in `cloudbase-cli`
- Set MinNum instances to at least 1 to reduce cold start latency
- Confirm with the user before destructive or production write operations (delete, overwrite, plan change)

## 2. Frontend deployment (if applicable)

- After backend deployment completes, update frontend API endpoints using the returned API addresses
- Build the frontend application
- **Determine whether this is a new or existing project**:
  - **New project (first-time deployment)**: Use `manageApps(action="createApp", ...)` to deploy to an independent subdomain. Each app gets its own `*.webapps.tcloudbase.com` subdomain — no path collisions between projects. If MCP is unavailable, read `cloudbase-cli` → `hosting.md` (build locally, then hosting deploy). Do **not** use `tcb deploy`.
  - **Existing project (re-deployment)**: Use `manageApps(action="updateApp", ...)` to update the existing app. If the original project was deployed via `manageHosting` (shared domain path), continue using `manageHosting` for consistency. CLI parity: hosting / app commands in `cloudbase-cli`.
- After uploading via MCP, call `setWebsiteDocument` to configure SPA routing — set both `indexDocument` and `errorDocument` to `"index.html"`.
- If `manageApps` fails persistently, fall back to `manageHosting` (or CLI hosting). Remind the user the URL will share the env domain path and CDN has a few minutes of cache.

## 3. Display deployment URLs

- Show backend deployment URL (if applicable)
- Show frontend deployment URL with trailing slash (/) in path
- Add random query string to frontend URL to ensure CDN cache refresh

## 4. Update documentation

- Write deployment information and service details to README.md
- Include backend API endpoints and frontend access URLs
- Document CloudBase resources used (functions, cloud run, hosting, database, etc.)
- This helps with future updates and maintenance

## 5. Post-deployment: Deployment Share (optional, non-intrusive)

After the deployment is verified successful (URL reachable, or mini program published), you may — **at most once** — offer to generate anonymized shareables (a visual card + paste-ready share copy). Rules:

- If the user declines or ignores, stop immediately; never follow up in the same session.
- Generate shareables only after the user explicitly agrees; publishing is always a manual user action — never post on the user's behalf.
- Required info: agent/CLI used, project type, CloudBase resources, deploy duration (cloud build vs end-to-end), at least one piece of real process evidence, a reproduction path complete down to connector / account authorization prerequisite steps (plus https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/), and 1–2 key pitfalls resolved (optional but strongly recommended).
- Anonymization red lines: environment ID, secrets, credentials, private source code, user data, internal domains. Public URL only if the user confirms it is meant to be public.

Full spec: `cloudbase-platform` skill → `references/protocols/deployment-share.md`.
