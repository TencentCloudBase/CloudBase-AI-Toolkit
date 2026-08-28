# CloudBase MCP Setup Reference

## Preferred: Install CloudBase Plugin (global)

When the user asks to install CloudBase / the AI Toolkit / the plugin, **prefer the Open Plugin Spec CLI** over hand-writing MCP JSON. One install brings MCP + Skills + Hooks.

Default: `--scope user` (global).

```bash
npx plugins add TencentCloudBase/cloudbase-plugin -y --scope user

# Optional: Sites plugin
npx plugins add TencentCloudBase/cloudbase-sites-plugin -y --scope user
```

- Omit `--target` to install into all detected supported AI IDEs.
- After install, ask the user to restart / reload the target tool (e.g. Claude Code `/reload-plugins`).

### Supported `npx plugins` targets (`--target`)

List live detection with `npx plugins targets`. Current supported target IDs:

| Target ID (`--target`) | AI IDE | Notes |
|------------------------|--------|--------|
| `claude-code` | Claude Code | Config under `~/.claude` |
| `cursor` | Cursor | Config under `~/.cursor` |
| `codex` | Codex | Config under `~/.codex` |
| `grok` | Grok Build | Config under `~/.grok`; per-user only |
| `kimi` | Kimi Code | Config under `~/.kimi-code`; per-user only |
| `github-copilot` | GitHub Copilot CLI | Config under `~/.copilot`; standalone `copilot` CLI, not `gh copilot` |
| `vscode` | Visual Studio Code | Agent plugins (Preview); per-user only |

Examples:

```bash
npx plugins add TencentCloudBase/cloudbase-plugin -y --scope user --target cursor

npx plugins targets
```

