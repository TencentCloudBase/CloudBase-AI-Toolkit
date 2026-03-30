# 实施计划

- [x] 1. 固化 CMS 产品路线与决策矩阵资料
  - 基于本 spec 将 `CloudBase-native`、`PG-based`、`Hybrid` 三条路线整理为可复用的决策矩阵
  - 明确 `CloudBase CMS v1` 与 `PG-enhanced CMS v2` 的能力边界、适用场景与升级触发条件
  - 为后续 `cms` skill 和产品方案复用统一术语：`workspace/project`、`contentType/schema`、`entry`、`workflow`、`webhook` 等
  - _需求: 需求1, 需求2, 需求3, 需求4, 需求5

- [x] 2. 在 `config/source/skills/` 中规划 CMS skill 的目标目录与结构
  - 确定 `config/source/skills/cms/` 作为新 skill 的单一语义源目录
  - 设计主 `SKILL.md`、`references/` 与 `assets/` 的职责划分
  - 预留至少 `archetypes.md`、`snippets.md`、`cloudbase-mapping.md`、`decision-matrix.md` 等参考文件位置
  - _需求: 需求3, 需求4, 需求5

- [x] 3. 产出 `cms` skill 的样板定义稿
  - 按 `skill-authoring` 标准编写 `cms` 的 `name`、`description`、边界、行为规则与路由
  - 将 skill 默认行为改为“先选路线、再选 archetype、最后给出 CloudBase / PG 映射”，而不是默认从零设计 CMS
  - 明确 `cms` 与 `app-builder`、`headless-cms`、`wechat-miniprogram` 等近邻 skill 的边界
  - _需求: 需求3, 需求5

- [x] 4. 沉淀 CMS archetype 与固定片段库
  - 提炼至少 `collection-cms`、`campaign-cms`、`page-builder-cms` 等 archetype
  - 为字段、发布流程、媒体、权限、webhook 等能力整理可复用 snippets
  - 将历史 `cloudbase-extension-cms` 中值得复用的 `project`、`schema`、`webhook`、`role` 等产品骨架转化为参考资料，而不是直接复制实现
  - _需求: 需求1, 需求3, 需求4, 需求5

- [x] 5. 编写 CloudBase 与 PG 的映射规则
  - 明确哪些能力优先映射到 CloudBase：小程序/小游戏、存储、函数、托管、轻量内容配置
  - 明确哪些能力优先映射到 PG：复杂关系、多租户、多客户隔离、审计、工作流状态、复杂查询
  - 明确哪些授权逻辑必须留在服务层：RBAC、状态流转、批量操作、hook/webhook 触发策略
  - _需求: 需求2, 需求3, 需求4, 需求5

- [x] 6. 建立 CMS 路线的评测集与验收样例
  - 为 `cms` skill 设计至少 3 个 `should-trigger`、3 个 `should-not-trigger` 和 1 个最近邻对比样例
  - 加入真实用户声音样例，例如“台账 + 可视化 + 多用户 + 小程序 + 对话式数据访问”
  - 验证轻量需求会落到 `CloudBase-native`，复杂权限/门户需求会落到 `PG-based` 或 `Hybrid`
  - _需求: 需求1, 需求2, 需求5

- [x] 7. 用样板结果回推 v1/v2 产品规划与后续实现优先级
  - 基于 `cms` skill 样板复查 v1 首发能力是否足够真实可用
  - 基于复杂场景样例复查 v2 PG 增强边界是否清晰
  - 输出后续产品实现优先级建议，例如“先做 CloudBase CMS v1 策略资料与样板 skill，再评估 PG-enhanced 能力进入产品路线图”
  - _需求: 需求1, 需求2, 需求4, 需求5
