# 实施计划

- [x] 1. 为 SQL 管理工具补充 MySQL 销毁 action
  - 在 `mcp/src/tools/databaseSQL.ts` 中为 `manageSqlDatabase` 增加 `action="destroyMySQL"`
  - 对齐 `DestroyMySQL` 官方 API 参数与返回结构
  - 增加显式确认要求，并在实例不存在时返回结构化阻断结果
  - _需求: 需求1, 需求4

- [x] 2. 调整销毁任务状态查询与后续建议
  - 在 `querySqlDatabase(action="describeTaskStatus")` 中兼容销毁任务状态表达
  - 任务失败时返回结构化错误，不做内部重试
  - 销毁任务成功时给出适合销毁场景的下一步建议，而不是沿用初始化建议
  - _需求: 需求2, 需求4

- [x] 3. 补充销毁完成后的实例存在性判断
  - 复用 `getInstanceInfo` 确认实例是否已回到不存在状态
  - 保证实例销毁后依赖实例存在的动作会被阻断
  - _需求: 需求2, 需求3

- [x] 4. 更新 source skill 中的 SQL 生命周期说明
  - 更新 `config/source/skills/relational-database-tool/SKILL.md`
  - 增加“查询实例 -> 发起销毁 -> 查询任务状态 -> 可选确认实例不存在”的推荐顺序
  - 明确销毁失败时通过结构化错误暴露给上层
  - _需求: 需求5

- [x] 5. 补充销毁流程相关测试
  - 为 `destroyMySQL` 的确认、阻断、参数透传和返回结构补充单元测试
  - 为销毁任务状态成功/失败路径补充测试
  - 为销毁成功后的 nextActions 与实例不存在阻断补充回归测试
  - _需求: 需求1, 需求2, 需求3, 需求4

- [x] 6. 完成本地验证并同步任务状态
  - 运行与 `databaseSQL` 直接相关的测试
  - 记录本次验证结果
  - 将本计划中的任务状态更新为已完成
  - _需求: 需求1, 需求2, 需求3, 需求4, 需求5
