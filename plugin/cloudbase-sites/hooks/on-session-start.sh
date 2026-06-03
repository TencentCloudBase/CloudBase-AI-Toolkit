#!/usr/bin/env bash
# on-session-start.sh — Claude Code / OpenClaw SessionStart hook
#
# Two responsibilities:
#   1. Decide what to do for the cwd (no-op / start preview / install + start /
#      auto-init from empty). Heavy work runs in the background.
#   2. Emit a JSON `additionalContext` payload on stdout so Claude Code injects
#      hard rules + cwd state directly into the system prompt — bypassing the
#      "model may or may not Skill() the SKILL.md" gamble.
#
# Output schema (Claude Code SessionStart hook):
#   { "hookSpecificOutput": {
#       "hookEventName": "SessionStart",
#       "additionalContext": "...rules + state..."
#     }
#   }
#
# Hook log: <cwd>/.cloudbase-agent/logs/hook-session-start.log

set -u
CWD="$(pwd)"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
LOG_FALLBACK="/tmp/cloudbase-sites-session-start.log"

log() {
  local target="$CWD/.cloudbase-agent/logs/hook-session-start.log"
  mkdir -p "$(dirname "$target")" 2>/dev/null || target="$LOG_FALLBACK"
  printf '[%s] %s\n' "$(date -Iseconds 2>/dev/null || date)" "$*" >> "$target" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Emit additionalContext as the LAST stdout output. We use Node to do JSON
# escaping safely (newlines, quotes, etc.) — sed/printf are too error-prone
# when the body contains backticks and quotes.
# ---------------------------------------------------------------------------
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
  # If node is missing, we silently skip — the hook still ran its decision tree.
}

# Build the static rules block used in every active branch.
RULES_BLOCK='## CloudBase Sites (plugin-injected, MUST follow)

You are in a session managed by the cloudbase-sites plugin. The dev server
lifecycle and version control are owned by hooks + the `cloudbase-sites` CLI;
you must not bypass them.

### Hard rules

1. **Never guess the preview URL.** It is NOT 5173/5174/5175 — the plugin uses
   the 17173..17272 range AND each cwd may have its own port. Always run
   `cloudbase-sites preview --status` (or read `<cwd>/.cloudbase-agent/preview.json`)
   to obtain `internalUrl`. If it reports NO_PREVIEW (exit 5), wait ~5s and
   retry once — the SessionStart hook may still be installing/starting.

2. **"Make me a X app" = X IS the homepage.** When the user uses whole-house
   language ("build me a todo app", "make a chat app"), the request means
   "make `/` show X", not "add a `/x` route while the original homepage stays".
   - If `src/pages/HomePage.tsx` (or equivalent) exists in the template:
     **REPLACE its content** with the new feature. Do not create a separate
     component (e.g. `<TodoApp />`) and leave `HomePage` showing the
     original template welcome — the user wants `/` to BE the new app.
   - If no homepage component exists: edit `src/App.tsx` directly so `/`
     renders the new feature.
   - Only add a new route when the user explicitly says "add a X page".

3. **UI work for NEW features requires a design specification first.** When
   the user asks you to build a new app/feature/page from scratch (e.g.
   "make a todo app", "build a chat UI", "add a dashboard"), you MUST first
   fetch the CloudBase ui-design skill via
   `searchKnowledgeBase(mode=skill, skillName="ui-design")`,
   produce its 4-part design spec (Aesthetic Direction, Color Palette,
   Typography, Layout Strategy), output the spec to the user, THEN write
   any `.tsx`/`.css`/`.html`. Do NOT improvise generic AI-default styling.
   Note: the CloudBase template'\''s `CLAUDE.md` "Existing Implementation First"
   exemption applies only to bug fixes / completing TODO markers in existing
   code — it does NOT exempt you from ui-design when creating a new app
   on top of the template.

4. **Never spawn `npm run dev` / `vite` / `vite build` yourself.** Dev-server
   lifecycle is the SessionStart + PostToolUse hooks. Build/deploy is
   `cloudbase-sites deploy`. Bypassing them loses host=0.0.0.0, port allocation,
   daemonization, version metadata, and deploy history.

