# 实施计划

## 任务列表

- [x] 1. 修复超时时间配置
  - 将 `ENV_ID_TIMEOUT` 从 60000000 改为 600000（10分钟）
  - 更新注释说明，确保注释和实际值一致
  - 验证超时逻辑正常工作
  - _需求: 需求 1

- [x] 2. 统一 cloudrun.ts 中的环境变量使用
  - 将 4 处 `process.env.TCB_ENV_ID` 改为使用 `getEnvId(cloudBaseOptions)`
  - 添加 `getEnvId` 的导入
  - 验证所有 cloudrun 工具都能正确获取环境ID
  - _需求: 需求 2

- [x] 3. 修复 envId 缓存同步问题（Critical）
  - 在 `_promptAndSetEnvironmentId` 中调用 `envManager.setEnvId()` 更新缓存
  - 确保文件、缓存、process.env 三者同步
  - 验证切换环境后工具使用正确的环境ID
  - _需求: 需求 3

- [x] 4. 移除文件缓存机制
  - 删除 `saveEnvIdToUserConfig`、`loadEnvIdFromUserConfig`、`clearUserEnvId` 函数
  - 移除 `_fetchEnvId` 中从文件读取的逻辑
  - 移除 `setEnvId` 中保存到文件的逻辑
  - 更新所有引用这些函数的地方
  - 清理未使用的导入（fs, os, path）
  - _需求: 需求 4

- [x] 5. 优化 getCloudBaseManager 性能
  - 添加 `getCachedEnvId()` 方法
  - 优化 `getCloudBaseManager` 逻辑，优先使用缓存
  - 避免不必要的 `envManager.getEnvId()` 调用
  - 验证优化后的性能提升
  - _需求: 需求 5

- [x] 6. 导出 envManager 供测试使用
  - 在 `mcp/src/index.ts` 中导出 `envManager`
  - 确保测试可以访问 envManager
  - _需求: 需求 6

- [x] 7. 添加自动化测试
  - 创建 `tests/envid-management.test.js`
  - 测试超时时间配置
  - 测试 getEnvId 优先级
  - 测试 getCloudBaseManager 优化
  - 测试缓存同步
  - 测试文件缓存移除
  - 测试 CloudRun 工具修复
  - 测试环境切换场景
  - 测试 getCachedEnvId 方法
  - 验证所有测试通过
  - _需求: 需求 6

- [x] 8. 修复 interactive.ts 中遗漏的 cloudBaseOptions 传递
  - 在 `_promptAndSetEnvironmentId` 中调用 `getCloudBaseManager` 时传入 `cloudBaseOptions`
  - 确保获取环境列表时使用正确的环境上下文
  - _需求: 需求 3

## 实施顺序

1. 修复 1-3（Critical 问题，必须立即修复）
2. 修复 4（移除文件缓存，简化代码）
3. 修复 5（性能优化）
4. 修复 6-7（测试覆盖）
5. 修复 8（完善修复）

## 风险评估

- **修复 1-3**：低风险，向后兼容，必须修复
- **修复 4**：中等风险，需要充分测试，但能解决多进程问题
- **修复 5**：低风险，性能优化，向后兼容
- **修复 6-7**：低风险，测试覆盖，质量保障
- **修复 8**：低风险，完善修复，向后兼容

## 测试验证

运行测试：
```bash
cd mcp && npm test -- tests/envid-management.test.js
```

预期结果：所有 12 个测试用例通过 ✅

