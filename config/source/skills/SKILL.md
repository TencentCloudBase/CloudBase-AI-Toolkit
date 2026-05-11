---
name: cloudbase-all-in-one
description: Unified CloudBase execution guide for all-in-one skill installs. Use this as the first entry point for CloudBase app tasks, especially existing applications that already contain TODOs, fixed pages, and active handlers.
version: 2.16.3
alwaysApply: true
---

# CloudBase All-In-One

## ⚠️ MANDATORY: Runtime Capability Check (Do this FIRST)

**BEFORE starting any work, you MUST check the runtime capability notice at the top of the conversation.**

If a requested capability (e.g., CLI, specific MCP tool, or skill) is marked as **disabled**:

1. **Do NOT attempt to use it**, even if the user's request explicitly mentions it.
2. **Use the enabled alternatives instead** (see mapping below).
3. **Inform the user** about what you're doing and why.

### Capability Fallback Mapping

| If user requests... | But this is disabled... | Use this instead... | And say this to the user... |
|---------------------|------------------------|---------------------|----------------------------|
| CLI log queries (`tcb log`) | CLI | `queryLogs` MCP tool | "CLI 当前不可用，已使用 MCP 工具 queryLogs 完成日志查询" |
| CLI function deployment (`tcb fn deploy`) | CLI | `manageFunctions` MCP tool | "CLI 当前不可用，已使用 MCP 工具 manageFunctions 完成云函数部署" |
| CLI storage operations (`tcb storage`) | CLI | `manageStorage` MCP tool | "CLI 当前不可用，已使用 MCP 工具 manageStorage 完成存储操作" |
| CLI database operations (`tcb db`) | CLI | `querySqlDatabase` / `readNoSqlDatabaseContent` MCP tools | "CLI 当前不可用，已使用 MCP 工具完成数据库操作" |

### Example: Handling Disabled CLI

**User prompt**: "使用 CloudBase CLI，帮我查询当前环境今天的报错日志"

**Runtime notice**: "Disabled capabilities: - CloudBase CLI"

**Correct action**:
1. Do NOT try to use CLI commands
2. Use `queryLogs` MCP tool instead
3. Respond to user: "CLI 当前不可用，已使用 MCP 工具 queryLogs 完成日志查询"

**Incorrect action**:
- Trying to run `tcb log` commands
- Returning an error without trying alternatives
- Pretending CLI is available

### If No MCP Tool Alternative Exists

If there's no MCP tool alternative for the requested operation:
1. Inform the user that the capability is unavailable
2. Suggest enabling it or using an alternative approach
3. Ask the user for guidance on how to proceed

---

## Activation Contract

### Use this first when

- The task is a CloudBase app build, integration, or repair and the workspace already contains an application implementation.
- The request mixes auth, database, storage, and frontend work in one CloudBase application task.

### Runtime capability check (IMPORTANT)

Before starting work, check the runtime capability notice at the top of the conversation. If a requested capability (e.g., CLI, specific MCP tool, or skill) is marked as **disabled**:

- **Do NOT attempt to use it**, even if the user's request mentions it.
- **Use the enabled alternatives instead**:
  - CLI log queries → `queryLogs` MCP tool
  - CLI function deployment → `manageFunctions` MCP tool
  - CLI storage operations → `manageStorage` MCP tool
  - CLI database operations → `querySqlDatabase` / `readNoSqlDatabaseContent` MCP tools
- **If no MCP tool is available** for the requested operation, inform the user that the capability is unavailable and suggest enabling it or using an alternative approach.
- **Example**: If the task says "使用 CloudBase CLI 查询日志" but CLI is disabled, use `queryLogs` MCP tool instead and explain to the user: "CLI 当前不可用，已使用 MCP 工具 queryLogs 完成日志查询".

### Do this before broad exploration

- Inspect the existing implementation surfaces first:
  - `src/lib/backend.*`
  - `src/lib/auth.*`
  - `src/lib/*service.*`
  - route guards
  - the page handlers bound to the active form submit buttons
- If these files contain TODOs, implement those TODOs in place before creating new helpers, examples, or replacement pages.
- Do not start with UI redesign or design-spec output unless the user explicitly asks for visual changes.
- Do not start with project-management loops such as repeated `TaskCreate` / `TaskUpdate` when the task is a single targeted repair. Read the active files and edit them directly.

### Route quickly to the minimum needed skills

- Web app execution -> `./web-development/SKILL.md`
- Web auth provider readiness -> `./auth-tool/SKILL.md`
- Web auth implementation -> `./auth-web/SKILL.md`
- Browser-side document database CRUD -> `./no-sql-web-sdk/SKILL.md`
- Browser-side file upload -> `./cloud-storage-web/SKILL.md`
- Platform overview only when capability selection is still unclear -> `./cloudbase-platform/SKILL.md`

### High-yield guardrails

- If the same path fails 2-3 times, stop retrying and reroute. Check platform skill, auth domain, runtime, and permission model before editing more code.
- Always specify `EnvId` explicitly in code, configuration, and command examples when initializing CloudBase clients or manager operations. Do not rely on the current CLI-selected environment or implicit defaults.
- If the conversation only provides an environment alias, nickname, or other shorthand, resolve it with `envQuery(action=list, alias=..., aliasExact=true)` and use the returned canonical full `EnvId` before calling `auth.set_env`, generating console links, or writing config/code. If the alias is ambiguous or missing, stop and ask the user to confirm.

### Do NOT use this as

- A reason to read every CloudBase skill before touching code.
- A reason to start from platform overview when the existing code already reveals the stack and the missing pieces.

## Working rules

1. Existing application with TODOs:
   - Treat it as a targeted repair task, not a greenfield build.
   - Prefer the shortest path from current code to working flow.

2. Auth tasks:
   - If the account identifier is a plain username such as `admin`, `editor`, or another string without `@`, treat `usernamePassword` login as a blocking prerequisite.
   - First call `queryAppAuth(action=\"getLoginConfig\")`.
   - If `loginMethods.usernamePassword !== true`, immediately call `manageAppAuth(action=\"patchLoginStrategy\", patch={ usernamePassword: true })`.
   - In code, use `auth.signUp({ username, password })` and `auth.signInWithPassword({ username, password })`.
   - Never use `signUpWithEmailAndPassword` or `signInWithEmailAndPassword` for these username-style account flows.
   - Once readiness is confirmed, return to the active frontend handler and finish the real login/register flow.

3. Database and storage tasks:
   - Reuse the current shared `app`, `auth`, `db`, and storage helpers instead of creating parallel SDK wrappers.
   - For CloudBase Web SDK `db.collection(...).add(...)`, persist the created document ID from `result._id`.
   - For writes, validate the actual SDK result instead of assuming success.

4. Targeted repair tasks:
   - Functional closure beats exploration.
   - Avoid broad repo sweeps, UI redesign, and detached demo code.
   - Keep file discovery narrow. Prefer direct reads of the known active files over `Glob` / broad search across the whole project.
