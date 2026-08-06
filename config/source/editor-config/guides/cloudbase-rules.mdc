---
description: CloudBase AI Development Rules Guide - Compact routing contract for IDE alwaysApply / AGENTS projections (WorkBuddy-safe, under 40 KiB)
globs: *
alwaysApply: true
inclusion: always
---

# CloudBase AI Development Rules Guide

## Activation Contract

This file is a **compatibility projection** of the CloudBase routing contract. Keep semantics aligned with the CloudBase source guideline. Prefer stable skill identifiers; load full skill bodies on demand (local `rules/` / `.codebuddy/skills/` / `searchKnowledgeBase(mode="skill")`) — do **not** expand this entry into a full skill dump.

## Existing Implementation First

When the workspace already has an application with TODOs, fixed routes, or pre-created pages/services:

- Do **not** start with `ui-design` / visual exploration unless the user asks for redesign.
- Do **not** broad-read unrelated skills first.
- Inspect surfaces that already own the flow (`src/lib/backend.*`, `auth.*`, `*service.*`, route guards, submit handlers).
- Prefer patching TODOs in-place over parallel helpers or detached demos.
- Login + CRUD: inspect → verify providers if needed → patch active handlers → validate.

## Path resolution

When this document references `{skill-id}` or a rule name, resolve in order:

1. `.codebuddy/skills/{skill-id}/SKILL.md` or `.claude/skills/{skill-id}/SKILL.md`
2. `.codebuddy/rules/tcb/rules/{skill-id}/rule.md`
3. `rules/{skill-id}/rule.md` (or `rules/{skill-id}/SKILL.md`)
4. Search: `*{skill-id}*SKILL.md` / `*{skill-id}*rule.md`

Files already written as `rules/...` work across editors.

| Shorthand | Skill / rule id |
|-----------|-----------------|
| `auth-tool` | `auth-tool-cloudbase` |
| `auth-web` | `auth-web-cloudbase` |
| `auth-wechat` | `auth-wechat-miniprogram` |
| `auth-nodejs` | `auth-nodejs-cloudbase` |
| `web-development` | `web-development` |
| `miniprogram-development` | `miniprogram-development` |
| `cloudrun-development` | `cloudrun-development` |
| `cloud-functions` | `cloud-functions` |
| `http-api` | `http-api-cloudbase` |
| `no-sql-web-sdk` | `cloudbase-document-database-web-sdk` |
| `no-sql-wx-mp-sdk` | `cloudbase-document-database-in-wechat-miniprogram` |
| `relational-database-tool` | `relational-database-mcp-cloudbase` |
| `relational-database-web` | `relational-database-web-cloudbase` |
| `postgresql-development` | `postgresql-development-cloudbase` |
| `cloud-storage-web` | `cloud-storage-web` |
| `ui-design` | `ui-design` |
| `minimal-web-baas-demo` | `minimal-web-baas-demo` |
| `cloudbase-platform` | `cloudbase-platform` |
| `spec-workflow` | `spec-workflow` |

## Global must-read rules

- Identify the scenario first; read the matching skill **before** implementation.
- **Environment first:** call `envQuery({ action: "info" })` (or `tcb env list` / `tcb env use` if MCP missing). Use the returned `envId` everywhere. When the identifier is an alias, nickname, or other short form, **do not pass alias-like short forms directly** to `auth.set_env`, SDK init, console URLs, or generated config — first resolve to the canonical full `EnvId` with `envQuery(action=list, alias=..., aliasExact=true)`. If multiple environments match or no exact alias exists, stop and clarify.
- **Auth:** any login/register mention → read `{auth-tool}` first, configure providers, then platform auth (`{auth-web}` / `{auth-wechat}`). Management login ≠ app auth (`auth` vs `queryAppAuth` / `manageAppAuth`).
- **UI:** visual generation/redesign → read `{ui-design}` and output the design spec before UI code. Skip when the task is functional completion on existing pages.
- **Templates:** greenfield projects → `downloadTemplate` (`react` / `vue` / `miniprogram` / `uniapp`) before hand-scaffolding.
- **Native App / Flutter / RN** → `{http-api}`, not Web SDK rules.
- **Cloud Functions** → `{cloud-functions}` (not CloudRun unless containers are required).
- When writing MCP/tool results to files, pass serialized text (`JSON.stringify(result, null, 2)`), not raw objects. If a write tool says `content` expected a string but received an object, do not retry with the same raw object. Serialize the object first, then retry once with the serialized text, and make sure the retried call actually passes the serialized string rather than the original object.
- Generated / mirrored IDE artifacts are compatibility outputs, not the semantic source.
- After 2–3 failed attempts on the same path, stop and reroute (skill, runtime, auth domain, permission model, SDK boundary).

## Engineering constitution

Overrides convenience. Full rationale lives in `{web-development}`.

- Prepare backend resources (auth providers, tables/collections, storage domains, security rules) **before** frontend code. Prefer MCP; if MCP is missing in this session, configure MCP for next time and use `tcb` CLI now (see skill `cloudbase-cli` / tooling-fallback) — do **not** stall, and do **not** default to `tcb deploy`.
- **Do NOT use `any`** to bypass type errors (`: any`, `as any`, `@ts-ignore`, `@ts-nocheck`). Prefer `unknown` + guards / precise interfaces.
- **Self-verify before claiming done:** static (`tsc` / lint / build / tests) and runtime (user-visible flows). Name gaps explicitly if a layer cannot run.
- **Do not paper over failures:** no empty `try/catch`, no deleting failing tests to go green.
- **`ai.createModel(...)` / `wx.cloud.extend.AI.createModel(provider)` takes a GroupName**, not a vendor/model id. Legal: `"cloudbase"`, `"hunyuan-exp"`, or `"custom-<name>"`. Model ids go in `generateText` / `streamText` `model`. See `{ai-model-web}` / `{ai-model-nodejs}` / `{ai-model-wechat}`.
- **PostgreSQL / CloudBase PG / `app.rdb()`** → `{postgresql-development}`; do not use NoSQL or MySQL MCP for that path.
- **Web auth proof:** `auth.getSession()` with `data.session`. Do not use deprecated `getLoginState()` / `auth.getUser()` as login proof.
- **First frontend deploy** of a new app: `manageApps(action="createApp", ...)`. `manageHosting` is only for incremental updates of hosting-origin projects.

