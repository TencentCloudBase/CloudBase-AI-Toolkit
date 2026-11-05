import { defineModule } from "../types.js";

/**
 * 破坏性操作确认（elicitation 护栏）的文案。
 *
 * 两条硬约束决定了这里的形状：
 *   1. 选项固定为两个受控值（确认 / 取消），**不得出现自由文本字段** —— form 模式禁止收集
 *      密码 / API key / token（MCP 规范的 MUST NOT）；
 *   2. 确认文案必须带**目标**（哪一个资源、哪个环境），不允许只问"确定吗"。
 */
export const confirmation = defineModule(
  {
    // 按钮文案**有意保留全局这一份**（裁定：不改）：本护栏拦下来的动作，无论是删函数、
    // 删集合、销毁实例，还是 PostgreSQL 的 DROP TABLE / TRUNCATE / ALTER…DROP，本质都是
    // "删数据或删对象" —— "确认删除"不误导；改成"确认执行"反而更含糊（执行什么？）。
    "option.confirm": "确认删除",
    // 非删除类动作（如改 Realtime 的 Suspend）用这个标签覆盖，避免在"只是断连"的场景说"删除"
    "option.confirmSetting": "确认修改",
    "option.cancel": "取消",

    // 每个 message 都必须带 {resource}（这次要动什么），环境 ID 只在拿到时拼进去
    "message.deleteFunction": "即将删除云函数 {resource}（环境 {envId}）。删除后无法恢复。",
    "message.deleteCollection": "即将删除集合 {resource}（环境 {envId}）。集合及其中的数据会一并删除，无法恢复。",
    "message.deleteDocumentsOne": "即将删除集合 {resource} 中匹配查询的一条文档（环境 {envId}）。删除后无法恢复。",
    "message.deleteDocumentsQuery": "即将删除集合 {resource} 中所有匹配查询的文档（环境 {envId}）。匹配到多少条就删多少条，删除后无法恢复。",
    "message.deleteStorage": "即将删除云存储文件 {resource}（环境 {envId}）。删除后无法恢复。",
    "message.deleteCloudRun": "即将删除云托管服务 {resource}（环境 {envId}）。服务会下线，需要重新部署才能恢复。",
    "message.destroyMysql": "即将销毁 MySQL 实例 {resource}（环境 {envId}）。实例与数据都会删除，无法恢复。",
    "message.destroyMysqlEnv": "即将销毁当前环境的 MySQL 实例（环境 {envId}）。实例与数据都会删除，无法恢复。",
    "message.destroyEnv": "即将销毁环境 {resource}。环境本身以及其中的云函数、数据库和存储都会删除，无法恢复。",
    "message.isolateCluster": "即将隔离 CynosDB 集群 {resource}（环境 {envId}）。隔离期间实例不可用，隔离期结束后会被销毁，数据拿不回来。",
    "message.destroyCluster": "即将销毁 CynosDB 集群 {resource}（环境 {envId}）。集群与其中的数据都会删除，无法恢复。",
    "message.mysqlThisEnv": "当前环境的 MySQL 实例",
    // PostgreSQL：按**参数里的 SQL** 判定才拦，所以文案要把命中的语句点名出来（{resource}）
    "message.pgExecuteDestructiveSql":
      "即将在环境 {envId} 上执行会改动数据的 SQL：{resource}。这条语句会删数据或删结构，执行后无法恢复，请确认它就是你要跑的那条。",
    "message.pgApplyMigrationDestructive":
      "这条 migration 里有会删结构的语句（环境 {envId}）：{resource}。执行后无法恢复，请确认这次迁移确实要这么做。",
    // 多条时的变体：把**条数**说出来（预览只截首条，所以这个信号必须有）。单条时用上面那条，
    // 不出现"共 1 条"这类噪音。
    "message.pgExecuteDestructiveSqlMany":
      "即将在环境 {envId} 上执行会改动数据的 SQL：{resource}。本次共有 {count} 条破坏性语句（这里只预览第一条），执行后无法恢复，请确认。",
    "message.pgApplyMigrationDestructiveMany":
      "这条 migration 里有会删结构的语句（环境 {envId}）：{resource}。本次共有 {count} 条破坏性语句（这里只预览第一条），执行后无法恢复，请确认这次迁移确实要这么做。",
    // Realtime 的 Suspend：不改数据，但会断开全部在线连接，所以仍要在执行前问一句
    "message.pgRealtimeSuspend":
      "即将修改环境 {envId} 的 Realtime 挂起状态：{resource}。挂起状态每变化一次都会立即断开全部在线连接并拒绝新连接，客户端需要重连，请确认这次变更。",
    "message.realtimeSuspendOn": "挂起服务（Suspend=true）",
    "message.realtimeSuspendOff": "恢复服务（Suspend=false）",
    "message.unknownResource": "（未能从参数中取到资源名）",
    "message.unknownEnv": "未知",

    "blocked.target": "目标：{resource}（环境 {envId}）",
    "blocked.cancelled": "未执行：你在确认框里点了取消（{durationMs}ms）。",
    "blocked.timeout":
      "未执行：{seconds}s 内没有收到确认（超时）。宿主确认框可能未弹出或未转发；请到 CloudBase 控制台完成删除（控制台会二次确认，且有回收站/快照可回退）。",
    "blocked.error": "未执行：确认流程出错（{reason}）。",
    "blocked.autoApprovedBlocked":
      "未执行：Agent 自动审批通过（{durationMs}ms，未询问你），但 CLOUDBASE_MCP_ELICIT_AUTO_APPROVE=block。",
    "blocked.unsupported":
      "未执行：当前客户端不支持执行前确认，这一类操作（删掉一整块数据、且没有回收站）在这里不会被执行。\n请到 CloudBase 控制台操作：控制台的删除会二次确认，并且有回收站/快照可回退。",
    "hint.release":
      "如需放行：把客户端权限改成会询问，或把它加入 CLOUDBASE_MCP_SKIP_ELICITATIONS（本次为 {action}）。",
  },
  {
    "option.confirm": "Delete",
    "option.confirmSetting": "Apply change",
    "option.cancel": "Cancel",

    "message.deleteFunction": "About to delete the cloud function {resource} (env {envId}). This cannot be undone.",
    "message.deleteCollection": "About to delete the collection {resource} (env {envId}). Its documents are deleted with it and cannot be recovered.",
    "message.deleteDocumentsOne": "About to delete the one document in {resource} that matches the query (env {envId}). This cannot be undone.",
    "message.deleteDocumentsQuery": "About to delete every document in {resource} that matches the query (env {envId}). However many match, they are all deleted and cannot be recovered.",
    "message.deleteStorage": "About to delete the cloud storage file {resource} (env {envId}). This cannot be undone.",
    "message.deleteCloudRun": "About to delete the CloudRun service {resource} (env {envId}). The service goes offline and needs a redeploy to come back.",
    "message.destroyMysql": "About to destroy the MySQL instance {resource} (env {envId}). The instance and its data are deleted and cannot be recovered.",
    "message.destroyMysqlEnv": "About to destroy this environment's MySQL instance (env {envId}). The instance and its data are deleted and cannot be recovered.",
    "message.destroyEnv": "About to destroy the environment {resource}. The environment itself, and the functions, databases and storage inside it, are deleted and cannot be recovered.",
    "message.isolateCluster": "About to isolate the CynosDB cluster {resource} (env {envId}). The instance is unavailable while isolated, and it is destroyed when the isolation period ends - the data does not come back.",
    "message.destroyCluster": "About to destroy the CynosDB cluster {resource} (env {envId}). The cluster and its data are deleted and cannot be recovered.",
    "message.mysqlThisEnv": "this environment's MySQL instance",
    "message.pgExecuteDestructiveSql":
      "About to run data-changing SQL in env {envId}: {resource}. This statement drops data or schema and cannot be undone - confirm it is the one you meant to run.",
    "message.pgApplyMigrationDestructive":
      "This migration contains statements that drop schema (env {envId}): {resource}. This cannot be undone - confirm this migration should do that.",
    "message.pgExecuteDestructiveSqlMany":
      "About to run data-changing SQL in env {envId}: {resource}. There are {count} destructive statements in this call (only the first is previewed here) and they cannot be undone - confirm.",
    "message.pgApplyMigrationDestructiveMany":
      "This migration contains statements that drop schema (env {envId}): {resource}. There are {count} destructive statements in this call (only the first is previewed here) and they cannot be undone - confirm this migration should do that.",
    "message.pgRealtimeSuspend":
      "About to change the Realtime suspend state of env {envId}: {resource}. Every change of the suspend state immediately drops all live connections and rejects new ones, so clients must reconnect - confirm this change.",
    "message.realtimeSuspendOn": "suspend the service (Suspend=true)",
    "message.realtimeSuspendOff": "resume the service (Suspend=false)",
    "message.unknownResource": "(could not read the resource name from the arguments)",
    "message.unknownEnv": "unknown",

    "blocked.target": "Target: {resource} (env {envId})",
    "blocked.cancelled": "Not executed: you cancelled in the confirmation dialog ({durationMs}ms).",
    "blocked.timeout":
      "Not executed: no confirmation within {seconds}s (timed out). The host dialog may not have opened or been forwarded. Delete it in the CloudBase console instead (it asks again and keeps a recycle bin / snapshot).",
    "blocked.error": "Not executed: the confirmation flow failed ({reason}).",
    "blocked.autoApprovedBlocked":
      "Not executed: the agent auto-approved it ({durationMs}ms, you were not asked) while CLOUDBASE_MCP_ELICIT_AUTO_APPROVE=block.",
    "blocked.unsupported":
      "Not executed: this client cannot ask you before running a tool, so operations that wipe a whole block of data - with no recycle bin - are not run here.\nUse the CloudBase console instead: its delete flow asks for confirmation and keeps a recycle bin / snapshot you can roll back to.",
    "hint.release":
      "To allow it: switch the client permission to ask, or add it to CLOUDBASE_MCP_SKIP_ELICITATIONS (this call was {action}).",
  },
);
