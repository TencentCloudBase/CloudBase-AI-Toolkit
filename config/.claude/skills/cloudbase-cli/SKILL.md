---
name: cloudbase-cli
description: CloudBase CLI (tcb, 云开发CLI, Tencent CloudBase命令行) resource management skill. Use when deploying cloud functions, CloudRun, storage, NoSQL/MySQL, static hosting, permissions, CORS/domains via tcb; for CI/CD and batch ops; when the user prefers CLI; or as the first-session fallback when CloudBase MCP tools are not loaded yet (after install/config, before IDE restart). Also covers tcb login and site switching (国内站/国际站 via --intl or config isIntl), environment lifecycle (env create/modify/renew/delete/apikey/login/domain), tcb config and cloudbaserc.json sync, log search (logs search, CLS), metric monitoring (monitor), data model and PostgreSQL migrations (db model, db pg migration), sandbox/agent/integration management — do not default to tcb deploy.
version: 2.35.2
license: MIT
alwaysApply: false
---

# CloudBase CLI

Manage CloudBase resources via `tcb` CLI — deterministic, scriptable, auditable.
Primary interface for CI/CD and batch ops; **also the first-session fallback** when MCP tools are not yet available in the conversation.

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

**Cross-cutting protocols** (required before code changes or deployments):
- Change Safety Protocol: `../cloudbase-platform/references/protocols/change-safety-protocol.md`
- Deployment Gate: `../cloudbase-platform/references/protocols/deployment-gate.md`
- MCP vs CLI fallback: `../cloudbase/references/tooling-fallback.md` (packaged beside this skill as the `cloudbase` entry guideline)

**Route, do not improvise** — when a task belongs to another skill, hand over instead of guessing flags here:
- PostgreSQL schema / RLS / `pgstore` → `../postgresql-development-cloudbase/SKILL.md`
- Data-model design (ER / Mermaid) → `../data-model-creation/SKILL.md`
- In-app SDK code (web / miniprogram / node) → the matching SDK skill

## Core Principles

1. **`--help` first — but its failure does NOT mean the command is missing.**
   Run `tcb <command> --help` to check parameters and find official doc links. On current CLI versions many
   **second-level** commands reject `--help` (`error: unknown option '--help'`), while some accept `-h`, and
   `tcb help <cmd>` only works one level deep. Try `-h`, then `tcb help <cmd>`, then
   `tcb docs search "<keyword>"` — never conclude a command does not exist from a help error.
   `tcb --help` itself is a **hand-maintained static list**, so absence from it says nothing about
   lifecycle: `init`, `pull`, `new`, `open`, `rollback`, `self-update`, `monitor`, `integration`,
   `service`, `cloudfunction`, `cloudrunfunction` and `run:deprecated` are all registered yet unlisted.
   **Absence from help ≠ deprecated**, and **"no marker" ≠ endorsed** — the statuses differ:
   `tcb monitor` / `tcb integration` are **officially supported** (recommend normally), while
   `tcb service` and `tcb cloudfunction` / `tcb cloudrunfunction` are **not recommended**
   (product decision, no code marker). Full status table: `references/core.md`.

2. **Confirm the site (国内站 / 国际站) as well as the envId.**
   A credential from one site does not work on the other, and the failure looks like an auth error.
   One-off: `tcb login --intl true|false`; persistent: `tcb config set isIntl true|false`.
   Pick one mechanism and keep it consistent — see `references/core.md` / `references/config.md`.

3. **Deployment Gate.**
   Before any deployment, publish, custom domain, or CloudRun operation, you must first complete the checks in `cloudbase-platform/references/protocols/deployment-gate.md`.

4. **Verify your work.**
   After deploying or modifying any resource, run the corresponding list/detail
   command to confirm the change took effect.

5. **Dry-run before destructive actions.**
   Use `--dry-run` for delete/overwrite operations. Show the preview to the user
   and wait for explicit confirmation before executing.

6. **Confirm environment first.**
   Always verify envId with the user before operations. Run `tcb env use <envId>`
   to avoid accidentally modifying production.

7. **Recover from errors, don't loop.**
   If a command fails after 2-3 attempts, check the exit code (`$?`), read the
   error message, consult `tcb docs search`, and try a different approach.

8. **First-session fallback, not MCP replacement.**
   If CloudBase MCP tools are missing in this session, use this skill to unblock
   login/manage. Still configure MCP (plugin / mcp.json) so the **next** session
   can prefer MCP. When MCP tools are already available, prefer MCP unless the
   user asked for CLI/CI. Route deploy work through the domain reference table
   below — **do not** recommend `tcb deploy`.

9. **No npm/npx.**
   If Node/npm/npx are missing, tell the user to install Node.js LTS (or use the
   IDE marketplace MCP path) before retrying CLI/plugin install. See guideline
   `tooling-fallback.md`.

## When to use this skill

Use when the user wants to manage CloudBase resources via command line, **or** when MCP is not usable yet:
- **First session / post-install:** MCP not in the tool list, or just configured and needs restart → `tcb login` + the matching domain command now; leave MCP ready for next session
- Deploy/debug cloud functions, static hosting, CloudRun services (via domain refs — not `tcb deploy`)
- Manage storage, hosting, databases (NoSQL / MySQL / PostgreSQL), data models and migrations
- Manage environments (create / package / renew / destroy, API Keys, login policy, safe domains, usage)
- Configure resource authorization (`tcb policy`), roles, users, CORS, domains, routing
- Search logs and read monitoring metrics
- Manage sandbox, agent and integration instances
- CI/CD scripting, batch operations, terminal-based resource management
- User explicitly prefers CLI over MCP

