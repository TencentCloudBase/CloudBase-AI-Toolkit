---
description: CloudBase AI 开发工具包规则 - 支持 Web、小程序、CloudRun、NoSQL/MySQL 数据库、AI Agent 等全栈开发场景
alwaysApply: true
enabled: true
updatedAt: 2026-03-27T00:00:00.000Z
---

## Available Capabilities

### CloudBase Full-Stack Development
- Web 应用开发（React/Vue）使用 CloudBase Web SDK 进行认证、数据库、存储操作
- 微信小程序开发使用微信原生 API 和 `wx.cloud` 进行云开发
- 云函数开发（Cloud Functions）支持事件触发和 HTTP 触发，自动处理 `scf_bootstrap`
- CloudRun 容器化部署支持 Java/Go/Python/Node.js/PHP/.NET 等任意语言运行时
- NoSQL 数据库操作使用 Web SDK 或小程序 SDK 进行 CRUD、聚合查询、实时数据监听
- MySQL 关系型数据库支持通过工具或 Web SDK 执行 SQL 查询
- 云存储支持文件上传、下载、临时访问链接生成
- AI Agent 开发支持 AG-UI 协议、SSE 流式响应、SCF 部署

### Skills Available
- `cloudbase`: 统一入口，包含所有 CloudBase 开发场景的指南和规则

## Core Rules

**1. MCP 优先，CLI 可回退**
使用 CloudBase 管理功能时，本会话已加载 MCP 工具则优先通过 MCP（如 `envQuery`、`manageHosting`、`manageFunctions`、`manageCloudRun` 等）。若 MCP 未配置或尚未进入本会话（首会话 / 安装后需重启），先完成 MCP 配置供下一会话，同时用 `tcb` CLI（`tcb login`、`tcb fn deploy`、`tcb hosting deploy` 等；禁止默认 `tcb deploy`）完成本会话工作，不要阻塞等待重启。决策树见 `cloudbase` skill 的 `tooling-fallback.md`。

**2. 场景识别优先**
开发前首先识别当前场景类型（Web/小程序/云函数/CloudRun/AI Agent），然后阅读对应的 skill 指南。

**3. 认证区分平台**
- Web 项目使用 CloudBase Web SDK 内置认证（如 `auth.toDefaultLoginPage()`）
- 小程序项目天然免登录，云函数中获取 `wxContext.OPENID`

**4. UI 设计先行**
如果任务涉及 UI，先阅读 `ui-design` skill，输出设计规范后再编写界面代码。

**5. 实时通信使用 Watch**
需要实时数据同步时，使用云开发的实时数据库 watch 能力。

**6. 部署顺序**
有后端依赖时，优先部署后端（云函数/CloudRun）再预览前端。

**7. 环境检查**
开始工作前确认云开发环境 ID：MCP 可用时调用 `envQuery`；MCP 不可用时用 `tcb login` / `tcb env list` / `tcb env use`，并先配好 MCP 供下一会话。
