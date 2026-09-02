# CloudBase 全栈应用架构模板

基于 CloudBase 构建全栈应用的两种主流架构：全栈小程序（文档库）+ Web 系统（PG 主推）。

## 架构 A: 全栈小程序（默认文档型数据库）

```
┌─────────────────────────────────────────────────────────┐
│  微信小程序前端                                          │
│  - 页面（WXML/WXSS/JS）                                  │
│  - wx.cloud.extend.AI（如需 AI 能力）                    │
└──────────────┬──────────────────────────────────────────┘
               │ wx.cloud (微信小程序云开发 SDK)
               ▼
┌─────────────────────────────────────────────────────────┐
│  CloudBase 后端                                          │
│  ├── 认证 (auth-wechat)   ← OPENID 自动登录             │
│  ├── 文档数据库 (NoSQL)    ← no-sql-wx-mp-sdk            │
│  │   └── 集合: users / records / files                  │
│  ├── 云存储                ← 图片/文件上传下载            │
│  └── 云函数                ← 业务逻辑、第三方 API         │
└─────────────────────────────────────────────────────────┘
```

**适用场景**：小程序简单 CRUD、社交/内容类小程序、轻量工具

**技术选型**：
| 层 | 选型 | 理由 |
|----|------|------|
| 前端 | 微信小程序原生 / Taro / uni-app | wx.cloud 原生集成 |
| 数据库 | 文档型（NoSQL） | 与小程序 SDK 原生集成，上手快 |
| 认证 | OPENID | 无需额外登录流程 |
| 后端 | 云函数（Event Function） | 按需触发，无服务器 |

**资源准备顺序**：
1. 文档库集合 + 安全规则（MCP）
2. 云存储域 + 权限
3. 云函数（runtime 确认 + scf_bootstrap）

## 架构 B: Web 系统 + CloudBase PG（主推）

```
┌─────────────────────────────────────────────────────────┐
│  Web 前端 (React/Next)                                   │
│  - 登录页 (用户名/密码)                                  │
│  - 业务 UI（管理后台 / 数据展示）                        │
└──────────────┬──────────────────────────────────────────┘
               │ CloudBase Web SDK (@cloudbase/js-sdk v3)
               │ app.rdb() — PG 访问
               ▼
┌─────────────────────────────────────────────────────────┐
│  CloudBase 后端                                          │
│  ├── 认证 (auth-web)      ← 用户名密码登录 + publishable key │
│  ├── 数据库 (CloudBase PG) ← PostgreSQL + RLS 行级权限   │
│  │   └── 表: users / records / ... (RLS: user_id = auth.uid()) │
│  ├── 云存储                ← 文件上传                    │
│  └── 后端服务                                           │
│      ├── 云函数 (HTTP Function) ← API 接口              │
│      └── CloudRun            ← 容器化后端（复杂业务）    │
└─────────────────────────────────────────────────────────┘
```

**适用场景**：Web 管理后台、需要复杂查询/权限的系统、SaaS 应用、需要向量检索的应用

**技术选型**：
| 层 | 选型 | 理由 |
|----|------|------|
| 前端框架 | Next.js (App Router) | SSR + 静态托管友好 |
| 前端 SDK | @cloudbase/js-sdk v3 | 官方 Web SDK，支持 `app.rdb()` |
| 认证 | auth-web (用户名/密码) | 最小依赖，无需第三方 OAuth |
| 数据库 | CloudBase PG (PostgreSQL) | 关系型查询 + RLS + pgvector |
| 后端 | 云函数（HTTP Function）或 CloudRun | API 接口或容器化后端 |
| 部署 | manageApps (createApp) | 首次部署必须用此 |

**资源准备顺序（MCP 先行）**：
1. 认证 provider（`manageAppAuth` 开启用户名密码 + 获取 publishable key）
2. CloudBase PG（`queryPgDatabase` 检查 schema → `managePgDatabase` 建表 + RLS 策略）
3. 云存储域 + 权限规则
4. 云函数 / CloudRun（如需后端 API）

## 数据库选型决策表

| 场景 | 选型 | 理由 |
|------|------|------|
| 小程序简单 CRUD | 文档型（NoSQL） | 与小程序 SDK 原生集成，上手快 |
| Web 系统 / 管理后台 | CloudBase PG | 关系型查询 + RLS 行级权限 |
| 需要向量检索 | CloudBase PG | pgvector 扩展 |
| 需要复杂权限模型 | CloudBase PG | RLS 行级安全策略 |
| 简单 key-value 存储 | 文档型（NoSQL） | 足够用 |

## PG 建表 + RLS 示例

```sql
-- users 表
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- records 表（带 RLS）
CREATE TABLE records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能看到自己的数据
CREATE POLICY "users_select_own" ON records
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own" ON records
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own" ON records
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "users_delete_own" ON records
  FOR DELETE USING (user_id = auth.uid());
```

## 关键约束

- **资源先于代码**：auth provider / 表 / 存储域 / 安全规则先通过 MCP 准备好
- **PG 路径走 `postgresql-development`**：用 `app.rdb()`（JS SDK v3）或 `queryPgDatabase` / `managePgDatabase`（MCP），不要退回 NoSQL 或 MySQL 管理工具
- **Web auth**：用 `auth.getSession()` 取 `data.session` 作为登录态证明，不要用废弃的 `getLoginState()` / `auth.getUser()`
- **小程序**：用 `wx.cloud` 和 OPENID 路径，不要套 Web 认证模型
- **首次部署用 `manageApps`**：`manageHosting` 只用于增量更新已部署项目
- **EnvId 显式指定**：alias 须先 `envQuery(aliasExact=true)` 解析
