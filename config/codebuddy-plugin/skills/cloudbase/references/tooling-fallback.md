# MCP vs CLI Tooling Fallback

CloudBase management can go through **MCP** (preferred when available) or **`tcb` CLI** (first-session / unavailable fallback). Use this decision tree so agents do not stall when MCP is not yet loaded into the current conversation.

## Why this exists

- MCP config (plugin install, `mcp.json`, env vars) often needs a **session restart** before tools appear.
- First conversations frequently have Skills/rules but **no CloudBase MCP tools** yet.
- `tcb` CLI covers the critical path for this session: login (`tcb login`), env binding (`tcb env use`), and domain deploy/manage commands documented in sibling skills.

Do **not** block the user waiting for a restart when CLI (or another documented path) can finish login or deploy now.

## Decision tree (run at the start of management / deploy work)

```
1. Probe MCP in THIS session
   - IDE: CloudBase tools visible (auth, envQuery, manageFunctions, …)
   - or: npx mcporter list | grep cloudbase  AND describe/call succeeds
     (if `npx` / `npm` missing → see "No npm/npx" below; do not stall)
2. MCP tools usable now?
   ├── YES → Prefer MCP (inspect schemas, then call). Skip CLI for the same action.
   └── NO  → Continue below (do not spin on missing tools)
3. Is MCP configured for the IDE / mcporter?
   ├── NO  → Install/configure MCP now (see mcp-setup.md), tell user a restart
   │         will unlock MCP next session, THEN use CLI for this session.
   └── YES → Tell user MCP should work after restart / reload; use CLI now.
4. CLI path for this session
   - Read sibling skill `cloudbase-cli` (local relative path) — start with
     `references/core.md`, then load ONLY the matching domain reference
   - Ensure `tcb` is installed (see install notes below)
   - `tcb login` (device code by default) → confirm envId → `tcb env use <envId>`
   - Deploy / manage by following that domain skill — do NOT invent shortcuts
5. After the user restarts the session
   - Re-probe MCP; if available, switch back to MCP-first for new work
```

## Probe rules (keep cheap)

Treat MCP as **unavailable in this session** when any of these hold:

- No CloudBase MCP tools in the tool list / ToolSearch results
- `auth` / `envQuery` / deploy tools return “unknown tool” or connection errors after one verify attempt
- User just finished MCP install/config and has not restarted

Do **not** require the user to paste env vars into MCP JSON before you can proceed — configure MCP for later, use CLI now.

## Mapping (common actions)

| Goal | MCP (when available) | CLI fallback — read skill, do not guess |
|------|----------------------|------------------------------------------|
| Login | `auth` (`start_auth` / device) | `cloudbase-cli` → `core.md` (`tcb login`) |
| Bind / select env | `auth.set_env` + `envQuery` | `cloudbase-cli` → `core.md` (`tcb env use`) |
| Cloud function deploy | `manageFunctions` / `queryFunctions` | `cloud-functions` + `cloudbase-cli` → `functions.md` |
| Web / static hosting | `manageApps` / `manageHosting` | `cloudbase-cli` → `hosting.md` (build locally, then hosting deploy) |
| CloudRun | `manageCloudRun` / `queryCloudRun` | `cloudbase-cli` → `cloudrun.md` |
| Storage | storage MCP tools | `cloudbase-cli` → `storage.md` |

**Do not recommend `tcb deploy`.** That shorthand is immature. Always open the matching domain skill above and follow its commands (`tcb fn deploy`, `tcb hosting deploy`, CloudRun commands, etc.).

Load only the `cloudbase-cli` reference that matches the task (`core.md` first, then one domain file). For function runtime details, also read `cloud-functions`.

## No npm / npx (toolchain missing)

Plugin install, mcporter, and `@cloudbase/cli` normally need Node.js + npm/npx. If those are missing:

1. **Detect** — `command -v node`, `command -v npm`, `command -v npx` all fail (or only `node` exists without npm).
2. **Tell the user clearly** — CloudBase CLI / `npx` plugin install need a Node.js LTS toolchain.
3. **Recommend install (pick what fits the OS)** — then re-check `node -v` / `npm -v`:
   - macOS: `brew install node` or install LTS from https://nodejs.org
   - Windows: install LTS from https://nodejs.org (or `winget install OpenJS.NodeJS.LTS`)
   - Linux: distro Node LTS, or https://nodejs.org, or `nvm` / `fnm`
   - Or version managers: `nvm`, `fnm`, `asdf` — install Node LTS, ensure shell PATH is updated
4. **MCP without waiting on npm** (still configure for next session):
   - Prefer the IDE’s **native plugin / marketplace** path when available (see `mcp-setup.md`: Claude Code / Codex marketplace, Cursor MCP UI, etc.) — these do not require the user to run `npx` by hand.
   - Or hand-write IDE MCP config with a full `node` path once Node is installed (`mcp-setup.md` Approach A).
5. **CLI after Node is available** — `npm i -g @cloudbase/cli`, then `tcb login` … If the user refuses to install Node, stop automating deploy/login via CLI and give console links + ask them to install Node or enable MCP via IDE marketplace; do not loop on `npx` failures.

Do **not** pretend `npx` works when it is absent. One clear install suggestion beats repeated failed commands.

## CLI / tcb install notes

When npm is available:

- Global: `npm i -g @cloudbase/cli`
- Or project-local / `npx`-style invocation if the project already depends on the CLI

Always confirm `tcb --version` (or equivalent) before `tcb login`.

## Hard rules

1. **MCP when present, CLI when not** — never invent a third path (raw SecretId in MCP config as the default).
2. **Always configure MCP if missing** — even when falling back to CLI, leave the next session MCP-ready (`mcp-setup.md`).
3. **Always pass envId explicitly** — do not rely on implicit CLI selection in generated app code; still confirm envId with the user for CLI ops.
4. **Do not loop** — after 1–2 failed MCP probes, fall back; do not retry MCP setup 5+ times in the same turn.
5. **Safety unchanged** — Deployment Gate and Change Safety Protocol still apply whether you use MCP or CLI.
6. **Schema/admin still management-plane** — browser SDKs are not a substitute for creating collections/tables; use MCP or CLI management commands, not console-only handoffs when automation is possible.
7. **No `tcb deploy` shortcut** — route through domain skills; never default the agent to `tcb deploy`.
8. **No silent npm assumption** — if npm/npx is missing, surface the Node install path (or IDE marketplace MCP) before retrying.

## What not to change

- In-app SDK work (Web / mini program / Node) stays on the matching SDK skills.
- When MCP tools **are** available, do not prefer CLI “for convenience” unless the user explicitly asks for CLI / CI scripting.
