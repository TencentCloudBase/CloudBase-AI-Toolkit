# CloudBase plugin for Kimi Code / Kimi Work

Native CloudBase plugin package for Kimi hosts.

## Source model

`config/kimi-plugin/` is generated from shared plugin assets:

- **Shared content layer:** `plugin/cloudbase/`
  - `skills/`, `hooks/`, `mcp.json`, `commands/`, `agents/`, `assets/`
- **Kimi adaptation layer:** generated `kimi.plugin.json` and `hooks/kimi-hook-adapter.mjs`

Do not hand-maintain copied content in this directory. Edit shared assets in
`plugin/cloudbase/` and regenerate.

## Build and check

```bash
node scripts/build-kimi-plugin.mjs
node scripts/build-kimi-plugin.mjs --check
```

## Install

```text
/plugins install /absolute/path/to/CloudBase-MCP/config/kimi-plugin
```

Then run `/reload` or start a new session.
