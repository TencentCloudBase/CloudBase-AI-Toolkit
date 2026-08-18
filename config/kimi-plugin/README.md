# CloudBase plugin for Kimi Code / Kimi Work

Native CloudBase plugin for **Kimi Code 0.34.0** and **Kimi Work**. Plugin
format is Beta (captured 2026-08-18).

This directory is independent of `config/codebuddy-plugin/` and
`plugin/cloudbase/`. Do not edit those trees for Kimi changes.

## Format decision

Two manifests ship side by side on purpose:

| File | Host | What it does |
|------|------|----------------|
| **`kimi.plugin.json`** (primary) | Kimi Code 0.34.0 / Kimi Work | Open Plugin Spec style. Installs via `/plugins install`. Exposes CloudBase through `mcpServers` (same pattern as official `kimi-cu`). |
| **`plugin.json`** (compat) | Official kimi-cli (Python, docs at moonshotai.github.io) | `tools[]` with `command` + JSON Schema. Four `tcb` wrappers. |

Kimi Code 0.34.0 **ignores** `tools`, `inject`, and `configFile` (they show up as
diagnostics). Putting `tools[]` into `kimi.plugin.json` would not make the AI
call them. Full CloudBase capability on 0.34.0 comes from MCP.

`inject` is **not** used: it injects Kimi LLM `api_key` / `base_url`, not
Tencent Cloud credentials. CloudBase auth is `tcb login` or a CloudBase API Key.

Official docs still say plugins suit thin script wrappers and MCP suits
long-running services. CloudBase is the latter, so this plugin **wraps MCP**
and only keeps four CLI tools for the kimi-cli Beta contract.

## Install (Kimi Code 0.34.0 / Kimi Work)

`kimi plugin` is **not** a CLI subcommand on 0.34.0. Install from the TUI:

```text
/plugins install /absolute/path/to/CloudBase-MCP/config/kimi-plugin
```

Then `/reload` or start a new session. The managed copy lands in:

```text
~/.kimi-code/plugins/managed/cloudbase/
```

Verify:

```text
/plugins list
/plugins info cloudbase
```

Ask: `检查 CloudBase 工具是否可用` or `登录云开发`.

### Git / zip (same slash command)

```text
/plugins install https://github.com/TencentCloudBase/CloudBase-MCP.git/config/kimi-plugin
```

Pin a branch with the GitHub tree URL form documented by Kimi Code.

## Install (official kimi-cli, if `kimi plugin` exists)

Older kimi-cli builds document:

```bash
kimi plugin install /absolute/path/to/CloudBase-MCP/config/kimi-plugin
kimi plugin list
kimi plugin info cloudbase
```

That path loads `plugin.json` `tools[]` and runs `scripts/run-tool.mjs`.
Requires `@cloudbase/cli` (`tcb`) on PATH and `tcb login`.

## Plugin vs MCP vs OPS

| Path | When to use |
|------|-------------|
| **This plugin** (`kimi.plugin.json` + MCP) | Recommended for Kimi Code / Kimi Work. Skills + MCP in one install. |
| **Manual MCP** `~/.kimi-code/mcp.json` | Fallback. Parent task 91daac76 will add `files/kimi.mcp.json` + template download. |
| **`npx plugins add --target kimi`** | Open Plugin Spec install into `~/.kimi-code`. Different packaging (`plugin/cloudbase`). Do not mix with this native plugin on the same host without checking for duplicate MCP servers. |

## Tools in `plugin.json`

| Tool | Engine / command |
|------|------------------|
| `query_database` | `postgresql` / `mysql` → `tcb db execute`; `nosql` → `tcb db model list` |
| `list_functions` | `tcb fn list --json` |
| `list_storage` | `tcb storage list --json` |
| `list_cloudrun` | `tcb cloudrun list --json` |

Stdin example:

```bash
printf '{"engine":"postgresql","sql":"SELECT 1"}' | node scripts/run-tool.mjs query_database
```

## Prerequisites

- Node.js 18.15+
- Kimi Code ≥ 0.34.0 (or kimi-cli with `kimi plugin`)
- CloudBase environment + `tcb login` (or CloudBase API Key)

## Out of scope here

Manual `kimi.mcp.json` machine targets, `setup.ts` IDE enum, and natural-language
install prompts belong to parent task 91daac76.
