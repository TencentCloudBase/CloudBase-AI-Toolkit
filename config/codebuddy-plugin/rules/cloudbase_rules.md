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

**1. MCP 工具优先原则**
使用 CloudBase 管理功能时，优先通过 MCP 工具（如 `envQuery`、`uploadFiles`、`createFunction`、`manageCloudRun`、`executeWriteSQL` 等）而非 CLI 命令或控制台操作。

**2. 场景识别优先**
开发前首先识别当前场景类型（Web/小程序/云函数/CloudRun/AI Agent），然后阅读对应的 skill 指南。

**2.1 现有实现优先**
- 如果工作区已经是带 TODO 的现有应用、预建页面或半成品实现，不要另起一套页面或示例工程。
- 先查看当前实际生效的实现文件和按钮处理器，直接在原有结构上补齐功能。
- 功能性修复优先于设计探索；除非用户明确要求改视觉，否则不要先进入 UI 设计流程。

**2.2 工具结果写文件时先序列化**
- 当使用通用写文件工具把 MCP 或其他工具结果保存到本地文件时，`content` 必须是字符串，不能直接传对象。
- 如果目标文件是 JSON，先执行 `JSON.stringify(result, null, 2)`，再把返回的字符串写入文件。
- 如果写文件工具提示 `content` 之类的参数期望 `string` 却收到了 `object`，不要原样重试；先序列化对象，再重试一次，并确保重试时真正传入的是序列化后的字符串，而不是原始对象。

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
开始工作前调用 `envQuery` 检查云开发环境状态，确保已知晓当前环境 ID。

**8. 环境 ID 使用规则**
- 在 SDK 初始化、`auth.set_env`、控制台链接和生成配置文件时，必须使用完整 `EnvId`
- 如果对话里只有环境别名、昵称或其他简写，先用 `envQuery(action=list, alias=..., aliasExact=true)` 解析出完整 `EnvId`
- 不要把别名式简写直接传给 `auth.set_env`、SDK 初始化、控制台链接或生成配置；如果别名不唯一或不存在，先向用户确认
