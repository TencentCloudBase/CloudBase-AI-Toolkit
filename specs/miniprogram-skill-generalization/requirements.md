# 需求文档

## 介绍

优化 `config/.claude/skills/miniprogram-development` skill，使其面向所有微信小程序开发场景，而不仅限于 CloudBase 小程序。同时保留并强化 CloudBase 相关指导作为子场景能力，并补充基于微信开发者工具与非微信开发者工具环境的调试、预览和发布路径。

## 需求

### 需求 1 - 通用微信小程序适用范围

**用户故事：** 作为使用小程序开发 skill 的用户，我希望这个 skill 适用于通用微信小程序开发，而不是默认假设所有项目都使用 CloudBase，这样 agent 不会在非 CloudBase 项目中给出错误约束。

#### 验收标准

1. When 用户提出微信小程序开发、调试、预览、发布或优化需求时，CloudBase AI Toolkit shall 使 `miniprogram-development` skill 适用于通用微信小程序项目。
2. When skill 涉及身份、数据、存储、云函数或 AI 场景时，CloudBase AI Toolkit shall 区分通用微信小程序能力与 CloudBase 集成能力，而不是默认所有项目都启用 CloudBase。
3. While skill 描述触发场景时, when 用户请求不包含 CloudBase 相关信息时，CloudBase AI Toolkit shall 避免使用只适用于 CloudBase 的强约束规则。

### 需求 2 - CloudBase 作为微信小程序子场景能力

**用户故事：** 作为需要 CloudBase 集成的小程序开发者，我希望该 skill 在通用小程序指导之外，仍然保留完整的 CloudBase 集成建议，这样我在 CloudBase 场景下仍然能获得正确指导。

#### 验收标准

1. When 用户明确提到 CloudBase、云开发、腾讯云开发或 `wx.cloud` 时，CloudBase AI Toolkit shall 将 CloudBase 集成作为该 skill 的重要子场景进行指导。
2. When skill 涉及 CloudBase 集成时，CloudBase AI Toolkit shall 提供 `wx.cloud.init`、数据库/云函数/存储边界、`OPENID` 身份处理和控制台链接等指导。
3. When 用户的小程序项目不使用 CloudBase 时，CloudBase AI Toolkit shall 不强制要求 CloudBase 登录模型、CloudBase 目录结构或 CloudBase API。

### 需求 3 - 微信开发者工具调试与预览路径

**用户故事：** 作为使用微信开发者工具开发小程序的用户，我希望 skill 能指导我如何在开发者工具中进行调试、预览和发布，这样 agent 能给出更完整的开发工作流。

#### 验收标准

1. When 用户使用微信开发者工具时，CloudBase AI Toolkit shall 指导用户使用开发者工具进行模拟器调试、自定义编译、自动预览、控制台/网络/存储等调试面板定位问题。
2. When 用户需要真机验证时，CloudBase AI Toolkit shall 提示用户使用真机调试或预览二维码进行真实设备验证。
3. When 用户准备发布或预览时，CloudBase AI Toolkit shall 指导用户确认 `project.config.json`、`appid`、资源文件和必要配置后再打开或预览项目。
4. When 用户关心开发者工具版本变化时，CloudBase AI Toolkit shall 提示用户关注稳定版更新日志页面，以避免能力差异带来的误判。

### 需求 4 - 无微信开发者工具时的替代路径

**用户故事：** 作为暂时无法使用微信开发者工具的用户，我希望 skill 能告诉我有哪些替代方案来进行构建、预览和上传，这样我依然能推进小程序开发和交付。

#### 验收标准

1. When 用户无法使用微信开发者工具时，CloudBase AI Toolkit shall 提供基于 `miniprogram-ci` 的替代路径用于预览、上传和构建 npm。
2. When skill 介绍 `miniprogram-ci` 时，CloudBase AI Toolkit shall 说明其可在不打开微信开发者工具的情况下执行预览和上传操作。
3. When 用户使用 `miniprogram-ci` 时，CloudBase AI Toolkit shall 提示其准备代码上传密钥、IP 白名单、`appid`、项目路径等前置条件。
4. When 用户没有微信开发者工具且需要调试时，CloudBase AI Toolkit shall 明确说明可使用代码级排查、日志输出、`miniprogram-ci` 预览/上传和真实设备验证作为替代路径，但其体验不等同于开发者工具内置调试面板。

### 需求 5 - 结构与路由优化

**用户故事：** 作为 skill 维护者，我希望这个 skill 的主文档更聚焦、引用更清晰，这样 agent 能按需读取通用小程序、CloudBase 集成和调试/预览说明，而不是一次读入所有细节。

#### 验收标准

1. When `miniprogram-development` skill 组织内容时，CloudBase AI Toolkit shall 将通用小程序规则、CloudBase 集成规则和调试/预览规则分层组织。
2. When 主 `SKILL.md` 介绍路由时，CloudBase AI Toolkit shall 明确说明何时阅读 CloudBase 集成参考文档，何时阅读调试/预览参考文档。
3. While agent 处理小程序请求时, when 当前任务只涉及通用小程序页面或组件开发时，CloudBase AI Toolkit shall 避免让 agent 无条件加载 CloudBase 专项参考文档。