## Do NOT use for

- SDK-based in-app integration (web/miniprogram/node) → use `cloud-functions`,
  `cloudbase-document-database-web-sdk`, `auth-web-cloudbase`, etc.
- PostgreSQL schema design, RLS and migration workflow → `postgresql-development-cloudbase`
- When CloudBase MCP tools are already available in this session and the user did not ask for CLI → prefer MCP
- Console UI operations
- CloudBase Agent SDK development → use `cloudbase-agent-ts`

## How to use this skill (for a coding agent)

1. **Always load `references/core.md` first** — it covers authentication, site selection,
   environment switching, `tcb docs` queries, and error diagnosis.
2. **Route to the correct reference** using the Routing table below.
3. **Load only the reference files** that match the user's task. Do not preload all of them.
4. **Stop loading more context** once you have the workflow and command syntax for the current task.
5. **If the task shifts to SDK/in-app code or PostgreSQL design**, switch to the appropriate
   sibling skill instead.

## Routing

| User Task | Read |
|-----------|------|
| Login, site (国际站/国内站), env switching, `tcb docs`, error diagnosis | `references/core.md` |
| Create / modify / renew / destroy an environment, API Keys, login policy, safe domains, usage | `references/env.md` |
| `tcb config` (CLI settings, `cloudbaserc.json` sync), `tcb init` / `new` / `pull` / `open` / `validate` / `self-update` / `rollback` | `references/config.md` |
| Configure an AI tool + MCP + Skills (`tcb ai`) | `references/config.md` |
| Deploy/debug cloud functions, versions, provisioned concurrency, layers, triggers | `references/functions.md` |
| Deploy static site / SPA (preferred CLI web path) | `references/hosting.md` |
| Deploy CloudRun service, traffic/canary, versions, build & runtime logs | `references/cloudrun.md` |
| Experimental all-in-one web shorthand (`tcb deploy`, `tcb app build`) — avoid unless the user asks | `references/app.md` |
| Upload/download files, ACL rules, COS vs PG object storage | `references/storage.md` |
| NoSQL (MongoDB) database operations, collection dump | `references/nosql.md` |
| MySQL instance, SQL execution, backups, slow queries | `references/mysql.md` |
| Data model definitions, `sync-model-dts`, PostgreSQL migrations | `references/schema.md` |
| Search logs (CLS: functions / CloudRun / database / auth / LLM / gateway) | `references/logs.md` |
| Metric monitoring (functions, CloudRun, DB, hosting, auth, gateway…) | `references/monitor.md` |
| Resource authorization (`tcb policy`), roles, users | `references/permission.md` |
| CORS, custom domains, CDN cache purge, routing rules (`tcb routes`) | `references/access.md` |
| `tcb service` (HTTP 访问服务) — ⚠️ **not recommended**; read `access.md` for the `routes`/`domains` equivalent | `references/access.md` |
| WeDa / 微搭 low-code apps and components (`tcb lowcode`) | `references/lowcode.md` |
| Sandbox tools / instances / API keys | `references/sandbox.md` |
| Agent create / update / delete | `references/agent.md` |
| Integration instances (types, create, bind, delete) | `references/integration.md` |
| PostgreSQL schema / RLS / migration workflow (not just the CLI flags) | `../postgresql-development-cloudbase/SKILL.md` |

## Quick workflow

1. `tcb login` (check the site) → confirm envId with the user → `tcb env use <envId>`
2. Look up the command in the matching reference; verify syntax with `tcb <command> --help` (or `-h`)
3. Execute the command (with `--dry-run` for destructive ops)
4. Verify the result with the corresponding `list` / `detail` command
5. Report the outcome to the user

## Minimum self-check

- [ ] Loaded `references/core.md` before any domain module?
- [ ] Confirmed the site (`isIntl`) and the target envId with the user?
- [ ] Checked that `--help` failure was not misread as "command missing"?
- [ ] Used `--dry-run` before destructive operations?
- [ ] For PG environments: switched to the PostgreSQL skill instead of reusing NoSQL/MySQL paths?
- [ ] Verified the result after each operation?
- [ ] Stayed within CLI scope — did not drift into SDK code?

## Reference index

All packaged reference files (required for skill lint reachability):

- [access.md](references/access.md)
- [agent.md](references/agent.md)
- [app.md](references/app.md)
- [cloudrun.md](references/cloudrun.md)
- [config.md](references/config.md)
- [core.md](references/core.md)
- [env.md](references/env.md)
- [functions.md](references/functions.md)
- [hosting.md](references/hosting.md)
- [integration.md](references/integration.md)
- [logs.md](references/logs.md)
- [lowcode.md](references/lowcode.md)
- [monitor.md](references/monitor.md)
- [mysql.md](references/mysql.md)
- [nosql.md](references/nosql.md)
- [permission.md](references/permission.md)
- [sandbox.md](references/sandbox.md)
- [schema.md](references/schema.md)
- [storage.md](references/storage.md)
