---
name: cloudbase-mcp
description: CloudBase MCP reference. Use when connecting local or remote MCP, choosing the domestic or international endpoint, setting site, region, cloud mode, or plugin flags, or contributing a fix to the open-source MCP server, skills, or CLI.
version: 2.35.0
alwaysApply: false
---

# CloudBase MCP

Open source:

- GitHub: https://github.com/TencentCloudBase/CloudBase-AI-ToolKit
- Domestic mirror: https://cnb.cool/tencent/cloud/cloudbase/CloudBase-AI-ToolKit

## When to use

- The user is connecting MCP, or choosing local versus remote.
- The user needs the site, region, cloud-mode, or plugin switches that already exist.
- A bug is in this repo's MCP server, skills, or CLI, and the fix should be a pull request.

## Do not use this for

- Creating or changing cloud resources. Use the matching domain skill, or `./cloudbase-cli/SKILL.md` when MCP tools are not loaded.
- Cloud platform, permission, or account problems that are not code in this repo. Those go to an issue, not a pull request.

## Connection

| Mode | Address |
|------|---------|
| Remote, domestic | `https://tcb-api.cloud.tencent.com/mcp/v1` |
| Remote, international | `https://tcb-api.tencentcloud.com/mcp/v1` |
| Local | `npx @cloudbase/cloudbase-mcp@latest` (Node.js 18.15+) |

The hostname decides the site. Remote URLs do not take a `site` query parameter.

- Interactive clients: put only the URL in the IDE config. The IDE opens a browser for login. This is the usual path.
- CI: add `env_id` and headers `X-TencentCloud-SecretId` / `X-TencentCloud-SecretKey`.
- Local stdio for the international site: `TCB_SITE=intl` and `TCB_REGION=ap-singapore`.

Remote mode cannot upload local files or download templates. The international site does not expose NoSQL tools.

## Environment

| Name | Effect |
|------|--------|
| `TCB_SITE` | `domestic` or `intl`. `ap-singapore` exists on both sites; a domestic Singapore environment must set `TCB_SITE=domestic`. |
| `TCB_REGION` | API region, such as `ap-shanghai` or `ap-singapore`. |
| `CLOUDBASE_MCP_CLOUD_MODE` or `MCP_CLOUD_MODE` | `true` disables local file and process tools for a self-hosted caller. |
| `CLOUDBASE_MCP_PLUGINS_ENABLED` / `CLOUDBASE_MCP_PLUGINS_DISABLED` | Comma-separated plugin names for a local server. |
| `enable_plugins` / `disable_plugins` | The same switch on a remote URL, comma-separated. |

Plugin names are the ones in `mcp/src/server.ts` (`env`, `database`, `functions`, `hosting`, `storage`, and the rest). Hosted remote servers leave `feedback` off unless `enable_plugins` includes it. A local server includes it by default.

## Contributing

Read `CONTRIBUTING.md` at the repo root. Fork, use a feature branch, and follow the commit types listed there (`feat`, `fix`, `docs`, and the rest). Install with corepack and `pnpm install`.

- A bug in MCP, a skill, or the CLI: open a pull request.
- The cloud platform, a permission, or the account: open an issue. Do not put an environment ID or a secret in the text.
- `prepareFeedback` only returns the new-issue page for the current site. Write the text in the chat. The user logs in and submits it.
