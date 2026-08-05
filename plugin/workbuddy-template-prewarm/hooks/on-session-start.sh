#!/usr/bin/env bash
# on-session-start.sh — WorkBuddy / CodeBuddy SessionStart prewarm
#
# Overlaps CloudBase React template download + npm/pnpm install with the
# human-gated sre-aihub credential / connector Trust wait (no CloudBase
# credentials required for HTTPS template fetch). Marketplace plugin hooks
# auto-merge alongside teamai SessionStart — do not replace user settings hooks.
#
# Output: Claude/CodeBuddy/WorkBuddy SessionStart hook JSON with additionalContext.
# Log: ~/.cloudbase/logs/workbuddy-prewarm-session-start.log

set -u

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
PREWARM_JS="$HOOK_DIR/prewarm.mjs"
LOG_DIR="${HOME}/.cloudbase/logs"
LOG_TARGET="$LOG_DIR/workbuddy-prewarm-session-start.log"

# Prefer stdin cwd from the host; fall back to process cwd.
# Read at most 64KiB and do not hang if the host keeps the pipe open.
PWD_CWD="$(pwd)"
CWD="$PWD_CWD"
STDIN_RAW=""
STDIN_CWD=""
STDIN_KEYS=""
STDIN_SOURCE=""
STDIN_EVENT=""
if [ ! -t 0 ] && command -v node >/dev/null 2>&1; then
  # Capture cwd + diagnostic fields in one parse (also keep raw length).
  PARSE_OUT="$(dd bs=65536 count=1 2>/dev/null | node -e '
    let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{
      const meta = { rawLen: d.length, keys: [], cwd: "", source: "", event: "" };
      try {
        const j = JSON.parse(d || "{}");
        meta.keys = Object.keys(j).sort();
        if (j.cwd) meta.cwd = String(j.cwd);
        if (j.source) meta.source = String(j.source);
        if (j.hook_event_name) meta.event = String(j.hook_event_name);
      } catch (e) {
        meta.parseError = String(e && e.message || e);
      }
      process.stdout.write(JSON.stringify(meta));
    });
  ' 2>/dev/null || true)"
  if [ -n "${PARSE_OUT:-}" ]; then
    STDIN_RAW="$PARSE_OUT"
    # Pass JSON via argv — do NOT put ')' inside $() node -e one-liners (premature close).
    STDIN_CWD="$(node -p 'try{JSON.parse(process.argv[1]).cwd||""}catch{""}' "$PARSE_OUT")"
    STDIN_KEYS="$(node -p 'try{(JSON.parse(process.argv[1]).keys||[]).join(",")}catch{""}' "$PARSE_OUT")"
    STDIN_SOURCE="$(node -p 'try{JSON.parse(process.argv[1]).source||""}catch{""}' "$PARSE_OUT")"
    STDIN_EVENT="$(node -p 'try{JSON.parse(process.argv[1]).event||""}catch{""}' "$PARSE_OUT")"
  fi
  if [ -n "${STDIN_CWD:-}" ]; then
    CWD="$STDIN_CWD"
  fi
fi

mkdir -p "$LOG_DIR" 2>/dev/null || true
log() {
  printf '[%s] [cwd=%s] %s\n' "$(date -Iseconds 2>/dev/null || date)" "$CWD" "$*" >>"$LOG_TARGET" 2>/dev/null || true
}

# One-shot host diagnostics (settings-hook vs plugin-root packaging).
log "diag pwd=$PWD_CWD stdin_cwd=${STDIN_CWD:-<empty>} stdin_keys=${STDIN_KEYS:-<none>} source=${STDIN_SOURCE:-<none>} event=${STDIN_EVENT:-<none>} CLAUDE_PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT:-<unset>} CODEX_PLUGIN_ROOT=${CODEX_PLUGIN_ROOT:-<unset>} WORKBUDDY_PLUGIN_ROOT=${WORKBUDDY_PLUGIN_ROOT:-<unset>} CODEBUDDY_PLUGIN_ROOT=${CODEBUDDY_PLUGIN_ROOT:-<unset>} PLUGIN_ROOT=$PLUGIN_ROOT HOOK_DIR=$HOOK_DIR"