5. **Data persistence: BaaS-first via Web SDK + MCP-managed schema.** When
   the user'\''s feature needs to store / query / update data:
   - **Schema:** call cloudbase-mcp `writeNoSqlDatabaseStructure(action="createCollection", ...)`
     to create the collection (and `updateCollection` for indexes). Do NOT
     ask the user to create collections manually in the console. For canonical
     patterns, fetch the no-sql-web-sdk skill via
     `searchKnowledgeBase(mode=skill, skillName="no-sql-web-sdk")`.
   - **Reads/writes:** use `@cloudbase/js-sdk` directly from the React/Vue
     code (`db.collection(...).where(...).get()`, `.add()`, `.update()`,
     `db.collection(...).watch(...)` for realtime). The template already
     ships an initialized SDK at `src/utils/cloudbase.ts` — use it.
   - **Auth:** if the feature needs user accounts, fetch
     `searchKnowledgeBase(mode=skill, skillName="auth-tool")` first to
     verify provider config (the management-side configuration), then
     `searchKnowledgeBase(mode=skill, skillName="auth-web")` for client code.
   - **Reach for cloud functions only when ALL of these are true:**
     (a) the logic absolutely cannot be expressed as database security rules,
     (b) it needs server-side secrets / third-party API keys, OR
     (c) it'\''s a scheduled / background job not triggered by user actions.
     Default answer is no — a Todo app, a Notes app, a Chat app, a Kanban
     etc. all live entirely in the JS SDK + database rules. Adding a cloud
     function "just for safety" is over-engineering.

6. **Do not run browser tests / playwright / agent-browser by default.**
   The user wants to SEE the running app, not read 5 minutes of test reports.
   After you finish a feature:
   - Spend zero turns on writing/running automated UI tests unless the user
     explicitly says "write tests" or "test it for me".
   - Verify reasonably (preview is healthy, no compile error in
     `cloudbase-sites preview --status` log) — that'\''s enough.
   - Then ASK the user: "要不要我用内置浏览器打开 <URL> 帮你点一遍验证一下?"
     — only run browser-based verification after explicit yes.

7. **Two-stage save→deploy workflow (Codex-Sites-style).** Versions are
   labeled git checkpoints; deploys are publishes of saved versions.
   - When a user-visible feature is complete and the preview looks good,
     ASK: "要保存这一版吗?(下次还能再调出来)" then run `cloudbase-sites save -m "<label>"`.
     Each save creates `version/<n>` git tag + appends to `app.json.versions[]`.
   - Then ASK: "现在要部署看一下吗?(独立 URL,可分享)". Only deploy after explicit yes.
   - Deploy is two-phase via `cloudbase-sites deploy [--version <n>]`:
     Phase 1 emits `nextAction.tool="manageApps"` with `framework=static,
     installCmd="", buildCmd=""` (skips remote build — we built locally).
     Phase 2 is `cloudbase-sites deploy --post --version <n> --access-url <url>`.
   - After deploy succeeds, ask: "要我用 ui-design 能力进一步优化样式和体验吗?"
     If yes, fetch `searchKnowledgeBase(mode=skill, skillName="ui-design")`
     and iterate.
   - Rollback: `cloudbase-sites rollback [--to-version <n>]` (defaults to
     current production deploy). Use only when user says "回到上一版" or similar.

### CLI quick-reference

- preview health/URL → `cloudbase-sites preview --status`
- stop dev server   → `cloudbase-sites preview --stop`
- list versions     → `cloudbase-sites versions`
- save a version    → `cloudbase-sites save -m "<label>"`
- deploy            → `cloudbase-sites deploy [--version <n>]`  (two-phase, see Rule 7)
- rollback          → `cloudbase-sites rollback [--to-version <n>]`
- supervisor info   → `cloudbase-sites supervisor status`

### CloudBase Skill catalog (fetch on demand via cloudbase-mcp)

These CloudBase domain skills are NOT bundled with this plugin and are NOT
Claude Code native skills — fetch their full content on demand via:
  `searchKnowledgeBase(mode=skill, skillName="<name>")`

When a Hard rule above (or anywhere in your reasoning) references a skill
"by name" — e.g. "调 ui-design skill", "follow auth-tool" — that means
"call the MCP tool with skillName=<that-name> and apply the returned
content". Do NOT look in `~/.claude/skills/` or `.claude/skills/`; these
skills only live inside cloudbase-mcp.

Likely-needed in a vibe-coding session:

- `ui-design`               — UI 设计规范(必读,见 Rule 3)
- `web-development`         — Web 项目开发与部署规范
- `auth-tool`               — 认证 provider 启用与配置(管理端)
- `auth-web`                — Web SDK 认证客户端代码
- `no-sql-web-sdk`          — 文档型数据库 Web SDK CRUD
- `cloud-storage-web`       — 云存储 Web SDK 上传下载
- `relational-database-web` — MySQL Web SDK
- `cloudbase-platform`      — CloudBase 平台总览(资源、链接、控制台路径)

