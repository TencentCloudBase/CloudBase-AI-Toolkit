---
name: cloudbase
description: >
  Tencent CloudBase routing skill for Kimi Code / Kimi Work. Use when the user
  mentions CloudBase, 云开发, envId, PostgreSQL/MySQL/NoSQL, cloud functions,
  cloud storage, CloudRun, hosting, or tcb. Prefer CloudBase MCP tools from this
  plugin's mcpServers; fall back to tcb CLI when MCP is not loaded yet.
---

# CloudBase on Kimi

This plugin exposes CloudBase as a **persistent MCP server** (`cloudbase` in
`kimi.plugin.json`). That is the path Kimi Code 0.34.0 actually invokes.

A sibling `plugin.json` declares four lightweight `tcb` wrappers
(`query_database`, `list_functions`, `list_storage`, `list_cloudrun`) for the
official kimi-cli `tools[]` Beta format. Kimi Code 0.34.0 ignores `tools[]`.

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

## Plugin vs MCP

- **Plugin MCP server**: keep using it. CloudBase is a long-lived control plane.
- **plugin.json tools[]**: only for kimi-cli hosts that load `plugin.json`.
- Do not use Kimi `inject` (`api_key` / `base_url`) as CloudBase credentials.
