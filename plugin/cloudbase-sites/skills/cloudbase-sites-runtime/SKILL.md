---
name: cloudbase-sites-runtime
description: |
  Use when the user wants to develop, run, preview, save, deploy, or roll back
  a CloudBase Web app in this conversation as a Lovable/Codex-Sites-like vibe-
  coding session — i.e. any request that maps to "spin up a React+Vite project,
  see it live in the browser, iterate, save versions, deploy". Activate ONLY
  for browser-rendered Web projects based on the CloudBase official React
  (or Vue) + Vite template. Do NOT activate for: WeChat/Alipay mini-program,
  React Native / Flutter / Electron, pure cloud functions / CloudRun backends,
  or Next.js / Nuxt / Astro / Remix / SvelteKit (those frameworks are
  explicitly out of scope).
---

# CloudBase Sites Runtime

This skill orchestrates a **single working directory = single project** flow
for CloudBase Web apps. The cwd itself is the workspace; we do not manage
cross-cwd state or session IDs at the skill level.

This runtime is shared by the Codex, Claude Code, and CodeBuddy plugin
surfaces. The CLI and CloudBase MCP workflows are the source of truth. Some
hosts also run bundled lifecycle hooks that start previews or inject compact
rules at session start; if hooks are unavailable, disabled, or not yet trusted,
use the explicit CLI commands in this skill.

## Activation contract

### Use this skill when

- The user says "build me a website / app", "I want to make a landing page",
  "create a React app and let me preview", "deploy this to CloudBase",
  "save this version", "roll back to v1", or similar.
- The current cwd looks like a CloudBase + Vite project (has `package.json`
  with `vite` + `react` or `vue`).
- The user is running this conversation inside Codex, Claude Code, CodeBuddy,
  or a compatible host with the `cloudbase-sites` plugin enabled —
  `cloudbase-mcp` is registered and the `cloudbase-sites` binary is either on
  PATH or available from the plugin root's `bin/cloudbase-sites`.

### Do NOT use this skill when

- It's a mini-program project — route to mini-program guidance instead.
- It's a native app project — route to http-api guidance.
- It's a backend-only project — route to cloud-functions / cloudrun guidance.
- The framework is Next/Nuxt/Astro/Remix — politely tell the user this skill
  only covers Vite-based React/Vue apps and stop. Do NOT try to adapt the
  scripts to those frameworks.

## What this skill orchestrates — three layers

### 1. CloudBase MCP tools (provided by `cloudbase-mcp`, registered via plugin's `.mcp.json`)

These are the only tools that produce CloudBase side effects. Highlights:

- `downloadTemplate({ template: "react" | "vue", ide })` — pull official template
- `envQuery({ action: "info" })` + `auth({ action: "set_env", envId })` — bind env
- `manageApps({ action: "deployApp", ... })` — deploy to CloudApp (independent subdomain)
- `envDomainManagement({ action: "create", domains })` — whitelist dev origin for CORS
- `searchKnowledgeBase({ mode: "skill", skillName: "<name>" })` — fetch CloudBase domain skills (see below)

For all CloudBase operations beyond the dev-server lifecycle (auth, db,
storage, ai), fetch the corresponding CloudBase domain skill via
`searchKnowledgeBase(mode="skill", skillName=...)`. Common ones:

- `ui-design`               UI design spec (mandatory before new UI work)
- `web-development`         Web project conventions
- `auth-tool`               provider config (management-side)
- `auth-web`                Web SDK auth client code
- `no-sql-web-sdk`          document database Web SDK
- `cloud-storage-web`       cloud storage Web SDK
- `relational-database-web` MySQL Web SDK
- `cloudbase-platform`      platform overview / console links

