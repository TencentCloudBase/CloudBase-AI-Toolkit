# 实施计划

- [ ] 1. 替换 getFunctionLogs 实现为 getFunctionLogsV2
  - 修改 mcp/src/tools/functions.ts，底层实现调用新版接口
  - _需求: 1
- [ ] 2. 更新工具描述和参数说明
  - 明确提示仅返回基础信息，详情需用 RequestId 查询
  - _需求: 1
- [ ] 3. 检查/注册 getFunctionLogDetail 工具
  - 如未注册则补充注册，完善描述
  - _需求: 1
- [ ] 4. 测试新接口功能
  - 确认日志基础信息和详情查询均可用
  - _需求: 1 