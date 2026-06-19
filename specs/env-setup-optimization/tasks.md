# 实施计划

## Phase 1: 核心自动开通流程（高优先级）✅ 已完成

### 任务 1 - 创建环境开通核心模块 ✅

- [x] 创建 `mcp/src/tools/env-setup.ts` 文件
- [x] 实现 `EnvSetupContext` 类型定义
- [x] 实现 `checkAndInitTcbService()` 函数
  - 调用 CheckTcbService 接口
  - 根据结果决定是否调用 InitTcb
  - InitTcb 参数：Source="qcloud", Channel="mcp", PolicyNames 不传入
  - 错误处理和上下文保存
- [x] 实现 `checkAndCreateFreeEnv()` 函数
  - 调用 DescribeUserPromotionalActivity 接口（Names=["NewUser", "ReturningUser", "BaasFree"]）
  - 根据资格调用 CreateFreeEnvByActivity 接口
  - CreateFreeEnvByActivity 参数：Alias="ai-native", Type=activityType（使用活动返回的第一个 Type）, CloseAutoPay=true, EnableExcess="true", IsAutoRenew="false", Source="qcloud"
  - 错误处理和上下文保存
- [x] 实现 `parseInitTcbError()` 函数
  - 解析错误类型（实名认证、CAM授权等）
  - 统一使用帮助链接：https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp
  - 生成用户友好的错误信息
- [x] 实现 `getUinForTelemetry()` 辅助函数
- [x] 实现 `reportEnvSetupFlow()` 统计上报函数
- _需求: 需求 1, 需求 2, 需求 4_

### 任务 2 - 集成自动开通流程到环境选择逻辑 ✅

- [x] 修改 `mcp/src/tools/interactive.ts:_promptAndSetEnvironmentId()` 函数
  - 在查询环境列表前，调用 `checkAndInitTcbService()`
  - 检查初始化结果，保存错误上下文
  - 在环境列表为空时，调用 `checkAndCreateFreeEnv()`
  - 如果创建成功，自动选择新环境并返回
  - 传递错误上下文到 UI 层（待 Phase 3 UI 实现）
- [x] 添加 `getUinForTelemetry()` 提取 uin 的逻辑
- [x] 添加基础统计上报（query_env_list, no_envs, display_env_selection, switch_account）
- [ ] 测试自动开通流程的各种场景（待后续测试）
  - TCB 服务已初始化
  - TCB 服务未初始化（成功/失败）
  - 有免费资格（成功/失败）
  - 无免费资格
- _需求: 需求 1, 需求 2_

### 任务 3 - CloudMode 支持 ✅

- [x] 修改 `mcp/src/tools/interactive.ts:_promptAndSetEnvironmentId()` 
  - CloudMode 检测逻辑
  - CloudMode 下执行完整自动开通流程（不跳过）
  - 创建成功：自动选择新环境
  - 创建失败：返回详细错误信息（包含 TCB 初始化错误、环境创建错误、帮助链接）
  - 有多个环境：自动选择第一个
- [ ] 测试 CloudMode 下的各种场景（待后续测试）
  - 无环境 + 自动创建成功
  - 无环境 + 自动创建失败
  - 有环境自动选择
- _需求: 需求 6（CloudMode 兼容）_

## Phase 2: 统计上报（高优先级）✅ 已完成

### 任务 4 - 实现环境开通统计上报 ✅

- [x] 在 `mcp/src/tools/env-setup.ts` 中实现统计上报（无需单独文件）
- [x] 实现 `reportEnvSetupFlow()` 函数
  - 使用事件代码：`toolkit_env_setup`（与其他 toolkit 错误一致）
  - 上报数据：step, success, uin, error, activities, envId, envCount, alias
  - 限制数据长度（错误信息限制200字符），避免敏感信息泄露
- [x] 在核心流程中添加上报调用
  - check_tcb_service（成功/失败）✅ env-setup.ts
  - init_tcb（成功/失败）✅ env-setup.ts
  - query_env_list（成功/失败）✅ interactive.ts
  - no_envs ✅ interactive.ts
  - check_promotional_activity（成功/失败）✅ env-setup.ts
  - create_free_env（成功/失败）✅ env-setup.ts
  - display_env_selection ✅ interactive.ts
  - switch_account ✅ interactive.ts
- [x] 上报失败时静默处理（已在 reportEnvSetupFlow 中实现）
- [ ] 测试上报功能（待实际运行测试）
  - 验证上报数据格式
  - 验证上报不影响主流程
- _需求: 需求 3_

### 任务 5 - 错误处理和日志 ✅

- [x] 完善错误解析逻辑
  - 识别常见错误类型（实名认证、CAM授权）- parseInitTcbError()
  - 生成用户友好的错误消息
  - 添加调试日志
- [x] CloudMode 错误消息优化
  - 格式化多行错误信息（在 _promptAndSetEnvironmentId 中实现）
  - 包含所有相关错误（TCB 初始化、环境创建）
  - 提供帮助链接
