---
name: cloudbase
description: "Use when the user builds, deploys, debugs, or troubleshoots anything on 腾讯云开发 CloudBase / 云开发 / TCB / 微信云开发 — Web, 微信小程序, uni-app, 原生 App. Triggers on: 建站, 页面, 表单, 后台, 原型, 登录, 注册, 鉴权, 数据库, 集合, 建表, 云函数, 云托管, 云存储, 静态托管, 上传, 部署, 上线, 域名, 日志, 报错, 巡检, 大模型, AI 对话, 流式输出, 智能体, 小程序. This is an entry skill: it routes the task to the right CloudBase MCP tool and then pulls the detailed recipe from the CloudBase MCP knowledge base. Do NOT use for non-CloudBase stacks or self-hosted backends."
description_zh: 腾讯云开发 CloudBase 入口技能：先判断国内站/国际站，再把任务路由到对应的 MCP 工具，细节从 CloudBase MCP 的知识库按需检索
version: 2.36.2
license: MIT
---

# 腾讯云 CloudBase（云开发）入口技能

这个技能只做三件事：**确认站点**、**把任务路由到对的工具**、**告诉你细节去哪取**。配方正文不放在包里，连上 CloudBase MCP 后用知识库检索拿（见「细节从哪来」）。

CloudBase 是给开发者的后端云：数据库（NoSQL 文档库 / PostgreSQL）、云函数、云托管（容器）、云存储、静态托管、身份认证、内置大模型，以及把这些串起来的 CLI 与控制台。

## 第一步：先确认站点，别猜

CloudBase 有**两套互不相通的账号体系**。站点弄错的表现不是报错，而是「登录了但看不到环境」。能推断就推断（控制台域名、envId、已有报错），推不出来就问一次。

| | 国内站 | 国际站 |
| --- | --- | --- |
| 远程 MCP | `https://tcb-api.cloud.tencent.com/mcp/v1` | `https://tcb-api.tencentcloud.com/mcp/v1` |
| 本地 stdio | 默认即国内 | `TCB_SITE=intl` + `TCB_REGION=ap-singapore` |
| CLI | 默认 | `TCB_IS_INTL=true` |
| 控制台 | `tcb.cloud.tencent.com` | `tcb.tencentcloud.com` |
| 默认地域 | `ap-shanghai` | `ap-singapore` |
| NoSQL 文档库 | 有 | **没有** |

## 第二步：接上 CloudBase MCP

**技能包里不能携带 MCP 配置。** 技能市场把两件事分开：Skill 给「怎么做」，MCP 给「用什么工具」，ZIP 规范里只有 `SKILL.md`（可带脚本和参考资料），没有声明 MCP 的字段。所以这一步必须显式做，做完再谈调用。

先确认站点（见上表），再按客户端能力选一条：

**A. 客户端能执行命令（Claude Code 等）**

```bash
# 远程，推荐
claude mcp add --transport http cloudbase https://tcb-api.cloud.tencent.com/mcp/v1
```

国际站把域名换成 `tcb-api.tencentcloud.com`。

**B. 手动加（Cursor、Qoder 这类图形客户端）**

Agent 改不了这类客户端的配置，把参数给用户：

- 远程：设置 → MCP → 新增 → 类型 `HTTP` / `Streamable HTTP` → 地址填上面的 `/mcp/v1`
- 本地：类型 `stdio` → 命令 `npx` → 参数 `-y @cloudbase/cloudbase-mcp@latest`

**C. 客户端不支持 MCP，但有终端**（兜底，实测可用）

用 mcporter 当桥，不需要客户端理解 MCP：

```bash
# 列工具（42 个）
npx -y mcporter@0.16.1 list --stdio "npx -y @cloudbase/cloudbase-mcp@latest"

# 调工具
npx -y mcporter@0.16.1 call --stdio "npx -y @cloudbase/cloudbase-mcp@latest" auth action=status
```

注意：mcporter 走远程地址会失败（它先用 SSE GET 探测，CloudBase 的 `/mcp/v1` 只收 POST，报 `SSE error: Non-200 status code (405)`），所以这条只走 stdio。

**验证连上没有**：调一次 `queryEnv`（或上面的 `auth action=status`）。能返回环境信息就是通了；提示未登录就按提示在浏览器里授权。

