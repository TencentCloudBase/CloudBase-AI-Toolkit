# CloudBase WorkBuddy Template Prewarm

SessionStart hook that **pre-downloads** the official CloudBase React (or Vue)
template zip, runs `pnpm`/`npm install`, then starts **Sites-aligned preview**
(`cloudbase-sites preview`, ports **17173..17272**) in the background while the
user finishes sre-aihub credentials / connector Trust.

> Status: **marketplace-ready** (v0.2.1). Install via the CloudBase marketplace;
> do **not** hand-merge absolute-path settings snippets on partner machines.

## One-click install (recommended)

### WorkBuddy / CodeBuddy

```bash
# Add marketplace once (sparse keeps clone small)
# UI: /plugin marketplace add TencentCloudBase/CloudBase-MCP
# CLI equivalent:
codebuddy plugin marketplace add TencentCloudBase/CloudBase-MCP

# Install + enable (hooks/hooks.json auto-merges with user settings)
codebuddy plugin install workbuddy-template-prewarm@tencent-cloudbase
```

WorkBuddy UI: **Plugins → add marketplace `TencentCloudBase/CloudBase-MCP` →
install `workbuddy-template-prewarm`**.

This plugin declares a soft dependency on `cloudbase-sites` (same marketplace).
Hosts that support plugin `dependencies` will auto-install it. Preview still
works without enabling full Sites hooks because a **vendored** Sites CLI ships
under `vendor/cloudbase-sites/`.

### Claude Code

```text
/plugin marketplace add TencentCloudBase/CloudBase-MCP
/plugin install workbuddy-template-prewarm@tencent-cloudbase
```

### Verify

1. Start a new WorkBuddy session in an **empty** project directory.
2. While guiding credentials, check:
   - `<cwd>/.cloudbase-prewarm/state.json` → `status: ready`
   - `<cwd>/.cloudbase-sites/preview.json` → `internalUrl` (ports 17173..17272)
3. Confirm existing **teamai** SessionStart hooks still run (plugin hooks stack;
   they do not replace `~/.workbuddy/settings.json`).

## Coexistence with teamai SessionStart

| Source | How it registers | Interaction |
| --- | --- | --- |
| teamai | `~/.workbuddy/settings.json` → `teamai hook-dispatch session-start` | Keep as-is |
| This plugin | `hooks/hooks.json` via marketplace enable | **Stacks in parallel** |
| Legacy snippet | Manual APPEND to settings | Offline fallback only |

**Do not** replace the whole `hooks` object in settings. Plugin enablement never
requires deleting teamai entries. Opt out of this plugin with
`CLOUDBASE_WORKBUDDY_PREWARM=0` or by disabling the plugin in the host UI.

## Why

XDF WorkBuddy latency analysis showed ~6–10 minutes of human-gated credential
dead time before coding. Template fetch does **not** need CloudBase credentials
(HTTPS to `static.cloudbase.net`), so it can overlap that wait. Preview port
management is automated via the Sites preview CLI (vendored or dependency).

## Host capability

| Capability | Evidence |
| --- | --- |
| SessionStart hooks | https://www.workbuddy.ai/docs/cli/hooks |
| Plugin hooks merge | Plugin `hooks/hooks.json` stacks with settings; not gated by `allowUntrustedFrontmatterHooks` |
| `${CODEBUDDY_PLUGIN_ROOT}` | https://www.workbuddy.ai/docs/cli/plugins-reference |
| Background work | Hook timeout ~20–30s → heavy work via `nohup` |

## Layout

```text
plugin/workbuddy-template-prewarm/
  .claude-plugin/plugin.json      # Claude marketplace metadata + dependencies
  .codebuddy-plugin/plugin.json   # CodeBuddy / WorkBuddy priority metadata
  .workbuddy-plugin/plugin.json
  .plugin/plugin.json             # Open Plugin Spec
  .cursor-plugin/plugin.json
  hooks/hooks.json                # SessionStart (PLUGIN_ROOT — no absolute paths)
  hooks/on-session-start.sh
  hooks/prewarm.mjs
  vendor/cloudbase-sites/         # Vendored preview CLI (bin + lib)
  scripts/sync-sites-vendor.sh
  scripts/render-settings.sh      # Offline settings fallback only
  settings.snippet.json           # Placeholder; prefer plugin install
  README.md
```

## Behavior

