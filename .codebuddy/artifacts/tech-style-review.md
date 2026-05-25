# README 审视：技术范儿（Vercel/Supabase/InsForge 风格）

## 核心观察

### 1. 标题与定位

**Vercel/Next.js**:
```markdown
# Next.js
The React Framework
```

**Supabase**:
```markdown
# Supabase
The Postgres development platform.
Supabase gives you a dedicated Postgres database to build your web, mobile, and AI applications.
```

**InsForge**:
```markdown
# InsForge
The backend built for agentic development.
Give agents everything they need to ship fullstack apps.
```

**当前 CloudBase README**:
```markdown
# CloudBase AI Toolkit
发现了一个让 AI 编程一键上线的神器，推荐给正在用 AI 编程的朋友
从 AI 提示词到应用上线的最短路径
```

**问题**：
- 标题太长，不够直接
- "神器"、"推荐"太营销化
- 缺少精准的技术定位

**建议改写**：
```markdown
# CloudBase AI Toolkit
The backend for AI-powered development.
从提示词到上线，一键完成。
```

---

### 2. 核心定义

**Vercel/Next.js**:
```markdown
Used by some of the world's largest companies, Next.js enables you to create full-stack web applications with the power of React components.
```

**Supabase**:
```markdown
Supabase is the Postgres development platform.
We're building the features of Firebase using enterprise-grade open source tools.
```

**InsForge**:
```markdown
InsForge is a semantic layer between AI coding agents and backend primitives.
It gives agents everything they need to ship fullstack apps.
```

**当前 CloudBase README**:
```markdown
AI 编程工具（如 OpenClaw、Cursor、CodeBuddy）解决了**代码生成**的难题。
但是从"生成代码"到"应用上线"（部署、配置数据库、CDN、域名），依然存在一条鸿沟。
CloudBase MCP（原 CloudBase AI ToolKit）填补了这条鸿沟。
```

**问题**：
- 太长，3 行才说清楚
- "鸿沟"比喻不够技术范儿
- 缺少精准的技术定位

**建议改写**：
```markdown
CloudBase is the deployment layer for AI-powered development.
It connects AI coding agents to cloud infrastructure, enabling one-click deployment from prompt to production.
```

---

### 3. 功能列表

**Vercel/Next.js**:
```markdown
## Features
- **Full-stack React** - Build UI and API in one project
- **Rust-based tooling** - Fast refresh, optimized builds
- **Latest React features** - Server Components, Suspense, and more
```

**Supabase**:
```markdown
## Features
- **Database** - PostgreSQL with real-time subscriptions
- **Auth** - Email, OAuth, and magic links
- **API** - Auto-generated REST and GraphQL
- **Functions** - Edge functions and background jobs
- **Storage** - File storage with CDN
- **AI** - Vector embeddings and semantic search
```

**InsForge**:
```markdown
## Core Products
- **PostgreSQL** - Dedicated database instance
- **Auth** - User management and permissions
- **Storage** - File uploads with transformations
- **AI** - LLM integration and embeddings
- **MCP Server** - Semantic layer for agents
- **Semantic Layer** - Backend context engineering
```

**当前 CloudBase README**:
```markdown
| 分类 | 工具 | 核心功能 |
|------|------|----------|
| **环境** | 4 个 | 登录认证、环境查询、域名管理 |
| **数据库** | 11 个 | 集合管理、文档 CRUD、索引、数据模型 |
| **云函数** | 9 个 | 创建、更新、调用、日志、触发器 |
| **静态托管** | 5 个 | 文件上传、域名配置、网站部署 |
| **小程序** | 7 个 | 上传、预览、构建、配置、调试 |
| **工具支持** | 4 个 | 模板、知识库搜索、联网搜索、交互对话 |
```

**问题**：
- 表格太密集，阅读体验差
- "X 个"数字已删除，但结构仍冗余
- 缺少技术范儿的精准描述

**建议改写**：
```markdown
## Core Capabilities

### Environment Management
Login, authentication, environment query, domain management.

### Database
Collections, CRUD operations, indexes, data models.

### Cloud Functions
Create, update, invoke, logs, triggers.

### Static Hosting
File uploads, domain configuration, CDN deployment.

### Mini-Program
Upload, preview, build, configure, debug.

### Tool Support
Templates, knowledge base search, web search, interactive dialog.
```

---

### 4. 快速开始

**Vercel/Next.js**:
```markdown
## Getting Started

```bash
npx create-next-app@latest
```

[Learn Next.js](https://nextjs.org/learn) | [Documentation](https://nextjs.org/docs)
```

**Supabase**:
```markdown
## Quick Start

```bash
npm install @supabase/supabase-js
```

[Documentation](https://supabase.com/docs) | [Showcase](https://supabase.com/showcase)
```

**InsForge**:
```markdown
## Quick Start

### Cloud Hosted
[Get started](https://insforge.ai) - Free tier available

### Self-Hosted
```bash
git clone https://github.com/InsForge/InsForge.git
cd InsForge
docker-compose up -d
```
```

