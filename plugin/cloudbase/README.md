# Tencent CloudBase Plugin

The universal Tencent CloudBase plugin — gives AI coding agents direct access to
CloudBase platform capabilities: AI models, authentication, NoSQL/MySQL
databases, cloud functions, cloud storage, CloudRun backend services, WeChat
Mini Program integration, and more.

## What this plugin provides

- **Skills** — Granular, scenario-driven skill files (synced from
  [`TencentCloudBase/skills`](https://github.com/TencentCloudBase/skills)) that
  activate when your project needs database operations, authentication setup,
  cloud function deployment, AI model integration, or Mini Program development.
- **MCP server** — The `cloudbase-mcp` server exposes tools for environment
  management, data operations, function deployment, and platform config.

The `skills/` directory is a **generated artifact** — do not edit files in it
directly. They are synced from `TencentCloudBase/skills@main` via
`scripts/sync-cloudbase-plugin-skills.mjs`.

## Quick start per host

### Codex

Add the CloudBase marketplace, then install the plugin:

```bash
# Add the marketplace (do this once)
codex plugin marketplace add TencentCloudBase/cloudbase-mcp --ref main --name cloudbase-plugins

# Install plugins from the marketplace
codex plugin add cloudbase@cloudbase-plugins
```

Verify the marketplace is active:

```bash
codex plugin list --marketplace cloudbase-plugins
```

To update the plugin when new skills are released, upgrade the marketplace:

```bash
codex plugin marketplace upgrade cloudbase-plugins
```

### Claude Code

Claude Code also supports plugin marketplaces. Add this repository as a
marketplace, then install the plugin:

```bash
# Interactive command inside Claude Code
/plugin marketplace add TencentCloudBase/cloudbase-mcp
/plugin install cloudbase@tencent-cloudbase
```

For non-interactive setup:

```bash
claude plugin marketplace add TencentCloudBase/cloudbase-mcp
claude plugin install cloudbase@tencent-cloudbase
```

Claude Code reads the marketplace from `.claude-plugin/marketplace.json`.

### OpenClaw

Add the cloudbase MCP server to your project:

```json
// .mcp.json (project root) or ~/.mcp.json (global)
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["npm-global-exec@latest", "@cloudbase/cloudbase-mcp@latest"],
      "env": { "INTEGRATION_IDE": "Claude" }
    }
  }
}
```

For granular skill activation, skills are available under
`plugin/cloudbase/skills/` in the
[cloudbase-mcp repository](https://github.com/TencentCloudBase/cloudbase-mcp).
Copy the ones you need into your project's `.claude/skills/` directory.

### Gemini CLI

Install via the CloudBase GitHub repository:

```bash
# Clone and link the extension
git clone https://github.com/TencentCloudBase/cloudbase-mcp
gemini extensions link "$(pwd)/cloudbase-mcp/plugin/cloudbase"
```

The extension auto-discovers skills from `skills/` and registers the `cloudbase`
MCP server via `gemini-extension.json`.

### OpenCode

Add to your OpenCode config:

```json
// .opencode.json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["npm-global-exec@latest", "@cloudbase/cloudbase-mcp@latest"],
      "env": { "INTEGRATION_IDE": "OpenCode" }
    }
  }
}
```

### CodeBuddy

CodeBuddy uses the `config/codebuddy-plugin/` packaging in this repository —
an all-in-one skill bundle derived from the same source skills in
`config/source/skills/`. The `plugin/cloudbase/skills/` directory provides the
same content in Codex-compatible granular form.

To install in CodeBuddy, follow the setup instructions in
[`doc/ide-setup/`](../../doc/ide-setup/) or run the MCP Setup tool in
CodeBuddy Code.

## Relationship with CloudBase Sites

| | **Tencent CloudBase** (this plugin) | **CloudBase Sites** (`plugin/cloudbase-sites`) |
|---|---|---|
| Purpose | Platform capabilities: AI, auth, DB, functions, storage | Vite-based site creation, preview, versioning, deploy |
| Skills | 26+ granular skills from `TencentCloudBase/skills` | Single runtime orchestration skill |
| CLI | None (uses `cloudbase-mcp` tools) | `cloudbase-sites` binary for preview/save/deploy |
| Use case | Add CloudBase to any project | Bootstrap, preview, and ship Vite web apps |

The two plugins complement each other: use **CloudBase Sites** for the
site lifecycle (create, preview, deploy, rollback) and **Tencent CloudBase**
for everything else (auth, database, functions, AI models, storage).

## Updating skills

Skills are auto-synced from `TencentCloudBase/skills@main`. To update
manually:

```bash
node scripts/sync-cloudbase-plugin-skills.mjs
```

Check for drift without modifying:

```bash
node scripts/sync-cloudbase-plugin-skills.mjs --check
```

A CI workflow runs the sync on schedule and commits changes automatically.
