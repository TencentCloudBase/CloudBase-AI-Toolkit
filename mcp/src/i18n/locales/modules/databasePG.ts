import { defineModule } from "../types.js";

export const databasePG = defineModule(
  {
    "roleError.guidance":
      "PostgreSQL role \"{role}\" 无法用于 ExecutePGSql（SET ROLE 失败或角色不存在）。不要从环境名或实例名臆造 postgres / postgres_pgdb_* 等角色。平台保留角色（cloudbase_admin）是平台管理账号，不能用于用户调用。请省略 role（默认为 cloudbase_postgres）或传入以下角色之一：{recommended}。要列出本数据库中实际存在的角色，请使用 role=cloudbase_postgres 重试并执行 SQL：SELECT rolname FROM pg_roles ORDER BY rolname;",
    "roleError.retryWithoutCustomRole":
      "省略自定义 role（默认 {defaultRole}）重试，或显式传 role={defaultRole}。",
    "roleError.inspectContext": "重试前请检查自动推导的 PG 上下文（含默认 role）。",
    "queryPgDatabase.title": "查询 PostgreSQL 上下文、对象、元数据或执行只读 SQL",
    "queryPgDatabase.description":
      "查询 CloudBase PostgreSQL 数据库。支持获取当前 PG 上下文、列出带 schema 的数据库对象、读取轻量元数据、检查单个对象结构，以及执行只读 SQL。",
    "managePgDatabase.title": "管理 PostgreSQL 上下文或执行写入 SQL",
    "managePgDatabase.description":
      "管理 CloudBase PostgreSQL：执行已确认的写入 SQL、SQL 风险预检、迁移管理。建表/ALTER/DROP 等 schema 变更必须使用 applyMigration（显式 migrationVersion；成功前自动写入或校验本地 cloudbase/migrations/<version>_<name>.sql，与 CLI tcb db pg migration 一致），不要默认用 execute。execute 主要用于 DML 与 GRANT/RLS 等运维 SQL。",
    "schema.queryAction":
      "操作类型：context=获取当前 PostgreSQL 上下文；objects=列出带 schema 的数据库对象；metadata=获取轻量表元数据；schema=检查单个带 schema 的对象结构；sql=执行只读 SQL",
    "schema.querySql": "action=sql 时使用的只读 SQL",
    "schema.queryObjectName":
      "action=schema 时使用的带 schema 的 PostgreSQL 对象名，例如 public.users",
    "schema.querySchemaFilter":
      "可选的 schema 过滤条件，用于 action=objects 或 action=metadata",
    "schema.queryLimit":
      "可选的摘要数量上限，用于对象、元数据或 SQL 返回行数，默认 20，最大 200。",
    "schema.manageAction":
      "操作类型：execute=执行已确认的写入 SQL（DML/GRANT/RLS；schema DDL 默认拒绝，需 allowDdlViaExecute=true）；dryRun=只分析 SQL 风险不执行；planMigration=预览迁移计划（需 migrationName + migrationVersion + sql；可选 includeAll=true 允许乱序，对齐 CLI --include-all）；applyMigration=应用迁移，建表/改 schema 首选（需 migrationName + migrationVersion + sql + confirm=true；可选 includeAll；本地 SQL 缺失则自动写入 cloudbase/migrations/，内容不一致则 LOCAL_MIGRATION_FILE_MISMATCH fail-closed；成功返回前会轮询 DescribeTaskResult（默认最长 10 分钟，可用 taskPollTimeoutMs / waitForTask 调整）并校验 migrationVersion 已落入远端历史；超时返回 MIGRATION_TASK_TIMEOUT，必须先 describeMigrationTask 再 listMigrations，禁止立刻重推同 version；未落库时返回 success=false 且 errorCode=MIGRATION_NOT_APPLIED）；listMigrations=查询已应用的 Migration 列表（可传 limit/offset 分页）；migrationDetail=查看单条 Migration 详情（需 migrationVersion）；describeMigrationTask=按 TaskId 查询 Push 异步任务状态（DescribeTaskResult：Status/Phase/Reason；需 taskId；用于 waitForTask=false / MIGRATION_TASK_TIMEOUT / 失败诊断，listMigrations 看不到 Reason）；fetchMigration=从远端 history 拉取 SQL 写入本地 cloudbase/migrations/（对齐 CLI tcb db pg migration fetch；可选 migrationVersion 拉单条，省略则全量；force=true 覆盖已存在文件，默认跳过）；repairMigration=修复 Migration 历史记录（需 migrationVersion + migrationName + repairStatus + repairReason）",
    "schema.manageSql":
      "action=execute、dryRun、planMigration、applyMigration 或 repairMigration(applied) 使用的 SQL 语句",
    "schema.manageConfirm": "执行任何写入 SQL 前都需要显式设置为 true。",
    "schema.manageEnvId": "可选的 CloudBase 环境 ID，不传时使用当前 MCP 环境。",
    "schema.manageInstanceId":
      "可选的 PostgreSQL 逻辑实例标识，默认 cloudbase-pg。",
    "schema.manageDefaultSchema": "可选的默认 schema，默认 public。",
    "schema.manageRole":
      "可选的 PostgreSQL role，传给 Manager SDK executePGSql 的 Role（平台会 SET ROLE）。默认 cloudbase_postgres。推荐取值：cloudbase_postgres / anon / authenticated / service_role。不要传 postgres、postgres_pgdb_*、平台保留角色（cloudbase_admin，为平台管理账号不对用户开放）或从环境名臆造的角色；不确定时省略本字段，或先用 cloudbase_postgres 执行 SELECT rolname FROM pg_roles。",
    "schema.manageObjectName":
      "可选的对象名，当前仅用于非 migration 场景。migration 相关操作请使用 migrationName / migrationVersion。",
    "schema.manageMigrationName":
      "plan/apply/repair 必填：migration 名称，小写字母开头，仅允许小写字母和下划线（不允许数字，服务端 PushPGUserMigrations 会拒绝含数字的名称）。",
    "schema.manageMigrationVersion":
      "14 位时间戳 YYYYMMDDHHMMSS。plan/apply/detail/repair 必填；fetchMigration 可选（传入则只拉该条，省略则拉全量远端 history）；禁止由服务端静默生成，避免与本地 cloudbase/migrations/<version>_<name>.sql 分叉。applyMigration 非增量：每次传完整 SQL；终态失败且 listMigrations 未落地时版本号不占用，换新 migrationVersion 重发全量 SQL 即可（同名不同版本不冲突）。",
    "schema.manageRollbackSql": "plan/apply 可选：回滚 SQL 语句。",
    "schema.manageLimit": "list 可选：返回数量上限，1-500，默认 100。",
    "schema.manageOffset": "list 可选：分页偏移，默认 0。",
    "schema.manageLockTimeoutMs":
      "apply 可选：获取数据库锁的最长时间（毫秒），默认 5000。",
    "schema.manageStatementTimeoutMs":
      "apply 可选：单条 SQL 执行最长时间（毫秒），默认 300000。",
    "schema.manageTaskPollTimeoutMs":
      "apply 可选：轮询 DescribeTaskResult 的最长等待（毫秒）。默认 600000（与 CLI tcb db pg migration up 的 10 分钟对齐）。范围 5000-600000。超时后务必先 describeMigrationTask(taskId) 再 listMigrations，禁止立刻重推同 version。",
    "schema.manageWaitForTask":
      "apply 可选，默认 true。设为 false 时 Push 后立即返回 TaskId（errorCode=MIGRATION_TASK_PENDING），由调用方用 describeMigrationTask 轮询任务终态，再用 listMigrations 确认是否落库；适合 MCP host 工具调用超时较短的场景。默认 true 会同步等到任务终态。",
    "schema.manageTaskId":
      "describeMigrationTask 必填：PushPGUserMigrations / applyMigration 返回的 TaskId。用于一次性查询 DescribeTaskResult（Status/Phase/Reason），不轮询等待。",
    "schema.manageRepairStatus":
      "repair 必填：applied=标记为已应用（可补录 Query），reverted=删除 history 记录。",
    "schema.manageRepairReason": "repair 必填：修复原因。",
    "schema.manageForce":
      "fetchMigration 可选，默认 false。true=覆盖本地已存在的同名 SQL 文件（对齐 CLI tcb db pg migration fetch --force）；false=跳过已存在文件。用于从远端 history 重新对齐 Git checksum。",
    "schema.manageIncludeAll":
      "planMigration / applyMigration 可选，默认 false。true=允许 out-of-order（version 小于远端 LatestVersion）仍可 Preview/Push，对齐 CLI tcb db pg migration up --include-all；仅在确认要补历史/乱序迁移时使用，日常应选更大的 migrationVersion。",
    "schema.manageAllowDdlViaExecute":
      "可选，默认 false。仅当需要故意绕过 migration history 时设为 true，才允许 schema DDL 走 execute；正常建表/改 schema 必须用 applyMigration。",
    "runtime.probeFailed": "PostgreSQL 在 {maxAttempts} 次探测后仍未就绪。最近错误：{reason}",
    "runtime.notReady": "CloudBase PostgreSQL 尚未就绪。{reason}",
    "runtime.queryEnvInfo": "检查当前环境 PostgreSQL 实例状态。",
    "runtime.notProvisioned":
      "环境 {envId} 未开通 CloudBase PostgreSQL（EnvInfo.RuntimeBackends.postgresql=false），queryPgDatabase / managePgDatabase 的所有 action 均不可用。请先为该环境开通 PostgreSQL，或改用该环境实际可用的数据后端；在开通前不要重试 PG 工具。",
    "runtime.confirmBackends":
      "查询环境信息，确认 RuntimeBackends 中实际可用的数据后端。",
    "runtime.noExecutePgSql":
      "当前 @cloudbase/manager-node 运行时未暴露 database.executePGSql 或 commonService 回退。请升级到 @cloudbase/manager-node >= 5.4.0。",
    "runtime.noMigrationApi":
      "当前 @cloudbase/manager-node 运行时不支持迁移 API。请升级到 @cloudbase/manager-node >= 5.4.0。",
    "queryContext.resolved": "已解析当前 CloudBase PostgreSQL 上下文（自动推导）。",
    "queryContext.listObjectsFirst": "检查单个表前，先列出带 schema 的数据库对象。",
    "listObjects.listed":
      "已列出 {count} 个带 schema 的 PostgreSQL 对象。编写 SQL 前请先查看某个对象的结构。",
    "listObjects.none": "当前过滤条件下没有匹配的 PostgreSQL 对象。",
    "listObjects.inspectFirst": "查询数据前，请先查看最相关对象的结构。",
    "listObjects.recheckContext": "如果没有按预期返回对象，请重新检查当前 PG 上下文。",
    "metadata.summarized":
      "已汇总 {count} 个 PostgreSQL 对象的行数与 RLS 提示。编写 join 或变更语句前请先查看 schema。",
    "metadata.none": "当前元数据过滤条件下没有匹配的 PostgreSQL 对象。",
    "metadata.inspectTable": "请查看相关表结构以确认列、主键和策略。",
    "metadata.listObjectsFirst": "如果 metadata 为空或限制过严，请先列出对象。",
    "schema.nameRequired":
      "queryPgDatabase(action=schema) 需要带 schema 的对象名，例如 public.users。",
    "schema.notFound": "在当前 CloudBase PG 上下文中未找到 PostgreSQL 对象 {objectName}。",
    "schema.rlsNoPolicies":
      "已解析 PostgreSQL 的结构、主键、索引与安全详情。警告：RLS 已启用但未找到任何 policy；在创建策略或关闭 RLS 之前，浏览器/客户端的读写都会被拒绝。",
    "schema.resolved": "已解析 PostgreSQL 的结构、主键、索引与安全详情。编写多表 SQL 前请先使用该结构。",
    "schema.createPolicies":
      "在浏览器端 app.rdb() CRUD 前，请创建 SELECT/INSERT/UPDATE/DELETE 的 RLS 策略或关闭 RLS。",
    "schema.checkNearby": "更复杂的查询前，请检查相邻表的行数与 RLS 提示。",
    "schema.runFocusedQuery": "已了解 schema，现在可以运行聚焦的只读查询。",
    "schema.listObjects": "列出带 schema 的对象以找到正确的表或视图名。",
    "readOnly.sqlRequired": "action=sql 时必须提供只读 SQL 语句。",
    "readOnly.readOnlyOnly":
      "queryPgDatabase(action=sql) 仅接受只读 SQL。DDL/DML（CREATE/ALTER/INSERT/UPDATE/DELETE 等）请调用 managePgDatabase(action=execute) 并携带 confirm=true 与相同 SQL。",
    "readOnly.reissueViaManage":
      "请通过 managePgDatabase(action=execute) 并 confirm=true 重新执行该语句。",
    "readOnly.inspectSchemaBeforeWrite": "如果还在决定需要哪种写操作，请先查看 schema。",
    "readOnly.execFailed": "PostgreSQL 只读 SQL 执行失败：{reason}",
    "readOnly.truncated": "只读 SQL 执行成功。为控制 token 消耗，仅显示 {shown}/{total} 行。",
    "readOnly.success": "只读 SQL 执行成功。",
    "readOnly.refine": "如需调整 join、过滤或变更，请查看表结构。",
    "execute.sqlRequired": "action=execute 时必须提供 SQL 语句。",
    "execute.ddlUseApplyMigration":
      "Schema DDL（CREATE/ALTER/DROP/TRUNCATE 等）必须使用显式 migrationVersion 的 applyMigration，而不是 execute。请先写入本地 cloudbase/migrations/<version>_<name>.sql，再调用 applyMigration。仅对有意绕过迁移历史的一次性运维操作设置 allowDdlViaExecute=true。",
    "execute.previewAsMigration":
      "请将 schema 变更预览为带版本的迁移（提供 migrationVersion + migrationName）。",
    "execute.applyViaPush":
      "请通过 PushPGUserMigrations 应用 schema 变更，并使用相同的显式 migrationVersion。",
    "execute.confirmRequired":
      "该 SQL 被判定为 {risk}。请携带相同 sql 与 confirm=true 重新执行 managePgDatabase(action=execute) 以继续。",
    "execute.reissueWithConfirm": "请携带 confirm=true 重新执行以真正运行该 SQL。",
    "execute.inspectBeforeDestructive": "破坏性变更前请先查看表大小与结构。",
    "execute.execFailed": "PostgreSQL SQL 执行失败：{reason}",
    "execute.ddlBypassWarning":
      "通过 allowDdlViaExecute 执行的 DDL 绕过了迁移历史。可复现的 schema 变更请优先使用 applyMigration。",
    "execute.successDdlBypass":
      "写入 SQL 执行成功（DDL 经 allowDdlViaExecute；已绕过迁移历史）。",
    "execute.success": "写入 SQL 执行成功。",
    "execute.inspectAfterSchema": "schema 变更后请检查表结构、列、索引与 RLS 策略。",
    "execute.verifyMutation": "请用聚焦的只读 SQL 查询验证变更结果。",
    "dryRun.sqlRequired": "action=dryRun 时必须提供 SQL 语句。",
    "dryRun.readOnlyDone":
      "SQL 试运行完成。该语句为只读；请使用 queryPgDatabase(action=sql) 执行它。",
    "dryRun.executeViaQuery": "请通过 queryPgDatabase 执行该只读 SQL。",
    "dryRun.schemaDdlDone":
      "SQL 试运行完成。Schema DDL 应使用显式 migrationVersion 的 applyMigration，而不是 execute。",
    "dryRun.applyViaMigration":
      "请通过带版本的迁移应用 schema DDL（提供 migrationVersion + migrationName + confirm=true）。",
    "dryRun.writeDone":
      "SQL 试运行完成。写入 SQL 需要 managePgDatabase(action=execute, confirm=true)。",
    "dryRun.executeAfterConfirm": "仅在显式确认后才执行写入 SQL。",
    "migration.nameRule":
      "migrationName 仅允许小写字母和下划线（不允许数字——服务端 PushPGUserMigrations 会以 \"Name 只允许小写字母和下划线\" 拒绝数字字符）。请用下划线代替数字，例如 add_user_table_v2。",
    "migration.nameInvalid":
      "action={action} 时 migrationName \"{name}\" 无效。{rule}",
    "migration.versionRule":
      "migrationVersion 必填（14 位 UTC 时间戳 YYYYMMDDHHMMSS）。请先确定版本，写入本地文件 cloudbase/migrations/<version>_<migrationName>.sql，然后用相同的 migrationVersion 与 migrationName 调用 planMigration/applyMigration。",
    "migration.versionRequired":
      "action={action} 时必须提供 migrationVersion。{rule}",
    "migration.taskIdRequired":
      "action=describeMigrationTask 时必须提供 taskId（来自 applyMigration Push / MIGRATION_TASK_PENDING / MIGRATION_TASK_TIMEOUT 的 data.taskResult.TaskId）。",
    "localFile.readFailed": "读取本地迁移文件 {path} 失败：{reason}",
    "localFile.mismatch":
      "本地迁移文件 {path} 已存在，但其内容与 sql 参数不一致。拒绝覆盖（fail-closed）。请更新本地文件使其一致，或使用新的 migrationVersion / migrationName。Push 未提交。",
    "localFile.writeFailed":
      "在工作区 {root} 下写入本地迁移文件 {path} 失败：{reason}。Push 未提交。请修复工作区权限或手动写入该文件，然后重试 applyMigration。",
    "localFile.fetchWriteFailed": "在工作区 {root} 下写入本地迁移文件 {path} 失败：{reason}",
    "localFile.invalidRemoteName":
      "远端迁移名称 \"{name}\"（version={version}）无效。名称必须匹配 /^[a-z][a-z_]*$/（与 applyMigration.migrationName 相同，不含数字）。请修复远端历史记录后重试 fetchMigration。",
    "localFile.invalidRemoteVersion":
      "远端迁移版本号 \"{version}\"（name={name}）无效。版本号必须匹配 /^\\d{14}$/（YYYYMMDDHHMMSS，与 applyMigration.migrationVersion 相同）。请修复远端历史记录后重试 fetchMigration。",
    "localFile.emptyQuery":
      "DescribePGUserMigration 对 version={version}（{name}）返回了空 Query。拒绝写入空的本地迁移文件（会污染 Git checksum）。",
    "localFile.hydrateEmptyQuery":
      "DescribePGUserMigration 对 version={version}（{name}）返回了空 Query。无法为 PushPGUserMigrations 补全远端历史。",
    "fetch.none": "没有可拉取的远端迁移。本地 cloudbase/migrations/ 未变化。",
    "fetch.fetched":
      "已拉取 {total} 条远端迁移：写入 {written} 条，跳过 {skipped} 条{suffix}。目录：{dir}/。",
    "fetch.forceHint": "（已有文件保持不变；传入 force=true 可覆盖，对齐 CLI --force）",
    "fetch.rerunWithForce":
      "使用 force=true 重新执行，从远端历史覆盖被跳过的本地文件（重新对齐 checksum）。",
    "fetch.failed": "fetchMigration 失败：{reason}",
    "payloadSource.noRemoteHistory": "无远端历史",
    "payloadSource.localCovered":
      "本地文件树已覆盖 {count} 条远端迁移（CLI 对齐，跳过 Describe 补全）",
    "payloadSource.hydrated": "通过 Describe 补全了 {count} 条远端迁移（本地文件树不完整）",
    "task.pollTimeout":
      "DescribeTaskResult 在 {seconds}s 后超时（TaskId={taskId}，最后 Status={status}，Phase={phase}）。",
    "task.pendingFirst":
      "请先轮询 DescribeTaskResult 获取 Status/Phase/Reason。仅靠 listMigrations 无法解释 Failed 任务（见 issue #857）。",
    "task.checkLanded": "请检查 migrationVersion 是否已落入远端历史。任务可能仍在运行时，禁止重推同一版本。",
    "task.inspectDetail":
      "如果 listMigrations 已显示该版本，请查看已应用的记录。若数分钟后仍缺失且任务已 Failed/终止，请先检查 Conflicts/SQL，再考虑新的 migrationVersion。",
    "task.succeedConfirm": "任务成功——执行依赖 SQL 前，请确认 migrationVersion 已存在于远端历史。",
    "task.inspectApplied": "请查看已应用的迁移记录。",
    "task.failedFixFirst":
      "请确认该版本不在历史中，然后修复 Conflicts/SQL 并使用新的 migrationVersion 重试（不要盲目重推失败版本）。",
    "task.stillRunning": "任务仍在运行——请稍后再次轮询。禁止重推同一 migrationVersion。",
    "task.optionallyCheck": "可选：在状态尚未终止时，检查该版本是否已落库。",
    "planMigration.sqlRequired": "action=planMigration 时必须提供迁移 SQL。",
    "planMigration.nameRequired":
      "action=planMigration 时必须提供 migrationName（小写字母和下划线，字母开头）。",
    "planMigration.executable":
      "已通过 PreviewPGUserMigrations 生成迁移计划（{source}{includeAll}）。请在 applyMigration 复用 migrationVersion={version}。请确保本地文件 {localFileHint} 存在且内容一致。",
    "planMigration.notExecutable":
      "迁移计划不可执行（PreviewPGUserMigrations.Executable=false，{source}{includeAll}）。applyMigration 前请检查 apiResult.Conflicts。常见原因：版本旧于远端最新版本（{latest}）——如确有意乱序，请携带 includeAll=true（CLI --include-all）重试，或选择更新的版本；checksum 不一致。",
    "planMigration.reviewPlan":
      "请检查上方计划。确认无误后，使用相同 migrationVersion 调用 applyMigration。",
    "planMigration.resolveConflicts":
      "请解决 Conflicts（通常选择比 LatestVersion 更新的 migrationVersion，或设置 includeAll=true 表示有意乱序），然后重试 planMigration/applyMigration。",
    "planMigration.failed": "PreviewPGUserMigrations 失败：{reason}",
    "applyMigration.sqlRequired": "action=applyMigration 时必须提供迁移 SQL。",
    "applyMigration.nameRequired":
      "action=applyMigration 时必须提供 migrationName（小写字母和下划线，字母开头）。",
    "applyMigration.confirmRequired":
      "PushPGUserMigrations 需要 confirm=true。请携带 confirm=true 重新执行以继续。",
    "applyMigration.previewAgain":
      "将本地 SQL 文件与 sql 参数对齐后（或选择新的 migrationVersion），请重新 preview。",
    "applyMigration.notExecutable":
      "PreviewPGUserMigrations 报告 migrationVersion={version} Executable=false（远端最新={latest}，{source}，includeAll={includeAll}）。Push 未提交。请检查 previewResult.Conflicts——常见原因：local_migration_before_latest_remote（选择更新的 14 位版本，或设置 includeAll=true / CLI --include-all 表示有意乱序）或 checksum_mismatch。若 schema 变更紧急，可退回 action=execute 并 allowDdlViaExecute=true，但这会绕过迁移历史。",
    "applyMigration.checkLatest":
      "请检查 LatestVersion，并选择严格更新的 migrationVersion。",
    "applyMigration.rerunPlan":
      "调整 migrationVersion/SQL（或为有意乱序设置 includeAll=true）后，请重新运行 planMigration。",
    "applyMigration.taskPending":
      "PushPGUserMigrations 已受理 TaskId={taskId}（waitForTask=false）。TaskId 仅代表受理，不代表已应用。请先调用 action=describeMigrationTask 查询 Status/Phase/Reason，再用 listMigrations 确认 migrationVersion={version} 是否已落库。任务可能仍在运行时，禁止重推同一版本。",
    "applyMigration.taskTimeout":
      "PushPGUserMigrations 返回 TaskId={taskId}，但等待 DescribeTaskResult 在 {seconds}s 后超时：{reason}。迁移可能仍在后台运行（大 DDL / 锁等待）。请先调用 action=describeMigrationTask（Status/Phase/Reason），再用 listMigrations。禁止重推同一 migrationVersion，也不要在任务终止且 listMigrations 确认版本缺失前退回 execute。",
    "applyMigration.taskFailed":
      "PushPGUserMigrations TaskId={taskId} 在 phase={phase} 失败：{reason}。迁移未生效。请修复 Conflicts/SQL（或使用更新的 migrationVersion），然后重试 applyMigration。紧急绕过：action=execute 并 allowDdlViaExecute=true（跳过迁移历史）。",
    "applyMigration.previewConflicts": "重试 apply 前，请再次 preview 以检查 Conflicts。",
    "applyMigration.confirmAbsent": "请确认该版本仍不存在于远端历史中。",
    "applyMigration.notApplied":
      "PushPGUserMigrations 已完成（TaskId={taskId}），但 migrationVersion={version} 未出现在远端迁移历史中，迁移未生效。请不要假定 schema 变更已应用。请复查 SQL 与 migrationVersion，用 action=migrationDetail 检查该迁移，并重试 action=applyMigration。若 schema 变更紧急，可退回 action=execute 并 allowDdlViaExecute=true，但这会绕过迁移历史。",
    "applyMigration.confirmMissing": "请检查远端迁移历史，确认迁移确实缺失。",
    "applyMigration.inspectBackend": "请检查该 migrationVersion 的后端记录，找出未应用的原因。",
    "applyMigration.verifyFailed":
      "PushPGUserMigrations 已提交，但对 migrationVersion={version} 的远端历史校验失败：{reason}。迁移可能已应用也可能未应用——运行任何依赖 SQL 前，请先用 action=listMigrations 验证。",
    "applyMigration.manuallyVerify": "请手动验证远端迁移历史是否记录了该 migrationVersion。",
    "applyMigration.success":
      "迁移已通过 PushPGUserMigrations 应用（{source}{includeAll}），任务{task}已校验存在于远端迁移历史。本地 SQL 已{localAction}：{localPath}。",
    "applyMigration.localWritten": "写入",
    "applyMigration.localMatched": "匹配",
    "applyMigration.failed": "PushPGUserMigrations 失败：{reason}",
    "listMigrations.success": "已通过 ListPGUserMigrations 获取迁移列表。",
    "listMigrations.failed": "ListPGUserMigrations 失败：{reason}",
    "migrationDetail.versionRequired":
      "action=migrationDetail 时必须提供 migrationVersion（14 位时间戳 YYYYMMDDHHMMSS）。",
    "migrationDetail.success": "已通过 DescribePGUserMigration 获取迁移详情。",
    "migrationDetail.failed": "DescribePGUserMigration 失败：{reason}",
    "describeTask.succeed":
      "DescribeTaskResult TaskId={taskId} Status=Succeed（Phase={phase}）。在将 schema 视为已应用前，请先用 listMigrations 验证。",
    "describeTask.failed":
      "DescribeTaskResult TaskId={taskId} Status=Failed（phase={phase}）：{reason}。请先修复 Conflicts/SQL，禁止重推同一 migrationVersion。",
    "describeTask.running":
      "DescribeTaskResult TaskId={taskId} Status={status} Phase={phase}。任务尚未终止——请再次轮询；禁止重推。",
    "describeTask.failedApi":
      "TaskId={taskId} 的 DescribeTaskResult 失败：{reason}",
    "repair.versionRequired":
      "action=repairMigration 时必须提供 migrationVersion（14 位时间戳 YYYYMMDDHHMMSS）。",
    "repair.nameRequired": "action=repairMigration 时必须提供 migrationName。",
    "repair.statusRequired":
      "action=repairMigration 时必须提供 repairStatus（applied 或 reverted）。",
    "repair.reasonRequired": "action=repairMigration 时必须提供 repairReason。",
    "repair.sqlRequired":
      "action=repairMigration 且 repairStatus=applied 时必须提供 sql（Query）。",
    "repair.success": "已通过 RepairPGUserMigrationHistory 修复迁移历史。",
    "repair.failed": "RepairPGUserMigrationHistory 失败：{reason}",
    "unsupportedQueryAction": "不支持的 PostgreSQL 查询 action：{action}",
    "unsupportedManageAction": "不支持的 PostgreSQL 管理 action：{action}",
    "unsupportedAction": "不支持的 action：{action}",
  },
  {
    "roleError.guidance":
      "PostgreSQL role \"{role}\" cannot be used with ExecutePGSql (SET ROLE failed or role does not exist). Do not invent roles like postgres / postgres_pgdb_* from env or instance names. Platform-reserved roles (cloudbase_admin) are the platform management account and must not be used by user calls. Omit role (defaults to cloudbase_postgres) or pass one of: {recommended}. To list roles that exist in this database, retry with role=cloudbase_postgres and SQL: SELECT rolname FROM pg_roles ORDER BY rolname;",
    "roleError.retryWithoutCustomRole":
      "Retry without a custom role (defaults to {defaultRole}), or pass role={defaultRole} explicitly.",
    "roleError.inspectContext":
      "Inspect the auto-derived PG context (includes default role) before retrying.",
    "queryPgDatabase.title":
      "Query PostgreSQL context, objects, metadata, or run read-only SQL",
    "queryPgDatabase.description":
      "Query the CloudBase PostgreSQL database. Supports getting the current PG context, listing schema-qualified database objects, reading lightweight metadata, inspecting a single object schema, and running read-only SQL.",
    "managePgDatabase.title": "Manage PostgreSQL context or run write SQL",
    "managePgDatabase.description":
      "Manage CloudBase PostgreSQL: run confirmed write SQL, pre-check SQL risk, and manage migrations. Schema changes such as CREATE TABLE/ALTER/DROP must use applyMigration (explicit migrationVersion; the local cloudbase/migrations/<version>_<name>.sql file is written or verified automatically before success, matching the CLI tcb db pg migration). Do not use execute by default. execute is mainly for DML and ops SQL such as GRANT/RLS.",
    "schema.queryAction":
      "Action type: context=get the current PostgreSQL context; objects=list schema-qualified database objects; metadata=get lightweight table metadata; schema=inspect a single schema-qualified object structure; sql=run read-only SQL",
    "schema.querySql": "Read-only SQL used when action=sql",
    "schema.queryObjectName":
      "Schema-qualified PostgreSQL object name used when action=schema, e.g. public.users",
    "schema.querySchemaFilter":
      "Optional schema filter, used with action=objects or action=metadata",
    "schema.queryLimit":
      "Optional cap on summary size, applied to objects, metadata, or SQL result rows. Defaults to 20, maximum 200.",
    "schema.manageAction":
      "Action type: execute=run confirmed write SQL (DML/GRANT/RLS; schema DDL is rejected by default and requires allowDdlViaExecute=true); dryRun=analyze SQL risk without executing; planMigration=preview a migration plan (requires migrationName + migrationVersion + sql; optional includeAll=true allows out-of-order, matching CLI --include-all); applyMigration=apply a migration, the preferred path for CREATE TABLE / schema changes (requires migrationName + migrationVersion + sql + confirm=true; optional includeAll; a missing local SQL file is written to cloudbase/migrations/ automatically, while mismatched content fails closed with LOCAL_MIGRATION_FILE_MISMATCH; before returning success it polls DescribeTaskResult (up to 10 minutes by default, tunable via taskPollTimeoutMs / waitForTask) and verifies migrationVersion landed in the remote history; on timeout it returns MIGRATION_TASK_TIMEOUT and you must call describeMigrationTask before listMigrations — never re-push the same version immediately; when the version did not land it returns success=false with errorCode=MIGRATION_NOT_APPLIED); listMigrations=list applied migrations (supports limit/offset paging); migrationDetail=inspect a single migration (requires migrationVersion); describeMigrationTask=query the async Push task status by TaskId (DescribeTaskResult: Status/Phase/Reason; requires taskId; use it for waitForTask=false / MIGRATION_TASK_TIMEOUT / failure diagnosis, because listMigrations does not expose Reason); fetchMigration=pull SQL from the remote history into local cloudbase/migrations/ (matches CLI tcb db pg migration fetch; optional migrationVersion pulls a single record, omitting it pulls everything; force=true overwrites existing files, skipped by default); repairMigration=repair the migration history record (requires migrationVersion + migrationName + repairStatus + repairReason)",
    "schema.manageSql":
      "SQL statement used when action=execute, dryRun, planMigration, applyMigration, or repairMigration(applied)",
    "schema.manageConfirm":
      "Must be explicitly set to true before running any write SQL.",
    "schema.manageEnvId":
      "Optional CloudBase environment ID; the current MCP environment is used when omitted.",
    "schema.manageInstanceId":
      "Optional PostgreSQL logical instance identifier, defaults to cloudbase-pg.",
    "schema.manageDefaultSchema":
      "Optional default schema, defaults to public.",
    "schema.manageRole":
      "Optional PostgreSQL role, passed as Role to the Manager SDK executePGSql (the platform issues SET ROLE). Defaults to cloudbase_postgres. Recommended values: cloudbase_postgres / anon / authenticated / service_role. Do not pass postgres, postgres_pgdb_*, platform-reserved roles (cloudbase_admin, the platform management account that is not exposed to users), or roles invented from the environment name; when unsure omit this field, or first run SELECT rolname FROM pg_roles with cloudbase_postgres.",
    "schema.manageObjectName":
      "Optional object name, currently only used for non-migration scenarios. For migration actions use migrationName / migrationVersion instead.",
    "schema.manageMigrationName":
      "Required for plan/apply/repair: migration name starting with a lowercase letter, containing only lowercase letters and underscores (no digits — the server-side PushPGUserMigrations rejects names containing digits).",
    "schema.manageMigrationVersion":
      "14-digit timestamp YYYYMMDDHHMMSS. Required for plan/apply/detail/repair; optional for fetchMigration (passing it pulls only that record, omitting it pulls the full remote history). It must never be generated silently by the server, to avoid diverging from the local cloudbase/migrations/<version>_<name>.sql file. applyMigration is not incremental: send the complete SQL every time; when a task fails terminally and listMigrations shows the version did not land, that version is not consumed — just pick a new migrationVersion and re-send the full SQL (the same name with a different version does not conflict).",
    "schema.manageRollbackSql": "Optional for plan/apply: rollback SQL statement.",
    "schema.manageLimit":
      "Optional for list: maximum number of records returned, 1-500, defaults to 100.",
    "schema.manageOffset": "Optional for list: paging offset, defaults to 0.",
    "schema.manageLockTimeoutMs":
      "Optional for apply: maximum time to acquire the database lock in milliseconds, defaults to 5000.",
    "schema.manageStatementTimeoutMs":
      "Optional for apply: maximum execution time per SQL statement in milliseconds, defaults to 300000.",
    "schema.manageTaskPollTimeoutMs":
      "Optional for apply: maximum wait while polling DescribeTaskResult, in milliseconds. Defaults to 600000 (matching the 10 minutes of CLI tcb db pg migration up). Range 5000-600000. After a timeout always call describeMigrationTask(taskId) before listMigrations, and never re-push the same version immediately.",
    "schema.manageWaitForTask":
      "Optional for apply, defaults to true. When set to false, Push returns the TaskId immediately (errorCode=MIGRATION_TASK_PENDING) and the caller polls the task to a terminal state with describeMigrationTask, then confirms with listMigrations whether it landed; useful when the MCP host has a short tool-call timeout. The default true waits synchronously for the terminal state.",
    "schema.manageTaskId":
      "Required for describeMigrationTask: the TaskId returned by PushPGUserMigrations / applyMigration. Used for a one-shot DescribeTaskResult query (Status/Phase/Reason) without polling.",
    "schema.manageRepairStatus":
      "Required for repair: applied=mark as applied (Query can be backfilled), reverted=delete the history record.",
    "schema.manageRepairReason": "Required for repair: the repair reason.",
    "schema.manageForce":
      "Optional for fetchMigration, defaults to false. true=overwrite the existing local SQL file with the same name (matching CLI tcb db pg migration fetch --force); false=skip existing files. Use it to realign Git checksums from the remote history.",
    "schema.manageIncludeAll":
      "Optional for planMigration / applyMigration, defaults to false. true=allow out-of-order versions (older than the remote LatestVersion) to still Preview/Push, matching CLI tcb db pg migration up --include-all; use it only when intentionally backfilling or applying out-of-order migrations — normally pick a larger migrationVersion instead.",
    "schema.manageAllowDdlViaExecute":
      "Optional, defaults to false. Set it to true only when intentionally bypassing migration history, which is the only case where schema DDL is allowed through execute; normal CREATE TABLE / schema changes must use applyMigration.",
    "runtime.probeFailed":
      "PostgreSQL is not ready after {maxAttempts} attempts. Last error: {reason}",
    "runtime.notReady": "CloudBase PostgreSQL is not ready. {reason}",
    "runtime.queryEnvInfo":
      "Check the current environment's PostgreSQL instance status.",
    "runtime.notProvisioned":
      "CloudBase PostgreSQL is not provisioned for environment {envId} (EnvInfo.RuntimeBackends.postgresql=false), so no queryPgDatabase / managePgDatabase action is available. Provision PostgreSQL for this environment first, or use a data backend that this environment actually has; do not retry the PG tools before it is provisioned.",
    "runtime.confirmBackends":
      "Query environment info to confirm which data backends are actually available in RuntimeBackends.",
    "runtime.noExecutePgSql":
      "Current @cloudbase/manager-node runtime does not expose database.executePGSql or commonService fallback. Upgrade to @cloudbase/manager-node >= 5.4.0.",
    "runtime.noMigrationApi":
      "Current @cloudbase/manager-node runtime does not support migration APIs. Upgrade to @cloudbase/manager-node >= 5.4.0.",
    "queryContext.resolved":
      "Resolved current CloudBase PostgreSQL context (auto-derived).",
    "queryContext.listObjectsFirst":
      "List schema-qualified objects before inspecting an individual table.",
    "listObjects.listed":
      "Listed {count} schema-qualified PostgreSQL objects. Inspect one object schema before writing SQL.",
    "listObjects.none": "No PostgreSQL objects matched the current filter.",
    "listObjects.inspectFirst":
      "Inspect the most relevant object schema before querying data.",
    "listObjects.recheckContext":
      "Re-check the current PG context if no objects were expectedly returned.",
    "metadata.summarized":
      "Summarized {count} PostgreSQL objects with row-count and RLS hints. Use schema inspection before composing joins or mutations.",
    "metadata.none":
      "No PostgreSQL objects matched the current metadata filter.",
    "metadata.inspectTable":
      "Inspect the relevant table schema to confirm columns, keys, and policies.",
    "metadata.listObjectsFirst":
      "List objects first if metadata is empty or too restrictive.",
    "schema.nameRequired":
      "queryPgDatabase(action=schema) requires a schema-qualified object name like public.users.",
    "schema.notFound":
      "PostgreSQL object {objectName} was not found in the current CloudBase PG context.",
    "schema.rlsNoPolicies":
      "Resolved PostgreSQL schema, key, index, and security details. WARNING: RLS is enabled but no policies were found; browser/client reads and writes will be denied until policies are created or RLS is disabled.",
    "schema.resolved":
      "Resolved PostgreSQL schema, key, index, and security details. Use this structure before composing multi-table SQL.",
    "schema.createPolicies":
      "Create SELECT/INSERT/UPDATE/DELETE RLS policies or disable RLS before browser-side app.rdb() CRUD.",
    "schema.checkNearby":
      "Check row-count and RLS hints for nearby tables before more complex queries.",
    "schema.runFocusedQuery":
      "Run a focused read-only query now that the schema is known.",
    "schema.listObjects":
      "List schema-qualified objects to find the correct table or view name.",
    "readOnly.sqlRequired":
      "Provide a read-only SQL statement when action=sql.",
    "readOnly.readOnlyOnly":
      "queryPgDatabase(action=sql) only accepts read-only SQL. For DDL/DML (CREATE/ALTER/INSERT/UPDATE/DELETE/...), call managePgDatabase(action=execute) with confirm=true and the same SQL.",
    "readOnly.reissueViaManage":
      "Re-issue this statement via managePgDatabase(action=execute) with confirm=true.",
    "readOnly.inspectSchemaBeforeWrite":
      "Inspect schema first if you are deciding which write operation is needed.",
    "readOnly.execFailed":
      "PostgreSQL read-only SQL execution failed: {reason}",
    "readOnly.truncated":
      "Read-only SQL executed successfully. Showing {shown} of {total} rows to control token usage.",
    "readOnly.success": "Read-only SQL executed successfully.",
    "readOnly.refine":
      "Inspect the table schema if you need to refine joins, filters, or mutations.",
    "execute.sqlRequired": "Provide a SQL statement when action=execute.",
    "execute.ddlUseApplyMigration":
      "Schema DDL (CREATE/ALTER/DROP/TRUNCATE/...) must use applyMigration with an explicit migrationVersion, not execute. Write local cloudbase/migrations/<version>_<name>.sql first, then call applyMigration. Set allowDdlViaExecute=true only for exceptional one-off ops that intentionally bypass migration history.",
    "execute.previewAsMigration":
      "Preview the schema change as a versioned migration (provide migrationVersion + migrationName).",
    "execute.applyViaPush":
      "Apply the schema change via PushPGUserMigrations with the same explicit migrationVersion.",
    "execute.confirmRequired":
      "This SQL is classified as {risk}. Re-run managePgDatabase(action=execute) with the same sql and confirm=true to proceed.",
    "execute.reissueWithConfirm":
      "Re-issue with confirm=true to actually run the SQL.",
    "execute.inspectBeforeDestructive":
      "Inspect table size and shape before destructive changes.",
    "execute.execFailed": "PostgreSQL SQL execution failed: {reason}",
    "execute.ddlBypassWarning":
      "DDL executed via allowDdlViaExecute bypasses migration history. Prefer applyMigration for reproducible schema changes.",
    "execute.successDdlBypass":
      "Write SQL executed successfully (DDL via allowDdlViaExecute; migration history was bypassed).",
    "execute.success": "Write SQL executed successfully.",
    "execute.inspectAfterSchema":
      "Inspect the table schema, columns, indexes, and RLS policies after schema changes.",
    "execute.verifyMutation":
      "Verify the mutation with a focused read-only SQL query.",
    "dryRun.sqlRequired": "Provide a SQL statement when action=dryRun.",
    "dryRun.readOnlyDone":
      "SQL dry run completed. This statement is read-only; use queryPgDatabase(action=sql) to execute it.",
    "dryRun.executeViaQuery":
      "Execute the read-only SQL through queryPgDatabase.",
    "dryRun.schemaDdlDone":
      "SQL dry run completed. Schema DDL should use applyMigration with an explicit migrationVersion, not execute.",
    "dryRun.applyViaMigration":
      "Apply schema DDL via versioned migration (provide migrationVersion + migrationName + confirm=true).",
    "dryRun.writeDone":
      "SQL dry run completed. Write SQL requires managePgDatabase(action=execute, confirm=true).",
    "dryRun.executeAfterConfirm":
      "Execute the write SQL only after explicit confirmation.",
    "migration.nameRule":
      "migrationName must start with a lowercase letter and contain only lowercase letters and underscores (no digits — the PushPGUserMigrations API rejects digit characters with \"Name 只允许小写字母和下划线\"). Use underscores instead of digits, e.g. add_user_table_v2.",
    "migration.nameInvalid":
      "Invalid migrationName \"{name}\" when action={action}. {rule}",
    "migration.versionRule":
      "migrationVersion is required (14-digit UTC timestamp YYYYMMDDHHMMSS). Decide the version first, write local file cloudbase/migrations/<version>_<migrationName>.sql, then call planMigration/applyMigration with the same migrationVersion and migrationName.",
    "migration.versionRequired":
      "Provide migrationVersion when action={action}. {rule}",
    "migration.taskIdRequired":
      "Provide taskId when action=describeMigrationTask (from applyMigration Push / MIGRATION_TASK_PENDING / MIGRATION_TASK_TIMEOUT data.taskResult.TaskId).",
    "localFile.readFailed":
      "Failed to read existing local migration file {path}: {reason}",
    "localFile.mismatch":
      "Local migration file {path} already exists but its content does not match the sql argument. Refuse to overwrite (fail closed). Update the local file to match, or use a new migrationVersion / migrationName. Push was NOT submitted.",
    "localFile.writeFailed":
      "Failed to write local migration file {path} under workspace {root}: {reason}. Push was NOT submitted. Fix workspace permissions or write the file manually, then retry applyMigration.",
    "localFile.fetchWriteFailed":
      "Failed to write local migration file {path} under workspace {root}: {reason}",
    "localFile.invalidRemoteName":
      "Remote migration name \"{name}\" (version={version}) is invalid. Names must match /^[a-z][a-z_]*$/ (same as applyMigration.migrationName, no digits). Repair the remote history record, then retry fetchMigration.",
    "localFile.invalidRemoteVersion":
      "Remote migration version \"{version}\" (name={name}) is invalid. Versions must match /^\\d{14}$/ (YYYYMMDDHHMMSS, same as applyMigration.migrationVersion). Repair the remote history record, then retry fetchMigration.",
    "localFile.emptyQuery":
      "DescribePGUserMigration returned empty Query for version={version} ({name}). Refuse to write an empty local migration file (would poison Git checksums).",
    "localFile.hydrateEmptyQuery":
      "DescribePGUserMigration returned empty Query for version={version} ({name}). Cannot hydrate remote history for PushPGUserMigrations.",
    "fetch.none":
      "No remote migrations to fetch. Local cloudbase/migrations/ unchanged.",
    "fetch.fetched":
      "Fetched {total} remote migration(s): wrote {written}, skipped {skipped}{suffix}. Directory: {dir}/.",
    "fetch.forceHint":
      " (existing files left untouched; pass force=true to overwrite, matching CLI --force)",
    "fetch.rerunWithForce":
      "Re-run with force=true to overwrite skipped local files from remote history (checksum realign).",
    "fetch.failed": "fetchMigration failed: {reason}",
    "payloadSource.noRemoteHistory": "no remote history",
    "payloadSource.localCovered":
      "local tree covered {count} remote migration(s) (CLI parity, skipped Describe hydrate)",
    "payloadSource.hydrated":
      "hydrated {count} remote migration(s) via Describe (local tree incomplete)",
    "task.pollTimeout":
      "DescribeTaskResult timed out after {seconds}s for TaskId={taskId} (last Status={status}, Phase={phase}).",
    "task.pendingFirst":
      "FIRST: poll DescribeTaskResult for Status/Phase/Reason. listMigrations alone cannot explain a Failed task (see issue #857).",
    "task.checkLanded":
      "Check whether migrationVersion landed in remote history. Do NOT re-push the same version while the task may still be running.",
    "task.inspectDetail":
      "If listMigrations already shows this version, inspect the applied record. If missing after several minutes and the task is Failed/terminal, inspect Conflicts/SQL before considering a NEW migrationVersion.",
    "task.succeedConfirm":
      "Task Succeed — confirm migrationVersion is present in remote history before dependent SQL.",
    "task.inspectApplied": "Inspect the applied migration record.",
    "task.failedFixFirst":
      "Confirm the version is absent from history, then fix Conflicts/SQL and retry with a NEW migrationVersion (do not re-push the failed version blindly).",
    "task.stillRunning":
      "Task still running — poll again shortly. Do NOT re-push the same migrationVersion.",
    "task.optionallyCheck":
      "Optionally check whether the version already landed while Status is still non-terminal.",
    "planMigration.sqlRequired":
      "Provide migration SQL when action=planMigration.",
    "planMigration.nameRequired":
      "Provide migrationName (lowercase letters and underscores, starting with a letter) when action=planMigration.",
    "planMigration.executable":
      "Migration plan generated via PreviewPGUserMigrations ({source}{includeAll}). Reuse migrationVersion={version} on applyMigration. Ensure local file {localFileHint} exists and matches.",
    "planMigration.notExecutable":
      "Migration plan is NOT executable (PreviewPGUserMigrations.Executable=false after {source}{includeAll}). Inspect apiResult.Conflicts before applyMigration. Common causes: version older than latest remote ({latest}) — retry with includeAll=true (CLI --include-all) if intentionally out-of-order, or pick a newer version; checksum mismatch.",
    "planMigration.reviewPlan":
      "Review the plan above. If it looks correct, call applyMigration with the same migrationVersion.",
    "planMigration.resolveConflicts":
      "Resolve Conflicts (often pick a migrationVersion newer than LatestVersion, or set includeAll=true for intentional out-of-order), then retry planMigration/applyMigration.",
    "planMigration.failed": "PreviewPGUserMigrations failed: {reason}",
    "applyMigration.sqlRequired":
      "Provide migration SQL when action=applyMigration.",
    "applyMigration.nameRequired":
      "Provide migrationName (lowercase letters and underscores, starting with a letter) when action=applyMigration.",
    "applyMigration.confirmRequired":
      "PushPGUserMigrations requires confirm=true. Run with confirm=true to proceed.",
    "applyMigration.previewAgain":
      "After aligning the local SQL file with the sql argument (or choosing a new migrationVersion), preview again.",
    "applyMigration.notExecutable":
      "PreviewPGUserMigrations reported Executable=false for migrationVersion={version} (latest remote={latest}, {source}, includeAll={includeAll}). Push was NOT submitted. Inspect previewResult.Conflicts — common reasons: local_migration_before_latest_remote (pick a newer 14-digit version, or set includeAll=true / CLI --include-all for intentional out-of-order) or checksum_mismatch. If the schema change is urgent you may fall back to action=execute with allowDdlViaExecute=true, but that bypasses migration history.",
    "applyMigration.checkLatest":
      "Check LatestVersion and pick a migrationVersion strictly newer than it.",
    "applyMigration.rerunPlan":
      "Re-run planMigration after adjusting migrationVersion/SQL (or includeAll=true for out-of-order).",
    "applyMigration.taskPending":
      "PushPGUserMigrations accepted TaskId={taskId} (waitForTask=false). TaskId means accepted, not applied. Call action=describeMigrationTask FIRST for Status/Phase/Reason, then listMigrations to see whether migrationVersion={version} landed. Do NOT re-push the same version while the task may still be running.",
    "applyMigration.taskTimeout":
      "PushPGUserMigrations returned TaskId={taskId}, but waiting for DescribeTaskResult timed out after {seconds}s: {reason}. The migration may STILL be running in the background (large DDL / lock waits). Call action=describeMigrationTask FIRST (Status/Phase/Reason), then listMigrations. Do NOT re-push the same migrationVersion, and do NOT fall back to execute until the task is terminal and listMigrations confirms the version is missing.",
    "applyMigration.taskFailed":
      "PushPGUserMigrations TaskId={taskId} failed at phase={phase}: {reason}. The migration did NOT take effect. Fix Conflicts/SQL (or use a newer migrationVersion), then retry applyMigration. Urgent bypass: action=execute with allowDdlViaExecute=true (skips migration history).",
    "applyMigration.previewConflicts":
      "Preview again to inspect Conflicts before retrying apply.",
    "applyMigration.confirmAbsent":
      "Confirm the version is still absent from remote history.",
    "applyMigration.notApplied":
      "PushPGUserMigrations completed (TaskId={taskId}), but migrationVersion={version} is not present in the remote migration history, so the migration did NOT take effect. Do not assume the schema change is applied. Re-check the SQL and migrationVersion, inspect the migration with action=migrationDetail, and retry action=applyMigration. If the schema change is urgent you may fall back to action=execute with allowDdlViaExecute=true, but that bypasses migration history.",
    "applyMigration.confirmMissing":
      "Inspect the remote migration history to confirm the migration is missing.",
    "applyMigration.inspectBackend":
      "Inspect the backend record for this migrationVersion to find why it was not applied.",
    "applyMigration.verifyFailed":
      "PushPGUserMigrations was submitted, but verifying migrationVersion={version} against the remote history failed: {reason}. The migration may or may not have been applied — verify with action=listMigrations before running any dependent SQL.",
    "applyMigration.manuallyVerify":
      "Manually verify whether the remote migration history records this migrationVersion.",
    "applyMigration.success":
      "Migrations applied via PushPGUserMigrations ({source}{includeAll}), task {task}verified present in the remote migration history. Local SQL {localAction} at {localPath}.",
    "applyMigration.localWritten": "written",
    "applyMigration.localMatched": "matched",
    "applyMigration.failed": "PushPGUserMigrations failed: {reason}",
    "listMigrations.success":
      "Migration list retrieved via ListPGUserMigrations.",
    "listMigrations.failed": "ListPGUserMigrations failed: {reason}",
    "migrationDetail.versionRequired":
      "Provide migrationVersion (14-digit timestamp YYYYMMDDHHMMSS) when action=migrationDetail.",
    "migrationDetail.success":
      "Migration detail retrieved via DescribePGUserMigration.",
    "migrationDetail.failed": "DescribePGUserMigration failed: {reason}",
    "describeTask.succeed":
      "DescribeTaskResult TaskId={taskId} Status=Succeed (Phase={phase}). Verify with listMigrations before treating schema as applied.",
    "describeTask.failed":
      "DescribeTaskResult TaskId={taskId} Status=Failed at phase={phase}: {reason}. Do NOT re-push the same migrationVersion until Conflicts/SQL are fixed.",
    "describeTask.running":
      "DescribeTaskResult TaskId={taskId} Status={status} Phase={phase}. Task is not terminal yet — poll again; do not re-push.",
    "describeTask.failedApi":
      "DescribeTaskResult failed for TaskId={taskId}: {reason}",
    "repair.versionRequired":
      "Provide migrationVersion (14-digit timestamp YYYYMMDDHHMMSS) when action=repairMigration.",
    "repair.nameRequired": "Provide migrationName when action=repairMigration.",
    "repair.statusRequired":
      "Provide repairStatus (applied or reverted) when action=repairMigration.",
    "repair.reasonRequired":
      "Provide repairReason when action=repairMigration.",
    "repair.sqlRequired":
      "Provide sql (Query) when action=repairMigration with repairStatus=applied.",
    "repair.success":
      "Migration history repaired via RepairPGUserMigrationHistory.",
    "repair.failed": "RepairPGUserMigrationHistory failed: {reason}",
    "unsupportedQueryAction": "Unsupported PostgreSQL query action: {action}",
    "unsupportedManageAction": "Unsupported PostgreSQL manage action: {action}",
    "unsupportedAction": "Unsupported action: {action}",
  },
);
