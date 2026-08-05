# WorkBuddy template prewarm (+ Sites-aligned preview)

SessionStart hook that **pre-downloads** the official CloudBase React (or Vue)
template zip, runs `pnpm`/`npm install`, then starts **Sites-aligned preview**
(`cloudbase-sites preview`, ports **17173..17272**) in the background while the
user finishes sre-aihub credentials / connector Trust.

> Status: **spike / experimental**. Not a published marketplace plugin yet.
> Preview automation reuses sibling `plugin/cloudbase-sites` — it does **not**
> enable the full Sites SessionStart (save/deploy/supervisor) by default.

## Why

XDF WorkBuddy latency analysis showed ~6–10 minutes of human-gated credential
dead time before coding. Template fetch does **not** need CloudBase credentials
(HTTPS to `static.cloudbase.net`), so it can overlap that wait. Preview port
management used to be Prompt-only (`npm run dev` / guess 5173); that is now
automated via the Sites preview CLI.

## Host capability (verified)

| Capability | Evidence |
| --- | --- |
| SessionStart hooks | Official docs: https://www.workbuddy.ai/docs/cli/hooks |
| Live SessionStart on this machine | `~/.workbuddy/settings.json` already runs `teamai hook-dispatch session-start` |
| `additionalContext` injection | Same SessionStart decision-control schema as CodeBuddy/Claude Code |
| Background work | Hook default timeout ~20–30s → heavy work via `nohup` (Sites pattern) |
| Preview port pool | Reuses `cloudbase-sites preview` → `.cloudbase-sites/preview.json` |

**纠正：** earlier partner analysis treated WorkBuddy SessionStart support as
unknown. It is supported; WorkBuddy simply does not enable `cloudbase-sites`
by default (this machine has `cloudbase@codebuddy-plugins-official` only).

## Layout

```text
plugin/workbuddy-template-prewarm/
  .claude-plugin/plugin.json
  hooks/hooks.json              # plugin-style registration
  hooks/on-session-start.sh     # SessionStart entry (emit context + bg work)
  hooks/prewarm.mjs             # download/cache/extract/install + preview
  settings.snippet.json         # merge into ~/.workbuddy/settings.json
  README.md
```

## Behavior

1. SessionStart (`startup` / `clear`)
2. If cwd empty-enough → background: cache zip → extract → install → `cloudbase-sites preview`
3. If Vite project missing `node_modules` → background install → preview
4. If Vite already installed → background `--preview-only` (idempotent Sites status/start)
5. Else skip (do not overwrite foreign trees)
6. Always inject compact BaaS-first + **never guess port** rules via `additionalContext`

State file: `<cwd>/.cloudbase-prewarm/state.json`  
Preview file: `<cwd>/.cloudbase-sites/preview.json`  
Zip cache: `~/.cloudbase/cache/templates/web-cloudbase-{react\|vue}-template.zip`  
Log: `~/.cloudbase/logs/workbuddy-prewarm-session-start.log`

### Env knobs

| Env | Default | Meaning |
| --- | --- | --- |
| `CLOUDBASE_WORKBUDDY_PREWARM` | `1` | Set `0` to disable entire hook body |
| `CLOUDBASE_WORKBUDDY_TEMPLATE` | `react` | `react` \| `vue` |
| `CLOUDBASE_WORKBUDDY_PREVIEW` | `1` | Set `0` to skip Sites preview start |
| `CLOUDBASE_SITES_BIN` | auto | Absolute path to `cloudbase-sites` CLI |

Sites bin resolution order: `CLOUDBASE_SITES_BIN` → sibling
`plugin/cloudbase-sites/bin/cloudbase-sites` → `PATH`.

## Manual enable (partner / local)

1. Replace the absolute path in `settings.snippet.json`.
2. Merge the `SessionStart` entry into `~/.workbuddy/settings.json` (hooks stack
   in parallel with existing teamai hooks — do not replace them).
