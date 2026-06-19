# 需求文档

## 介绍

优化 MCP 的环境开通流程，解决用户开通环境困难的问题。如果用户没有可用的云开发环境，在符合免费开通的条件下，可以静默帮用户开通。

## 需求

### 需求 1 - TCB 服务自动初始化

**用户故事：** 作为用户，我希望系统能够自动检查并初始化 TCB 服务，这样我就不需要手动去控制台操作。

#### 验收标准

1. When 用户登录云开发时，the MCP 系统 shall 自动调用 CheckTcbService 接口检查 TCB 服务是否已初始化
2. When TCB 服务未初始化时，the MCP 系统 shall 自动调用 InitTcb 接口进行初始化
3. When InitTcb 调用成功时，the MCP 系统 shall 继续后续流程，不阻塞用户操作
4. When InitTcb 调用失败时，the MCP 系统 shall 记录错误信息并继续后续流程，不阻塞用户操作
5. When InitTcb 调用失败时，the MCP 系统 shall 在环境选择页面展示对应的错误提示和处理链接

### 需求 2 - 免费环境自动创建

**用户故事：** 作为新用户，我希望系统能够自动为我创建免费环境，这样我就可以直接开始使用云开发服务。

#### 验收标准

1. When 查询环境列表为空时，the MCP 系统 shall 自动调用 DescribeUserPromotionalActivity 接口查询用户是否有免费环境资格
2. When 用户符合免费环境条件时，the MCP 系统 shall 自动调用 CreateFreeEnvByActivity 接口创建免费环境
3. When 免费环境创建成功时，the MCP 系统 shall 自动选择新创建的环境并返回
4. When 免费环境创建失败时，the MCP 系统 shall 记录错误信息并继续后续流程，不阻塞用户操作
5. When 免费环境创建失败时，the MCP 系统 shall 在环境选择页面展示对应的错误提示和处理链接

### 需求 3 - 统计上报

**用户故事：** 作为产品团队，我希望能够统计环境开通流程的各项指标，以便优化用户体验。

#### 验收标准

1. When 调用 CheckTcbService 时，the MCP 系统 shall 上报成功/失败状态和用户 uin
2. When 调用 InitTcb 时，the MCP 系统 shall 上报成功/失败状态和用户 uin
3. When 调用 DescribeUserPromotionalActivity 时，the MCP 系统 shall 上报活动列表和用户 uin
4. When 调用 CreateFreeEnvByActivity 时，the MCP 系统 shall 上报成功/失败状态、用户 uin 和环境 ID
5. When 查询环境列表时，the MCP 系统 shall 上报查询次数、环境数量和用户 uin
6. When 没有可用环境时，the MCP 系统 shall 上报用户 uin
7. When 显示环境选择页面时，the MCP 系统 shall 上报用户 uin 和环境 ID 列表
8. When 用户切换账号时，the MCP 系统 shall 上报用户 uin

### 需求 4 - 错误降级处理

**用户故事：** 作为用户，我希望即使自动开通失败，我也能继续使用系统，不会完全被阻塞。

#### 验收标准

1. When 自动开通流程中的任何步骤失败时，the MCP 系统 shall 不阻塞用户操作，允许用户继续使用
2. When 自动开通失败时，the MCP 系统 shall 记录详细的错误信息，包括错误码、错误消息和帮助链接
3. When 自动开通失败时，the MCP 系统 shall 在环境选择页面展示错误信息和处理建议
4. When 统计上报失败时，the MCP 系统 shall 静默处理，不影响主流程

### 需求 5 - 环境选择页面错误展示和重试机制

**用户故事：** 作为用户，当自动开通失败时，我希望能够在环境选择页面看到清晰的错误提示和解决方案，并能够重试。

#### 验收标准

1. When InitTcb 调用失败时，the MCP 系统 shall 在环境选择页面展示错误提示
2. When InitTcb 失败与实名认证相关时，the MCP 系统 shall 提供实名认证链接和重试按钮
3. When InitTcb 失败与 CAM 授权相关时，the MCP 系统 shall 提供 CAM 授权链接和重试按钮
4. When CreateFreeEnvByActivity 调用失败时，the MCP 系统 shall 在环境选择页面展示错误提示
5. When 环境创建失败时，the MCP 系统 shall 提供手动创建链接和重试按钮
6. When 用户点击重试按钮时，the MCP 系统 shall 重新执行对应的操作（InitTcb 或 CreateFreeEnvByActivity）

### 需求 6 - CloudMode 兼容

**用户故事：** 作为云模式用户，我希望在 CloudMode 下也能自动开通环境，即使没有 UI 交互。

#### 验收标准

1. When 在 CloudMode 下运行时，the MCP 系统 shall 执行完整的自动开通流程（不跳过）
2. When 在 CloudMode 下自动创建环境成功时，the MCP 系统 shall 自动选择新环境并返回
3. When 在 CloudMode 下自动创建环境失败时，the MCP 系统 shall 返回详细的错误信息（包含 TCB 初始化错误、环境创建错误、帮助链接）
4. When 在 CloudMode 下查询到环境列表时，the MCP 系统 shall 自动选择第一个环境
5. When 在 CloudMode 下返回错误时，the MCP 系统 shall 返回结构化的错误消息，不展示 UI








