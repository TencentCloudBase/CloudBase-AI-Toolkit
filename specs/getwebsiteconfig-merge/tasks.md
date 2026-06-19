# 实施计划

- [ ] 1. 更新 envQuery 输入模式
  - 在 envQuery 的 inputSchema 中添加 "hosting" 操作类型
  - 更新工具描述，说明新增的静态网站配置查询功能
  - _需求: 合并工具功能

- [ ] 2. 实现静态网站配置查询逻辑
  - 在 envQuery 的 switch 语句中添加 "hosting" case
  - 调用 cloudbase.hosting.getWebsiteConfig() 方法
  - 保持与其他操作一致的错误处理和返回格式
  - _需求: 合并工具功能

- [ ] 3. 从 hosting.ts 移除 getWebsiteConfig 工具
  - 删除 getWebsiteConfig 工具的注册代码
  - 清理相关的注释和接口定义
  - 确保不影响其他 hosting 相关工具
  - _需求: 合并工具功能

- [ ] 4. 更新文档和类型定义
  - 更新工具的描述文档，说明合并后的功能
  - 确保类型定义的一致性
  - _需求: 合并工具功能

- [ ] 5. 验证合并后的功能
  - 测试 envQuery 的 "hosting" 操作是否正常工作
  - 验证原有功能不受影响
  - 确认向后兼容性
  - _需求: 合并工具功能
