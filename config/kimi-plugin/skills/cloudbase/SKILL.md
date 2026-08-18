---
name: cloudbase
description: >
  Tencent CloudBase routing skill for Kimi Code / Kimi Work. Use when the user
  mentions CloudBase, 云开发, envId, PostgreSQL/MySQL/NoSQL, cloud functions,
  cloud storage, CloudRun, hosting, Auth, or tcb. Prefer CloudBase MCP tools
  from this plugin's mcpServers; fall back to tcb CLI when MCP is not loaded yet.
---

# CloudBase on Kimi

This plugin is the Kimi equivalent of the Claude Code CloudBase plugin:
**MCP tools + this routing skill + lifecycle hooks**. Full domain skill
bodies are not copied into this directory; fetch them on demand with
`searchKnowledgeBase(mode=skill, skillName="...")`.

## First step

1. Prefer MCP `envQuery` / `queryEnv` with `action=info` to get `envId` and `RuntimeMode`.
2. If MCP is not loaded in this session, run `tcb login` (or
   `tcb login --cloudbase-api-key <key> -e <envId>`) and continue with `tcb`.
3. Do not mix Web SDK auth with Mini Program OPENID.

## Tool routing

| Need | MCP (Kimi Code 0.34.0) | CLI fallback |
|------|-------------------------|--------------|
| Env / login | `envQuery`, `auth` | `tcb login`, `tcb env list` |
| PostgreSQL | `queryPgDatabase`, `managePgDatabase` | `tcb db execute --sql` |
| MySQL | `queryMysqlDatabase`, `manageMysqlDatabase` | `tcb db execute --sql --read-only` |
| NoSQL | `readNoSqlDatabaseContent`, `writeNoSqlDatabaseContent` | data models: `tcb db model list` |
| Cloud functions | `queryFunctions`, `manageFunctions` | `tcb fn list` |
| Cloud storage | `queryStorage`, `manageStorage` | `tcb storage list` |
| CloudRun | `queryCloudRun`, `manageCloudRun` | `tcb cloudrun list` |
| Auth | `queryAppAuth`, `manageAppAuth` | console / `tcb` auth commands |
| Hosting | `queryHosting`, `manageHosting` | `tcb hosting deploy` |

## Plugin vs MCP

- **This plugin** wraps the long-lived `cloudbase-mcp` server. That is the
  path Kimi Code 0.34.0 actually invokes.
- Do not use Kimi `inject` (`api_key` / `base_url`) as CloudBase credentials.
- Example prompts: `登录云开发` / `列出当前环境的云函数` / `查一下 PostgreSQL 里有哪些表`.