emit_context() {
  local body="$1"
  if command -v node >/dev/null 2>&1; then
    node -e '
      const body = process.argv[1];
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: body,
        },
      }));
    ' "$body"
  fi
}

# Resolve Sites CLI for preview port management (17173..17272).
# Prefer env → vendored copy (marketplace self-contained) → sibling → PATH.
SITES_BIN="${CLOUDBASE_SITES_BIN:-}"
if [ -z "$SITES_BIN" ] && [ -x "$PLUGIN_ROOT/vendor/cloudbase-sites/bin/cloudbase-sites" ]; then
  SITES_BIN="$PLUGIN_ROOT/vendor/cloudbase-sites/bin/cloudbase-sites"
elif [ -z "$SITES_BIN" ] && [ -x "$PLUGIN_ROOT/../cloudbase-sites/bin/cloudbase-sites" ]; then
  SITES_BIN="$PLUGIN_ROOT/../cloudbase-sites/bin/cloudbase-sites"
elif [ -z "$SITES_BIN" ] && command -v cloudbase-sites >/dev/null 2>&1; then
  SITES_BIN="$(command -v cloudbase-sites)"
fi

RULES_BLOCK='## CloudBase WorkBuddy prewarm (plugin-injected, MUST follow)

You are in a WorkBuddy/CodeBuddy session with CloudBase template prewarm +
Sites-aligned preview automation.

### Hard rules

1. **Do not idle during credential / Trust waits.** Template download + install
   (+ preview start) may already be running in the background (no CloudBase
   credentials needed for zip fetch). Keep guiding sre-aihub / connector Trust
   in parallel.

2. **BaaS-first data path (Sites Rule 5 equivalent).** Prefer
   `@cloudbase/js-sdk` browser CRUD (NoSQL `app.database()` or PG `app.rdb()`).
   Create schema via MCP only. Cloud functions are forbidden for Todo / Notes /
   Chat / Kanban / "最小前后端 demo" unless secrets, cron, or rules-cannot-express.

3. **Reuse the warmed template.** When prewarm status is ready/installing, do
   NOT scaffold a competing hand-rolled project. Patch `envId` in
   `src/utils/cloudbase.ts` (or equivalent), then CRUD + preview.

4. **Check prewarm status before inventing files:**
   `node '"$PREWARM_JS"' --status --cwd <cwd>`
   or read `<cwd>/.cloudbase-prewarm/state.json`.

5. **Never guess the preview URL / port.** It is NOT 5173/5174/5175. Preview
   uses the Sites pool **17173..17272**. Always read
   `<cwd>/.cloudbase-sites/preview.json` or run:
   `'"${SITES_BIN:-cloudbase-sites}"' preview --status`
   (or `node '"$PREWARM_JS"' --status --cwd <cwd>` which embeds sitesPreview).
   If NO_PREVIEW, wait ~5s and retry once — SessionStart may still be starting.
   **Do NOT** spawn `npm run dev` / bare `vite` yourself when Sites preview is
   available — that loses host=0.0.0.0, port allocation, and preview.json.

6. **Compact skill routing.** For 最小前后端 demos, call
   `searchKnowledgeBase(mode="skill", skillName="minimal-web-baas-demo")`
   (then Read the returned path). Do not rely only on this injected brief.
   Fetch deeper skills on demand. Do not dump every CloudBase skill at start.
'

if [ -n "${SITES_BIN:-}" ]; then
  RULES_BLOCK="$RULES_BLOCK

### Sites preview CLI (absolute path for this host)

