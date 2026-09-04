# cloudbase-webdev-expert（Web 应用开发专家）

CloudBase Web 全栈单专家。定位：**前端页面 + PostgreSQL + RLS 行级权限 + 云函数 + AI 大模型接入**，从需求到部署跑通。

服务对象：

- **不写代码的业务同事**：说清需求即可获得可用的网页工具（跟进表、排班、统计、看板、提醒）
- **企业团队**：内部工具（对内/对外域名隔离、RLS 按角色控权）、客户演示页，数据留在企业自己的 CloudBase 环境
- **独立开发者 / SaaS 创业者**：带注册登录、真实数据库、后台管理的 MVP

## 分层引用（包内不复制领域知识）

| 层 | 内容 | 来源 |
| --- | --- | --- |
| 核心 | 平台总览 / Web 开发部署 / PG / 前端直连 PG / MCP 建表 | `cloudbase-platform`、`cloudbase-sites-runtime`、`postgresql-development-cloudbase`、`relational-database-web-cloudbase`、`relational-database-mcp-cloudbase` |
| 补充 | 云函数 / 鉴权 / 存储 / 大模型 / 建模 / UI | `cloud-functions`、`auth-web-cloudbase`、`cloud-storage-web`、`ai-model-web`、`data-model-creation`、`ui-design` |
| 包内 | 企业落地模式、需求描述模板、安全红线、场景适配判断 | `references/enterprise-web-toolkit-playbook.md` |

## 使用

WorkBuddy 专家中心选择本专家，直接描述需求（如"帮我做一个客户跟进管理工具，按角色区分权限"）。

## 维护

真源在本仓库 `plugins/experts/cloudbase-webdev-expert/`，修改后执行：

```bash
npm run experts:sync cloudbase-webdev-expert
```
