# 实施计划

- [ ] 1. Tool 参数类型调整
  - 将 insertDocuments、updateDocuments 等 tool 的嵌套 JSON 入参类型从 json 字符串调整为 JSON 对象/数组
  - _需求: 1
- [ ] 2. Handler 层序列化处理
  - 在 handler 层将 JSON 对象/数组序列化为字符串，兼容底层 SDK
  - _需求: 1
- [ ] 3. 文档与注释同步更新
  - 更新 tool 参数说明、示例和注释，明确参数类型
  - _需求: 1
- [ ] 4. 回归与单元测试
  - 增加典型嵌套 JSON 场景的测试用例，确保兼容性
  - _需求: 1 