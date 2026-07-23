<div align="center"><a name="readme-top"></a>

# CloudBase AI Toolkit

**AI 写代码，CloudBase 管后端。**

面向 AI 编程工具的 CloudBase 接入层：用 Plugin 装好工具，用 Skills 约束写法，用 MCP 在对话里操作数据库、云函数、存储与部署。

[English](./README-EN.md) · [文档][docs] · [更新日志][changelog] · [Issues][github-issues-link]

[![][npm-version-shield]][npm-link]
[![][npm-downloads-shield]][npm-link]
[![][github-stars-shield]][github-stars-link]
[![][github-license-shield]]
[![][cnb-shield]][cnb-link]

</div>

## 最近更新

**v2.24.x**（2026-07）

- Plugin：Open Plugin Spec；`npx plugins add` 安装 MCP / Skills / Hooks
- PostgreSQL：schema 变更默认经 `applyMigration`（显式 `migrationVersion`）
- 环境与可观测性：`manageEnv` 契约修正；工具调用可关联客户端信息

[Releases][changelog] · [Star][github-stars-link] · Watch → Releases

## 它是什么

AI IDE（Cursor、Claude Code、Codex、CodeBuddy 等）擅长生成代码。真正卡住的往往是后端：库表、权限、函数、存储、环境与发布。

[CloudBase](https://docs.cloudbase.net/) 是腾讯云的 AI 原生后端一体化平台（数据库、存储、身份认证、云函数、云托管等）。本仓库提供把这套后端接到 AI 工具里的 Toolkit：

| 组件 | 作用 |
|------|------|
| **Plugin** | 一次安装 MCP Server、Agent Skills 与 Hooks，减少按 IDE 分别配置 |
| **Agent Skills** | 场景化技能（Web / 小程序 / 数据库 / 认证 / 云函数等），约束可落地的 CloudBase 实践 |
| **MCP** | 在对话中登录环境、查改数据、管理函数与托管、读日志排障 |

本仓库同时发布 npm 包 `@cloudbase/cloudbase-mcp`、Skills 与 AI 插件。

你仍需要：开通自己的云开发环境，并在 IDE 中确认 AI 发起的敏感操作。Toolkit 提供能力与路径，不替代判断。

### 相关仓库

发布与同步仓集中在 [TencentCloudBase](https://github.com/TencentCloudBase) 组织。与本 Toolkit 直接相关的如下：

| 仓库 | 内容 | 常用入口 |
|------|------|----------|
| [CloudBase-AI-ToolKit](https://github.com/TencentCloudBase/CloudBase-MCP)（本仓库） | MCP Server 源码；Claude Code / Codex 等原生 marketplace 来源 | `npx @cloudbase/cloudbase-mcp@latest` |
| [cloudbase-plugin](https://github.com/TencentCloudBase/cloudbase-plugin) | Open Plugin Spec 发布仓（由本仓库 CI 同步）：MCP + Skills + Hooks | `npx plugins add TencentCloudBase/cloudbase-plugin` |
| [cloudbase-sites-plugin](https://github.com/TencentCloudBase/cloudbase-sites-plugin) | Sites 插件：Vite Web 创建与部署 | `npx plugins add TencentCloudBase/cloudbase-sites-plugin` |
| [cloudbase-skills](https://github.com/TencentCloudBase/cloudbase-skills) | Agent Skills 合集 | `npx skills add TencentCloudBase/cloudbase-skills` |
| [skills](https://github.com/TencentCloudBase/skills) | 可按单个 skill 安装的目录（亦用于 [skills.sh](https://skills.sh)） | `npx skills add tencentcloudbase/skills --skill <name>` |
| [awesome-cloudbase-examples](https://github.com/TencentCloudBase/awesome-cloudbase-examples) | 云开发案例与示例集合 | 浏览 / 克隆示例 |
| [OpenVibeCoding](https://github.com/TencentCloudBase/OpenVibeCoding) | 基于 CloudBase 的 vibecoding 模板 | 作为项目起点使用 |

优先用 Plugin 拿齐全套；只需知识约束时可只装 Skills。marketplace 类 IDE 请用本仓库，不要与 `npx plugins add` 对同一工具重复安装。

## 快速开始

按你的工具选一条默认路径即可。

| 你的工具 | 建议做法 |
|----------|----------|
| Claude Code / Codex（原生 marketplace） | 添加本仓库为 marketplace，再安装 `cloudbase` 插件（见[插件文档](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ai-agent-plugins)） |
| 支持 Open Plugin Spec 的工具 | `npx plugins add TencentCloudBase/cloudbase-plugin` |
| 希望 CLI 统一配置多种工具 | [CloudBase AI CLI](https://docs.cloudbase.net/cli-v1/ai/introduce)：`npm i -g @cloudbase/cli && tcb ai` |
| CodeBuddy / WorkBuddy / ZCode（已内置） | 使用 IDE 内置的 CloudBase 插件或连接器 |
| 其他支持 MCP 的 IDE | 仅配置 MCP（见下方） |

### Plugin

```bash
npx plugins add TencentCloudBase/cloudbase-plugin
```

说明与各 IDE 差异见 [AI 插件文档](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ai-agent-plugins)。

### 仅配置 MCP

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

托管 HTTP、自建 Cloud Mode、按插件裁剪工具集见 [安装与连接](#安装与连接)。

### 首次对话

```
登录云开发
```

```
使用 CloudBase Skills 开发一个带登录的待办应用，包含数据库与权限，并部署
```

Skills 负责写法与结构；MCP 负责环境与资源操作。完成后应能在自己的环境中验证数据与接口，而不只是得到一段本地代码。

### 支持的 AI IDE

<img width="1200" alt="Supported AI IDEs" src="scripts/assets/ide-support-grid.png" />

| 工具 | 平台 | 指引 |
|------|------|------|
| [CloudBase AI CLI](https://docs.cloudbase.net/cli-v1/ai/introduce) | CLI | [指引](https://docs.cloudbase.net/cli-v1/ai/introduce) |
| [OpenClaw](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/openclaw) | CLI | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/openclaw) |
| [WorkBuddy](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/workbuddy) | 独立 IDE | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/workbuddy) |
| [ZCode](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/zcode) | 独立 IDE（≥ 3.4.1 内置插件） | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/zcode) |
| [Codex App](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/codex) | 独立应用 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/codex) |
| [Cursor](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/cursor) | 独立 IDE | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/cursor) |
| [WindSurf](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/windsurf) | 独立 IDE / 插件 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/windsurf) |
| [CodeBuddy](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/codebuddy) | 独立 IDE（已内置） | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/codebuddy) |
| [CLINE](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/cline) | VS Code 插件 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/cline) |
| [GitHub Copilot](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/github-copilot) | VS Code 插件 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/github-copilot) |
| [Trae](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/trae) | 独立 IDE | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/trae) |
| [通义灵码](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/tongyi-lingma) | IDE / 插件 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/tongyi-lingma) |
| [RooCode](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/roocode) | VS Code 插件 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/roocode) |
| [文心快码](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/baidu-comate) | 插件 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/baidu-comate) |
| [Augment Code](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/augment-code) | 插件 | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/augment-code) |
| [Claude Code](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/claude-code) | CLI | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/claude-code) |
| [Gemini CLI](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/gemini-cli) | CLI | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/gemini-cli) |
| [Codex CLI](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/openai-codex-cli) | CLI | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/openai-codex-cli) |
| [OpenCode](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/opencode) | CLI | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/opencode) |
| [Qwen Code](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/qwen-code) | CLI | [指引](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/qwen-code) |

