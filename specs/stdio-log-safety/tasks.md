# 实施计划

- [ ] 1. 在 CLI 入口实现 console 劫持
  - 在 mcp/src/cli.ts 顶部插入 console 劫持代码，覆盖 log/info/warn/error 方法
  - 劫持后所有日志通过 logger.ts 输出
  - _需求: 1

- [ ] 2. 兼容性与异常兜底处理
  - joinArgs 保证所有类型参数安全拼接
  - 劫持后如 logger 抛出异常需兜底，避免影响主流程
  - _需求: 1

- [ ] 3. 保留原始 console 方法
  - 劫持时保存 console._originLog 等，便于调试或特殊场景恢复
  - _需求: 1

- [ ] 4. 测试与验证
  - 验证依赖包/业务代码调用 console.log 等不会污染 stdout
  - 验证 logger.ts 日志级别、文件、stderr 输出等功能正常
  - _需求: 1

- [ ] 5. 文档与说明
  - 在 README 或开发文档中补充 console 劫持说明和注意事项
  - _需求: 1 