The full list of available skill names is returned by calling
`searchKnowledgeBase(mode=skill)` with no `skillName` — the response lists
all skills with their descriptions.

### Pre-flight you may need

If `manageApps` deploy fails with "no envId" or env-related error, call MCP
`envQuery({ action: "info" })` once. If the user has multiple envs, ask them
to pick. After binding, retry the deploy.

For full contract see `skills/cloudbase-agent-runtime/SKILL.md`.'

# Read payload (Claude Code passes JSON; OpenClaw should too).
PAYLOAD="$(cat 2>/dev/null || true)"
if command -v jq >/dev/null 2>&1 && [ -n "$PAYLOAD" ]; then
  HOST_CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd // empty' 2>/dev/null)"
  [ -n "$HOST_CWD" ] && CWD="$HOST_CWD"
fi

log "session_start cwd=$CWD"

# --- 1. Blacklist -------------------------------------------------------------
HOME_DIR="${HOME:-/Users/$USER}"
blacklisted=0
case "$CWD" in
  /|/tmp|/private/tmp|/var|/private/var|/Users|/Volumes|/System|/usr|/etc|/bin|/sbin) blacklisted=1 ;;
  "$HOME_DIR"|"$HOME_DIR/Desktop"|"$HOME_DIR/Downloads"|"$HOME_DIR/Documents"|"$HOME_DIR/Library"|"$HOME_DIR/Movies"|"$HOME_DIR/Music"|"$HOME_DIR/Pictures"|"$HOME_DIR/Public") blacklisted=1 ;;
  "$HOME_DIR/."*) blacklisted=1 ;;
esac
if [ "$blacklisted" = "1" ]; then
  log "skip: cwd is on the danger blacklist"
  # No active rules — user is just chatting, not vibe-coding. Stay silent.
  exit 0
fi

cd "$CWD" 2>/dev/null || { log "skip: cannot cd to $CWD"; exit 0; }

