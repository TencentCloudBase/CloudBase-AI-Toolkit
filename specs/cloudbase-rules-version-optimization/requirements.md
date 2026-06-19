# 需求文档

## 介绍

优化 config 中的 @cloudbase-rules.mdc 的约束，通过增强提示词指导 AI Agent 实现版本检测和升级提示功能。解决用户不知道有新版本、不知道要升级、不知道要下载最新规则的问题。

## 需求

### 需求 1 - 版本检测提示词优化

**用户故事：** 作为开发者，我希望 AI Agent 能够自动检测当前使用的 CloudBase AI 规则版本与最新版本的差异，这样我就能知道是否需要升级。

#### 验收标准

1. When AI Agent 启动或用户使用 CloudBase 相关功能时，the AI Agent shall 自动检查当前项目的 cloudbaseAIVersion 字段
2. When 检测到版本信息时，the AI Agent shall 通过 npm registry 查询 @cloudbase/cloudbase-mcp 的最新版本
3. When 发现版本差异时，the AI Agent shall 主动向用户提示版本升级建议
4. When 用户首次使用时，the AI Agent shall 显示友好的版本介绍信息

### 需求 2 - 升级指导提示词优化

**用户故事：** 作为开发者，当 AI Agent 检测到有新版本可用时，我希望获得清晰的升级指导，包括 MCP 升级和 AI 规则下载的具体步骤。

#### 验收标准

1. When 检测到版本低于最新版本时，the AI Agent shall 提供详细的升级指导
2. When 提供升级指导时，the AI Agent shall 包含 MCP 升级的官方文档链接
3. When 提供升级指导时，the AI Agent shall 指导用户执行 downloadTemplate 操作下载最新 AI 规则
4. When 用户选择升级时，the AI Agent shall 提供分步骤的操作指导

### 需求 3 - 首次使用体验优化

**用户故事：** 作为新用户，当我第一次使用 CloudBase AI 规则时，我希望看到友好的介绍信息，了解当前版本和功能特性。

#### 验收标准

1. When 用户第一次使用 CloudBase AI 规则时，the AI Agent shall 显示欢迎信息和当前版本
2. When 显示欢迎信息时，the AI Agent shall 使用适当的 emoji 增强用户体验
3. When 显示欢迎信息时，the AI Agent shall 提供快速开始指南和功能概览
4. When 显示欢迎信息时，the AI Agent shall 主动询问用户是否需要了解升级流程

### 需求 4 - 提示词约束优化

**用户故事：** 作为开发者，我希望 AI Agent 在处理版本相关操作时遵循统一的约束和最佳实践。

#### 验收标准

1. When AI Agent 进行版本检测时，the AI Agent shall 遵循项目规范中的英文注释和提交要求
2. When AI Agent 提供升级指导时，the AI Agent shall 使用清晰的结构化格式
3. When AI Agent 处理用户交互时，the AI Agent shall 使用 interactiveDialog 工具进行确认
4. When AI Agent 执行文件操作时，the AI Agent shall 确保操作安全和可回滚 