# 实施计划

## 任务列表

- [x] 1. 修改遥测上报函数接口
  - 在 `mcp/src/utils/telemetry.ts` 中修改 `reportToolCall` 函数参数
  - 添加 `cloudBaseOptions` 可选参数
  - 更新环境ID获取逻辑，优先使用传入的配置
  - 保持向后兼容性
  - _需求: 需求 1, 需求 2

- [x] 2. 修改工具包装器
  - 在 `mcp/src/utils/tool-wrapper.ts` 中修改 `createWrappedHandler` 函数
  - 添加 `cloudBaseOptions` 参数
  - 在调用 `reportToolCall` 时传递配置参数
  - 更新 `wrapServerWithTelemetry` 函数传递服务器配置
  - _需求: 需求 1

- [x] 3. 添加类型定义和导入
  - 在 `tool-wrapper.ts` 中导入 `CloudBaseOptions` 类型
  - 在 `telemetry.ts` 中导入 `CloudBaseOptions` 类型
  - 确保类型定义正确
  - _需求: 需求 2

- [x] 4. 添加单元测试
  - 创建测试文件 `tests/telemetry-envid.test.js`
  - 测试参数传递功能
  - 测试环境ID获取优先级逻辑
  - 测试回退机制
  - _需求: 需求 1, 需求 2

- [x] 5. 验证功能完整性
  - 测试服务器创建时的配置传递
  - 测试工具调用时的遥测数据上报
  - 测试生命周期事件的遥测数据上报
  - 验证向后兼容性
  - _需求: 需求 1, 需求 2

## 实施顺序

1. 先完成任务 1-4（核心功能实现）
2. 然后完成任务 5（测试）
3. 最后完成任务 6（验证）

## 风险评估

- **低风险**：修改范围较小，主要是添加全局配置存储和更新获取逻辑
- **向后兼容**：保持所有现有接口不变
- **测试覆盖**：通过单元测试确保功能正确性 