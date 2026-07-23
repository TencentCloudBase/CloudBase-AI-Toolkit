<div align="center"><a name="readme-top"></a>

<img src="https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/mcp/icon.png" width="96" height="96" alt="CloudBase AI Toolkit" />

# @cloudbase/cloudbase-mcp

**腾讯云开发 CloudBase 的 MCP Server。** 属于 [CloudBase AI Toolkit](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit)。

在 AI 编程工具里通过 Model Context Protocol 操作 CloudBase：登录、数据库、云函数、存储、托管与日志。

**简体中文** · [English](./README.md) · [Toolkit 总览](../README.zh-CN.md) · [文档][docs] · [更新日志][changelog] · [Issues][github-issues-link]

[![][npm-version-shield]][npm-link]
[![][npm-downloads-shield]][npm-link]
[![][github-stars-shield]][github-stars-link]
![][github-license-shield]

</div>

## 这个包是什么

`@cloudbase/cloudbase-mcp` 是 CloudBase MCP Server 的 npm 发行包，是 Toolkit 中的一块：

| 组件 | 作用 |
|------|------|
| **Plugin** | 一次安装 MCP + Skills + Hooks |
| **Agent Skills** | 场景化技能，约束可落地的 CloudBase 实践 |
| **MCP**（本包） | Agent 调用的工具，作用于你的云开发环境 |

IDE 支持时优先用 Plugin；只需 MCP 配置时用本包即可。

完整 Toolkit 叙事、相关仓库与 IDE 列表见 [仓库 README](../README.zh-CN.md)。

## 快速开始

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

首次提示：

```
登录云开发
```

```
用 CloudBase Skills 做一个带登录、数据库和权限的待办应用，然后部署
```

需要已开通 [云开发环境](https://tcb.cloud.tencent.com/dev)，并对 AI 发起的敏感操作自行确认。

### 其他安装路径

| 路径 | 适用 |
|------|------|
| `npx plugins add TencentCloudBase/cloudbase-plugin` | 支持 Open Plugin Spec 的工具 |
| `npm i -g @cloudbase/cli && tcb ai` | [CloudBase AI CLI](https://docs.cloudbase.net/cli-v1/ai/introduce) 统一配置多种 IDE |
| Marketplace / 内置插件 | Claude Code、Codex、CodeBuddy、WorkBuddy、ZCode 等 |

## 连接方式

**本地**（默认）：本机 `npx`，功能最全（含本地文件上传/模板）。需 Node.js v18.15.0+。

**托管**：IDE 通过 HTTP 连接腾讯云 MCP，无需本机 Node。部分依赖本地文件的能力不可用。

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

托管 URL 可用 `enable_plugins` / `disable_plugins`（逗号分隔）。插件名见本包 `src/server.ts`（如 `env`、`database`、`functions`、`hosting`、`storage`、`pg_database`、`cloudrun`、`logs`）。

**自建 Cloud Mode**：设置 `CLOUDBASE_MCP_CLOUD_MODE=true`（或 `MCP_CLOUD_MODE=true`），禁用面向远程调用方的本地文件/进程类工具。

| 场景 | 建议 |
|------|------|
| 个人开发 | 本地 `npx` |
| 团队 / 免运维 | 托管 HTTP |
| 自建 MCP | 必须开 Cloud Mode |

## 能力

在你的环境中完成常见后端工作（关键步骤请确认）：

- **数据库**：PostgreSQL 与文档型数据库、数据模型、CRUD、权限
- **计算**：云函数 / 云托管——编写、部署、调用、排障
- **认证与存储**：登录方式、对象存储、与数据权限联动
- **发布与运维**：静态托管 / 小程序发布；日志与重新部署

工具目录：[MCP 工具](../doc/mcp-tools.md) · [tools.json](../scripts/tools.json)

## IDE 配置片段

<details>
<summary>Cursor (.cursor/mcp.json)</summary>

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
<summary>WindSurf (.windsurf/settings.json)</summary>

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

已内置 CloudBase，通常无需手动配置 MCP。

</details>

其他：[IDE 配置指南](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/)。

## 文档

- [Toolkit 总览](../README.zh-CN.md)
- [快速开始](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started)
- [AI 插件](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ai-agent-plugins)
- [常见问题](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/faq)
- [更新日志][changelog]

## 许可证

[MIT](../LICENSE) · [TencentCloudBase](https://github.com/TencentCloudBase)

<!-- Links -->
[docs]: https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/
[changelog]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/releases
[github-issues-link]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/issues
[github-stars-link]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/stargazers
[npm-link]: https://www.npmjs.com/package/@cloudbase/cloudbase-mcp

<!-- Shields -->
[npm-version-shield]: https://img.shields.io/npm/v/@cloudbase/cloudbase-mcp?color=3B82F6&label=npm&logo=npm&style=flat-square
[npm-downloads-shield]: https://img.shields.io/npm/dw/@cloudbase/cloudbase-mcp?color=10B981&label=downloads&logo=npm&style=flat-square
[github-stars-shield]: https://img.shields.io/github/stars/TencentCloudBase/CloudBase-AI-Toolkit?color=F59E0B&label=stars&logo=github&style=flat-square
[github-license-shield]: https://img.shields.io/badge/license-MIT-6366F1?logo=github&style=flat-square
