# CloudBase Sites Plugin (beta)

CloudBase Sites packages the shared CloudBase site runtime for Claude Code,
CodeBuddy, and Codex.

> Powered by [Tencent CloudBase](https://cloudbase.net).

## What this plugin provides

- **CLI (`cloudbase-sites`)** — Bootstrap, preview, save, deploy, rollback, and
  inspect Vite-based React or Vue web apps.
- **Runtime hooks** — Auto-start dev server on session start; restart on
  config file changes.
- **Skills** — The `cloudbase-sites-runtime` skill orchestrates the full
  vibe-coding session.

## One-click install (recommended)

Install via the dedicated plugin repository (Open Plugin Spec):

```bash
npx plugins add TencentCloudBase/cloudbase-sites-plugin
```

This works with Claude Code, Cursor, Codex, and other hosts that support the
[Open Plugin Specification](https://open-plugins.com/plugin-builders/specification).
The dedicated repo is auto-synced from this directory (without `marketplace.json`).

## Quick start per host

Use these host-native marketplace flows when you prefer IDE-specific install
paths instead of `npx plugins add`.

### Codex

Add the CloudBase marketplace, then install the plugin:

```bash
# Add the marketplace (do this once)
codex plugin marketplace add TencentCloudBase/CloudBase-MCP --ref main --name cloudbase-plugins

# Install the sites plugin
codex plugin add cloudbase-sites@cloudbase-plugins
```

Verify the marketplace is active:

```bash
codex plugin list --marketplace cloudbase-plugins
```

To update the plugin, upgrade the marketplace:

```bash
codex plugin marketplace upgrade cloudbase-plugins
```

### Claude Code

Claude Code also supports plugin marketplaces. Add this repository as a
marketplace, then install the Sites plugin:

```bash
# Interactive command inside Claude Code
/plugin marketplace add TencentCloudBase/CloudBase-MCP
/plugin install cloudbase-sites@tencent-cloudbase
```

For non-interactive setup:

```bash
claude plugin marketplace add TencentCloudBase/CloudBase-MCP
claude plugin install cloudbase-sites@tencent-cloudbase
```

Claude Code reads the marketplace from `.claude-plugin/marketplace.json`.

### OpenClaw

Add the MCP server to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "cloudbase-mcp": {
      "command": "npx",
      "args": ["-y", "@cloudbase/cloudbase-mcp@latest"],
      "env": {}
    }
  }
}
```

### CodeBuddy

CodeBuddy picks up the `.claude-plugin/plugin.json` manifest. See
[`doc/ide-setup/`](../../doc/ide-setup/) for installation.

## Testing the full lifecycle

After installing, test the complete save/deploy/rollback flow:

```bash
# Bootstrap a new project
plugin/cloudbase-sites/bin/cloudbase-sites init --start

# Save a version checkpoint
plugin/cloudbase-sites/bin/cloudbase-sites save

# Deploy the saved version to CloudBase
plugin/cloudbase-sites/bin/cloudbase-sites deploy

# Roll back to a previous version
plugin/cloudbase-sites/bin/cloudbase-sites rollback

# List version history
plugin/cloudbase-sites/bin/cloudbase-sites versions
```

Installed hosts may expose `cloudbase-sites` directly on PATH. When they do
not, use the plugin binary path shown above or the absolute path injected by
the SessionStart hook.

The SessionStart hook is passive in empty directories by default: it injects
the right command but does not download a template or start a dev server. A
UserPromptSubmit hook then watches for explicit site-building intent in Chinese
or English (for example "帮我做个官网" or "build a React dashboard website") and
starts `init --start` only for empty-enough directories. Set
`CLOUDBASE_SITES_AUTO_INIT=1` before starting the host session only if you
intentionally want automatic empty-folder scaffolding without waiting for the
first prompt.

Run the focused regression tests:

```bash
cd mcp
node_modules/.bin/vitest run --config vitest.config.js ../tests/cloudbase-sites-plugin.test.js
```

## Relationship with Tencent CloudBase (`plugin/cloudbase`)

| | **CloudBase Sites** (this plugin) | **Tencent CloudBase** (`plugin/cloudbase`) |
|---|---|---|
| Purpose | Vite-based site creation, preview, versioning, deploy | Platform capabilities: AI, auth, DB, functions, storage |
| Skills | Single runtime orchestration skill | 26+ granular skills from `TencentCloudBase/skills` |
| CLI | `cloudbase-sites` binary for preview/save/deploy | None (uses `cloudbase-mcp` tools) |
| Use case | Bootstrap, preview, and ship Vite web apps | Add CloudBase to any project |

Use both plugins together: **CloudBase Sites** handles the site lifecycle
(create, preview, deploy, rollback) while **Tencent CloudBase** provides
platform services (auth, database, functions, AI models, storage).

## Runtime state

Project-local runtime state is stored in `<project>/.cloudbase-sites/`.
Machine-level supervisor state is stored in `~/.cloudbase-sites/`.

These paths are runtime-only and should not be committed.
