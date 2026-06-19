# 技术方案设计

## 概述

本方案优化 `config/.claude/skills/miniprogram-development` skill，使其从“CloudBase 偏置的小程序 skill”调整为“通用微信小程序开发 skill + CloudBase 子场景 + 调试/预览双路径”。主 `SKILL.md` 聚焦通用触发条件、边界、行为规则与路由；CloudBase 集成与调试/预览细节拆入独立 references。

## 目标

- 将触发范围调整为通用微信小程序开发
- 保留 CloudBase 作为重要但非默认的子场景
- 增加微信开发者工具调试/预览/发布路径
- 增加无微信开发者工具时的 `miniprogram-ci` 替代路径
- 提升主文档路由清晰度，减少一次性加载的上下文

## 非目标

- 不新增新的 MCP 工具
- 不覆盖所有微信官方能力文档
- 不实现真实的开发者工具自动化集成

## 现状问题

当前 skill 存在以下问题：

- frontmatter 和正文默认假设项目使用 CloudBase
- “禁止生成登录页”等规则被泛化到所有小程序项目
- 主 `SKILL.md` 承载了过多实现细节
- 只有一个 `references/cloudbase-integration.md`，缺少调试/预览专门路由

## 结构设计

目标目录结构如下：

```text
config/.claude/skills/miniprogram-development/
├── SKILL.md
└── references/
    ├── cloudbase-integration.md
    └── devtools-debug-preview.md
```

职责划分：

- `SKILL.md`
  - 通用微信小程序开发适用范围
  - CloudBase 何时适用
  - 调试/预览何时读取哪个 references
  - 最小行为规则
- `references/cloudbase-integration.md`
  - `wx.cloud.init`
  - 数据库/云函数/存储边界
  - `OPENID` 模型
  - CloudBase MCP / mcporter 说明
- `references/devtools-debug-preview.md`
  - 微信开发者工具内调试能力
  - 真机调试/预览建议
  - `miniprogram-ci` 的预览/上传/构建 npm 替代路径
  - 无开发者工具场景下的限制说明

## 主 Skill 设计

### Frontmatter

- 保留 `name: miniprogram-development`
- 调整 `description`，优先覆盖通用微信小程序开发、调试、预览、发布
- 将 CloudBase、`wx.cloud`、腾讯云开发、云开发 作为子场景关键词，而不是主前提

### 行为规则

主 `SKILL.md` 中的行为规则将分为三层：

1. 通用小程序规则
   - 目录结构
   - 页面配置文件
   - `project.config.json` / `appid`
   - 调试和预览准备项
2. CloudBase 子场景规则
   - 仅在用户明确使用 CloudBase 或 `wx.cloud` 时触发
3. 调试/预览规则
   - 使用开发者工具的路径
   - 无开发者工具时的 `miniprogram-ci` 路径

## 调试与预览设计

### 微信开发者工具路径

根据微信开发者工具文档，skill 需引导用户：

- 使用模拟器和自定义编译进行本地调试
- 使用 Console、Network、Storage 等调试面板排查问题
- 使用自动预览和真机调试/预览二维码做设备验证
- 在打开项目前检查 `project.config.json`、`appid`、资源路径
- 在版本差异敏感场景下参考稳定版更新日志

### 无开发者工具路径

根据 `miniprogram-ci` 文档，skill 需引导用户：

- 使用 `miniprogram-ci` 在不打开开发者工具时执行 preview / upload
- 使用 `pack-npm` 或相关能力处理 npm 构建
- 准备代码上传密钥、IP 白名单、`appid`、项目路径和私钥文件
- 理解该路径可覆盖预览、上传、构建等环节，但不能完全替代开发者工具内调试面板

## 测试策略

1. 触发验证
   - 通用小程序请求应触发该 skill
   - 非 CloudBase 小程序请求不应被 CloudBase 规则强制约束
   - 明确 CloudBase 请求应被路由到 `cloudbase-integration.md`

2. 结构验证
   - 新增 `references/devtools-debug-preview.md`
   - 主文档路由清晰且不只指向 CloudBase 参考

3. 内容验证
   - 微信开发者工具路径包含调试面板、预览、真机验证建议
   - 无开发者工具路径包含 `miniprogram-ci` 预览、上传和前置条件说明

## 风险与缓解

风险：

- 通用触发范围扩大后再次吞掉邻近 skill
- CloudBase 规则被弱化导致指导不完整
- 调试/预览内容写得过重，再次膨胀主文档

缓解：

- 在主文档中显式区分通用小程序与 CloudBase 子场景
- 保留 CloudBase 参考文档深度内容
- 将调试/预览拆到独立 references
