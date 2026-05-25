# CloudBase AI Toolkit - 最终 README 建议

## 保留的图标和 Badge

```markdown
<div align="center"><a name="readme-top"></a>

<a href="https://cloud.tencent.com/developer/article/2649588" target="_blank"><img width="3094" height="654" alt="banner" src="https://github.com/user-attachments/assets/37982d04-274a-4b6c-85b8-06983c615d9a" /></a>

![](scripts/assets/toolkit-better.gif)

<h1>CloudBase MCP</h1>

**🪐 AI 编程，一键上线**<br/>
连接 AI IDE 与腾讯云 CloudBase 的部署桥梁，让你的 AI 应用即刻上线

[English](./README-EN.md) · **简体中文** · [文档][docs] · [更新日志][changelog] · [反馈问题][github-issues-link]

<!-- SHIELD GROUP -->

[![][npm-version-shield]][npm-link]
[![][npm-downloads-shield]][npm-link]
[![][github-stars-shield]][github-stars-link]
[![][github-forks-shield]][github-forks-link]
[![][github-issues-shield]][github-issues-link]
![][github-license-shield]
![][github-contributors-shield]
[![][cnb-shield]][cnb-link]
[![][deepwiki-shield]][deepwiki-link]
[![MCP Badge](https://lobehub.com/badge/mcp/tencentcloudbase-cloudbase-ai-toolkit)](https://lobehub.com/mcp/tencentcloudbase-cloudbase-ai-toolkit)

</div>

---

## 核心定位

**The backend for AI-powered development.**
为你的小程序和 Web/H5 提供一体化运行与部署环境，包括数据库、云函数、云存储、身份权限和静态托管。
从提示词到上线，一键完成。

---

## What is CloudBase?

CloudBase is the deployment layer for AI-powered development.
It connects AI coding agents to cloud infrastructure, enabling one-click deployment from prompt to production.

**Supported platforms**: WeChat Mini-Program, Web/H5, Backend Services.
**Supported IDEs**: Cursor, Windsurf, Claude Code, GitHub Copilot, and 20+ more.

---

## Core Capabilities

| Category | Features |
|----------|----------|
| **Environment** | Login, auth, env query, domain management |
| **Database** | Collections, CRUD, indexes, data models |
| **Functions** | Create, update, invoke, logs, triggers |
| **Storage** | File uploads, CDN, cloud storage |
| **Hosting** | Static hosting, domain config, deployment |
| **Auth** | Identity management, permissions |
| **Tools** | Templates, knowledge search, web search |

[View all 39 tools →](doc/mcp-tools.md)

---

## Quick Start

### Option 1: Local Mode (Recommended)
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

### Option 2: Hosted Mode
```json
{
  "mcpServers": {
    "cloudbase": {
      "url": "https://tcb-api.cloud.tencent.com/mcp/v1?env_id=YOUR_ENV_ID"
    }
  }
}
```

[View all connection modes →](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started)

---

## Supported IDEs

**Command Line**: CloudBase CLI, OpenClaw, Claude Code, Gemini CLI...
**Standalone IDE**: Cursor, Windsurf, CodeBuddy, Trae...
**VS Code Plugins**: GitHub Copilot, Cline, RooCode...

[View all 23 IDEs →](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup)

---

## Resources
- [Documentation](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit)
- [Quick Start](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started)
- [IDE Setup](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup)
- [Templates](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/templates)
- [FAQ](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/faq)

---

**CloudBase AI Toolkit**
*The backend for AI-powered development.*

<!-- SHIELD LINKS -->
[npm-version-shield]: https://img.shields.io/npm/v/@cloudbase/cloudbase-mcp?style=flat-square
[npm-version-link]: https://www.npmjs.com/package/@cloudbase/cloudbase-mcp
[npm-downloads-shield]: https://img.shields.io/npm/dm/@cloudbase/cloudbase-mcp?style=flat-square
[npm-downloads-link]: https://www.npmjs.com/package/@cloudbase/cloudbase-mcp
[github-stars-shield]: https://img.shields.io/github/stars/TencentCloudBase/CloudBase-AI-ToolKit?style=flat-square&color=181717&logo=github&logoColor=white&labelColor=181717
[github-stars-link]: https://github.com/TencentCloudBase/CloudBase-AI-ToolKit
[github-forks-shield]: https://img.shields.io/github/forks/TencentCloudBase/CloudBase-AI-ToolKit?style=flat-square&color=181717&logo=github&logoColor=white&labelColor=181717
[github-forks-link]: https://github.com/TencentCloudBase/CloudBase-AI-ToolKit
[github-issues-shield]: https://img.shields.io/github/issues/TencentCloudBase/CloudBase-AI-ToolKit?color=EC4899&label=issues&logo=github&style=flat-square
[github-issues-link]: https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues
[github-license-shield]: https://img.shields.io/badge/license-MIT-6366F1?logo=github&style=flat-square
[github-contributors-shield]: https://img.shields.io/github/contributors/TencentCloudBase/CloudBase-AI-ToolKit?color=06B6D4&label=contributors&logo=github&style=flat-square
[cnb-shield]: https://img.shields.io/badge/CNB-CloudBase--AI--ToolKit-3B82F6?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHJ4PSIyIiBmaWxsPSIjM0I4MkY2Ii8+PHBhdGggZD0iTTUgM0g3VjVINSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIxLjUiLz48cGF0aCBkPSJNNSA3SDdWOUg1IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjEuNSIvPjwvc3ZnPg==&style=flat-square
[cnb-link]: https://cnb.cool/tencentcloudbase/CloudBase-AI-ToolKit
[deepwiki-shield]: https://deepwiki.com/badge.svg
[deepwiki-link]: https://deepwiki.com/TencentCloudBase/CloudBase-AI-ToolKit
```

---

## 关键改进点

1. **保留所有图标和 badge** - 包括 banner、GIF、所有 shield 徽章
2. **精准定位** - "The backend for AI-powered development" + 一体化环境说明
3. **场景说明** - "为你的小程序和 Web/H5 提供一体化运行与部署环境..."
4. **技术范儿** - 参考 Vercel/Supabase/InsForge 的简洁风格
5. **结构清晰** - 定位 → 功能 → 快速开始 → IDE 支持 → 资源
6. **删除工具数量** - 所有表格不再包含具体数字

---

## 与当前版本对比

| 维度 | 当前版本 | 建议版本 |
|------|----------|----------|
| **标题** | "发现了一个让 AI 编程一键上线的神器" | "The backend for AI-powered development" |
| **定位** | 营销化、太长 | 精准、技术化 |
| **图标** | ✅ 保留所有 | ✅ 保留所有 |
| **Badge** | ✅ 保留所有 | ✅ 保留所有 |
| **功能表格** | 3 列，含数字 | 2 列，无数字 |
| **快速开始** | 30 行说明 | 10 行配置 + 链接 |
| **IDE 支持** | 23 行完整表格 | 3 行分类 + "View all" 链接 |

---

**需要我按这个结构重写 README 吗？**
