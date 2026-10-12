# Tencent Marvis — 连接器提交 packet

Prepared: 2026-10-10
提交形态：**远端 MCP（Streamable HTTP）**，由 Mavis 侧审核后手动上架。
状态：**2026-10-10 已提交，审核上架中**。技能广场侧已有 2 个 CloudBase 技能上架。

## 背景

Mavis（`marvis.qq.com`）「技能广场 → 工具箱 → 连接(MCP/CLI)」的官方列表由腾讯侧 curated，无公开提交表单。

- **2026-09-15 复核**：CloudBase 不在 curated 列表中；当时可用路径只有「+ 自定义连接」粘贴 JSON（该弹窗明确优先 npx/uvx，即 stdio 可用）。判定 `needs_partner_outreach`。
- **2026-10-10**：Mavis 侧主动索取上架资料（下列 4 个字段），并说明「审核后手动上架」⇒ 内部渠道已通，本 packet 即为应答材料。
- 与 9-15 那次不同：本次提交的是**远端 MCP 连接器**（Streamable HTTP + OAuth），不依赖用户本机装 Node。

## 对方要的字段与填写

| 对方字段 | 我们的填写 |
| --- | --- |
| 传输协议类型（SSE / Streamable HTTP / STDIO） | **Streamable HTTP** |
| MCP Server 连接地址 | `https://tcb-api.cloud.tencent.com/mcp/v1` |
| 认证方式（无需认证 / 账号密码、token-API Key 或 Token / 第三方 OAuth 授权） | **第三方 OAuth 授权** |
| 工具描述性文字 | 见下方，共 35 个 |

## 卡片文案

对齐 Mavis 已有连接器（如腾讯文档）的详情卡片结构：图标 → 一句话 → 能力 → 使用示例。

**图标**

- PNG：`https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/mcp/icon.png`
- SVG：`https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/cloudbase-logo.svg`

**一句话**

> 不用买服务器，用对话就能做好应用并发布上线：存数据、传文件、加登录

**能力**

- 应用搭建：口述需求，自动创建数据库、云函数和接口
- 一键上线：把做好的网页或小程序发布到线上，拿到访问链接
- 数据管理：建表改结构、增删改数据，支持文档数据库与 PostgreSQL
- 排障运维：查运行日志与资源用量，快速定位线上报错
- 免费体验：新用户可以免费创建一个体验环境

**使用示例**

> 「帮我做一个活动报名页，报名信息存进数据库，做完给我访问链接」

> 「帮我把这个网站部署上线，给我一个能访问的地址」

> 「帮我把这个小程序发布上线，并加上微信登录」

## 工具描述性文字

共 35 个，均为客户端 `tools/list` 返回的实际工具名（远端模式注册面）。

| 工具名 | 描述 |
| --- | --- |
| `queryEnv` | 查环境列表、详情、资源用量与安全域名 |
| `manageEnv` | 建环境、换套餐、续费、安全域名 |
| `envDomainManagement` | 安全域名管理（已并入 `manageEnv`，已废弃） |
| `readNoSqlDatabaseStructure` | 看 NoSQL 集合与索引 |
| `writeNoSqlDatabaseStructure` | 建删集合、增删索引 |
| `readNoSqlDatabaseContent` | 查 NoSQL 数据 |
| `writeNoSqlDatabaseContent` | 增删改 NoSQL 数据 |
| `queryPgDatabase` | 查 PostgreSQL 结构、执行只读 SQL |
| `managePgDatabase` | PostgreSQL 写入 SQL、迁移（建表 / 改表 / 删表） |
| `queryPgStorage` | 查 PostgreSQL 云存储能力与上传方案 |
| `queryMysqlDatabase` | 查 MySQL 状态、只读 SQL、慢查询与错误日志 |
| `manageMysqlDatabase` | 开通 / 销毁 MySQL、写入 SQL 与 DDL |
| `manageDataModel` | 查数据模型、字段与关联 |
| `modifyDataModel` | 用 Mermaid 创建数据模型 |
| `queryFunctions` | 查云函数、执行日志、版本、触发器 |
| `manageFunctions` | 建改调用云函数、发布版本、定时触发器 |
| `queryCloudRun` | 查云托管服务、构建与运行日志 |
| `queryHosting` | 查静态托管配置、域名与文件 |
| `manageHosting` | 上传删除文件、配置路由与域名 |
| `queryGateway` | 查网关路由与上游 |
| `manageGateway` | 建改删路由、自定义域名 |
| `queryStorage` | 查云存储文件与临时下载链接 |
| `queryApps` | 查应用与版本、构建状态与日志 |
| `manageApps` | 构建并部署 Web 应用 |
| `queryAppAuth` | 查登录方式与密钥配置 |
| `manageAppAuth` | 改登录方式、管理 API key |
| `queryPermissions` | 查资源权限、角色与用户 |
| `managePermissions` | 改权限、管角色与用户 |
| `queryLogs` | 查日志服务状态、搜 CLS 日志 |
| `manageLogs` | 开通 CLS 日志服务 |
| `queryAgents` | 查 Agent 列表、详情与日志 |
| `manageAgents` | 建改删 Agent |
| `callCloudApi` | 调腾讯云 / CloudBase 管控面 API |
| `searchKnowledgeBase` | 查官方文档、技能与 OpenAPI 文档 |
| `prepareFeedback` | 整理案例或复盘草稿 |

## 对方追问时再补（未随首轮材料给出）

- **国际站地址**：`https://tcb-api.tencentcloud.com/mcp/v1`（与国内站账号体系互相独立）。
- **OAuth 细节**：端点 `/mcp/oauth2/authorize`、`/token`、`/register`、`/revoke`；元数据 `/.well-known/oauth-protected-resource`、`/.well-known/oauth-authorization-server`；OAuth 2.1 + PKCE(S256) + refresh_token，scope `mcp:full`。
- **客户端注册**：支持 DCR（公共客户端，`token_endpoint_auth_methods_supported = ["none"]`），Mavis 无需预先登记 client_id / client_secret / 回调地址。**若 Mavis 用固定回调地址（非动态注册），需把地址给我们确认服务端接受。**
- **备选认证**：请求头 `X-TencentCloud-SecretId` + `X-TencentCloud-SecretKey`（成对），地址带 `env_id`。
- **能力边界**：远端模式不注册 7 个依赖本机文件/进程的工具（`auth`、`manageStorage`、`downloadTemplate`、`manageCloudRun`、`deployBuild` / `deployPlan` / `deployApply`）；国际站暂不提供 NoSQL 相关工具。

## Pre-submit checklist

- [x] 资料备好（本文件）
- [x] 已交给 Mavis 对接人（2026-10-10）
- [ ] 等 Mavis 审核上架结果
- [ ] 上架后回填：`markets.yaml` 的 `tencent-marvis.native_connector_or_builtin` → `listed`，`last_reviewed_at` 更新，并在 `submission-log.md` 记一条
