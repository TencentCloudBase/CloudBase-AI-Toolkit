# CloudBase MCP Setup Reference

## Approach A: IDE Native MCP

Configure via your IDE's MCP settings:

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

When your IDE does not support native MCP, use **mcporter** as the CLI.

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
