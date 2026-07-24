---
name: cloudbase
description: "Use this skill when you develop, design, build, deploy, debug, migrate, or troubleshoot CloudBase (腾讯云开发, 云开发, TCB, 微信云开发) projects. Covers Web, 微信小程序, 小程序, uni-app, mobile (iOS, Android, Flutter, React Native). UI (页面, 界面, 表单, form, dashboard, prototype, 原型); auth (登录, 注册, OAuth, 微信登录, publishable key); databases (NoSQL 文档数据库, MySQL 关系型数据库, PostgreSQL/CloudBase PG, app.rdb(), queryPgDatabase/managePgDatabase, CRUD, 查询, security rules); 云函数/cloud functions (serverless, scf_bootstrap); CloudRun (云托管, Dockerfile); 云存储. Built-in AI (内置大模型, AI 对话, streaming, 流式输出, 图片生成, generateText, streamText, createModel, generateImage, TokenHub, Hunyuan, hunyuan-exp, DeepSeek, deepseek, GLM, Kimi, Token Credits 资源包, 小程序成长计划). 第三方大模型, 大模型接入, 大模型调用, LLM API, AI agent, 智能体, AI Agent, AG-UI, LangGraph. Ops (巡检, 诊断, health check, 日志, troubleshooting). Spec (需求文档, 技术方案, requirements, tasks.md). Do NOT use for non-CloudBase projects, pure frontend without CloudBase, or self-hosted backends without CloudBase."
description_zh: 为你的小程序和 Web/H5 提供一体化运行与部署环境，包括数据库、云函数、云存储、身份权限和静态托管
description_en: An all-in-one runtime and deployment environment for WeChat Mini Programs and Web/H5 apps, including database, cloud functions, cloud storage, identity and access control, and static hosting.
version: 2.25.0
---

# CloudBase Development Guidelines

## 📁 Reference Files Location

All reference documentation files are located in the `references/` directory relative to this file.

**File Structure:**
```
cloudbase/
├── SKILL.md              # This file (main entry)
└── references/           # All reference documentation
    ├── auth-web/SKILL.md       # Web authentication guide
    ├── auth-wechat/SKILL.md    # WeChat authentication guide
    ├── no-sql-web-sdk/SKILL.md # NoSQL database for Web
    ├── ui-design/        # UI design guidelines
    └── ...               # Other reference docs
```

**How to use:** When this document mentions reading a reference file like `references/auth-web/SKILL.md`, simply read that file from the `references/` subdirectory.

---


## Workflow

```
1. Exploration  →  Read the matching skill completely before writing any code.
                   Search with searchKnowledgeBase(mode="skill"), then Read full SKILL.md.
2. Implementation
   ├── 2a. Resource preparation → MCP tools first (auth, DB, storage, security rules)
   └── 2b. Frontend implementation → Write code, install deps, start server, test
3. Close-out  →  Run cloudbase-code-review, fix errors, declare done
```

**Key constraints:** Stage 2a must precede frontend code. Stage 3 is mandatory.

## Activation Contract

Routing uses stable skill ids (`auth-tool`, `auth-web`, `http-api`, …) across source, generated artifacts, and installs.

### Standalone skill fallback

