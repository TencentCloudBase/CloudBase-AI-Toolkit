# CloudBase Plugin Session Context

Use CloudBase guidance only when the current repo, prompt, or tool call makes it relevant.

## Core principles

- **MCP-first**: Prefer CloudBase MCP tools (`envQuery`, `manageFunctions`, `manageHosting`) over CLI or memorized APIs.
- **Skills on demand**: The full catalog stays in `skills/`; hooks load topic-sized chunks via prompt analysis — fetch via `searchKnowledgeBase(mode=skill, skillName="<name>")`.
- **Verify, don't trust memory**: CloudBase APIs change frequently. Always check current docs via `searchKnowledgeBase` before implementing.

## Scenario routing

CloudBase has 4 scenarios — the detected scenario should guide your primary approach:

- **Web** (React/Vue/Vite) → `web-development` + `auth-web` + `no-sql-web-sdk` + `cloud-storage-web`
- **Mini Program** (WeChat) → `miniprogram-development` + `auth-wechat` + `no-sql-wx-mp-sdk`
- **CloudRun** (container/Docker) → `cloudrun-development` + `cloud-functions`
- **Database** (schema design) → `data-model-creation` + `relational-database-tool` or `postgresql-development`

## Mandatory first step

Always call `envQuery({ action: "info" })` first to get:
- `envId` — use in all subsequent config files and code
- `RuntimeMode` — `"postgresql"` or `"nosql"` (determines database skill routing)
- `RuntimeModeHints.RecommendedSkills` — backend-recommended skills for this environment

Skip only if envId is already known from this session.

## Platform auth (critical — never mix)

- **Web**: CloudBase Web SDK `auth.toDefaultLoginPage()` — never use OPENID directly
- **Mini Program**: `wxContext.OPENID` (免登录) — never use Web SDK auth
- **CloudRun**: Server-side via `@cloudbase/node-sdk` — verify tokens, never trust client claims blindly
