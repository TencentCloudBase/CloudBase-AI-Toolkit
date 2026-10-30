---
name: cloudbase-mcp
description: CloudBase MCP reference. Use when connecting local or remote MCP, calling tools from the shell with mcporter, reading tool schemas, choosing the domestic or international endpoint, setting site, region, cloud mode, or plugin flags, or contributing a fix to the open-source MCP server, skills, or CLI.
version: 2.36.2
license: MIT
alwaysApply: false
---

# CloudBase MCP

Open source:

- GitHub: https://github.com/TencentCloudBase/CloudBase-AI-ToolKit
- Domestic mirror: https://cnb.cool/tencent/cloud/cloudbase/CloudBase-AI-ToolKit

The server source is `mcp/` in that repo. The package name is `@cloudbase/cloudbase-mcp`.

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../cloudbase-cli/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

- MCP setup, mcporter commands, and auth examples: `../cloudbase/references/mcp-setup.md`
- CLI fallback when MCP tools are not loaded: `../cloudbase-cli/SKILL.md`
- MCP vs CLI decision tree: `../cloudbase/references/tooling-fallback.md`

## When to use

- The user is connecting MCP, or choosing local versus remote.
- The user or the agent calls CloudBase tools from the shell with mcporter, or needs a tool schema before calling.
- The user needs the site, region, cloud-mode, or plugin switches that already exist.
- A bug is in this repo's MCP server, skills, or CLI, and the fix should be a pull request.
- A CloudBase tool failed and the user needs to report it, but cannot share the whole session. Read `references/issue-report.md` first and build the report before answering anything else.

## Do not use this for

- Creating or changing cloud resources. Use the matching domain skill, or `../cloudbase-cli/SKILL.md` when MCP tools are not loaded.
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

Pick the mode by these rules:

- **Remote** — the default. Interactive sign-in (browser OAuth) plus anything that runs entirely in the cloud.
- **Local** — when any one of these applies:
  - the account signs in with a CloudBase API key (`CLOUDBASE_API_KEY`); remote has no API-key path, it accepts OAuth or Tencent Cloud SecretId/SecretKey only
  - one session has to cover both the domestic and the international site; a remote URL is bound to a single site, while local switches with `TCB_SITE`
  - the task needs a tool that remote does not register: `manageStorage` for uploading or downloading local files, `downloadTemplate`, `manageCloudRun`, or the declarative `deployBuild` / `deployPlan` / `deployApply` set

**Deploying functions or apps does not require local mode.** Remote deploys through the two-step upload: `queryFunctions(action="getFunctionUploadUrl")` or `queryApps(action="getUploadUrl")` → `PUT` the zip → `manageFunctions` with the `code` triple or `manageApps(action="deployApp", cosTimestamp=…)`. What remote lacks is the declarative `cloudbaserc` executor and a dry-run before applying.

The international site does not expose NoSQL tools in either mode.

## Readiness check: missing tools are not the same as unconfigured

Run this before concluding MCP is unavailable, and before reaching for any workaround. Four different failures look alike from the outside and need different fixes.

1. **Wiring — is a tool registered in this session?** If no `cloudbase`-prefixed MCP tool appears in the current session's tool list, treat it as a wiring problem, not a credential problem. In hosts with a connector manager (WorkBuddy and similar), check the **installed** connector list first and reconnect from there. A bound connector is deliberately excluded from search and recommendation results, so "search returns nothing" does not mean "not installed". Search with the bare entity name (`cloudbase`), not a sentence — sentence-shaped queries match unrelated entries, and keyword filters do not help. Install only when it is genuinely absent.
2. **Credential — can the tool actually reach the environment?** When the tools are present, call `auth(action="status")` and require `auth_status: "READY"` plus the expected `current_env_id` before any cloud write. Anything else is a credential or binding problem, not a wiring problem.
3. **Session lifetime — when is a restart required?** Only after credentials change (first authorization, environment switch, key rotation); the running session caches the credential it started with. Enabling, disabling, or unbinding a connector does **not** require a new session — and unbinding does not revoke calls already flowing through an open session. To cut access immediately, close the session and rotate the credential.
4. **Triage instead of guessing.** No tool or `tool not found` → wiring. `auth` not READY → credential. READY but wrong `current_env_id` → binding. Network, signature, or permission errors → credential or gateway; reinstalling the connector will not help.

