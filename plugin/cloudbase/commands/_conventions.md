# Command Conventions

Every slash command in this plugin follows a consistent structure so that the AI agent produces reliable, verifiable results. When authoring or updating a command file, include **all** of the sections below.

## Required Sections

### 1. Preflight

Check prerequisites before doing any work:

- **MCP 连接检查** — 确认 `cloudbase-mcp` server 已连接，`envQuery`、`manageFunctions`、`manageHosting` 等工具可用。
- **登录状态** — 确认 CloudBase 已鉴权（`envQuery({action:"info"})` 可返回环境信息即代表已登录）；未登录时引导用户完成授权流程。
- **环境选择** — 确认当前操作的 EnvId。若 `CLOUDBASE_ENV_ID` 未设置或会话中未选定环境，先调用 `envQuery({action:"list"})` 让用户选择。
- **项目类型检测** — 根据目录结构判断项目类型：
  - 存在 `cloudfunctions/` 目录 → 云函数项目
  - 存在 `dist/` 或 `public/` → 静态托管项目
  - 存在 `Dockerfile` → 云托管项目
  - 存在 `project.config.json` → 微信小程序项目
- **Repo 状态** — 部署类操作前运行 `git status --porcelain`，提示未提交的改动不会进入部署产物。

Preflight 失败时必须给出清晰、可执行的指引，不得静默跳过。

### 2. Plan

执行前明确说明即将发生的操作：

- 列出将要执行的 MCP 工具调用或 CLI 命令。
- 标记破坏性或生产环境影响的操作，并要求用户显式确认。
- 当存在多种策略（MCP-first vs CLI-fallback）时，说明选择了哪条路径及原因。

### 3. Commands

操作核心。遵循以下约定：

- **MCP-first, CLI-fallback** — 优先使用 cloudbase MCP 工具（`envQuery`、`manageFunctions`、`manageHosting`、`manageCloudRun`、`queryFunctions`、`queryHosting`、`queryLogs`、`downloadTemplate`）；仅当 MCP 缺失能力时才回退到 `tcb` CLI。
- **结构化输出** — 优先使用 MCP 工具返回的 JSON 结果，解析后以可读的表格或列表呈现。
- **No secrets in output** — 环境变量值不得出现在任何输出、摘要或对话文本中。只展示变量名称和元数据（类型、创建时间等）。
- **Confirmation for destructive ops** — 生产部署、环境删除、域名变更、函数删除等操作必须获得用户明确的 "yes" 确认。

### 4. Verification

执行后确认结果：

- 重新查询状态（如 `queryFunctions({action:"listFunctions"})`、`queryHosting({action:"status"})`）确认操作已生效。
- 尽可能对比操作前后的状态差异。
- 呈现命令输出中的错误或警告。

### 5. Summary

呈现简洁的结果块：

```
## Result
- **Action**: 执行的操作
- **Status**: success | partial | failed
- **Details**: 关键输出（URL、资源 ID、配置变更摘要）
```

### 6. Next Steps

建议合理的后续操作：

- 部署后 → 检查日志、验证访问 URL、提醒 CDN 缓存延迟。
- 环境变更后 → 拉取最新配置、重新部署。
- 状态检查后 → 修复异常项、重新部署过期资源。

## File Naming

- Command 文件位于 `commands/` 目录，以 `.md` 结尾。
- 以 `_` 前缀开头的文件（如本文件）是元文档，不是 slash command。它们不会被 `plugin.json` 枚举，也不作为用户可调用的命令。

## Frontmatter

每个 command 文件必须包含 YAML frontmatter，至少有 `description` 字段：

```yaml
---
description: 一句话描述命令功能（中文）。
---
```

## Core Rules

- **MCP-first** — 优先使用 cloudbase MCP 工具（`envQuery`、`manageFunctions`、`manageHosting`、`manageCloudRun`），CLI 仅作 fallback。
- **CLI-fallback** — `tcb` CLI 作为 MCP 能力缺失时的回退方案。
- **Never-Echo-Secrets** — 环境变量值不得出现在任何输出中，只显示名称和元数据。
- **Production 门控** — 生产部署、资源删除等破坏性操作需用户显式确认。
- **中文描述** — `description` 字段使用中文，命令名和 MCP 工具名保持英文。

## Validation

每个 command 应包含 Preflight、Plan、Commands、Verification、Summary、Next Steps 六个段落。
