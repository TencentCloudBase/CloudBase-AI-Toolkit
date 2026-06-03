---
name: cloudbase-agent-runtime
description: |
  Use when the user wants to develop, run, preview, or deploy a CloudBase
  Web app in this conversation as a Lovable-like vibe-coding session — i.e.
  any request that maps to "spin up a React+Vite project, see it live in
  the browser, iterate, deploy". Activate ONLY for browser-rendered Web
  projects based on the CloudBase official React (or Vue) + Vite template.
  Do NOT activate for: WeChat/Alipay mini-program, React Native / Flutter /
  Electron, pure cloud functions / CloudRun backends, or Next.js / Nuxt /
  Astro / Remix / SvelteKit (those frameworks are explicitly out of scope).
---

# CloudBase Agent Runtime — Web Vibe Coding

This skill orchestrates a **single working directory = single project** flow
for CloudBase Web apps. Every operation in this skill assumes the user's
current shell `cwd` IS the project root. We do NOT manage cross-cwd state,
session IDs, or workspaces — the cwd itself is the workspace.

## Activation contract

### Use this skill when

- The user says "build me a website / app", "I want to make a landing page",
  "create a React app and let me preview", "deploy this to CloudBase",
  "vibe coding with CloudBase", or similar.
- The current cwd looks like a CloudBase + Vite project (has `package.json`
  with `vite` + `react` or `vue`).
- The user is running this conversation inside a host (OpenClaw / Claude
  Code) that has both `cloudbase-mcp` registered AND the `cloudbase-vibe-*`
  binaries on PATH from this plugin.

### Do NOT use this skill when

- It's a mini-program project (`miniprogram-development` skill instead).
- It's a native app project (`http-api` skill instead).
- It's a backend-only project (`cloud-functions` or `cloudrun-development`).
- The framework is Next/Nuxt/Astro/Remix — politely tell the user this skill
  only covers Vite-based React/Vue apps and stop. Do NOT try to adapt the
  scripts to those frameworks.

## What this skill orchestrates

Think of it as three layers:

1. **CloudBase MCP tools** (provided by the `cloudbase-mcp` server registered
   in `.mcp.json`). Use these for:
   - `downloadTemplate({ template: "react" | "vue", ide: "<host>" })` — pull
     the official template into cwd.
   - `envQuery({ action: "info" })` and `auth({ action: "set_env", envId })`
     — bind a CloudBase environment.
   - `manageHosting({ action: "upload", localPath: "dist", cloudPath: "/" })`
     — deploy the build output to static hosting.
   - `envDomainManagement({ action: "create", domains: [...] })` — whitelist
     the dev origin if Web SDK calls fail with CORS.
   - All other CloudBase operations (auth, db, storage) follow the existing
     `auth-tool` / `auth-web` / `no-sql-web-sdk` skills.

2. **Plugin shell scripts** (provided by this plugin's `bin/` directory; on
   PATH automatically when the plugin is enabled). Use these — and ONLY these
   — for dev-server lifecycle:
   - `cloudbase-vibe-start-preview` — daemonize Vite on `0.0.0.0:<auto>`.
   - `cloudbase-vibe-stop-preview` — SIGTERM with SIGKILL fallback.
   - `cloudbase-vibe-restart-preview` — stop + start in one shot.
   - `cloudbase-vibe-status-preview` — JSON line of current state.

   Never invent your own `npm run dev` / `vite` invocation. The shell scripts
   handle host=0.0.0.0 forcing, port allocation, daemonization, base path
   injection, and state file management. Reinventing them will break preview
   on Lighthouse hosts and lose the recorded PID.

3. **Standard tools** (Bash, git). Use for editing files, snapshots
   (`git tag snap/<ts>`), rollback (`git reset --hard`), build (`pnpm build`).

## How dev-server lifecycle is handled

**You do NOT manage the dev server yourself.** Two host hooks do it for you:

