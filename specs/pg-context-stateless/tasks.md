# 实施计划

- [x] 1. 删除 `server.ts` 中的 `PgRuntimeContext` 接口和 `pgRuntimeContext` 属性
  - 删除 `PgRuntimeContext` 接口定义（178-187 行）
  - 删除 `ExtendedMcpServer` 接口中的 `pgRuntimeContext?: PgRuntimeContext` 属性（195 行）
  - 检查是否有其他文件引用 `PgRuntimeContext` 类型，同步清理
  - _需求: 需求 2_

- [x] 2. 改造 `databasePG.ts` 核心代码（删除 init + 持久化 + 新增推导）
  - 删除 `PgBootstrapResult` 类型（58-64 行）
  - 删除 `getPgContextStorePath`（133-138 行）、`loadStoredPgContext`（140-151 行）、`savePgContext`（153-170 行）、`getPgContext`（172-182 行）、`buildMissingContextResult`（184-199 行）
  - 删除 `handleInit` 函数（1010-1077 行）
  - 删除 `MANAGE_ACTIONS` 中的 `"init"`（第 20 行）
  - 删除 `case "init"` 分支（1730-1731 行）
  - 删除 `fs`/`path` 导入（若不再使用）
  - 删除 `CLOUDBASE_PG_CONTEXT_PATH` 所有引用
  - _需求: 需求 1, 2, 4_

- [x] 3. 新增 `resolvePgDbContext` 和 `PgDbContext` 接口
  - 新增 `PgDbContext` 接口（envId, instanceId, defaultSchema, role）
  - 新增 `resolvePgDbContext(cloudBaseOptions, args)` 纯函数，照搬 MySQL 的 `resolveSqlDbContext` 模式
  - envId 优先级：args.envId > cloudBaseOptions.envId > getEnvId(cloudBaseOptions) 兜底
  - 默认值：instanceId="cloudbase-pg", defaultSchema="public", role="cloudbase_admin"
  - _需求: 需求 2_

- [x] 4. 改造 `executeManagerPGSql` 和 `createManagerPgClient`
  - `executeManagerPGSql` 参数类型从 `PgRuntimeContext` 改为 `PgDbContext`
  - `createManagerPgClient` 参数类型同步改造
  - `withPgClient` 签名改造（接收 `PgDbContext` 而非 `PgRuntimeContext`）
  - _需求: 需求 2_

- [x] 5. 改造 `ensurePgReady` → `ensurePgReadyOnce`（lazy 探测 + Promise 缓存）
  - 改为接收 `cloudBaseOptions` 而非 `context`
  - 内部调用 `resolvePgDbContext` 推导
  - 模块级 Promise 缓存，同一 server 生命周期内只探测一次
  - 探测失败抛错，由调用方捕获返回 `PG_NOT_READY` 错误码
  - _需求: 需求 3_

- [x] 6. 改造所有业务 handler 和工具 handler 调用链
  - `queryPgDatabase` handler：调用 `resolvePgDbContext` 替代 `getPgContext`，需要 SQL 的 action 先 `ensurePgReadyOnce`
  - `managePgDatabase` handler：同上，`dryRun` 不触发就绪探测
  - `handleQueryContext`：改为返回 `resolvePgDbContext` 推导结果
  - `handleListObjects`/`handleMetadata`/`handleGetPgSchema`/`handleReadOnlySql`/`handleExecuteSql`：参数类型从 `PgRuntimeContext` 改为 `PgDbContext`
  - migration 相关 handler：同上
  - 新增 `PG_NOT_READY` 错误码处理（捕获 `ensurePgReadyOnce` 抛错）
  - _需求: 需求 1, 3, 4_

- [x] 7. 更新 `managePgDatabase` 的 action 描述和 schema
  - `MANAGE_ACTIONS` 描述移除 `init=初始化或绑定 PostgreSQL 上下文；` 段落
  - 工具 description 顶部移除 init 相关说明
  - 保留 `envId`/`instanceId`/`defaultSchema`/`role` 入参（用于 execute/migration 覆盖默认值）
  - _需求: 需求 4, 5_

- [x] 8. 改造测试文件 `databasePG.test.ts`
  - 删除 4 个 init 专属测试用例（76-225 行）
  - 删除 `all PG tools return actionable error before init` 测试（736-767 行）
  - 删除 `contextPath`/`createTempContextPath`/`CLOUDBASE_PG_CONTEXT_PATH` setup（12-17, 57-65 行）
  - 重写 9 处 `action: "init"` 前置调用（227, 269, 330, 369, 487, 542, 611, 690, 720 行），直接调用业务 action
  - 新增 `resolvePgDbContext` 推导优先级测试
  - 新增 `ensurePgReadyOnce` Promise 缓存测试
  - 新增无 init 直接执行业务 action 测试
  - 新增 `action=init` 返回 `UNSUPPORTED_ACTION` 测试
  - _需求: 需求 1, 2, 3, 4_

- [x] 9. 更新冒烟测试 `mcp/scripts/verify-pg-cloud-smoke.mjs`
  - 移除 `action: "init"` 调用（59-67 行）
  - 移除 `"managePgDatabase:init"` 从 verifiedFlow（173 行）
  - _需求: 需求 4_

- [x] 10. 运行单元测试并修复
  - `cd mcp && npm test -- --run databasePG`
  - 修复所有失败的测试
  - 确保无状态架构下所有业务 action 测试通过
  - _需求: 需求 1, 2, 3, 4_

- [x] 11. 重新生成产物（tools.json + mcp-tools.md）
  - `node scripts/generate-tools-json.mjs`
  - `node scripts/generate-tools-doc.mjs`
  - 验证 `scripts/tools.json` 中 `managePgDatabase` 的 action enum 已移除 `"init"`
  - 验证 `doc/mcp-tools.md` 中描述已同步更新
  - _需求: 需求 5_

- [x] 12. 构建并冒烟验证
  - `cd mcp && npm run build`
  - 验证 dist 产物中无 `handleInit` 残留
  - 如有 PG 环境可用，运行 `verify-pg-cloud-smoke.mjs` 冒烟测试
  - _需求: 需求 1, 4, 5_
