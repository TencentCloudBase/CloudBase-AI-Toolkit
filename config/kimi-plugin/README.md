# CloudBase plugin for Kimi Code / Kimi Work

Native CloudBase plugin for **Kimi Code 0.34.0** and **Kimi Work**. Plugin
format is Beta (captured 2026-08-18).

This directory is independent of `config/codebuddy-plugin/` and
`plugin/cloudbase/`. Do not edit those trees for Kimi-only packaging changes.

## Shape (Claude Code plugin equivalent)

Kimi Code 0.34.0 reads `kimi.plugin.json` and ignores `tools`, `inject`, and
`configFile`. This plugin therefore wraps:

| Piece | Where |
|------|--------|
| **MCP** | `mcpServers.cloudbase` → `npx -y @cloudbase/cloudbase-mcp@latest` |
| **Skills** | `./skills/` — one Kimi routing skill (see reuse note below) |
| **Hooks** | `hooks[]` — PreToolUse Bash safety + UserPromptSubmit CloudBase context |
| **Session start** | `sessionStart.skill = "cloudbase"` |

There is **no** sibling `plugin.json` / `tools[]` CLI wrapper. Full CloudBase
capability (databases, functions, storage, CloudRun, Auth, hosting) comes from
MCP, not from four `tcb` shims.

`inject` is **not** used: it injects Kimi LLM `api_key` / `base_url`, not
Tencent Cloud credentials. CloudBase auth is `tcb login` or a CloudBase API Key.

`interface.iconUrl` is an HTTPS URL (same pattern as official `kimi-cu`).
Relative logo paths are not documented. The file itself lives at
`plugin/cloudbase/assets/logo.png` in this repo.

## Skills reuse (do not copy a third catalog)

Kimi requires every `skills` path to stay **inside the plugin root after
symlink resolution**, and `/plugins install` copies the directory into
`~/.kimi-code/plugins/managed/`. Therefore:

- **No `../plugin/cloudbase/skills`** — rejected as outside the plugin root.
- **No symlink to the Claude catalog** — resolves outside the plugin root,
  and the managed copy would dangle.
- **No build-time clone of the full Claude / CodeBuddy skill trees** — that
  would be a third physical copy of the same catalog.

This plugin ships one **host-specific routing skill**. Domain skill bodies stay
in `plugin/cloudbase/skills/` (Claude) and `config/source/skills/` (semantic
source). Agents fetch them via MCP
`searchKnowledgeBase(mode=skill, skillName="...")`.

If Kimi later needs an offline full catalog, add a dedicated sync script then —
do not copy the tree by hand.

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

## Plugin vs MCP vs OPS

| Path | When to use |
|------|-------------|
| **This plugin** (`kimi.plugin.json` + MCP + skills + hooks) | Recommended for Kimi Code / Kimi Work. One install. |
| **Manual MCP** `~/.kimi-code/mcp.json` | Fallback. Parent task 91daac76 will add `files/kimi.mcp.json` + template download. |
| **`npx plugins add --target kimi`** | Open Plugin Spec install into `~/.kimi-code`. Different packaging (`plugin/cloudbase`). Do not mix with this native plugin on the same host without checking for duplicate MCP servers. |

## Prerequisites

- Node.js 18.15+
- Kimi Code ≥ 0.34.0
- CloudBase environment + `tcb login` (or CloudBase API Key)

## Out of scope here

Manual `kimi.mcp.json` machine targets, `setup.ts` IDE enum, and natural-language
install prompts belong to parent task 91daac76.
