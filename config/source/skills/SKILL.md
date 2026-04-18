---
name: cloudbase-all-in-one
description: Unified CloudBase execution guide for all-in-one skill installs. Use this as the first entry point for CloudBase app tasks, especially existing applications that already contain TODOs, fixed pages, and active handlers.
version: 2.16.2
alwaysApply: true
---

# CloudBase All-In-One

## Activation Contract

### Use this first when

- The task is a CloudBase app build, integration, or repair and the workspace already contains an application implementation.
- The request mixes auth, database, storage, and frontend work in one CloudBase application task.

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
- Cloud Functions, including HTTP Functions and browser-facing endpoints -> `./cloud-functions/SKILL.md`
- Browser-side document database CRUD -> `./no-sql-web-sdk/SKILL.md`
- Browser-side file upload -> `./cloud-storage-web/SKILL.md`
- Platform overview only when capability selection is still unclear -> `./cloudbase-platform/SKILL.md`

### High-yield guardrails

- If the same path fails 2-3 times, stop retrying and reroute. Check platform skill, auth domain, runtime, and permission model before editing more code.
- Always specify `EnvId` explicitly in code, configuration, and command examples when initializing CloudBase clients or manager operations. Do not rely on the current CLI-selected environment or implicit defaults.
- For HTTP Functions, keep the public gateway path and the in-function router path as separate layers. Do not write prefixes such as `/api/httpDemo` into the router itself; create gateway access separately only when the task actually needs an external path, and verify function permissions before treating the URL as usable.
- HTTP Function path mapping rule: if the public gateway path is `/api/httpDemo`, the function router should still handle `/`, `/health`, `/users` inside the service. Do not rewrite those handlers to `/api/httpDemo`, `/api/httpDemo/health`, or other gateway-prefixed paths.
- HTTP Function delivery rule: creating the function does not guarantee a browser/public URL exists. Confirm the actual exposed path with `queryGateway(action="getAccess")` after creating access, and if the task explicitly says no HTTP access service is needed, do not create gateway access just to mirror the function name.
- HTTP Function permission rule: when the caller may be anonymous, or when external invocation reports `EXCEED_AUTHORITY`, inspect the function rule first and only widen access when the product requirement really needs anonymous callers.

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
   - For writes, validate the actual SDK result instead of assuming success.

4. Targeted repair tasks:
   - Functional closure beats exploration.
   - Avoid broad repo sweeps, UI redesign, and detached demo code.
   - Keep file discovery narrow. Prefer direct reads of the known active files over `Glob` / broad search across the whole project.