\`$SITES_BIN preview --status\` — health + internalUrl
\`$SITES_BIN preview\` — ensure running
\`$SITES_BIN preview --stop\` — stop
"
fi

cd "$CWD" 2>/dev/null || true

# Opt-out
if [ "${CLOUDBASE_WORKBUDDY_PREWARM:-1}" = "0" ]; then
  log "prewarm disabled via CLOUDBASE_WORKBUDDY_PREWARM=0"
  emit_context "$RULES_BLOCK

### Current cwd state
- **cwd:** $CWD
- **hook result:** disabled (CLOUDBASE_WORKBUDDY_PREWARM=0)
- **next action:** when the user asks for a demo, warm via MCP downloadTemplate + npm install yourself."
  exit 0
fi

if [ ! -f "$PREWARM_JS" ]; then
  log "missing prewarm.mjs"
  emit_context "$RULES_BLOCK

### Current cwd state
- **cwd:** $CWD
- **hook result:** error — prewarm.mjs missing at $PREWARM_JS"
  exit 0
fi

# Ask prewarm.mjs to decide without mutating (via decide by dry status + listing).
# We reimplement a cheap decision here for fast hook return, then background work.
is_vite=0
if [ -f package.json ] && command -v node >/dev/null 2>&1; then
  if node -e 'const p=require("./package.json"); const d={...(p.dependencies||{}),...(p.devDependencies||{})}; process.exit(d.vite?0:1)' 2>/dev/null; then
    is_vite=1
  fi
fi

empty_enough=1
for entry in $(ls -A 2>/dev/null); do
  case "$entry" in
    .git|.gitignore|.DS_Store|.cloudbase-prewarm|.cloudbase-sites|LICENSE|LICENSE.md|LICENSE.txt) ;;
    README|README.md|README.MD|README.txt|readme.md) ;;
    *) empty_enough=0; break ;;
  esac
done

TEMPLATE="${CLOUDBASE_WORKBUDDY_TEMPLATE:-react}"

if [ "$is_vite" = "1" ]; then
  if [ ! -d node_modules ]; then
    log "vite project — background install + Sites preview"
    nohup node "$PREWARM_JS" --cwd "$CWD" --fg --start-preview </dev/null >>"$LOG_TARGET" 2>&1 &
    disown 2>/dev/null || true
    emit_context "$RULES_BLOCK

### Current cwd state
- **cwd:** $CWD
- **hook result:** installing dependencies then starting Sites preview in background (~30s+)
- **template:** existing Vite project
- **preview:** do not guess port — poll \`.cloudbase-sites/preview.json\` or Sites \`preview --status\`
- **first action:** finish connector credentials/Trust in parallel; then read \`.cloudbase-prewarm/state.json\` before editing."
    exit 0
  fi
  log "vite project already installed — ensure Sites preview + inject rules"
  nohup node "$PREWARM_JS" --cwd "$CWD" --preview-only </dev/null >>"$LOG_TARGET" 2>&1 &
  disown 2>/dev/null || true
  emit_context "$RULES_BLOCK

### Current cwd state
- **cwd:** $CWD
- **hook result:** ready (existing Vite project); ensuring Sites preview in background
- **preview:** read \`.cloudbase-sites/preview.json\` or run Sites \`preview --status\` (ports 17173..17272)
- **first action:** envQuery → BaaS CRUD; do not create cloud functions for minimal demos."
  exit 0
fi

if [ "$empty_enough" = "1" ]; then
  log "empty-enough — background template prewarm + preview ($TEMPLATE)"
  nohup node "$PREWARM_JS" --cwd "$CWD" --template "$TEMPLATE" --fg --start-preview </dev/null >>"$LOG_TARGET" 2>&1 &
  disown 2>/dev/null || true
  emit_context "$RULES_BLOCK

### Current cwd state
- **cwd:** $CWD
- **hook result:** prewarming CloudBase official ${TEMPLATE}+Vite template, then Sites preview
- **expected:** ~10–40s (download zip from cache/network + install) + a few seconds for preview
- **status file:** \`$CWD/.cloudbase-prewarm/state.json\`
- **preview file:** \`$CWD/.cloudbase-sites/preview.json\` (internalUrl; ports 17173..17272)
- **overlap:** continue sre-aihub credential / connector Trust UX now — do NOT wait for install to finish before talking to the user
- **first coding action after connect:** wait until state.status=ready, confirm preview via \`preview --status\`, then patch envId and implement CRUD on the template homepage — do not hand-roll a second scaffold."
  exit 0
fi

log "skip: non-empty non-vite cwd"
emit_context "$RULES_BLOCK

### Current cwd state
- **cwd:** $CWD
- **hook result:** skipped — cwd is non-empty and not a Vite project
- **why:** refusing to overwrite foreign files (same safety idea as Sites)
- **fallback:** when the user wants a minimal demo, use MCP downloadTemplate into a clean directory, or ask them to cd into an empty project folder."
exit 0
