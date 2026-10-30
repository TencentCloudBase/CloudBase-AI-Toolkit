# CloudBase Plugin Session Context

Use CloudBase guidance only when the current repo, prompt, or tool call makes it relevant.

## Core principles

- **MCP-first, CLI-fallback**: Prefer CloudBase MCP tools (`queryEnv`, `manageFunctions`, `manageHosting`) when they are available in **this** session. If MCP is missing or not yet loaded (first session / post-install before restart), configure MCP for the next session and use `tcb` CLI now (`tcb login`, domain commands such as `tcb fn deploy` / `tcb hosting deploy` — **not** `tcb deploy`). See `skills/cloudbase/references/tooling-fallback.md`. Do not stall waiting for restart; do not invent APIs from memory.
- **Skills on demand**: The full catalog stays in `skills/` beside this plugin. Hooks load topic-sized chunks via prompt analysis. Prefer local skill files under `skills/<name>/SKILL.md`. Use `searchKnowledgeBase(mode=skill, skillName="<name>")` only as a CloudBase docs/knowledge lookup — never HTTP-fetch remote skill markdown into the agent context.
- **Verify, don't trust memory**: CloudBase APIs change frequently. Always check current docs via `searchKnowledgeBase` before implementing.

## Scenario routing

CloudBase has 4 scenarios — the detected scenario should guide your primary approach:

- **Web** (React/Vue/Vite) → `web-development` + `auth-web-cloudbase` + `cloudbase-document-database-web-sdk` + `cloud-storage-web`
- **Mini Program** (WeChat) → `miniprogram-development` + `auth-wechat-miniprogram` + `cloudbase-document-database-in-wechat-miniprogram`
- **CloudRun** (container/Docker) → `cloudrun-development` + `cloud-functions`
- **Database** (schema design) → `postgresql-development-cloudbase`, or `relational-database-mcp-cloudbase` for existing MySQL

## Two MCP servers are connected

The plugin wires both a hosted server (`cloudbase-remote`, OAuth over Streamable HTTP) and a local one (`cloudbase-local`, stdio via `npx`). They expose the same tool names, so pick one deliberately instead of mixing calls across them.

Use `cloudbase-remote` by default. Switch to `cloudbase-local` when any one of these applies:

- the account signs in with a CloudBase API key (`CLOUDBASE_API_KEY`) — the hosted endpoint accepts only OAuth or Tencent Cloud SecretId/SecretKey, it has no API-key path
- the session has to cover both the domestic and the international site — a hosted URL is bound to one site, the local server switches with `TCB_SITE`
- the task needs a tool the hosted server does not register: `manageStorage` for uploading or downloading local files, `downloadTemplate`, `manageCloudRun`, or the declarative `deployBuild` / `deployPlan` / `deployApply` set
- `cloudbase-remote` returns `401` and the user cannot finish a browser login

**Deploying functions or apps does not require the local server.** On the hosted one, deploy by two-step upload: `queryFunctions(action="getFunctionUploadUrl")` or `queryApps(action="getUploadUrl")` → `PUT` the zip → `manageFunctions` with the `code` triple or `manageApps(action="deployApp", cosTimestamp=…)`. What the hosted server lacks is the declarative `cloudbaserc` executor and a dry-run before applying.

`cloudbase-remote` has no `auth` tool: the browser OAuth flow (sign in → pick an environment → consent) *is* the login, so do not look for `auth` there and do not ask for API keys. `cloudbase-local` does expose `auth` — use it there.

## Mandatory first step

When CloudBase MCP tools are available in this session, resolve the session in this order — management tools fail with `ENV_REQUIRED` until an environment is bound:

1. `queryEnv({ action: "info" })` on the server you are using — confirm the bound environment, then resolve:
   - `envId` — use in all subsequent config files and code
   - `RuntimeMode` — `"postgresql"` or `"nosql"` (determines database skill routing)
   - `RuntimeModeHints.RecommendedSkills` — backend-recommended skills for this environment

If MCP tools are not available yet, configure MCP for the next session and resolve envId via `tcb` CLI (`tcb login` → `tcb env list` / `tcb env use`) per `tooling-fallback.md`. Skip these steps only when envId is already known from this session.

## Platform auth (critical — never mix)

- **Web**: CloudBase Web SDK `auth.toDefaultLoginPage()` — never use OPENID directly
- **Mini Program**: `wxContext.OPENID` (免登录) — never use Web SDK auth
- **CloudRun**: Server-side via `@cloudbase/node-sdk` — verify tokens, never trust client claims blindly