These are **NOT Claude Code native skills** and are NOT bundled with this
plugin. They live inside cloudbase-mcp and are fetched on demand. When this
file (or the injected RULES_BLOCK) says "调 ui-design skill" or "follow the
auth-tool skill", that means: call `searchKnowledgeBase(mode="skill",
skillName="<that-name>")` and apply the returned content.

### 2. The `cloudbase-sites` CLI (provided by this plugin's `bin/` directory)

First resolve the CLI path:

1. Try `command -v cloudbase-sites`.
2. If that fails and the host exposes `CODEX_PLUGIN_ROOT`, use
   `$CODEX_PLUGIN_ROOT/bin/cloudbase-sites`.
3. If that fails and the host exposes `CLAUDE_PLUGIN_ROOT`, use
   `$CLAUDE_PLUGIN_ROOT/bin/cloudbase-sites`.
4. If SessionStart injected an absolute CLI path, use that path.

Do not assume Codex has injected the plugin `bin/` directory into PATH.

Single binary, multiple subcommands. Use these — and ONLY these — for the
dev-server / version / deploy lifecycle:

- `cloudbase-sites init --start` — scaffold from empty cwd and start preview when the user explicitly wants a Sites app
- `cloudbase-sites preview` — daemonize Vite for an existing Vite project
- `cloudbase-sites preview --status [--quiet]` — JSON status / exit code
- `cloudbase-sites preview --restart` / `--stop [--force]`
- `cloudbase-sites save -m "<label>"` — create a saved version
- `cloudbase-sites versions` — list saved versions + deploy status
- `cloudbase-sites deploy [--version <n>]` — deploy a saved version (Phase 1: emit nextAction)
- `cloudbase-sites deploy --post --version <n> --access-url <url> [--build-id <BuildId>] [--version-name <VersionName>]` — record deploy
- `cloudbase-sites rollback [--to-version <n>]` — revert to a saved version
- `cloudbase-sites supervisor status|list|heal|reload|start|stop`

Never invent `npm run dev` / `vite` / `vite build` invocations. The CLI
handles host=0.0.0.0 forcing, port allocation (17173..17272), daemonization,
base path injection, version metadata, and deploy history.

### 3. Standard tools (Bash, git, Edit, Write)

Use for editing files. The plugin's PostToolUse hook handles automatic
restart on config-file edits — you don't need to manage that.

## Lifecycle hooks and fallback

**Do NOT invoke `cloudbase-sites init` or `cloudbase-sites preview`
proactively in your first message just because the plugin is installed.**
SessionStart is intentionally passive for empty directories so the plugin does
not interfere with unrelated sessions. A UserPromptSubmit hook may initialize
after the first user message, but only when deterministic Chinese/English
intent rules detect an explicit Sites/Web-app creation request. By the time you
read the user's first prompt:

- If the cwd was an existing Vite project: dev server is up (or installing).
- If the cwd was empty: no files were downloaded by SessionStart. If the first
  prompt clearly asked to build/create a Sites app, UserPromptSubmit may have
  started `init --start`; otherwise initialize only after the user asks.
- If the cwd is a non-Vite / blacklisted project: hook stayed silent.

Codex supports bundled plugin hooks, but non-managed command hooks may require
the user to review and trust them before they run. If Codex hooks have not run,
resolve the CLI path as described above, then fall back to
`<cloudbase-sites-cli> preview --status`, `<cloudbase-sites-cli> init`, and the
other explicit commands below instead of assuming automatic startup.

If SessionStart reports that it skipped a non-empty non-Vite cwd, do not assume
the runtime is active. If a template is downloaded later through MCP
`downloadTemplate`, run `<cloudbase-sites-cli> preview --status` and then
`<cloudbase-sites-cli> preview` if no preview is running.

You only invoke a CLI verb when:

- User asks to create/build a new Sites app in an empty cwd → `cloudbase-sites init --start`
- User explicitly says "stop the dev server" → `cloudbase-sites preview --stop`
- User asks for the URL or "is it running" → `cloudbase-sites preview --status`
- User wants to save a version → `cloudbase-sites save -m "<label>"`
- User wants to deploy → `cloudbase-sites deploy` (then bridge to `manageApps`)
- User wants to roll back → `cloudbase-sites rollback`

## When the user just walked into the conversation

1. **Read the SessionStart status first.** If it says the cwd is passive/empty,
   do not assume a project exists. Wait for the user's first concrete Sites app
   request, then run `cloudbase-sites init --start`.

2. **For existing Vite projects, check preview state** — read
   `<cwd>/.cloudbase-sites/preview.json` or run
   `cloudbase-sites preview --status`. If no preview is running, start it with
   `cloudbase-sites preview`.

3. **Tell the user the URL** — surface `internalUrl` from the JSON. If the file
   is missing after init/preview, inspect `.cloudbase-sites/logs/`.

4. **Offer to open the preview.** Ask: "要不要我用内置浏览器打开 <URL>
   预览一下?" If yes, use the host Browser / in-app browser tool to open
   `internalUrl`. Do not use macOS `open`, and do not run browser interaction
   tests unless the user explicitly asks you to test the UI.

5. **DO NOT** re-init / re-start. Calling `init` again will fail with code 10
   (cwd no longer empty). Calling `preview` is idempotent and safe but
   wastes a turn.

6. **NEVER guess the port.** It is NOT 5173/5174/5175 — the plugin uses
   17173..17272. Always read the recorded port from `preview.json`.

## Two-stage save → deploy workflow

Inspired by Codex Sites' `saved version` model:

- **Save:** label a git checkpoint. `cloudbase-sites save -m "<label>"` runs
  `git init` when needed, then `git add -A && git commit && git tag
  version/<n>` and appends to `<cwd>/.cloudbase-sites/app.json.versions[]`.
  No build, no deploy.
- **Deploy:** publish a saved version to a CloudApp.
  `cloudbase-sites deploy [--version <n>]` (default: latest saved) builds
  `dist/` locally then emits `nextAction` telling you to call
  `manageApps({ action: "deployApp", serviceName: <stable from app.json>,
  filePath: cwd, buildPath: "dist", framework: "static",
  installCmd: "", buildCmd: "" })`. The `framework=static` shape skips
  remote install/build because we built locally.
- **Record:** after `manageApps` succeeds and gives you the access URL,
  call `cloudbase-sites deploy --post --version <n> --access-url <url>
  --build-id <BuildId> [--version-name <VersionName>]`. This appends to
  `app.json.deployments[]`, records CloudBase build metadata, tags git
  `deploy/<n>-<ts>`, and returns `finalUrl` with a cache-busting query.
  If the `manageApps` result includes `BuildId`, you MUST pass it to
  `--build-id`; otherwise future build status and log queries cannot be
  traced directly from the saved deployment.
- **Rollback:** `cloudbase-sites rollback [--to-version <n>]` (default:
  current production deploy). Stashes uncommitted edits, `git reset --hard`
  to the version's commit, marks newer versions as `rolled-back`, and
  restarts the dev server.

**Why CloudApp (`manageApps`) not static hosting?** Each CloudApp has its
own subdomain (`*.webapps.tcloudbase.com`); two vibe sessions on the same
env never collide. The stable `siteName` in `app.json` ensures re-deploys
preserve the URL.

**Pre-flight:** if `manageApps` fails with "no envId" / env-related error,
call `envQuery({ action: "info" })`. If multiple envs exist, ask the user
to pick. After binding, retry the deploy.

## Proactive prompts (do not act unsolicited)

When you finish a user-requested feature (especially "make me a X app",
"build me a Y", "add Z feature"), end your reply by asking:

1. **Save?** "要保存这一版吗?(下次能再调出来)" → if yes, run
   `cloudbase-sites save -m "<auto-generated label>"`.
2. **Deploy?** "现在要部署看一下吗?(独立 URL,可分享)" → if yes, run the
   two-stage deploy described above.
3. **Open preview?** "要不要我用内置浏览器打开 <URL> 预览一下?" — if yes,
   use the host Browser / in-app browser tool to open `internalUrl`. Only
   click through interactions or run browser-driving verification after the
   user explicitly asks for testing. Do NOT spawn playwright / agent-browser
   by default.
4. **After successful deploy** ask: "要我用 ui-design 能力进一步优化样式和体验吗?"
   If yes, fetch `searchKnowledgeBase(mode="skill", skillName="ui-design")`
   and iterate on the design.

Skip any of these when:
- The work was a bug fix or trivial refactor.
- The user already chose this option earlier in the session.
- The user explicitly said "don't deploy" / "no tests" / "no design changes".

## Hard rules (also injected by SessionStart hook)

1. **Never guess the preview URL.** Always read `preview.json` or run
   `cloudbase-sites preview --status`. Default port range is 17173..17272.

2. **"Make me a X app" = X IS the homepage.** When the user uses whole-house
   language, REPLACE the content of `src/pages/HomePage.tsx` (or `App.tsx`
   if no HomePage exists) with the new feature. Do NOT create a new
   `<TodoApp />` component and leave the original template welcome at `/`.
   Only add a new route when the user explicitly says "add a X page".

3. **UI work for NEW features requires a design specification first.** Before
   writing any `.tsx`/`.css`/`.html`, fetch
   `searchKnowledgeBase(mode="skill", skillName="ui-design")`, output the
   4-part spec (Aesthetic / Color / Typography / Layout), THEN write code.
   The CloudBase template's CLAUDE.md "Existing Implementation First"
   exemption applies only to bug fixes; new apps still need ui-design.

4. **Never spawn `npm run dev` / `vite` / `vite build` yourself.** Lifecycle
   is owned by hooks + the `cloudbase-sites` CLI.

5. **BaaS-first data persistence.** Schema via
   `writeNoSqlDatabaseStructure(action="createCollection")`; reads/writes
   via `@cloudbase/js-sdk` from React/Vue code. Reach for cloud functions
   only when (a) the logic cannot be expressed as security rules AND
   (b) it needs server-side secrets or a third-party API AND (c) it's a
   scheduled / background job. A Todo / Notes / Chat / Kanban app does NOT
   need cloud functions.

6. **Do not run browser tests by default.** Verify reasonably (preview
   healthy, no compile error in `cloudbase-sites preview --status`). Offer
   to open the preview URL in the host Browser / in-app browser; ask again
   before interaction testing.

7. **Two-stage save → deploy.** Don't deploy unsolicited. Don't bypass
   `cloudbase-sites deploy` with your own `pnpm build` + `manageApps` call —
   you'd lose version metadata, snapshot, deploy history, and the stable
   siteName.

## Hard rules — always parse CLI stdout as JSON

The first stdout line of every `cloudbase-sites <verb>` invocation is a
single JSON object. The stderr `[cloudbase-sites] ...` line is for humans —
do not parse it. On error the JSON is `{ ok: false, code: <int>, message,
hint?, logPath? }`. When a script reports failure, surface `logPath` to the
user instead of guessing the cause.

## Error codes from the CLI

| code | meaning | recovery |
|---|---|---|
| 1 | generic failure | check the message and `nextActions` if present |
| 2 | not a Vite project (or `vite` binary missing) | `pnpm install` then retry |
| 3 | port pool exhausted in 17173..17272 | `cloudbase-sites preview --stop` for stale ones, or pass `--port` |
| 4 | dev server failed health check in 30s | read `logPath`; usually a build error in user code |
| 5 | no preview is running (status / stop) | start one with `cloudbase-sites preview` |
| 6 | stop failed (process refused SIGKILL) | inspect the PID manually with `ps`; very rare |
| 7 | build failed (`cloudbase-sites deploy`) | inspect build output; fix code, retry |
| 8 | `dist/` missing or empty after build | confirm `scripts.build` runs `vite build`; rerun |
| 9 | cwd in danger blacklist (`init`) | cd to a real project directory first |
| 10 | cwd not empty (`init`) | move conflicting files; only `.git`/`.gitignore`/README/LICENSE/.cloudbase-sites are tolerated |
| 11 | template download failed | check internet; URL is `static.cloudbase.net/cloudbase-examples/...` |
| 12 | template extract failed | install `unzip` |
| 13 | dependency install failed | check terminal output |
| 14 | version not found | run `cloudbase-sites versions` to list |
| 15 | rollback failed | check git state |

## State files

| Path | Purpose |
|---|---|
| `<cwd>/.cloudbase-sites/preview.json` | dev server PID/port/URL/framework |
| `<cwd>/.cloudbase-sites/app.json` | siteName + versions[] + deployments[] + currentVersion + currentDeploy |
| `<cwd>/.cloudbase-sites/logs/preview-<ts>.log` | Vite stdout/stderr |
| `<cwd>/.cloudbase-sites/logs/hook-session-start.log` | SessionStart hook trace |
| `<cwd>/.cloudbase-sites/logs/hook-restart.log` | PostToolUse restart trail |
| `~/.cloudbase-sites/registry.json` | global supervisor's view of all cwds |
| `~/.cloudbase-sites/supervisor.json` | global supervisor PID + uptime |
| `~/.cloudbase-sites/supervisor.log` | supervisor stdout/stderr |

## What this skill is NOT

- It is **not** a session manager. There is no sessionId at the skill level.
  There is only cwd. (The supervisor's `registry.json` does track cwds
  globally, but for self-healing — not as a user-facing concept.)
- It is **not** a reverse proxy. If the host is on a public-facing server
  and the user needs `<host>:8080/s/<sid>/` style routing, that's a separate
  optional component (`cloudbase-sites-proxy`, future work) — out of scope here.
- It is **not** a CloudBase auth/database guide. For those, fetch the
  corresponding CloudBase domain skill via
  `searchKnowledgeBase(mode="skill", skillName=...)`.
- It is **not** a UI design guide. For visual decisions, fetch
  `searchKnowledgeBase(mode="skill", skillName="ui-design")`.