1. SessionStart (`startup` / `clear`)
2. If cwd empty-enough → background: cache zip → extract → **strip oversized rule files (>40 KiB)** → install → preview
3. If Vite project missing `node_modules` → background install → preview
4. If Vite already installed → background `--preview-only`
5. Else skip (do not overwrite foreign trees)
6. Always inject compact BaaS-first + **never guess port** rules via `additionalContext`

State file: `<cwd>/.cloudbase-prewarm/state.json`  
Preview file: `<cwd>/.cloudbase-sites/preview.json`  
Zip cache: `~/.cloudbase/cache/templates/web-cloudbase-{react|vue}-template.zip`  
Log: `~/.cloudbase/logs/workbuddy-prewarm-session-start.log`

### Env knobs

| Env | Default | Meaning |
| --- | --- | --- |
| `CLOUDBASE_WORKBUDDY_PREWARM` | `1` | Set `0` to disable entire hook body |
| `CLOUDBASE_WORKBUDDY_TEMPLATE` | `react` | `react` \| `vue` |
| `CLOUDBASE_WORKBUDDY_PREVIEW` | `1` | Set `0` to skip Sites preview start |
| `CLOUDBASE_WORKBUDDY_STRIP_RULES` | `1` | Set `0` to keep oversized template `AGENTS.md` / `CLAUDE.md` as-is |
| `CLOUDBASE_SITES_BIN` | auto | Absolute path to `cloudbase-sites` CLI |

Sites bin resolution order: `CLOUDBASE_SITES_BIN` →
`vendor/cloudbase-sites/bin/cloudbase-sites` → sibling
`plugin/cloudbase-sites` → host plugin caches → `PATH`.

## Offline / legacy settings merge

Only if marketplace install is unavailable:

```bash
bash plugin/workbuddy-template-prewarm/scripts/render-settings.sh --merge
# APPEND the rendered SessionStart entry into ~/.workbuddy/settings.json
# Keep teamai entries. Never commit machine-absolute paths into the snippet source.
```

## Dry-run without WorkBuddy

```bash
TMP=$(mktemp -d)
node plugin/workbuddy-template-prewarm/hooks/prewarm.mjs --cwd "$TMP" --fg --start-preview
node plugin/workbuddy-template-prewarm/hooks/prewarm.mjs --status --cwd "$TMP"
printf '%s' "{\"cwd\":\"$TMP\",\"hook_event_name\":\"SessionStart\",\"source\":\"startup\"}" \
  | bash plugin/workbuddy-template-prewarm/hooks/on-session-start.sh
```

## Relationship to Sites

| | Full `cloudbase-sites` plugin | This plugin |
| --- | --- | --- |
| Empty-dir init | Passive unless `CLOUDBASE_SITES_AUTO_INIT=1` | Aggressive when enabled |
| Preview supervisor | Yes | Yes — vendored or dependency CLI |
| Save / deploy / versions | Full Sites verbs | Not included (install Sites for those) |
| BaaS-first rules | Full RULES_BLOCK | Compact subset + `minimal-web-baas-demo` |
| WorkBuddy enablement | Optional complementary | Primary for XDF credential-wait demos |

## Partner pack

`plugin/xdf-workbuddy-expert-pack` adds the BaaS expert prompt + skill pointer.
Enable **this** plugin first for SessionStart prewarm; paste the expert agent
markdown separately. Do **not** put SessionStart in Agent frontmatter.

## Notes

- Official React/Vue template zips historically shipped `AGENTS.md`/`CLAUDE.md`/
  `CODEBUDDY.md` (~41KB). WorkBuddy rejects rule files over **40 KiB**
  (`Rule file exceeds maximum size`). Upstream compat guide
  (`config/source/editor-config/guides/cloudbase-rules.mdc`) is now a compact
  routing projection (**must stay under 40 KiB**; enforced in
  `build-compat-config.mjs`). After extract, prewarm still replaces any
  oversized entrypoints (`AGENTS.md`, `CLAUDE.md`, `CODEBUDDY.md`,
  `.augment-guidelines`, `cloudbase-rules.mdc`) with a compact stub and records
  them in `.cloudbase-prewarm/state.json` → `strippedRules` (belt-and-suspenders
  for stale CDN caches). Opt out with `CLOUDBASE_WORKBUDDY_STRIP_RULES=0`.
  Compact BaaS rules still come from SessionStart `additionalContext`.
- Refresh vendored Sites CLI after Sites changes:
  `bash plugin/workbuddy-template-prewarm/scripts/sync-sites-vendor.sh`
