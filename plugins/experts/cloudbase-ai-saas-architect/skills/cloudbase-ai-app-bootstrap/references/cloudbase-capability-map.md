# CloudBase 能力清单与路由路径

本文件是 CloudBase 连接器能力的精选地图，帮助快速定位该用哪个 skill。

完整文档位于 CloudBase 连接器：`~/.workbuddy/connectors/skills/connector-cloudbase/references/<skill-id>/SKILL.md`

## 场景 → Skill 路由表

| 用户需求 | 先读 | 再读 | 不要走 |
|---------|------|------|--------|
| Web 登录/注册 | `auth-tool` | `auth-web`, `web-development` | `cloud-functions`, `http-api` |
| 小程序云开发 | `miniprogram-development` | `auth-wechat`, `no-sql-wx-mp-sdk` | `auth-web`, `web-development` |
| 原生 App (iOS/Android/Flutter/RN) | `http-api` | `auth-tool`, `relational-database-tool` | `auth-web`, `no-sql-web-sdk` |
| Web + NoSQL 文档库 | `web-development` | `no-sql-web-sdk`, `auth-web` | `relational-database-tool`, `http-api` |
| **CloudBase PG (PostgreSQL) — 主推** | `postgresql-development` | `auth-tool`, `auth-web`, `cloud-storage-web`, `http-api` | `relational-database-tool`, `no-sql-web-sdk` |
| MySQL 关系型库 | `relational-database-tool` | `relational-database-web`, `http-api` | `no-sql-web-sdk`, `web-development` |
| 云函数 | `cloud-functions` | `auth-tool` | `cloudrun-development`, `auth-web` |
| CloudRun 容器 | `cloudrun-development` | `auth-tool`, `relational-database-tool` | `cloud-functions` |
| UI 生成 | `ui-design` | `web-development` 或 `miniprogram-development` | `cloud-functions` |
| 运维巡检/错误排查 | `ops-inspector` | `cloud-functions`, `cloudrun-development` | `ui-design`, `spec-workflow` |
| 需求文档/技术方案 | `spec-workflow` | `cloudbase` | `web-development`, `cloud-functions` |

## Skill 一览（按能力域分组）

### 认证
- `auth-tool` — 认证配置与登录就绪检查（`queryAppAuth` / `manageAppAuth`）
- `auth-web` — Web 端登录实现（用户名/密码/邮箱/短信/微信）
- `auth-wechat` — 小程序 OPENID 认证

### 数据库
- `no-sql-web-sdk` — Web 文档数据库（CloudBase JS SDK）
- `no-sql-wx-mp-sdk` — 小程序文档数据库（wx.cloud）— **小程序默认选型**
- `postgresql-development` — CloudBase PG（`app.rdb()` + RLS + pgvector）— **Web 系统主推**
- `relational-database-tool` — MySQL 关系型库管理（MCP）
- `relational-database-web` — MySQL Web 接入

### 后端
- `cloud-functions` — 云函数（Event / HTTP，scf_bootstrap，9000 端口）
- `cloudrun-development` — CloudRun 容器（Dockerfile + CORS）
- `http-api` — 原生 App HTTP API 接入

### 前端
- `web-development` — Web 前端开发规范
- `miniprogram-development` — 小程序开发规范
- `ui-design` — UI 设计规格（先于代码）
- `cloud-storage-web` — 云存储（上传/下载/临时 URL）

### 工程化
- `cloudbase-cli` — CLI 资源管理
- `cloudbase-code-review` — 代码审查
- `cloudbase-platform` — 平台总览与路由
- `ops-inspector` — 巡检/诊断/健康检查
- `spec-workflow` — 需求/设计/任务工作流
- `data-model-creation` — 数据建模（复杂场景）

## 关键工程宪章

1. **资源先于代码** — auth provider / 表 / 存储域 / 安全规则先通过 MCP 准备
2. **不用 `any`** — 用 `unknown` + 类型守卫
3. **自验证** — tsc / lint / build / test + agent-browser 运行时验证
4. **不掩盖失败** — 禁止空 try/catch、禁止删测试转绿
5. **PG 走 `postgresql-development`** — 用 `app.rdb()` / `queryPgDatabase` / `managePgDatabase`，不退回 NoSQL / MySQL 管理工具
6. **首次部署用 `manageApps`** — `manageHosting` 仅用于增量更新
7. **EnvId 显式指定** — alias 须先 `envQuery(aliasExact=true)` 解析

## 数据库选型决策表

| 场景 | 选型 | 理由 |
|------|------|------|
| 小程序简单 CRUD | 文档型（NoSQL） | 与小程序 SDK 原生集成，上手快 |
| Web 系统 / 管理后台 | CloudBase PG | 关系型查询 + RLS 行级权限 |
| 需要向量检索 | CloudBase PG | pgvector 扩展 |
| 需要复杂权限模型 | CloudBase PG | RLS 行级安全策略 |
| 简单 key-value 存储 | 文档型（NoSQL） | 足够用 |

## 常见踩坑

| 症状 | 根因 | 解法 |
|------|------|------|
| Web 登录失败 | provider 未开启 | `manageAppAuth` 开启 + 获取 publishable key |
| 小程序报错 | 当成 Web 处理 | 用 `wx.cloud` + OPENID 路径 |
| PG 404 | 猜 HTTP 路径 | 用 `app.rdb()` 或文档化的 OpenAPI |
| PG 被当 MySQL | 调用 `queryMysqlDatabase` | 走 `postgresql-development`，用 `queryPgDatabase` / `managePgDatabase` |
| HTTP 函数无响应 | 缺 scf_bootstrap | 加 `scf_bootstrap` + 9000 端口 + 响应头 |
| 部署后 404 | 用了 manageHosting | 首次用 `manageApps(createApp)` |
| RLS 失效 | 权限策略未配 | 配置 PG RLS 行级安全策略 |
