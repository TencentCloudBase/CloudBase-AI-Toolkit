# 🚀 CloudBase AI ToolKit v1.8.40 发布公告

## ✨ 新功能亮点

🎉 **AI CLI 集成（核心亮点）** - 新增 CloudBase AI CLI，支持一键管理多种 AI 编程工具
🎯 **智能交互系统** - 新增交互式工具，支持需求澄清、任务确认和用户友好的界面
☁️ **云托管插件** - 新增云托管服务管理功能，查询、部署、运维一体化
🤖 **AI 数据建模** - 通过 Mermaid ER图智能创建 MySQL 数据模型
📋 **工作流优化** - 新增 `/spec` 和 `/no_spec` 命令控制开发流程
🔐 **安全规则管理** - 统一管理数据库、云函数、存储的安全规则
🎁 **邀请码激活** - 支持 AI 编程用户邀请码激活功能
🔧 **多 IDE 支持** - 新增 CodeBuddy、Qwen Code、OpenCode 等 IDE 支持
📝 **认证规则优化** - 明确 Web 和小程序的认证方式差异
📊 **函数日志 V2** - 升级到新版日志接口，支持按需查询详情
🛡️ **增强稳定性** - 遥测优化、Webpack 重构、错误处理改进

## 🎉 CloudBase AI CLI - 开发工具集成

### 🌟 核心优势
- **🏗️ 统一管理** - 一个命令管理多种 AI 编程 CLI 工具，无需在多个工具间切换
- **🤖 多模型支持** - 支持内置和自定义各种大模型，包括 Kimi K2、智谱 GLM-4.5 等
- **🚀 一键开发部署** - 从代码生成到云端部署的完整流程，支持 Web 应用、小程序、后端服务
- **🌍 无处不在** - 可在任意环境中运行，包括小程序开发者工具、VS Code、GitHub Actions 等

### 💻 快速开始
```bash
# 安装
npm install @cloudbase/cli@latest -g

# 开始使用
tcb ai
```

### 🎯 支持的 AI 工具
- Claude Code
- OpenAI Codex
- aider
- Qwen Code
- 其他主流 AI 编程工具

## 🔧 技术改进

- 优化日志系统，支持跨平台兼容性和竞态条件修复
- 增强遥测功能，改进错误跟踪和请求 ID 支持
- 重构构建系统，采用模块化 Webpack 配置
- 改进工具文档，增强可读性和参数说明
- 优化数据库工具，支持对象数组参数和嵌套 JSON
- 增强小程序调试工具和微信开发者工具集成

## 🐛 问题修复

- 修复 IDE 文件过滤问题，支持特定 IDE 类型
- 解决环境 ID 获取的循环依赖死锁问题
- 修复数据库工具参数序列化和语法错误
- 优化函数部署依赖安装配置
- 改进 README 保护机制和模板下载功能

## 📚 文档更新

- 新增插件系统文档和使用指南
- 优化 FAQ 和故障排除指南
- 增强教程和案例学习资料
- 更新 MCP 工具参考文档

---

## 🚀 升级指南

### 更新 MCP 工具
**方法一：自动更新（推荐）**
在你的 AI 开发工具的 MCP 列表中，找到 cloudbase 并重新启用或刷新 MCP 列表即可自动安装最新版本。

**方法二：手动更新**
如果自动更新不成功，可以先禁用再重新启用 cloudbase，或者重启你的 AI IDE。

**方法三：使用最新版本**
```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["npm-global-exec@latest", "@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

### 更新项目规则
在项目中对 AI 说：
```
在当前项目中下载云开发 AI 规则
```

或者指定特定 IDE：
```
在当前项目中下载云开发 AI 规则，只包含 Cursor 配置
在当前项目中下载云开发 AI 规则，只包含 WindSurf 配置
```

---

## 🙏 致谢

感谢所有贡献者为 CloudBase AI ToolKit 做出的贡献！

特别感谢社区用户提供的反馈和建议，让我们能够持续改进工具功能。

---

## 📞 获取帮助

- 📖 [完整文档](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/)
- 💬 [社区讨论](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/discussions)
- 🐛 [问题反馈](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给我们一个 Star！**

[![GitHub Stars](https://img.shields.io/github/stars/TencentCloudBase/CloudBase-AI-ToolKit?style=social)](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit)

</div>
