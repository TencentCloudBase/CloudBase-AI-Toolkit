# 实施计划

- [ ] 1. 定义统一任务控制面合同
  - 明确哪些动作保留直接模式，哪些动作必须任务化。
  - 设计统一的 `TaskHandle`、`TaskStatus`、任务结果与事件结构。
  - 明确 `queryTasks` / `manageTasks` 作为独立资源域的边界与 canonical action。
  - _需求: 需求1, 需求2_

- [ ] 2. 为首期试点域补齐任务化 action 设计
  - 在试点域的 `queryXxx` / `manageXxx` 主入口中新增 `plan / run / verify` 类 action。
  - 设计从域入口发起任务、再转入统一任务控制面的交互方式。
  - 明确高风险动作的 `confirm`、审批与回滚支持策略。
  - _需求: 需求1, 需求2, 需求6_

- [ ] 3. 建立任务化场景的结构化语义源
  - 新增 `config/source/guideline/cloudbase/task-flows.yaml` 或等价结构化文件。
  - 为高价值场景定义 `primarySkill`、`initiatingTool`、`mode`、`beforeAction`、`verifyAfter`、`rollbackIf` 与 `doNotUse`。
  - 用该语义源约束主 guideline、子 skill 与下游投影。
  - _需求: 需求3, 需求4, 需求6_

- [ ] 4. 升级主 guideline 与高价值 skill 为 workflow contract
  - 更新 `config/source/guideline/cloudbase/SKILL.md`，明确哪些场景必须进入任务流。
  - 为试点域相关 skill 增加 `Before action`、`Prefer task mode`、`Verify after`、`Rollback / cleanup if` 等区块。
  - 明确直接模式、任务模式和不推荐路径之间的边界。
  - _需求: 需求3, 需求4_

- [ ] 5. 对齐文档、兼容规则与聚合产物
  - 更新 `doc/mcp-tools.md`、`doc/connection-modes.mdx`、IDE 兼容规则和对外 skills 入口，使其表达一致的任务化语义。
  - 检查 all-in-one、兼容镜像和生成产物是否保留 canonical 名称与关键 workflow 合同。
  - 明确语义源与兼容投影的同步流程。
  - _需求: 需求4, 需求5_

- [ ] 6. 增加任务流测试与评测合同
  - 为任务控制面增加创建、状态迁移、控制动作、结果查询测试。
  - 为 skill 路由增加 should-trigger、should-route、should-read、should-not-use 测试。
  - 为兼容投影增加一致性测试，防止关键任务语义在生成链路中丢失。
  - _需求: 需求5_

- [ ] 7. 完成首期试点与推广评估
  - 在 SQL schema change、NoSQL migration 或发布流程中至少选择一个域进行完整试点。
  - 记录试点中的调用正确率、收尾质量、失败归因与维护成本。
  - 基于试点结果决定后续是否扩展到更多域，并形成推广标准。
  - _需求: 需求6_
