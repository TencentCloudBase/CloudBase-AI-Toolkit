# 需求文档

## 介绍

当前 `auth-tool` skill 仍然使用过时的 `lowcode/DescribeLoginStrategy` 与 `lowcode/ModifyLoginStrategy` 指导 AI 配置匿名登录、用户名密码登录和短信登录。与此同时，`#359` 又将这部分能力整体降级为“优先控制台 fallback”，导致 AI 既可能调用错误 API，也可能错过可直接调用的正式 CloudBase 登录配置接口。

本需求的目标是将 `auth-tool` 源 skill 中与登录配置相关的 API 指引统一切换为正式的登录配置接口，并保留原有高价值的参数示例风格，避免 skill 从“可执行指导”退化为“只会让用户去控制台手动操作”。

## 需求

### 需求 1 - 登录配置接口对齐

**用户故事：** 作为使用 CloudBase Auth Tool 的开发者，我希望 AI 在处理匿名登录、用户名密码登录、短信登录等基础登录策略时，使用正式 CloudBase 登录配置接口，而不是旧 lowcode 接口或控制台兜底描述。

#### 验收标准

1. When AI 开发工具需要查询当前登录配置时，the auth-tool skill shall 指导其调用 `tcb/DescribeLoginConfig`，并明确使用 `EnvId` 作为查询参数。
2. When AI 开发工具需要修改匿名登录、用户名密码登录、短信登录或邮箱登录等登录策略时，the auth-tool skill shall 指导其调用 `tcb/ModifyLoginConfig`，并基于当前配置进行修改而不是继续使用 `lowcode/ModifyLoginStrategy`。
3. When auth-tool skill 描述登录配置能力边界时，the skill shall 明确禁止将 `lowcode/DescribeLoginStrategy` 与 `lowcode/ModifyLoginStrategy` 作为默认方案。
4. When AI 开发工具处理基础登录方式开关时，the auth-tool skill shall 优先提供正式 Cloud API 的调用路径，而不是默认要求用户转到控制台手动修改。

### 需求 2 - Provider 能力边界保持清晰

**用户故事：** 作为使用 CloudBase Auth Tool 的开发者，我希望 AI 能区分“基础登录配置”和“第三方认证源配置”，避免把 provider 接口错误地当成所有登录方式的统一入口。

#### 验收标准

1. When AI 开发工具处理邮箱、微信开放平台、Google 或其他第三方认证源时，the auth-tool skill shall 继续使用 `tcb/GetProviders`、`tcb/ModifyProvider`、`tcb/AddProvider`、`tcb/DeleteProvider` 等 provider 接口进行指导。
2. When auth-tool skill 描述邮箱登录时，the skill shall 区分邮箱 provider 配置与基础登录策略配置，避免将 provider 接口错误表述为匿名登录、用户名密码登录或短信登录的替代方案。
3. When auth-tool skill 描述客户端相关能力时，the skill shall 将 `tcb/DescribeClient` 与 `tcb/ModifyClient` 归类为应用客户端配置能力，而不是与登录策略或 provider 配置混淆。

### 需求 3 - 参数示例可直接复用

**用户故事：** 作为使用 CloudBase Auth Tool 的开发者，我希望 skill 中仍然保留清晰的参数示例，这样 AI 可以直接生成可执行的 `callCloudApi` 请求，而不是只给概念性说明。

#### 验收标准

1. When auth-tool skill 更新登录配置 API 指引时，the skill shall 为 `DescribeLoginConfig` 和 `ModifyLoginConfig` 提供结构化参数示例。
2. When auth-tool skill 更新 provider 配置说明时，the skill shall 保留现有高价值参数示例，包括邮箱、微信开放平台和 Google 的示例结构。
3. When 维护者阅读源 skill 时，the examples shall 保持可直接复用的结构化请求格式，而不是退化为纯文字说明。

### 需求 4 - 变更范围收敛到源 Skill

**用户故事：** 作为维护者，我希望本次修正仅聚焦 `config/source/skills/auth-tool/SKILL.md`，先把源 skill 的 API 指引改正确，再决定是否需要重新生成对外 prompt 文档。

#### 验收标准

1. When 本次需求被实现时，the implementation shall 只修改 `config/source/skills/auth-tool/SKILL.md`，不以 `doc/prompts/auth-tool.mdx` 为本次交付范围。
2. When 登录配置 API 指引完成切换后，the source skill shall 不再出现 `lowcode/DescribeLoginStrategy` 或 `lowcode/ModifyLoginStrategy` 作为登录策略默认方案。
3. When 本次需求完成时，the implementation shall 明确说明对外 prompt 文档尚未同步更新，除非后续单独要求生成产物。
