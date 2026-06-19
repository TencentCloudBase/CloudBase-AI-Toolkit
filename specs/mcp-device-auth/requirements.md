# 需求文档

## 介绍

当前 MCP 登录链路在无浏览器或输入受限场景下，需要支持设备码授权（Device Flow）。现有 `@cloudbase/toolbox` 已提供 `mode=device` 能力，但 MCP 侧仍需完成交互适配，确保授权信息可以被 MCP 客户端感知，而不是仅依赖 stdout。

本需求聚焦于在现有架构上做兼容增强，不重构整体认证体系。

## 需求

### 需求 1 - login 工具支持统一多动作

**用户故事：** 作为 MCP 客户端调用方，我希望 `login` 工具可以按场景拆分执行认证与环境选择，以便在不同交互能力下更灵活地控制流程。

#### 验收标准

1. When 调用 `login` 工具且 `action=ensure` 时，the 系统 shall 执行“确保可用”流程（需要时完成认证 + 环境选择）。
2. When 调用 `login` 工具且 `action=start_auth` 时，the 系统 shall 仅执行认证流程，不触发环境选择交互页面。
3. When 调用 `login` 工具且 `action=select_env` 时，the 系统 shall 仅执行环境选择或环境绑定流程。
4. When 调用 `login` 工具且 `action=status` 时，the 系统 shall 返回当前认证状态和环境状态，不触发副作用操作。
5. When 未传 `action` 参数时，the 系统 shall 使用 `ensure` 作为默认值。

### 需求 2 - Device Flow 信息必须可被 MCP 客户端感知

**用户故事：** 作为 MCP 客户端用户，我希望在设备码登录时能直接在 MCP 返回中看到授权信息，避免只能在终端 stdout 查看导致信息丢失。

#### 验收标准

1. When 认证模式为 `device` 且返回设备码信息时，the 系统 shall 在 `login(action=start_auth)` 的结构化结果中返回 `auth_challenge.user_code`、`auth_challenge.verification_uri`、`auth_challenge.expires_in`。
2. When Device Flow 已进入待授权状态时，the 系统 shall 记录可查询的认证进行中状态，使 `login(action=status)` 和其他受保护工具都可感知 `AUTH_PENDING`。
3. When Device Flow 回调未返回信息时，the 系统 shall 不中断登录流程，并保持原有成功/失败语义。

### 需求 3 - 认证模式可控且默认兼容设备码

**用户故事：** 作为维护者，我希望认证模式可显式指定，也可由系统默认策略接管，便于灰度与排障。

#### 验收标准

1. When 调用 `login` 或登录链路时传入 `authMode`，the 系统 shall 优先使用该模式（`web` 或 `device`）。
2. When 未传 `authMode` 且存在环境变量 `TCB_AUTH_MODE` 时，the 系统 shall 使用环境变量值。
3. When 未传 `authMode` 且无 `TCB_AUTH_MODE` 时，the 系统 shall 默认使用 `device` 模式。
4. When 使用 `device` 模式时，the 系统 shall 由 MCP 内部决定认证参数，不要求客户端显式传入 `clientId`。

### 需求 4 - 现有工具触发链路保持兼容

**用户故事：** 作为现有用户，我希望本次改造不会破坏既有 `envQuery`、`login`、自动环境设置等能力。

#### 验收标准

1. When 使用 `login action=ensure` 时，the 系统 shall 保持原有环境设置主流程可用。
2. When 认证成功后进入环境选择逻辑时，the 系统 shall 继续复用现有 `interactive` 与 `cloudbase-manager` 逻辑，不改变核心状态机。
3. When 其他受保护工具在未登录、授权进行中或未绑定环境时被直接调用，the 系统 shall 快速失败并返回结构化指引，而不是隐式拉起登录页或环境选择页。
4. When 认证或环境选择失败时，the 系统 shall 返回对用户和 Agent 都可执行的结构化下一步操作。

### 需求 5 - 错误码可执行指引（面向用户和 Agent）

**用户故事：** 作为用户或 Agent，我希望每个错误码都带有明确的下一步操作提示，这样我可以在一次失败后快速恢复流程。

#### 验收标准

1. When `login` 或其他受保护工具返回失败或待处理状态时，the 系统 shall 返回结构化字段：`code`、`message`、`next_step`。
2. When `code=AUTH_REQUIRED` 时，the 系统 shall 给出 `next_step.tool=login` 与 `next_step.action=start_auth` 的指引。
3. When `code=AUTH_PENDING` 且存在设备码信息时，the 系统 shall 返回 `auth_challenge`（`user_code`、`verification_uri`、`expires_in`）并提示调用 `login(action=status)` 或等待后重试。
4. When `code=ENV_REQUIRED` 时，the 系统 shall 返回 `env_candidates`，并给出 `next_step.tool=login`、`next_step.action=select_env` 以及 `required_params=["envId"]` 或可执行的 `suggested_args`。
5. When `code=NO_ENV` 时，the 系统 shall 返回“无可用环境”的可执行指引（如创建环境入口或手动配置入口）。
6. When `code=INVALID_ARGS` 时，the 系统 shall 返回参数修正建议，确保 Agent 可自动重试。
7. When 发布工具文档时，the 文档内容 shall 明确列出 `login` 的 action 语义、关键参数、结构化输出以及其他受保护工具的认证前置要求。
