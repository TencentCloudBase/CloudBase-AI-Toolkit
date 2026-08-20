---
name: minimal-web-baas-demo
description: "Fast path for a minimal CloudBase Web + database demo (最小前后端 / 最小可用 fullstack / Lovable-like BaaS). Defaults to @cloudbase/js-sdk client CRUD (NoSQL app.database / PG app.rdb), MCP-only schema, preview-first, and forbids cloud functions unless secrets, cron/background jobs, or logic that security rules/RLS cannot express. Use for 搭一套 demo、留言板、Todo、Notes、Kanban, or when users say 带云函数+云数据库 but only need CRUD. NOT for production multi-service backends, CloudRun, WeChat Mini Programs, or tasks that truly need server secrets."
version: 2.31.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../web-development/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

# Minimal Web BaaS Demo (fast path)

Goal: **minutes to an interactive Web + database preview**, not a cloud-function middleware stack.

This skill is the product equivalent of CloudBase Sites SessionStart **Rule 5** (BaaS-first data persistence).

## Activation Contract

### Use this first when

- The user asks for a **minimal fullstack / 前后端 demo**, message board, Todo, Notes, Kanban, or Lovable/Supabase-like quick app on CloudBase Web.
- The user says "带云函数+云数据库" but the real need is CRUD + preview (reinterpret as Web SDK → database).

### Do NOT use for

- WeChat Mini Programs (`wx.cloud`) — use `../miniprogram-development/SKILL.md`.
- True server workloads: payments callbacks, SMS providers, secret third-party keys, cron/ETL, WebSockets — use `../cloud-functions/SKILL.md` or `../cloudrun-development/SKILL.md`.
- Large multi-module products that need `../spec-workflow/SKILL.md`.

## Hard rules (align with Sites SessionStart Rule 5)

1. **BaaS-first data path**
   - **Schema / admin:** Prefer MCP management tools. Do not ask the user to create collections/tables in the console. If MCP tools are missing in this session, configure MCP for next time and use `tcb` CLI (`../cloudbase-cli/SKILL.md`) for equivalent schema/admin ops.
     - NoSQL: `writeNoSqlDatabaseStructure` (create collection / indexes) + permission tools as needed; CLI: NoSQL commands in `cloudbase-cli`.
     - PostgreSQL: follow `../postgresql-development-cloudbase/SKILL.md` (`queryPgDatabase` / `managePgDatabase` / migrations); CLI parity via `tcb db pg …` when MCP is unavailable.
   - **Reads / writes:** `@cloudbase/js-sdk` in the browser.
     - NoSQL: `app.database()` → `db.collection(...).get()/add()/update()/watch(...)`.
     - PG: `app.rdb().from(...)`.
   - Prefer the template helper (often `src/utils/cloudbase.ts`). Do not invent a second SDK wrapper.

2. **Cloud functions are forbidden by default**
   - Todo / Notes / Chat / Kanban / "最小前后端 demo" → **zero** cloud functions.
   - Even if the user says "带云函数", deliver Web SDK → DB and explain in one sentence that cloud functions are not required for CRUD.
   - Create a cloud function **only when**:
     - (a) the logic cannot be expressed as database security rules / RLS, **and**
     - (b) it needs server-side secrets / third-party API keys, **or** it is a scheduled / background job not triggered by a user click.

3. **Package discipline**
   - Browser: `@cloudbase/js-sdk` only.
   - Never install `@cloudbase/node-sdk` (or random stubs) in frontend code.

4. **Preview first, deploy second**
   - Ship local list + add (or equivalent CRUD) before static hosting / CloudApp deploy.
   - Custom domains, DNS, rollback runbooks → only if the user explicitly asks.
   - Skip Playwright / agent-browser unless the user asks to test.

5. **UI ceremony for this path**
   - Reuse the template look. **Do not** load `ui-design` four-part specs for a minimal demo unless the user asks for visual redesign.
   - "Make me a X app" = X **is** the homepage (`HomePage` / `App`), not a nested demo route beside the welcome page.

6. **Anonymous (or real) session before NoSQL CRUD — js-sdk 3.x + publishable key**
   - With `@cloudbase/js-sdk` **3.x** initialized via publishable `accessKey`, call **`await auth.signInAnonymously()`** (or an equivalent authenticated session) **before** any NoSQL `app.database()` `get` / `add` / `update` / `watch`.
   - Skipping this yields **gateway 401**. `checkLogin()` / `getSession()` alone does **not** create a usable write session.
   - Minimal example:

```js
const auth = app.auth
const { error } = await auth.signInAnonymously()
if (error) throw error
const db = app.database()
await db.collection('messages').get()
```

## Capability sniff order (partners + agents)

Use this order for every minimal Web + DB demo. **Do not reorder.** Cloud functions stay off the critical path.

```text
0. Connector pre-enabled (or shortest Trust path)     ← host / partner packaging
1. Template warmup // parallel with credential wait   ← downloadTemplate + install
2. envQuery(action="info")                            ← sniff env + RuntimeBackends
3. Lock ONE DB plane (NoSQL | PG | MySQL)             ← no mid-flight thrash
4. MCP schema + minimal permissions                   ← writeNoSql* / PG migrate / MySQL manage
5. Browser @cloudbase/js-sdk CRUD                     ← app.database() / app.rdb()
6. Local preview (list + add)                         ← then ask before deploy
7. Cloud functions                                    ← skip (count = 0) unless secrets/cron/rules-cannot-express
```

Stack priority for this path: **Web SDK CRUD > MCP schema > template warmup > cloud functions**.

## Standard playbook

1. **Warm template in parallel with credentials** (see partner notes below): `downloadTemplate` (`react` default, `vue` if requested) → `npm install` / `pnpm install`.
2. `envQuery(action="info")` → lock **one** DB plane (NoSQL **or** PG **or** MySQL). Do not thrash between them.
3. MCP: create the collection/table + minimal permissions.
4. Frontend: ensure session (`auth.signInAnonymously()` or equivalent), then wire list + create with `@cloudbase/js-sdk` (see Hard rule 6).
5. Start / report preview URL; ask before deploy.
6. **Cloud function count for this path = 0.**

### On-demand skills (fetch only when needed)

| Need | Skill |
| --- | --- |
| Web scaffold / hosting | `../web-development/SKILL.md` |
| NoSQL browser CRUD | `../cloudbase-document-database-web-sdk/SKILL.md` |
| PG browser CRUD + MCP schema | `../postgresql-development-cloudbase/SKILL.md` |
| Auth provider readiness | `../auth-tool-cloudbase/SKILL.md` then `../auth-web-cloudbase/SKILL.md` |

Prefer `searchKnowledgeBase(mode="skill", skillName="minimal-web-baas-demo")` (or the sibling dir id) when local skill files are unavailable. **Do not** dump every CloudBase skill at session start.

## WorkBuddy / partner packaging notes (XDF and beyond)

Any partner host (WorkBuddy, CodeBuddy connectors, vertical expert prompts, ISV wrappers) should treat this skill as the **compact fast-path brief**. Reuse the sniff order above; do not invent a cloud-function-first demo path.

| Host capability | Recommended packaging |
| --- | --- |
| Full CloudBase Sites plugin | Rely on SessionStart Rule 5 injection + this skill on demand for non-Sites cwd demos. Prefer Sites with `CLOUDBASE_SITES_AUTO_INIT=1` for empty-cwd preview. Never guess 5173 — read `.cloudbase-sites/preview.json`. |
| WorkBuddy / connector hosts | **Pre-enable** the CloudBase MCP connector for the tenant when possible; inject a short system brief that points here; warm `downloadTemplate` + `npm install` **during** credential/Trust wait (do not idle). Optional SessionStart `additionalContext` can point at this skill — do not ship a separate template-prewarm plugin. |
| Expert / vertical prompts (ISVs) | Ship a thin pack: expert Agent markdown (**no** frontmatter hooks) + optional settings/hooks. Replace any "必须云函数中转 / 前端绝不直连库" language with this BaaS-first contract. |

WorkBuddy SessionStart: https://www.workbuddy.ai/docs/cli/hooks (same `additionalContext` schema as CodeBuddy/Claude Code). Empty-dir Sites auto-init stays passive unless opted in — do not assume enabling Sites alone warms templates during credential wait.

**Do not** block first preview on custom domains or org DNS health. DNS issues are a post-preview concern.

### One-screen partner paste (optional)

```text
For 最小前后端 / Lovable-like demos: FIRST call
searchKnowledgeBase(mode="skill", skillName="minimal-web-baas-demo"), then Read.
Do not rely only on ad-hoc expert-prompt brief text.
Order: connector ready → template warmup during credential wait → envQuery →
lock one DB → MCP schema → auth.signInAnonymously() (or session) →
@cloudbase/js-sdk CRUD → preview.
Do not dump all CloudBase skills. Do not create cloud functions for CRUD.
NoSQL without session → gateway 401.
```