- **SessionStart hook** (auto-runs when the conversation begins):
  - If cwd is on the danger blacklist (`$HOME`, `/`, `/tmp`, `~/Desktop`, ...) → skips silently.
  - If cwd is a Vite + React/Vue project: starts the daemon (`cloudbase-vibe-start-preview`) if not already running, otherwise reuses the live one.
  - If cwd is "empty enough" (only `.git` / `.gitignore` / `README*` / `LICENSE` allowed): auto-runs `cloudbase-vibe-init --start` which downloads the official CloudBase React template, runs `pnpm install`, and starts the daemon. **By the time you read the user's first prompt the dev server is usually live or ~10s away.**
  - If cwd is a non-Vite project: skips silently.

- **PostToolUse(Edit|Write|MultiEdit) hook**:
  - If you edited `vite.config.*` / `package.json` / `tsconfig*.json` / `tailwind.config.*` / `postcss.config.*` / `.env*` → triggers `cloudbase-vibe-restart-preview` automatically (1.5s debounced).
  - Other file edits → does nothing. Vite HMR handles them.

**Implication: you almost never need to call `cloudbase-vibe-*` scripts directly.** The hooks handle init / start / restart. You only invoke a `cloudbase-vibe-*` script when:

- The user explicitly says "stop the dev server" → `cloudbase-vibe-stop-preview`.
- The user explicitly says "what's the URL" or "is it running" → `cloudbase-vibe-status-preview`.
- The user wants to deploy → `cloudbase-vibe-deploy` (see deploy section below).

If `cloudbase-vibe-status-preview` reports the preview is unhealthy and SessionStart didn't fix it (e.g., user-level error in `vite.config.ts`), surface the JSON `logPath` to the user — never try to fix it by editing their config blindly.

## When the user just walked into the conversation

1. **Check the preview state** before doing anything else by reading `<cwd>/.cloudbase-agent/preview.json` (or run `cloudbase-vibe-status-preview --quiet`). It is overwhelmingly likely that the preview is already up — courtesy of SessionStart.

2. **Tell the user the URL**. If the file has `internalUrl`, surface it. If not (rare — SessionStart still running or skipped), inform the user the dev server is starting and ask them to wait ~10s, OR check `<cwd>/.cloudbase-agent/logs/hook-session-start.log` for the reason it skipped.

