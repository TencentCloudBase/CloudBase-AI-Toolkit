---
name: cloudbase-cli
description: CloudBase CLI (tcb, 云开发CLI, Tencent CloudBase命令行) resource management skill. This skill should be used when users need to deploy cloud functions, manage CloudRun apps, upload files to storage, query NoSQL/MySQL databases, deploy static hosting, set access permissions, or configure CORS/domains/routing via tcb commands. Also use for CI/CD pipeline scripting, batch operations, terminal-based CloudBase management, or when the user prefers CLI over SDK/MCP.
version: 1.0.0
alwaysApply: false
---

# CloudBase CLI

Manage CloudBase resources via `tcb` CLI — deterministic, scriptable, auditable.
The preferred interface for AI agents in CI/CD, batch operations, and resource management.

## ⚠️ Capability Check: CLI vs MCP

**Before using this skill, verify that CloudBase CLI (`tcb`) is available in the current environment.**

### Check Runtime Capabilities

If the environment provides a capability notice, check which are enabled/disabled:

| Capability | If Enabled | If Disabled |
|------------|------------|-------------|
| CloudBase CLI (`tcb`) | Use this skill (CLI commands) | **Use MCP tools instead** (see Alternative below) |
| CloudBase MCP tools | MCP tools available | Use CLI or SDK |

### Quick Check

Run `tcb --version` to verify CLI availability:
- If it returns a version (e.g., `3.x.x`), CLI is available — proceed with this skill
- If it returns "command not found" or similar, CLI is **not available** — use MCP tools instead

### Alternative: Use MCP Tools When CLI Is Unavailable

If CLI is disabled but MCP tools are enabled, use the equivalent MCP tools:

| CLI Command | MCP Tool Equivalent |
|-------------|---------------------|
| `tcb permission get` | `queryPermissions(action="getResourcePermission")` |
| `tcb permission set` | `managePermissions(action="updateResourcePermission")` |
| `tcb role list/get/create/update/delete` | `queryPermissions(action="listRoles")` / `managePermissions(action="createRole"/"updateRole"/"deleteRole")` |
| `tcb user list/create/update/delete` | `queryPermissions(action="listUsers")` / `managePermissions(action="createUser"/"updateUser"/"deleteUser")` |
| `tcb function list/deploy/delete` | `queryFunctions(action="list")` / `manageFunctions(action="createFunction"/"updateFunctionCode"/"deleteFunction")` |
| `tcb env list/info` | `envQuery(action="list")` / `envQuery(action="info")` |
| `tcb storage list/upload/download/delete` | `queryStorage(action="list")` / `manageStorage(action="upload"/"download"/"delete")` |
| `tcb hosting list/deploy/delete` | `uploadFiles` / `findFiles` / `deleteFiles` |

**To use MCP tools**: Search for CloudBase tools in your IDE (e.g., `ToolSearch` with keyword "cloudbase") or use `npx mcporter call cloudbase.<tool>`.

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-cli/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `cloud-functions` or `cloudrun-development`, use the standalone fallback URL shown next to that reference.

## Core Principles

1. **`--help` first — never guess commands.**
   tcb CLI changes between versions. Before using any command for the first time,
   run `tcb <command> --help` to check parameters and discover official doc links.

2. **Verify your work.**
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

## When to use this skill

Use when the user wants to manage CloudBase resources via command line:
- Deploy/debug cloud functions, web apps, CloudRun services
- Manage storage, hosting, databases (NoSQL/MySQL)
- Configure permissions, CORS, domains, routing
- CI/CD scripting, batch operations, terminal-based resource management

## Do NOT use for

- SDK-based in-app integration (web/miniprogram/node) → use `cloud-functions`,
  `no-sql-web-sdk`, `auth-web`, etc.
- MCP tool calls for IDE-integrated workflows → use CloudBase MCP directly
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
   SDK skill (e.g., `cloud-functions`, `no-sql-web-sdk`) instead.

## Routing

| User Task | Read |
|-----------|------|
| Login, env switching, tcb docs, error diagnosis | `references/core.md` |
| Deploy/debug cloud functions | `references/functions.md` |
| Deploy web app (React/Vue/Next.js) | `references/app.md` |
| Deploy CloudRun service | `references/cloudrun.md` |
| Deploy static site | `references/hosting.md` |
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
