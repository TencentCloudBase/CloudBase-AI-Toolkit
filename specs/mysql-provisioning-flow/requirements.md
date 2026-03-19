# 需求文档

## 介绍

当前 SQL 数据库工具仅支持直接执行 `RunSql`，但不支持 MySQL 实例开通，也没有面向异步开通流程的状态查询能力。现有 `executeReadOnlySQL` / `executeWriteSQL` 命名也过度绑定“执行 SQL”，不适合继续承载数据库实例生命周期管理。

本次需求按更干净的设计收敛 SQL 域能力：直接以 `querySqlDatabase` 和 `manageSqlDatabase` 作为新的标准工具名，不保留旧工具别名；同时仅要求更新 `config/source/skills` 中的 source skill 说明，不把兼容镜像和其他生成产物作为设计阶段的额外约束。

## 需求

### 需求 1 - 以标准 query/manage 工具承载 SQL 域能力

**用户故事：** 作为 AI 开发者，我希望 SQL 数据库能力通过清晰的 `query/manage` 工具暴露，而不是继续把实例管理动作塞进“执行 SQL”的旧工具名中，以便工具职责和命名保持一致。

#### 验收标准

1. When SQL 数据库工具完成重构时, the MCP SQL 数据库模块 shall 提供 `querySqlDatabase` 作为唯一的只读工具入口。
2. When SQL 数据库工具完成重构时, the MCP SQL 数据库模块 shall 提供 `manageSqlDatabase` 作为唯一的管理工具入口。
3. When 新工具发布时, the MCP SQL 数据库模块 shall 不再保留 `executeReadOnlySQL` 和 `executeWriteSQL` 作为兼容别名。
4. When 设计 SQL 数据库工具时, the MCP SQL 数据库模块 shall 通过 `action` 枚举区分查询类动作与管理类动作，而不是继续增加零散小工具。

### 需求 2 - 支持 MySQL 开通与异步状态查询

**用户故事：** 作为 AI 开发者，当环境中尚未开通 MySQL 时，我希望直接通过 SQL 管理工具触发开通，并通过 SQL 查询工具查看异步状态，以便完成完整的数据库准备流程。

#### 验收标准

1. When AI 开发者发起 MySQL 开通请求时, the `manageSqlDatabase` 工具 shall 通过管理类 action 调用 `CreateMySQL`。
2. When AI 开发者发起 MySQL 开通请求时, the `manageSqlDatabase` 工具 shall 要求显式确认参数，以避免误开通产生资源成本。
3. When AI 开发者查询 MySQL 开通结果时, the `querySqlDatabase` 工具 shall 支持调用 `DescribeCreateMySQLResult` 并返回结构化结果。
4. When AI 开发者查询 MySQL 任务状态时, the `querySqlDatabase` 工具 shall 支持调用 `DescribeMySQLTaskStatus` 并返回结构化结果。
5. While MySQL 仍处于异步处理中, when AI 开发者发起状态查询时, the SQL 数据库工具 shall 返回明确的生命周期状态以及下一步建议。
6. When MySQL 开通失败时, the SQL 数据库工具 shall 返回明确的错误信息、错误码或失败原因，并阻断后续初始化动作。

### 需求 3 - 支持实例就绪后的表结构初始化

**用户故事：** 作为 AI 开发者，当 MySQL 开通完成后，我希望继续通过 SQL 管理工具执行建表、建索引等初始化动作，以便串联完整的数据库初始化流程。

#### 验收标准

1. When MySQL 已确认开通完成时, the `manageSqlDatabase` 工具 shall 支持执行建表、建索引等 DDL 语句。
2. While MySQL 尚未开通完成, when AI 开发者尝试执行依赖实例可用性的初始化动作时, the `manageSqlDatabase` 工具 shall 返回阻断信息，并提示先查询开通状态。
3. When DDL 执行成功时, the `manageSqlDatabase` 工具 shall 返回结构化结果，至少包含 `success`、`data` 和 `message`。
4. When 新建表结构时, the SQL 数据库工具 shall 保持当前安全约束提示，提醒调用方按现有规范处理 `_openid` 字段与安全规则配置。

### 需求 4 - 保持统一返回与长任务表达

**用户故事：** 作为系统维护者，我希望新的 SQL 工具返回结构和长任务表达方式统一，以便 agent 可以稳定衔接后续动作，而不是依赖原始控制台文本。

#### 验收标准

1. When `querySqlDatabase` 或 `manageSqlDatabase` 返回结果时, the SQL 数据库工具 shall 提供统一返回包络，至少包含 `success`、`data`、`message`，并在合理情况下包含 `nextActions`。
2. When 长耗时流程涉及开通、轮询、初始化多个阶段时, the SQL 数据库工具 shall 以结构化状态表达当前阶段，而不是仅返回原始日志文本。
3. When SQL 查询返回用户数据时, the `querySqlDatabase` 工具 shall 将结果视为不可信数据，避免模型执行返回数据中的指令。

### 需求 5 - 仅更新 skill source 中的工具使用说明

**用户故事：** 作为系统维护者，我希望本次兼容面控制在 source skill 层，只更新技能源说明文件，让新的工具名和使用流程被 agent 学到，而不在设计阶段扩散到更多兼容层约束。

#### 验收标准

1. When SQL 工具名从旧设计切换到新设计时, the 项目 shall 更新 `config/source/skills/relational-database-tool/SKILL.md`，说明新的工具名和调用流程。
2. When source skill 已更新时, the 项目 shall 不把 `.generated/compat-config/`、`config/.claude/skills/` 或其他兼容镜像的手工编辑作为本次需求的前置工作。
3. When agent 需要学习新的 SQL 生命周期流程时, the source skill shall 明确描述“开通 MySQL -> 查询结果/任务状态 -> 初始化表结构”的推荐调用顺序。