## High-priority routing table

| Scenario | Read first | Then read | Do NOT route to first | Must check before action |
|----------|------------|-----------|------------------------|--------------------------|
| Minimal Web BaaS demo (Todo/Notes/Chat) | `{minimal-web-baas-demo}` | `{web-development}`, `{no-sql-web-sdk}` or `{postgresql-development}` | `{cloud-functions}`, `{cloudrun-development}`, `{spec-workflow}`, `{ui-design}` | BaaS-first Web SDK CRUD; MCP schema only; **zero cloud functions** unless secrets / cron / rules-cannot-express |
| Web login / registration | `{auth-tool}` | `{auth-web}`, `{web-development}` | `{cloud-functions}`, `{http-api}` | Provider status and publishable key |
| WeChat mini program + CloudBase | `{miniprogram-development}` | `{auth-wechat}`, `{no-sql-wx-mp-sdk}` | `{auth-web}`, `{web-development}` | Whether the project uses `wx.cloud` |
| Native App / raw HTTP (Flutter / RN) | `{http-api}` | `{auth-tool}`, `{relational-database-tool}` | `{auth-web}`, `{no-sql-web-sdk}` | SDK boundary, OpenAPI, auth method |
| Web + NoSQL | `{web-development}` | `{no-sql-web-sdk}`, `{auth-web}` | `{relational-database-tool}`, `{http-api}` | Login state and DB permission model |
| CloudBase PostgreSQL / PG | `{postgresql-development}` | `{auth-tool}`, `{auth-web}`, `{web-development}` | `{relational-database-tool}`, `{no-sql-web-sdk}` | PG schema, usernamePassword, RLS |
| MySQL (legacy relational) | `{relational-database-tool}` | `{relational-database-web}`, `{http-api}` | `{no-sql-web-sdk}` | MCP manage vs app access; prefer PG for new envs |
| Cloud Functions | `{cloud-functions}` | domain skill | `{cloudrun-development}` | Event vs HTTP, runtime, `scf_bootstrap` |
| CloudRun backend | `{cloudrun-development}` | domain skill | `{cloud-functions}` | Container boundary, Dockerfile, CORS |
| AI Agent | `{cloudbase-agent}` | `{cloud-functions}` / `{cloudrun-development}` | — | AG-UI, SSE streaming |
| AI model (text/image/stream) | `{ai-model-web}` (or node/wechat) | sibling AI skills | `{cloudbase-agent}` first | Token Credits / Growth Plan preflight |
| UI generation | `{ui-design}` | platform skill | backend-only skills | Design specification first |
| Ops / troubleshooting | `{ops-inspector}` | `{cloud-functions}`, `{cloudrun-development}` | `{ui-design}`, `{spec-workflow}` | CLS, log time range |
| Spec / architecture | `{spec-workflow}` | platform guideline | jumping straight to code | Requirements → design → tasks |

### Routing reminders

- Web auth failures: usually skipped provider config, not missing UI snippets.
- Native failures: usually Web SDK misuse, not missing HTTP knowledge.
- Mini program failures: treating `wx.cloud` like Web auth/SDK.
- PG failures: falling back to MySQL/NoSQL or guessing raw HTTP instead of `app.rdb()`.
- AI model failures: missing Token Credits / Growth Plan — check packages before rewriting code.
- “最小前后端 / Todo / 留言板”: use `{minimal-web-baas-demo}` — **browser SDK CRUD**, not cloud-function middleware.

## Platform auth (never mix)

- **Web:** CloudBase Web SDK built-in auth (e.g. `auth.toDefaultLoginPage()`). Never invent OPENID-only Web flows.
- **Mini Program:** native / `wxContext.OPENID` in cloud functions. Never use Web SDK auth pages.
- **CloudRun / Node:** `@cloudbase/node-sdk` server-side; verify tokens, never trust client claims blindly.

## MCP + CLI

Prefer CloudBase MCP for manage/deploy when tools are loaded in **this** session. If MCP is missing (first session / after install), configure MCP for the next session and finish with `tcb` via `cloudbase-cli` — **never** default to `tcb deploy`.

## Deployment (pointer)

Full steps live in `{web-development}` / guideline `deployment-workflow` reference. Short form:

1. Backend first when the frontend depends on it (`manageFunctions` / `manageCloudRun`).
2. New static/Web apps: `manageApps` create/deploy path; do not silently switch an existing `manageHosting` site to a new URL shape.
3. After deploy, give CDN-cache-aware URLs (random query) and update README with env resources.

## Console links

Pattern: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/{path}` — overview, `#/db/doc`, `#/db/mysql`, `#/scf`, `#/platform-run`, `#/storage`, `#/static-hosting`, `#/identity`, `#/ai`, `#/env`.

## Quality gate (before “done”)

1. EnvId known and used consistently.
2. Correct skill(s) read for the scenario.
3. Auth providers configured when login is in scope.
4. UI design spec only when visual work was requested.
5. Static + runtime verification evidence, or explicit gaps.
6. No cloud functions for pure BaaS CRUD demos unless secrets/cron/rules-cannot-express.
