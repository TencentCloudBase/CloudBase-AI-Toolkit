# 需求文档

## 介绍

修复 MCP 服务器中 envId 管理系统的多个严重 bug，包括超时时间配置错误、环境变量名称不一致、缓存同步问题、以及多进程场景下的数据串用问题。

## 问题分析

### 问题 1：超时时间配置错误（Critical）
- 当前值：`ENV_ID_TIMEOUT = 60000000`（实际是 16.67 小时）
- 注释说明：60000 秒（60 秒）
- 问题：注释和实际值不匹配，且超时时间过长，导致 envId 获取操作长时间阻塞

### 问题 2：环境变量名称不一致（Critical）
- `cloudrun.ts` 中 4 处使用 `process.env.TCB_ENV_ID`
- 其他所有地方使用 `process.env.CLOUDBASE_ENV_ID`
- 问题：导致 cloudrun 工具无法正确获取环境ID

### 问题 3：envId 缓存同步问题（Critical - 已复现）
- 用户切换账号/环境后，文件更新但内存缓存未更新
- 问题：导致工具操作错误的环境，报错 "Environment not found"
- 复现场景：
  1. 使用账号A，选择环境A'
  2. 在 CodeBuddy 中切换账号B，选择环境B'
  3. 调用 `createCollection` 时仍使用环境A'，导致错误

### 问题 4：文件缓存导致多进程冲突（High）
- `~/.cloudbase-env-id` 是全局文件，所有进程共享
- 问题：多进程同时写入可能冲突，且不同进程的缓存状态不一致

### 问题 5：getCloudBaseManager 优化不足（Medium）
- 即使 `loginState.envId` 存在，也会调用 `envManager.getEnvId()`
- 问题：可能触发不必要的自动设置流程，影响性能

## 需求

### 需求 1 - 修复超时时间配置

**用户故事：** 作为开发者，我希望 envId 获取的超时时间设置正确，避免长时间阻塞。

#### 验收标准

1. When envId 获取操作启动时，the 系统 shall 在 10 分钟内超时（600000ms）
2. When 超时时间到达时，the 系统 shall 抛出明确的超时错误信息
3. When 查看代码时，the 注释和实际值 shall 保持一致

### 需求 2 - 统一环境变量使用

**用户故事：** 作为开发者，我希望所有工具使用统一的环境ID获取方式，确保一致性。

#### 验收标准

1. When cloudrun 工具需要环境ID时，the 系统 shall 使用 `getEnvId(cloudBaseOptions)` 函数
2. When 所有工具获取环境ID时，the 系统 shall 使用相同的优先级逻辑
3. When 代码审查时，the 代码中 shall 不再包含 `process.env.TCB_ENV_ID`

### 需求 3 - 修复 envId 缓存同步问题

**用户故事：** 作为用户，我希望切换账号/环境后，所有工具都能使用新的环境ID，不会操作错误的环境。

#### 验收标准

1. When 用户通过 login 工具切换环境ID时，the 系统 shall 同步更新内存缓存和 process.env
2. When 用户切换环境后调用工具时，the 工具 shall 使用新的环境ID
3. When 用户切换账号后调用工具时，the 工具 shall 不会报 "Environment not found" 错误
4. When 环境ID更新后，the 文件、缓存、process.env 三者 shall 保持一致

### 需求 4 - 移除文件缓存机制

**用户故事：** 作为开发者，我希望移除文件缓存，避免多进程冲突和代码复杂性。

#### 验收标准

1. When 系统需要 envId 时，the 系统 shall 不再从 `~/.cloudbase-env-id` 文件读取
2. When 用户切换环境时，the 系统 shall 不再写入 `~/.cloudbase-env-id` 文件
3. When 代码审查时，the 代码中 shall 不再包含文件缓存相关的函数
4. When 进程重启时，the 系统 shall 通过自动设置流程获取环境ID

### 需求 5 - 优化 getCloudBaseManager 性能

**用户故事：** 作为开发者，我希望 getCloudBaseManager 能够智能地使用缓存，避免不必要的异步调用。

#### 验收标准

1. When envManager 已有缓存时，the 系统 shall 直接使用缓存，不调用 getEnvId()
2. When 缓存为空但 loginState 有 envId 时，the 系统 shall 使用 loginState.envId，不触发自动设置
3. When 既无缓存也无 loginState.envId 时，the 系统 shall 调用 envManager.getEnvId() 触发自动设置
4. When 获取 envId 时，the 系统 shall 优先使用最快的可用路径

### 需求 6 - 添加自动化测试

**用户故事：** 作为开发者，我希望有完整的测试覆盖，确保修复的 bug 不会再次出现。

#### 验收标准

1. When 运行测试时，the 测试套件 shall 覆盖所有修复的功能点
2. When 测试通过时，the 所有测试用例 shall 显示通过状态
3. When 代码变更时，the 测试 shall 能够验证修复的有效性

## 技术约束

- 保持向后兼容性，不影响现有功能
- 测试必须通过，不能引入新的 bug
- 代码必须通过 lint 检查
- 遵循项目的代码规范（英文注释、conventional-changelog 提交格式）