- [x] 添加详细的调试日志
  - 记录每个步骤的输入输出（env-setup.ts 和 interactive.ts）
  - 记录错误详情（使用 logError()）
  - 便于问题排查
- _需求: 需求 6_

## Phase 3: UI 展示（待后续实现，优先级低）

⏸ 本阶段暂不实施，待后续根据需要调整

### 任务 6 - 环境选择页面错误提示（待实施）

- [ ] 修改 `mcp/src/interactive-server.ts:collectEnvId()` 函数签名
  - 添加 `errorContext` 参数
- [ ] 修改 `mcp/src/interactive-server.ts:getEnvSetupHTML()` 函数
  - 添加错误提示区域 HTML
  - 根据错误类型显示不同提示
  - 添加帮助链接
  - 添加重试按钮
  - 添加错误提示样式
- [ ] 实现重试 JavaScript 函数
  - `retryInitTcb()` - 重试 TCB 初始化
  - `retryCreateEnv()` - 重试创建环境
- _需求: 需求 5_

### 任务 7 - 重试 API 端点（待实施）

- [ ] 添加 `/api/retry-init-tcb` 端点
  - 重新执行 CheckTcbService + InitTcb
  - 返回结果（成功/失败）
- [ ] 添加 `/api/retry-create-env` 端点
  - 重新执行 DescribeUserPromotionalActivity + CreateFreeEnvByActivity
  - 返回结果和新环境 ID（如果成功）
- [ ] 测试重试功能
  - 验证重试流程
  - 验证页面更新
  - 验证错误处理
- _需求: 需求 5_

## Phase 4: 测试和优化（中优先级）

### 任务 8 - 集成测试

- [ ] 端到端测试场景
  - 新用户首次登录（无环境，符合免费条件）
  - 回流用户登录（无环境，符合免费条件）
  - 普通用户登录（无环境，不符合免费条件）
  - TCB 未初始化场景
  - TCB 初始化失败场景
  - 环境创建失败场景
  - CloudMode 各种场景
- [ ] 性能测试
  - 验证自动开通流程不影响正常登录性能
  - 验证统计上报不阻塞主流程
- [ ] 兼容性测试
  - 测试不同 IDE 环境
  - 测试 CloudMode 和正常模式切换
- _需求: 全部需求_

### 任务 9 - 文档和代码优化

- [ ] 添加代码注释
  - 核心函数的详细注释
  - 复杂逻辑的解释
  - TODO 标记（错误码待确认等）
- [ ] 更新相关文档
  - 更新 MCP 工具文档
  - 更新开发者指南
  - 添加故障排查指南
- [ ] 代码审查和优化
  - 代码风格统一
  - 错误处理完善
  - 性能优化
- _需求: 全部需求_

## Phase 5: 错误码收集和完善（低优先级）

### 任务 10 - 错误码分析和映射（待实际运行后）

- [ ] 收集实际运行中的错误码
  - InitTcb 各种错误码
  - CreateFreeEnvByActivity 各种错误码
- [ ] 完善错误码映射
  - 识别实名认证相关错误码
  - 识别 CAM 授权相关错误码
  - 识别配额不足、活动过期等错误码
- [ ] 优化错误消息
  - 根据错误码生成更精准的提示
  - 提供更具体的解决方案
- _需求: 需求 5, 需求 6_

## 任务依赖关系

```
任务 1 (env-setup.ts)
    ↓
任务 2 (集成到 interactive.ts) + 任务 3 (CloudMode)
    ↓
任务 4 (统计上报) + 任务 5 (错误处理)
    ↓
任务 8 (集成测试)
    ↓
任务 9 (文档优化)

⏸ 任务 6 + 任务 7 (UI 展示) - 待后续实施
⏸ 任务 10 (错误码收集) - 待实际运行后
```

## 预估工作量

- **Phase 1** (任务 1-3): ~4-6 小时
- **Phase 2** (任务 4-5): ~2-3 小时
- **Phase 3** (任务 6-7): ~3-4 小时（待后续实施）
- **Phase 4** (任务 8-9): ~2-3 小时
- **Phase 5** (任务 10): ~1-2 小时（待实际运行后）

**总计**: ~9-12 小时（不包含 Phase 3 和 Phase 5）

## 风险和注意事项

1. **错误码未知风险**
   - 当前不知道具体的错误码
   - 需要在实际运行中收集和分析
   - 可能需要多次迭代完善错误处理

2. **API 调用失败风险**
   - TCB 接口可能因为各种原因失败
   - 需要完善的降级策略
   - 确保不阻塞用户操作

3. **统计上报数据隐私**
   - 注意不要上报敏感信息
   - 限制上报数据长度
   - 遵守隐私政策

4. **CloudMode 兼容性**
   - 确保 CloudMode 下的行为正确
   - 测试各种边界情况
   - 错误消息要清晰明确

5. **UI 展示延后风险**
   - 暂时不展示错误 UI
   - 用户可能不知道错误原因
   - 需要确保日志足够详细，便于排查问题








