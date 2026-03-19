# 实施计划

- [x] 1. 重构 SQL 工具入口为标准 query/manage 设计
  - 在 `mcp/src/tools/databaseSQL.ts` 中移除旧的 `executeReadOnlySQL` 和 `executeWriteSQL` 注册
  - 新增 `querySqlDatabase` 工具，承载 SQL 域所有只读能力
  - 新增 `manageSqlDatabase` 工具，承载 SQL 域所有管理与写操作能力
  - 为两个工具补齐清晰的 title、description、annotations 和 Zod schema
  - _需求: 需求1, 需求4

- [x] 2. 实现 `querySqlDatabase` 的只读 SQL 查询能力
  - 实现 `action="runQuery"` 的只读 SQL 执行逻辑
  - 限制仅允许只读查询语句
  - 解析 `RunSql` 返回的 `Items`、`Infos` 和 `RowsAffected`
  - 按统一包络返回 `success`、`data`、`message`、`nextActions`
  - 将查询结果按不可信数据处理要求输出
  - _需求: 需求1, 需求4

- [x] 3. 实现 MySQL 开通状态查询能力
  - 在 `querySqlDatabase` 中实现 `action="getInstanceInfo"`
  - 在 `querySqlDatabase` 中实现 `action="describeCreateResult"`
  - 在 `querySqlDatabase` 中实现 `action="describeTaskStatus"`
  - 将官方返回状态映射为统一生命周期状态（如 `NOT_CREATED`、`PENDING`、`RUNNING`、`READY`、`FAILED`）
  - 为开通中、失败、已完成场景生成合理的 `nextActions`
  - _需求: 需求2, 需求4

- [x] 4. 实现 `manageSqlDatabase` 的实例开通能力
  - 实现 `action="provisionMySQL"` 调用 `CreateMySQL`
  - 增加 `confirm: true` 的显式确认要求
  - 在调用前检查当前环境是否已有实例，避免重复开通
  - 返回结构化任务信息、实例信息和下一步建议
  - _需求: 需求2, 需求4

- [x] 5. 实现 `manageSqlDatabase` 的 SQL 写入与初始化能力
  - 实现 `action="runStatement"` 用于执行写 SQL 与单条 DDL
  - 实现 `action="initializeSchema"` 用于顺序执行建表、建索引等初始化语句
  - 在初始化前校验实例是否已就绪，未就绪时返回阻断信息
  - 保留 `_openid` 字段与安全规则提示
  - _需求: 需求3, 需求4

- [x] 6. 提取 SQL 工具公共辅助逻辑
  - 提取数据库上下文解析函数，统一处理 `envId`、`instanceId`、`schema`
  - 提取控制面调用封装，统一处理 `commonService("tcb", "2018-06-08").call()`
  - 提取结果标准化函数，统一解析 `RunSql` 结果和生命周期状态
  - 提取统一返回包络构造函数，避免 handler 内重复拼接 JSON
  - _需求: 需求4

- [x] 7. 更新 source skill 中的 SQL 工具说明
  - 更新 `config/source/skills/relational-database-tool/SKILL.md`
  - 将工具说明替换为 `querySqlDatabase` 和 `manageSqlDatabase`
  - 增加“开通 MySQL -> 查询状态 -> 初始化表结构”的推荐调用顺序
  - 移除对旧工具名的引用，避免 agent 继续使用历史接口
  - _需求: 需求5

- [x] 8. 更新 SQL 工具相关测试
  - 为 `querySqlDatabase` 的各 action 补充单元测试
  - 为 `manageSqlDatabase` 的各 action 补充单元测试
  - 覆盖参数校验、生命周期状态映射、阻断逻辑和 `nextActions`
  - 覆盖 `provisionMySQL` 的确认参数要求
  - _需求: 需求2, 需求3, 需求4

- [x] 9. 验证工具注册与 source skill 一致性
  - 验证服务启动后仅暴露新的 SQL 工具名
  - 验证旧工具名不再出现在 SQL skill source 中
  - 运行与当前改动直接相关的测试或校验命令
  - 记录无法在本地完成的验证项
  - _需求: 需求1, 需求5