## 第三步：任务 → 工具

| 要做的事 | 首选工具 |
| --- | --- |
| 看有哪些环境、环境详情 | `queryEnv` / `manageEnv` |
| 设计数据模型、建集合 | `writeNoSqlDatabaseStructure` / `manageDataModel` |
| 读写文档数据 | `writeNoSqlDatabaseContent` / `readNoSqlDatabaseContent` |
| PostgreSQL 建表、查询 | `managePgDatabase` / `queryPgDatabase` |
| 创建、更新、部署云函数 | `manageFunctions` / `queryFunctions` |
| 查函数日志、排错 | `queryLogs` / `manageLogs` |
| 静态托管上传、域名 | `manageHosting` / `queryHosting` |
| 云托管（容器） | `manageCloudRun` / `queryCloudRun` |
| 对象存储 | `manageStorage` / `queryStorage` |
| 登录与权限 | `manageAppAuth` / `queryAppAuth` |
| 从模板起项目 | `downloadTemplate` |
| 声明式部署 | `deployPlan` → `deployBuild` → `deployApply` |
| 查官方文档 / 技能配方 | `searchKnowledgeBase` |

远程 MCP 缺几个工具：`manageStorage` 的本地文件读写、`downloadTemplate`、声明式部署三件套，以及 `manageHosting` 的上传。需要这些时改用本地 stdio。

## 细节从哪来（关键）

不要凭记忆写 CloudBase 的配置和命令。**先查，再写**：

| 想要什么 | 怎么取 |
| --- | --- |
| 某个技能的完整配方 | `searchKnowledgeBase({ mode: "skill", skillName: "<技能名>" })` |
| 官方文档某一段 | `searchKnowledgeBase({ mode: "docs", action: "searchDocs", input: "关键词" })`，再用 `action: "readDoc"` + `docPath` 取全文 |
| 某个 OpenAPI 的参数 | `searchKnowledgeBase({ mode: "openapi", apiName: "<api>" })` |

可检索的技能（31 个）：

- **Web / 小程序 / 原生**：`web-development`、`miniprogram-development`、`http-api-cloudbase`、`ui-design`、`minimal-web-baas-demo`
- **数据**：`postgresql-development-cloudbase`、`postgresql-best-practices-cloudbase`、`cloudbase-document-database-web-sdk`、`cloudbase-document-database-in-wechat-miniprogram`、`relational-database-mcp-cloudbase`、`relational-database-web-cloudbase`
- **计算与部署**：`cloud-functions`、`cloudrun-development`、`cloudbase-declarative-deploy`、`cloudbase-cli`、`cloud-storage-web`
- **身份**：`auth-tool-cloudbase`、`auth-web-cloudbase`、`auth-nodejs-cloudbase`、`auth-wechat-miniprogram`
- **AI**：`ai-model-web`、`ai-model-nodejs`、`ai-model-wechat`、`cloudbase-agent`
- **运维与方法**：`ops-inspector`、`cloud-api-operations`、`cloudbase-mcp`、`cloudbase-code-review`、`cloudbase-platform`、`cloudbase-wechat-integration`、`spec-workflow`

**没有 MCP 时的兜底**：让用户在 WorkBuddy、豆包、Kimi、MiniMax 等客户端里装「腾讯云 CloudBase」连接器（同一套能力），或者直接看 <https://cloudbase.net> 文档。不要凭空编工具名和配置项。

## 三条红线

1. **先定站点**再登录、再绑环境。两站的环境、密钥、登录态互不相通。
2. **新的关系型数据库一律用 PostgreSQL**。环境里已经有 MySQL 时才走 MySQL 那条，不要主动建议开通 MySQL。
3. 删除数据、改安全规则、改权限、改配额之前**先说清后果再动手**。

## 常见失败对照

| 现象 | 多半是 |
| --- | --- |
| 登录成功但环境列表为空 | 站点选错（国内/国际） |
| 工具列表里没有某个工具 | 用的是远程 MCP，缺的工具改本地 stdio |
| 云函数部署后 404 | 触发方式选错（事件型 vs HTTP），或 `scf_bootstrap` 没配 |
| 前端直连数据库读不到 | 安全规则没放行，或没走登录态 |