If only one published skill is exposed, start from the CloudBase main entry:

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Sibling skill pattern: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/<skill-id>/SKILL.md`

Replace `<skill-id>` with the published directory name. Follow relative `references/...` paths from the current skill. If MCP is unavailable, read `cloudbase` and follow `references/mcp-setup.md` / mcporter setup first.

### Global rules before action

- Identify the scenario, then read the matching skill before writing code or calling CloudBase APIs.
- Prefer semantic sources for toolkit maintenance; express runtime routing in stable skill ids.
- Use MCP or mcporter first for management tasks; inspect tool schemas before execution.
- UI tasks: read `ui-design` first and output the design spec before interface code.
- Auth tasks: read `auth-tool` first and enable providers before frontend implementation.
- Keep auth domains separate: management login uses `auth`; app-side auth uses `queryAppAuth` / `manageAppAuth`.

### Universal guardrails

- After 2–3 failed attempts on the same path, stop and reroute (platform skill, runtime, auth domain, permission model, SDK boundary).
- Always specify `EnvId` explicitly; do not rely on CLI-selected or implicit env state.
- When the environment identifier is an alias, nickname, or other short form, **do not pass it directly** to `auth.set_env`, SDK init, console URLs, or generated config. First resolve it to the canonical full `EnvId` with `envQuery(action=list, alias=..., aliasExact=true)`. If multiple environments match or no exact alias exists, stop and clarify with the user.
- When writing MCP/tool results to a file, pass serialized text (`JSON.stringify(result, null, 2)`), not raw objects. If a write tool says `content` expected a string but received an object, do not retry with the same raw object. Serialize the object first, then retry once with the serialized text, and make sure the retried call actually passes the serialized string rather than the original object.
- Keep scenario-specific pitfalls in child skills — do not expand this entry file.
- **First frontend deploy must use `manageApps(action="createApp", ...)`.** `manageHosting` is only for incremental updates of projects originally deployed via hosting.

### Engineering constitution (applies to every scenario)

These rules override convenience. Full rationale lives in `web-development`.

- **Prepare backend resources via MCP before writing frontend code.** Auth providers, tables, storage domains, and security rules first.
- **Do NOT use `any` to bypass type errors.** Prefer `unknown` + type guards / precise interfaces.
- **Self-verify before claiming done.** Static (`tsc` / lint / build / tests) and runtime (`agent-browser` for user-visible flows). Name gaps explicitly if a layer cannot run.
- **Do not paper over failures.** No empty `try/catch`, no deleting failing tests to go green.
- **`ai.createModel(...)` / `wx.cloud.extend.AI.createModel(provider)` takes a GroupName**, not a vendor/model id. Legal: `"cloudbase"`, `"hunyuan-exp"`, or `"custom-<name>"`. Model ids go in `generateText` / `streamText` `model` field. See `ai-model-web` / `ai-model-nodejs` / `ai-model-wechat`.
- **Low-capability STOP card:** For PostgreSQL / CloudBase PG / `app.rdb()` / `queryPgDatabase` / `managePgDatabase`, route to `postgresql-development` — do **not** use NoSQL/`manageMysqlDatabase` for that path. For Web auth guards, use `auth.getSession()` and require `data.session`; do **not** use deprecated `getLoginState()` / `auth.getUser()` as login proof.

### High-priority routing

<!-- DO NOT EDIT: auto-generated from references/activation-map.yaml -->

| Scenario | Read first | Then read | Do NOT route to first | Must check before action |
|----------|------------|-----------|------------------------|--------------------------|
| Web login / registration / auth UI | `auth-tool` | `auth-web`, `web-development` | `cloud-functions`, `http-api` | Provider status and publishable key |
| WeChat mini program + CloudBase | `miniprogram-development` | `auth-wechat`, `no-sql-wx-mp-sdk` | `auth-web`, `web-development` | Whether the project really uses CloudBase / `wx.cloud` |
| Native App / Flutter / React Native | `http-api` | `auth-tool`, `relational-database-tool` | `auth-web`, `no-sql-web-sdk`, `web-development` | SDK boundary, OpenAPI, auth method |
| Web projects + NoSQL Database | `web-development` | `no-sql-web-sdk`, `auth-web` | `relational-database-tool`, `http-api` | Login state and database access permission model |
| CloudBase PostgreSQL / PG | `postgresql-development` | `auth-tool`, `auth-web`, `web-development`, `miniprogram-development`, `cloud-storage-web`, `http-api` | `relational-database-tool`, `no-sql-web-sdk` | PG schema, usernamePassword login, backend/RLS permission model |
| MySQL Database (relational) | `relational-database-tool` | `relational-database-web`, `http-api` | `no-sql-web-sdk`, `web-development` | Distinguish MCP management vs app code access |
| Cloud Functions | `cloud-functions` | `auth-tool`, `ai-model-nodejs` | `cloudrun-development`, `auth-web` | Event vs HTTP function, runtime, `scf_bootstrap` |
| CloudRun backend | `cloudrun-development` | `auth-tool`, `relational-database-tool` | `cloud-functions` | Container boundary, Dockerfile, CORS |
| AI Agent (智能体开发) | `cloudbase-agent` | `cloud-functions`, `cloudrun-development` | `cloud-functions`, `cloudrun-development` | AG-UI protocol, scf_bootstrap, SSE streaming |
| UI generation | `ui-design` | `web-development`, `miniprogram-development` | `cloud-functions` | Design specification first |
| AI Model (Web) | `web-development` | `ai-model-web`, `ui-design` | `ai-model-wechat`, `http-api` | Platform and streaming interaction mode |
| AI model call (大模型调用 / 文本生成 / 图片生成 / 流式对话) | `ai-model-web` | `ai-model-nodejs`, `ai-model-wechat` | `cloudbase-agent`, `cloud-functions`, `cloudrun-development` | 先跑「调用前必须的资格检查」：`DescribeActivityInfo`（小程序成长计划） + `DescribeEnvPostpayPackage`（Token Credits 资源包） |
| Resource health inspection / troubleshooting | `ops-inspector` | `cloud-functions`, `cloudrun-development` | `ui-design`, `spec-workflow` | CLS enabled, time range for logs |
| Spec workflow / architecture design | `spec-workflow` | `cloudbase` | `web-development`, `cloud-functions` | Requirements, design, tasks confirmed |

#### Activation triggers (derived from `references/activation-map.yaml`)

- **Web login / registration / auth UI** — CloudBase Web 登录, Web 注册, auth login page, publishable key, 短信登录, 邮箱登录
- **WeChat mini program + CloudBase** — 小程序 云开发, wx.cloud, mini program cloudbase, OPENID, 小程序数据库
- **Native App / Flutter / React Native** — Android CloudBase, iOS CloudBase, Flutter CloudBase, React Native CloudBase, 原生 App 接入
- **Web projects + NoSQL Database** — Web 文档数据库, CloudBase collection, 前端查库, NoSQL Web SDK
- **CloudBase PostgreSQL / PG** — CloudBase PG, PostgreSQL, Postgres, PG 模式, JS SDK v3 PostgreSQL, app.rdb(), queryPgDatabase, managePgDatabase, mysqldb OpenAPI, PostgREST, RLS, service_role, auth schema, storage schema, pgvector
- **MySQL Database (relational)** — MySQL 建表, executeWriteSQL, security rule, CloudBase 关系型数据库管理
- **Cloud Functions** — 创建云函数, HTTP 云函数, getFunctionLogs, scf_bootstrap, runtime
- **CloudRun backend** — CloudRun 部署, 云托管, container backend, Dockerfile
- **AI Agent (智能体开发)** — AI Agent, 智能体, 智能体开发, AG-UI protocol, LangGraph, LangChain, CrewAI, streaming agent, agent UI
- **UI generation** — 设计页面, 登录页 UI, frontend interface, 组件样式, prototype
- **AI Model (Web)** — Web AI 对话, CloudBase AI 流式输出, Web 集成模型
- **AI model call (大模型调用 / 文本生成 / 图片生成 / 流式对话)** — 大模型调用, AI 模型调用, generateText, streamText, generateImage, 文本生成, 图片生成, 流式对话, hunyuan-exp, deepseek-v4-flash, Token Credits 资源包, 小程序成长计划, ai_miniprogram_inspire_plan, callCloudApi AI 模型, CreateAIModel
- **Resource health inspection / troubleshooting** — 巡检, 诊断, health check, 资源健康, 异常日志, error inspection, troubleshooting, 错误排查
- **Spec workflow / architecture design** — 需求文档, 技术方案, tasks.md, Spec 工作流


### Routing reminders

- Web auth failures: usually skipped provider config, not missing frontend snippets.
- Native App failures: usually Web SDK paths, not missing HTTP API knowledge.
- Mini program failures: treating `wx.cloud` like Web auth/SDK.
- CloudBase PG failures: falling back to MySQL/NoSQL, skipping username-password readiness, or guessing raw HTTP instead of `app.rdb()` / documented OpenAPI.
- AI model failures: usually missing Token Credits / Growth Plan — run `DescribeEnvPostpayPackage` / `DescribeActivityInfo` before changing code.

## MCP prerequisite

CloudBase MCP is **required** for management/deploy. Setup details: `references/mcp-setup.md`. Verify with `npx mcporter list | grep cloudbase` or the IDE MCP panel before any CloudBase tool call. Prefer device-code login via `auth`; do not hard-code secrets.

## On-demand references

Load only when needed (do not expand this entry):

- `references/deployment-workflow.md` — deploy backend/frontend, `manageApps` vs hosting, URL/docs updates
- `references/console-links.md` — console hash paths after creating resources
- `references/scenarios.md` — user-need → CloudBase capability mapping
- `references/mcp-setup.md` — IDE MCP / mcporter config and auth examples
- `references/activation-map.yaml` — canonical routing contract source
