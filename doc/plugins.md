# 插件系统

CloudBase MCP 采用插件化架构，支持按需启用工具模块。**插件名称、默认启用集合与兼容别名以 `mcp/src/server.ts` 中的 `DEFAULT_PLUGINS`、`AVAILABLE_PLUGINS`、`PLUGIN_ALIASES` 为准**。

## 当前可用插件

| 插件名 | 默认启用 | 说明 | 兼容别名 |
|--------|----------|------|----------|
| `env` | 是 | 环境登录、环境查询、安全域名管理 | - |
| `database` | 是 | NoSQL / SQL / 数据模型相关能力 | - |
| `functions` | 是 | 云函数查询、创建、更新、调用 | - |
| `hosting` | 是 | 静态托管与域名管理 | - |
| `storage` | 是 | 云存储文件管理 | - |
| `setup` | 是 | 项目模板、IDE 规则与配置下载 | - |
| `rag` | 是 | 知识库检索与网页搜索 | - |
| `cloudrun` | 是 | 云托管服务初始化、部署与管理 | - |
| `gateway` | 是 | 云函数访问入口与路由管理 | - |
| `app-auth` | 是 | 应用侧认证配置 | `auth-config` |
| `permissions` | 是 | 权限、角色与安全规则管理 | `access-control`, `security-rule`, `security-rules`, `secret-rule`, `secret-rules`, `users` |
| `logs` | 是 | 日志服务状态与日志检索 | - |
| `agents` | 是 | Agent 列表、详情、日志与管理 | - |
| `download` | 是 | 下载远程文件到本地项目 | - |
| `invite-code` | 是 | AI 编程激励邀请码激活 | - |
| `capi` | 是 | 通用云 API 调用 | - |
| `apps` | 是 | CloudApp 应用与版本管理 | - |

> 建议在新文档、示例和配置中统一使用上表中的 canonical 名称；兼容别名仅用于兼容旧配置或旧提示词。

## 插件配置

### 指定启用插件

`CLOUDBASE_MCP_PLUGINS_ENABLED` 用于**只启用**指定插件，多个插件使用逗号分隔：

```json
{
  "mcpServers": {
    "cloudbase-mcp": {
      "command": "npx",
      "args": ["npm-global-exec@latest", "@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "CLOUDBASE_MCP_PLUGINS_ENABLED": "env,database,functions,permissions,logs"
      }
    }
  }
}
```

### 禁用特定插件

`CLOUDBASE_MCP_PLUGINS_DISABLED` 用于从默认插件集合中**禁用**指定插件，多个插件使用逗号分隔：

```json
{
  "mcpServers": {
    "cloudbase-mcp": {
      "command": "npx",
      "args": ["npm-global-exec@latest", "@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "CLOUDBASE_MCP_PLUGINS_DISABLED": "rag,download,agents"
      }
    }
  }
}
```

### 托管模式 URL 参数

托管模式下可通过 URL query 参数控制插件范围：

- `enable_plugins`：仅启用指定插件
- `disable_plugins`：从默认插件集合中禁用指定插件
- 多个插件名称均使用**逗号分隔**

完整示例见 [`connection-modes.mdx`](connection-modes.mdx)。

## 常用配置

| 场景 | 推荐插件 |
|------|----------|
| **基础开发** | `env,database,functions,hosting,storage` |
| **应用认证** | `env,app-auth,permissions` |
| **纯后端** | `env,database,functions,permissions,logs` |
| **AI 应用** | `env,database,functions,hosting,rag,agents` |
| **云托管服务** | `env,cloudrun,gateway,logs` |
| **微信小程序项目** | 按业务启用 `env,database,functions,storage,permissions`，项目初始化与开发流程请改看 [项目模板](templates.md) 与 [微信小程序 Skill](prompts/miniprogram-development.mdx) |

## 相关文档

- [MCP 工具详细说明](mcp-tools.md) - 查看各工具参数与说明
- [快速开始](getting-started.mdx) - 开始使用指南
- [连接方式](connection-modes.mdx) - 本地模式与托管模式说明
- [项目模板](templates.md) - 模板下载与初始化说明
- [常见问题](faq.md) - 插件配置问题
