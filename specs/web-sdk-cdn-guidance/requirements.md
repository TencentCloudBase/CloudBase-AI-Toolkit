# 需求文档

## 介绍

当前 `#361` 仅修复了 CloudRun `createAgent` 生成 README 时使用旧版 CloudBase Web SDK CDN 地址的问题，但这只覆盖了单一模板产物。更核心的问题是：当 AI 在 CloudBase Web + BaaS 场景下工作时，应该在进入实现阶段的第一时间就知道正确的 CloudBase Web SDK CDN 地址，并优先使用最新的官方地址，而不是依赖旧模板、猜测地址或继续传播历史版本链接。

本需求的目标是将“CloudBase Web SDK CDN 地址”提升为 CloudBase Web 开发规则中的前置知识，使 AI 在涉及 Web SDK、Web 登录、静态站点或前后端一体 BaaS 集成时，能够尽早使用正确的 CDN 地址。

## 需求

### 需求 1 - Web + BaaS 场景优先暴露正确 CDN 地址

**用户故事：** 作为使用 CloudBase 开发 Web 应用的开发者，我希望 AI 在涉及 CloudBase Web SDK 集成时，第一时间给出正确的官方 CDN 地址，而不是旧地址或模糊说法。

#### 验收标准

1. When AI 开发工具识别到用户正在开发 CloudBase Web 应用并需要接入 CloudBase BaaS 能力时，the CloudBase 规则体系 shall 在靠前位置提供当前官方 CloudBase Web SDK CDN 地址。
2. When AI 开发工具为 Web 项目提供 CloudBase SDK 接入示例时，the 示例 shall 使用当前官方 CDN 地址 `https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js`。
3. When AI 开发工具需要在 npm 包安装与 CDN 引入之间做选择时，the 规则 shall 说明 CDN 适用于无需构建或快速接入场景，而 npm 依赖适用于现代工程化项目。

### 需求 2 - 入口规则与专题规则保持一致

**用户故事：** 作为维护者，我希望 CloudBase 总入口规则与 Web/Auth 专题规则对 SDK CDN 的描述一致，避免 AI 读到不同来源时产生冲突。

#### 验收标准

1. When CloudBase 总入口规则涉及 Web 开发或 Web SDK 集成时，the guideline shall 明确指出需要读取 Web 相关 skill，并可快速获取正确 CDN 地址。
2. When `web-development` skill 描述 CloudBase Web SDK 集成时，the skill shall 明确给出正确 CDN 地址，并说明适用场景。
3. When `auth-web` skill 描述 Web 认证初始化时，the skill shall 保持与 `web-development` skill 一致的 CDN 地址，不得出现旧版本地址。

### 需求 3 - 生成类模板和示例不再传播旧地址

**用户故事：** 作为使用工具生成项目模板的开发者，我希望任何自动生成的 CloudBase Web SDK 示例都不会继续输出历史 CDN 地址。

#### 验收标准

1. When 工具生成 CloudBase Web SDK 接入示例或 README 模板时，the generated content shall 使用当前官方 CDN 地址。
2. When 仓库内存在与 CloudBase Web SDK CDN 地址相关的固定字符串模板时，the implementation shall 检查并修正仍在使用旧地址的模板。
3. When 维护者完成本次修正时，the implementation shall 至少覆盖当前已知的 CloudRun `createAgent` 模板场景，避免 Issue #343 再次出现。

### 需求 4 - 变更范围与验收方式清晰

**用户故事：** 作为维护者，我希望这次修正明确区分“规则层修正”和“模板层修正”，便于后续审查和回归。

#### 验收标准

1. When 本次需求进入实现阶段时，the implementation shall 明确列出需要修改的源规则文件与模板文件。
2. When 维护者验证本次需求时，the verification shall 检查规则文件中的 CDN 地址与模板中的 CDN 地址保持一致。
3. When 本次需求完成时，the implementation shall 说明是否同步更新公开 prompt 产物；若未同步，shall 明确指出未同步范围。
