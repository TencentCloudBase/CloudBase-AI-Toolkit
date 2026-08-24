---
name: cloudbase-cli
description: CloudBase CLI (tcb, 云开发CLI, Tencent CloudBase命令行) resource management skill. Use when deploying cloud functions, CloudRun, storage, NoSQL/MySQL, static hosting, permissions, CORS/domains via tcb; for CI/CD and batch ops; when the user prefers CLI; or as the first-session fallback when CloudBase MCP tools are not loaded yet (after install/config, before IDE restart). Covers tcb login (device code for Tencent Cloud accounts; --cloudbase-api-key -e for environment API Key without an account; --apiKeyId/--apiKey for CI) and domain commands (fn/hosting/cloudrun/…) as MCP auth/manage parity — do not default to tcb deploy.
version: 2.31.0
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

## Core Principles

1. **`--help` first — never guess commands.**
   tcb CLI changes between versions. Before using any command for the first time,
   run `tcb <command> --help` to check parameters and discover official doc links.

2. **Deployment Gate.**
   Before any deployment, publish, custom domain, or CloudRun operation, you must first complete the checks in `cloudbase-platform/references/protocols/deployment-gate.md`.

3. **Verify your work.**
   After deploying or modifying any resource, run the corresponding list/detail
   command to confirm the change took effect.

3. **Dry-run before destructive actions.**
   Use `--dry-run` for delete/overwrite operations. Show the preview to the user
   and wait for explicit confirmation before executing.

4. **Confirm environment first.**
   Always verify envId with the user before operations. Run `tcb env use <envId>`
   to avoid accidentally modifying production.

5. **Recover from errors, don't loop.**
   If a command fails after 2-3 attempts, check the exit code (`$?`), read the
   error message, consult `tcb docs search`, and try a different approach.

6. **First-session fallback, not MCP replacement.**
   If CloudBase MCP tools are missing in this session, use this skill to unblock
   login/manage. Still configure MCP (plugin / mcp.json) so the **next** session
   can prefer MCP. When MCP tools are already available, prefer MCP unless the
   user asked for CLI/CI. Route deploy work through the domain reference table
   below — **do not** recommend `tcb deploy`.

7. **No npm/npx.**
   If Node/npm/npx are missing, tell the user to install Node.js LTS (or use the
   IDE marketplace MCP path) before retrying CLI/plugin install. See guideline
   `tooling-fallback.md`.

## When to use this skill

Use when the user wants to manage CloudBase resources via command line, **or** when MCP is not usable yet:
- **First session / post-install:** MCP not in the tool list, or just configured and needs restart → `tcb login` + the matching domain command now; leave MCP ready for next session
- Deploy/debug cloud functions, static hosting, CloudRun services (via domain refs — not `tcb deploy`)
- Manage storage, hosting, databases (NoSQL/MySQL)
- Configure permissions, CORS, domains, routing
- CI/CD scripting, batch operations, terminal-based resource management
- User explicitly prefers CLI over MCP

## Do NOT use for

- SDK-based in-app integration (web/miniprogram/node) → use `cloud-functions`,
  `cloudbase-document-database-web-sdk`, `auth-web-cloudbase`, etc.
- When CloudBase MCP tools are already available in this session and the user did not ask for CLI → prefer MCP
- Console UI operations
- CloudBase Agent SDK development → use `cloudbase-agent-ts`

## How to use this skill (for a coding agent)

1. **Always load `references/core.md` first** — it covers authentication,
   environment switching, `tcb docs` queries, and error diagnosis.
2. **Route to the correct domain reference** using the Routing table below.
3. **Load only the one reference file** that matches the user's task.
   Do not preload all references.
4. **Stop loading more context** once you have the workflow and command
   syntax for the current task.
5. **If the task shifts to SDK/in-app code**, switch to the appropriate
   SDK skill (e.g., `cloud-functions`, `cloudbase-document-database-web-sdk`) instead.

## Routing

| User Task | Read |
|-----------|------|
| Login, env switching, tcb docs, error diagnosis | `references/core.md` |
| Deploy/debug cloud functions | `references/functions.md` |
| Deploy static site / SPA (preferred CLI web path) | `references/hosting.md` |
| Deploy CloudRun service | `references/cloudrun.md` |
| Experimental all-in-one web shorthand (`tcb deploy`) — avoid unless user explicitly asks | `references/app.md` |
| Upload/download files, ACL rules | `references/storage.md` |
| NoSQL (MongoDB) database operations | `references/nosql.md` |
| MySQL database operations | `references/mysql.md` |
| Roles, policies, access control | `references/permission.md` |
| CORS, custom domains, routing rules | `references/access.md` |

## Quick workflow

1. `tcb login` → confirm envId with user → `tcb env use <envId>`
2. `tcb <command> --help` to verify syntax
3. Execute the command (with `--dry-run` for destructive ops)
4. Verify the result with the corresponding `list` / `detail` command
5. Report the outcome to the user

## Minimum self-check

- [ ] Loaded `references/core.md` before any domain module?
- [ ] Confirmed target envId with the user?
- [ ] Used `--help` for unfamiliar commands?
- [ ] Used `--dry-run` before destructive operations?
- [ ] Verified the result after each operation?
- [ ] Stayed within CLI scope — did not drift into SDK code?

## Reference index

All packaged reference files (required for skill lint reachability):

- [access.md](references/access.md)
- [app.md](references/app.md)
- [cloudrun.md](references/cloudrun.md)
- [core.md](references/core.md)
- [functions.md](references/functions.md)
- [hosting.md](references/hosting.md)
- [mysql.md](references/mysql.md)
- [nosql.md](references/nosql.md)
- [permission.md](references/permission.md)
- [storage.md](references/storage.md)