**当前 CloudBase README**:
```markdown
### 一行配置，立即使用

在支持 MCP 的 AI IDE 中（Cursor、WindSurf、CodeBuddy 等）添加下方任一配置即可。连接方式有两种：

#### 方式一：本地模式（推荐）
```json
{
  "mcpServers": {
    "cloudbase-mcp": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

#### 方式二：托管模式
```json
{
  "mcpServers": {
    "cloudbase-mcp": {
      "url": "https://tcb-api.cloud.tencent.com/mcp/v1?env_id=YOUR_ENV_ID"
    }
  }
}
```
```

**问题**：
- 太长，用户需要读 30 行才看到配置
- "一行配置"但下面有 20 行代码
- 缺少技术范儿的简洁性

**建议改写**：
```markdown
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
```

---

### 5. IDE 支持

**Vercel/Next.js**:
```markdown
## Community
- [GitHub Discussions](https://github.com/vercel/next.js/discussions)
- [Discord](https://discord.gg/nextjs)
```

**Supabase**:
```markdown
## Community
- [Forum](https://github.com/supabase/supabase/discussions)
- [Discord](https://discord.supabase.com)
```

**InsForge**:
```markdown
## Supported IDEs

| Tool | Platform |
|------|----------|
| Cursor | Standalone IDE |
| Windsurf | Standalone IDE |
| Claude Code | CLI |
| GitHub Copilot | VS Code Plugin |
| ... | ... |

[View all 23 IDEs →](https://docs.insforge.ai/ide-setup)
```

**当前 CloudBase README**:
```markdown
### 支持的 AI IDE

| 工具 | 支持平台 | 查看指引 |
|------|----------|----------|
| [CloudBase AI CLI]... | 命令行工具 | [查看指引]... |
...（23 行）
```

**问题**：
- 表格太长，没人会全看
- "查看指引"列多余
- 缺少技术范儿的简洁性

**建议改写**：
```markdown
## Supported IDEs

**Command Line**: CloudBase CLI, OpenClaw, Claude Code, Gemini CLI...
**Standalone IDE**: Cursor, Windsurf, CodeBuddy, Trae...
**VS Code Plugins**: GitHub Copilot, Cline, RooCode...

[View all 23 IDEs →](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup)
```

---

### 6. 文档链接

**Vercel/Next.js**:
```markdown
## Documentation
- [Next.js Docs](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
- [Showcase](https://nextjs.org/showcase)
```

**Supabase**:
```markdown
## Resources
- [Documentation](https://supabase.com/docs)
- [API Reference](https://supabase.com/docs/reference/javascript)
- [Community](https://github.com/supabase/supabase/discussions)
```

**InsForge**:
```markdown
## Resources
- [Documentation](https://docs.insforge.ai)
- [Discord](https://discord.gg/insforge)
- [Twitter](https://twitter.com/insforge)
```

**当前 CloudBase README**:
```markdown
## 📚 更多资源

### 文档
- [快速开始](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started)
- [IDE 配置指南](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/)
- [项目模板](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/templates)
- [开发指南](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/development)
- [插件系统](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/plugins)
- [常见问题](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/faq)

### 教程
- [查看所有教程和视频...](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials)
```

**问题**：
- 链接太多，用户不知道点哪个
- "查看所有教程和视频..."太长
- 缺少技术范儿的精准性

**建议改写**：
```markdown
## Resources
- [Documentation](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit)
- [Quick Start](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started)
- [IDE Setup](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup)
- [Templates](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/templates)
- [FAQ](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/faq)
```

---

## 总结：技术范儿的 5 个原则

1. **精准定位** - 一句话说清楚是什么
2. **简洁结构** - 标题、功能、快速开始、资源
3. **代码优先** - 用代码块代替文字说明
4. **链接导向** - 详细信息通过链接展开
5. **视觉留白** - 不要填满每一寸空间

---

## 推荐结构（技术范儿版）

```markdown
# CloudBase AI Toolkit
The backend for AI-powered development.
从提示词到上线，一键完成。

[![GitHub stars](https://img.shields.io/github/stars/TencentCloudBase/CloudBase-AI-ToolKit)](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit)
[![NPM version](https://img.shields.io/npm/v/@cloudbase/cloudbase-mcp)](https://www.npmjs.com/package/@cloudbase/cloudbase-mcp)
[![License](https://img.shields.io/npm/l/@cloudbase/cloudbase-mcp)](LICENSE)

---

## What is CloudBase?

CloudBase is the deployment layer for AI-powered development.
It connects AI coding agents to cloud infrastructure, enabling one-click deployment from prompt to production.

**Supported platforms**: Web, WeChat Mini-Program, Backend Services.
**Supported IDEs**: Cursor, Windsurf, Claude Code, GitHub Copilot, and 20+ more.

---

## Core Capabilities

| Category | Features |
|----------|----------|
| **Environment** | Login, auth, env query, domain management |
| **Database** | Collections, CRUD, indexes, data models |
| **Functions** | Create, update, invoke, logs, triggers |
| **Hosting** | File uploads, domain config, CDN deployment |
| **Mini-Program** | Upload, preview, build, configure, debug |
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