完整配置见 [IDE 配置指南](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/)。

## 能力

接入后，AI 可以在你的环境中完成典型后端工作（需你确认关键步骤）：

- **数据库**：PostgreSQL 与文档型库、数据模型、CRUD、权限与安全规则
- **计算**：云函数与云托管的编写、部署、调用与日志
- **身份与存储**：登录方式、对象存储、与业务数据的权限联动
- **发布与排障**：静态托管 / 小程序发布；根据日志定位问题并再部署

适用形态包括 Web、微信小程序与后端服务。平台能力总览见 [CloudBase 文档](https://docs.cloudbase.net/)。

### 评测说明

在受控条件下，以同一待办（Todo）应用需求与同一前端脚手架为输入，比较两类后端实现路径：传统云主机（自行搭建运行时、进程与网络暴露）与 CloudBase（托管数据库、匿名登录等后端能力）。评测由 AI Agent 端到端完成开发与验证；在给定模型与任务设定下，CloudBase 路径在完成时延、Token 用量与工具调用次数上更优。上述结果受模型、Agent 框架与任务定义约束，不宜外推为一般性结论。

方法、数据与边界条件见：[传统云主机与 CloudBase 同任务评测报告](https://docs.cloudbase.net/solutions/vibe-coding-platform/vm-vs-cloudbase-comparison)

## 安装与连接

### 前置条件

- Node.js v18.15.0+
- 已开通 [云开发环境](https://tcb.cloud.tencent.com/dev)
- 已安装支持 Plugin / Skills / MCP 的 AI 工具

### 配置方式

1. **Plugin**（推荐，能装插件时）  
   `npx plugins add TencentCloudBase/cloudbase-plugin`
2. **CloudBase AI CLI**  
   `npm i -g @cloudbase/cli && tcb ai`
3. **手动 MCP**（按 IDE 写入配置文件）

<details>
<summary>Cursor（.cursor/mcp.json）</summary>

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary>WindSurf（.windsurf/settings.json）</summary>

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary>CodeBuddy</summary>

已内置 CloudBase（含 MCP / Skills），一般无需再手写配置。

</details>

其他 IDE：[完整配置指南](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/)。

### MCP 连接模式

**本地模式**（默认）：本机 `npx` 启动，功能最全（含依赖本地文件系统的上传、模板等）。

**托管模式**：IDE 通过 HTTP 连接腾讯云上的 MCP，无需本机 Node；部分本地文件能力不可用。

```json
{
  "mcpServers": {
    "cloudbase": {
      "type": "http",
      "url": "https://tcb-api.cloud.tencent.com/mcp/v1?env_id=<env_id>",
      "headers": {
        "X-TencentCloud-SecretId": "<腾讯云 Secret ID>",
        "X-TencentCloud-SecretKey": "<腾讯云 Secret Key>"
      }
    }
  }
}
```

托管 URL 可用 `enable_plugins` / `disable_plugins` 裁剪工具集。名称以 `mcp/src/server.ts` 为准。

**自建 Cloud Mode**：在自有服务器部署时设置 `CLOUDBASE_MCP_CLOUD_MODE=true`（或 `MCP_CLOUD_MODE=true`），禁用本地文件与本地进程类工具，避免远程调用方操作宿主机。

| 场景 | 建议 |
|------|------|
| 个人开发 | 本地 `npx` |
| 团队 / 免运维 | 腾讯云托管 HTTP |
| 自建 MCP 服务 | 必须开启 Cloud Mode |

## 案例

**双人在线五子棋**：需求描述后生成 Web + 云数据库与实时能力并部署。  
体验：[五子棋](https://cloud1-5g39elugeec5ba0f-1300855855.tcloudbaseapp.com/gobang/#/) · 更多：[教程与案例](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials)

## 文档

- [MCP 工具说明](doc/mcp-tools.md)（[tools.json](scripts/tools.json)）
- [快速开始](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started)
- [IDE 配置](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/)
- [AI 插件](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ai-agent-plugins)
- [模板](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/templates)
- [FAQ](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/faq)

## 常见问题

<details>
<summary>和 Vercel / Netlify 这类部署平台有何不同？</summary>

它们侧重把前端或容器发布出去。CloudBase 提供数据库、认证、函数等后端能力；Toolkit 让 AI 工具在对话里使用这些能力。部署只是链路的一部分。

</details>

<details>
<summary>没有图形界面 IDE 也能用吗？</summary>

可以。凡能配置 MCP Server 或安装对应 Plugin / Skills 的工具均可，包括 Claude Code、Gemini CLI、OpenCode 等。[支持列表](#支持的-ai-ide)

</details>

<details>
<summary>代码会到哪里？</summary>

部署目标是你自己的云开发环境。本地模式下 MCP 跑在本机；主动部署前代码不必离开本机。云端通信使用 HTTPS。

</details>

<details>
<summary>自建 MCP 服务是否安全？</summary>

本地 `npx` 等同于你在本机执行工具。远程部署务必设置 `CLOUDBASE_MCP_CLOUD_MODE=true`，以禁用本地文件与进程类工具。腾讯云托管 HTTP 模式已带该保护。

</details>

<details>
<summary>费用？</summary>

Toolkit（含 MCP）开源，MIT。云开发环境有免费额度；超出后按量计费，见 [计费说明](https://cloud.tencent.com/document/product/876/39095)。

</details>

<details>
<summary>登录提示环境不存在？</summary>

确认已在 [控制台](https://tcb.cloud.tencent.com/) 开通且环境状态正常，然后再次「登录云开发」选择正确环境。

</details>

## 社区

<div align="center">
<img src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/toolkit-qrcode.png" width="200" alt="微信群二维码">
<br>
<sub>微信技术交流群</sub>
</div>

| | |
|--|--|
| 文档 | [docs.cloudbase.net](https://docs.cloudbase.net/) |
| Issues | [GitHub Issues](https://github.com/TencentCloudBase/CloudBase-MCP/issues) |

## 项目活跃度

![Repo Activity](https://repobeats.axiom.co/api/embed/6cd6ed00da4384e43b24805c197f584626946dda.svg "Repobeats analytics image")

## Contributors

[![Contributors](https://contrib.rocks/image?repo=TencentCloudBase/CloudBase-MCP)](https://github.com/TencentCloudBase/CloudBase-MCP/graphs/contributors)

---

[MIT](LICENSE) · [TencentCloudBase](https://github.com/TencentCloudBase)

<!-- Links -->
[docs]: https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/
[changelog]: https://github.com/TencentCloudBase/CloudBase-MCP/releases
[github-issues-link]: https://github.com/TencentCloudBase/CloudBase-MCP/issues
[github-stars-link]: https://github.com/TencentCloudBase/CloudBase-MCP/stargazers
[npm-link]: https://www.npmjs.com/package/@cloudbase/cloudbase-mcp
[cnb-link]: https://cnb.cool/tencent/cloud/cloudbase/CloudBase-MCP

<!-- Shields -->
[npm-version-shield]: https://img.shields.io/npm/v/@cloudbase/cloudbase-mcp?color=3B82F6&label=npm&logo=npm&style=flat-square
[npm-downloads-shield]: https://img.shields.io/npm/dw/@cloudbase/cloudbase-mcp?color=10B981&label=downloads&logo=npm&style=flat-square
[github-stars-shield]: https://img.shields.io/github/stars/TencentCloudBase/CloudBase-MCP?color=F59E0B&label=stars&logo=github&style=flat-square
[github-license-shield]: https://img.shields.io/badge/license-MIT-6366F1?logo=github&style=flat-square
[cnb-shield]: https://img.shields.io/badge/CNB-CloudBase--AI--ToolKit-3B82F6?style=flat-square
