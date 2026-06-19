# 实施计划

- [x] 1. 为 NoSQL 集合创建增加就绪等待逻辑
  - 在 `writeNoSqlDatabaseStructure(action="createCollection")` 成功后增加受控轮询
  - 使用集合存在性检查确认集合已进入基础可用状态后再返回
  - 在超时场景返回包含集合名和等待信息的明确错误
  - _需求: 1, 3_

- [x] 2. 保持 NoSQL 内容工具的对象参数兼容性
  - 确认 `insert/update/delete/query` 的 `object/object[]` 自动序列化逻辑保持不变
  - 避免本次修复引入 MCP schema 或内容写入行为回归
  - _需求: 2_

- [x] 3. 调整并验证数据库集成测试
  - 使用现有 `tests/integration.test.js` 验证“创建集合后立即插入”链路
  - 确认插入、查询、更新、删除和字符串查询兼容路径仍通过
  - 已执行 `cd mcp && npx vitest run ../tests/integration.test.js -t "Database tools support object/object[] parameters"`，当前环境因缺少 CloudBase 凭证而自动跳过
  - _需求: 2, 3_

- [x] 4. 更新任务状态并记录验证结果
  - 在完成实现和验证后更新任务勾选状态
  - 已记录验证命令；当前未覆盖风险为缺少真实 CloudBase 凭证，尚未在本地复现真实建集合后写入成功链路
  - _需求: 1, 2, 3_
