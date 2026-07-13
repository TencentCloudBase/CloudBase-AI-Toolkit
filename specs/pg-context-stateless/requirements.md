# 需求文档：移除 PG MCP 工具的 init 上下文绑定

## 介绍

CloudBase MCP 的 PostgreSQL 工具（`queryPgDatabase` / `managePgDatabase`）当前要求用户先调用 `managePgDatabase(action=init)` 绑定运行上下文，才能执行其他业务 action。该设计存在两个核心问题：

1. **init 多余**：与 NoSQL、MySQL 工具行为不一致，init 绑定的所有参数（envId、instanceId、defaultSchema、role）都有默认值或可从 server 上下文推导
2. **init 坏掉**：在服务端/HTTP transport 模式下，`server.pgRuntimeContext` 内存状态在工具调用之间无法正确共享，导致 init 成功后下一次调用仍然报 `PG_CONTEXT_NOT_INITIALIZED`，工具完全不可用（用户被迫绕道 `tcb db execute` CLI）

本需求旨在移除 init 步骤，改为函数式推导上下文 + lazy 就绪探测，使 PG 工具开箱即用，与 NoSQL/MySQL 行为一致。

## 需求

### 需求 1 — 开箱即用（消除 init 前置）

**用户故事：** 作为 AI Agent 或开发者，我希望直接调用 `queryPgDatabase` 或 `managePgDatabase` 的任意业务 action 时能正常工作，而不需要先调用 `init`，以便与 NoSQL、MySQL 工具行为一致，避免第一次使用时撞上 `PG_CONTEXT_NOT_INITIALIZED` 错误。

#### 验收标准

1. While 用户已通过 `envQuery` 或 server 启动参数绑定 CloudBase 环境, when 用户直接调用 `queryPgDatabase(action=sql)` 或 `managePgDatabase(action=execute)` 时, the CloudBase MCP 系统 shall 不要求任何前置 init 调用，直接使用从 `server.cloudBaseOptions.envId` 推导的 envId 执行 SQL。

2. While 用户从未调用过 `managePgDatabase(action=init)`, when 用户调用 `queryPgDatabase(action=objects)` 时, the 系统 shall 正常返回数据库对象列表，不返回 `PG_CONTEXT_NOT_INITIALIZED` 错误。

3. The 系统 shall 不再维护 `server.pgRuntimeContext` 内存状态对象作为业务 action 的前置条件。

### 需求 2 — 上下文自动推导

**用户故事：** 作为 AI Agent，我希望 `envId`、`instanceId`、`defaultSchema`、`role` 等参数自动从 server 上下文推导或使用合理默认值，以便减少配置负担，避免持久化文件带来的状态不一致风险。

#### 验收标准

1. While server 启动时已配置 `cloudBaseOptions.envId`, when 任意 PG 工具 action 被调用时, the 系统 shall 通过与 NoSQL/MySQL 一致的 `getEnvId(server.cloudBaseOptions)` 路径解析 envId，不依赖任何 init 绑定的状态。

2. While 用户未显式传入 `instanceId`, when PG 工具执行 SQL 时, the 系统 shall 使用默认常量 `instanceId="cloudbase-pg"`（与当前 init 的默认值一致）。

3. While 用户未显式传入 `defaultSchema`, when PG 工具执行 SQL 时, the 系统 shall 使用默认常量 `defaultSchema="public"`。

4. While 用户未显式传入 `role`, when PG 工具调用 Manager SDK 的 `executePGSql` 时, the 系统 shall 使用默认常量 `role="cloudbase_admin"`。

5. The 系统 shall 不再读取或写入 `~/.cloudbase-mcp/pg-context.json` 持久化文件，不再识别 `CLOUDBASE_PG_CONTEXT_PATH` 环境变量。

6. The 系统 shall 删除 `PgRuntimeContext` 接口、`savePgContext`、`loadStoredPgContext`、`getPgContextStorePath` 等所有上下文持久化相关代码。

