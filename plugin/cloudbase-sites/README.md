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
# Add the marketplace (do this once; sparse avoids full-repo clone)
codex plugin marketplace add TencentCloudBase/CloudBase-MCP --ref main \
  --sparse .agents/plugins \
  --sparse plugin

# Install the sites plugin
codex plugin add cloudbase-sites@tencent-cloudbase
```

Verify the marketplace is active:

```bash
codex plugin list --marketplace tencent-cloudbase
```

To update the plugin, upgrade the marketplace:

```bash
codex plugin marketplace upgrade tencent-cloudbase
```

Codex prefers `.agents/plugins/marketplace.json` (falls back to
`.claude-plugin/marketplace.json`). Sparse must include both paths;
`plugin` alone is not enough.

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
      "args": ["-y", "@cloudbase/npm-launcher@1.1.0", "@cloudbase/cloudbase-mcp@latest"],
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

## Dev-server bind address

The preview dev server serves your project source with no authentication, so it
listens on `127.0.0.1` (this machine only) by default. Every URL the plugin
prints is that loopback URL.

To reach the preview from another device — a phone, another laptop, a container
host — opt in explicitly:

```bash
cloudbase-sites preview --restart --host 0.0.0.0   # all interfaces
CLOUDBASE_SITES_HOST=0.0.0.0 cloudbase-sites preview --restart   # change the default
```

Remote and container hosts (`REMOTE_CONTAINERS`, `CODESPACES`,
`GITPOD_WORKSPACE_ID`, `CLAUDE_CODE_REMOTE`, `CLOUDBASE_SITES_REMOTE`) opt in
automatically, because a loopback-only bind is unreachable through their port
forward. In every exposed case the CLI prints a warning with the reachable
URLs, `preview --status` reports `exposed: true` and `networkUrls`, and the
SessionStart context tells the assistant to say so instead of calling the
preview local-only.

Exposure lasts for the current dev-server process: a restart or a new session
goes back to loopback unless `CLOUDBASE_SITES_HOST` (or a remote-host env var)
says otherwise. That keeps a forgotten `--host 0.0.0.0` from outliving the
reason you passed it.

Only bind beyond loopback on a network you trust: anyone who can reach the port
can read the project.

## Installing project dependencies

Opening a session in a Vite project whose `node_modules` is missing does not
install anything. Installing runs the dependency tree's own install scripts, so
it waits for you: the hook reports that dependencies are missing, and the
assistant asks before running `pnpm install` (falling back to `npm install`).

Set `CLOUDBASE_SITES_AUTO_INSTALL=1` before starting the session if you want the
hook to install and start the preview on its own, as it does for a template that
`init --start` created itself.

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