# --- 2. Already a Vite project? -----------------------------------------------
is_vite_project=0
if [ -f package.json ] && command -v node >/dev/null 2>&1; then
  is_vite_project=$(node -e '
    try {
      const p = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
      const d = { ...(p.dependencies||{}), ...(p.devDependencies||{}) };
      process.stdout.write((!!d.vite && (!!d.react || !!d.vue)) ? "1" : "0");
    } catch { process.stdout.write("0"); }
  ' 2>/dev/null)
fi

# Helper: read internalUrl from preview.json if it exists, else "(starting...)".
read_url() {
  if command -v node >/dev/null 2>&1 && [ -f .cloudbase-agent/preview.json ]; then
    node -e '
      try {
        const p = JSON.parse(require("fs").readFileSync(".cloudbase-agent/preview.json","utf8"));
        process.stdout.write(p.internalUrl || "(starting...)");
      } catch { process.stdout.write("(starting...)"); }
    ' 2>/dev/null
  else
    printf '(starting...)'
  fi
}

# Helper: build a deployment status block from app.json.
read_deploy_block() {
  if command -v node >/dev/null 2>&1 && [ -f .cloudbase-agent/app.json ]; then
    node -e '
      try {
        const a = JSON.parse(require("fs").readFileSync(".cloudbase-agent/app.json","utf8"));
        const siteName = a.siteName || a.serviceName || "(not generated)";
        const last = a.lastDeployedAt;
        const lastUrl = a.lastAccessUrl;
        const count = (a.deployHistory||[]).length;
        let s = "- **deploy target:** CloudApp (manageApps) — independent service & domain per cwd\n";
        s += `- **siteName:** ${siteName}` + (last ? "" : " (no deploy yet)") + "\n";
        if (last) {
          s += `- **last deploy:** ${last} (#${count})\n`;
          s += `- **last access URL:** ${lastUrl}\n`;
        } else {
          s += "- **last deploy:** never — first deploy will create the CloudApp and assign a domain\n";
        }
        process.stdout.write(s);
      } catch (e) {
        process.stdout.write("- **deploy target:** CloudApp (manageApps) — first deploy will generate siteName & domain\n");
      }
    ' 2>/dev/null
  else
    printf -- '- **deploy target:** CloudApp (manageApps) — first deploy will generate siteName & domain\n'
  fi
}

if [ "$is_vite_project" = "1" ]; then
  log "vite project detected"
  SITES_BIN="$PLUGIN_ROOT/bin/cloudbase-sites"

  if "$SITES_BIN" preview --status --quiet 2>/dev/null; then
    log "preview already running and healthy — reuse"
    URL="$(read_url)"
    DEPLOY_LINES="$(read_deploy_block)"
    STATE_BLOCK="### Current cwd state

- **cwd:** $CWD
- **template:** vite-react/vue (existing)
- **preview status:** running and healthy
- **preview URL:** $URL
- **first action:** confirm the URL with \`cloudbase-sites preview --status\` once before showing it to the user.
$DEPLOY_LINES"
    emit_context "$RULES_BLOCK

$STATE_BLOCK"
    exit 0
  fi

  if [ ! -d node_modules ]; then
    log "node_modules missing — install + start in background"
    nohup bash -c "
      pnpm install >/dev/null 2>&1 || npm install >/dev/null 2>&1
      '$SITES_BIN' preview >/dev/null 2>&1
    " </dev/null >>"$CWD/.cloudbase-agent/logs/hook-session-start.log" 2>&1 &
    disown 2>/dev/null || true
    DEPLOY_LINES="$(read_deploy_block)"
    STATE_BLOCK="### Current cwd state

- **cwd:** $CWD
- **template:** vite-react/vue (existing)
- **preview status:** installing dependencies in background (~30s expected)
- **preview URL:** (will be available after install — run \`cloudbase-sites preview --status\` to fetch it; wait 5–60s if it reports NO_PREVIEW)
- **first action:** when the user is ready, confirm preview health by running \`cloudbase-sites preview --status\`, retrying once after 5s if needed.
$DEPLOY_LINES"
    emit_context "$RULES_BLOCK

$STATE_BLOCK"
    exit 0
  fi

  log "starting preview in background"
  nohup "$SITES_BIN" preview </dev/null >>"$CWD/.cloudbase-agent/logs/hook-session-start.log" 2>&1 &
  disown 2>/dev/null || true
  DEPLOY_LINES="$(read_deploy_block)"
  STATE_BLOCK="### Current cwd state

- **cwd:** $CWD
- **template:** vite-react/vue (existing)
- **preview status:** starting in background (a few seconds)
- **preview URL:** (run \`cloudbase-sites preview --status\` to fetch the URL)
- **first action:** run \`cloudbase-sites preview --status\` before quoting any URL to the user.
$DEPLOY_LINES"
  emit_context "$RULES_BLOCK

$STATE_BLOCK"
  exit 0
fi

# --- 3. Empty-enough directory? auto-init ------------------------------------
empty_enough=1
for entry in $(ls -A 2>/dev/null); do
  case "$entry" in
    .git|.gitignore|.DS_Store|.cloudbase-agent|LICENSE|LICENSE.md|LICENSE.txt) ;;
    README|README.md|README.MD|README.txt|readme.md) ;;
    *) empty_enough=0; break ;;
  esac
done

if [ "$empty_enough" = "1" ]; then
  log "cwd is empty-enough — auto init react template + start in background"
  SITES_BIN="$PLUGIN_ROOT/bin/cloudbase-sites"
  nohup "$SITES_BIN" init --start </dev/null >>"$CWD/.cloudbase-agent/logs/hook-session-start.log" 2>&1 &
  disown 2>/dev/null || true
  DEPLOY_LINES="$(read_deploy_block)"
  STATE_BLOCK="### Current cwd state

- **cwd:** $CWD
- **template:** none yet — auto-initializing CloudBase official React+Vite template in background (~10s expected: download zip + pnpm install + start dev server)
- **preview URL:** (not ready yet — wait ~10s, then run \`cloudbase-sites preview --status\`; retry once after 5s if it reports NO_PREVIEW)
- **first action:** wait until the user actually requests something, then run \`cloudbase-sites preview --status\` to confirm template+preview are ready before editing any files. The template will scaffold \`src/App.tsx\`, \`src/main.tsx\`, etc. — DO NOT create competing files until you have read what the template provides.
$DEPLOY_LINES"
  emit_context "$RULES_BLOCK

$STATE_BLOCK"
  exit 0
fi

# --- 4. Foreign project — leave it alone --------------------------------------
log "skip: non-empty cwd without vite — leaving it alone"
# Stay silent: not our project, no rules to inject.
exit 0