### 需求 3 — 就绪探测 lazy 化

**用户故事：** 作为 AI Agent，我希望 PG 实例未就绪时系统在首次实际 SQL 调用时自动探测并重试，而不是强制在 init 阶段等待，以便冷启动时间不前置阻塞整个工具链，与 MySQL 工具的 lazy 就绪检查行为一致。

#### 验收标准

1. While PG 实例处于冷启动或未就绪状态, when 用户首次调用任意需要实际 SQL 执行的 action（`sql`/`execute`/`objects`/`metadata`/`schema` 等）时, the 系统 shall 在内部执行 `SELECT 1` 探测，最多重试 20 次、每次间隔 1 秒，探测成功后执行业务 SQL。

2. While 就绪探测失败（20 次重试后仍无法连接）, when 用户调用任意业务 action 时, the 系统 shall 返回 `PG_NOT_READY` 错误码，并附带最后一次错误信息和 nextActions 引导用户检查环境 PG 实例状态。

3. While 就绪探测已成功一次, when 同一 server 生命周期内后续 action 被调用时, the 系统 shall 不重复执行就绪探测（使用一次性 Promise 缓存）。

4. The 系统 shall 不在 `action=dryRun` 时触发就绪探测，因为 dryRun 仅做本地 SQL 文本分析，不需要连接数据库。

### 需求 4 — init action 移除

**用户故事：** 作为已有调用习惯的 AI Agent 或用户，我希望现有 `init` 调用能明确感知到该 action 已废弃，以便我及时调整调用方式，避免静默失败。

#### 验收标准

1. The 系统 shall 从 `managePgDatabase` 的 `MANAGE_ACTIONS` 枚举中移除 `init` 值。

2. While 用户调用 `managePgDatabase(action=init)`, when schema 校验阶段执行时, the 系统 shall 返回 `UNSUPPORTED_ACTION` 错误（与其他未知 action 的处理一致），并在 message 中提示 "init 已移除，PG 上下文现自动推导，请直接调用业务 action"。

3. The 系统 shall 删除 `handleInit` 函数及其所有相关辅助代码（`bootstrapResult`、`ensurePgReady` 中仅服务于 init 的分支等）。

4. The 系统 shall 保留 `queryPgDatabase(action=context)` 作为只读查询，返回当前自动推导出的上下文信息（envId、instanceId、defaultSchema、role），用于调试和可观测性。

### 需求 5 — 向后兼容与文档同步

**用户故事：** 作为依赖 PG 工具的下游使用者，我希望文档、skill、生成产物（tools.json、mcp-tools.md）同步更新，以便不残留对 init 的引用，避免误导。

#### 验收标准

1. The 系统 shall 更新 `doc/mcp-tools.md` 中 `managePgDatabase` 的 action 枚举说明，移除 `init` 描述。

2. The 系统 shall 更新 `scripts/tools.json` 生成产物中 `managePgDatabase` 的 action enum，移除 `init`。

3. The 系统 shall 更新 `config/source/skills/postgresql-development/` 下的 SKILL.md（如存在），移除所有 "先调用 init" 的指引。

4. The 系统 shall 更新 `mcp/src/tools/databasePG.ts` 顶部的工具 description，移除 "init=初始化或绑定 PostgreSQL 上下文" 字样。

5. While 现有测试用例引用 `action=init` 或 `pgRuntimeContext`, when 测试套件运行时, the 系统 shall 更新或删除这些测试用例以反映新的无状态架构，不保留测试 init 行为的用例。

## 非功能性约束

- **性能**：lazy 就绪探测只在首次 SQL 调用时触发，不应对每次调用增加开销
- **一致性**：与 NoSQL、MySQL 工具的 envId 解析路径保持一致（`getEnvId(server.cloudBaseOptions)`）
- **可观测性**：保留 `action=context` 只读查询，便于调试
- **无破坏性**：不改变 Manager SDK `executePGSql` 的调用契约，仅改变上下文来源
