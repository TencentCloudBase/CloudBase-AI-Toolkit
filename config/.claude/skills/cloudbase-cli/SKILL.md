---
name: cloudbase-cli
description: CloudBase CLI (tcb, 云开发CLI, Tencent CloudBase命令行) resource management skill. This skill should be used when users need to deploy cloud functions, manage CloudRun apps, upload files to storage, query NoSQL/MySQL databases, deploy static hosting, set access permissions, or configure CORS/domains/routing via tcb commands. Also use for CI/CD pipeline scripting, batch operations, terminal-based CloudBase management, or when the user prefers CLI over SDK/MCP.
version: 1.0.0
alwaysApply: false
---

# CloudBase CLI

Manage CloudBase resources via `tcb` CLI — deterministic, scriptable, auditable.
The preferred interface for AI agents in CI/CD, batch operations, and resource management.

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

## CLI → MCP Tool Mapping (when CLI is disabled)

When the runtime environment disables CLI (e.g., MCP-only mode), use these MCP tool equivalents instead of `tcb` commands:

### Permission & Role Management

| CLI Command | MCP Tool Equivalent |
|-------------|---------------------|
| `tcb role list` | `queryPermissions(action="listRoles")` |
| `tcb role get --id <roleId>` | `queryPermissions(action="getRole", roleId="<roleId>")` |
| `tcb role get --identity <identity>` | `queryPermissions(action="getRole", roleIdentity="<identity>")` |
| `tcb role get --name <name>` | `queryPermissions(action="getRole", roleName="<name>")` |
| `tcb role create --name <n> --identity <i>` | `managePermissions(action="createRole", roleName="<n>", roleIdentity="<i>", policies=[...], memberUids=[...])` |
| `tcb role update --id <id> --add-users` | `managePermissions(action="updateRole", roleId="<id>", memberUids=[...])` or `managePermissions(action="addRoleMembers", ...)` |
| `tcb role update --id <id> --add-policies` | `managePermissions(action="addRolePolicies", roleId="<id>", policies=[...])` |
| `tcb role delete <ids...>` | `managePermissions(action="deleteRoles", roleIds=[...])` |
| `tcb permission get table:users` | `queryPermissions(action="getResourcePermission", resourceType="sqlDatabase", resourceId="users")` |
| `tcb permission get collection:posts` | `queryPermissions(action="getResourcePermission", resourceType="noSqlDatabase", resourceId="posts")` |
| `tcb permission set table:users --level readonly` | `managePermissions(action="updateResourcePermission", resourceType="sqlDatabase", resourceId="users", permission="READONLY")` |

### User Management

| CLI Command | MCP Tool Equivalent |
|-------------|---------------------|
| `tcb user list` | `queryPermissions(action="listUsers")` |
| `tcb user list --name <name>` | `queryPermissions(action="listUsers", username="<name>")` |
| `tcb user update <uid> --status BLOCKED` | `managePermissions(action="updateUser", uid="<uid>", userStatus="BLOCKED")` |

### Function Management

| CLI Command | MCP Tool Equivalent |
|-------------|---------------------|
| `tcb fn list` | `queryFunctions(action="listFunctions")` |
| `tcb fn detail <name>` | `queryFunctions(action="getFunction", functionName="<name>")` |
| `tcb fn logs <name>` | `queryFunctions(action="getFunctionLogs", functionName="<name>")` |
| `tcb fn deploy` | `manageFunctions(action="updateFunctionCode", functionRootPath="...", functionName="...")` |
| `tcb fn create` | `manageFunctions(action="createFunction", ...)` |

### Database Operations

| CLI Command | MCP Tool Equivalent |
|-------------|---------------------|
| `tcb db list` | `readNoSqlDatabaseStructure(action="listCollections")` |
| `tcb db query <collection>` | `readNoSqlDatabaseContent(collection="<collection>", ...)` |
| `tcb mysql query "SELECT..."` | `querySqlDatabase(action="executeReadSQL", statement="SELECT...")` |

### Storage & Hosting

| CLI Command | MCP Tool Equivalent |
|-------------|---------------------|
| `tcb hosting deploy ./dist` | `uploadFiles(localPath="./dist", cloudPath="/")` |
| `tcb storage upload ./file.txt /path` | `manageStorage(action="uploadFile", localPath="./file.txt", cloudPath="/path")` |

> ⚠️ **Important**: When CLI is disabled, do NOT attempt to run `tcb` commands via shell. Use the MCP tool equivalents listed above. Check the runtime capability notice at the start of the conversation to determine which capabilities are enabled.

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