**Not supported by `npx plugins` yet** (use each product's native path): CodeBuddy, WorkBuddy, Kimi Code, Kimi Work, ZCode, WindSurf, and other IDEs without Open Plugin Spec. For those, use Approach A (native MCP) or Approach B (mcporter) below, plus Skills if needed.

**Do not double-install:** if Claude Code / Codex already has the plugin via marketplace (`claude plugin install` / `codex plugin add`), do **not** also run `npx plugins add` for the same tool.

---

## Approach A: IDE Native MCP

Configure via your IDE's MCP settings when Plugin install is unavailable:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

**Config file locations:**

- **Cursor**: `.cursor/mcp.json`
- **Claude Code**: `.mcp.json`
- **Windsurf**: `~/.codeium/windsurf/mcp_config.json` (user-level, no project-level JSON config)
- **Cline**: Check Cline settings for project-level MCP configuration file location
- **GitHub Copilot Chat (VS Code)**: Check VS Code settings for MCP configuration file location
- **Continue**: Uses YAML format in `.continue/mcpServers/` folder:
  ```yaml
  name: CloudBase MCP
  version: 1.0.0
  schema: v1
  mcpServers:
    - uses: stdio
      command: npx
      args: ["@cloudbase/cloudbase-mcp@latest"]
  ```

---

## Approach B: mcporter CLI

When your IDE does not support native MCP or Plugin install, use **mcporter** as the CLI.

**Step 1 — Check**: `npx mcporter list | grep cloudbase`

**Step 2 — Configure** (if not found): create `config/mcporter.json` in the project root:
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

**Step 3 — Verify**: `npx mcporter describe cloudbase`

---

## Quick Start (mcporter CLI)

- `npx mcporter list` — list configured servers
- **Required:** `npx mcporter describe cloudbase --all-parameters` — inspect CloudBase server config and get full tool schemas with all parameters (⚠️ **必须加 `--all-parameters` 才能获取完整参数信息**)
- `npx mcporter list cloudbase --schema` — get full JSON schema for all CloudBase tools
- `npx mcporter call cloudbase.help --output json` — discover available CloudBase tools and their schemas
- `npx mcporter call cloudbase.<tool> key=value` — call a CloudBase tool

---

## Call Examples (CloudBase auth)

- Check auth & env status:
  `npx mcporter call cloudbase.auth action=status --output json`
- Start device-flow login:
  `npx mcporter call cloudbase.auth action=start_auth authMode=device --output json`
- Resolve env alias to full EnvId:
  `npx mcporter call cloudbase.envQuery action=list alias=demo aliasExact=true fields='["EnvId","Alias","Status","IsDefault"]' --output json`
- Bind environment after login:
  `npx mcporter call cloudbase.auth action=set_env envId=<full-env-id> --output json`
- Query app-side login config:
  `npx mcporter call cloudbase.queryAppAuth action=getLoginConfig --output json`
- Patch app-side login strategy:
  `npx mcporter call cloudbase.manageAppAuth action=patchLoginStrategy patch='{"usernamePassword":true}' --output json`
- Query publishable key:
  `npx mcporter call cloudbase.queryAppAuth action=getPublishableKey --output json`

---

## Environment Management Tools (manageEnv + auth + envQuery)

Beyond authentication, CloudBase MCP provides several environment management tools.

### manageEnv — Full environment lifecycle

Query available plans, create environments, change plans, and renew:

- **List available packages**:
  `npx mcporter call cloudbase.manageEnv action=listPackages --output json`

- **Create a new environment**:
  ```
  npx mcporter call cloudbase.manageEnv action=create alias=my-env packageId=baas_personal resources='["flexdb","storage","function","postgresql"]' duration=1 confirm=yes --output json
  ```

  Resources parameter values: `flexdb` (document database), `storage` (cloud storage), `function` (cloud functions), `postgresql` (PostgreSQL database).
  Do **not** pass `region`: CreateEnv does not accept Region; environment region is determined by account/package.

- **Change plan** (e.g. upgrade to standard):
  `npx mcporter call cloudbase.manageEnv action=modifyPlan envId=<envId> packageId=baas_pf_standard confirm=yes --output json`

- **Renew environment**:
  `npx mcporter call cloudbase.manageEnv action=renew envId=<envId> duration=12 confirm=yes --output json`

### Auth — Environment binding & logout

- **Check status** (shows env candidates when multiple environments exist):
  `npx mcporter call cloudbase.auth action=status --output json`

- **Bind to a specific environment** (after login):
  `npx mcporter call cloudbase.auth action=set_env envId=<full-env-id> --output json`

- **Logout** (clears login state and cached env binding):
  `npx mcporter call cloudbase.auth action=logout confirm=yes --output json`

### envQuery — Query environment details

- **List all environments**:
  `npx mcporter call cloudbase.envQuery action=list --output json`

- **Get environment info** (runtime backends, storage, status):
  `npx mcporter call cloudbase.envQuery action=info envId=<envId> --output json`

- **Resolve alias to EnvId**:
  `npx mcporter call cloudbase.envQuery action=list alias=demo aliasExact=true fields='["EnvId","Alias","Status","IsDefault"]' --output json`

---

## No npm / npx

If `npm` / `npx` are missing, do **not** keep retrying `npx plugins` / `npx mcporter`:

1. Ask the user to install **Node.js LTS** (https://nodejs.org, or `brew install node` / `winget install OpenJS.NodeJS.LTS` / nvm / fnm), then re-check `node -v` and `npm -v`.
2. Meanwhile, prefer **IDE native plugin / marketplace / MCP UI** paths above (no hand-run `npx`), or Approach A hand-written MCP config once Node exists.
3. For login/deploy in this session without MCP tools, follow `tooling-fallback.md` (CLI via `cloudbase-cli` domain skills). Full decision tree includes the npm-missing branch.

## Important Rules

- **When MCP tools are available in this session**, prefer them for manage/deploy, and understand tool details first. Before calling any CloudBase MCP tool, run `npx mcporter describe cloudbase --all-parameters` (or `ToolSearch` in IDE) to inspect available tools and their parameters.
- **When MCP is not configured or tools are not yet loaded** (common on first session, or right after install before restart): complete the MCP setup steps above for the **next** session, then use `tcb` CLI for login/manage now. Follow `tooling-fallback.md` and the `cloudbase-cli` skill (domain references — **not** `tcb deploy`). Do not block the user waiting for a restart.
- You **do not need to hard-code Secret ID / Secret Key / Env ID** in the config. Prefer device-code login via MCP `auth` or `tcb login` instead of storing long-lived secrets in MCP JSON.
- When the environment identifier in the conversation is an alias, nickname, or other short form, **do not pass it directly** to `auth.set_env`, SDK init, console URLs, or generated config files. First resolve it to the canonical full `EnvId` with `envQuery(action=list, alias=..., aliasExact=true)` when MCP is available; with CLI, confirm the full envId with the user (or `tcb env list` as a fallback) before `tcb env use`. If multiple environments match or no exact alias exists, stop and clarify with the user.
- Verify MCP availability with `npx mcporter list | grep cloudbase` or the IDE's MCP panel (skip the `npx` check when npm/npx is absent — use the IDE panel / native plugin instead). Missing MCP is a signal to **set up MCP + fall back to CLI**, not to stop the task.
