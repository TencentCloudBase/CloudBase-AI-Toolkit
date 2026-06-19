# CloudBase AI Toolkit - 最终文案建议

## 标题与定位

```markdown
# CloudBase AI Toolkit
The backend for AI-powered development.
为你的小程序和 Web/H5 提供一体化运行与部署环境，包括数据库、云函数、云存储、身份权限和静态托管。
从提示词到上线，一键完成。
```

---

## 完整结构建议

```markdown
# CloudBase AI Toolkit

The backend for AI-powered development.
为你的小程序和 Web/H5 提供一体化运行与部署环境，包括数据库、云函数、云存储、身份权限和静态托管。
从提示词到上线，一键完成。

[![GitHub stars](https://img.shields.io/github/stars/TencentCloudBase/CloudBase-AI-ToolKit)](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit)
[![NPM version](https://img.shields.io/npm/v/@cloudbase/cloudbase-mcp)](https://www.npmjs.com/package/@cloudbase/cloudbase-mcp)
[![License](https://img.shields.io/npm/l/@cloudbase/cloudbase-mcp)](LICENSE)

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
```

---

## 关键改进点

1. **标题精准** - "The backend for AI-powered development" + 一体化环境说明
2. **定位清晰** - 连接 AI agents 到云基础设施
3. **功能简洁** - 表格改为两列，删除所有数字
4. **快速开始** - 只保留核心配置，详细信息通过链接展开
5. **IDE 支持** - 分类展示，折叠其余工具
6. **资源链接** - 精选 5 个核心链接，不多不少

---

## 与 Vercel/Supabase/InsForge 的对比

| 维度 | Vercel/Next.js | Supabase | InsForge | CloudBase (建议) |
|------|----------------|----------|------------|-------------------|
| **标题** | "The React Framework" | "The Postgres development platform" | "The backend built for agentic development" | "The backend for AI-powered development" |
| **副标题** | 无 | 无 | 无 | "为你的小程序和 Web/H5 提供一体化运行与部署环境..." |
| **定位** | 精准、技术化 | 精准、技术化 | 精准、技术化 | 精准、技术化 + 场景说明 |
| **功能** | 3-4 个核心特性 | 6 个产品模块 | 6 个核心产品 | 7 个能力分类 |
| **快速开始** | 1 行命令 + 链接 | 1 行命令 + 链接 | Docker Compose 配置 | 2 种模式 + 配置代码 |
| **IDE 支持** | 不单独列出 | 不单独列出 | 表格 + "View all" 链接 | 分类展示 + "View all" 链接 |

---

## 需要我按这个结构重写 README 吗？
