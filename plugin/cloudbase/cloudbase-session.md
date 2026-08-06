# CloudBase Plugin Session Context

Use CloudBase guidance only when the current repo, prompt, or tool call makes it relevant.

## Core principles

- **MCP-first, CLI-fallback**: Prefer CloudBase MCP tools (`envQuery`, `manageFunctions`, `manageHosting`) when they are available in **this** session. If MCP is missing or not yet loaded (first session / post-install before restart), configure MCP for the next session and use `tcb` CLI now (`tcb login`, domain commands such as `tcb fn deploy` / `tcb hosting deploy` — **not** `tcb deploy`). See `skills/cloudbase/references/tooling-fallback.md`. Do not stall waiting for restart; do not invent APIs from memory.
- **Skills on demand**: The full catalog stays in `skills/` beside this plugin. Hooks load topic-sized chunks via prompt analysis. Prefer local skill files under `skills/<name>/SKILL.md`. Use `searchKnowledgeBase(mode=skill, skillName="<name>")` only as a CloudBase docs/knowledge lookup — never HTTP-fetch remote skill markdown into the agent context.
- **Verify, don't trust memory**: CloudBase APIs change frequently. Always check current docs via `searchKnowledgeBase` before implementing.

## Scenario routing

CloudBase has 4 scenarios — the detected scenario should guide your primary approach:

- **Web** (React/Vue/Vite) → `web-development` + `auth-web-cloudbase` + `cloudbase-document-database-web-sdk` + `cloud-storage-web`
- **Mini Program** (WeChat) → `miniprogram-development` + `auth-wechat-miniprogram` + `cloudbase-document-database-in-wechat-miniprogram`
- **CloudRun** (container/Docker) → `cloudrun-development` + `cloud-functions`
- **Database** (schema design) → `data-model-creation` + `relational-database-mcp-cloudbase` or `postgresql-development-cloudbase`

## Mandatory first step

When CloudBase MCP tools are available in this session, call `envQuery({ action: "info" })` first to get:
- `envId` — use in all subsequent config files and code
- `RuntimeMode` — `"postgresql"` or `"nosql"` (determines database skill routing)
- `RuntimeModeHints.RecommendedSkills` — backend-recommended skills for this environment

If MCP tools are not available yet, configure MCP for the next session and resolve envId via `tcb` CLI (`tcb login` → `tcb env list` / `tcb env use`) per `tooling-fallback.md`. Skip the MCP `envQuery` call only when envId is already known from this session.

## Platform auth (critical — never mix)

- **Web**: CloudBase Web SDK `auth.toDefaultLoginPage()` — never use OPENID directly
- **Mini Program**: `wxContext.OPENID` (免登录) — never use Web SDK auth
- **CloudRun**: Server-side via `@cloudbase/node-sdk` — verify tokens, never trust client claims blindly