**Which call fixes which state.** The four cases above map to four different calls. Run the check; do not jump to a reinstall.

| State you observe | Call | Fixed looks like |
|---|---|---|
| No CloudBase MCP tool in this session's tool list | `list_installed_plugins(connectorName="cloudbase")`: `bound: true` → `reconnect_plugin(pluginName=<pluginName>)`; not listed → `search_plugins(type="connector", userIntent="cloudbase")` → `suggest_plugin_install(type="connector", pluginId1=<id>)` | a `cloudbase` tool appears in a new session |
| Tool present, `auth(action="status")` not `READY` | follow `next_step` in that response | `auth_status: "READY"` |
| `READY`, but `current_env_id` is not the target | `auth(action="set_env", envId=…)` | `current_env_id` matches |
| `SIGN_PARAM_INVALID`, `INVALID_ACCESS_TOKEN`, 403, 5xx | nothing on the connector side | report the code verbatim, stop |

Credentials live in `~/.config/.cloudbase/auth.json` (mode 600); `authSource` records how they were obtained, and a connector reads the same file through `login_by_api_key`. Do not write a key into `mcp.json`: that copy drifts from the CLI and the two disagree about which environment is current.

Fallback is not a workaround. If MCP tools are missing, configure them for the next session and use the `tcb` CLI now (`../cloudbase-cli/SKILL.md`). Do not use an application's data-plane SDK or API key to perform a control-plane operation (create tables, deploy, bind domains) — it fails with errors that point at the wrong cause, and the detour costs more than the fallback.

## Calling tools with mcporter

When this session has no native MCP tools, use mcporter. The command list and the auth examples live in `../cloudbase/references/mcp-setup.md`. Read that file before login, environment binding, or `manageEnv`.

Check whether the server is configured:

```bash
npx mcporter list | grep cloudbase
```

If it is missing, add a stdio server named `cloudbase` in `config/mcporter.json`:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "description": "CloudBase MCP",
      "lifecycle": "keep-alive"
    }
  }
}
```

Read the schema before the first call. `describe` without `--all-parameters` omits parameters.

```bash
npx mcporter describe cloudbase --all-parameters
npx mcporter list cloudbase --schema
```

Call a tool with `server.tool` and `key=value` arguments:

```bash
npx mcporter call cloudbase.queryEnv action=list --output json
```

Do not put a Secret ID, Secret Key, or environment ID into `mcporter.json`. Login stays on `cloudbase.auth` or `tcb login`, as written in `mcp-setup.md`.

## Environment

| Name | Effect |
|------|--------|
| `TCB_SITE` | `domestic` or `intl`. `ap-singapore` exists on both sites; a domestic Singapore environment must set `TCB_SITE=domestic`. |
| `TCB_REGION` | API region, such as `ap-shanghai` or `ap-singapore`. |
| `CLOUDBASE_MCP_CLOUD_MODE` or `MCP_CLOUD_MODE` | `true` disables local file and process tools for a self-hosted caller. |
| `CLOUDBASE_MCP_PLUGINS_ENABLED` / `CLOUDBASE_MCP_PLUGINS_DISABLED` | Comma-separated plugin names for a local server. |
| `enable_plugins` / `disable_plugins` | The same switch on a remote URL, comma-separated. |

Plugin names are the ones in `mcp/src/server.ts` (`env`, `database`, `functions`, `hosting`, `storage`, and the rest). A local server and a hosted remote server enable the same default set; turn one off for a given caller with `disable_plugins` on the remote URL or `CLOUDBASE_MCP_PLUGINS_DISABLED` on a local server.

## Contributing

Read `CONTRIBUTING.md` at the repo root. Fork, use a feature branch, and follow the commit types listed there (`feat`, `fix`, `docs`, and the rest). Install with corepack and `pnpm install`.

- A bug in MCP, a skill, or the CLI: open a pull request.
- The cloud platform, a permission, or the account: open an issue. Do not put an environment ID or a secret in the text.
- `prepareFeedback` only returns the new-issue page for the current site. Write the text in the chat. The user logs in and submits it.
- The user cannot or will not share the conversation: build the report first, following `references/issue-report.md`. It has two parts — the call chain (tools, arguments, error wording) and the intent review (plan vs actual, which source pulled you off, the first step that went wrong). Replace the customer's business values — table names, entities, data rows — and mark every field you could not observe as `unknown`.