3. **DO NOT** call `cloudbase-vibe-init` or `cloudbase-vibe-start-preview` proactively in your first message. The hook already does this. Calling it again is redundant and wastes a turn (`start` is idempotent so it's safe, but `init` will fail with code 10 because cwd is no longer empty).

## When the user asks you to deploy

The deploy flow uses **two-step bridge**: local build → CloudApp deploy.

1. `bash> cloudbase-vibe-deploy` — performs `git tag snap/pre-deploy-...` + `pnpm run build`, validates `dist/`, generates a stable `serviceName` (e.g. `cb-test3-9f0d62`) on first run, and emits a JSON line with `nextAction`.
2. Read `nextAction.tool` and `nextAction.args`. The tool will be `manageApps` with `framework=static` (skips remote npm install/build — only deploys the pre-built dist/):
   ```
   manageApps({
     action: "deployApp",
     serviceName: "<stable name from app.json>",
     filePath: "<cwd>",
     buildPath: "dist",
     framework: "static",
     installCmd: "",
     buildCmd: ""
   })
   ```
3. After `manageApps` succeeds and gives you the access URL, call:
   `bash> cloudbase-vibe-deploy --post-deploy --access-url <url> [--build-id <id>]`
   This appends to `<cwd>/.cloudbase-agent/app.json`'s `deployHistory`, tags git with `deploy/<ts>`, and returns a `finalUrl` with cache-busting query.
4. Show `finalUrl` to the user. Optionally suggest the user can further polish the design by asking you to apply the **CloudBase UI design skill** (`ui-design`) for a more polished look.
5. After deployment, proactively ask: "要我在部署后的基础上用 UI 设计能力进一步优化样式和体验吗？"

**Why `manageApps(framework=static)` not `manageHosting`?** Each `manageApps` service gets its own independent `*.webapps.tcloudbase.com` subdomain — no path collisions between vibe sessions, and no need to bind a custom domain just for isolation. Since the local build already produced `dist/`, we pass `installCmd=""` and `buildCmd=""` to skip remote build steps; only the `tcb hosting deploy` step runs in the cloud. If that still fails, fall back to `manageHosting` + bind a custom domain.

**If `manageApps` fails with "no envId" or env-related error:** call `envQuery({ action: "info" })` once. If multiple envs exist, ask the user to pick. After the env is bound, retry.

**If `manageApps` builds FAILED:** call `queryApps({ action: "getBuildLog", serviceName, buildId })` to diagnose. Common cause is the remote `tcb hosting deploy` step failing — fall back to `manageHosting` upload in that case.

Never bypass `cloudbase-vibe-deploy` with your own `pnpm build` + manual `manageApps` — you would lose the snapshot, deploy history, and serviceName stability.

## Proactive deploy suggestion

When you finish a user-requested feature (especially "make me a X app", "build me a Y", "add Z feature"), end your reply by asking the user **whether to deploy**:

> 现在这版要部署看一下吗?(部署到 CloudApp,会得到一个独立的可分享 URL)

Do NOT deploy unsolicited — only after the user explicitly says yes. The reason for asking is to make sharing as low-friction as possible, similar to Lovable: the user shouldn't have to learn that "deploy" is a separate action they need to ask for.

Skip the suggestion when:
- The work was a bug fix or small refactor (no new feature).
- The user already deployed in this conversation and the change since then is trivial.
- The user explicitly said "don't deploy yet" earlier.

## Proactive verification suggestion

After finishing a feature, do NOT spend turns on writing or running automated UI tests / playwright / agent-browser by default. Instead end your reply by asking the user **whether to verify in a browser**:

> 现在这版要不要我用内置浏览器打开 <internalUrl> 帮你点一遍验证一下?

Skip when:
- The user already said "no tests" / "skip tests" earlier.
- The change was config-only or non-visual.
- The user is mid-iterating and obviously wants to keep editing.

Only after explicit consent should you spawn a browser-driving tool. The first version of a vibe-coding app is judged by "does the user see the UI working in the dev server", not by passing tests.

## Data persistence — BaaS-first

When the feature needs to store / query / update data:

1. **Create the schema via cloudbase-mcp.** Call:
   ```
   writeNoSqlDatabaseStructure({
     action: "createCollection",
     collectionName: "todos"
   })
   ```
   And add indexes via `updateCollection` with `updateOptions.CreateIndexes`. Do NOT ask the user to create collections in the console.
2. **Read/write via Web SDK directly from the React/Vue code.** The template ships an initialized `@cloudbase/js-sdk` at `src/utils/cloudbase.ts`. Use it:
   ```ts
   import { db } from "@/utils/cloudbase";
   await db.collection("todos").add({ text, done: false, createdAt: Date.now() });
   const { data } = await db.collection("todos").orderBy("createdAt", "desc").get();
   db.collection("todos").watch({ onChange: (snap) => setTodos(snap.docs) });
   ```
3. **For auth**: follow `auth-tool` skill first (provider check), then `auth-web` for client code.

**Do NOT add a cloud function** unless ALL of these are true:
(a) the logic absolutely cannot be expressed as database security rules;
(b) it needs server-side secrets / third-party APIs (e.g. payment, SMS);
(c) it's a scheduled / background job, not user-triggered.

A Todo app, Notes app, Chat app, Kanban etc. live ENTIRELY in the JS SDK + database rules. Adding a cloud function "just to be safe" is over-engineering and slows the user.

## When the conversation ends

Do nothing. The dev server is daemonized (PPID=1) and survives. The next SessionStart will detect it's still running and reuse it — the user comes back to a live URL with no startup delay.

## Hard rules

1. **Never** spawn `npm run dev` / `vite` / `vite build` yourself. Dev-server lifecycle is owned by the SessionStart and PostToolUse hooks; build/deploy is owned by `cloudbase-vibe-deploy`. Bypassing them loses host=0.0.0.0 forcing, port allocation, daemonization, snapshot, and deploy history.

2. **Never** edit the user's `vite.config.*` to set `server.host` or `base`.
   The CLI flags from `start-preview` already override config. If the user's
   config conflicts (for example `server.host: false`), surface error code 4
   from start-preview and ask the user to relax that config — do NOT silently
   patch their file.

3. **Never** touch the `~/.cloudbase-agent/` global directory. State lives
   in `<cwd>/.cloudbase-agent/preview.json`. Each cwd is independent.

4. **Always** parse stdout of `cloudbase-vibe-*` scripts as a single JSON
   line. The first line of stdout is the machine-readable result. The
   stderr `[cloudbase-agent] ...` line is for humans only — do not parse it.

5. **Always** surface `logPath` to the user when a script reports failure.
   Don't guess the cause from a one-line error — point them at the log file.

## Error codes from the bin scripts

| code | meaning | recovery |
|---|---|---|
| 1 | generic failure | check the message |
| 2 | not a Vite project (or `vite` binary missing) | `pnpm install` then retry |
| 3 | port pool exhausted in 17173..17272 | `cloudbase-vibe-stop-preview` for stale ones, or pass `--port` |
| 4 | dev server failed health check in 30s | read `logPath`; usually a build error in user code |
| 5 | no preview is running (status / stop) | start one with `cloudbase-vibe-start-preview` |
| 6 | stop failed (process refused SIGKILL) | check the PID manually with `ps`; very rare |
| 7 | build failed (`cloudbase-vibe-deploy`) | inspect build output in this terminal; fix code, retry |
| 8 | `dist/` missing or empty after build | confirm `scripts.build` runs `vite build`; rerun |

## State files (for debugging)

- `<cwd>/.cloudbase-agent/preview.json` — current preview state.
- `<cwd>/.cloudbase-agent/logs/preview-<timestamp>.log` — Vite stdout/stderr.
- `<cwd>/.cloudbase-agent/logs/hook-restart.log` — restart trigger trail (PostToolUse hook).
- `<cwd>/.cloudbase-agent/restart.lock` — debounce lock for the hook (1.5s window).

These are owned by the scripts. If the user asks "show me the dev log",
open the path from `status-preview`'s JSON output.

## Hook & monitor behavior (auto-driven, model is passive)

This plugin ships two host-driven mechanisms; the model itself does NOT need
to invoke them, but should be aware they exist:

- **PostToolUse hook** (`hooks/hooks.json`): when the model edits a file via
  `Edit` / `Write` / `MultiEdit`, the host fires `hooks/on-file-change.sh`.
  The hook checks the edited file path; if it's a config file (`vite.config.*`,
  `tailwind.config.*`, `postcss.config.*`, `package.json`, `tsconfig*.json`,
  `.env*`), it triggers `cloudbase-vibe-restart-preview` in the background
  with a 1.5s debounce. The model does NOT need to manually restart on
  config edits — the hook handles it. If the host doesn't support hooks,
  fall back to manually calling restart per the rule above.

- **Vite log monitor** (`monitors/monitors.json`, EXPERIMENTAL): the host
  tails the latest `<cwd>/.cloudbase-agent/logs/preview-*.log` and forwards
  each new line to the model as a notification. The model can use this to
  proactively report build errors / HMR failures without the user asking.
  ⚠️ This relies on the host's monitor implementation honoring the project
  cwd; if monitor lines do not appear in the conversation, treat it as not
  available and fall back to `cloudbase-vibe-status-preview` on demand.

## What this skill is NOT

- It is **not** a session manager. There is no sessionId. There is only cwd.
- It is **not** a reverse proxy. If the host is on Lighthouse and the user
  needs `0.0.0.0:8080/s/<sid>/` style routing, that's a separate runtime
  component (`cloudbase-agent-proxy`, see project README) — out of scope here.
- It is **not** a CloudBase auth/database guide. For those, route to the
  existing `auth-web`, `auth-tool`, `no-sql-web-sdk` skills.
- It is **not** a UI design guide. For visual decisions, route to `ui-design`.
