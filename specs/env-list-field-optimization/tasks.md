# 实施计划

- [x] 1. 创建字段精简工具函数
  - 在 `mcp/src/tools/env.ts` 文件顶部添加 `simplifyEnvList` 函数
  - 实现字段白名单机制，只保留 7 个核心字段：`EnvId`, `Alias`, `Status`, `EnvType`, `Region`, `PackageName`, `IsDefault`
  - 处理边界情况：空数组、null、undefined
  - 添加英文注释说明函数用途
  - _需求: 需求 1 的验收标准 1, 2, 3, 4

- [x] 2. 在 envQuery 工具中应用字段精简
  - 在 `mcp/src/tools/env.ts` 的 `envQuery` 工具 `list` 操作中，在获取到环境列表后应用 `simplifyEnvList`
  - 在 `DescribeEnvs` API 调用成功后应用精简（在格式转换后）
  - 确保在环境 ID 过滤之前应用精简
  - _需求: 需求 1 的验收标准 1, 5

- [x] 3. 在降级场景中应用字段精简
  - 在 `envQuery` 工具的降级逻辑中（`listEnvs()` 调用后）也应用字段精简
  - 确保所有返回路径都经过字段精简处理
  - _需求: 需求 1 的验收标准 5

- [x] 4. 验证交互式界面不受影响
  - 确认 `mcp/src/tools/interactive.ts` 中的环境列表查询不使用字段精简（保持完整数据）
  - 确认 `mcp/src/interactive-server.ts` 中的 WebSocket 环境列表刷新不使用字段精简（保持完整数据）
  - 验证交互式界面功能正常
  - _需求: 需求 1 的验收标准 7

- [x] 5. 添加单元测试
  - 创建测试用例验证 `simplifyEnvList` 函数功能
  - 测试正常环境列表的字段精简
  - 测试边界情况：空数组、null、undefined、字段缺失
  - 测试字段保留是否正确
  - _需求: 需求 1 的验收标准 1, 2, 3

- [x] 6. 集成测试和验证
  - 测试 `envQuery` 工具返回精简后的数据
  - 验证返回数据格式与现有代码兼容
  - 验证环境过滤逻辑（按 envId 过滤）正常工作
  - 验证环境选择、验证等功能不受影响
  - _需求: 需求 1 的验收标准 4, 6

- [x] 7. 代码审查和优化
  - 检查代码注释是否清晰
  - 确保代码符合项目规范（注释使用英文）
  - 优化代码可读性和可维护性
  - _需求: 需求 1 的所有验收标准