3. Keep `plugin/cloudbase-sites` available as a sibling (or set `CLOUDBASE_SITES_BIN`).
4. Restart WorkBuddy / start a new session in an **empty** project directory.
5. While guiding credentials, check `.cloudbase-prewarm/state.json` → `ready`
   and `.cloudbase-sites/preview.json` → `internalUrl`.

### Dry-run without WorkBuddy

```bash
TMP=$(mktemp -d)
node plugin/workbuddy-template-prewarm/hooks/prewarm.mjs --cwd "$TMP" --fg --start-preview
node plugin/workbuddy-template-prewarm/hooks/prewarm.mjs --status --cwd "$TMP"
# Simulate SessionStart JSON emit:
printf '%s' "{\"cwd\":\"$TMP\",\"hook_event_name\":\"SessionStart\",\"source\":\"startup\"}" \
  | bash plugin/workbuddy-template-prewarm/hooks/on-session-start.sh
```

## Relationship to Sites

| | Sites SessionStart | This spike |
| --- | --- | --- |
| Empty-dir init | Passive unless `CLOUDBASE_SITES_AUTO_INIT=1` | Aggressive when hook installed |
| Preview supervisor | Yes (`cloudbase-sites preview`) | **Yes — reuses same CLI** |
| Save / deploy / versions | Full Sites verbs | Not included (use Sites plugin if needed) |
| BaaS-first rules | Full RULES_BLOCK | Compact subset + pointer to `minimal-web-baas-demo` |
| WorkBuddy default | Plugin often not enabled | Settings-snippet / future packaging |

Enabling full `cloudbase-sites` on WorkBuddy remains complementary for
save/deploy UX. For XDF credential-wait demos, this lighter hook is enough.

## Real-session smoke (2026-08-05)

Host: WorkBuddy 5.3.8 (`CODEBUDDY_CONFIG_DIR=~/.workbuddy`), empty dir under
`~/WorkBuddy/ato-prewarm-verify-*`, settings.snippet merged (stacked with teamai).

| Check | Result |
| --- | --- |
| SessionStart fires | Yes — `HookExecutor` spawn + `executeSessionStartHooks source=startup` (~0.5s) |
| `additionalContext` | Yes — host log `SessionStart hook provided additional context` |
| stdin `cwd` | Empty in smoke. Process cwd already set to workspace — **pwd fallback is sufficient** |
| `state.json` → `ready` during credential-wait overlap | Yes — ~18–25s (cached zip + isolated install) |
| Preview automation (this task) | Wired to call sibling Sites `preview` after ready; dry-run in ATO artifact |

### Hooks path / env conclusion

1. **settings.snippet enablement:** keep **absolute** script path — do not use
   `${CLAUDE_PLUGIN_ROOT}` (unset on settings-hook path).
2. **Plugin packaging:** use
   `${CLAUDE_PLUGIN_ROOT:-${CODEBUDDY_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT}}}`.
3. Keep stdin cwd parser for Claude/Sites compatibility; WorkBuddy relies on process cwd.
4. Install isolation (`--ignore-workspace`) is required under home monorepos.

## Productization follow-ups

1. ~~Real WorkBuddy session smoke (stdin cwd + plugin root env).~~ Done.
2. ~~Upgrade preview port management from Prompt to Sites CLI.~~ Done (this task).
3. Optional merge into `cloudbase` connector packaging or Sites with a
   WorkBuddy-oriented aggressive mode.
4. **XDF expert pack:** `plugin/xdf-workbuddy-expert-pack` bundles
   settings-snippet enablement + `minimal-web-baas-demo` pointer + expert
   Agent markdown. **Do not** put SessionStart in Agent frontmatter.
5. Official template ships large `AGENTS.md`/`CLAUDE.md` (~41KB); WorkBuddy
   rejects rule files over 40KB — consider stripping/truncating on extract.
