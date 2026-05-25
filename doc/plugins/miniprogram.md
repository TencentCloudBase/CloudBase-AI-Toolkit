# 微信小程序支持说明

当前版本的 CloudBase MCP **没有独立的 `miniprogram` 插件**。仓库中与微信小程序相关的能力主要体现在两部分：

- `downloadTemplate(template="miniprogram")`：下载微信小程序 + CloudBase 项目模板
- `miniprogram-development` Skill：为 AI 提供小程序开发、调试、预览、测试与发布流程指导

这意味着：**小程序支持仍然存在，但它不再以 MCP 插件名 `miniprogram` 的形式暴露**。

## 当前推荐用法

### 1. 初始化项目

如果你要从 0 开始创建微信小程序项目，优先使用 `downloadTemplate` 下载小程序模板，而不是依赖某个名为 `miniprogram` 的插件。

相关文档：

- [项目模板](../templates.md)
- [MCP 工具](../mcp-tools.md)

### 2. 让 AI 按规范开发小程序

如果你希望 AI 继续完成页面开发、调试、预览、上线等流程，推荐使用微信小程序 Skill：

- [微信小程序 Skill](../prompts/miniprogram-development.mdx)
- [如何使用 Skill](../prompts/how-to-use.mdx)

### 3. 按业务启用 MCP 插件

小程序项目常见会搭配以下 MCP 插件使用：

- `env`：环境登录、环境查询
- `database`：数据库与数据模型
- `functions`：云函数能力
- `storage`：云存储文件管理
- `permissions`：权限与安全规则

如果项目还涉及日志排查、远程素材下载或云托管，可以再按需启用：

- `logs`
- `download`
- `cloudrun`
- `gateway`

## 为什么不再叫“小程序插件”

因为当前实现中：

- `mcp/src/server.ts` 没有注册 `miniprogram` 为可用插件
- `mcp/src/tools/` 下也没有 `miniprogram` 对应的 MCP 工具实现文件

历史文档里把它描述成独立插件，已经不再准确。后续如果提到微信小程序能力，应优先使用以下表述：

- **小程序模板支持**
- **小程序开发 Skill**
- **微信小程序开发流程支持**

而不是继续写成 `miniprogram` 插件。

## 相关文档

- [插件系统总览](../plugins.md)
- [项目模板](../templates.md)
- [微信小程序 Skill](../prompts/miniprogram-development.mdx)
- [MCP 工具](../mcp-tools.md)
