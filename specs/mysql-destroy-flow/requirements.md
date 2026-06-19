# 需求文档

## 介绍

当前 SQL 数据库工具已经支持 MySQL 开通、状态查询、SQL 执行与初始化，但还不支持通过 MCP 工具触发 MySQL 销毁，也不支持查询销毁任务状态。

本次需求补齐 MySQL 生命周期中的销毁能力，使 AI 开发者可以在明确确认后通过 SQL 管理工具发起销毁，并通过 SQL 查询工具跟踪销毁结果或任务状态。该能力应继续遵循现有 query/manage 工具分工、统一返回包络和长任务表达方式，避免引入新的零散工具。

## 需求

### 需求 1 - 通过管理工具发起 MySQL 销毁

**用户故事：** 作为 AI 开发者，当我确认当前环境中的 MySQL 不再需要时，我希望通过 SQL 管理工具直接发起销毁，而不是跳到控制台手工操作，这样数据库生命周期可以在同一条 agent 工作流中完成。

#### 验收标准

1. When AI 开发者发起 MySQL 销毁请求时, the `manageSqlDatabase` 工具 shall 提供用于销毁 MySQL 的管理类 action，并通过 CloudBase `DestroyMySQL` 接口执行销毁。
2. When AI 开发者发起 MySQL 销毁请求时, the `manageSqlDatabase` 工具 shall 要求显式确认参数，以避免误删数据库资源。
3. While 当前环境中不存在可销毁的 MySQL 实例时, when AI 开发者请求销毁时, the `manageSqlDatabase` 工具 shall 返回结构化阻断结果，而不是继续提交销毁请求。
4. When MySQL 销毁请求提交成功时, the `manageSqlDatabase` 工具 shall 返回结构化任务信息，至少包含 `success`、`data.task`、`message` 和合理的 `nextActions`。

### 需求 2 - 支持销毁后的异步状态查询

**用户故事：** 作为 AI 开发者，当 MySQL 销毁进入异步执行阶段时，我希望继续通过 SQL 查询工具查看状态，而不是依赖控制台文本提示，这样 agent 才能稳定判断下一步是否结束或继续轮询。

#### 验收标准

1. When AI 开发者查询 MySQL 销毁任务状态时, the `querySqlDatabase` 工具 shall 支持复用 `DescribeMySQLTaskStatus` 返回结构化状态结果。
2. When AI 开发者查询 MySQL 销毁结果时, the `querySqlDatabase` 工具 shall 支持复用 `DescribeCreateMySQLResult`、`DescribeMySQLClusterDetail` 或等价判断逻辑，确认实例是否已被销毁。
3. While MySQL 销毁仍在处理中时, when AI 开发者发起状态查询时, the SQL 数据库工具 shall 返回明确的生命周期状态以及下一步建议，而不是仅返回原始响应。
4. When MySQL 销毁完成时, the SQL 数据库工具 shall 将当前环境映射为 `NOT_CREATED` 或等价的“实例不存在”状态，并停止继续建议执行 SQL 或初始化动作。
5. When `DescribeMySQLTaskStatus` 返回 `FAILED` 时, the SQL 数据库工具 shall 返回明确的失败状态、错误信息或错误码，并停止自动推进后续销毁流程。

### 需求 3 - 与现有 SQL 工具职责保持一致

**用户故事：** 作为系统维护者，我希望新增销毁能力后，SQL 工具职责仍然清晰稳定，这样后续 agent 不会把实例生命周期操作和 SQL 执行动作混用。

#### 验收标准

1. When 新增 MySQL 销毁能力时, the MCP SQL 数据库模块 shall 继续通过 `querySqlDatabase` 承载查询类动作，通过 `manageSqlDatabase` 承载副作用类动作。
2. When 新增 MySQL 销毁能力时, the MCP SQL 数据库模块 shall 不新增第三个 SQL 生命周期工具，而是在现有 query/manage 双工具模型内扩展 action。
3. While MySQL 已被销毁时, when AI 开发者尝试执行 `runStatement`、`initializeSchema` 或其他依赖实例存在的动作时, the `manageSqlDatabase` 工具 shall 返回结构化阻断结果，并提示先重新开通 MySQL。

### 需求 4 - 保持统一返回与安全约束

**用户故事：** 作为系统维护者，我希望销毁能力的返回结构和安全约束与现有 SQL 工具保持一致，这样 agent 可以可靠衔接后续动作，同时避免误删资源。

#### 验收标准

1. When `manageSqlDatabase` 或 `querySqlDatabase` 处理 MySQL 销毁流程时, the SQL 数据库工具 shall 提供统一返回包络，至少包含 `success`、`data`、`message`，并在合理情况下包含 `nextActions`。
2. When AI 开发者请求销毁 MySQL 时, the SQL 数据库工具 shall 要求显式确认，并在返回消息中明确提示该操作会删除数据库资源。
3. When MySQL 销毁失败时, the SQL 数据库工具 shall 返回明确的失败状态、失败原因或错误码，并阻断后续依赖“已销毁”假设的流程。
4. When MySQL 销毁完成时, the SQL 数据库工具 shall 不再建议继续查询销毁任务状态，而是给出“实例已不存在”或“可重新开通”的后续建议。

### 需求 5 - 更新 source skill 中的生命周期说明

**用户故事：** 作为系统维护者，我希望 source skill 同步学到新的销毁流程，这样 agent 在 SQL 生命周期场景下能正确选择工具和顺序。

#### 验收标准

1. When MySQL 销毁能力加入 SQL 工具后, the 项目 shall 更新 `config/source/skills/relational-database-tool/SKILL.md`，说明新的销毁 action 与调用边界。
2. When source skill 更新销毁流程时, the source skill shall 明确描述“查询实例 -> 发起销毁 -> 查询任务状态/确认实例已不存在”的推荐调用顺序。
3. When source skill 已更新时, the 项目 shall 不把 `.generated/compat-config/`、`config/.claude/skills/` 或其他兼容镜像的手工编辑作为本次需求确认阶段的前置工作。
